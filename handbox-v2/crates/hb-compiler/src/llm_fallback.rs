//! LLM Fallback — generate a WorkflowSpec using an LLM when no template matches.

use crate::CompilerError;
use hb_core::graph::WorkflowSpec;

/// Use an LLM to generate a WorkflowSpec from a natural-language prompt.
pub async fn generate_with_llm(_prompt: &str) -> Result<WorkflowSpec, CompilerError> {
    // Phase 0 stub: not yet implemented.
    // Phase 2 will call an LLM provider and validate the response against the schema.
    Err(CompilerError::LlmFallback(
        "LLM fallback not yet implemented".into(),
    ))
}
