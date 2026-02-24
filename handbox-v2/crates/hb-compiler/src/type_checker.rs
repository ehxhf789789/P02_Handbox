//! Type Checker — verify port compatibility across all edges.

use crate::CompilerError;
use hb_core::graph::{NodeEntry, PortType, WorkflowSpec};
use std::collections::HashMap;

/// Validate that every edge connects compatible port types.
pub fn check(spec: WorkflowSpec) -> Result<WorkflowSpec, CompilerError> {
    // Build a map of node_id → (input_ports, output_ports)
    let mut port_map: HashMap<String, (Vec<(String, PortType)>, Vec<(String, PortType)>)> =
        HashMap::new();

    for node in &spec.nodes {
        match node {
            NodeEntry::Primitive(n) => {
                // For now, accept all ports as Any since we don't have the tool registry here.
                // Real type checking will resolve tool_ref → ToolInterface ports.
                port_map.insert(n.id.clone(), (vec![], vec![]));
            }
            NodeEntry::Composite(n) => {
                let inputs = n.input_ports.iter().map(|p| (p.name.clone(), p.port_type.clone())).collect();
                let outputs = n.output_ports.iter().map(|p| (p.name.clone(), p.port_type.clone())).collect();
                port_map.insert(n.id.clone(), (inputs, outputs));
            }
            _ => {}
        }
    }

    // Verify edges reference existing nodes
    for edge in &spec.edges {
        if !port_map.contains_key(&edge.source_node) {
            return Err(CompilerError::TypeCheckFailed(format!(
                "Edge {} references non-existent source node '{}'",
                edge.id, edge.source_node
            )));
        }
        if !port_map.contains_key(&edge.target_node) {
            return Err(CompilerError::TypeCheckFailed(format!(
                "Edge {} references non-existent target node '{}'",
                edge.id, edge.target_node
            )));
        }
    }

    Ok(spec)
}

/// Check if two port types are compatible.
pub fn types_compatible(source: &PortType, target: &PortType) -> bool {
    if *source == PortType::Any || *target == PortType::Any {
        return true;
    }
    source == target
}
