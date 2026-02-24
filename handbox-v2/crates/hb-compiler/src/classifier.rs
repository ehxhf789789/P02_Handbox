//! Task Classifier — rule-based classification of user prompts into task types.

use crate::CompilerError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Rag,
    Summarize,
    Review,
    DataAnalysis,
    ReportGeneration,
    Translation,
    CodeReview,
    QaExtraction,
    SentimentAnalysis,
    KnowledgeBaseBuild,
    Custom(String),
}

/// Classify a user prompt into a task type using rule-based heuristics.
pub fn classify(prompt: &str) -> Result<TaskType, CompilerError> {
    let lower = prompt.to_lowercase();

    let task_type = if contains_any(&lower, &["rag", "검색", "retrieval", "qa", "질문"]) {
        TaskType::Rag
    } else if contains_any(&lower, &["요약", "summarize", "summary", "축약"]) {
        TaskType::Summarize
    } else if contains_any(&lower, &["리뷰", "review", "평가", "감사", "audit"]) {
        TaskType::Review
    } else if contains_any(&lower, &["분석", "analysis", "통계", "statistics"]) {
        TaskType::DataAnalysis
    } else if contains_any(&lower, &["보고서", "report", "리포트"]) {
        TaskType::ReportGeneration
    } else if contains_any(&lower, &["번역", "translate", "translation"]) {
        TaskType::Translation
    } else if contains_any(&lower, &["코드 리뷰", "code review", "코드리뷰"]) {
        TaskType::CodeReview
    } else if contains_any(&lower, &["faq", "질문 추출", "qa extraction"]) {
        TaskType::QaExtraction
    } else if contains_any(&lower, &["감성", "sentiment", "감정 분석"]) {
        TaskType::SentimentAnalysis
    } else if contains_any(&lower, &["knowledge base", "kb", "지식 베이스"]) {
        TaskType::KnowledgeBaseBuild
    } else {
        TaskType::Custom("unknown".into())
    };

    Ok(task_type)
}

fn contains_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|kw| text.contains(kw))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_rag() {
        assert_eq!(classify("RAG 파이프라인 만들어줘").unwrap(), TaskType::Rag);
    }

    #[test]
    fn classify_summarize() {
        assert_eq!(
            classify("이 문서를 요약해줘").unwrap(),
            TaskType::Summarize
        );
    }

    #[test]
    fn classify_unknown() {
        assert!(matches!(
            classify("뭔가 해줘").unwrap(),
            TaskType::Custom(_)
        ));
    }
}
