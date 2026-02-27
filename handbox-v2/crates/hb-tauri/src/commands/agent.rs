//! Agent orchestration commands — Multi-agent coordination backend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    Orchestrator,
    Worker,
    Specialist,
    Reviewer,
    Router,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Busy,
    Waiting,
    Error,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapability {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tool_refs: Vec<String>,
    pub input_types: Vec<String>,
    pub output_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDef {
    pub id: String,
    pub name: String,
    pub role: AgentRole,
    pub description: String,
    pub model_id: Option<String>,
    pub provider_id: Option<String>,
    pub capabilities: Vec<AgentCapability>,
    pub max_concurrent_tasks: usize,
    pub priority: u8,
    pub system_prompt: Option<String>,
    pub config: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub tasks_completed: usize,
    pub tasks_failed: usize,
    pub average_execution_time: f64,
    pub total_execution_time: f64,
    pub success_rate: f64,
    pub last_updated: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstance {
    pub id: String,
    pub def_id: String,
    pub status: AgentStatus,
    pub current_task_id: Option<String>,
    pub task_queue: Vec<String>,
    pub metrics: AgentMetrics,
    pub last_active: String,
    pub error_count: usize,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Workflow,
    Node,
    Review,
    Route,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub success: bool,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time: f64,
    pub tokens_used: Option<usize>,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub task_type: TaskType,
    pub priority: u8,
    pub payload: serde_json::Value,
    pub assigned_agent_id: Option<String>,
    pub status: TaskStatus,
    pub result: Option<TaskResult>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub timeout: u64,
    pub retry_count: usize,
    pub max_retries: usize,
    pub parent_task_id: Option<String>,
    pub child_task_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationStrategy {
    RoundRobin,
    LeastBusy,
    CapabilityMatch,
    PriorityBased,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationConfig {
    pub strategy: OrchestrationStrategy,
    pub max_concurrent_tasks: usize,
    pub task_timeout: u64,
    pub max_retries: usize,
    pub backoff_multiplier: f64,
    pub initial_delay: u64,
    pub load_balancing_enabled: bool,
    pub load_balancing_threshold: usize,
    pub health_check_enabled: bool,
    pub health_check_interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationEvent {
    pub id: String,
    pub event_type: String,
    pub timestamp: String,
    pub agent_id: Option<String>,
    pub task_id: Option<String>,
    pub details: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorStats {
    pub total_agents: usize,
    pub active_agents: usize,
    pub total_tasks: usize,
    pub pending_tasks: usize,
    pub running_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub average_success_rate: f64,
}

// ========== State ==========

pub struct AgentOrchestratorState {
    definitions: RwLock<HashMap<String, AgentDef>>,
    instances: RwLock<HashMap<String, AgentInstance>>,
    tasks: RwLock<HashMap<String, AgentTask>>,
    pending_tasks: RwLock<Vec<String>>,
    events: RwLock<Vec<OrchestrationEvent>>,
    config: RwLock<OrchestrationConfig>,
    is_running: RwLock<bool>,
}

impl Default for AgentOrchestratorState {
    fn default() -> Self {
        Self {
            definitions: RwLock::new(HashMap::new()),
            instances: RwLock::new(HashMap::new()),
            tasks: RwLock::new(HashMap::new()),
            pending_tasks: RwLock::new(Vec::new()),
            events: RwLock::new(Vec::new()),
            config: RwLock::new(OrchestrationConfig {
                strategy: OrchestrationStrategy::Hybrid,
                max_concurrent_tasks: 10,
                task_timeout: 60000,
                max_retries: 3,
                backoff_multiplier: 2.0,
                initial_delay: 1000,
                load_balancing_enabled: true,
                load_balancing_threshold: 5,
                health_check_enabled: true,
                health_check_interval: 30000,
            }),
            is_running: RwLock::new(false),
        }
    }
}

impl AgentOrchestratorState {
    fn emit_event(&self, events: &mut Vec<OrchestrationEvent>, event_type: &str, agent_id: Option<String>, task_id: Option<String>, details: HashMap<String, serde_json::Value>) {
        let event = OrchestrationEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: event_type.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            agent_id,
            task_id,
            details,
        };
        events.push(event);
        if events.len() > 1000 {
            events.drain(0..500);
        }
    }
}

// ========== Commands ==========

/// Start the orchestrator
#[tauri::command]
pub async fn agent_start_orchestrator(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut is_running = state.is_running.write().await;
    if *is_running {
        return Ok(false);
    }
    *is_running = true;

    let mut events = state.events.write().await;
    let mut details = HashMap::new();
    details.insert("action".to_string(), serde_json::json!("started"));
    state.emit_event(&mut events, "orchestrator_started", None, None, details);

    Ok(true)
}

/// Stop the orchestrator
#[tauri::command]
pub async fn agent_stop_orchestrator(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut is_running = state.is_running.write().await;
    *is_running = false;

    let mut events = state.events.write().await;
    let mut details = HashMap::new();
    details.insert("action".to_string(), serde_json::json!("stopped"));
    state.emit_event(&mut events, "orchestrator_stopped", None, None, details);

    Ok(true)
}

/// Register a new agent definition
#[tauri::command]
pub async fn agent_register(
    def: AgentDef,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<AgentInstance, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Store definition
    let mut definitions = state.definitions.write().await;
    definitions.insert(def.id.clone(), def.clone());

    // Create instance
    let instance = AgentInstance {
        id: format!("inst_{}_{}", def.id, chrono::Utc::now().timestamp_millis()),
        def_id: def.id.clone(),
        status: AgentStatus::Idle,
        current_task_id: None,
        task_queue: Vec::new(),
        metrics: AgentMetrics {
            tasks_completed: 0,
            tasks_failed: 0,
            average_execution_time: 0.0,
            total_execution_time: 0.0,
            success_rate: 1.0,
            last_updated: now.clone(),
        },
        last_active: now.clone(),
        error_count: 0,
        created_at: now,
    };

    let mut instances = state.instances.write().await;
    instances.insert(instance.id.clone(), instance.clone());

    // Emit event
    let mut events = state.events.write().await;
    let mut details = HashMap::new();
    details.insert("def_id".to_string(), serde_json::json!(def.id));
    details.insert("name".to_string(), serde_json::json!(def.name));
    state.emit_event(&mut events, "agent_registered", Some(instance.id.clone()), None, details);

    Ok(instance)
}

/// Unregister an agent
#[tauri::command]
pub async fn agent_unregister(
    instance_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut instances = state.instances.write().await;
    let removed = instances.remove(&instance_id).is_some();

    if removed {
        let mut events = state.events.write().await;
        state.emit_event(&mut events, "agent_unregistered", Some(instance_id), None, HashMap::new());
    }

    Ok(removed)
}

/// Update agent status
#[tauri::command]
pub async fn agent_update_status(
    instance_id: String,
    status: AgentStatus,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut instances = state.instances.write().await;

    if let Some(instance) = instances.get_mut(&instance_id) {
        let previous_status = instance.status.clone();
        instance.status = status.clone();
        instance.last_active = chrono::Utc::now().to_rfc3339();

        let mut events = state.events.write().await;
        let mut details = HashMap::new();
        details.insert("previous_status".to_string(), serde_json::to_value(&previous_status).unwrap());
        details.insert("new_status".to_string(), serde_json::to_value(&status).unwrap());
        state.emit_event(&mut events, "agent_status_changed", Some(instance_id), None, details);

        Ok(true)
    } else {
        Ok(false)
    }
}

/// Get all agent instances
#[tauri::command]
pub async fn agent_list_instances(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Vec<AgentInstance>, String> {
    let instances = state.instances.read().await;
    Ok(instances.values().cloned().collect())
}

/// Get agent by ID
#[tauri::command]
pub async fn agent_get_instance(
    instance_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Option<AgentInstance>, String> {
    let instances = state.instances.read().await;
    Ok(instances.get(&instance_id).cloned())
}

/// Create a new task
#[tauri::command]
pub async fn agent_create_task(
    task_type: TaskType,
    payload: serde_json::Value,
    priority: Option<u8>,
    timeout: Option<u64>,
    max_retries: Option<usize>,
    parent_task_id: Option<String>,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<AgentTask, String> {
    let config = state.config.read().await;
    let now = chrono::Utc::now().to_rfc3339();

    let task = AgentTask {
        id: uuid::Uuid::new_v4().to_string(),
        task_type,
        priority: priority.unwrap_or(5),
        payload,
        assigned_agent_id: None,
        status: TaskStatus::Pending,
        result: None,
        created_at: now,
        started_at: None,
        completed_at: None,
        timeout: timeout.unwrap_or(config.task_timeout),
        retry_count: 0,
        max_retries: max_retries.unwrap_or(config.max_retries),
        parent_task_id,
        child_task_ids: Vec::new(),
    };

    let mut tasks = state.tasks.write().await;
    tasks.insert(task.id.clone(), task.clone());

    let mut pending = state.pending_tasks.write().await;
    pending.push(task.id.clone());

    // Link to parent if exists
    if let Some(ref parent_id) = task.parent_task_id {
        if let Some(parent) = tasks.get_mut(parent_id) {
            parent.child_task_ids.push(task.id.clone());
        }
    }

    let mut events = state.events.write().await;
    let mut details = HashMap::new();
    details.insert("task_type".to_string(), serde_json::to_value(&task.task_type).unwrap());
    details.insert("priority".to_string(), serde_json::json!(task.priority));
    state.emit_event(&mut events, "task_created", None, Some(task.id.clone()), details);

    Ok(task)
}

/// Assign task to agent
#[tauri::command]
pub async fn agent_assign_task(
    task_id: String,
    agent_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut tasks = state.tasks.write().await;
    let mut instances = state.instances.write().await;

    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;
    let agent = instances.get_mut(&agent_id).ok_or("Agent not found")?;

    task.assigned_agent_id = Some(agent_id.clone());
    task.status = TaskStatus::Queued;

    agent.task_queue.push(task_id.clone());
    agent.last_active = chrono::Utc::now().to_rfc3339();

    // Remove from pending
    let mut pending = state.pending_tasks.write().await;
    pending.retain(|id| id != &task_id);

    let mut events = state.events.write().await;
    state.emit_event(&mut events, "task_assigned", Some(agent_id), Some(task_id), HashMap::new());

    Ok(true)
}

/// Start task execution
#[tauri::command]
pub async fn agent_start_task(
    task_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut tasks = state.tasks.write().await;
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    task.status = TaskStatus::Running;
    task.started_at = Some(chrono::Utc::now().to_rfc3339());

    // Update agent status
    if let Some(ref agent_id) = task.assigned_agent_id {
        let mut instances = state.instances.write().await;
        if let Some(agent) = instances.get_mut(agent_id) {
            agent.status = AgentStatus::Busy;
            agent.current_task_id = Some(task_id.clone());
        }
    }

    let mut events = state.events.write().await;
    state.emit_event(&mut events, "task_started", task.assigned_agent_id.clone(), Some(task_id), HashMap::new());

    Ok(true)
}

/// Complete a task
#[tauri::command]
pub async fn agent_complete_task(
    task_id: String,
    result: TaskResult,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut tasks = state.tasks.write().await;
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    task.status = if result.success { TaskStatus::Completed } else { TaskStatus::Failed };
    task.result = Some(result.clone());
    task.completed_at = Some(chrono::Utc::now().to_rfc3339());

    let agent_id = task.assigned_agent_id.clone();

    // Update agent metrics
    if let Some(ref aid) = agent_id {
        let mut instances = state.instances.write().await;
        if let Some(agent) = instances.get_mut(aid) {
            agent.task_queue.retain(|id| id != &task_id);
            agent.current_task_id = None;
            agent.status = AgentStatus::Idle;

            if result.success {
                agent.metrics.tasks_completed += 1;
            } else {
                agent.metrics.tasks_failed += 1;
            }

            agent.metrics.total_execution_time += result.execution_time;
            let total = agent.metrics.tasks_completed + agent.metrics.tasks_failed;
            agent.metrics.average_execution_time = agent.metrics.total_execution_time / total as f64;
            agent.metrics.success_rate = agent.metrics.tasks_completed as f64 / total as f64;
            agent.metrics.last_updated = chrono::Utc::now().to_rfc3339();
        }
    }

    let mut events = state.events.write().await;
    let event_type = if result.success { "task_completed" } else { "task_failed" };
    let mut details = HashMap::new();
    details.insert("execution_time".to_string(), serde_json::json!(result.execution_time));
    if let Some(ref err) = result.error {
        details.insert("error".to_string(), serde_json::json!(err));
    }
    state.emit_event(&mut events, event_type, agent_id, Some(task_id), details);

    Ok(true)
}

/// Cancel a task
#[tauri::command]
pub async fn agent_cancel_task(
    task_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut tasks = state.tasks.write().await;
    let task = tasks.get_mut(&task_id).ok_or("Task not found")?;

    if matches!(task.status, TaskStatus::Running) {
        return Err("Cannot cancel running task".to_string());
    }

    task.status = TaskStatus::Cancelled;

    // Remove from agent queue
    if let Some(ref agent_id) = task.assigned_agent_id {
        let mut instances = state.instances.write().await;
        if let Some(agent) = instances.get_mut(agent_id) {
            agent.task_queue.retain(|id| id != &task_id);
        }
    }

    // Remove from pending
    let mut pending = state.pending_tasks.write().await;
    pending.retain(|id| id != &task_id);

    Ok(true)
}

/// Get task by ID
#[tauri::command]
pub async fn agent_get_task(
    task_id: String,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Option<AgentTask>, String> {
    let tasks = state.tasks.read().await;
    Ok(tasks.get(&task_id).cloned())
}

/// List all tasks
#[tauri::command]
pub async fn agent_list_tasks(
    status_filter: Option<TaskStatus>,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Vec<AgentTask>, String> {
    let tasks = state.tasks.read().await;
    let mut result: Vec<AgentTask> = tasks.values().cloned().collect();

    if let Some(status) = status_filter {
        result.retain(|t| std::mem::discriminant(&t.status) == std::mem::discriminant(&status));
    }

    Ok(result)
}

/// Get pending tasks
#[tauri::command]
pub async fn agent_get_pending_tasks(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Vec<AgentTask>, String> {
    let pending = state.pending_tasks.read().await;
    let tasks = state.tasks.read().await;

    let result: Vec<AgentTask> = pending
        .iter()
        .filter_map(|id| tasks.get(id).cloned())
        .collect();

    Ok(result)
}

/// Get orchestration statistics
#[tauri::command]
pub async fn agent_get_stats(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<OrchestratorStats, String> {
    let instances = state.instances.read().await;
    let tasks = state.tasks.read().await;

    let agents: Vec<&AgentInstance> = instances.values().collect();
    let all_tasks: Vec<&AgentTask> = tasks.values().collect();

    let success_rates: Vec<f64> = agents.iter().map(|a| a.metrics.success_rate).collect();
    let avg_success_rate = if success_rates.is_empty() {
        1.0
    } else {
        success_rates.iter().sum::<f64>() / success_rates.len() as f64
    };

    Ok(OrchestratorStats {
        total_agents: agents.len(),
        active_agents: agents.iter().filter(|a| !matches!(a.status, AgentStatus::Offline)).count(),
        total_tasks: all_tasks.len(),
        pending_tasks: all_tasks.iter().filter(|t| matches!(t.status, TaskStatus::Pending | TaskStatus::Queued)).count(),
        running_tasks: all_tasks.iter().filter(|t| matches!(t.status, TaskStatus::Running)).count(),
        completed_tasks: all_tasks.iter().filter(|t| matches!(t.status, TaskStatus::Completed)).count(),
        failed_tasks: all_tasks.iter().filter(|t| matches!(t.status, TaskStatus::Failed | TaskStatus::Timeout)).count(),
        average_success_rate: avg_success_rate,
    })
}

/// Get event log
#[tauri::command]
pub async fn agent_get_events(
    limit: Option<usize>,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<Vec<OrchestrationEvent>, String> {
    let events = state.events.read().await;
    let limit = limit.unwrap_or(100);
    let start = events.len().saturating_sub(limit);
    Ok(events[start..].to_vec())
}

/// Update orchestration config
#[tauri::command]
pub async fn agent_update_config(
    config: OrchestrationConfig,
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<bool, String> {
    let mut current = state.config.write().await;
    *current = config;
    Ok(true)
}

/// Get orchestration config
#[tauri::command]
pub async fn agent_get_config(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<OrchestrationConfig, String> {
    let config = state.config.read().await;
    Ok(config.clone())
}

/// Auto-assign pending tasks to available agents
#[tauri::command]
pub async fn agent_process_pending(
    state: State<'_, Arc<AgentOrchestratorState>>,
) -> Result<usize, String> {
    let is_running = state.is_running.read().await;
    if !*is_running {
        return Ok(0);
    }
    drop(is_running);

    let config = state.config.read().await;
    let strategy = config.strategy.clone();
    drop(config);

    let mut pending = state.pending_tasks.write().await;
    let mut tasks = state.tasks.write().await;
    let mut instances = state.instances.write().await;
    let definitions = state.definitions.read().await;

    // Sort pending by priority
    pending.sort_by(|a, b| {
        let task_a = tasks.get(a);
        let task_b = tasks.get(b);
        match (task_a, task_b) {
            (Some(ta), Some(tb)) => tb.priority.cmp(&ta.priority),
            _ => std::cmp::Ordering::Equal,
        }
    });

    let mut assigned_count = 0;
    let tasks_to_assign: Vec<String> = pending.drain(..).collect();

    for task_id in tasks_to_assign {
        let task = match tasks.get(&task_id) {
            Some(t) => t.clone(),
            None => continue,
        };

        // Find available agents
        let available: Vec<String> = instances
            .iter()
            .filter(|(_, inst)| {
                if matches!(inst.status, AgentStatus::Error | AgentStatus::Offline) {
                    return false;
                }
                let def = definitions.get(&inst.def_id);
                if let Some(d) = def {
                    inst.task_queue.len() < d.max_concurrent_tasks
                } else {
                    false
                }
            })
            .map(|(id, _)| id.clone())
            .collect();

        if available.is_empty() {
            pending.push(task_id);
            continue;
        }

        // Select agent based on strategy
        let selected_agent_id = match strategy {
            OrchestrationStrategy::RoundRobin => {
                // Oldest last active
                available.into_iter().min_by(|a, b| {
                    let inst_a = instances.get(a);
                    let inst_b = instances.get(b);
                    match (inst_a, inst_b) {
                        (Some(ia), Some(ib)) => ia.last_active.cmp(&ib.last_active),
                        _ => std::cmp::Ordering::Equal,
                    }
                })
            },
            OrchestrationStrategy::LeastBusy => {
                available.into_iter().min_by(|a, b| {
                    let inst_a = instances.get(a);
                    let inst_b = instances.get(b);
                    match (inst_a, inst_b) {
                        (Some(ia), Some(ib)) => ia.task_queue.len().cmp(&ib.task_queue.len()),
                        _ => std::cmp::Ordering::Equal,
                    }
                })
            },
            OrchestrationStrategy::PriorityBased => {
                available.into_iter().max_by(|a, b| {
                    let inst_a = instances.get(a);
                    let inst_b = instances.get(b);
                    match (inst_a, inst_b) {
                        (Some(ia), Some(ib)) => {
                            let def_a = definitions.get(&ia.def_id);
                            let def_b = definitions.get(&ib.def_id);
                            match (def_a, def_b) {
                                (Some(da), Some(db)) => da.priority.cmp(&db.priority),
                                _ => std::cmp::Ordering::Equal,
                            }
                        },
                        _ => std::cmp::Ordering::Equal,
                    }
                })
            },
            _ => {
                // Hybrid: combined scoring
                available.into_iter().max_by(|a, b| {
                    let score_a = calculate_agent_score(a, &instances, &definitions);
                    let score_b = calculate_agent_score(b, &instances, &definitions);
                    score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
                })
            }
        };

        if let Some(agent_id) = selected_agent_id {
            // Assign task
            if let Some(task) = tasks.get_mut(&task_id) {
                task.assigned_agent_id = Some(agent_id.clone());
                task.status = TaskStatus::Queued;
            }
            if let Some(agent) = instances.get_mut(&agent_id) {
                agent.task_queue.push(task_id.clone());
                agent.last_active = chrono::Utc::now().to_rfc3339();
            }
            assigned_count += 1;
        } else {
            pending.push(task_id);
        }
    }

    Ok(assigned_count)
}

fn calculate_agent_score(
    agent_id: &str,
    instances: &HashMap<String, AgentInstance>,
    definitions: &HashMap<String, AgentDef>,
) -> f64 {
    let instance = match instances.get(agent_id) {
        Some(i) => i,
        None => return 0.0,
    };

    let def = match definitions.get(&instance.def_id) {
        Some(d) => d,
        None => return 0.0,
    };

    let mut score = 0.0;

    // Load score (30% weight, less queue = higher score)
    let load_score = 30.0 - (instance.task_queue.len() as f64 * 10.0);
    score += load_score.max(0.0);

    // Success rate (20% weight)
    score += instance.metrics.success_rate * 20.0;

    // Priority (10% weight)
    score += def.priority as f64;

    score
}
