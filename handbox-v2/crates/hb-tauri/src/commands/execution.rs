//! Execution commands — run workflows via hb-runner with real-time status streaming.

use crate::commands::agent_loop::{run_agent_loop, AgentLoopRequest, AgentConversationState};
use crate::state::AppState;
use hb_runner::{AgentTaskParams, ExecutionContext, NodeStatusEvent};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

/// Event name for node status updates
const NODE_STATUS_EVENT: &str = "node-status";

// ============================================================================
// Execution tracking state
// ============================================================================

#[derive(Debug, Clone)]
pub struct ExecutionInfo {
    pub status: String,  // "running", "completed", "failed", "cancelled"
    pub cancelled: Arc<AtomicBool>,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

pub struct ExecutionTrackerState {
    pub executions: Mutex<HashMap<String, ExecutionInfo>>,
}

impl Default for ExecutionTrackerState {
    fn default() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
        }
    }
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn execute_workflow(
    workflow_id: String,
    state: State<'_, AppState>,
    tracker: State<'_, Arc<ExecutionTrackerState>>,
    conversations: State<'_, Arc<AgentConversationState>>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    let workflows = state.workflows.read().await;
    let spec = workflows
        .get(&workflow_id)
        .ok_or_else(|| format!("Workflow not found: {workflow_id}"))?
        .clone();
    drop(workflows); // Release lock before execution

    // Create execution context with status callback
    let app_clone = app.clone();
    let ctx = ExecutionContext::default().with_status_callback(move |event: NodeStatusEvent| {
        if let Err(e) = app_clone.emit(NODE_STATUS_EVENT, &event) {
            tracing::warn!("Failed to emit node status event: {e}");
        }
    });

    // Inject trace store for span recording
    let ctx = {
        let trace_guard = state.trace_store.read().await;
        if let Some(store) = trace_guard.as_ref() {
            ctx.with_trace_store(Arc::clone(store))
        } else {
            ctx
        }
    };

    // Inject active LLM provider from user settings
    let ctx = {
        let creds = state.llm_credentials.read().await;
        if let Some(ref provider) = creds.active_provider {
            ctx.with_llm_provider(provider.clone())
        } else {
            ctx
        }
    };

    // Inject agent task executor so agent-task nodes run the real agent loop
    let resolved_provider = state.llm_credentials.read().await.active_provider.clone();
    let conversations_arc = conversations.inner().clone();
    let app_for_agent = app.clone();
    let ctx = ctx.with_agent_executor(move |params: AgentTaskParams| {
        let convs = conversations_arc.clone();
        let app = app_for_agent.clone();
        let provider_for_agent = resolved_provider.clone();
        Box::pin(async move {
            // Build task string: prompt + context
            let task = if params.context.is_null() || params.context == json!({}) {
                params.prompt
            } else {
                let ctx_str = serde_json::to_string_pretty(&params.context)
                    .unwrap_or_else(|_| params.context.to_string());
                format!("{}\n\nContext:\n{}", params.prompt, ctx_str)
            };

            let request = AgentLoopRequest {
                task,
                system_prompt: None,
                model_id: None,
                provider: provider_for_agent,
                max_iterations: params.max_iterations,
                working_dir: None,
                conversation_id: Some(format!("wf-dag-{}", params.node_id)),
                mode: params.mode,
                allowed_tools: None,
                pinned_tools: None,
                excluded_tools: None,
                project_id: None,
            };

            let result = run_agent_loop(request, &convs, &app).await?;
            Ok(json!({
                "result": result.final_answer,
                "steps": result.steps,
                "usage": result.usage,
            }))
        })
    });

    // Register execution for tracking
    let execution_id = uuid::Uuid::new_v4().to_string();
    let cancelled_flag = ctx.cancelled.clone();
    {
        let mut execs = tracker.executions.lock().await;
        execs.insert(execution_id.clone(), ExecutionInfo {
            status: "running".to_string(),
            cancelled: cancelled_flag,
            started_at: chrono::Utc::now(),
        });
    }

    // Execute with streaming
    let result = hb_runner::execute_with_context(&spec, ctx).await;

    // Update status
    {
        let mut execs = tracker.executions.lock().await;
        if let Some(info) = execs.get_mut(&execution_id) {
            info.status = match &result {
                Ok(_) => "completed".to_string(),
                Err(hb_runner::RunnerError::Cancelled) => "cancelled".to_string(),
                Err(_) => "failed".to_string(),
            };
        }
    }

    let record = result.map_err(|e| format!("Execution failed: {e}"))?;
    let mut value = serde_json::to_value(&record).map_err(|e| e.to_string())?;
    // Attach execution_id so frontend can track/cancel
    if let Some(obj) = value.as_object_mut() {
        obj.insert("execution_id".to_string(), json!(execution_id));
    }
    Ok(value)
}

/// Execute workflow without streaming (simpler API)
#[tauri::command]
pub async fn execute_workflow_simple(
    workflow_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let workflows = state.workflows.read().await;
    let spec = workflows
        .get(&workflow_id)
        .ok_or_else(|| format!("Workflow not found: {workflow_id}"))?;

    let record = hb_runner::execute(spec)
        .await
        .map_err(|e| format!("Execution failed: {e}"))?;

    serde_json::to_value(&record).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_execution_status(
    execution_id: String,
    tracker: State<'_, Arc<ExecutionTrackerState>>,
) -> Result<String, String> {
    let execs = tracker.executions.lock().await;
    if let Some(info) = execs.get(&execution_id) {
        Ok(info.status.clone())
    } else {
        Ok("unknown".to_string())
    }
}

#[tauri::command]
pub async fn cancel_execution(
    execution_id: String,
    tracker: State<'_, Arc<ExecutionTrackerState>>,
) -> Result<(), String> {
    let mut execs = tracker.executions.lock().await;
    if let Some(info) = execs.get_mut(&execution_id) {
        if info.status == "running" {
            info.cancelled.store(true, Ordering::Relaxed);
            info.status = "cancelled".to_string();
            tracing::info!("Execution {} cancelled", execution_id);
        }
        Ok(())
    } else {
        Err(format!("Execution not found: {execution_id}"))
    }
}

/// Execute a single agent-task node (called from frontend for agent nodes on canvas)
#[tauri::command]
pub async fn execute_agent_node(
    node_id: String,
    prompt: String,
    context: Option<String>,
    max_iterations: Option<usize>,
    mode: Option<String>,
    working_dir: Option<String>,
    conversations: State<'_, Arc<AgentConversationState>>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    // Emit running status
    let _ = app.emit(NODE_STATUS_EVENT, json!({
        "node_id": node_id,
        "status": "running",
    }));

    let task = if let Some(ctx) = context {
        format!("{prompt}\n\nContext:\n{ctx}")
    } else {
        prompt
    };

    let request = AgentLoopRequest {
        task,
        system_prompt: None,
        model_id: None,
        provider: None,
        max_iterations,
        working_dir,
        conversation_id: Some(format!("wf-node-{node_id}")),
        mode,
        allowed_tools: None,
        pinned_tools: None,
        excluded_tools: None,
        project_id: None,
    };

    match run_agent_loop(request, &*conversations, &app).await {
        Ok(result) => {
            let _ = app.emit(NODE_STATUS_EVENT, json!({
                "node_id": node_id,
                "status": "completed",
                "output": {
                    "result": result.final_answer,
                    "steps": result.steps,
                    "usage": result.usage,
                },
            }));
            Ok(json!({
                "success": true,
                "final_answer": result.final_answer,
                "steps": result.steps,
                "usage": result.usage,
            }))
        }
        Err(e) => {
            let _ = app.emit(NODE_STATUS_EVENT, json!({
                "node_id": node_id,
                "status": "failed",
                "error": e,
            }));
            Err(e)
        }
    }
}
