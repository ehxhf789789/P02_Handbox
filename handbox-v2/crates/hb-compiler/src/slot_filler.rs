//! Slot Decomposer — extract entities from a prompt into named slots.

use crate::classifier::TaskType;
use crate::CompilerError;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Slots {
    pub values: HashMap<String, serde_json::Value>,
}

impl Slots {
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.values.get(key).and_then(|v| v.as_str())
    }

    pub fn get_u64(&self, key: &str) -> Option<u64> {
        self.values.get(key).and_then(|v| v.as_u64())
    }

    pub fn get_or_default(&self, key: &str, default: &str) -> String {
        self.get_str(key).unwrap_or(default).to_string()
    }
}

/// Extract slots from a prompt based on the classified task type.
pub fn extract_slots(prompt: &str, task_type: &TaskType) -> Result<Slots, CompilerError> {
    let mut slots = Slots::default();

    // Extract file/data source references
    if let Some(path) = extract_pattern(prompt, r#"["\']([^"']+\.\w{1,5})["\']"#) {
        slots.values.insert("data_source".into(), path.into());
    } else if let Some(path) = extract_pattern(prompt, r"(\S+\.\w{1,5})") {
        slots.values.insert("data_source".into(), path.into());
    }

    // Extract model references
    if let Some(model) = extract_pattern(prompt, r"(claude[-\w]*|gpt[-\w]*|gemini[-\w]*)") {
        slots.values.insert("llm_model".into(), model.into());
    } else {
        slots.values.insert("llm_model".into(), "claude-sonnet-4-20250514".into());
    }

    // Extract numeric parameters
    if let Some(n) = extract_number(prompt, r"(?i)top[_\s]?k\s*[:=]?\s*(\d+)") {
        slots.values.insert("top_k".into(), n.into());
    }
    if let Some(n) = extract_number(prompt, r"(?i)chunk[_\s]?size\s*[:=]?\s*(\d+)") {
        slots.values.insert("chunk_size".into(), n.into());
    }
    if let Some(n) = extract_number(prompt, r"(?i)max[_\s]?length\s*[:=]?\s*(\d+)") {
        slots.values.insert("max_length".into(), n.into());
    }
    if let Some(n) = extract_number(prompt, r"(?i)(\d+)\s*(?:개|questions|질문)") {
        slots.values.insert("num_questions".into(), n.into());
    }

    // Task-specific extraction
    match task_type {
        TaskType::Translation => {
            if let Some(lang) = extract_pattern(prompt, r"(?i)(영어|english|한국어|korean|일본어|japanese|중국어|chinese|프랑스어|french|독일어|german|스페인어|spanish)") {
                slots.values.insert("target_langs".into(), serde_json::json!([lang]));
            }
        }
        TaskType::Review | TaskType::CodeReview => {
            if let Some(criteria) = extract_pattern(prompt, r"(?i)(?:기준|criteria)[:：]\s*(.+?)(?:\.|$)") {
                slots.values.insert("review_criteria".into(), criteria.into());
            }
        }
        TaskType::SentimentAnalysis => {
            slots.values.insert("categories".into(),
                serde_json::json!(["positive", "negative", "neutral"]));
        }
        TaskType::KnowledgeBaseBuild => {
            if let Some(name) = extract_pattern(prompt, r"(?i)(?:인덱스|index)[:：\s]+(\S+)") {
                slots.values.insert("index_name".into(), name.into());
            } else {
                slots.values.insert("index_name".into(), "default".into());
            }
            slots.values.insert("embedding_model".into(), "text-embedding-3-small".into());
        }
        _ => {}
    }

    // Set defaults
    slots.values.entry("chunk_size".into()).or_insert(1000.into());
    slots.values.entry("top_k".into()).or_insert(5.into());
    slots.values.entry("max_length".into()).or_insert(500.into());
    slots.values.entry("output_format".into()).or_insert("text".into());

    Ok(slots)
}

fn extract_pattern(text: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern).ok()?.captures(text).map(|c| c[1].to_string())
}

fn extract_number(text: &str, pattern: &str) -> Option<u64> {
    extract_pattern(text, pattern)?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_file_path() {
        let slots = extract_slots(r#"'report.pdf' 파일을 요약해줘"#, &TaskType::Summarize).unwrap();
        assert_eq!(slots.get_str("data_source"), Some("report.pdf"));
    }

    #[test]
    fn extract_model_and_topk() {
        let slots = extract_slots("gpt-4o 모델로 top_k=10 RAG 해줘", &TaskType::Rag).unwrap();
        assert_eq!(slots.get_str("llm_model"), Some("gpt-4o"));
        assert_eq!(slots.get_u64("top_k"), Some(10));
    }
}
