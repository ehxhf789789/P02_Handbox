//! hb-core: Shared types for Handbox v2
//!
//! This crate has zero internal crate dependencies and defines the
//! canonical types used across all other hb-* crates.

pub mod graph;
pub mod pack;
pub mod policy;
pub mod project;
pub mod tool;
pub mod trace;

/// Re-export commonly used types.
pub mod prelude {
    pub use crate::graph::{
        CompositeNodeSpec, ConditionalSpec, EdgeKind, EdgeSpec, LoopKind, LoopSpec, NodeSpec,
        PortSpec, PortType, SubgraphSpec, VariableSpec, WorkflowMeta, WorkflowSpec,
    };
    pub use crate::pack::PackManifest;
    pub use crate::policy::{CostLimit, PermissionSet};
    pub use crate::tool::Permission;
    pub use crate::tool::{CapabilityTag, CostHint, SideEffect, ToolInterface};
    pub use crate::trace::{ExecutionStatus, NodeSpan};
}
