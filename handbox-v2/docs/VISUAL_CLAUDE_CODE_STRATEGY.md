# Handbox: Visual Claude Code 전략

## 비전

> **"Claude Code의 에이전트 작업을 시각적으로 표현하고, 수정하고, 재실행할 수 있는 플랫폼"**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           User's Natural Language                         │
│                    "이 프로젝트에 테스트 코드 추가해줘"                      │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Handbox Agent System                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │   Planner   │───▶│  Executor   │───▶│  Validator  │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│         │                  │                  │                          │
│         └──────────────────┼──────────────────┘                          │
│                            ▼                                              │
│              ┌─────────────────────────┐                                 │
│              │   Visual Trace Graph    │  ◀── 사용자가 여기서 수정 가능   │
│              │   (Editable Workflow)   │                                 │
│              └─────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Interactive Agent (2주)

### 1.1 역질문 시스템 (AskUserQuestion)

```typescript
// 노드 타입: user-input-choice
interface UserChoiceNode {
  type: 'user-choice'
  question: string
  options: {
    label: string
    description: string
    value: string
  }[]
  multiSelect: boolean
  timeout_ms?: number  // 자동 선택 타임아웃
}

// 워크플로우 실행 중 일시정지
interface ExecutionPause {
  node_id: string
  pause_type: 'user_choice' | 'confirmation' | 'error'
  data: UserChoiceNode | ConfirmationRequest
  resume_callback: (answer: unknown) => void
}
```

**UI 구현:**

```
┌────────────────────────────────────────────────────────┐
│  🤔 Agent Question                                      │
├────────────────────────────────────────────────────────┤
│                                                         │
│  "테스트 프레임워크를 선택해주세요:"                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ◉ Jest (Recommended)                            │   │
│  │   React 프로젝트에 가장 널리 사용되는 테스트 도구  │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ○ Vitest                                        │   │
│  │   Vite 기반 프로젝트에 최적화된 빠른 테스트 도구   │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ○ Mocha + Chai                                  │   │
│  │   유연하고 확장 가능한 전통적인 테스트 프레임워크  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [ 자동 선택: 30초 ] [ 선택 ]                           │
└────────────────────────────────────────────────────────┘
```

### 1.2 확인 요청 (Confirmation)

```rust
// 위험한 작업 전 확인
enum ConfirmationType {
    FileDelete { paths: Vec<PathBuf> },
    ShellCommand { command: String, risk_level: RiskLevel },
    GitPush { branch: String, remote: String },
    PackageInstall { packages: Vec<String> },
    NetworkRequest { url: String, method: String },
}

impl Agent {
    async fn request_confirmation(&self, action: ConfirmationType) -> Result<bool> {
        // UI에 확인 다이얼로그 표시
        let event = ConfirmationEvent {
            action_type: action.type_name(),
            description: action.describe(),
            risk_level: action.risk_level(),
            details: action.details(),
        };

        self.emit_event(AgentEvent::ConfirmationRequired(event)).await;
        self.wait_for_user_response().await
    }
}
```

---

## Phase 2: Full System Control Tools (3주)

### 2.1 로컬 MCP 도구 확장

```
┌─────────────────────────────────────────────────────────────┐
│                    Local MCP Tool Categories                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📁 File System          │  🖥️ System Control               │
│  ├─ file-read            │  ├─ bash-execute                 │
│  ├─ file-write           │  ├─ process-list                 │
│  ├─ file-edit (diff)     │  ├─ process-kill                 │
│  ├─ file-delete          │  ├─ env-get/set                  │
│  ├─ glob-search          │  └─ system-info                  │
│  ├─ grep-search          │                                   │
│  └─ directory-tree       │  📦 Package Management            │
│                          │  ├─ npm-install                   │
│  🌐 Web/Network          │  ├─ pip-install                   │
│  ├─ web-search           │  ├─ cargo-add                     │
│  ├─ web-fetch            │  ├─ apt-install (Linux)           │
│  ├─ web-crawl            │  ├─ brew-install (macOS)          │
│  ├─ download-file        │  └─ winget-install (Windows)      │
│  └─ api-request          │                                   │
│                          │  🔧 Git Operations                 │
│  📊 Data Processing      │  ├─ git-status                    │
│  ├─ json-transform       │  ├─ git-diff                      │
│  ├─ csv-process          │  ├─ git-commit                    │
│  ├─ xml-parse            │  ├─ git-push                      │
│  └─ regex-extract        │  └─ git-branch                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 bash-execute 구현

```rust
// crates/hb-tool-executor/src/system/bash.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct BashConfig {
    /// Working directory (default: current workflow directory)
    pub cwd: Option<PathBuf>,
    /// Timeout in milliseconds (default: 120000 = 2 min)
    pub timeout_ms: u64,
    /// Run in background
    pub background: bool,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// Allowed commands whitelist (security)
    pub allowed_commands: Option<Vec<String>>,
}

pub async fn execute_bash(
    command: &str,
    config: &BashConfig,
) -> Result<BashOutput, ExecutorError> {
    // Security check
    if let Some(whitelist) = &config.allowed_commands {
        let cmd_name = command.split_whitespace().next().unwrap_or("");
        if !whitelist.iter().any(|c| c == cmd_name || c == "*") {
            return Err(ExecutorError::PermissionDenied(
                format!("Command '{}' not in whitelist", cmd_name)
            ));
        }
    }

    // Platform-specific shell
    let shell = if cfg!(windows) { "cmd" } else { "sh" };
    let shell_arg = if cfg!(windows) { "/C" } else { "-c" };

    let mut cmd = Command::new(shell);
    cmd.arg(shell_arg).arg(command);

    if let Some(cwd) = &config.cwd {
        cmd.current_dir(cwd);
    }

    for (key, value) in &config.env {
        cmd.env(key, value);
    }

    cmd.stdout(Stdio::piped())
       .stderr(Stdio::piped());

    let child = cmd.spawn()?;

    let output = tokio::time::timeout(
        Duration::from_millis(config.timeout_ms),
        child.wait_with_output()
    ).await??;

    Ok(BashOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
        duration_ms: /* measure */,
    })
}
```

### 2.3 패키지 설치 도구

```rust
// crates/hb-tool-executor/src/system/package.rs

pub enum PackageManager {
    Npm,
    Pip,
    Cargo,
    Apt,
    Brew,
    Winget,
}

impl PackageManager {
    pub fn detect() -> Vec<Self> {
        let mut available = vec![];

        if which::which("npm").is_ok() { available.push(Self::Npm); }
        if which::which("pip").is_ok() { available.push(Self::Pip); }
        if which::which("cargo").is_ok() { available.push(Self::Cargo); }

        #[cfg(target_os = "linux")]
        if which::which("apt").is_ok() { available.push(Self::Apt); }

        #[cfg(target_os = "macos")]
        if which::which("brew").is_ok() { available.push(Self::Brew); }

        #[cfg(target_os = "windows")]
        if which::which("winget").is_ok() { available.push(Self::Winget); }

        available
    }

    pub async fn install(&self, packages: &[String]) -> Result<InstallResult> {
        match self {
            Self::Npm => {
                execute_bash(&format!("npm install {}", packages.join(" ")), &default_config()).await
            }
            Self::Pip => {
                execute_bash(&format!("pip install {}", packages.join(" ")), &default_config()).await
            }
            // ... other managers
        }
    }
}
```

### 2.4 웹 크롤링 & 다운로드

```rust
// crates/hb-tool-executor/src/web/crawl.rs

pub async fn web_crawl(url: &str, config: &CrawlConfig) -> Result<CrawlResult> {
    let html = reqwest::get(url).await?.text().await?;

    // HTML → Markdown 변환
    let markdown = html2md::parse_html(&html);

    // 링크 추출
    let links = extract_links(&html, url);

    // 다운로드 링크 감지 (exe, msi, dmg, deb, etc.)
    let download_links: Vec<_> = links.iter()
        .filter(|l| is_download_link(l))
        .collect();

    Ok(CrawlResult {
        content: markdown,
        links,
        download_links,
        title: extract_title(&html),
    })
}

pub async fn download_file(url: &str, dest: &Path) -> Result<DownloadResult> {
    // 진행률 표시 지원
    let response = reqwest::get(url).await?;
    let total_size = response.content_length();

    let mut file = File::create(dest)?;
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;

        // 진행률 이벤트 발생
        emit_progress(downloaded, total_size);
    }

    Ok(DownloadResult {
        path: dest.to_path_buf(),
        size: downloaded,
        checksum: compute_sha256(dest)?,
    })
}
```

---

## Phase 3: Visual Trace System (2주)

### 3.1 에이전트 실행 추적

```rust
// crates/hb-agent/src/trace.rs

#[derive(Debug, Serialize)]
pub struct AgentTrace {
    pub id: Uuid,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub initial_prompt: String,
    pub turns: Vec<TraceTurn>,
    pub status: TraceStatus,
}

#[derive(Debug, Serialize)]
pub struct TraceTurn {
    pub turn_number: u32,
    pub thought: Option<String>,      // Agent의 사고 과정
    pub tool_calls: Vec<TraceToolCall>,
    pub user_interaction: Option<UserInteraction>,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize)]
pub struct TraceToolCall {
    pub tool_ref: String,
    pub inputs: serde_json::Value,
    pub outputs: serde_json::Value,
    pub status: ExecutionStatus,
    pub duration_ms: i64,
}
```

### 3.2 Trace → Workflow 변환

```typescript
// frontend/src/services/TraceToWorkflow.ts

interface TraceToWorkflowOptions {
    // 연속된 동일 도구 호출을 하나로 병합
    mergeConsecutiveCalls: boolean
    // 실패한 시도들 포함
    includeFailedAttempts: boolean
    // 사용자 상호작용 노드 포함
    includeUserInteractions: boolean
}

function convertTraceToWorkflow(
    trace: AgentTrace,
    options: TraceToWorkflowOptions
): WorkflowSpec {
    const nodes: NodeEntry[] = []
    const edges: EdgeSpec[] = []

    let prevNodeId: string | null = null

    for (const turn of trace.turns) {
        for (const call of turn.tool_calls) {
            const nodeId = `node_${nodes.length}`

            // 도구 호출 → 노드 변환
            nodes.push({
                kind: 'primitive',
                id: nodeId,
                tool_ref: call.tool_ref,
                config: extractConfig(call.inputs),
                label: generateLabel(call),
            })

            // 이전 노드와 연결
            if (prevNodeId) {
                edges.push({
                    source_node: prevNodeId,
                    target_node: nodeId,
                    source_port: 'output',
                    target_port: 'input',
                })
            }

            prevNodeId = nodeId
        }

        // 사용자 상호작용 노드
        if (options.includeUserInteractions && turn.user_interaction) {
            // user-choice 노드 추가
        }
    }

    return {
        id: uuid(),
        name: `Workflow from "${trace.initial_prompt.slice(0, 50)}..."`,
        nodes,
        edges,
    }
}
```

### 3.3 Visual Trace UI

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Agent Trace Viewer                                    [Edit] [Re-run]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Initial Prompt: "이 프로젝트에 테스트 코드 추가해줘"                      │
│                                                                          │
│  Timeline:                                                               │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  Turn 1 ──┬── 🔍 glob-search("**/*.ts")           [234ms] ✅            │
│           │   → Found 45 files                                          │
│           │                                                              │
│           └── 📖 file-read("package.json")        [12ms]  ✅            │
│               → { "dependencies": {...} }                                │
│                                                                          │
│  Turn 2 ──┬── 🤔 Thinking...                                            │
│           │   "React 프로젝트이고 Vite를 사용중. Jest나 Vitest 중        │
│           │    선택이 필요..."                                           │
│           │                                                              │
│           └── ❓ user-choice                       [Waiting...]         │
│               "테스트 프레임워크를 선택해주세요"                          │
│               ┌─────────────────────────────────┐                        │
│               │ ◉ Vitest (Recommended)          │                        │
│               │ ○ Jest                          │                        │
│               └─────────────────────────────────┘                        │
│                                                                          │
│  Turn 3 ──┬── 🖥️ bash-execute("npm i -D vitest") [3421ms] ✅           │
│           │   → + vitest@1.2.0                                          │
│           │                                                              │
│           ├── ✏️ file-write("vitest.config.ts")   [5ms]   ✅            │
│           │                                                              │
│           └── ✏️ file-write("src/App.test.tsx")   [3ms]   ✅            │
│                                                                          │
│  Turn 4 ──── 🖥️ bash-execute("npm test")         [1523ms] ✅           │
│              → All tests passed (1 test)                                 │
│                                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Completed in 5.2s │ 6 tool calls │ 1 user interaction                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Workflow Generation Enhancement (2주)

### 4.1 LLM 기반 워크플로우 생성 개선

```rust
// crates/hb-compiler/src/llm_workflow_gen.rs

const WORKFLOW_GENERATION_PROMPT: &str = r#"
You are a workflow generation expert for Handbox.

Available tools:
{tool_catalog}

User request: {user_prompt}

Generate a workflow that accomplishes this task. Output JSON:
{
    "nodes": [...],
    "edges": [...],
    "reasoning": "Why this workflow structure was chosen",
    "alternatives": ["Other approaches that could work"],
    "questions": ["Clarifying questions if the request is ambiguous"]
}

Rules:
1. Use the minimum number of nodes necessary
2. Prefer parallel execution when possible
3. Include error handling for risky operations
4. Add user-choice nodes when multiple valid approaches exist
"#;

pub async fn generate_workflow_with_questions(
    prompt: &str,
    tool_catalog: &ToolCatalog,
    llm: &LLMClient,
) -> Result<WorkflowGenerationResult> {
    let response = llm.chat(
        &format_prompt(WORKFLOW_GENERATION_PROMPT, prompt, tool_catalog)
    ).await?;

    let result: WorkflowGenerationResult = serde_json::from_str(&response)?;

    // 질문이 있으면 사용자에게 먼저 물어봄
    if !result.questions.is_empty() {
        return Ok(WorkflowGenerationResult {
            status: GenerationStatus::NeedsClarification,
            questions: result.questions,
            ..result
        });
    }

    Ok(result)
}
```

### 4.2 템플릿 시스템

```typescript
// frontend/src/services/WorkflowTemplates.ts

interface WorkflowTemplate {
    id: string
    name: string
    description: string
    category: 'development' | 'data' | 'automation' | 'ai'
    parameters: TemplateParameter[]
    workflow: WorkflowSpec
}

const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
    {
        id: 'add-tests',
        name: 'Add Tests to Project',
        description: '프로젝트에 테스트 프레임워크 설치 및 기본 테스트 생성',
        category: 'development',
        parameters: [
            { name: 'framework', type: 'choice', options: ['jest', 'vitest', 'mocha'] },
            { name: 'coverage', type: 'boolean', default: true },
        ],
        workflow: { /* ... */ }
    },
    {
        id: 'code-review',
        name: 'Code Review Assistant',
        description: '변경된 파일을 분석하고 코드 리뷰 제공',
        category: 'development',
        parameters: [
            { name: 'strictness', type: 'choice', options: ['lenient', 'normal', 'strict'] },
        ],
        workflow: { /* ... */ }
    },
    {
        id: 'data-pipeline',
        name: 'Data Processing Pipeline',
        description: 'CSV/JSON 데이터 처리 및 변환',
        category: 'data',
        parameters: [
            { name: 'input_format', type: 'choice', options: ['csv', 'json', 'excel'] },
            { name: 'output_format', type: 'choice', options: ['csv', 'json', 'excel'] },
        ],
        workflow: { /* ... */ }
    },
]
```

---

## Phase 5: Security & Permissions (1주)

### 5.1 권한 시스템

```rust
// crates/hb-agent/src/security.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPermissions {
    /// File system access
    pub file_read: FilePermission,
    pub file_write: FilePermission,
    pub file_delete: FilePermission,

    /// Shell execution
    pub bash_execute: BashPermission,

    /// Network access
    pub network_outbound: NetworkPermission,
    pub network_download: DownloadPermission,

    /// Package management
    pub package_install: PackagePermission,

    /// Git operations
    pub git_read: bool,
    pub git_write: bool,
    pub git_push: GitPushPermission,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilePermission {
    Denied,
    WorkdirOnly,            // 작업 디렉토리만
    SpecificPaths(Vec<PathBuf>),
    AllowAll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BashPermission {
    Denied,
    WhitelistOnly(Vec<String>),  // 허용된 명령어만
    AskEveryTime,                 // 매번 확인
    AllowAll,
}

impl AgentPermissions {
    /// 권한 확인 - 허용되지 않으면 사용자에게 질문
    pub async fn check<T: PermissionCheck>(
        &self,
        action: &T,
        ui: &dyn UserInterface,
    ) -> Result<PermissionResult> {
        match action.check_permission(self) {
            PermissionCheckResult::Allowed => Ok(PermissionResult::Granted),
            PermissionCheckResult::Denied(reason) => {
                Err(PermissionError::Denied(reason))
            }
            PermissionCheckResult::NeedsApproval(details) => {
                // UI에 확인 요청
                let approved = ui.request_permission(&details).await?;
                if approved {
                    Ok(PermissionResult::GrantedOnce)
                } else {
                    Err(PermissionError::UserDenied)
                }
            }
        }
    }
}
```

### 5.2 감사 로그

```rust
// 모든 도구 호출 기록
pub struct AuditLog {
    pub entries: Vec<AuditEntry>,
}

pub struct AuditEntry {
    pub timestamp: DateTime<Utc>,
    pub execution_id: Uuid,
    pub tool_ref: String,
    pub action: String,
    pub inputs_hash: String,  // 민감 정보 제외
    pub outcome: AuditOutcome,
    pub user_approved: bool,
}
```

---

## 구현 우선순위 요약

```
Phase 1: Interactive Agent (2주)
├── user-choice 노드
├── confirmation 다이얼로그
└── 실행 일시정지/재개

Phase 2: System Control Tools (3주)
├── bash-execute (+ 보안)
├── package-install
├── web-crawl / download-file
└── git-* operations

Phase 3: Visual Trace (2주)
├── Trace 캡처 시스템
├── Trace → Workflow 변환
└── Trace Viewer UI

Phase 4: Workflow Generation (2주)
├── LLM 기반 생성 개선
├── 역질문 시스템
└── 템플릿 라이브러리

Phase 5: Security (1주)
├── 권한 시스템
├── 감사 로그
└── 샌드박스 모드

Total: 10주 (2.5개월)
```

---

## 최종 비전

```
사용자: "내 컴퓨터에 Python 개발 환경 세팅해줘"

Handbox Agent:
1. [system-info] OS 확인 → Windows 11
2. [web-search] "Python 최신 버전" → 3.12.2
3. [user-choice] "어떤 방식으로 설치할까요?"
   ├─ winget (추천)
   ├─ 공식 설치파일 다운로드
   └─ pyenv-win
4. [bash] winget install Python.Python.3.12
5. [bash] python --version → 3.12.2 ✅
6. [user-choice] "추가로 설치할 도구가 있나요?"
   ├─ VSCode
   ├─ PyCharm
   └─ 가상환경 (venv)
7. [bash] python -m venv .venv
8. [response] "Python 3.12.2 설치 완료! 가상환경도 생성했습니다."

──────────────────────────────────────────────────────
[Trace를 워크플로우로 저장] → "Python Setup" 템플릿 생성
[워크플로우 편집] → 조건 추가, 노드 변경
[재실행] → 다른 컴퓨터에서 동일 과정 반복
```

이것이 Handbox를 "Visual Claude Code"로 만드는 로드맵입니다.
