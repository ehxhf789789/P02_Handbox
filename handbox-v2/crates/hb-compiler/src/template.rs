//! Template Registry — 10 built-in templates that build WorkflowSpec from slots.

use crate::classifier::TaskType;
use crate::slot_filler::Slots;
use crate::CompilerError;
use hb_core::graph::*;
use uuid::Uuid;

/// Attempt to match a template for the given task type and fill its slots.
pub fn match_template(
    task_type: &TaskType,
    slots: &Slots,
) -> Result<Option<WorkflowSpec>, CompilerError> {
    let spec = match task_type {
        TaskType::Rag => Some(build_rag_basic(slots)?),
        TaskType::Summarize => Some(build_doc_summarize(slots)?),
        TaskType::Review => Some(build_multi_agent_review(slots)?),
        TaskType::DataAnalysis => Some(build_data_analysis(slots)?),
        TaskType::ReportGeneration => Some(build_report_generation(slots)?),
        TaskType::Translation => Some(build_translation(slots)?),
        TaskType::CodeReview => Some(build_code_review(slots)?),
        TaskType::QaExtraction => Some(build_qa_extraction(slots)?),
        TaskType::SentimentAnalysis => Some(build_sentiment_analysis(slots)?),
        TaskType::KnowledgeBaseBuild => Some(build_knowledge_base(slots)?),
        TaskType::Custom(_) => None,
    };
    Ok(spec)
}

// ---- Helper to create nodes and edges quickly ----

fn prim(id: &str, tool: &str, label: &str, x: f64, y: f64) -> NodeEntry {
    NodeEntry::Primitive(NodeSpec {
        id: id.into(),
        tool_ref: format!("core-tools/{tool}@1.0.0"),
        config: Default::default(),
        position: Some(Position { x, y }),
        label: Some(label.into()),
        disabled: false,
        retry: None,
        cache: None,
    })
}

fn edge(src: &str, src_port: &str, tgt: &str, tgt_port: &str) -> EdgeSpec {
    EdgeSpec {
        id: Uuid::new_v4().to_string(),
        source_node: src.into(),
        source_port: src_port.into(),
        target_node: tgt.into(),
        target_port: tgt_port.into(),
        kind: EdgeKind::Data,
        transform: None,
    }
}

fn wf(name: &str, desc: &str, nodes: Vec<NodeEntry>, edges: Vec<EdgeSpec>) -> WorkflowSpec {
    WorkflowSpec {
        meta: WorkflowMeta {
            name: name.into(),
            description: desc.into(),
            ..Default::default()
        },
        nodes,
        edges,
        ..Default::default()
    }
}

// ---- 10 Templates ----

fn build_rag_basic(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "input.txt");
    Ok(wf(
        "RAG Pipeline",
        &format!("RAG pipeline for {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("embed", "embedding", "Embed Chunks", 500.0, 100.0),
            prim("store", "vector-store", "Store Vectors", 750.0, 100.0),
            prim("input", "user-input", "User Query", 500.0, 250.0),
            prim("q_embed", "embedding", "Embed Query", 750.0, 250.0),
            prim("search", "vector-search", "Search", 1000.0, 175.0),
            prim("llm", "llm-chat", "Generate Answer", 1250.0, 175.0),
            prim("out", "display-output", "Display", 1500.0, 175.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "embed", "text"),
            edge("embed", "vector", "store", "vectors"),
            edge("split", "chunks", "store", "chunks"),
            edge("input", "text", "q_embed", "text"),
            edge("q_embed", "vector", "search", "query_vector"),
            edge("search", "results", "llm", "context"),
            edge("input", "text", "llm", "prompt"),
            edge("llm", "response", "out", "data"),
        ],
    ))
}

fn build_doc_summarize(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "document.txt");
    Ok(wf(
        "Document Summarization",
        &format!("Summarize {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("summarize", "llm-summarize", "Summarize", 500.0, 100.0),
            prim("merge", "text-merge", "Merge", 750.0, 100.0),
            prim("out", "display-output", "Display", 1000.0, 100.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "summarize", "text"),
            edge("summarize", "summary", "merge", "texts"),
            edge("merge", "merged", "out", "data"),
        ],
    ))
}

fn build_multi_agent_review(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "document.txt");
    Ok(wf(
        "Multi-Agent Review",
        &format!("Multi-persona review of {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("reviewer1", "llm-chat", "Expert Reviewer", 300.0, 0.0),
            prim("reviewer2", "llm-chat", "Critical Reviewer", 300.0, 100.0),
            prim("reviewer3", "llm-chat", "Practical Reviewer", 300.0, 200.0),
            prim("merge", "merge", "Merge Reviews", 600.0, 100.0),
            prim("synthesize", "llm-chat", "Synthesize", 850.0, 100.0),
            prim("out", "display-output", "Display", 1100.0, 100.0),
        ],
        vec![
            edge("read", "content", "reviewer1", "prompt"),
            edge("read", "content", "reviewer2", "prompt"),
            edge("read", "content", "reviewer3", "prompt"),
            edge("reviewer1", "response", "merge", "input_a"),
            edge("reviewer2", "response", "merge", "input_b"),
            edge("merge", "merged", "synthesize", "context"),
            edge("reviewer3", "response", "synthesize", "prompt"),
            edge("synthesize", "response", "out", "data"),
        ],
    ))
}

fn build_data_analysis(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "data.csv");
    Ok(wf(
        "Data Analysis",
        &format!("Analyze {src}"),
        vec![
            prim("read", "csv-read", "Read CSV", 0.0, 100.0),
            prim("filter", "data-filter", "Filter Data", 250.0, 100.0),
            prim("analyze", "llm-chat", "Analyze", 500.0, 100.0),
            prim("out", "display-output", "Display", 750.0, 100.0),
        ],
        vec![
            edge("read", "rows", "filter", "items"),
            edge("filter", "filtered", "analyze", "prompt"),
            edge("analyze", "response", "out", "data"),
        ],
    ))
}

fn build_report_generation(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "input.txt");
    Ok(wf(
        "Report Generation",
        &format!("Generate report from {src}"),
        vec![
            prim("read", "file-read", "Read Source", 0.0, 100.0),
            prim("gen", "llm-chat", "Generate Report", 250.0, 100.0),
            prim("export", "to-pdf", "Export PDF", 500.0, 100.0),
            prim("out", "display-output", "Display", 750.0, 100.0),
        ],
        vec![
            edge("read", "content", "gen", "prompt"),
            edge("gen", "response", "export", "content"),
            edge("export", "path", "out", "data"),
        ],
    ))
}

fn build_translation(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "document.txt");
    Ok(wf(
        "Translation",
        &format!("Translate {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("translate", "llm-chat", "Translate", 500.0, 100.0),
            prim("merge", "text-merge", "Merge", 750.0, 100.0),
            prim("write", "file-write", "Write File", 1000.0, 100.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "translate", "prompt"),
            edge("translate", "response", "merge", "texts"),
            edge("merge", "merged", "write", "content"),
        ],
    ))
}

fn build_code_review(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "code.py");
    Ok(wf(
        "Code Review",
        &format!("Review {src}"),
        vec![
            prim("read", "file-read", "Read Code", 0.0, 100.0),
            prim("review", "llm-chat", "Review Code", 250.0, 100.0),
            prim("out", "display-output", "Display", 500.0, 100.0),
        ],
        vec![
            edge("read", "content", "review", "prompt"),
            edge("review", "response", "out", "data"),
        ],
    ))
}

fn build_qa_extraction(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "document.txt");
    Ok(wf(
        "QA Extraction",
        &format!("Extract QA from {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("extract", "llm-chat", "Extract QA", 500.0, 100.0),
            prim("parse", "json-parse", "Parse JSON", 750.0, 100.0),
            prim("out", "display-output", "Display", 1000.0, 100.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "extract", "prompt"),
            edge("extract", "response", "parse", "json_string"),
            edge("parse", "data", "out", "data"),
        ],
    ))
}

fn build_sentiment_analysis(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "reviews.txt");
    Ok(wf(
        "Sentiment Analysis",
        &format!("Analyze sentiment in {src}"),
        vec![
            prim("read", "file-read", "Read File", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("sentiment", "llm-chat", "Analyze Sentiment", 500.0, 100.0),
            prim("parse", "json-parse", "Parse JSON", 750.0, 100.0),
            prim("out", "display-output", "Display", 1000.0, 100.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "sentiment", "prompt"),
            edge("sentiment", "response", "parse", "json_string"),
            edge("parse", "data", "out", "data"),
        ],
    ))
}

fn build_knowledge_base(slots: &Slots) -> Result<WorkflowSpec, CompilerError> {
    let src = slots.get_or_default("data_source", "docs/");
    Ok(wf(
        "Knowledge Base Build",
        &format!("Build KB from {src}"),
        vec![
            prim("read", "file-read", "Read Files", 0.0, 100.0),
            prim("split", "text-split", "Split Text", 250.0, 100.0),
            prim("embed", "embedding", "Embed", 500.0, 100.0),
            prim("store", "vector-store", "Store", 750.0, 100.0),
            prim("out", "display-output", "Display", 1000.0, 100.0),
        ],
        vec![
            edge("read", "content", "split", "text"),
            edge("split", "chunks", "embed", "text"),
            edge("embed", "vector", "store", "vectors"),
            edge("split", "chunks", "store", "chunks"),
            edge("store", "index_id", "out", "data"),
        ],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rag_template_creates_valid_spec() {
        let slots = Slots::default();
        let spec = build_rag_basic(&slots).unwrap();
        assert_eq!(spec.nodes.len(), 9);
        assert_eq!(spec.edges.len(), 9);
    }

    #[test]
    fn all_templates_match() {
        let slots = Slots::default();
        for task_type in [
            TaskType::Rag, TaskType::Summarize, TaskType::Review,
            TaskType::DataAnalysis, TaskType::ReportGeneration,
            TaskType::Translation, TaskType::CodeReview,
            TaskType::QaExtraction, TaskType::SentimentAnalysis,
            TaskType::KnowledgeBaseBuild,
        ] {
            let result = match_template(&task_type, &slots).unwrap();
            assert!(result.is_some(), "Template should match for {task_type:?}");
        }
    }
}
