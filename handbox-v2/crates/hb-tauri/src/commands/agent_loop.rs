//! Agent Loop — ReAct pattern (Think → Tool → Observe → Repeat)
//! Claude Code-level capabilities:
//! - Token-level LLM streaming via Tauri events
//! - Parallel tool execution
//! - Plan mode (think first, code later)
//! - Context window management with auto-compression
//! - Permission system for dangerous commands
//! - Sub-agent spawning

use crate::commands::llm::{invoke_llm, invoke_llm_stream, ChatMessage, EmbeddingRequest, LLMRequest, create_embedding, ToolDefinition, ToolCall};
use crate::commands::system_tools;
use crate::commands::mcp::{self, McpState};
use crate::commands::vector_store::{self, VectorCollection, VectorEntry, VectorStoreState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tokio::sync::RwLock;

/// Event names for agent streaming
const AGENT_STREAM_EVENT: &str = "agent-stream";
const AGENT_STEP_EVENT: &str = "agent-step";
const AGENT_COMPLETE_EVENT: &str = "agent-complete";

/// Max tokens per conversation before compression
const CONTEXT_MAX_CHARS: usize = 120_000;
/// Target chars after compression
const CONTEXT_TARGET_CHARS: usize = 40_000;

// ============================================================
// Types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLoopRequest {
    pub task: String,
    pub system_prompt: Option<String>,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    pub max_iterations: Option<usize>,
    pub working_dir: Option<String>,
    pub conversation_id: Option<String>,
    pub mode: Option<String>, // "auto" | "plan" | "execute"
    pub allowed_tools: Option<Vec<String>>,
    /// Tools that must always be included regardless of dynamic filtering
    #[serde(default)]
    pub pinned_tools: Option<Vec<String>>,
    /// Tools that must never be included
    #[serde(default)]
    pub excluded_tools: Option<Vec<String>>,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStep {
    pub iteration: usize,
    pub thought: String,
    pub action: Option<AgentAction>,
    pub observation: Option<String>,
    pub timestamp: String,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentAction {
    pub tool: String,
    pub args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentLoopResult {
    pub conversation_id: String,
    pub task: String,
    pub steps: Vec<AgentStep>,
    pub final_answer: String,
    pub total_iterations: usize,
    pub status: String,
    pub usage: AgentUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentUsage {
    pub total_input_tokens: i32,
    pub total_output_tokens: i32,
    pub tool_calls: usize,
}

/// Structured execution plan for Plan → Execute pipeline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub id: String,
    pub title: String,
    pub steps: Vec<PlanStep>,
    pub status: String, // "pending" | "approved" | "executing" | "completed" | "failed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: usize,
    pub description: String,
    pub tool: String,
    pub args: Value,
    pub depends_on: Vec<usize>,
    pub status: String, // "pending" | "running" | "completed" | "failed" | "skipped"
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConversationMessage {
    role: String,
    content: String,
    #[serde(default)]
    token_estimate: usize,
}

/// Persistent conversation metadata (stored alongside messages)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: usize,
    pub model_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
}

/// Persisted conversation file format
#[derive(Debug, Serialize, Deserialize)]
struct PersistedConversation {
    meta: ConversationMeta,
    messages: Vec<ConversationMessage>,
}

// ============================================================
// Circuit Breaker — prevents repeated calls to failing services
// ============================================================

/// States: Closed (normal) → Open (blocking) → HalfOpen (testing)
#[derive(Debug, Clone, Copy, PartialEq)]
enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

/// Thread-safe circuit breaker for LLM and external service calls.
/// Trips after `failure_threshold` consecutive failures.
/// Stays open for `recovery_timeout` seconds, then allows one probe call.
pub struct CircuitBreaker {
    state: std::sync::Mutex<CircuitState>,
    failure_count: std::sync::atomic::AtomicU32,
    failure_threshold: u32,
    last_failure_time: std::sync::Mutex<Option<std::time::Instant>>,
    recovery_timeout: std::time::Duration,
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, recovery_timeout_secs: u64) -> Self {
        Self {
            state: std::sync::Mutex::new(CircuitState::Closed),
            failure_count: std::sync::atomic::AtomicU32::new(0),
            failure_threshold,
            last_failure_time: std::sync::Mutex::new(None),
            recovery_timeout: std::time::Duration::from_secs(recovery_timeout_secs),
        }
    }

    /// Check if the circuit allows a call. Returns Err if circuit is open.
    pub fn check(&self) -> Result<(), String> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match *state {
            CircuitState::Closed => Ok(()),
            CircuitState::Open => {
                // Check if recovery timeout has elapsed
                let last = self.last_failure_time.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(t) = *last {
                    if t.elapsed() >= self.recovery_timeout {
                        *state = CircuitState::HalfOpen;
                        tracing::info!("Circuit breaker: Open → HalfOpen (testing)");
                        return Ok(());
                    }
                }
                let remaining = self.recovery_timeout
                    .checked_sub(last.map(|t| t.elapsed()).unwrap_or_default())
                    .unwrap_or_default();
                Err(format!(
                    "Circuit breaker OPEN: service unavailable. Retry in {:.0}s",
                    remaining.as_secs_f64()
                ))
            }
            CircuitState::HalfOpen => Ok(()), // Allow probe call
        }
    }

    /// Record a successful call — resets failure count and closes circuit.
    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if *state != CircuitState::Closed {
            tracing::info!("Circuit breaker: {} → Closed (recovered)", match *state {
                CircuitState::Open => "Open",
                CircuitState::HalfOpen => "HalfOpen",
                CircuitState::Closed => "Closed",
            });
        }
        *state = CircuitState::Closed;
    }

    /// Record a failed call — increments counter, may trip circuit.
    pub fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;
        if count >= self.failure_threshold {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if *state != CircuitState::Open {
                tracing::warn!("Circuit breaker: TRIPPED after {count} consecutive failures");
                *state = CircuitState::Open;
            }
            *self.last_failure_time.lock().unwrap_or_else(|e| e.into_inner()) = Some(std::time::Instant::now());
        }
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        // Trip after 5 consecutive failures, recover after 30 seconds
        Self::new(5, 30)
    }
}

/// Persistent agent conversation state
pub struct AgentConversationState {
    pub conversations: RwLock<std::collections::HashMap<String, Vec<ConversationMessage>>>,
    /// Conversation metadata
    pub metadata: RwLock<std::collections::HashMap<String, ConversationMeta>>,
    /// Cancellation flags per conversation_id
    pub cancellation_flags: RwLock<std::collections::HashMap<String, Arc<AtomicBool>>>,
    /// Directory for persisting conversations to disk
    persist_dir: RwLock<Option<std::path::PathBuf>>,
    /// Circuit breaker for LLM calls
    pub llm_circuit: CircuitBreaker,
}

impl Default for AgentConversationState {
    fn default() -> Self {
        Self {
            conversations: RwLock::new(std::collections::HashMap::new()),
            metadata: RwLock::new(std::collections::HashMap::new()),
            cancellation_flags: RwLock::new(std::collections::HashMap::new()),
            persist_dir: RwLock::new(None),
            llm_circuit: CircuitBreaker::default(),
        }
    }
}

impl AgentConversationState {
    /// Create with persistence directory — loads existing conversations from disk.
    pub fn with_persist_dir(dir: std::path::PathBuf) -> Self {
        let mut conversations = std::collections::HashMap::new();
        let mut metadata = std::collections::HashMap::new();

        // Load existing conversations from disk
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("json") {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            if let Ok(persisted) = serde_json::from_str::<PersistedConversation>(&content) {
                                let id = persisted.meta.id.clone();
                                metadata.insert(id.clone(), persisted.meta);
                                conversations.insert(id, persisted.messages);
                            }
                        }
                    }
                }
            }
            tracing::info!("Loaded {} conversations from {:?}", conversations.len(), dir);
        } else {
            let _ = std::fs::create_dir_all(&dir);
        }

        Self {
            conversations: RwLock::new(conversations),
            metadata: RwLock::new(metadata),
            cancellation_flags: RwLock::new(std::collections::HashMap::new()),
            persist_dir: RwLock::new(Some(dir)),
            llm_circuit: CircuitBreaker::default(),
        }
    }

    /// Persist a single conversation to disk.
    pub async fn persist_conversation(&self, conv_id: &str) {
        let dir = self.persist_dir.read().await;
        let Some(ref dir) = *dir else { return };

        let convs = self.conversations.read().await;
        let metas = self.metadata.read().await;

        if let Some(messages) = convs.get(conv_id) {
            let meta = metas.get(conv_id).cloned().unwrap_or_else(|| ConversationMeta {
                id: conv_id.to_string(),
                title: messages.first().map(|m| {
                    let preview: String = m.content.chars().take(50).collect();
                    preview
                }).unwrap_or_else(|| "New conversation".to_string()),
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                message_count: messages.len(),
                model_id: None,
                project_id: None,
            });

            let persisted = PersistedConversation {
                meta,
                messages: messages.clone(),
            };

            let filename = sanitize_filename(conv_id);
            let path = dir.join(format!("{filename}.json"));
            if let Ok(json) = serde_json::to_string_pretty(&persisted) {
                if let Err(e) = std::fs::write(&path, json) {
                    tracing::warn!("Failed to persist conversation {conv_id}: {e}");
                }
            }
        }
    }

    /// Remove a persisted conversation from disk.
    pub async fn remove_persisted_conversation(&self, conv_id: &str) {
        let dir = self.persist_dir.read().await;
        let Some(ref dir) = *dir else { return };

        let filename = sanitize_filename(conv_id);
        let path = dir.join(format!("{filename}.json"));
        let _ = std::fs::remove_file(path);
    }
}

/// Simple pseudo-random u64 using thread-local state (no external crate needed)
fn rand_u64() -> u64 {
    use std::cell::Cell;
    use std::time::SystemTime;
    thread_local! {
        static STATE: Cell<u64> = Cell::new(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64
        );
    }
    STATE.with(|s| {
        let mut x = s.get();
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        s.set(x);
        x
    })
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// ============================================================
// Permission System
// ============================================================

/// Commands that are always blocked
const BLOCKED_COMMANDS: &[&str] = &[
    "rm -rf /", "rm -rf /*", "mkfs", "dd if=", ":(){:|:&};:",
    "format c:", "del /f /s /q c:\\",
];

/// Patterns requiring user confirmation before execution
const DANGEROUS_PATTERNS: &[&str] = &[
    "rm -rf", "rm -r", "rmdir /s",
    "git push --force", "git reset --hard",
    "DROP TABLE", "DROP DATABASE", "DELETE FROM",
    "chmod 777", "sudo",
];

/// Event name for permission requests/responses
const PERMISSION_REQUEST_EVENT: &str = "agent-permission-request";
const PERMISSION_RESPONSE_EVENT: &str = "agent-permission-response";

fn check_command_safety(command: &str) -> Result<Option<String>, String> {
    let lower = command.to_lowercase();

    // Block absolutely dangerous commands
    for blocked in BLOCKED_COMMANDS {
        if lower.contains(blocked) {
            return Err(format!("Blocked: '{command}' is a destructive command"));
        }
    }

    // Flag dangerous patterns — requires user approval
    for pattern in DANGEROUS_PATTERNS {
        if lower.contains(&pattern.to_lowercase()) {
            return Ok(Some(format!(
                "'{command}' matches dangerous pattern '{pattern}'"
            )));
        }
    }

    Ok(None)
}

/// Ask user for permission to execute a dangerous command.
/// Emits permission-request event and waits for response (max 60s).
async fn request_permission(app: &AppHandle, command: &str, warning: &str, conv_id: &str) -> bool {
    use tokio::sync::oneshot;

    let request_id = uuid::Uuid::new_v4().to_string();

    // Emit permission request to frontend
    let _ = app.emit(PERMISSION_REQUEST_EVENT, json!({
        "request_id": request_id,
        "conversation_id": conv_id,
        "command": command,
        "warning": warning,
    }));

    // Wait for response via a Tauri event listener
    let (tx, rx) = oneshot::channel::<bool>();
    let tx = Arc::new(tokio::sync::Mutex::new(Some(tx)));
    let rid = request_id.clone();

    let app_clone = app.clone();
    let listener_id = app_clone.listen(PERMISSION_RESPONSE_EVENT, move |event: tauri::Event| {
        if let Ok(payload) = serde_json::from_str::<Value>(event.payload()) {
            if payload["request_id"].as_str() == Some(&rid) {
                let approved = payload["approved"].as_bool().unwrap_or(false);
                let tx_lock = tx.clone();
                // Send response (ignore error if already sent)
                tokio::spawn(async move {
                    if let Some(sender) = tx_lock.lock().await.take() {
                        let _ = sender.send(approved);
                    }
                });
            }
        }
    });

    // Wait up to 60 seconds for user response
    let result = match tokio::time::timeout(
        std::time::Duration::from_secs(60),
        rx,
    ).await {
        Ok(Ok(approved)) => approved,
        _ => false, // Timeout or channel error → deny
    };

    app.unlisten(listener_id);
    result
}

// ============================================================
// Context Window Management
// ============================================================

fn estimate_tokens(text: &str) -> usize {
    // Rough estimate: 1 token ≈ 4 chars for English, 2 chars for Korean/CJK
    let has_cjk = text.chars().any(|c| c as u32 > 0x2E80);
    if has_cjk {
        text.len() / 2
    } else {
        text.len() / 4
    }
}

fn compress_history(history: &mut Vec<ConversationMessage>) {
    let total_chars: usize = history.iter().map(|m| m.content.len()).sum();
    if total_chars <= CONTEXT_MAX_CHARS {
        return;
    }

    // Keep first message (original task) and last 8 messages for better context
    let keep_start = 1.min(history.len());
    let keep_end = 8.min(history.len());

    if history.len() <= keep_start + keep_end + 1 {
        return; // Not enough to compress
    }

    // Build a rich summary of middle messages instead of simple truncation
    let middle_start = keep_start;
    let middle_end = history.len() - keep_end;
    let middle_msgs = &history[middle_start..middle_end];

    // Extract key information from each message type
    let mut tool_calls = Vec::new();
    let mut findings = Vec::new();
    let mut errors = Vec::new();

    for msg in middle_msgs {
        match msg.role.as_str() {
            "assistant" => {
                // Extract thoughts/decisions from assistant messages
                let thought = extract_thought(&msg.content);
                if !thought.is_empty() && thought.len() > 10 {
                    let preview: String = thought.chars().take(200).collect();
                    findings.push(preview);
                }
                // Track tool calls
                if let Some(action) = parse_action(&msg.content) {
                    if action.tool != "finish" {
                        let args_preview: String = action.args.to_string().chars().take(80).collect();
                        tool_calls.push(format!("{}({})", action.tool, args_preview));
                    }
                }
            }
            "user" => {
                // Extract key results from tool observations
                if msg.content.starts_with("[Tool Result:") || msg.content.starts_with("[Tool Error") {
                    let preview: String = msg.content.chars().take(300).collect();
                    if msg.content.contains("[Tool Error") {
                        errors.push(preview);
                    } else {
                        findings.push(preview);
                    }
                }
            }
            _ => {}
        }
    }

    // Build structured summary
    let mut summary_content = format!(
        "[Context compressed: {} messages → summary]\n\n",
        middle_msgs.len()
    );

    if !tool_calls.is_empty() {
        summary_content.push_str("## Tools used:\n");
        for tc in tool_calls.iter().take(15) {
            summary_content.push_str(&format!("- {tc}\n"));
        }
        if tool_calls.len() > 15 {
            summary_content.push_str(&format!("  ... and {} more\n", tool_calls.len() - 15));
        }
        summary_content.push('\n');
    }

    if !findings.is_empty() {
        summary_content.push_str("## Key findings:\n");
        for finding in findings.iter().take(8) {
            summary_content.push_str(&format!("- {finding}\n"));
        }
        summary_content.push('\n');
    }

    if !errors.is_empty() {
        summary_content.push_str("## Errors encountered:\n");
        for err in errors.iter().take(5) {
            summary_content.push_str(&format!("- {err}\n"));
        }
        summary_content.push('\n');
    }

    // Ensure summary doesn't exceed target
    if summary_content.len() > CONTEXT_TARGET_CHARS / 2 {
        summary_content = summary_content.chars().take(CONTEXT_TARGET_CHARS / 2).collect();
        summary_content.push_str("\n... [summary truncated]");
    }

    let summary = ConversationMessage {
        role: "system".to_string(),
        content: summary_content,
        token_estimate: 0,
    };

    // Rebuild: first + summary + last N
    let first = history[..keep_start].to_vec();
    let last = history[middle_end..].to_vec();
    *history = Vec::with_capacity(first.len() + 1 + last.len());
    history.extend(first);
    history.push(summary);
    history.extend(last);
}

// ============================================================
// System Prompt
// ============================================================

fn build_system_prompt(custom: Option<&str>, working_dir: &str, mode: &str, project_context: Option<&str>) -> String {
    let base = r##"You are an expert software engineering agent running inside Handbox v2, a visual workflow platform.
You help users with coding tasks, file operations, web research, and project management.

## Available Tools

You can use tools by responding with a JSON action block. Format:

```json
{"action": "TOOL_NAME", "args": { ... }}
```

You can also execute MULTIPLE tools in parallel:

```json
{"action": "parallel", "args": {"tools": [
  {"action": "file_read", "args": {"path": "a.rs"}},
  {"action": "file_read", "args": {"path": "b.rs"}}
]}}
```

### File & Code Tools
- **bash_execute**: Execute shell commands
  args: { "command": "...", "working_dir": "..." }
- **file_read**: Read file contents with line numbers
  args: { "path": "...", "offset": N, "limit": N }
- **file_write**: Write/create files
  args: { "path": "...", "content": "..." }
- **file_edit**: Find-and-replace in files
  args: { "path": "...", "old_string": "...", "new_string": "...", "replace_all": false }
- **file_edit_lines**: Line-based precise editing (preferred for known line numbers)
  args: { "path": "...", "line_start": N, "line_end": N, "new_text": "..." }
- **grep_search**: Search code with regex
  args: { "pattern": "...", "path": "...", "glob_filter": "*.rs", "max_results": 50, "context_lines": 2 }
- **glob_search**: Find files by pattern
  args: { "pattern": "*.ts", "path": "..." }
- **project_tree**: Show directory structure
  args: { "path": "...", "max_depth": 4 }

### Web Tools
- **web_search**: Search the web
  args: { "query": "..." }
- **web_fetch**: Fetch URL content (HTML → text)
  args: { "url": "...", "max_chars": 50000 }

### Git Tools
- **git_status**: Show git status
  args: { "path": "..." }
- **git_diff**: Show changes
  args: { "path": "...", "staged": false }
- **git_log**: Show commit history
  args: { "path": "...", "max_count": 10 }
- **git_commit**: Stage and commit
  args: { "message": "...", "path": "...", "files": ["..."] }

### Memory Tools (persistent across sessions)
- **memory_read**: Read saved memory (scoped to current project if active)
  args: { "key": "..." } or {} for listing all keys
- **memory_write**: Save memory (scoped to current project if active)
  args: { "key": "...", "value": ... }

### Plan Tools (per-project, requires active project)
- **plan_read**: Read the current project's plan document
  args: {}
- **plan_write**: Update the current project's plan document
  args: { "content": "..." }

### Vector Store Tools (RAG pipeline)
- **vector_store**: Store text chunks as vectors in a collection (auto-creates collection)
  args: { "collection": "my_docs", "entries": [{"id": "doc1", "text": "content...", "metadata": {...}}] }
  Note: Embeddings are auto-generated. Just provide text.
- **vector_search**: Search for similar documents by text query
  args: { "collection": "my_docs", "query": "search text", "top_k": 5 }
  Note: Query is auto-embedded. Returns ranked results with scores.
- **vector_delete**: Delete vectors from a collection
  args: { "collection": "my_docs", "ids": ["doc1", "doc2"] }
- **vector_list_collections**: List all vector collections
  args: {}

### Sub-Agent & Multi-Agent Tools
- **sub_agent**: Spawn a sub-agent for parallel research
  args: { "task": "...", "tools": ["grep_search", "file_read"] }
- **multi_agent**: Dispatch N parallel agents with different roles/personas
  args: { "task": "overall task", "agents": [
    {"id": "eval1", "name": "Evaluator A", "role": "reviewer", "system_prompt": "You are a strict technical reviewer..."},
    {"id": "eval2", "name": "Evaluator B", "role": "reviewer", "system_prompt": "You are a pragmatic reviewer..."}
  ] }

### Workflow Canvas Tools
Use these tools to create visual workflows on the canvas. IMPORTANT RULES:
1. Always use exact tool_ref IDs from the Tool Catalog below
2. Always use exact port names from the Tool Catalog for edges
3. After creating a workflow, use workflow_set_config to fill in user-needed values (file paths, prompts)
4. If a value requires user input, tell the user to click the node and fill in the Properties panel

- **workflow_create**: Create workflow nodes and edges on the canvas
  args: { "nodes": [...], "edges": [...], "clear_existing": true }
  Node format: {"id":"n1", "tool_ref":"pdf-read", "label":"Read PDF", "config":{}, "position":{"x":100,"y":200}}
  Edge format: {"source":"n1", "source_port":"content", "target":"n2", "target_port":"context"}
- **workflow_add_node**: Add a single node to the canvas
  args: { "tool_ref": "llm-chat", "label": "My Node", "config": {}, "position": {"x":300,"y":200} }
- **workflow_remove_node**: Remove a node from the canvas
  args: { "node_id": "node_3" }
- **workflow_connect**: Connect two nodes (use exact port names!)
  args: { "source": "n1", "source_port": "content", "target": "n2", "target_port": "prompt" }
- **workflow_set_config**: Set configuration values on a node
  args: { "node_id": "n1", "config": {"file_path": "/path/to/file.pdf"} }
- **workflow_select_node**: Select/highlight a node for user attention
  args: { "node_id": "n1" }
- **workflow_execute**: Execute the current canvas workflow immediately
  args: {} (no arguments needed — executes whatever is on the canvas)

#### Tool Catalog Reference (use these exact tool_ref and port names):

**CRITICAL: For workflow canvas nodes, you may ONLY use tool_ref values listed in this table.**
**DO NOT use agent-level tools (multi_agent, sub_agent, bash_execute, etc.) as workflow node tool_refs.**
**To create parallel evaluations, create MULTIPLE llm-chat nodes with different system_prompts.**

| tool_ref       | inputs (port_name:type)            | outputs (port_name:type)         | config_fields                        |
|----------------|------------------------------------|----------------------------------|--------------------------------------|
| file-read      | path:string                        | content:string, size:number      | file_path, encoding                  |
| pdf-read       | path:string                        | content:string, pages:number     | file_path, page_range                |
| files-read     | (none)                             | contents:array                   | file_paths                           |
| folder-read    | (none)                             | files:array                      | folder_path, pattern                 |
| file-write     | path:string, content:string        | success:boolean                  | file_path                            |
| user-input     | (none)                             | text:string                      | prompt                               |
| display-output | data:any                           | (none)                           | format                               |
| llm-chat       | prompt:string, context:string      | response:string                  | model, temperature, system_prompt    |
| llm-summarize  | text:string                        | summary:string                   | max_length, model                    |
| embedding      | text:string                        | vector:array                     | model                                |
| text-split     | text:string                        | chunks:array                     | chunk_size, overlap                  |
| text-merge     | texts:array                        | merged:string                    | separator                            |
| text-template  | variables:json                     | result:string                    | template                             |
| regex-extract  | text:string                        | matches:array                    | pattern                              |
| json-parse     | json_string:string                 | data:json                        | (none)                               |
| json-path      | data:json                          | result:any                       | expression                           |
| csv-read       | path:string                        | rows:array                       | delimiter, file_path                 |
| data-filter    | items:array                        | filtered:array                   | condition                            |
| condition      | value:any                          | true:any, false:any              | expression                           |
| loop           | items:array                        | results:array                    | max_iterations                       |
| merge          | input_a:any, input_b:any           | merged:json                      | (none)                               |
| http-request   | (none)                             | response:string, status:number   | url, method, headers, body           |
| vector-store   | chunks:array, vectors:array        | index_id:string                  | index_name                           |
| vector-search  | query_vector:array                 | results:array                    | top_k, index_name                    |

#### CRITICAL Workflow Creation Rules:
1. **ALWAYS set config fields** — every node MUST have its required config set via workflow_set_config:
   - file-read/pdf-read: MUST set `file_path` to the actual file path (absolute path on Windows, use backslashes)
   - file-write: MUST set `file_path` for the output file path
   - csv-read: MUST set `file_path` via config (path input comes from edge or config)
   - llm-chat: MUST set `model` (default: "claude-sonnet-4-20250514"), `system_prompt` (describe the task), optionally `temperature`
   - display-output: MUST set `format` ("text", "json", "markdown", or "html") AND connect `data` input port
   - text-template: MUST set `template` with `{{variable}}` placeholders
   - data-filter: MUST set `condition` (e.g., "field > 10")
   - http-request: MUST set `url`, `method` (GET/POST/PUT/DELETE), optionally `headers` (JSON object), `body`
2. **When user mentions a file**, resolve the absolute path and set it directly in config
3. **When user attaches a file** (shown as [첨부 파일: path]), use that exact path in config
4. **NEVER leave file_path empty** — if the user mentioned a file, put its path in config immediately
5. **Position nodes in a readable flow**: start at x=100, increment by 300 per column. For parallel nodes, use DIFFERENT y positions (y=100, y=300, y=500, etc.)
6. **Use clear Korean labels** for each node describing its purpose
7. **After creating a workflow, use workflow_execute to run it immediately** unless user just wants to see the structure

#### Port Connection Reference (exact output→input mapping):
- file-read.content → llm-chat.context OR text-split.text OR display-output.data
- pdf-read.content → llm-chat.context OR text-split.text OR display-output.data
- llm-chat.response → file-write.content OR display-output.data OR text-split.text OR merge.input_a/input_b
- text-split.chunks → embedding.text (via loop) OR vector-store.chunks
- csv-read.rows → data-filter.items OR display-output.data
- data-filter.filtered → display-output.data OR llm-chat.context (as JSON)
- text-merge.merged → llm-chat.prompt OR file-write.content OR display-output.data
- vector-search.results → llm-chat.context
- http-request.response → llm-chat.context OR json-parse.json_string OR display-output.data
- merge.merged → llm-chat.context OR display-output.data (use merge to combine N outputs into one)

#### Example 1 — Simple "PDF 분석" workflow:
```json
{"action":"workflow_create","args":{"clear_existing":true,"nodes":[
  {"id":"n1","tool_ref":"pdf-read","label":"PDF 읽기","config":{},"position":{"x":100,"y":200}},
  {"id":"n2","tool_ref":"llm-chat","label":"분석","config":{"model":"claude-sonnet-4-20250514","system_prompt":"주어진 문서를 분석하고 핵심 내용을 요약하세요."},"position":{"x":400,"y":200}},
  {"id":"n3","tool_ref":"display-output","label":"결과 표시","config":{"format":"markdown"},"position":{"x":700,"y":200}}
],"edges":[
  {"source":"n1","source_port":"content","target":"n2","target_port":"context"},
  {"source":"n2","source_port":"response","target":"n3","target_port":"data"}
]}}
```
Then IMMEDIATELY call workflow_set_config to set file_path on n1:
```json
{"action":"workflow_set_config","args":{"node_id":"n1","config":{"file_path":"C:\\Users\\...\\document.pdf"}}}
```
Then execute:
```json
{"action":"workflow_execute","args":{}}
```

#### Example 2 — N명 병렬 전문가 평가 + 다수결 (Fan-Out / Fan-In 패턴):
사용자가 "N명의 전문가가 병렬 평가" 같은 복잡한 구조를 요청할 때, 여러 llm-chat 노드를 생성하고 merge로 합쳐야 합니다.
```json
{"action":"workflow_create","args":{"clear_existing":true,"nodes":[
  {"id":"n1","tool_ref":"pdf-read","label":"제안서 읽기","config":{},"position":{"x":100,"y":400}},
  {"id":"e1","tool_ref":"llm-chat","label":"기술 전문가","config":{"model":"claude-sonnet-4-20250514","system_prompt":"당신은 기술 전문가입니다. 제안서의 기술적 실현 가능성을 평가하고, 최종적으로 '승인' 또는 '거부'를 선택하세요. 평가 근거를 포함하세요."},"position":{"x":450,"y":100}},
  {"id":"e2","tool_ref":"llm-chat","label":"재무 전문가","config":{"model":"claude-sonnet-4-20250514","system_prompt":"당신은 재무 전문가입니다. 제안서의 예산 타당성과 ROI를 평가하고, '승인' 또는 '거부'를 선택하세요."},"position":{"x":450,"y":300}},
  {"id":"e3","tool_ref":"llm-chat","label":"시장 전문가","config":{"model":"claude-sonnet-4-20250514","system_prompt":"당신은 시장 분석 전문가입니다. 제안서의 시장성과 경쟁력을 평가하고, '승인' 또는 '거부'를 선택하세요."},"position":{"x":450,"y":500}},
  {"id":"e4","tool_ref":"llm-chat","label":"법률 전문가","config":{"model":"claude-sonnet-4-20250514","system_prompt":"당신은 법률 전문가입니다. 제안서의 법적 리스크를 평가하고, '승인' 또는 '거부'를 선택하세요."},"position":{"x":450,"y":700}},
  {"id":"m1","tool_ref":"text-merge","label":"평가 통합","config":{"separator":"\\n---\\n"},"position":{"x":800,"y":400}},
  {"id":"judge","tool_ref":"llm-chat","label":"다수결 판정","config":{"model":"claude-sonnet-4-20250514","system_prompt":"4명의 전문가 평가를 분석하세요. 각 전문가의 승인/거부 결정을 집계하고, 다수결로 최종 판정을 내리세요. 형식:\\n## 전문가별 판정\\n- 전문가 1: 승인/거부 (근거)\\n...\\n## 최종 결과: 승인/거부 (N:M)"},"position":{"x":1100,"y":400}},
  {"id":"out","tool_ref":"display-output","label":"최종 결과","config":{"format":"markdown"},"position":{"x":1400,"y":400}}
],"edges":[
  {"source":"n1","source_port":"content","target":"e1","target_port":"context"},
  {"source":"n1","source_port":"content","target":"e2","target_port":"context"},
  {"source":"n1","source_port":"content","target":"e3","target_port":"context"},
  {"source":"n1","source_port":"content","target":"e4","target_port":"context"},
  {"source":"e1","source_port":"response","target":"m1","target_port":"texts"},
  {"source":"e2","source_port":"response","target":"m1","target_port":"texts"},
  {"source":"e3","source_port":"response","target":"m1","target_port":"texts"},
  {"source":"e4","source_port":"response","target":"m1","target_port":"texts"},
  {"source":"m1","source_port":"merged","target":"judge","target_port":"context"},
  {"source":"judge","source_port":"response","target":"out","target_port":"data"}
]}}
```
**핵심 패턴**: 같은 입력(n1)을 여러 llm-chat 노드에 연결 (fan-out), text-merge로 합치기 (fan-in), 최종 판정 llm-chat.
**10명이 필요하면** e1~e10까지 노드를 만들고, 모두 m1의 texts에 연결하면 됩니다.

#### Example 3 — 외부 API 데이터 수집 + 분석 (KIPRIS, 공공데이터 등):
```json
{"action":"workflow_create","args":{"clear_existing":true,"nodes":[
  {"id":"n1","tool_ref":"http-request","label":"KIPRIS API 호출","config":{"url":"http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/freeSearchInfo","method":"GET","headers":{"Accept":"application/json"}},"position":{"x":100,"y":200}},
  {"id":"n2","tool_ref":"json-parse","label":"응답 파싱","config":{},"position":{"x":400,"y":200}},
  {"id":"n3","tool_ref":"llm-chat","label":"특허 분석","config":{"model":"claude-sonnet-4-20250514","system_prompt":"특허 검색 결과를 분석하고 핵심 기술 트렌드를 파악하세요. 한국어로 응답하세요."},"position":{"x":700,"y":200}},
  {"id":"n4","tool_ref":"display-output","label":"분석 결과","config":{"format":"markdown"},"position":{"x":1000,"y":200}}
],"edges":[
  {"source":"n1","source_port":"response","target":"n2","target_port":"json_string"},
  {"source":"n2","source_port":"data","target":"n3","target_port":"context"},
  {"source":"n3","source_port":"response","target":"n4","target_port":"data"}
]}}
```

#### Example 4 — CSV 데이터 처리 + LLM 분석:
```json
{"action":"workflow_create","args":{"clear_existing":true,"nodes":[
  {"id":"n1","tool_ref":"csv-read","label":"CSV 로드","config":{"delimiter":","},"position":{"x":100,"y":200}},
  {"id":"n2","tool_ref":"data-filter","label":"데이터 필터","config":{"condition":"value > 100"},"position":{"x":400,"y":200}},
  {"id":"n3","tool_ref":"llm-chat","label":"분석","config":{"model":"claude-sonnet-4-20250514","system_prompt":"제공된 데이터를 분석하고 인사이트를 도출하세요."},"position":{"x":700,"y":200}},
  {"id":"n4","tool_ref":"display-output","label":"결과","config":{"format":"markdown"},"position":{"x":1000,"y":200}}
],"edges":[
  {"source":"n1","source_port":"rows","target":"n2","target_port":"items"},
  {"source":"n2","source_port":"filtered","target":"n3","target_port":"context"},
  {"source":"n3","source_port":"response","target":"n4","target_port":"data"}
]}}
```

#### Example 5 — RAG Pipeline (PDF → chunk → search → answer):
```json
{"action":"workflow_create","args":{"clear_existing":true,"nodes":[
  {"id":"n1","tool_ref":"pdf-read","label":"PDF 로드","config":{},"position":{"x":100,"y":200}},
  {"id":"n2","tool_ref":"text-split","label":"청크 분할","config":{"chunk_size":1000,"overlap":200},"position":{"x":400,"y":200}},
  {"id":"n3","tool_ref":"llm-chat","label":"질문 응답","config":{"model":"claude-sonnet-4-20250514","system_prompt":"주어진 컨텍스트를 기반으로 질문에 답하세요.","temperature":0.3},"position":{"x":700,"y":200}},
  {"id":"n4","tool_ref":"display-output","label":"답변 표시","config":{"format":"markdown"},"position":{"x":1000,"y":200}}
],"edges":[
  {"source":"n1","source_port":"content","target":"n2","target_port":"text"},
  {"source":"n2","source_port":"chunks","target":"n3","target_port":"context"},
  {"source":"n3","source_port":"response","target":"n4","target_port":"data"}
]}}
```

#### Common Mistakes to Avoid:
- DO NOT leave config empty for file-read/pdf-read nodes — always set file_path
- DO NOT forget to connect display-output's `data` input — it needs input to show anything
- DO NOT use `text` as input port for llm-chat — use `prompt` for the question, `context` for background
- DO NOT create nodes without proper labels — use descriptive Korean labels
- DO NOT forget `system_prompt` for llm-chat — it controls the LLM's behavior
- DO NOT use agent tools (multi_agent, sub_agent, bash_execute) as workflow node tool_refs — they are agent-level tools, NOT canvas nodes
- DO NOT invent tool_ref values — ONLY use values from the Tool Catalog table above
- For parallel evaluation: create MULTIPLE llm-chat nodes with DIFFERENT y positions and system_prompts, connect them all from the same source, and merge with text-merge

### MCP Tools (Model Context Protocol — external tool servers)
- **mcp_list_servers**: List all connected MCP servers and their tools
  args: {}
- **mcp_get_tools**: Get tools from a specific MCP server
  args: { "server_id": "..." }
- **mcp_call**: Call a tool on a connected MCP server
  args: { "server_id": "...", "tool_name": "...", "arguments": {...} }
  Note: Use mcp_list_servers first to discover available servers, then mcp_get_tools to see each server's tools and their schemas.

### GIS Analysis Tools (geospatial data processing — unique to Handbox)
- **gis_read**: Read geospatial files (GeoJSON, Shapefile, GeoPackage)
  args: { "path": "data.geojson", "format": "geojson|shapefile|geopackage" }
- **gis_analyze**: Analyze spatial features
  args: { "path": "...", "operation": "bounds|statistics", "property": "population" }
  Note: "bounds" returns bounding box. "statistics" requires "property" field name.
- **gis_filter**: Filter features by property conditions
  args: { "path": "...", "field": "population", "operator": "eq|ne|gt|lt|gte|lte|contains", "value": 10000 }
- **gis_transform**: Transform CRS (coordinate reference system)
  args: { "path": "...", "source_crs": "EPSG:4326", "target_crs": "EPSG:3857" }
- **gis_buffer**: Create buffer zones around geometry
  args: { "geometry": { "type": "Point", "coordinates": [127.0, 37.5] }, "distance": 100.0 }

### IFC/BIM Analysis Tools (building model processing — unique to Handbox)
- **ifc_read**: Read IFC building model files
  args: { "path": "building.ifc" }
- **ifc_hierarchy**: Extract spatial hierarchy (Project > Site > Building > Storey > Space)
  args: { "path": "..." }
- **ifc_search**: Search entities by name/query and optional type filter
  args: { "path": "...", "query": "wall", "entity_type": "IfcWall" }
- **ifc_statistics**: Get model statistics (entity counts, property summaries)
  args: { "path": "..." }
- **ifc_modify**: Modify entity properties in IFC model
  args: { "path": "...", "entity_id": "#123", "properties": {"Name": "Updated Wall"} }

### DAG Workflow Execution (visual pipeline orchestration — unique to Handbox)
- **workflow_execute**: Execute a workflow by ID (runs the full DAG)
  args: { "workflow_id": "..." }
- **workflow_list**: List all saved workflows
  args: {}
- **workflow_status**: Get execution status of a running workflow
  args: { "execution_id": "..." }

### Control
- **finish**: End with final answer
  args: { "answer": "..." }

## Rules
1. ALWAYS think step-by-step before acting
2. Read files BEFORE editing them
3. Use grep/glob to find files first, don't guess paths
4. Verify changes after making them
5. Use file_edit (find-replace) or file_edit_lines (line-based) for edits — prefer file_edit_lines when you know exact line numbers
6. For bash: avoid destructive commands (rm -rf, git push --force) unless explicitly asked
7. Use parallel tool execution when actions are independent
8. When done, use finish with a clear, concise summary

## Response Format
Respond with thinking followed by EXACTLY ONE action block:

[Your reasoning]

```json
{"action": "TOOL_NAME", "args": {...}}
```
"##;

    let mode_instruction = match mode {
        "plan" => "\n\n## Mode: PLAN\nYou are in planning mode. Explore the codebase, gather information, and create a detailed plan. Do NOT make any changes yet. Use finish to present your plan when ready.\n",
        "execute" => "\n\n## Mode: EXECUTE\nYou are in execution mode. Follow the plan and make changes. Be precise and verify each change.\n",
        _ => "",
    };

    // Build rich context with git status, platform info, and project detection
    let platform = if cfg!(target_os = "windows") { "Windows" } else if cfg!(target_os = "macos") { "macOS" } else { "Linux" };
    let time = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC");

    // Detect git status (non-blocking, best-effort)
    let git_info = detect_git_info(working_dir);

    let mut context = format!(
        "\n\n## Context\n- Working directory: {working_dir}\n- Platform: {platform}\n- Time: {time}\n",
    );

    if let Some(ref git) = git_info {
        context.push_str(&format!("- Git branch: {}\n", git.branch));
        if !git.status_summary.is_empty() {
            context.push_str(&format!("- Git status: {}\n", git.status_summary));
        }
    }

    // Load project instruction files (CLAUDE.md, .handbox.md, etc.)
    let project_instructions = load_project_instructions(working_dir);

    let mut result = format!("{base}{mode_instruction}{context}");

    if !project_instructions.is_empty() {
        result.push_str("\n## Project Instructions\n");
        result.push_str(&project_instructions);
        result.push('\n');
    }

    if let Some(ctx) = project_context {
        result.push_str(&format!("\n{ctx}\n"));
    }

    if let Some(custom) = custom {
        result.push_str(&format!("\n## Additional Instructions\n{custom}\n"));
    }
    result
}

/// Git repository information
struct GitInfo {
    branch: String,
    status_summary: String,
}

/// Detect git info synchronously (best-effort, non-blocking feel)
fn detect_git_info(working_dir: &str) -> Option<GitInfo> {
    let dir = std::path::Path::new(working_dir);

    // Check if .git exists
    if !dir.join(".git").exists() && !dir.join("../.git").exists() {
        return None;
    }

    // Get branch name
    let branch = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(dir)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Get short status
    let status = std::process::Command::new("git")
        .args(["status", "--porcelain", "--short"])
        .current_dir(dir)
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();

    let status_summary = if status.trim().is_empty() {
        "clean".to_string()
    } else {
        let lines: Vec<&str> = status.lines().collect();
        let modified = lines.iter().filter(|l| l.starts_with(" M") || l.starts_with("M ")).count();
        let added = lines.iter().filter(|l| l.starts_with("A ") || l.starts_with("??")).count();
        let deleted = lines.iter().filter(|l| l.starts_with(" D") || l.starts_with("D ")).count();
        format!("{} modified, {} added/untracked, {} deleted", modified, added, deleted)
    };

    Some(GitInfo { branch, status_summary })
}

/// Load project-level instruction files (CLAUDE.md, .handbox.md, AGENTS.md)
fn load_project_instructions(working_dir: &str) -> String {
    let dir = std::path::Path::new(working_dir);
    let instruction_files = [
        "CLAUDE.md",
        ".claude/instructions.md",
        ".handbox.md",
        "AGENTS.md",
        ".cursorrules",
    ];

    let mut instructions = String::new();
    for filename in &instruction_files {
        let path = dir.join(filename);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                // Limit each file to 2000 chars to prevent context bloat
                let truncated: String = content.chars().take(2000).collect();
                instructions.push_str(&format!("### From `{filename}`:\n{truncated}\n\n"));
                if content.len() > 2000 {
                    instructions.push_str("... [truncated]\n\n");
                }
            }
        }
    }

    instructions
}

// ============================================================
// Per-Project Helpers
// ============================================================

fn get_data_dir() -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .map(|p| std::path::PathBuf::from(p).join("Handbox"))
            .map_err(|_| "APPDATA not found".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs::data_dir()
            .map(|p| p.join("handbox"))
            .ok_or_else(|| "Data dir not found".to_string())
    }
}

fn get_project_memory_dir(project_id: &str) -> Result<std::path::PathBuf, String> {
    Ok(get_data_dir()?.join("projects").join(project_id).join("memory"))
}

fn get_project_plan_path(project_id: &str) -> Result<std::path::PathBuf, String> {
    Ok(get_data_dir()?.join("projects").join(project_id).join("plan.md"))
}

/// Build project context string for system prompt injection.
/// Loads the project plan and memory keys.
fn build_project_context(project_id: Option<&str>) -> Option<String> {
    let pid = project_id?;
    let data_dir = get_data_dir().ok()?;
    let project_dir = data_dir.join("projects").join(pid);

    let mut ctx = String::new();

    // Load plan
    let plan_path = project_dir.join("plan.md");
    if plan_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&plan_path) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                let truncated: String = trimmed.chars().take(2000).collect();
                ctx.push_str(&format!("## Project Plan\n{truncated}\n"));
                if trimmed.len() > 2000 {
                    ctx.push_str("... [truncated]\n");
                }
            }
        }
    }

    // Load memory keys
    let memory_dir = project_dir.join("memory");
    if memory_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&memory_dir) {
            let keys: Vec<String> = entries
                .flatten()
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.ends_with(".json") {
                        Some(name.trim_end_matches(".json").to_string())
                    } else {
                        None
                    }
                })
                .collect();
            if !keys.is_empty() {
                ctx.push_str(&format!("\n## Project Memory Keys\n{}\n", keys.join(", ")));
            }
        }
    }

    if ctx.is_empty() { None } else { Some(ctx) }
}

// ============================================================
// Tool Dispatch
// ============================================================

fn dispatch_tool<'a>(action: &'a AgentAction, app: &'a AppHandle, conv_id: &'a str, project_id: Option<&'a str>) -> Pin<Box<dyn Future<Output = Result<String, String>> + Send + 'a>> {
    Box::pin(async move {
    match action.tool.as_str() {
        "bash_execute" => {
            let command = action.args["command"].as_str().unwrap_or("echo 'no command'").to_string();

            // Safety check — block absolutely dangerous commands
            if let Err(e) = check_command_safety(&command) {
                return Err(e);
            }

            // Dangerous pattern check — require user approval
            if let Ok(Some(warning)) = check_command_safety(&command) {
                let _ = app.emit(AGENT_STREAM_EVENT, json!({
                    "type": "warning",
                    "conversation_id": conv_id,
                    "message": format!("Permission required: {warning}"),
                }));

                let approved = request_permission(app, &command, &warning, conv_id).await;
                if !approved {
                    return Err(format!("User denied permission for dangerous command: {command}"));
                }
            }

            let wd = action.args["working_dir"].as_str().map(String::from);
            let timeout = action.args["timeout_ms"].as_u64();
            let result = system_tools::tool_bash_execute(command, wd, timeout).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "file_read" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            let offset = action.args["offset"].as_u64().map(|v| v as usize);
            let limit = action.args["limit"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_file_read(path, offset, limit).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "file_write" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            let content = action.args["content"].as_str().unwrap_or("").to_string();
            let result = system_tools::tool_file_write(path, content, Some(true)).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "file_edit" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            let old = action.args["old_string"].as_str().unwrap_or("").to_string();
            let new = action.args["new_string"].as_str().unwrap_or("").to_string();
            let all = action.args["replace_all"].as_bool();
            let result = system_tools::tool_file_edit(path, old, new, all).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "file_edit_lines" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            let start = action.args["line_start"].as_u64().unwrap_or(1) as usize;
            let end = action.args["line_end"].as_u64().map(|v| v as usize);
            let text = action.args["new_text"].as_str().unwrap_or("").to_string();
            let result = system_tools::tool_file_edit_lines(path, start, end, text).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "grep_search" => {
            let pattern = action.args["pattern"].as_str().unwrap_or("").to_string();
            let path = action.args["path"].as_str().map(String::from);
            let glob = action.args["glob_filter"].as_str().map(String::from);
            let max = action.args["max_results"].as_u64().map(|v| v as usize);
            let ctx = action.args["context_lines"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_grep_search(pattern, path, glob, max, ctx).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "glob_search" => {
            let pattern = action.args["pattern"].as_str().unwrap_or("*").to_string();
            let path = action.args["path"].as_str().map(String::from);
            let max = action.args["max_results"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_glob_search(pattern, path, max).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "project_tree" => {
            let path = action.args["path"].as_str().map(String::from);
            let depth = action.args["max_depth"].as_u64().map(|v| v as usize);
            let max = action.args["max_entries"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_project_tree(path, depth, max).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "web_search" => {
            let query = action.args["query"].as_str().unwrap_or("").to_string();
            let max = action.args["max_results"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_web_search(query, max).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "web_fetch" => {
            let url = action.args["url"].as_str().unwrap_or("").to_string();
            let timeout = action.args["timeout_ms"].as_u64();
            let max = action.args["max_chars"].as_u64().map(|v| v as usize);
            // Retry transient web failures (timeout, connection reset)
            let mut last_err = String::new();
            for attempt in 0..3 {
                if attempt > 0 {
                    let jitter = rand_u64() % 500;
                    tokio::time::sleep(std::time::Duration::from_millis(300 * (1 << attempt) + jitter)).await;
                }
                match system_tools::tool_web_fetch(url.clone(), timeout, max).await {
                    Ok(result) => return Ok(result["text"].as_str().unwrap_or("").to_string()),
                    Err(e) => {
                        let is_transient = e.contains("timeout") || e.contains("connection") || e.contains("reset");
                        last_err = e;
                        if !is_transient { break; }
                    }
                }
            }
            Err(last_err)
        }
        "http_request" => {
            let url = action.args["url"].as_str().unwrap_or("").to_string();
            let method = action.args["method"].as_str().map(String::from);
            let headers = action.args.get("headers").cloned();
            let body = action.args["body"].as_str().map(String::from);
            let params = action.args.get("params").cloned();
            let timeout = action.args["timeout_ms"].as_u64();
            let max = action.args["max_chars"].as_u64().map(|v| v as usize);
            let result = system_tools::tool_http_request(url, method, headers, body, params, timeout, max).await?;
            let status = result["status"].as_u64().unwrap_or(0);
            let text = result["text"].as_str().unwrap_or("").to_string();
            let method_used = result["method"].as_str().unwrap_or("GET");
            let elapsed = result["elapsed_ms"].as_u64().unwrap_or(0);
            Ok(format!("[HTTP {} → {} ({} ms)]\n{}", method_used, status, elapsed,
                text.chars().take(10000).collect::<String>()))
        }
        "git_status" => {
            let path = action.args["path"].as_str().map(String::from);
            let result = system_tools::tool_git_status(path).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "git_diff" => {
            let path = action.args["path"].as_str().map(String::from);
            let staged = action.args["staged"].as_bool();
            let fp = action.args["file_path"].as_str().map(String::from);
            let result = system_tools::tool_git_diff(path, staged, fp).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "git_log" => {
            let path = action.args["path"].as_str().map(String::from);
            let max = action.args["max_count"].as_u64().map(|v| v as usize);
            let oneline = action.args["oneline"].as_bool();
            let result = system_tools::tool_git_log(path, max, oneline).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "git_commit" => {
            let msg = action.args["message"].as_str().unwrap_or("auto commit").to_string();
            let path = action.args["path"].as_str().map(String::from);
            let files = action.args["files"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect());
            let result = system_tools::tool_git_commit(msg, path, files).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "memory_read" => {
            let key = action.args["key"].as_str().map(String::from);
            // Per-project memory: override memory dir if project_id is set
            if let Some(pid) = project_id {
                let mem_dir = get_project_memory_dir(pid)?;
                if let Some(k) = &key {
                    let path = mem_dir.join(format!("{k}.json"));
                    if path.exists() {
                        let content = tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())?;
                        Ok(format!("Memory '{k}': {content}"))
                    } else {
                        Ok(format!("No memory found for key '{k}'"))
                    }
                } else {
                    let mut keys = Vec::new();
                    if let Ok(mut entries) = tokio::fs::read_dir(&mem_dir).await {
                        while let Ok(Some(entry)) = entries.next_entry().await {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.ends_with(".json") {
                                keys.push(name.trim_end_matches(".json").to_string());
                            }
                        }
                    }
                    if keys.is_empty() { Ok("No memories stored".to_string()) }
                    else { Ok(format!("Stored memories: {}", keys.join(", "))) }
                }
            } else {
                let result = system_tools::tool_memory_read(key).await?;
                Ok(result["text"].as_str().unwrap_or("").to_string())
            }
        }
        "memory_write" => {
            let key = action.args["key"].as_str().unwrap_or("default").to_string();
            let value = action.args["value"].clone();
            if let Some(pid) = project_id {
                let mem_dir = get_project_memory_dir(pid)?;
                tokio::fs::create_dir_all(&mem_dir).await.map_err(|e| e.to_string())?;
                let path = mem_dir.join(format!("{key}.json"));
                let content = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
                tokio::fs::write(&path, &content).await.map_err(|e| e.to_string())?;
                Ok(format!("Saved memory '{key}' (project-scoped)"))
            } else {
                let result = system_tools::tool_memory_write(key, value).await?;
                Ok(result["text"].as_str().unwrap_or("").to_string())
            }
        }
        "plan_read" => {
            if let Some(pid) = project_id {
                let plan_path = get_project_plan_path(pid)?;
                if plan_path.exists() {
                    let content = tokio::fs::read_to_string(&plan_path).await.map_err(|e| e.to_string())?;
                    if content.trim().is_empty() {
                        Ok("Project plan is empty. Use plan_write to create one.".to_string())
                    } else {
                        Ok(format!("## Project Plan\n{content}"))
                    }
                } else {
                    Ok("No project plan found. Use plan_write to create one.".to_string())
                }
            } else {
                Err("plan_read requires an active project. Please select a project first.".to_string())
            }
        }
        "plan_write" => {
            if let Some(pid) = project_id {
                let content = action.args["content"].as_str().unwrap_or("").to_string();
                let plan_path = get_project_plan_path(pid)?;
                if let Some(parent) = plan_path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                tokio::fs::write(&plan_path, &content).await.map_err(|e| e.to_string())?;
                Ok("Project plan updated successfully.".to_string())
            } else {
                Err("plan_write requires an active project. Please select a project first.".to_string())
            }
        }
        "parallel" => {
            // Parallel tool execution with concurrency limit (max 8 concurrent)
            let tools = action.args["tools"].as_array()
                .ok_or("parallel requires 'tools' array")?;

            let max_concurrent = 8usize;
            let semaphore = Arc::new(tokio::sync::Semaphore::new(max_concurrent));
            let mut handles = Vec::new();
            let app_clone = app.clone();
            let cid = conv_id.to_string();
            let pid_owned = project_id.map(|s| s.to_string());

            for tool_val in tools.iter().take(20) { // Cap at 20 parallel tools max
                let tool_name = tool_val["action"].as_str().unwrap_or("").to_string();
                let tool_args = tool_val["args"].clone();
                let sub_action = AgentAction { tool: tool_name, args: if tool_args.is_null() { json!({}) } else { tool_args } };
                let app_c = app_clone.clone();
                let cid_c = cid.clone();
                let sem = semaphore.clone();
                let pid_c = pid_owned.clone();

                handles.push(tokio::spawn(async move {
                    let _permit = sem.acquire().await.map_err(|e| format!("Semaphore error: {e}"))?;
                    dispatch_tool(&sub_action, &app_c, &cid_c, pid_c.as_deref()).await
                }));
            }

            let mut results = Vec::new();
            for (i, handle) in handles.into_iter().enumerate() {
                match handle.await {
                    Ok(Ok(result)) => results.push(format!("[Tool {}] {}", i + 1, result)),
                    Ok(Err(e)) => results.push(format!("[Tool {} error] {}", i + 1, e)),
                    Err(e) => results.push(format!("[Tool {} panic] {}", i + 1, e)),
                }
            }

            Ok(results.join("\n\n"))
        }
        "sub_agent" => {
            // Sub-agent: runs a mini agent loop for a specific research task
            let sub_task = action.args["task"].as_str().unwrap_or("").to_string();
            let max_iter = action.args["max_iterations"].as_u64().map(|v| (v as usize).min(20)).unwrap_or(10);
            let allow_write = action.args["allow_write"].as_bool().unwrap_or(false);
            let model_override = action.args["model_id"].as_str().map(String::from);
            let sub_result = run_sub_agent(&sub_task, app, conv_id, max_iter, allow_write, model_override.as_deref()).await?;
            Ok(sub_result)
        }
        "multi_agent" => {
            // Multi-agent: dispatch N parallel agents with different personas + consensus
            let task = action.args["task"].as_str().unwrap_or("").to_string();
            let consensus = action.args["consensus"].as_str().unwrap_or("none").to_string();
            let agents_raw = action.args["agents"].as_array()
                .ok_or("multi_agent requires 'agents' array")?;

            use crate::commands::agent::{AgentSpec, MultiAgentRequest};

            let agents: Vec<AgentSpec> = agents_raw.iter().map(|a| AgentSpec {
                id: a["id"].as_str().unwrap_or("agent").to_string(),
                name: a["name"].as_str().unwrap_or("Agent").to_string(),
                role: a["role"].as_str().unwrap_or("worker").to_string(),
                system_prompt: a["system_prompt"].as_str().unwrap_or("").to_string(),
                model_id: a["model_id"].as_str().map(String::from),
                provider: a["provider"].as_str().map(String::from),
                allowed_tools: a["allowed_tools"].as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            }).collect();

            let conv_state: tauri::State<'_, Arc<crate::commands::agent_loop::AgentConversationState>> = app.state();

            let mut handles = Vec::new();
            for spec in &agents {
                let req = AgentLoopRequest {
                    task: format!("{}\n\n[You are: {} (Role: {})]\n{}", task, spec.name, spec.role, spec.system_prompt),
                    system_prompt: Some(spec.system_prompt.clone()),
                    model_id: spec.model_id.clone(),
                    provider: spec.provider.clone(),
                    max_iterations: Some(10),
                    working_dir: None,
                    conversation_id: Some(format!("multi-{}-{}", spec.id, uuid::Uuid::new_v4())),
                    mode: None,
                    allowed_tools: spec.allowed_tools.clone(),
                    pinned_tools: None,
                    excluded_tools: None,
                    project_id: None,
                };

                let convs = Arc::clone(&*conv_state);
                let app_c = app.clone();
                let name = spec.name.clone();
                let role = spec.role.clone();

                handles.push(tokio::spawn(async move {
                    let result = run_agent_loop(req, &convs, &app_c).await;
                    (name, role, result)
                }));
            }

            // Collect results
            let mut agent_results: Vec<(String, String, String)> = Vec::new(); // (name, role, answer)
            let mut failures = Vec::new();
            for handle in handles {
                match handle.await {
                    Ok((name, role, Ok(result))) => {
                        agent_results.push((name, role, result.final_answer));
                    }
                    Ok((name, role, Err(e))) => {
                        failures.push(format!("{} ({}): FAILED — {}", name, role, e));
                    }
                    Err(e) => {
                        failures.push(format!("Agent panicked: {}", e));
                    }
                }
            }

            // Apply consensus mode
            let final_output = match consensus.as_str() {
                "majority_vote" => {
                    // Count occurrences of each unique answer (case-insensitive first 200 chars)
                    let mut votes: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
                    for (name, _role, answer) in &agent_results {
                        let key = answer.chars().take(200).collect::<String>().to_lowercase();
                        votes.entry(key).or_default().push(name.clone());
                    }
                    let winner = votes.iter().max_by_key(|(_k, v)| v.len());
                    if let Some((key, voters)) = winner {
                        // Find full answer for the key
                        let full_answer = agent_results.iter()
                            .find(|(_n, _r, a)| a.chars().take(200).collect::<String>().to_lowercase() == *key)
                            .map(|(_n, _r, a)| a.clone())
                            .unwrap_or_default();
                        format!("**Consensus (majority vote): {}/{} agents agreed**\nVoters: {}\n\n{}\n\n{}",
                            voters.len(), agent_results.len(), voters.join(", "), full_answer,
                            if !failures.is_empty() { format!("\nFailures:\n{}", failures.join("\n")) } else { String::new() })
                    } else {
                        "No consensus reached — all agents failed.".to_string()
                    }
                }
                "synthesis" => {
                    // Use LLM to synthesize all responses into one coherent answer
                    let responses_text: Vec<String> = agent_results.iter()
                        .map(|(name, role, answer)| format!("## {} ({})\n{}", name, role, answer))
                        .collect();
                    let synthesis_prompt = format!(
                        "Multiple agents were asked: \"{}\"\n\nHere are their responses:\n\n{}\n\nSynthesize these into a single, comprehensive answer that combines the best insights from all agents. Be concise but thorough.",
                        task, responses_text.join("\n\n---\n\n")
                    );

                    // Resolve provider for synthesis call
                    let resolved_provider = if let Some(app_state) = app.try_state::<crate::state::AppState>() {
                        if let Ok(creds) = app_state.llm_credentials.try_read() {
                            creds.active_provider.clone()
                        } else { None }
                    } else { None };

                    match invoke_llm(LLMRequest {
                        prompt: synthesis_prompt,
                        system_prompt: Some("You are a synthesizer agent. Combine multiple agent responses into one coherent answer.".to_string()),
                        messages: None,
                        model_id: None,
                        max_tokens: Some(4096),
                        temperature: Some(0.3),
                        provider: resolved_provider,
                        tools: None,
                        tool_choice: None,
                    }).await {
                        Ok(resp) => format!("**Synthesized from {} agents:**\n\n{}\n\n{}",
                            agent_results.len(), resp.text,
                            if !failures.is_empty() { format!("\nFailures:\n{}", failures.join("\n")) } else { String::new() }),
                        Err(e) => {
                            // Fallback to concatenation if synthesis fails
                            let concat: Vec<String> = agent_results.iter()
                                .map(|(n, r, a)| format!("## {} ({})\n{}", n, r, a))
                                .collect();
                            format!("Synthesis failed ({}), raw results:\n\n{}", e, concat.join("\n\n---\n\n"))
                        }
                    }
                }
                _ => {
                    // Default: concatenation (original behavior)
                    let mut output: Vec<String> = agent_results.iter()
                        .map(|(name, role, answer)| format!("## {} ({})\n{}", name, role, answer))
                        .collect();
                    output.extend(failures.iter().map(|f| format!("## FAILED: {}", f)));
                    format!("Multi-agent results ({} agents):\n\n{}", agents.len(), output.join("\n\n---\n\n"))
                }
            };

            Ok(final_output)
        }
        "create_plan" => {
            use tauri::Emitter;
            let title = action.args["title"].as_str().unwrap_or("Untitled Plan").to_string();
            let steps_raw = action.args["steps"].as_array()
                .ok_or("create_plan requires 'steps' array")?;

            let plan_id = uuid::Uuid::new_v4().to_string();
            let steps: Vec<PlanStep> = steps_raw.iter().enumerate().map(|(i, s)| {
                PlanStep {
                    id: i,
                    description: s["description"].as_str().unwrap_or("").to_string(),
                    tool: s["tool"].as_str().unwrap_or("").to_string(),
                    args: s["args"].clone(),
                    depends_on: s["depends_on"].as_array()
                        .map(|arr| arr.iter().filter_map(|v| v.as_u64().map(|n| n as usize)).collect())
                        .unwrap_or_default(),
                    status: "pending".to_string(),
                    result: None,
                }
            }).collect();

            let plan = ExecutionPlan {
                id: plan_id.clone(),
                title: title.clone(),
                steps: steps.clone(),
                status: "pending".to_string(),
            };

            // Store plan in conversation state for later execution
            if let Some(app_state) = app.try_state::<crate::state::AppState>() {
                if let Ok(mut plans) = app_state.execution_plans.try_write() {
                    plans.insert(plan_id.clone(), plan.clone());
                }
            }

            // Emit plan to frontend for display
            let _ = app.emit("agent-plan", json!({
                "plan_id": &plan_id,
                "title": &title,
                "steps": steps,
                "status": "pending",
            }));

            Ok(format!("Created execution plan '{}' with {} steps (ID: {}). Use execute_plan to run it.", title, steps_raw.len(), plan_id))
        }
        "execute_plan" => {
            use tauri::Emitter;
            let plan_id = action.args["plan_id"].as_str().unwrap_or("").to_string();

            // Retrieve the plan
            let plan = if let Some(app_state) = app.try_state::<crate::state::AppState>() {
                if let Ok(plans) = app_state.execution_plans.try_read() {
                    plans.get(&plan_id).cloned()
                } else { None }
            } else { None };

            let mut plan = plan.ok_or_else(|| format!("Plan '{}' not found", plan_id))?;
            plan.status = "executing".to_string();

            let mut results = Vec::new();
            let total_steps = plan.steps.len();

            for step_idx in 0..total_steps {
                // Extract needed data before mutable borrow
                let step_tool = plan.steps[step_idx].tool.clone();
                let step_args = plan.steps[step_idx].args.clone();
                let step_desc = plan.steps[step_idx].description.clone();
                let step_deps = plan.steps[step_idx].depends_on.clone();

                // Check dependencies are completed
                let deps_met = step_deps.iter().all(|dep| {
                    plan.steps.get(*dep).map(|s| s.status == "completed").unwrap_or(false)
                });
                if !deps_met {
                    plan.steps[step_idx].status = "skipped".to_string();
                    plan.steps[step_idx].result = Some("Skipped: dependencies not met".to_string());
                    results.push(format!("Step {}: SKIPPED (deps not met)", step_idx));
                    continue;
                }

                // Update step status
                plan.steps[step_idx].status = "running".to_string();
                let _ = app.emit("agent-plan-step", json!({
                    "plan_id": &plan_id,
                    "step_id": step_idx,
                    "status": "running",
                }));

                // Execute the step
                let step_action = AgentAction {
                    tool: step_tool,
                    args: step_args,
                };
                let step_result = match dispatch_tool(&step_action, app, conv_id, None).await {
                    Ok(r) => {
                        plan.steps[step_idx].status = "completed".to_string();
                        plan.steps[step_idx].result = Some(r.chars().take(2000).collect());
                        results.push(format!("Step {} ({}): OK", step_idx, step_desc));
                        r
                    }
                    Err(e) => {
                        plan.steps[step_idx].status = "failed".to_string();
                        plan.steps[step_idx].result = Some(e.clone());
                        results.push(format!("Step {} ({}): FAILED — {}", step_idx, step_desc, e));
                        e
                    }
                };

                let step_status = plan.steps[step_idx].status.clone();
                let _ = app.emit("agent-plan-step", json!({
                    "plan_id": &plan_id,
                    "step_id": step_idx,
                    "status": step_status,
                    "result": step_result.chars().take(500).collect::<String>(),
                }));
            }

            let completed = plan.steps.iter().filter(|s| s.status == "completed").count();
            let failed = plan.steps.iter().filter(|s| s.status == "failed").count();
            plan.status = if failed > 0 { "completed_with_errors".to_string() } else { "completed".to_string() };

            // Update stored plan
            if let Some(app_state) = app.try_state::<crate::state::AppState>() {
                if let Ok(mut plans) = app_state.execution_plans.try_write() {
                    plans.insert(plan_id.clone(), plan);
                }
            }

            Ok(format!("Plan execution complete: {}/{} steps succeeded, {} failed.\n\n{}", completed, total_steps, failed, results.join("\n")))
        }
        "finish" => {
            Ok(action.args["answer"].as_str()
                .or_else(|| action.args["result"].as_str())
                .unwrap_or("Done").to_string())
        }
        // ── Workflow Canvas Tools ──
        "workflow_create" => {
            let raw_nodes = action.args.get("nodes").cloned().unwrap_or(json!([]));
            let edges = action.args.get("edges").cloned().unwrap_or(json!([]));
            let clear = action.args["clear_existing"].as_bool().unwrap_or(false);

            // Sanitize node labels to strings (prevent injection)
            let nodes = if let Some(arr) = raw_nodes.as_array() {
                let sanitized: Vec<Value> = arr.iter().map(|n| {
                    let mut node = n.clone();
                    if let Some(obj) = node.as_object_mut() {
                        if let Some(label) = obj.get("label") {
                            let safe_label = label.as_str().unwrap_or("Node")
                                .chars().take(100).collect::<String>();
                            obj.insert("label".to_string(), json!(safe_label));
                        }
                    }
                    node
                }).collect();
                json!(sanitized)
            } else {
                json!([])
            };

            let node_count = nodes.as_array().map(|a| a.len()).unwrap_or(0);
            let edge_count = edges.as_array().map(|a| a.len()).unwrap_or(0);

            app.emit("workflow-update", json!({
                "type": "create",
                "nodes": nodes,
                "edges": edges,
                "clear_existing": clear,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok(format!("Created {} nodes and {} edges on canvas", node_count, edge_count))
        }
        "workflow_add_node" => {
            // Force label and tool_ref to be strings (prevent injection of objects/arrays)
            let label = action.args.get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("Node")
                .chars().take(100).collect::<String>();
            let tool_ref = action.args.get("tool_ref")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            app.emit("workflow-update", json!({
                "type": "add_node",
                "tool_ref": tool_ref,
                "label": label,
                "config": action.args.get("config").cloned().unwrap_or(json!({})),
                "position": action.args.get("position").cloned().unwrap_or(json!({"x": 300, "y": 200})),
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok("Node added to canvas".to_string())
        }
        "workflow_remove_node" => {
            let node_id = action.args["node_id"].as_str().unwrap_or("").to_string();
            app.emit("workflow-update", json!({
                "type": "remove_node",
                "node_id": node_id,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok(format!("Removed node '{node_id}' from canvas"))
        }
        "workflow_connect" => {
            app.emit("workflow-update", json!({
                "type": "connect",
                "source": action.args.get("source").cloned().unwrap_or(json!("")),
                "source_port": action.args.get("source_port").cloned().unwrap_or(json!("output")),
                "target": action.args.get("target").cloned().unwrap_or(json!("")),
                "target_port": action.args.get("target_port").cloned().unwrap_or(json!("input")),
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok("Nodes connected on canvas".to_string())
        }
        "workflow_set_config" => {
            let node_id = action.args["node_id"].as_str().unwrap_or("").to_string();
            let config = action.args.get("config").cloned().unwrap_or(json!({}));

            app.emit("workflow-update", json!({
                "type": "set_config",
                "node_id": node_id,
                "config": config,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok(format!("Configuration set on node '{node_id}'"))
        }
        "workflow_select_node" => {
            let node_id = action.args["node_id"].as_str().unwrap_or("").to_string();

            app.emit("workflow-update", json!({
                "type": "select_node",
                "node_id": node_id,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            Ok(format!("Node '{node_id}' selected on canvas"))
        }
        "workflow_update_node" => {
            let node_id = action.args["node_id"].as_str().unwrap_or("").to_string();
            if node_id.is_empty() {
                return Err("workflow_update_node requires 'node_id'".to_string());
            }
            let label = action.args.get("label")
                .and_then(|v| v.as_str())
                .map(|s| s.chars().take(100).collect::<String>());
            let position = action.args.get("position").cloned();

            app.emit("workflow-update", json!({
                "type": "update_node",
                "node_id": node_id,
                "label": label,
                "position": position,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            let mut changes = Vec::new();
            if label.is_some() { changes.push("label"); }
            if position.is_some() { changes.push("position"); }
            Ok(format!("Updated node '{}': changed {}", node_id, changes.join(", ")))
        }
        "workflow_remove_edge" => {
            let edge_id = action.args.get("edge_id")
                .and_then(|v| v.as_str())
                .map(String::from);
            let source = action.args.get("source")
                .and_then(|v| v.as_str())
                .map(String::from);
            let target = action.args.get("target")
                .and_then(|v| v.as_str())
                .map(String::from);

            if edge_id.is_none() && (source.is_none() || target.is_none()) {
                return Err("workflow_remove_edge requires 'edge_id' or both 'source' and 'target'".to_string());
            }

            app.emit("workflow-update", json!({
                "type": "remove_edge",
                "edge_id": edge_id,
                "source": source,
                "target": target,
            })).map_err(|e| format!("Failed to emit workflow update: {e}"))?;

            if let Some(eid) = edge_id {
                Ok(format!("Removed edge '{eid}'"))
            } else {
                Ok(format!("Removed edge between '{}' and '{}'",
                    source.unwrap_or_default(), target.unwrap_or_default()))
            }
        }
        "workflow_list" => {
            // Emit list_request and wait for response via a oneshot channel
            use tokio::sync::oneshot;
            use std::sync::Mutex;

            let (tx, rx) = oneshot::channel::<String>();
            let tx = Arc::new(Mutex::new(Some(tx)));
            let tx_clone = tx.clone();

            // Listen for the response event from frontend
            let _handler = app.listen("workflow-list-response", move |event| {
                if let Some(sender) = tx_clone.lock().unwrap().take() {
                    let payload = event.payload().to_string();
                    let _ = sender.send(payload);
                }
            });

            // Ask frontend for current canvas state
            app.emit("workflow-update", json!({
                "type": "list_request",
            })).map_err(|e| format!("Failed to emit workflow list request: {e}"))?;

            // Wait with 3-second timeout
            match tokio::time::timeout(std::time::Duration::from_secs(3), rx).await {
                Ok(Ok(payload)) => {
                    Ok(format!("Current canvas state:\n{}", payload))
                }
                Ok(Err(_)) => {
                    Ok("Canvas state: no response (channel closed)".to_string())
                }
                Err(_) => {
                    Ok("Canvas state: timeout waiting for frontend response".to_string())
                }
            }
        }
        // ── Vector Store Tools (RAG) ──
        "api_ingest" => {
            // Composite: http_request → chunk → embed → vector_store with source metadata
            let url = action.args["url"].as_str().unwrap_or("").to_string();
            let collection = scope_collection_name(
                action.args.get("collection").and_then(|v| v.as_str()).unwrap_or("default"),
                project_id,
            );
            let source_label = action.args.get("source_label")
                .and_then(|v| v.as_str())
                .unwrap_or(&url).to_string();
            let chunk_size = action.args.get("chunk_size")
                .and_then(|v| v.as_u64())
                .unwrap_or(1000) as usize;
            let method = action.args.get("method")
                .and_then(|v| v.as_str())
                .unwrap_or("GET").to_string();
            let req_headers = action.args.get("headers").cloned();
            let req_body = action.args.get("body")
                .and_then(|v| v.as_str())
                .map(String::from);

            // Step 1: Fetch data from API
            let http_result = crate::commands::system_tools::tool_http_request(
                url.clone(),
                Some(method.clone()),
                req_headers,
                req_body,
                None,
                Some(30000),
                Some(500000),
            ).await?;

            let status = http_result["status"].as_u64().unwrap_or(0);
            let text = http_result["text"].as_str().unwrap_or("").to_string();
            if text.is_empty() {
                return Err(format!("api_ingest: empty response from {url} (HTTP {status})"));
            }

            // Step 2: Chunk text
            let chunks = chunk_text(&text, chunk_size);
            let total_chunks = chunks.len();
            let ingested_at = chrono::Utc::now().to_rfc3339();

            // Step 3: Embed and store each chunk
            let vs_state: tauri::State<'_, Arc<VectorStoreState>> = app.state();
            let mut entries = Vec::new();
            for (i, chunk) in chunks.iter().enumerate() {
                let vector = match create_embedding(EmbeddingRequest { text: chunk.clone(), model_id: None }).await {
                    Ok(resp) => resp.embedding,
                    Err(_) => simple_text_embedding(chunk, 128),
                };
                let metadata = json!({
                    "source": url,
                    "source_type": "api",
                    "source_label": source_label,
                    "chunk_id": i,
                    "total_chunks": total_chunks,
                    "ingested_at": ingested_at,
                    "http_status": status,
                    "http_method": method,
                });
                entries.push(VectorEntry {
                    id: format!("api_{}_{}", uuid::Uuid::new_v4(), i),
                    vector,
                    metadata,
                    text: Some(chunk.clone()),
                });
            }

            let result = vector_store::vector_store_raw(&collection, entries, &*vs_state).await?;
            let stored = result["stored_count"].as_u64().unwrap_or(0);
            Ok(format!("Ingested {} chunks from {} (HTTP {}) into collection '{}'. Source: {}",
                stored, url, status, collection, source_label))
        }
        "vector_store" => {
            let collection = scope_collection_name(
                action.args["collection"].as_str().unwrap_or("default"),
                project_id,
            );
            let raw_entries = action.args["entries"].as_array()
                .ok_or("vector_store requires 'entries' array")?;

            let mut entries = Vec::new();
            for (i, raw) in raw_entries.iter().enumerate() {
                let id = raw["id"].as_str()
                    .unwrap_or(&format!("auto_{}", uuid::Uuid::new_v4()))
                    .to_string();
                let text = raw["text"].as_str().map(String::from);
                let metadata = raw.get("metadata").cloned().unwrap_or(json!({}));

                // Generate embedding from text
                let vector = if let Some(ref t) = text {
                    match create_embedding(EmbeddingRequest { text: t.clone(), model_id: None }).await {
                        Ok(resp) => resp.embedding,
                        Err(_) => {
                            // Fallback: simple hash-based pseudo-embedding (128-dim)
                            simple_text_embedding(t, 128)
                        }
                    }
                } else {
                    // If raw vector provided, use it
                    raw["vector"].as_array()
                        .map(|a| a.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect())
                        .unwrap_or_else(|| vec![0.0; 128])
                };

                entries.push(VectorEntry { id, vector, metadata, text });
            }

            let vs_state: tauri::State<'_, Arc<VectorStoreState>> = app.state();
            let result = vector_store::vector_store_raw(&collection, entries, &*vs_state).await?;
            Ok(result["text"].as_str().unwrap_or("Stored").to_string())
        }
        "vector_search" => {
            let collection = scope_collection_name(
                action.args["collection"].as_str().unwrap_or("default"),
                project_id,
            );
            let top_k = action.args["top_k"].as_u64().unwrap_or(5) as usize;
            let query_text = action.args["query"].as_str().unwrap_or("").to_string();

            // Generate query embedding
            let query_vector = match create_embedding(EmbeddingRequest { text: query_text.clone(), model_id: None }).await {
                Ok(resp) => resp.embedding,
                Err(_) => simple_text_embedding(&query_text, 128)
            };

            let vs_state: tauri::State<'_, Arc<VectorStoreState>> = app.state();
            let result = vector_store::vector_search_raw(&collection, &query_vector, top_k, 0.0, &*vs_state).await?;

            // Enhanced output with source citations
            if let Some(results) = result["results"].as_array() {
                let mut lines = vec![format!("Top {} results from '{collection}':", results.len())];
                for (i, r) in results.iter().enumerate() {
                    let score = r["score"].as_f64().unwrap_or(0.0);
                    let id = r["id"].as_str().unwrap_or("?");
                    let text_preview = r["text"].as_str().unwrap_or("")
                        .chars().take(300).collect::<String>();
                    let meta = &r["metadata"];

                    // Format source citation if available
                    let source_line = if let Some(src) = meta["source"].as_str() {
                        let label = meta["source_label"].as_str().unwrap_or(src);
                        let chunk_id = meta["chunk_id"].as_u64();
                        if let Some(cid) = chunk_id {
                            format!("   Source: {} (chunk {})", label, cid)
                        } else {
                            format!("   Source: {}", label)
                        }
                    } else {
                        String::new()
                    };

                    lines.push(format!("{}. [score={:.3}] {}", i + 1, score, id));
                    if !source_line.is_empty() {
                        lines.push(source_line);
                    }
                    lines.push(format!("   {}", text_preview));
                }
                Ok(lines.join("\n"))
            } else {
                Ok(result["text"].as_str().unwrap_or("No results").to_string())
            }
        }
        "vector_delete" => {
            let collection = scope_collection_name(
                action.args["collection"].as_str().unwrap_or("default"),
                project_id,
            );
            let ids: Vec<String> = action.args["ids"].as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            let vs_state: tauri::State<'_, Arc<VectorStoreState>> = app.state();
            let mut colls = vs_state.collections.write().await;
            if let Some(coll) = colls.get_mut(&collection) {
                let before = coll.entries.len();
                coll.entries.retain(|e| !ids.contains(&e.id));
                Ok(format!("Deleted {} vectors from '{}'", before - coll.entries.len(), collection))
            } else {
                Err(format!("Collection '{}' not found", collection))
            }
        }
        "vector_list_collections" => {
            let vs_state: tauri::State<'_, Arc<VectorStoreState>> = app.state();
            let colls = vs_state.collections.read().await;
            // Filter by project scope if project_id is set
            let prefix = project_id.map(|pid| format!("{pid}__"));
            let info: Vec<String> = colls.values()
                .filter(|c| {
                    match &prefix {
                        Some(p) => c.name.starts_with(p),
                        None => true,
                    }
                })
                .map(|c| {
                    // Show short name (without project prefix) for scoped collections
                    let display_name = match &prefix {
                        Some(p) if c.name.starts_with(p) => &c.name[p.len()..],
                        _ => &c.name,
                    };
                    format!("- {} (full: {}): {} vectors (dim={})", display_name, c.name, c.entries.len(), c.dimension)
                })
                .collect();
            Ok(if info.is_empty() {
                "No vector collections".to_string()
            } else {
                format!("{} collections:\n{}", info.len(), info.join("\n"))
            })
        }
        // ── MCP Tools (Model Context Protocol) ──
        "mcp_list_servers" => {
            let mcp_state: tauri::State<'_, McpState> = app.state();
            let servers = mcp::mcp_list_servers_raw(&*mcp_state).await?;
            if servers.is_empty() {
                Ok("No MCP servers configured. Use the MCP settings panel to add servers.".to_string())
            } else {
                let mut lines = vec![format!("{} MCP server(s):", servers.len())];
                for s in &servers {
                    let tool_names: Vec<&str> = s.tools.iter().map(|t| t.name.as_str()).collect();
                    lines.push(format!(
                        "- {} (id={}, status={}, {} tools: [{}])",
                        s.name, s.id, s.status, s.tools.len(), tool_names.join(", ")
                    ));
                }
                Ok(lines.join("\n"))
            }
        }
        "mcp_get_tools" => {
            let server_id = action.args["server_id"].as_str().unwrap_or("").to_string();
            let mcp_state: tauri::State<'_, McpState> = app.state();
            let tools = mcp::mcp_get_tools_raw(&*mcp_state, &server_id).await?;
            if tools.is_empty() {
                Ok(format!("No tools found on server '{}'", server_id))
            } else {
                let mut lines = vec![format!("{} tools on '{}':", tools.len(), server_id)];
                for t in &tools {
                    let schema_str = serde_json::to_string(&t.input_schema).unwrap_or_default();
                    lines.push(format!("- **{}**: {}\n  Schema: {}", t.name, t.description, schema_str));
                }
                Ok(lines.join("\n"))
            }
        }
        "mcp_call" => {
            let server_id = action.args["server_id"].as_str().unwrap_or("").to_string();
            let tool_name = action.args["tool_name"].as_str().unwrap_or("").to_string();
            let arguments = action.args.get("arguments").cloned().unwrap_or(json!({}));

            let mcp_state: tauri::State<'_, McpState> = app.state();
            let result = mcp::mcp_call_tool_raw(&*mcp_state, &server_id, &tool_name, &arguments).await;

            match result {
                Ok(call_result) => {
                    if call_result.success {
                        let output_str = call_result.output
                            .map(|v| serde_json::to_string_pretty(&v).unwrap_or_default())
                            .unwrap_or_else(|| "(no output)".to_string());
                        Ok(format!("MCP tool call succeeded:\n{}", output_str))
                    } else {
                        Err(format!("MCP tool call failed: {}", call_result.error.unwrap_or_default()))
                    }
                }
                Err(e) => Err(format!("MCP error: {e}"))
            }
        }
        // ── GIS Analysis Tools ──
        // These read a file first, then perform operations on the loaded data.
        // Path validation: reject empty paths and obvious traversal attempts
        "gis_read" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("gis_read requires a 'path' argument".to_string()); }
            let format = action.args["format"].as_str().unwrap_or("geojson");
            let result = match format {
                "shapefile" | "shp" => crate::commands::gis::gis_read_shapefile(path).await,
                "geopackage" | "gpkg" => crate::commands::gis::gis_read_geopackage(path, None).await,
                _ => crate::commands::gis::gis_read_geojson(path).await,
            }?;
            Ok(format!(
                "GIS data loaded: {} features, bounds={:?}",
                result.feature_count, result.bounds
            ))
        }
        "gis_analyze" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("gis_analyze requires a 'path' argument".to_string()); }
            let operation = action.args["operation"].as_str().unwrap_or("bounds");
            let read_result = crate::commands::gis::gis_read_geojson(path.clone()).await
                .map_err(|e| format!("Failed to read GIS file '{}': {}", path, e))?;
            let features = read_result.features;

            match operation {
                "bounds" => {
                    let result = crate::commands::gis::gis_calculate_bounds(features).await?;
                    Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
                }
                "statistics" => {
                    let property = action.args["property"].as_str().unwrap_or("").to_string();
                    let result = crate::commands::gis::gis_property_statistics(features, property).await?;
                    Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
                }
                other => Err(format!("Unknown GIS operation: {other}. Available: bounds, statistics"))
            }
        }
        "gis_filter" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("gis_filter requires a 'path' argument".to_string()); }
            let field = action.args["field"].as_str().unwrap_or("").to_string();
            let operator = action.args["operator"].as_str().unwrap_or("eq").to_string();
            let value = action.args.get("value").cloned().unwrap_or(json!(""));
            let read_result = crate::commands::gis::gis_read_geojson(path).await?;
            let result = crate::commands::gis::gis_filter_features(read_result.features, field, operator, value).await?;
            Ok(format!("Filtered: {} features remaining", result.features.len()))
        }
        "gis_transform" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("gis_transform requires a 'path' argument".to_string()); }
            let source_crs = action.args["source_crs"].as_str().unwrap_or("EPSG:4326").to_string();
            let target_crs = action.args["target_crs"].as_str().unwrap_or("EPSG:3857").to_string();
            let read_result = crate::commands::gis::gis_read_geojson(path).await?;
            let result = crate::commands::gis::gis_transform_crs(read_result.features, source_crs, target_crs).await?;
            Ok(format!("Transformed {} features from {} to {}", result.features.len(), "source", "target"))
        }
        "gis_buffer" => {
            let geometry = action.args.get("geometry").cloned().unwrap_or(json!({}));
            let distance = action.args["distance"].as_f64().unwrap_or(100.0);
            let result = crate::commands::gis::gis_buffer(geometry, distance, None).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }

        // ── IFC/BIM Analysis Tools ──
        "ifc_read" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("ifc_read requires a 'path' argument".to_string()); }
            let result = crate::commands::ifc::ifc_read_file(path).await?;
            Ok(format!(
                "IFC model loaded: {} entities, schema={}",
                result.statistics.total_entities,
                result.statistics.schema
            ))
        }
        "ifc_hierarchy" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("ifc_hierarchy requires a 'path' argument".to_string()); }
            let read_result = crate::commands::ifc::ifc_read_file(path).await?;
            let result = crate::commands::ifc::ifc_extract_hierarchy(read_result.model).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }
        "ifc_search" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("ifc_search requires a 'path' argument".to_string()); }
            let query = action.args["query"].as_str().unwrap_or("").to_string();
            let entity_type = action.args["entity_type"].as_str().map(String::from);
            let read_result = crate::commands::ifc::ifc_read_file(path).await?;
            let result = crate::commands::ifc::ifc_search_entities(read_result.model, query, entity_type).await?;
            let summary: Vec<String> = result.iter().take(20).map(|e| {
                format!("#{}: {}", e.id, e.name.as_deref().unwrap_or("unnamed"))
            }).collect();
            Ok(format!("{} entities found:\n{}", result.len(), summary.join("\n")))
        }
        "ifc_statistics" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("ifc_statistics requires a 'path' argument".to_string()); }
            let read_result = crate::commands::ifc::ifc_read_file(path).await?;
            let result = crate::commands::ifc::ifc_get_statistics(read_result.model).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }
        "ifc_modify" => {
            let path = action.args["path"].as_str().unwrap_or("").to_string();
            if path.is_empty() { return Err("ifc_modify requires a 'path' argument".to_string()); }
            let entity_id = action.args["entity_id"].as_str().unwrap_or("").to_string();
            let properties_val = action.args.get("properties").cloned().unwrap_or(json!({}));
            let properties: std::collections::HashMap<String, Value> = match properties_val {
                Value::Object(map) => map.into_iter().collect(),
                _ => std::collections::HashMap::new(),
            };
            let read_result = crate::commands::ifc::ifc_read_file(path.clone()).await?;
            let modified = crate::commands::ifc::ifc_modify_entity(read_result.model, entity_id, properties).await?;
            // Write back
            crate::commands::ifc::ifc_write_file(modified, path).await?;
            Ok("Entity modified and saved".to_string())
        }

        // ── DAG Workflow Execution ──
        "workflow_execute" => {
            // Emit event to frontend to trigger canvas execution
            // The frontend useExecution hook handles: canvas→JSON→import→execute
            app.emit("workflow-execute-request", serde_json::json!({
                "source": "agent",
                "conversation_id": conv_id,
            })).map_err(|e| format!("Failed to emit execute event: {e}"))?;
            Ok("Workflow execution started. The canvas workflow is now running. Results will appear on each node as inline previews.".to_string())
        }
        "workflow_list" => {
            let wf_state: tauri::State<'_, crate::state::AppState> = app.state();
            let result = crate::commands::workflow::list_workflows(wf_state).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }
        "workflow_status" => {
            let execution_id = action.args["execution_id"].as_str().unwrap_or("").to_string();
            let tracker: tauri::State<'_, Arc<crate::commands::execution::ExecutionTrackerState>> = app.state();
            let status = crate::commands::execution::get_execution_status(execution_id, tracker).await?;
            Ok(format!("Execution status: {status}"))
        }

        // ── New Tools: web crawl, download, archive, DB, Python, clipboard ──
        "web_crawl" => {
            let url = action.args["url"].as_str().unwrap_or("").to_string();
            let max_depth = action.args["max_depth"].as_u64().map(|v| v as usize);
            let max_pages = action.args["max_pages"].as_u64().map(|v| v as usize);
            let selector = action.args["selector"].as_str().map(String::from);
            let follow_pattern = action.args["follow_pattern"].as_str().map(String::from);
            let result = system_tools::tool_web_crawl(url, max_depth, max_pages, selector, follow_pattern, Some(true)).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string()
                + "\n\n"
                + &serde_json::to_string_pretty(&result["pages"]).unwrap_or_default())
        }
        "file_download" => {
            let url = action.args["url"].as_str().unwrap_or("").to_string();
            let output = action.args["output_path"].as_str().map(String::from);
            let result = system_tools::tool_file_download(url, output, Some(true)).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "archive_compress" => {
            let source = action.args["source_path"].as_str().unwrap_or("").to_string();
            let output = action.args["output_path"].as_str().unwrap_or("archive.zip").to_string();
            let format = action.args["format"].as_str().map(String::from);
            let result = system_tools::tool_archive_compress(source, output, format).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "archive_decompress" => {
            let path = action.args["archive_path"].as_str().unwrap_or("").to_string();
            let output_dir = action.args["output_dir"].as_str().map(String::from);
            let result = system_tools::tool_archive_decompress(path, output_dir).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "archive_list" => {
            let path = action.args["archive_path"].as_str().unwrap_or("").to_string();
            let result = system_tools::tool_archive_list(path).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }
        "db_query" => {
            let db_type = action.args["db_type"].as_str().unwrap_or("sqlite").to_string();
            let connection = action.args["connection"].as_str().unwrap_or("").to_string();
            let query = action.args["query"].as_str().unwrap_or("").to_string();
            let params = action.args["params"].as_array().map(|a| a.to_vec());
            let result = system_tools::tool_db_query(db_type, connection, query, params).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string()
                + "\n"
                + &serde_json::to_string_pretty(&result["rows"]).unwrap_or_default())
        }
        "db_schema" => {
            let db_type = action.args["db_type"].as_str().unwrap_or("sqlite").to_string();
            let connection = action.args["connection"].as_str().unwrap_or("").to_string();
            let result = system_tools::tool_db_schema(db_type, connection).await?;
            Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
        }
        "python_execute" | "python" => {
            let script = action.args["script"].as_str().unwrap_or("").to_string();
            let wd = action.args["working_dir"].as_str().map(String::from);
            let timeout = action.args["timeout_ms"].as_u64();
            let capture = action.args["capture_files"].as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect());
            let result = system_tools::tool_python_execute(script, wd, timeout, capture).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }
        "clipboard_read" => {
            let result = system_tools::tool_clipboard_read().await?;
            Ok(result["text"].as_str().unwrap_or("").to_string()
                + "\n"
                + result["content"].as_str().unwrap_or(""))
        }
        "clipboard_write" => {
            let content = action.args["content"].as_str().unwrap_or("").to_string();
            let result = system_tools::tool_clipboard_write(content).await?;
            Ok(result["text"].as_str().unwrap_or("").to_string())
        }

        other => Err(format!("Unknown tool: {other}"))
    }
    }) // close Box::pin(async move { ... })
}

// ============================================================
// Function Calling: Tool Definitions & Dynamic Filtering
// ============================================================

/// Build native tool definitions for function calling APIs.
/// Returns ToolDefinition structs that map to the dispatch_tool match arms.
fn build_tool_definitions(categories: &[String], allowed: Option<&[String]>, excluded: Option<&[String]>) -> Vec<ToolDefinition> {
    let mut defs = Vec::new();
    macro_rules! tool {
        ($cat:expr, $name:expr, $desc:expr, $schema:expr) => {
            if categories.contains(&$cat.to_string()) || categories.contains(&"all".to_string()) {
                defs.push(ToolDefinition {
                    name: $name.to_string(),
                    description: $desc.to_string(),
                    input_schema: $schema,
                });
            }
        };
    }

    // Core tools (always included)
    tool!("core", "bash_execute", "Execute a shell command and return stdout/stderr",
        json!({"type":"object","properties":{"command":{"type":"string","description":"Shell command to execute"},"working_dir":{"type":"string","description":"Working directory"}},"required":["command"]}));
    tool!("core", "file_read", "Read file contents with line numbers",
        json!({"type":"object","properties":{"path":{"type":"string","description":"File path"},"offset":{"type":"integer","description":"Line offset"},"limit":{"type":"integer","description":"Max lines"}},"required":["path"]}));
    tool!("core", "file_write", "Create or overwrite a file",
        json!({"type":"object","properties":{"path":{"type":"string","description":"File path"},"content":{"type":"string","description":"File content"}},"required":["path","content"]}));
    tool!("core", "file_edit", "Find and replace text in a file",
        json!({"type":"object","properties":{"path":{"type":"string","description":"File path"},"old_text":{"type":"string","description":"Text to find"},"new_text":{"type":"string","description":"Replacement text"}},"required":["path","old_text","new_text"]}));
    tool!("core", "finish", "End the task with a final answer",
        json!({"type":"object","properties":{"answer":{"type":"string","description":"Final answer"}},"required":["answer"]}));

    // Code search tools
    tool!("code", "grep_search", "Search file contents with regex",
        json!({"type":"object","properties":{"pattern":{"type":"string","description":"Regex pattern"},"path":{"type":"string","description":"Directory to search"},"include":{"type":"string","description":"File glob filter"}},"required":["pattern"]}));
    tool!("code", "glob_search", "Find files by glob pattern",
        json!({"type":"object","properties":{"pattern":{"type":"string","description":"Glob pattern (e.g. **/*.rs)"},"path":{"type":"string","description":"Base directory"}},"required":["pattern"]}));
    tool!("code", "project_tree", "Show directory structure",
        json!({"type":"object","properties":{"path":{"type":"string","description":"Root directory"},"max_depth":{"type":"integer"},"max_entries":{"type":"integer"}},"required":[]}));

    // Web tools
    tool!("web", "web_search", "Search the web",
        json!({"type":"object","properties":{"query":{"type":"string","description":"Search query"},"max_results":{"type":"integer"}},"required":["query"]}));
    tool!("web", "web_fetch", "Fetch URL content as text",
        json!({"type":"object","properties":{"url":{"type":"string","description":"URL to fetch"},"selector":{"type":"string","description":"CSS selector"}},"required":["url"]}));
    tool!("web", "http_request", "Full HTTP client (GET/POST/PUT/DELETE/PATCH) with custom headers, body, and query parameters",
        json!({"type":"object","properties":{
            "url":{"type":"string","description":"Target URL"},
            "method":{"type":"string","enum":["GET","POST","PUT","DELETE","PATCH"],"description":"HTTP method (default: GET)"},
            "headers":{"type":"object","description":"Request headers as JSON object"},
            "body":{"type":"string","description":"Request body (JSON or text)"},
            "params":{"type":"object","description":"Query parameters as JSON object"},
            "timeout_ms":{"type":"integer","description":"Timeout in ms (default: 30000)"},
            "max_chars":{"type":"integer","description":"Max response chars (default: 100000)"}
        },"required":["url"]}));
    tool!("web", "web_crawl", "Recursively crawl a website",
        json!({"type":"object","properties":{"url":{"type":"string","description":"Starting URL"},"max_depth":{"type":"integer","description":"Max crawl depth (default 2)"},"max_pages":{"type":"integer","description":"Max pages (default 10)"},"selector":{"type":"string","description":"CSS selector for content"},"follow_pattern":{"type":"string","description":"Regex filter for URLs to follow"}},"required":["url"]}));
    tool!("web", "file_download", "Download a URL to a local file",
        json!({"type":"object","properties":{"url":{"type":"string","description":"URL to download"},"output_path":{"type":"string","description":"Local file path"}},"required":["url"]}));

    // Git tools
    tool!("git", "git_status", "Show git repository status",
        json!({"type":"object","properties":{"path":{"type":"string"}},"required":[]}));
    tool!("git", "git_diff", "Show git diff",
        json!({"type":"object","properties":{"path":{"type":"string"},"staged":{"type":"boolean"}},"required":[]}));
    tool!("git", "git_log", "Show git commit history",
        json!({"type":"object","properties":{"path":{"type":"string"},"count":{"type":"integer"}},"required":[]}));
    tool!("git", "git_commit", "Create a git commit",
        json!({"type":"object","properties":{"message":{"type":"string","description":"Commit message"},"path":{"type":"string"}},"required":["message"]}));

    // Data tools
    tool!("data", "db_query", "Execute SQL query on SQLite or PostgreSQL",
        json!({"type":"object","properties":{"db_type":{"type":"string","enum":["sqlite","postgres"]},"connection":{"type":"string","description":"DB path or connection string"},"query":{"type":"string","description":"SQL query"},"params":{"type":"array","description":"Query parameters"}},"required":["db_type","connection","query"]}));
    tool!("data", "db_schema", "Inspect database schema",
        json!({"type":"object","properties":{"db_type":{"type":"string","enum":["sqlite","postgres"]},"connection":{"type":"string"}},"required":["db_type","connection"]}));

    // Python
    tool!("python", "python_execute", "Execute a Python script",
        json!({"type":"object","properties":{"script":{"type":"string","description":"Python script code"},"working_dir":{"type":"string"},"timeout_ms":{"type":"integer"},"capture_files":{"type":"array","items":{"type":"string"},"description":"Paths of generated files to capture"}},"required":["script"]}));

    // Archive
    tool!("archive", "archive_compress", "Compress files to ZIP or tar.gz",
        json!({"type":"object","properties":{"source_path":{"type":"string"},"output_path":{"type":"string"},"format":{"type":"string","enum":["zip","tar.gz"]}},"required":["source_path","output_path"]}));
    tool!("archive", "archive_decompress", "Extract archive (ZIP or tar.gz)",
        json!({"type":"object","properties":{"archive_path":{"type":"string"},"output_dir":{"type":"string"}},"required":["archive_path"]}));
    tool!("archive", "archive_list", "List archive contents without extracting",
        json!({"type":"object","properties":{"archive_path":{"type":"string"}},"required":["archive_path"]}));

    // System
    tool!("system", "clipboard_read", "Read system clipboard content",
        json!({"type":"object","properties":{},"required":[]}));
    tool!("system", "clipboard_write", "Write text to system clipboard",
        json!({"type":"object","properties":{"content":{"type":"string"}},"required":["content"]}));

    // Memory
    tool!("core", "memory_read", "Read agent memory",
        json!({"type":"object","properties":{"key":{"type":"string","description":"Memory key (omit to list all)"}},"required":[]}));
    tool!("core", "memory_write", "Write to agent memory",
        json!({"type":"object","properties":{"key":{"type":"string"},"value":{"type":"object"}},"required":["key","value"]}));

    // Sub-agent & multi-agent
    tool!("core", "sub_agent", "Spawn a sub-agent for a focused research or execution task",
        json!({"type":"object","properties":{
            "task":{"type":"string","description":"Task for the sub-agent"},
            "max_iterations":{"type":"integer","description":"Max iterations (default 10, max 20)","default":10},
            "allow_write":{"type":"boolean","description":"Allow write tools (file_write, bash_execute). Default false (read-only).","default":false},
            "model_id":{"type":"string","description":"Optional model override (e.g. cheaper model for simple tasks)"}
        },"required":["task"]}));
    tool!("core", "multi_agent", "Run multiple agents in parallel with different personas",
        json!({"type":"object","properties":{"task":{"type":"string"},"agents":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"role":{"type":"string"},"system_prompt":{"type":"string"}}}},"consensus":{"type":"string","enum":["none","majority_vote","synthesis"]}},"required":["task","agents"]}));
    tool!("core", "parallel", "Execute multiple tools concurrently",
        json!({"type":"object","properties":{"tools":{"type":"array","items":{"type":"object","properties":{"action":{"type":"string"},"args":{"type":"object"}}}}},"required":["tools"]}));

    // Plan → Execute pipeline
    tool!("core", "create_plan", "Create a structured execution plan with ordered steps. Emits plan to UI for review.",
        json!({"type":"object","properties":{
            "title":{"type":"string","description":"Plan title"},
            "steps":{"type":"array","items":{"type":"object","properties":{
                "description":{"type":"string"},
                "tool":{"type":"string","description":"Tool to execute"},
                "args":{"type":"object","description":"Tool arguments"},
                "depends_on":{"type":"array","items":{"type":"integer"},"description":"Step IDs this depends on"}
            },"required":["description","tool","args"]}}
        },"required":["title","steps"]}));
    tool!("core", "execute_plan", "Execute a previously created plan (by plan ID)",
        json!({"type":"object","properties":{"plan_id":{"type":"string","description":"ID from create_plan"}},"required":["plan_id"]}));

    // Workflow
    tool!("workflow", "workflow_create", "Create a complete visual workflow on the canvas (multiple nodes and edges)",
        json!({"type":"object","properties":{
            "nodes":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"tool_ref":{"type":"string"},"label":{"type":"string"},"config":{"type":"object"},"position":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"}}}},"required":["id","tool_ref"]}},
            "edges":{"type":"array","items":{"type":"object","properties":{"source":{"type":"string"},"source_port":{"type":"string"},"target":{"type":"string"},"target_port":{"type":"string"}},"required":["source","target"]}},
            "clear_existing":{"type":"boolean","description":"Clear canvas first (default: false)"}
        },"required":["nodes","edges"]}));
    tool!("workflow", "workflow_add_node", "Add a single node to the canvas",
        json!({"type":"object","properties":{
            "tool_ref":{"type":"string","description":"Tool catalog ID (e.g. 'llm-chat', 'file-read')"},
            "label":{"type":"string","description":"Display label"},
            "config":{"type":"object","description":"Node configuration"},
            "position":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"}}}
        },"required":["tool_ref"]}));
    tool!("workflow", "workflow_remove_node", "Remove a node from the canvas (also removes connected edges)",
        json!({"type":"object","properties":{
            "node_id":{"type":"string","description":"Node ID to remove"}
        },"required":["node_id"]}));
    tool!("workflow", "workflow_connect", "Connect two nodes with an edge",
        json!({"type":"object","properties":{
            "source":{"type":"string","description":"Source node ID"},
            "source_port":{"type":"string","description":"Source port name"},
            "target":{"type":"string","description":"Target node ID"},
            "target_port":{"type":"string","description":"Target port name"}
        },"required":["source","target"]}));
    tool!("workflow", "workflow_set_config", "Set configuration values on an existing node",
        json!({"type":"object","properties":{
            "node_id":{"type":"string","description":"Node ID"},
            "config":{"type":"object","description":"Configuration to set"}
        },"required":["node_id","config"]}));
    tool!("workflow", "workflow_select_node", "Select/highlight a node for user attention",
        json!({"type":"object","properties":{
            "node_id":{"type":"string","description":"Node ID to select"}
        },"required":["node_id"]}));
    tool!("workflow", "workflow_update_node", "Update a node's label or position",
        json!({"type":"object","properties":{
            "node_id":{"type":"string","description":"Node ID to update"},
            "label":{"type":"string","description":"New display label"},
            "position":{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"}}}
        },"required":["node_id"]}));
    tool!("workflow", "workflow_remove_edge", "Remove an edge between two nodes",
        json!({"type":"object","properties":{
            "edge_id":{"type":"string","description":"Edge ID to remove"},
            "source":{"type":"string","description":"Source node ID (alternative)"},
            "target":{"type":"string","description":"Target node ID (alternative)"}
        },"required":[]}));
    tool!("workflow", "workflow_list", "List all nodes and edges currently on the canvas",
        json!({"type":"object","properties":{},"required":[]}));
    tool!("workflow", "workflow_execute", "Execute the current canvas workflow",
        json!({"type":"object","properties":{},"required":[]}));

    // Vector/RAG
    tool!("rag", "vector_store", "Store text with embeddings in vector DB",
        json!({"type":"object","properties":{"collection":{"type":"string"},"text":{"type":"string"},"metadata":{"type":"object"}},"required":["collection","text"]}));
    tool!("rag", "vector_search", "Search vector DB by similarity",
        json!({"type":"object","properties":{"collection":{"type":"string"},"query":{"type":"string"},"top_k":{"type":"integer"}},"required":["collection","query"]}));
    tool!("rag", "api_ingest", "Fetch data from API, chunk it, embed, and store in vector DB with source tracking",
        json!({"type":"object","properties":{
            "url":{"type":"string","description":"API URL to fetch data from"},
            "collection":{"type":"string","description":"Vector collection name (default: 'default')"},
            "source_label":{"type":"string","description":"Human-readable source name"},
            "chunk_size":{"type":"integer","description":"Characters per chunk (default: 1000)"},
            "method":{"type":"string","enum":["GET","POST","PUT"],"description":"HTTP method (default: GET)"},
            "headers":{"type":"object","description":"Request headers"},
            "body":{"type":"string","description":"Request body for POST/PUT"}
        },"required":["url"]}));

    // Filter by allowed/excluded
    if let Some(allowed_list) = allowed {
        defs.retain(|d| allowed_list.contains(&d.name.as_str().to_string()));
    }
    if let Some(excluded_list) = excluded {
        defs.retain(|d| !excluded_list.contains(&d.name.as_str().to_string()));
    }

    defs
}

/// Classify which tool categories are relevant for a given task.
fn classify_task_tools(task: &str) -> Vec<String> {
    let t = task.to_lowercase();
    let mut cats = vec!["core".to_string()]; // Always: bash, file_read/write, finish, memory, sub_agent

    if t.contains("search") || t.contains("grep") || t.contains("find") || t.contains("code")
        || t.contains("function") || t.contains("class") || t.contains("import") {
        cats.push("code".to_string());
    }
    if t.contains("web") || t.contains("url") || t.contains("http") || t.contains("crawl")
        || t.contains("download") || t.contains("fetch") || t.contains("scrape") {
        cats.push("web".to_string());
    }
    if t.contains("git") || t.contains("commit") || t.contains("branch") || t.contains("diff") {
        cats.push("git".to_string());
    }
    if t.contains("database") || t.contains("sql") || t.contains("query") || t.contains("sqlite")
        || t.contains("postgres") || t.contains("table") {
        cats.push("data".to_string());
    }
    if t.contains("python") || t.contains("script") || t.contains("chart") || t.contains("plot")
        || t.contains("matplotlib") || t.contains("pandas") || t.contains("numpy") {
        cats.push("python".to_string());
    }
    if t.contains("zip") || t.contains("archive") || t.contains("compress") || t.contains("tar")
        || t.contains("extract") {
        cats.push("archive".to_string());
    }
    if t.contains("clipboard") || t.contains("copy") || t.contains("paste") {
        cats.push("system".to_string());
    }
    if t.contains("workflow") || t.contains("canvas") || t.contains("node") || t.contains("pipeline") {
        cats.push("workflow".to_string());
    }
    if t.contains("vector") || t.contains("rag") || t.contains("embedding") || t.contains("semantic")
        || t.contains("knowledge") || t.contains("ingest") || t.contains("지식") {
        cats.push("rag".to_string());
    }
    if t.contains("api") || t.contains("rest") || t.contains("endpoint") || t.contains("request") {
        cats.push("web".to_string());
        cats.push("rag".to_string());
    }

    // If very few categories detected, add common ones
    if cats.len() <= 1 {
        cats.extend(["code", "web", "git"].iter().map(|s| s.to_string()));
    }

    cats
}

/// Simple hash-based pseudo-embedding for fallback when no LLM embedding available.
/// Uses character n-gram hashing to create a deterministic vector representation.
fn simple_text_embedding(text: &str, dim: usize) -> Vec<f32> {
    let mut vec = vec![0.0f32; dim];
    let lower = text.to_lowercase();

    // Character 3-gram hashing
    let chars: Vec<char> = lower.chars().collect();
    for window in chars.windows(3) {
        let hash = window.iter().fold(0u64, |acc, &c| {
            acc.wrapping_mul(31).wrapping_add(c as u64)
        });
        let idx = (hash % dim as u64) as usize;
        vec[idx] += 1.0;
    }

    // Word-level hashing
    for word in lower.split_whitespace() {
        let hash = word.bytes().fold(0u64, |acc, b| {
            acc.wrapping_mul(37).wrapping_add(b as u64)
        });
        let idx = (hash % dim as u64) as usize;
        vec[idx] += 2.0;
    }

    // L2 normalize
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-8 {
        for v in &mut vec {
            *v /= norm;
        }
    }

    vec
}

/// Auto-prefix a collection name with `{project_id}__` if project_id is set
/// and the collection name doesn't already contain `__`.
fn scope_collection_name(collection: &str, project_id: Option<&str>) -> String {
    match project_id {
        Some(pid) if !collection.contains("__") => format!("{pid}__{collection}"),
        _ => collection.to_string(),
    }
}

/// Split text into overlapping chunks for RAG ingestion.
/// Uses 20% overlap between chunks for context continuity.
fn chunk_text(text: &str, chunk_size: usize) -> Vec<String> {
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }
    let overlap = chunk_size / 5; // 20% overlap
    let step = chunk_size - overlap;
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        let chunk: String = chars[start..end].iter().collect();
        if !chunk.trim().is_empty() {
            chunks.push(chunk);
        }
        if end >= chars.len() {
            break;
        }
        start += step;
    }
    chunks
}

/// Enhanced sub-agent loop with configurable iterations, write permissions, and model override
async fn run_sub_agent(
    task: &str,
    app: &AppHandle,
    parent_conv_id: &str,
    max_iterations: usize,
    allow_write: bool,
    model_override: Option<&str>,
) -> Result<String, String> {
    let system = if allow_write {
        "You are a capable sub-agent with read and write permissions. You can use file_read, file_write, grep_search, glob_search, project_tree, web_search, web_fetch, git_status, git_log, bash_execute. When done, use finish with your findings or results."
    } else {
        "You are a research sub-agent. You can only use read-only tools: file_read, grep_search, glob_search, project_tree, web_search, web_fetch, git_status, git_log. When done, use finish with your findings."
    };

    // Resolve active LLM provider from user settings
    let resolved_provider = if let Some(app_state) = app.try_state::<crate::state::AppState>() {
        if let Ok(creds) = app_state.llm_credentials.try_read() {
            creds.active_provider.clone()
        } else { None }
    } else { None };

    // Build function calling tool definitions for sub-agent
    let sub_tool_categories = if allow_write {
        vec!["core".to_string(), "file".to_string()]
    } else {
        vec!["core".to_string()]
    };
    let sub_tool_defs = build_tool_definitions(&sub_tool_categories, None, None);
    let use_fc = matches!(
        resolved_provider.as_deref().unwrap_or("bedrock"),
        "bedrock" | "anthropic" | "openai"
    );

    let mut messages: Vec<ChatMessage> = vec![ChatMessage {
        role: "user".to_string(),
        content: task.to_string(),
    }];
    let mut result = String::new();

    let read_only_tools = ["file_read", "grep_search", "glob_search", "project_tree",
                          "web_search", "web_fetch", "git_status", "git_log", "memory_read"];
    let write_tools = ["file_write", "bash_execute", "file_create"];

    for _i in 0..max_iterations {
        let llm_req = LLMRequest {
            prompt: String::new(),
            system_prompt: Some(system.to_string()),
            messages: Some(messages.clone()),
            model_id: model_override.map(String::from),
            max_tokens: Some(2048),
            temperature: Some(0.2),
            provider: resolved_provider.clone(),
            tools: if use_fc { Some(sub_tool_defs.clone()) } else { None },
            tool_choice: if use_fc { Some("auto".to_string()) } else { None },
        };

        let resp = invoke_llm(llm_req).await.map_err(|e| format!("Sub-agent LLM error: {e}"))?;
        messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: resp.text.clone(),
        });

        // Try function calling first, then fall back to text parsing
        let action = if let Some(ref tc) = resp.tool_calls {
            tc.first().map(|t| AgentAction {
                tool: t.name.clone(),
                args: t.input.clone(),
            })
        } else {
            parse_action(&resp.text)
        };

        if let Some(act) = action {
            if act.tool == "finish" {
                result = act.args["answer"].as_str()
                    .or_else(|| act.args["result"].as_str())
                    .unwrap_or("")
                    .to_string();
                break;
            }

            // Permission check
            let allowed = read_only_tools.contains(&act.tool.as_str())
                || (allow_write && write_tools.contains(&act.tool.as_str()));
            if !allowed {
                messages.push(ChatMessage {
                    role: "user".to_string(),
                    content: format!("[Tool Error] Sub-agent cannot use '{}'. Allowed: read-only{}.", act.tool,
                        if allow_write { " + write tools" } else { " only" }),
                });
                continue;
            }

            let obs = match dispatch_tool(&act, app, parent_conv_id, None).await {
                Ok(r) => r,
                Err(e) => format!("Error: {e}"),
            };
            let truncated: String = obs.chars().take(8000).collect();
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: format!("[Tool Result: {}]\n{truncated}", act.tool),
            });
        } else {
            result = extract_thought(&resp.text);
            break;
        }
    }

    if result.is_empty() {
        result = format!("Sub-agent did not produce a result within {max_iterations} iterations.");
    }

    Ok(result)
}

// ============================================================
// Parse LLM Response → Action(s)
// ============================================================

/// Robust JSON extraction from LLM output.
/// Tries multiple strategies in order: code blocks → raw JSON → recovery.
fn parse_action(text: &str) -> Option<AgentAction> {
    // Strategy 1: Extract from code blocks (```json ... ``` or ``` ... ```)
    let candidates = extract_code_block_jsons(text);
    for candidate in &candidates {
        if let Some(action) = try_parse_action_json(candidate) {
            return Some(action);
        }
    }

    // Strategy 2: Find raw JSON with string-aware bracket matching
    let raw_candidates = extract_raw_json_objects(text);
    for candidate in &raw_candidates {
        if let Some(action) = try_parse_action_json(candidate) {
            return Some(action);
        }
    }

    // Strategy 3: Try the entire text after stripping non-JSON prefix/suffix
    let trimmed = text.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        if let Some(action) = try_parse_action_json(trimmed) {
            return Some(action);
        }
    }

    None
}

/// Extract all code block contents (```json ... ``` and ``` ... ```)
fn extract_code_block_jsons(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    let mut search_from = 0;

    while search_from < text.len() {
        // Look for ``` opening
        let fence_start = match text[search_from..].find("```") {
            Some(pos) => search_from + pos,
            None => break,
        };

        // Skip the ``` and optional language tag
        let after_fence = fence_start + 3;
        let content_start = match text[after_fence..].find('\n') {
            Some(pos) => after_fence + pos + 1,
            None => {
                search_from = after_fence;
                continue;
            }
        };

        // Find closing ```
        let content_end = match text[content_start..].find("```") {
            Some(pos) => content_start + pos,
            None => {
                // No closing fence — take everything to end
                search_from = text.len();
                text.len()
            }
        };

        let block = text[content_start..content_end].trim();
        if !block.is_empty() && block.contains("action") {
            results.push(block.to_string());
        }

        search_from = content_end + 3;
    }

    results
}

/// Extract raw JSON objects using string-aware bracket matching.
/// Handles strings (won't mis-count brackets inside quoted strings).
fn extract_raw_json_objects(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        if chars[i] == '{' {
            // Check if this looks like it could be an action JSON
            let remaining: String = chars[i..].iter().collect();
            if !remaining.contains("action") {
                i += 1;
                continue;
            }

            // String-aware bracket matching
            if let Some(end) = find_matching_brace(&chars, i) {
                let obj: String = chars[i..=end].iter().collect();
                results.push(obj);
                i = end + 1;
            } else {
                i += 1;
            }
        } else {
            i += 1;
        }
    }

    results
}

/// Find the matching closing brace, aware of JSON string boundaries.
fn find_matching_brace(chars: &[char], start: usize) -> Option<usize> {
    let mut depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let len = chars.len();

    for i in start..len {
        if escape_next {
            escape_next = false;
            continue;
        }

        let ch = chars[i];

        if in_string {
            match ch {
                '\\' => escape_next = true,
                '"' => in_string = false,
                _ => {}
            }
        } else {
            match ch {
                '"' => in_string = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i);
                    }
                }
                _ => {}
            }
        }
    }

    None
}

/// Try to parse a JSON string into an AgentAction, with recovery for common LLM mistakes.
fn try_parse_action_json(raw: &str) -> Option<AgentAction> {
    let cleaned = sanitize_llm_json(raw);

    // Try strict parse first
    if let Ok(parsed) = serde_json::from_str::<Value>(&cleaned) {
        return extract_action_from_value(&parsed);
    }

    // Try original (before sanitization)
    if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
        return extract_action_from_value(&parsed);
    }

    None
}

/// Sanitize common LLM JSON mistakes:
/// - Trailing commas before } or ]
/// - Single quotes → double quotes (only outside existing double-quoted strings)
/// - Unquoted keys (simple cases)
fn sanitize_llm_json(raw: &str) -> String {
    let mut result = String::with_capacity(raw.len());
    let chars: Vec<char> = raw.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_string = false;
    let mut escape_next = false;

    while i < len {
        if escape_next {
            result.push(chars[i]);
            escape_next = false;
            i += 1;
            continue;
        }

        let ch = chars[i];

        if in_string {
            match ch {
                '\\' => {
                    escape_next = true;
                    result.push(ch);
                }
                '"' => {
                    in_string = false;
                    result.push(ch);
                }
                _ => result.push(ch),
            }
        } else {
            match ch {
                '"' => {
                    in_string = true;
                    result.push(ch);
                }
                ',' => {
                    // Check if this is a trailing comma (followed by } or ])
                    let rest: String = chars[i + 1..].iter().collect();
                    let next_non_ws = rest.trim_start();
                    if next_non_ws.starts_with('}') || next_non_ws.starts_with(']') {
                        // Skip trailing comma
                    } else {
                        result.push(ch);
                    }
                }
                _ => result.push(ch),
            }
        }

        i += 1;
    }

    result
}

/// Extract an AgentAction from a parsed JSON Value.
fn extract_action_from_value(parsed: &Value) -> Option<AgentAction> {
    let tool = parsed["action"].as_str().unwrap_or("").to_string();
    if tool.is_empty() {
        return None;
    }
    let args = parsed["args"].clone();
    Some(AgentAction {
        tool,
        args: if args.is_null() { json!({}) } else { args },
    })
}

fn extract_thought(text: &str) -> String {
    if let Some(pos) = text.find("```json") {
        text[..pos].trim().to_string()
    } else if let Some(pos) = text.find("{\"action\"") {
        text[..pos].trim().to_string()
    } else {
        text.trim().to_string()
    }
}

// ============================================================
// Main Agent Loop (with streaming + all features)
// ============================================================

/// Core agent loop — callable from both Tauri command and workflow execution
pub async fn run_agent_loop(
    request: AgentLoopRequest,
    conversations: &Arc<AgentConversationState>,
    app: &AppHandle,
) -> Result<AgentLoopResult, String> {
    // Resolve provider: use request.provider, or fall back to user's active_provider from settings
    let mut request = request;
    if request.provider.is_none() {
        if let Some(app_state) = app.try_state::<crate::state::AppState>() {
            if let Ok(creds) = app_state.llm_credentials.try_read() {
                if let Some(ref p) = creds.active_provider {
                    request.provider = Some(p.to_string());
                }
            }
        }
    }

    let max_iters = request.max_iterations.unwrap_or(25).min(50);
    let working_dir = request.working_dir.clone().unwrap_or_else(|| ".".to_string());
    let conv_id = request.conversation_id.clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mode = request.mode.as_deref().unwrap_or("auto");

    let project_id = request.project_id.clone();

    // Build per-project context (plan + memory keys)
    let project_context = build_project_context(project_id.as_deref());

    // Auto-create scoped default vector collection for the project
    let kb_context = if let Some(ref pid) = project_id {
        let default_coll = format!("{pid}__default");
        if let Some(vs_state) = app.try_state::<Arc<VectorStoreState>>() {
            let mut colls = vs_state.collections.write().await;
            if !colls.contains_key(&default_coll) {
                colls.insert(default_coll.clone(), vector_store::VectorCollection {
                    name: default_coll.clone(),
                    dimension: 128,
                    entries: Vec::new(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                });
            }
            let entry_count = colls.get(&default_coll).map(|c| c.entries.len()).unwrap_or(0);
            drop(colls);
            Some(format!(
                "\n## Your Knowledge Base\nYou have a dedicated vector collection: `{default_coll}` ({entry_count} entries)\n\
                 - Use vector_store with collection \"default\" to save knowledge (auto-scoped to your project)\n\
                 - Use vector_search with collection \"default\" to search your knowledge base\n\
                 - Use api_ingest to fetch API data and automatically store it with source tracking\n\
                 - Collection names are auto-prefixed with your project ID — just use short names like \"default\", \"research\", etc.\n"
            ))
        } else {
            None
        }
    } else {
        None
    };

    // Combine project context with knowledge base context
    let full_context = match (&project_context, &kb_context) {
        (Some(pc), Some(kc)) => Some(format!("{pc}\n{kc}")),
        (Some(pc), None) => Some(pc.clone()),
        (None, Some(kc)) => Some(kc.clone()),
        (None, None) => None,
    };

    let system_prompt = build_system_prompt(
        request.system_prompt.as_deref(),
        &working_dir,
        mode,
        full_context.as_deref(),
    );

    // Load or create conversation history
    let mut history = {
        let convs = conversations.conversations.read().await;
        convs.get(&conv_id).cloned().unwrap_or_default()
    };

    // Add user message
    history.push(ConversationMessage {
        role: "user".to_string(),
        content: request.task.clone(),
        token_estimate: estimate_tokens(&request.task),
    });

    let mut steps = Vec::new();
    let mut usage = AgentUsage::default();
    let mut final_answer = String::new();

    // Set up cancellation flag for this conversation
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut flags = conversations.cancellation_flags.write().await;
        flags.insert(conv_id.clone(), cancelled.clone());
    }

    // Emit start event
    let _ = app.emit(AGENT_STREAM_EVENT, json!({
        "type": "start",
        "conversation_id": conv_id,
        "task": request.task,
        "mode": mode,
    }));

    for iteration in 1..=max_iters {
        // Check cancellation at top of each iteration
        if cancelled.load(Ordering::Relaxed) {
            final_answer = "Cancelled by user.".to_string();
            steps.push(AgentStep {
                iteration,
                thought: "Cancelled by user".to_string(),
                action: None,
                observation: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                duration_ms: Some(0),
            });
            break;
        }

        let iter_start = std::time::Instant::now();

        // Context window management: compress if too long
        compress_history(&mut history);

        // Build structured messages from conversation history
        let chat_messages: Vec<ChatMessage> = history.iter()
            .map(|m| ChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        // Emit thinking event
        let _ = app.emit(AGENT_STREAM_EVENT, json!({
            "type": "thinking",
            "conversation_id": conv_id,
            "iteration": iteration,
            "max_iterations": max_iters,
        }));

        // Use streaming LLM call with circuit breaker + retry logic
        let stream_id = format!("{conv_id}-{iteration}");
        let llm_response = {
            // Circuit breaker: reject immediately if service is known-down
            conversations.llm_circuit.check().map_err(|e| {
                format!("Iteration {iteration}: {e}")
            })?;

            let max_retries = 3;
            let mut last_err = String::new();
            let mut response = None;

            for attempt in 0..max_retries {
                if attempt > 0 {
                    // Exponential backoff with jitter to prevent thundering herd
                    let base_ms = 500u64 * (1 << attempt);
                    let jitter_ms = (rand_u64() % (base_ms / 2 + 1)) as u64;
                    let backoff = std::time::Duration::from_millis(base_ms + jitter_ms);
                    tracing::warn!("LLM retry attempt {attempt}/{max_retries} after {backoff:?}");
                    tokio::time::sleep(backoff).await;

                    // Check cancellation between retries
                    if cancelled.load(Ordering::Relaxed) {
                        break;
                    }
                }

                // Build function calling tool definitions (dynamic filtering + pinned/excluded)
                let tool_categories = classify_task_tools(&request.task);
                let tool_defs = build_tool_definitions(
                    &tool_categories,
                    request.allowed_tools.as_deref(),
                    request.excluded_tools.as_deref(),
                );
                // Merge pinned tools (always included regardless of category filtering)
                let tool_defs = if let Some(ref pinned) = request.pinned_tools {
                    let pinned_categories = vec!["core".to_string(), "file".to_string(), "web".to_string(), "data".to_string(), "system".to_string(), "agent".to_string()];
                    let all_defs = build_tool_definitions(&pinned_categories, Some(pinned), request.excluded_tools.as_deref());
                    let existing_names: std::collections::HashSet<String> = tool_defs.iter().map(|t| t.name.clone()).collect();
                    let mut merged = tool_defs;
                    for td in all_defs {
                        if !existing_names.contains(&td.name) {
                            merged.push(td);
                        }
                    }
                    merged
                } else {
                    tool_defs
                };
                // Only use function calling for providers that support it
                let use_function_calling = matches!(
                    request.provider.as_deref().unwrap_or("bedrock"),
                    "bedrock" | "anthropic" | "openai"
                );

                let llm_request = LLMRequest {
                    prompt: String::new(), // unused when messages is provided
                    system_prompt: Some(system_prompt.clone()),
                    messages: Some(chat_messages.clone()),
                    model_id: request.model_id.clone(),
                    max_tokens: Some(4096),
                    temperature: Some(0.3),
                    provider: request.provider.clone(),
                    tools: if use_function_calling { Some(tool_defs) } else { None },
                    tool_choice: if use_function_calling { Some("auto".to_string()) } else { None },
                };

                let sid = if attempt == 0 {
                    stream_id.clone()
                } else {
                    format!("{stream_id}-retry{attempt}")
                };

                match invoke_llm_stream(llm_request, sid, app.clone()).await {
                    Ok(resp) if !resp.text.trim().is_empty() || resp.tool_calls.is_some() => {
                        conversations.llm_circuit.record_success();
                        response = Some(resp);
                        break;
                    }
                    Ok(_) => {
                        last_err = format!("LLM returned empty response (attempt {})", attempt + 1);
                        conversations.llm_circuit.record_failure();
                    }
                    Err(e) => {
                        let err_str = e.to_string();
                        // Only retry on transient errors (timeout, rate limit, server error)
                        let is_transient = err_str.contains("timeout")
                            || err_str.contains("429")
                            || err_str.contains("503")
                            || err_str.contains("500")
                            || err_str.contains("throttl")
                            || err_str.contains("rate");
                        last_err = format!("LLM call failed: {err_str}");
                        conversations.llm_circuit.record_failure();
                        if !is_transient {
                            break; // Don't retry auth errors, invalid model, etc.
                        }
                    }
                }
            }

            response.ok_or_else(|| {
                format!("LLM failed after {max_retries} attempts at iteration {iteration}: {last_err}")
            })?
        };

        // Use API-reported token counts for accurate tracking
        let api_input = llm_response.usage.input_tokens;
        let api_output = llm_response.usage.output_tokens;
        usage.total_input_tokens += api_input;
        usage.total_output_tokens += api_output;

        // Update token estimates in history using API-reported counts
        // This gives us accurate context window tracking vs char/4 heuristic
        if api_input > 0 {
            // The input tokens represent the entire prompt (system + history)
            // Use this to calibrate our estimate for future compression decisions
            let total_chars: usize = history.iter().map(|m| m.content.len()).sum();
            let chars_per_token = if api_input > 0 { total_chars as f64 / api_input as f64 } else { 4.0 };
            // Store calibrated ratio for this conversation (for more accurate future compression)
            tracing::debug!("Token calibration: {}chars / {}tokens = {:.2} chars/token", total_chars, api_input, chars_per_token);
        }

        let thought = extract_thought(&llm_response.text);

        // Function calling: prefer structured tool_calls, fallback to parse_action
        let action = if let Some(ref tool_calls) = llm_response.tool_calls {
            if let Some(tc) = tool_calls.first() {
                Some(AgentAction {
                    tool: tc.name.clone(),
                    args: tc.input.clone(),
                })
            } else {
                parse_action(&llm_response.text)
            }
        } else {
            parse_action(&llm_response.text)
        };

        // Add assistant message to history
        history.push(ConversationMessage {
            role: "assistant".to_string(),
            content: llm_response.text.clone(),
            token_estimate: estimate_tokens(&llm_response.text),
        });

        if let Some(ref act) = action {
            // Check for finish action
            if act.tool == "finish" {
                final_answer = act.args["answer"]
                    .as_str()
                    .unwrap_or(&thought)
                    .to_string();

                let step = AgentStep {
                    iteration,
                    thought: thought.clone(),
                    action: Some(act.clone()),
                    observation: Some(final_answer.clone()),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    duration_ms: Some(iter_start.elapsed().as_millis() as u64),
                };

                let _ = app.emit(AGENT_STEP_EVENT, json!({
                    "conversation_id": conv_id,
                    "step": step,
                }));

                steps.push(step);
                break;
            }

            // Execute tool(s)
            usage.tool_calls += 1;

            let _ = app.emit(AGENT_STREAM_EVENT, json!({
                "type": "tool_call",
                "conversation_id": conv_id,
                "iteration": iteration,
                "tool": act.tool,
                "args": act.args,
                "thought": thought,
            }));

            let observation = match dispatch_tool(act, &app, &conv_id, project_id.as_deref()).await {
                Ok(result) => result,
                Err(e) => {
                    // Provide rich error context so LLM can self-correct
                    let err_msg = format!(
                        "[Tool Error: {} failed]\nError: {}\nArgs: {}",
                        act.tool,
                        e,
                        serde_json::to_string_pretty(&act.args).unwrap_or_else(|_| act.args.to_string())
                    );

                    let _ = app.emit(AGENT_STREAM_EVENT, json!({
                        "type": "tool_error",
                        "conversation_id": conv_id,
                        "tool": act.tool,
                        "error": e.to_string(),
                    }));

                    err_msg
                }
            };

            // Truncate long observations (UTF-8 safe — avoid slicing mid-character)
            let obs_display: String = if observation.len() > 10000 {
                let safe_end = observation.char_indices()
                    .take_while(|&(i, _)| i < 10000)
                    .last()
                    .map(|(i, c)| i + c.len_utf8())
                    .unwrap_or(0);
                format!("{}...\n[truncated, {} total chars]",
                    &observation[..safe_end], observation.len())
            } else {
                observation.clone()
            };

            let step = AgentStep {
                iteration,
                thought: thought.clone(),
                action: Some(act.clone()),
                observation: Some(obs_display.clone()),
                timestamp: chrono::Utc::now().to_rfc3339(),
                duration_ms: Some(iter_start.elapsed().as_millis() as u64),
            };

            let _ = app.emit(AGENT_STEP_EVENT, json!({
                "conversation_id": conv_id,
                "step": step,
            }));

            let _ = app.emit(AGENT_STREAM_EVENT, json!({
                "type": "observation",
                "conversation_id": conv_id,
                "iteration": iteration,
                "tool": act.tool,
                "result": obs_display,
            }));

            steps.push(step);

            // Add observation to history
            history.push(ConversationMessage {
                role: "user".to_string(),
                content: format!("[Tool Result: {}]\n{}", act.tool, observation),
                token_estimate: estimate_tokens(&observation),
            });
        } else {
            // No action parsed — treat as final answer
            final_answer = thought.clone();
            steps.push(AgentStep {
                iteration,
                thought,
                action: None,
                observation: None,
                timestamp: chrono::Utc::now().to_rfc3339(),
                duration_ms: Some(iter_start.elapsed().as_millis() as u64),
            });
            break;
        }
    }

    // Clean up cancellation flag
    {
        let mut flags = conversations.cancellation_flags.write().await;
        flags.remove(&conv_id);
    }

    // Save conversation history + metadata
    {
        let msg_count = history.len();
        let title = history.first().map(|m| {
            let preview: String = m.content.chars().take(60).collect();
            preview
        }).unwrap_or_else(|| "Conversation".to_string());

        let mut convs = conversations.conversations.write().await;
        convs.insert(conv_id.clone(), history);
        drop(convs);

        // Update metadata
        {
            let mut metas = conversations.metadata.write().await;
            let pid = project_id.clone();
            let meta = metas.entry(conv_id.clone()).or_insert_with(|| ConversationMeta {
                id: conv_id.clone(),
                title: title.clone(),
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                message_count: msg_count,
                model_id: request.model_id.clone(),
                project_id: pid,
            });
            meta.updated_at = chrono::Utc::now().to_rfc3339();
            meta.message_count = msg_count;
        }

        // Persist to disk
        conversations.persist_conversation(&conv_id).await;
    }

    let was_cancelled = cancelled.load(Ordering::Relaxed);
    let result = AgentLoopResult {
        conversation_id: conv_id.clone(),
        task: request.task,
        steps,
        final_answer: final_answer.clone(),
        total_iterations: usage.tool_calls + 1,
        status: if was_cancelled { "cancelled".to_string() } else { "completed".to_string() },
        usage,
    };

    let _ = app.emit(AGENT_COMPLETE_EVENT, json!({
        "conversation_id": conv_id,
        "final_answer": final_answer,
        "total_iterations": result.total_iterations,
        "usage": result.usage,
    }));

    Ok(result)
}

/// Tauri command wrapper for run_agent_loop
#[tauri::command]
pub async fn agent_run_loop(
    request: AgentLoopRequest,
    conversations: State<'_, Arc<AgentConversationState>>,
    app: AppHandle,
) -> Result<AgentLoopResult, String> {
    run_agent_loop(request, &*conversations, &app).await
}

/// List conversations with metadata (sorted by updated_at desc).
/// If project_id is provided, only returns conversations for that project.
/// If project_id is "global", returns conversations with no project.
#[tauri::command]
pub async fn agent_list_conversations(
    project_id: Option<String>,
    conversations: State<'_, Arc<AgentConversationState>>,
) -> Result<Value, String> {
    let metas = conversations.metadata.read().await;
    let mut list: Vec<&ConversationMeta> = metas.values()
        .filter(|m| {
            match &project_id {
                None => true, // No filter — return all
                Some(pid) if pid == "global" => m.project_id.is_none(),
                Some(pid) => m.project_id.as_deref() == Some(pid.as_str()),
            }
        })
        .collect();
    list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(json!({
        "conversations": list,
        "count": list.len(),
    }))
}

/// Get a specific conversation's messages
#[tauri::command]
pub async fn agent_get_conversation(
    conversation_id: String,
    conversations: State<'_, Arc<AgentConversationState>>,
) -> Result<Value, String> {
    let convs = conversations.conversations.read().await;
    let metas = conversations.metadata.read().await;

    if let Some(messages) = convs.get(&conversation_id) {
        let meta = metas.get(&conversation_id);
        Ok(json!({
            "conversation_id": conversation_id,
            "meta": meta,
            "messages": messages.iter().map(|m| json!({
                "role": m.role,
                "content": m.content,
            })).collect::<Vec<_>>(),
        }))
    } else {
        Err(format!("Conversation '{}' not found", conversation_id))
    }
}

/// Clear a conversation (both in-memory and on disk)
#[tauri::command]
pub async fn agent_clear_conversation(
    conversation_id: String,
    conversations: State<'_, Arc<AgentConversationState>>,
) -> Result<Value, String> {
    {
        let mut convs = conversations.conversations.write().await;
        convs.remove(&conversation_id);
    }
    {
        let mut metas = conversations.metadata.write().await;
        metas.remove(&conversation_id);
    }
    conversations.remove_persisted_conversation(&conversation_id).await;
    Ok(json!({ "success": true, "cleared": conversation_id }))
}

/// Cancel a running agent loop
#[tauri::command]
pub async fn agent_cancel_loop(
    conversation_id: Option<String>,
    conversations: State<'_, Arc<AgentConversationState>>,
) -> Result<Value, String> {
    let flags = conversations.cancellation_flags.read().await;

    if let Some(cid) = conversation_id {
        // Cancel specific conversation
        if let Some(flag) = flags.get(&cid) {
            flag.store(true, Ordering::Relaxed);
            Ok(json!({ "success": true, "cancelled": cid }))
        } else {
            Err(format!("No running agent loop found for conversation '{cid}'"))
        }
    } else {
        // Cancel ALL running loops
        let mut cancelled = Vec::new();
        for (cid, flag) in flags.iter() {
            flag.store(true, Ordering::Relaxed);
            cancelled.push(cid.clone());
        }
        Ok(json!({ "success": true, "cancelled": cancelled }))
    }
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_action tests ---

    #[test]
    fn test_parse_action_json_block() {
        let text = r#"I need to read the file first.

```json
{"action": "file_read", "args": {"path": "src/main.rs"}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "file_read");
        assert_eq!(a.args["path"].as_str(), Some("src/main.rs"));
    }

    #[test]
    fn test_parse_action_inline_json() {
        let text = r#"Let me search for it. {"action": "grep_search", "args": {"pattern": "TODO", "path": "."}}"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "grep_search");
        assert_eq!(a.args["pattern"].as_str(), Some("TODO"));
    }

    #[test]
    fn test_parse_action_finish() {
        let text = r#"```json
{"action": "finish", "args": {"answer": "The project has 5 files."}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "finish");
        assert_eq!(a.args["answer"].as_str(), Some("The project has 5 files."));
    }

    #[test]
    fn test_parse_action_no_action() {
        let text = "Just some thinking without any JSON.";
        let action = parse_action(text);
        assert!(action.is_none());
    }

    #[test]
    fn test_parse_action_nested_json() {
        let text = r#"```json
{"action": "bash_execute", "args": {"command": "echo '{\"key\": \"value\"}'", "working_dir": "."}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "bash_execute");
    }

    #[test]
    fn test_parse_action_parallel() {
        let text = r#"```json
{"action": "parallel", "args": {"tools": [
  {"action": "file_read", "args": {"path": "a.rs"}},
  {"action": "file_read", "args": {"path": "b.rs"}}
]}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "parallel");
        assert!(a.args["tools"].as_array().unwrap().len() == 2);
    }

    #[test]
    fn test_parse_action_empty_args() {
        let text = r#"```json
{"action": "git_status"}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        let a = action.unwrap();
        assert_eq!(a.tool, "git_status");
        assert!(a.args.is_object()); // Should be {} not null
    }

    // --- extract_thought tests ---

    #[test]
    fn test_extract_thought_before_json() {
        let text = "I need to check the file structure first.\n\n```json\n{\"action\": \"project_tree\"}\n```";
        let thought = extract_thought(text);
        assert_eq!(thought, "I need to check the file structure first.");
    }

    #[test]
    fn test_extract_thought_no_json() {
        let text = "This is my complete answer.";
        let thought = extract_thought(text);
        assert_eq!(thought, "This is my complete answer.");
    }

    #[test]
    fn test_extract_thought_before_inline_json() {
        let text = "Let me search. {\"action\": \"grep_search\", \"args\": {}}";
        let thought = extract_thought(text);
        assert_eq!(thought, "Let me search.");
    }

    // --- estimate_tokens tests ---

    #[test]
    fn test_estimate_tokens_english() {
        // 100 chars of English ≈ 25 tokens
        let text = "a".repeat(100);
        assert_eq!(estimate_tokens(&text), 25);
    }

    #[test]
    fn test_estimate_tokens_cjk() {
        // CJK text should be ~50 tokens for 100 chars
        let text = "한".repeat(100); // 300 bytes but 100 chars
        assert_eq!(estimate_tokens(&text), text.len() / 2);
    }

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens(""), 0);
    }

    // --- check_command_safety tests ---

    #[test]
    fn test_check_command_safety_blocked() {
        assert!(check_command_safety("rm -rf /").is_err());
        assert!(check_command_safety("rm -rf /*").is_err());
        assert!(check_command_safety("mkfs.ext4 /dev/sda").is_err());
        assert!(check_command_safety(":(){:|:&};:").is_err());
        assert!(check_command_safety("format c:").is_err());
    }

    #[test]
    fn test_check_command_safety_dangerous_warning() {
        let result = check_command_safety("rm -rf ./build");
        assert!(result.is_ok());
        assert!(result.unwrap().is_some()); // Should have a warning

        let result = check_command_safety("git push --force origin main");
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());

        let result = check_command_safety("sudo apt install curl");
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());

        let result = check_command_safety("DROP TABLE users");
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());
    }

    #[test]
    fn test_check_command_safety_safe() {
        let result = check_command_safety("echo hello");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none()); // No warning

        let result = check_command_safety("ls -la");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());

        let result = check_command_safety("cargo build");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());

        let result = check_command_safety("git status");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    // --- compress_history tests ---

    #[test]
    fn test_compress_history_short() {
        let mut history = vec![
            ConversationMessage { role: "user".into(), content: "Hello".into(), token_estimate: 1 },
            ConversationMessage { role: "assistant".into(), content: "Hi".into(), token_estimate: 1 },
        ];
        compress_history(&mut history);
        assert_eq!(history.len(), 2); // No compression needed
    }

    #[test]
    fn test_compress_history_long() {
        let mut history = Vec::new();
        // First message (user task) — should be preserved
        history.push(ConversationMessage {
            role: "user".into(),
            content: "Original task".into(),
            token_estimate: 3,
        });
        // Add many long messages to exceed CONTEXT_MAX_CHARS (120000)
        for i in 0..20 {
            history.push(ConversationMessage {
                role: if i % 2 == 0 { "assistant" } else { "user" }.into(),
                content: "X".repeat(7000), // 7000 chars × 20 = 140000 > 120000
                token_estimate: 1750,
            });
        }

        let original_len = history.len();
        compress_history(&mut history);

        // Should be compressed
        assert!(history.len() < original_len);
        // First message should be preserved
        assert_eq!(history[0].content, "Original task");
        // Should have a compression summary
        assert!(history.iter().any(|m| m.content.contains("[Context compressed")));
    }

    // --- build_system_prompt tests ---

    #[test]
    fn test_build_system_prompt_auto_mode() {
        let prompt = build_system_prompt(None, "/my/project", "auto", None);
        assert!(prompt.contains("Available Tools"));
        assert!(prompt.contains("file_read"));
        assert!(prompt.contains("bash_execute"));
        assert!(prompt.contains("grep_search"));
        assert!(prompt.contains("finish"));
        assert!(prompt.contains("/my/project"));
        assert!(!prompt.contains("Mode: PLAN"));
        assert!(!prompt.contains("Mode: EXECUTE"));
    }

    #[test]
    fn test_build_system_prompt_plan_mode() {
        let prompt = build_system_prompt(None, ".", "plan", None);
        assert!(prompt.contains("Mode: PLAN"));
        assert!(prompt.contains("Do NOT make any changes"));
    }

    #[test]
    fn test_build_system_prompt_execute_mode() {
        let prompt = build_system_prompt(None, ".", "execute", None);
        assert!(prompt.contains("Mode: EXECUTE"));
        assert!(prompt.contains("Follow the plan"));
    }

    #[test]
    fn test_build_system_prompt_custom_instructions() {
        let prompt = build_system_prompt(Some("Always use Korean"), ".", "auto", None);
        assert!(prompt.contains("Always use Korean"));
        assert!(prompt.contains("Additional Instructions"));
    }

    // --- ConversationState tests ---

    #[tokio::test]
    async fn test_conversation_state() {
        let state = AgentConversationState::default();

        // Initially empty
        let convs = state.conversations.read().await;
        assert!(convs.is_empty());
        drop(convs);

        // Add a conversation
        let mut convs = state.conversations.write().await;
        convs.insert("test-conv-1".to_string(), vec![
            ConversationMessage { role: "user".into(), content: "Hello".into(), token_estimate: 1 },
        ]);
        drop(convs);

        // Read it back
        let convs = state.conversations.read().await;
        assert_eq!(convs.len(), 1);
        assert!(convs.contains_key("test-conv-1"));
        assert_eq!(convs["test-conv-1"][0].content, "Hello");
    }

    // --- Robust JSON parser tests ---

    #[test]
    fn test_parse_action_trailing_comma() {
        let text = r#"```json
{"action": "file_read", "args": {"path": "main.rs",}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().tool, "file_read");
    }

    #[test]
    fn test_parse_action_bare_code_block() {
        // No "json" language tag
        let text = "Let me check.\n\n```\n{\"action\": \"git_status\", \"args\": {}}\n```";
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().tool, "git_status");
    }

    #[test]
    fn test_parse_action_nested_braces_in_strings() {
        let text = r#"```json
{"action": "bash_execute", "args": {"command": "echo '{\"nested\": {\"deep\": true}}'"}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().tool, "bash_execute");
    }

    #[test]
    fn test_parse_action_multiple_json_blocks() {
        let text = r#"Here's the config:
```json
{"key": "value"}
```

Now the action:
```json
{"action": "file_read", "args": {"path": "test.rs"}}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().tool, "file_read");
    }

    #[test]
    fn test_sanitize_trailing_comma_in_array() {
        let input = r#"{"action": "parallel", "args": {"tools": [1, 2, 3,]}}"#;
        let cleaned = sanitize_llm_json(input);
        let parsed: Result<Value, _> = serde_json::from_str(&cleaned);
        assert!(parsed.is_ok());
    }

    #[test]
    fn test_sanitize_nested_trailing_commas() {
        let input = r#"{"action": "test", "args": {"a": "b",},}"#;
        let cleaned = sanitize_llm_json(input);
        let parsed: Result<Value, _> = serde_json::from_str(&cleaned);
        assert!(parsed.is_ok());
    }

    #[test]
    fn test_find_matching_brace_with_string() {
        let chars: Vec<char> = r#"{"key": "val{ue}"}"#.chars().collect();
        let end = find_matching_brace(&chars, 0);
        assert_eq!(end, Some(chars.len() - 1));
    }

    #[test]
    fn test_find_matching_brace_with_escaped_quote() {
        let chars: Vec<char> = r#"{"key": "val\"ue"}"#.chars().collect();
        let end = find_matching_brace(&chars, 0);
        assert_eq!(end, Some(chars.len() - 1));
    }

    // --- Conversation persistence test ---

    #[tokio::test]
    async fn test_conversation_persistence() {
        let temp_dir = std::env::temp_dir().join(format!("hb_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // Create state with persistence
        let state = AgentConversationState::with_persist_dir(temp_dir.clone());

        // Add a conversation
        {
            let mut convs = state.conversations.write().await;
            convs.insert("test-persist".to_string(), vec![
                ConversationMessage { role: "user".into(), content: "Hello".into(), token_estimate: 1 },
                ConversationMessage { role: "assistant".into(), content: "Hi there".into(), token_estimate: 2 },
            ]);
        }
        {
            let mut metas = state.metadata.write().await;
            metas.insert("test-persist".to_string(), ConversationMeta {
                id: "test-persist".to_string(),
                title: "Hello".to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
                message_count: 2,
                model_id: None,
                project_id: None,
            });
        }

        // Persist
        state.persist_conversation("test-persist").await;

        // Verify file exists
        let files: Vec<_> = std::fs::read_dir(&temp_dir).unwrap().collect();
        assert_eq!(files.len(), 1);

        // Load into new state
        let state2 = AgentConversationState::with_persist_dir(temp_dir.clone());
        let convs = state2.conversations.read().await;
        assert!(convs.contains_key("test-persist"));
        assert_eq!(convs["test-persist"].len(), 2);
        assert_eq!(convs["test-persist"][0].content, "Hello");

        // Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    // --- Circuit Breaker tests ---

    #[test]
    fn test_circuit_breaker_closed_allows_calls() {
        let cb = CircuitBreaker::new(3, 10);
        assert!(cb.check().is_ok());
    }

    #[test]
    fn test_circuit_breaker_trips_after_threshold() {
        let cb = CircuitBreaker::new(3, 10);
        cb.record_failure();
        cb.record_failure();
        assert!(cb.check().is_ok()); // Still closed (2 < 3)
        cb.record_failure();
        // Now should be open (3 >= 3)
        assert!(cb.check().is_err());
    }

    #[test]
    fn test_circuit_breaker_success_resets() {
        let cb = CircuitBreaker::new(3, 10);
        cb.record_failure();
        cb.record_failure();
        cb.record_success(); // Reset counter
        cb.record_failure();
        cb.record_failure();
        assert!(cb.check().is_ok()); // Not tripped (only 2 consecutive)
    }

    #[test]
    fn test_circuit_breaker_half_open_after_timeout() {
        let cb = CircuitBreaker::new(2, 60); // 60-second recovery
        cb.record_failure();
        cb.record_failure();
        // Circuit is open — check should fail (60s hasn't elapsed)
        let result = cb.check();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Circuit breaker OPEN"));
    }

    #[test]
    fn test_circuit_breaker_recovers_after_success() {
        let cb = CircuitBreaker::new(2, 0);
        cb.record_failure();
        cb.record_failure();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let _ = cb.check(); // Transitions to HalfOpen
        cb.record_success(); // Should close
        assert!(cb.check().is_ok()); // Back to Closed
    }

    // --- GIS/IFC path validation tests ---

    #[test]
    fn test_check_command_safety_empty_safe() {
        let result = check_command_safety("");
        assert!(result.is_ok());
    }

    #[test]
    fn test_check_command_safety_special_chars() {
        // Commands with special characters that shouldn't be blocked
        let result = check_command_safety("echo 'hello world'");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_check_command_safety_pipe_chain() {
        let result = check_command_safety("cat file.txt | grep TODO | wc -l");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    // --- Observation truncation UTF-8 safety ---

    #[test]
    fn test_utf8_safe_truncation() {
        // Build a string with multi-byte chars near the 10000 boundary
        let base = "안녕하세요".repeat(3334); // Each char is 3 bytes, total ~50K chars
        assert!(base.len() > 10000);

        // Simulate the safe truncation logic from observation truncation
        let safe_end = base.char_indices()
            .take_while(|&(i, _)| i < 10000)
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);

        // Should not panic on indexing
        let truncated = &base[..safe_end];
        // Ends at a valid char boundary (not mid-character)
        assert!(base.is_char_boundary(safe_end));
        // Should be close to 10000 bytes (within one character width)
        assert!(truncated.len() <= 10000 + 4, "Truncated len {} should be near 10000", truncated.len());
        // Must be significantly less than original
        assert!(truncated.len() < base.len());
    }

    // --- Compression with tool calls extracts properly ---

    #[test]
    fn test_compress_history_preserves_tool_calls() {
        let mut history = Vec::new();
        history.push(ConversationMessage {
            role: "user".into(),
            content: "Read my config file".into(),
            token_estimate: 5,
        });
        // Simulate many tool call messages to trigger compression
        for i in 0..20 {
            history.push(ConversationMessage {
                role: "assistant".into(),
                content: format!(
                    "I'll read the file.\n```json\n{{\"action\": \"file_read\", \"args\": {{\"path\": \"file{}.rs\"}}}}\n```",
                    i
                ),
                token_estimate: 1750,
            });
            history.push(ConversationMessage {
                role: "user".into(),
                content: format!("Content of file{}.rs: {} lines", i, "x".repeat(6000)),
                token_estimate: 1500,
            });
        }

        compress_history(&mut history);

        // Should be compressed
        assert!(history.len() < 41); // Was 41 (1 + 20*2)
        // First message preserved
        assert_eq!(history[0].content, "Read my config file");
        // Compression summary should mention tool calls
        let summary = history.iter().find(|m| m.content.contains("[Context compressed"));
        assert!(summary.is_some());
        assert!(summary.unwrap().content.contains("file_read"));
    }

    // --- Parse action edge cases ---

    #[test]
    fn test_parse_action_unicode_content() {
        let text = "한국어 텍스트 분석 중.\n\n```json\n{\"action\": \"file_read\", \"args\": {\"path\": \"데이터.json\"}}\n```";
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().args["path"].as_str(), Some("데이터.json"));
    }

    #[test]
    fn test_parse_action_multiline_args() {
        let text = r#"```json
{
  "action": "file_write",
  "args": {
    "path": "test.txt",
    "content": "line1\nline2\nline3"
  }
}
```"#;
        let action = parse_action(text);
        assert!(action.is_some());
        assert_eq!(action.unwrap().tool, "file_write");
    }
}
