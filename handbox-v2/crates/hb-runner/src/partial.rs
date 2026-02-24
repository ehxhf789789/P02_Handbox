//! Partial Re-execution — compute dirty set and re-execute only affected nodes.

use hb_core::graph::WorkflowSpec;
use std::collections::HashSet;

/// Given a set of changed node IDs, compute the full dirty set
/// (changed nodes + all downstream dependents).
pub fn compute_dirty_set(spec: &WorkflowSpec, changed_nodes: &[String]) -> HashSet<String> {
    let mut dirty: HashSet<String> = changed_nodes.iter().cloned().collect();
    let mut changed = true;

    // Fixed-point propagation: any node whose input depends on a dirty node is also dirty.
    while changed {
        changed = false;
        for edge in &spec.edges {
            if dirty.contains(&edge.source_node) && !dirty.contains(&edge.target_node) {
                dirty.insert(edge.target_node.clone());
                changed = true;
            }
        }
    }

    dirty
}

/// Filter a workflow to only include nodes in the dirty set.
pub fn filter_dirty_nodes(spec: &WorkflowSpec, dirty: &HashSet<String>) -> Vec<String> {
    spec.nodes
        .iter()
        .filter(|n| dirty.contains(n.id()))
        .map(|n| n.id().to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use hb_core::graph::*;

    #[test]
    fn dirty_set_propagates() {
        let spec = WorkflowSpec {
            nodes: vec![
                NodeEntry::Primitive(NodeSpec {
                    id: "a".into(),
                    tool_ref: "t".into(),
                    config: Default::default(),
                    position: None,
                    label: None,
                    disabled: false,
                    retry: None,
                    cache: None,
                }),
                NodeEntry::Primitive(NodeSpec {
                    id: "b".into(),
                    tool_ref: "t".into(),
                    config: Default::default(),
                    position: None,
                    label: None,
                    disabled: false,
                    retry: None,
                    cache: None,
                }),
                NodeEntry::Primitive(NodeSpec {
                    id: "c".into(),
                    tool_ref: "t".into(),
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
        };

        let dirty = compute_dirty_set(&spec, &["a".to_string()]);
        assert!(dirty.contains("a"));
        assert!(dirty.contains("b"));
        assert!(dirty.contains("c"));

        let dirty2 = compute_dirty_set(&spec, &["b".to_string()]);
        assert!(!dirty2.contains("a"));
        assert!(dirty2.contains("b"));
        assert!(dirty2.contains("c"));
    }
}
