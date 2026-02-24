//! DAG Scheduler — partition nodes by level and execute each level in parallel.

use crate::RunnerError;
use chrono::Utc;
use hb_core::graph::{EdgeKind, NodeEntry, WorkflowSpec};
use hb_core::trace::{ExecutionRecord, ExecutionStatus, ExecutionEnvironment, NodeSpan};
use std::collections::{HashMap, HashSet, VecDeque};
use uuid::Uuid;

/// Run a workflow DAG with topological level-based scheduling.
pub async fn run_dag(
    execution_id: Uuid,
    spec: &WorkflowSpec,
) -> Result<ExecutionRecord, RunnerError> {
    let started_at = Utc::now();
    let total_nodes = spec.nodes.len() as u32;

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
    let mut node_outputs: HashMap<String, serde_json::Value> = HashMap::new();

    // Execute level by level — nodes in the same level run in parallel
    for level in &levels {
        let mut handles = Vec::new();

        for node_id in level {
            let node = spec.nodes.iter().find(|n| n.id() == node_id);
            let node_clone = node.cloned();
            let exec_id = execution_id;
            let nid = node_id.clone();

            // Gather inputs from upstream edges
            let mut inputs = serde_json::Map::new();
            for edge in &spec.edges {
                if edge.target_node == *node_id && edge.kind == EdgeKind::Data {
                    if let Some(val) = node_outputs.get(&edge.source_node) {
                        if let Some(port_val) = val.get(&edge.source_port) {
                            inputs.insert(edge.target_port.clone(), port_val.clone());
                        } else {
                            inputs.insert(
                                edge.target_port.clone(),
                                val.clone(),
                            );
                        }
                    }
                }
            }

            let input_json = serde_json::Value::Object(inputs);

            handles.push(tokio::spawn(async move {
                execute_node(exec_id, &nid, node_clone.as_ref(), input_json).await
            }));
        }

        // Await all tasks in this level
        for (i, handle) in handles.into_iter().enumerate() {
            match handle.await {
                Ok(Ok((span, output))) => {
                    let nid = &level[i];
                    node_outputs.insert(nid.clone(), output);
                    if span.status == ExecutionStatus::Completed {
                        completed_nodes += 1;
                    } else {
                        failed_nodes += 1;
                    }
                }
                Ok(Err(_)) => {
                    failed_nodes += 1;
                }
                Err(e) => {
                    tracing::error!("Task join error: {e}");
                    failed_nodes += 1;
                }
            }
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
        cache_hits: 0,
    })
}

/// Execute a single node and return its span and output.
async fn execute_node(
    execution_id: Uuid,
    node_id: &str,
    node: Option<&NodeEntry>,
    input_json: serde_json::Value,
) -> Result<(NodeSpan, serde_json::Value), RunnerError> {
    let started_at = Utc::now();

    let (tool_ref, config_json) = match node {
        Some(NodeEntry::Primitive(n)) => {
            (n.tool_ref.clone(), serde_json::Value::Object(n.config.clone()))
        }
        _ => ("unknown".into(), serde_json::json!({})),
    };

    // Simulate execution — Phase 2 will dispatch to hb-tool-executor
    let output = serde_json::json!({
        "result": format!("executed {node_id}"),
        "tool": tool_ref,
    });

    let completed_at = Utc::now();
    let duration_ms = (completed_at - started_at).num_milliseconds();

    let span = NodeSpan {
        span_id: Uuid::new_v4(),
        execution_id,
        node_id: node_id.into(),
        tool_ref,
        input_json,
        output_json: Some(output.clone()),
        config_json,
        started_at,
        completed_at: Some(completed_at),
        duration_ms: Some(duration_ms),
        status: ExecutionStatus::Completed,
        error: None,
        cache_hit: false,
        environment: ExecutionEnvironment {
            platform_version: "0.1.0".into(),
            os: std::env::consts::OS.into(),
            tool_version: "1.0.0".into(),
            extra: Default::default(),
        },
    };

    Ok((span, output))
}

/// Build adjacency list and in-degree map from workflow spec (data edges only).
fn build_dag(spec: &WorkflowSpec) -> (HashMap<String, Vec<String>>, HashMap<String, usize>) {
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();
    let mut in_degree: HashMap<String, usize> = HashMap::new();

    // Initialize all nodes
    for node in &spec.nodes {
        adj.entry(node.id().to_string()).or_default();
        in_degree.entry(node.id().to_string()).or_insert(0);
    }

    // Add edges (only data edges affect scheduling)
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

    // Start with nodes that have no incoming edges
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
