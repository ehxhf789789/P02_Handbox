//! hb-compiler: Prompt → WorkflowSpec compiler
//!
//! Pipeline: Classifier → SlotDecomposer → TemplateMatcher → TypeChecker → ValidatorInserter
//! Falls back to LLM-based graph generation when no template matches.

pub mod classifier;
pub mod llm_fallback;
pub mod slot_filler;
pub mod template;
pub mod type_checker;
pub mod validator_inserter;

use hb_core::graph::WorkflowSpec;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CompilerError {
    #[error("classification failed: {0}")]
    ClassificationFailed(String),
    #[error("no template matched and LLM fallback disabled")]
    NoTemplateMatch,
    #[error("type check failed: {0}")]
    TypeCheckFailed(String),
    #[error("slot filling failed: {0}")]
    SlotFillingFailed(String),
    #[error("LLM fallback error: {0}")]
    LlmFallback(String),
    #[error("validation error: {0}")]
    Validation(String),
}

/// Compile a natural-language prompt into an executable WorkflowSpec.
pub async fn compile(prompt: &str) -> Result<WorkflowSpec, CompilerError> {
    // Try template-based compilation first
    let task_type = classifier::classify(prompt)?;
    let slots = slot_filler::extract_slots(prompt, &task_type)?;

    if let Some(spec) = template::match_template(&task_type, &slots)? {
        let spec = type_checker::check(spec)?;
        let spec = validator_inserter::insert_validators(spec)?;
        return Ok(spec);
    }

    // No template match — use LLM fallback to generate workflow
    tracing::info!("No template match for prompt, using LLM fallback: {}", &prompt[..prompt.len().min(100)]);
    let spec = llm_fallback::generate_with_llm(prompt).await?;

    // Run type checking and validation on LLM-generated spec
    let spec = type_checker::check(spec)?;
    let spec = validator_inserter::insert_validators(spec)?;
    Ok(spec)
}
