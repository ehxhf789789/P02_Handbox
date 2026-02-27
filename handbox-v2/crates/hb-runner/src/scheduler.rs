//! DAG Scheduler — partition nodes by level and execute each level in parallel.
//! Supports caching, retry policies, streaming status updates, and control flow nodes.

use crate::cache::{compute_cache_key, ExecutionCache};
use crate::retry::{compute_delay, should_retry};
use crate::RunnerError;
use chrono::Utc;
use hb_core::graph::{
    ConditionalSpec, EdgeKind, LoopSpec, NodeEntry, NodeSpec, SubgraphSpec, WorkflowSpec,
};
use hb_core::tool::RuntimeSpec;
use hb_core::trace::{ExecutionEnvironment, ExecutionRecord, ExecutionStatus, NodeSpan};
use hb_mcp::McpClient;
use hb_tool_executor::{execute, ToolInput};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

/// MCP client cache for reusing connections across executions.
type McpClientCache = Arc<Mutex<HashMap<String, Arc<Mutex<McpClient>>>>>;

/// Node status update event for streaming.
#[derive(Debug, Clone, serde::Serialize)]
pub struct NodeStatusEvent {
    pub execution_id: String,
    pub node_id: String,
    pub status: String, // "pending", "running", "completed", "failed", "cache_hit", "skipped"
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: Option<i64>,
}

/// Callback type for status updates.
pub type StatusCallback = Arc<dyn Fn(NodeStatusEvent) + Send + Sync>;

/// Execution context with optional features (Clone-able via Arc).
#[derive(Clone)]
pub struct ExecutionContext {
    pub mcp_cache: McpClientCache,
    pub execution_cache: Option<Arc<ExecutionCache>>,
    pub status_callback: Option<StatusCallback>,
    pub cancelled: Arc<std::sync::atomic::AtomicBool>,
    /// If true, stop execution immediately when any node fails.
    pub fail_fast: bool,
}

impl Default for ExecutionContext {
    fn default() -> Self {
        Self {
            mcp_cache: Arc::new(Mutex::new(HashMap::new())),
            execution_cache: None,
            status_callback: None,
            cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            fail_fast: true, // Default to stopping on first error
        }
    }
}

impl ExecutionContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cache(mut self, cache: Arc<ExecutionCache>) -> Self {
        self.execution_cache = Some(cache);
        self
    }

    pub fn with_status_callback<F>(mut self, callback: F) -> Self
    where
        F: Fn(NodeStatusEvent) + Send + Sync + 'static,
    {
        self.status_callback = Some(Arc::new(callback));
        self
    }

    /// Configure fail-fast behavior.
    pub fn with_fail_fast(mut self, fail_fast: bool) -> Self {
        self.fail_fast = fail_fast;
        self
    }

    fn emit_status(&self, event: NodeStatusEvent) {
        if let Some(cb) = &self.status_callback {
            cb(event);
        }
    }
}

/// Run a workflow DAG with topological level-based scheduling.
pub async fn run_dag(
    execution_id: Uuid,
    spec: &WorkflowSpec,
) -> Result<ExecutionRecord, RunnerError> {
    run_dag_with_context(execution_id, spec, ExecutionContext::default()).await
}

/// Run a workflow DAG with an optional MCP client cache (backward compat).
pub async fn run_dag_with_mcp(
    execution_id: Uuid,
    spec: &WorkflowSpec,
    mcp_cache: Option<McpClientCache>,
) -> Result<ExecutionRecord, RunnerError> {
    let mut ctx = ExecutionContext::default();
    if let Some(cache) = mcp_cache {
        ctx.mcp_cache = cache;
    }
    run_dag_with_context(execution_id, spec, ctx).await
}

/// Run a workflow DAG with full execution context.
pub async fn run_dag_with_context(
    execution_id: Uuid,
    spec: &WorkflowSpec,
    ctx: ExecutionContext,
) -> Result<ExecutionRecord, RunnerError> {
    let started_at = Utc::now();
    let total_nodes = spec.nodes.len() as u32;
    let ctx = Arc::new(ctx);

    if spec.nodes.is_empty() {
        return Ok(ExecutionRecord {
            execution_id,
            workflow_id: spec.id,
            started_at,
            completed_at: Some(Utc::now()),
            status: ExecutionStatus::Completed,
            total_nodes: 0,
            completed_nodes: 0,
            failed_nodes: 0,
            cache_hits: 0,
        });
    }

    // Build adjacency and in-degree maps
    let (adj, mut in_degree) = build_dag(spec);

    // Topological sort by levels (Kahn's algorithm)
    let levels = topo_levels(&adj, &mut in_degree, spec);

    let mut completed_nodes = 0u32;
    let mut failed_nodes = 0u32;
    let mut cache_hits = 0u32;
    let mut node_outputs: HashMap<String, serde_json::Value> = HashMap::new();

    // Execute level by level — nodes in the same level run in parallel
    for level in &levels {
        // Check for cancellation
        if ctx.cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            return Err(RunnerError::Cancelled);
        }

        let mut handles = Vec::new();

        for node_id in level {
            let node = spec.nodes.iter().find(|n| n.id() == node_id);
            let node_clone = node.cloned();
            let exec_id = execution_id;
            let nid = node_id.clone();
            let ctx_clone = ctx.clone();
            let edges = spec.edges.clone();

            // Emit pending status
            ctx.emit_status(NodeStatusEvent {
                execution_id: exec_id.to_string(),
                node_id: nid.clone(),
                status: "pending".into(),
                output: None,
                error: None,
                duration_ms: None,
            });

            // Gather inputs from upstream edges
            let mut inputs = serde_json::Map::new();
            for edge in &edges {
                if edge.target_node == *node_id && edge.kind == EdgeKind::Data {
                    tracing::debug!(
                        "[Scheduler] Edge: {} ({}) -> {} ({})",
                        edge.source_node, edge.source_port,
                        edge.target_node, edge.target_port
                    );
                    if let Some(val) = node_outputs.get(&edge.source_node) {
                        tracing::debug!(
                            "[Scheduler] Source output keys: {:?}",
                            val.as_object().map(|o| o.keys().collect::<Vec<_>>())
                        );
                        if let Some(port_val) = val.get(&edge.source_port) {
                            tracing::info!(
                                "[Scheduler] Mapped {} -> {} (len: {} chars)",
                                edge.source_port, edge.target_port,
                                port_val.as_str().map(|s| s.len()).unwrap_or(0)
                            );
                            inputs.insert(edge.target_port.clone(), port_val.clone());
                        } else {
                            tracing::warn!(
                                "[Scheduler] Port '{}' not found in output, using full output",
                                edge.source_port
                            );
                            inputs.insert(edge.target_port.clone(), val.clone());
                        }
                    } else {
                        tracing::warn!(
                            "[Scheduler] Source node '{}' output not found",
                            edge.source_node
                        );
                    }
                }
            }

            let input_json = serde_json::Value::Object(inputs);

            handles.push(tokio::spawn(async move {
                execute_node_entry(exec_id, &nid, node_clone.as_ref(), input_json, ctx_clone).await
            }));
        }

        // Await all tasks in this level
        for (i, handle) in handles.into_iter().enumerate() {
            match handle.await {
                Ok(Ok((span, output))) => {
                    let nid = &level[i];
                    node_outputs.insert(nid.clone(), output);
                    match span.status {
                        ExecutionStatus::Completed => completed_nodes += 1,
                        ExecutionStatus::CacheHit => {
                            completed_nodes += 1;
                            cache_hits += 1;
                        }
                        _ => failed_nodes += 1,
                    }
                }
                Ok(Err(_)) => failed_nodes += 1,
                Err(e) => {
                    tracing::error!("Task join error: {e}");
                    failed_nodes += 1;
                }
            }
        }

        // Fail-fast: stop execution if any node in this level failed
        if ctx.fail_fast && failed_nodes > 0 {
            tracing::warn!("Fail-fast: stopping execution after {} failure(s)", failed_nodes);
            break;
        }
    }

    let status = if failed_nodes > 0 {
        ExecutionStatus::Failed
    } else {
        ExecutionStatus::Completed
    };

    Ok(ExecutionRecord {
        execution_id,
        workflow_id: spec.id,
        started_at,
        completed_at: Some(Utc::now()),
        status,
        total_nodes,
        completed_nodes,
        failed_nodes,
        cache_hits,
    })
}

/// Execute a node entry (handles all node types).
#[async_recursion::async_recursion]
async fn execute_node_entry(
    execution_id: Uuid,
    node_id: &str,
    node: Option<&NodeEntry>,
    input_json: serde_json::Value,
    ctx: Arc<ExecutionContext>,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    // Emit running status
    ctx.emit_status(NodeStatusEvent {
        execution_id: execution_id.to_string(),
        node_id: node_id.to_string(),
        status: "running".into(),
        output: None,
        error: None,
        duration_ms: None,
    });

    let result = match node {
        Some(NodeEntry::Primitive(n)) => {
            execute_primitive_node(execution_id, node_id, n, input_json, ctx.clone()).await
        }
        Some(NodeEntry::Composite(n)) => {
            execute_composite_node(execution_id, node_id, n, input_json, ctx.clone()).await
        }
        Some(NodeEntry::Conditional(n)) => {
            execute_conditional_node(execution_id, node_id, n, input_json, ctx.clone()).await
        }
        Some(NodeEntry::Loop(n)) => {
            execute_loop_node(execution_id, node_id, n, input_json, ctx.clone()).await
        }
        None => {
            let err = "Node not found".to_string();
            let span = create_error_span(execution_id, node_id, &err);
            ctx.emit_status(NodeStatusEvent {
                execution_id: execution_id.to_string(),
                node_id: node_id.to_string(),
                status: "failed".into(),
                output: None,
                error: Some(err.clone()),
                duration_ms: None,
            });
            Ok((span, serde_json::json!({ "error": err })))
        }
    };

    // Emit completion status
    if let Ok((ref span, ref output)) = result {
        let status_str = match span.status {
            ExecutionStatus::Completed => "completed",
            ExecutionStatus::CacheHit => "cache_hit",
            ExecutionStatus::Failed => "failed",
            _ => "completed",
        };
        ctx.emit_status(NodeStatusEvent {
            execution_id: execution_id.to_string(),
            node_id: node_id.to_string(),
            status: status_str.into(),
            output: Some(output.clone()),
            error: span.error.clone(),
            duration_ms: span.duration_ms,
        });
    }

    result
}

/// Execute a primitive node with caching and retry support.
async fn execute_primitive_node(
    execution_id: Uuid,
    node_id: &str,
    node: &NodeSpec,
    input_json: serde_json::Value,
    ctx: Arc<ExecutionContext>,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    let started_at = Utc::now();
    let tool_ref = &node.tool_ref;
    let config_json = serde_json::Value::Object(node.config.clone());

    // Skip disabled nodes
    if node.disabled {
        let span = NodeSpan {
            span_id: Uuid::new_v4(),
            execution_id,
            node_id: node_id.into(),
            tool_ref: tool_ref.clone(),
            input_json: input_json.clone(),
            output_json: Some(serde_json::json!({})),
            config_json,
            started_at,
            completed_at: Some(Utc::now()),
            duration_ms: Some(0),
            status: ExecutionStatus::Skipped,
            error: None,
            cache_hit: false,
            environment: default_environment(),
        };
        return Ok((span, serde_json::json!({})));
    }

    // Check cache if enabled
    let cache_policy = node.cache.clone().unwrap_or_default();
    if cache_policy.enabled {
        if let Some(ref exec_cache) = ctx.execution_cache {
            let cache_key = compute_cache_key(tool_ref, &input_json, &config_json, None);
            if let Ok(Some(cached_output)) = exec_cache.lookup(&cache_key) {
                let span = NodeSpan {
                    span_id: Uuid::new_v4(),
                    execution_id,
                    node_id: node_id.into(),
                    tool_ref: tool_ref.clone(),
                    input_json,
                    output_json: Some(cached_output.clone()),
                    config_json,
                    started_at,
                    completed_at: Some(Utc::now()),
                    duration_ms: Some(0),
                    status: ExecutionStatus::CacheHit,
                    error: None,
                    cache_hit: true,
                    environment: default_environment(),
                };
                return Ok((span, cached_output));
            }
        }
    }

    // Execute with retry
    let retry_policy = node.retry.clone().unwrap_or_default();
    let mut attempt = 0u32;
    let mut last_error: String;

    loop {
        let (output, status, error, duration_ms) = if tool_ref.starts_with("mcp://") {
            execute_mcp_tool(tool_ref, &input_json, &config_json, ctx.mcp_cache.clone()).await
        } else {
            execute_native_tool(tool_ref, &input_json, &config_json).await
        };

        if status == ExecutionStatus::Completed {
            // Store in cache if enabled
            if cache_policy.enabled {
                if let Some(ref exec_cache) = ctx.execution_cache {
                    let cache_key = compute_cache_key(tool_ref, &input_json, &config_json, None);
                    let ttl = if cache_policy.ttl_secs > 0 {
                        Some(cache_policy.ttl_secs)
                    } else {
                        None
                    };
                    let _ = exec_cache.store(&cache_key, &output, ttl);
                }
            }

            let span = NodeSpan {
                span_id: Uuid::new_v4(),
                execution_id,
                node_id: node_id.into(),
                tool_ref: tool_ref.clone(),
                input_json,
                output_json: Some(output.clone()),
                config_json,
                started_at,
                completed_at: Some(Utc::now()),
                duration_ms: Some(duration_ms),
                status: ExecutionStatus::Completed,
                error: None,
                cache_hit: false,
                environment: default_environment(),
            };
            return Ok((span, output));
        }

        // Handle failure with retry
        last_error = error.unwrap_or_else(|| "Unknown error".into());

        if should_retry(&retry_policy, attempt) {
            let delay = compute_delay(&retry_policy, attempt);
            tracing::warn!(
                "Node {} failed (attempt {}), retrying in {:?}: {}",
                node_id,
                attempt + 1,
                delay,
                last_error
            );
            tokio::time::sleep(delay).await;
            attempt += 1;
        } else {
            break;
        }
    }

    // All retries exhausted
    let span = NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref: tool_ref.clone(),
        input_json,
        output_json: Some(serde_json::json!({ "error": &last_error })),
        config_json,
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some(0),
        status: ExecutionStatus::Failed,
        error: Some(last_error.clone()),
        cache_hit: false,
        environment: default_environment(),
    };
    Ok((span, serde_json::json!({ "error": last_error })))
}

/// Execute a composite node (sub-graph).
/// Executes subgraph nodes sequentially.
#[async_recursion::async_recursion]
async fn execute_composite_node(
    execution_id: Uuid,
    node_id: &str,
    node: &hb_core::graph::CompositeNodeSpec,
    input_json: serde_json::Value,
    ctx: Arc<ExecutionContext>,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    let started_at = Utc::now();
    let mut outputs = serde_json::Map::new();
    let mut all_completed = true;

    // Execute subgraph nodes sequentially (simplified - no DAG scheduling)
    for subnode in &node.subgraph.nodes {
        let node_input = input_json.clone();
        let result = execute_node_entry(
            execution_id,
            subnode.id(),
            Some(subnode),
            node_input,
            ctx.clone(),
        )
        .await;

        match result {
            Ok((span, output)) => {
                outputs.insert(subnode.id().to_string(), output);
                if span.status != ExecutionStatus::Completed && span.status != ExecutionStatus::CacheHit {
                    all_completed = false;
                }
            }
            Err(_) => {
                all_completed = false;
            }
        }
    }

    let output = serde_json::Value::Object(outputs);
    let (status, error) = if all_completed {
        (ExecutionStatus::Completed, None)
    } else {
        (ExecutionStatus::Failed, Some("Some subgraph nodes failed".into()))
    };

    let span = NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref: "composite".into(),
        input_json,
        output_json: Some(output.clone()),
        config_json: serde_json::json!({}),
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some((Utc::now() - started_at).num_milliseconds()),
        status,
        error,
        cache_hit: false,
        environment: default_environment(),
    };

    Ok((span, output))
}

/// Execute a conditional node (if/switch).
/// Executes branch nodes sequentially.
#[async_recursion::async_recursion]
async fn execute_conditional_node(
    execution_id: Uuid,
    node_id: &str,
    node: &ConditionalSpec,
    input_json: serde_json::Value,
    ctx: Arc<ExecutionContext>,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    let started_at = Utc::now();

    // Evaluate condition expression
    let condition_result = evaluate_condition(&node.condition_expr, &input_json);

    // Find matching branch
    let branch_subgraph: Option<&SubgraphSpec> = node
        .branches
        .iter()
        .find(|b| {
            if let Some(result) = &condition_result {
                &b.value == result
            } else {
                false
            }
        })
        .map(|b| &b.body)
        .or(node.default_branch.as_ref());

    let (output, status, error) = if let Some(subgraph) = branch_subgraph {
        // Execute branch nodes sequentially
        let mut outputs = serde_json::Map::new();
        let mut all_completed = true;

        for subnode in &subgraph.nodes {
            let result = execute_node_entry(
                execution_id,
                subnode.id(),
                Some(subnode),
                input_json.clone(),
                ctx.clone(),
            )
            .await;

            match result {
                Ok((span, out)) => {
                    outputs.insert(subnode.id().to_string(), out);
                    if span.status != ExecutionStatus::Completed && span.status != ExecutionStatus::CacheHit {
                        all_completed = false;
                    }
                }
                Err(_) => all_completed = false,
            }
        }

        if all_completed {
            (serde_json::Value::Object(outputs), ExecutionStatus::Completed, None)
        } else {
            (serde_json::Value::Object(outputs), ExecutionStatus::Failed, Some("Branch execution failed".into()))
        }
    } else {
        // No matching branch - skip
        (serde_json::json!({ "skipped": true }), ExecutionStatus::Skipped, None)
    };

    let span = NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref: "conditional".into(),
        input_json,
        output_json: Some(output.clone()),
        config_json: serde_json::json!({ "condition": &node.condition_expr }),
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some((Utc::now() - started_at).num_milliseconds()),
        status,
        error,
        cache_hit: false,
        environment: default_environment(),
    };

    Ok((span, output))
}

/// Execute a loop node (for_each, while, repeat).
/// Executes body nodes sequentially.
#[async_recursion::async_recursion]
async fn execute_loop_node(
    execution_id: Uuid,
    node_id: &str,
    node: &LoopSpec,
    input_json: serde_json::Value,
    ctx: Arc<ExecutionContext>,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    let started_at = Utc::now();
    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut iteration = 0u32;
    let mut all_completed = true;

    match node.kind {
        hb_core::graph::LoopKind::ForEach => {
            // Get items from input using items_expr
            let items = if let Some(ref expr) = node.items_expr {
                evaluate_jmespath(expr, &input_json).unwrap_or(serde_json::json!([]))
            } else {
                input_json
                    .get("items")
                    .cloned()
                    .unwrap_or(serde_json::json!([]))
            };

            if let Some(arr) = items.as_array() {
                for item in arr.iter().take(node.max_iterations as usize) {
                    let iter_input = serde_json::json!({ "item": item, "index": iteration });
                    let output = execute_subgraph_nodes(
                        execution_id,
                        &node.body,
                        iter_input,
                        ctx.clone(),
                        &mut all_completed,
                    )
                    .await;
                    results.push(output);
                    iteration += 1;
                }
            }
        }
        hb_core::graph::LoopKind::While => {
            while iteration < node.max_iterations {
                // Check condition
                if let Some(ref expr) = node.condition_expr {
                    let condition = evaluate_condition(expr, &input_json);
                    if condition != Some(serde_json::json!(true)) {
                        break;
                    }
                }

                let iter_input = serde_json::json!({ "iteration": iteration });
                let output = execute_subgraph_nodes(
                    execution_id,
                    &node.body,
                    iter_input,
                    ctx.clone(),
                    &mut all_completed,
                )
                .await;
                results.push(output);
                iteration += 1;
            }
        }
        hb_core::graph::LoopKind::Repeat => {
            for i in 0..node.max_iterations {
                let iter_input = serde_json::json!({ "iteration": i });
                let output = execute_subgraph_nodes(
                    execution_id,
                    &node.body,
                    iter_input,
                    ctx.clone(),
                    &mut all_completed,
                )
                .await;
                results.push(output);
            }
        }
    }

    let output = serde_json::json!({
        "results": results,
        "iterations": iteration
    });

    let (status, error) = if all_completed {
        (ExecutionStatus::Completed, None)
    } else {
        (ExecutionStatus::Failed, Some("Some loop iterations failed".into()))
    };

    let span = NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref: "loop".into(),
        input_json,
        output_json: Some(output.clone()),
        config_json: serde_json::json!({ "max_iterations": node.max_iterations }),
        started_at,
        completed_at: Some(Utc::now()),
        duration_ms: Some((Utc::now() - started_at).num_milliseconds()),
        status,
        error,
        cache_hit: false,
        environment: default_environment(),
    };

    Ok((span, output))
}

/// Execute subgraph nodes sequentially.
#[async_recursion::async_recursion]
async fn execute_subgraph_nodes(
    execution_id: Uuid,
    subgraph: &SubgraphSpec,
    input: serde_json::Value,
    ctx: Arc<ExecutionContext>,
    all_completed: &mut bool,
) -> serde_json::Value {
    let mut outputs = serde_json::Map::new();

    for subnode in &subgraph.nodes {
        let result = execute_node_entry(
            execution_id,
            subnode.id(),
            Some(subnode),
            input.clone(),
            ctx.clone(),
        )
        .await;

        match result {
            Ok((span, output)) => {
                outputs.insert(subnode.id().to_string(), output);
                if span.status != ExecutionStatus::Completed && span.status != ExecutionStatus::CacheHit {
                    *all_completed = false;
                }
            }
            Err(_) => {
                *all_completed = false;
            }
        }
    }

    serde_json::Value::Object(outputs)
}

/// Evaluate a JMESPath expression on input.
fn evaluate_jmespath(expr: &str, input: &serde_json::Value) -> Option<serde_json::Value> {
    // Simple JMESPath evaluation - for complex expressions, use jmespath crate
    if expr.starts_with("$.") {
        let path = expr.strip_prefix("$.").unwrap_or(expr);
        let mut current = input.clone();
        for part in path.split('.') {
            current = current.get(part)?.clone();
        }
        Some(current)
    } else {
        input.get(expr).cloned()
    }
}

/// Evaluate a condition expression.
fn evaluate_condition(expr: &str, input: &serde_json::Value) -> Option<serde_json::Value> {
    // Simple condition evaluation
    if let Some(value) = evaluate_jmespath(expr, input) {
        return Some(value);
    }

    // Try parsing as literal
    serde_json::from_str(expr).ok()
}

/// Execute a tool via Native runtime (hb-tool-executor).
async fn execute_native_tool(
    tool_ref: &str,
    input_json: &serde_json::Value,
    config_json: &serde_json::Value,
) -> (serde_json::Value, ExecutionStatus, Option<String>, i64) {
    let tool_input = ToolInput {
        tool_ref: tool_ref.to_string(),
        inputs: input_json.clone(),
        config: config_json.clone(),
    };

    let runtime = RuntimeSpec::Native;
    let exec_result = execute(&runtime, &tool_input).await;

    match exec_result {
        Ok(tool_output) => (
            tool_output.outputs,
            ExecutionStatus::Completed,
            None,
            tool_output.duration_ms as i64,
        ),
        Err(e) => {
            let err_msg = e.to_string();
            tracing::error!("Native tool execution failed: {err_msg}");
            (
                serde_json::json!({ "error": err_msg }),
                ExecutionStatus::Failed,
                Some(err_msg),
                0i64,
            )
        }
    }
}

/// Execute a tool via MCP runtime.
async fn execute_mcp_tool(
    tool_ref: &str,
    input_json: &serde_json::Value,
    _config_json: &serde_json::Value,
    mcp_cache: McpClientCache,
) -> (serde_json::Value, ExecutionStatus, Option<String>, i64) {
    let start = std::time::Instant::now();

    let stripped = tool_ref.strip_prefix("mcp://").unwrap_or(tool_ref);
    let parts: Vec<&str> = stripped.splitn(2, '/').collect();
    if parts.len() < 2 {
        return (
            serde_json::json!({ "error": "Invalid MCP tool_ref format" }),
            ExecutionStatus::Failed,
            Some("Invalid MCP tool_ref format".into()),
            0,
        );
    }

    let server_url = parts[0];
    let tool_name = parts[1];

    let client = {
        let mut cache = mcp_cache.lock().await;
        if let Some(client) = cache.get(server_url) {
            client.clone()
        } else {
            let client_result = McpClient::new(&format!("stdio://{server_url}"));
            match client_result {
                Ok(client) => {
                    let client = Arc::new(Mutex::new(client));
                    cache.insert(server_url.to_string(), client.clone());
                    client
                }
                Err(e) => {
                    let err_msg = format!("Failed to create MCP client: {e}");
                    tracing::error!("{err_msg}");
                    return (
                        serde_json::json!({ "error": err_msg }),
                        ExecutionStatus::Failed,
                        Some(err_msg),
                        0,
                    );
                }
            }
        }
    };

    {
        let mut client = client.lock().await;
        if !client.is_initialized() {
            if let Err(e) = client.initialize().await {
                let err_msg = format!("Failed to initialize MCP client: {e}");
                tracing::error!("{err_msg}");
                return (
                    serde_json::json!({ "error": err_msg }),
                    ExecutionStatus::Failed,
                    Some(err_msg),
                    0,
                );
            }
        }
    }

    let client = client.lock().await;
    match client.call_tool(tool_name, input_json.clone()).await {
        Ok(output) => {
            let duration_ms = start.elapsed().as_millis() as i64;
            (output, ExecutionStatus::Completed, None, duration_ms)
        }
        Err(e) => {
            let err_msg = format!("MCP tool call failed: {e}");
            tracing::error!("{err_msg}");
            (
                serde_json::json!({ "error": err_msg }),
                ExecutionStatus::Failed,
                Some(err_msg),
                0,
            )
        }
    }
}

fn default_environment() -> ExecutionEnvironment {
    ExecutionEnvironment {
        platform_version: "0.1.0".into(),
        os: std::env::consts::OS.into(),
        tool_version: "1.0.0".into(),
        extra: Default::default(),
    }
}

fn create_error_span(execution_id: Uuid, node_id: &str, error: &str) -> NodeSpan {
    NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref: "unknown".into(),
        input_json: serde_json::json!({}),
        output_json: Some(serde_json::json!({ "error": error })),
        config_json: serde_json::json!({}),
        started_at: Utc::now(),
        completed_at: Some(Utc::now()),
        duration_ms: Some(0),
        status: ExecutionStatus::Failed,
        error: Some(error.into()),
        cache_hit: false,
        environment: default_environment(),
    }
}

/// Build adjacency list and in-degree map from workflow spec (data edges only).
fn build_dag(spec: &WorkflowSpec) -> (HashMap<String, Vec<String>>, HashMap<String, usize>) {
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = HashMap::new();

    for node in &spec.nodes {
        adj.entry(node.id().to_string()).or_default();
        in_degree.entry(node.id().to_string()).or_insert(0);
    }

    for edge in &spec.edges {
        if edge.kind == EdgeKind::Data {
            adj.entry(edge.source_node.clone())
                .or_default()
                .push(edge.target_node.clone());
            *in_degree.entry(edge.target_node.clone()).or_insert(0) += 1;
        }
    }

    (adj, in_degree)
}

/// Compute topological levels using Kahn's algorithm.
fn topo_levels(
    adj: &HashMap<String, Vec<String>>,
    in_degree: &mut HashMap<String, usize>,
    _spec: &WorkflowSpec,
) -> Vec<Vec<String>> {
    let mut levels = Vec::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    for (node, &deg) in in_degree.iter() {
        if deg == 0 {
            queue.push_back(node.clone());
        }
    }

    let mut visited: HashSet<String> = HashSet::new();

    while !queue.is_empty() {
        let mut current_level = Vec::new();
        let level_size = queue.len();

        for _ in 0..level_size {
            let node = queue.pop_front().unwrap();
            if visited.contains(&node) {
                continue;
            }
            visited.insert(node.clone());
            current_level.push(node.clone());

            if let Some(neighbors) = adj.get(&node) {
                for neighbor in neighbors {
                    if let Some(deg) = in_degree.get_mut(neighbor) {
                        *deg = deg.saturating_sub(1);
                        if *deg == 0 && !visited.contains(neighbor) {
                            queue.push_back(neighbor.clone());
                        }
                    }
                }
            }
        }

        if !current_level.is_empty() {
            levels.push(current_level);
        }
    }

    levels
}

#[cfg(test)]
mod tests {
    use super::*;
    use hb_core::graph::*;

    fn make_spec() -> WorkflowSpec {
        WorkflowSpec {
            nodes: vec![
                NodeEntry::Primitive(NodeSpec {
                    id: "a".into(),
                    tool_ref: "core/read@1.0".into(),
                    config: Default::default(),
                    position: None,
                    label: None,
                    disabled: false,
                    retry: None,
                    cache: None,
                }),
                NodeEntry::Primitive(NodeSpec {
                    id: "b".into(),
                    tool_ref: "core/split@1.0".into(),
                    config: Default::default(),
                    position: None,
                    label: None,
                    disabled: false,
                    retry: None,
                    cache: None,
                }),
                NodeEntry::Primitive(NodeSpec {
                    id: "c".into(),
                    tool_ref: "core/llm@1.0".into(),
                    config: Default::default(),
                    position: None,
                    label: None,
                    disabled: false,
                    retry: None,
                    cache: None,
                }),
            ],
            edges: vec![
                EdgeSpec {
                    id: "e1".into(),
                    source_node: "a".into(),
                    source_port: "out".into(),
                    target_node: "b".into(),
                    target_port: "in".into(),
                    kind: EdgeKind::Data,
                    transform: None,
                },
                EdgeSpec {
                    id: "e2".into(),
                    source_node: "b".into(),
                    source_port: "out".into(),
                    target_node: "c".into(),
                    target_port: "in".into(),
                    kind: EdgeKind::Data,
                    transform: None,
                },
            ],
            ..Default::default()
        }
    }

    #[test]
    fn topo_levels_linear() {
        let spec = make_spec();
        let (adj, mut in_deg) = build_dag(&spec);
        let levels = topo_levels(&adj, &mut in_deg, &spec);
        assert_eq!(levels.len(), 3);
        assert_eq!(levels[0], vec!["a"]);
        assert_eq!(levels[1], vec!["b"]);
        assert_eq!(levels[2], vec!["c"]);
    }

    #[tokio::test]
    async fn run_dag_executes_all_nodes() {
        let spec = make_spec();
        let record = run_dag(Uuid::new_v4(), &spec).await.unwrap();
        assert_eq!(record.total_nodes, 3);
        assert_eq!(record.completed_nodes, 3);
        assert_eq!(record.failed_nodes, 0);
        assert_eq!(record.status, ExecutionStatus::Completed);
    }
}
