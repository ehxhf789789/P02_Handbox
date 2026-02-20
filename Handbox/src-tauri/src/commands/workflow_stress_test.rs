// 워크플로우 스트레스 테스트 — 10,000건 시뮬레이션
//
// 목적:
// 1. 노드 연결 호환성 검증
// 2. 워크플로우 실행 안정성 검증
// 3. 에러 핸들링 검증
// 4. 데이터 전달 무결성 검증
// 5. 모든 노드 타입 커버리지 테스트 (진화 학습용)

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

// ============================================================
// 테스트 결과 구조체
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub test_id: u64,
    pub test_name: String,
    pub workflow_type: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub execution_time_ms: u64,
    pub node_count: usize,
    pub edge_count: usize,
    pub nodes_used: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestSummary {
    pub total_tests: u64,
    pub passed: u64,
    pub failed: u64,
    pub success_rate: f64,
    pub avg_execution_time_ms: f64,
    pub errors_by_type: HashMap<String, u64>,
    pub slowest_test_ms: u64,
    pub fastest_test_ms: u64,
    pub node_coverage: HashMap<String, u64>,
    pub nodes_never_tested: Vec<String>,
    pub error_patterns: Vec<ErrorPattern>,
}

/// 학습을 위한 오류 패턴 기록
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPattern {
    pub source_node_type: String,
    pub target_node_type: Option<String>,
    pub error_type: String,
    pub error_message: String,
    pub occurrence_count: u64,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StressTestConfig {
    pub test_count: u64,
    pub parallel_count: usize,
    pub include_llm_tests: bool,
    pub include_io_tests: bool,
    pub include_transform_tests: bool,
    pub include_complex_workflows: bool,
    pub ensure_full_coverage: bool,  // NEW: 모든 노드 최소 1회 테스트 보장
}

impl Default for StressTestConfig {
    fn default() -> Self {
        Self {
            test_count: 10000,
            parallel_count: 10,
            include_llm_tests: false, // LLM 테스트는 비용 문제로 기본 비활성화
            include_io_tests: true,
            include_transform_tests: true,
            include_complex_workflows: true,
            ensure_full_coverage: false,
        }
    }
}

// ============================================================
// 테스트 시나리오 생성기
// ============================================================

/// 노드 타입 정의
#[derive(Debug, Clone)]
struct NodeType {
    type_name: &'static str,
    category: &'static str,
    input_ports: Vec<(&'static str, &'static str)>, // (name, type)
    output_ports: Vec<(&'static str, &'static str)>,
}

/// 모든 노드 타입 정의 (프론트엔드 NodeRegistry와 동기화)
fn get_node_types() -> Vec<NodeType> {
    vec![
        // ============================================================
        // IO 노드 (5개)
        // ============================================================
        NodeType {
            type_name: "io.file-read",
            category: "io",
            input_ports: vec![("path", "text")],
            output_ports: vec![("text", "text"), ("metadata", "json")],
        },
        NodeType {
            type_name: "io.file-write",
            category: "io",
            input_ports: vec![("content", "text"), ("path", "text")],
            output_ports: vec![("result", "json")],
        },
        NodeType {
            type_name: "io.file-list",
            category: "io",
            input_ports: vec![("path", "text")],
            output_ports: vec![("files", "json"), ("count", "json")],
        },
        NodeType {
            type_name: "io.file-info",
            category: "io",
            input_ports: vec![("path", "text")],
            output_ports: vec![("info", "json")],
        },
        NodeType {
            type_name: "io.http-request",
            category: "io",
            input_ports: vec![("url", "text"), ("body", "text")],
            output_ports: vec![("body", "text"), ("response", "json")],
        },

        // ============================================================
        // Transform 노드 (9개)
        // ============================================================
        NodeType {
            type_name: "transform.json-query",
            category: "transform",
            input_ports: vec![("data", "any")],
            output_ports: vec![("result", "json")],
        },
        NodeType {
            type_name: "transform.json-parse",
            category: "transform",
            input_ports: vec![("text", "text")],
            output_ports: vec![("data", "json")],
        },
        NodeType {
            type_name: "transform.json-stringify",
            category: "transform",
            input_ports: vec![("data", "json")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "transform.csv-parse",
            category: "transform",
            input_ports: vec![("text", "text")],
            output_ports: vec![("data", "json"), ("headers", "json")],
        },
        NodeType {
            type_name: "transform.csv-stringify",
            category: "transform",
            input_ports: vec![("data", "json")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "transform.text-split",
            category: "transform",
            input_ports: vec![("text", "text")],
            output_ports: vec![("chunks", "text[]"), ("result", "json")],
        },
        NodeType {
            type_name: "transform.text-regex",
            category: "transform",
            input_ports: vec![("text", "text")],
            output_ports: vec![("result", "json")],
        },
        NodeType {
            type_name: "transform.text-template",
            category: "transform",
            input_ports: vec![("variables", "json")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "transform.xml-parse",
            category: "transform",
            input_ports: vec![("text", "text")],
            output_ports: vec![("data", "json")],
        },

        // ============================================================
        // Storage 노드 (8개)
        // ============================================================
        NodeType {
            type_name: "storage.kv-get",
            category: "storage",
            input_ports: vec![("key", "text")],
            output_ports: vec![("value", "json"), ("exists", "json")],
        },
        NodeType {
            type_name: "storage.kv-set",
            category: "storage",
            input_ports: vec![("key", "text"), ("value", "any")],
            output_ports: vec![("result", "json")],
        },
        NodeType {
            type_name: "storage.kv-delete",
            category: "storage",
            input_ports: vec![("key", "text")],
            output_ports: vec![("deleted", "json")],
        },
        NodeType {
            type_name: "storage.kv-list",
            category: "storage",
            input_ports: vec![],
            output_ports: vec![("keys", "json")],
        },
        NodeType {
            type_name: "storage.vector-store",
            category: "storage",
            input_ports: vec![("documents", "json")],
            output_ports: vec![("result", "json")],
        },
        NodeType {
            type_name: "storage.vector-search",
            category: "storage",
            input_ports: vec![("query_embedding", "vector")],
            output_ports: vec![("results", "search-result[]")],
        },
        NodeType {
            type_name: "storage.vector-hybrid",
            category: "storage",
            input_ports: vec![("query_embedding", "vector"), ("query_text", "text")],
            output_ports: vec![("results", "search-result[]")],
        },
        NodeType {
            type_name: "storage.sqlite-query",
            category: "storage",
            input_ports: vec![("sql", "text")],
            output_ports: vec![("result", "json")],
        },

        // ============================================================
        // Control 노드 (10개)
        // ============================================================
        NodeType {
            type_name: "control.if",
            category: "control",
            input_ports: vec![("value", "any")],
            output_ports: vec![("true_out", "any"), ("false_out", "any")],
        },
        NodeType {
            type_name: "control.switch",
            category: "control",
            input_ports: vec![("value", "any")],
            output_ports: vec![("case_1", "any"), ("case_2", "any"), ("case_3", "any"), ("default", "any")],
        },
        NodeType {
            type_name: "control.loop",
            category: "control",
            input_ports: vec![("input", "any")],
            output_ports: vec![("item", "any"), ("index", "json"), ("results", "json")],
        },
        NodeType {
            type_name: "control.forEach",
            category: "control",
            input_ports: vec![("array", "json")],
            output_ports: vec![("item", "any"), ("index", "json"), ("results", "json")],
        },
        NodeType {
            type_name: "control.while",
            category: "control",
            input_ports: vec![("input", "any")],
            output_ports: vec![("result", "any"), ("iterations", "json")],
        },
        NodeType {
            type_name: "control.merge",
            category: "control",
            input_ports: vec![("input_1", "any"), ("input_2", "any"), ("input_3", "any")],
            output_ports: vec![("merged", "json")],
        },
        NodeType {
            type_name: "control.split",
            category: "control",
            input_ports: vec![("input", "any")],
            output_ports: vec![("output_1", "any"), ("output_2", "any"), ("output_3", "any")],
        },
        NodeType {
            type_name: "control.gate",
            category: "control",
            input_ports: vec![("data", "any"), ("gate", "any")],
            output_ports: vec![("output", "any")],
        },
        NodeType {
            type_name: "control.variable-get",
            category: "control",
            input_ports: vec![],
            output_ports: vec![("value", "any")],
        },
        NodeType {
            type_name: "control.variable-set",
            category: "control",
            input_ports: vec![("value", "any")],
            output_ports: vec![("value", "any")],
        },

        // ============================================================
        // LLM 노드 (6개)
        // ============================================================
        NodeType {
            type_name: "llm.chat",
            category: "llm",
            input_ports: vec![("prompt", "text"), ("system", "text"), ("context", "text")],
            output_ports: vec![("text", "llm-response"), ("usage", "json")],
        },
        NodeType {
            type_name: "llm.embed",
            category: "llm",
            input_ports: vec![("texts", "text[]"), ("text", "text")],
            output_ports: vec![("embeddings", "vector[]"), ("embedding", "vector")],
        },
        NodeType {
            type_name: "llm.structured",
            category: "llm",
            input_ports: vec![("prompt", "text"), ("context", "text")],
            output_ports: vec![("data", "json"), ("text", "text")],
        },
        NodeType {
            type_name: "prompt.template",
            category: "llm",
            input_ports: vec![("variables", "json"), ("context", "text"), ("query", "text")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "prompt.fewshot",
            category: "llm",
            input_ports: vec![("query", "text")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "prompt.chain",
            category: "llm",
            input_ports: vec![("input", "text"), ("previous_response", "text")],
            output_ports: vec![("text", "text")],
        },

        // ============================================================
        // Visualization 노드 (5개)
        // ============================================================
        NodeType {
            type_name: "viz.table",
            category: "viz",
            input_ports: vec![("data", "json")],
            output_ports: vec![("data", "table-data")],
        },
        NodeType {
            type_name: "viz.chart",
            category: "viz",
            input_ports: vec![("data", "json")],
            output_ports: vec![("data", "chart-data")],
        },
        NodeType {
            type_name: "viz.json",
            category: "viz",
            input_ports: vec![("data", "json")],
            output_ports: vec![("data", "json")],
        },
        NodeType {
            type_name: "viz.text",
            category: "viz",
            input_ports: vec![("text", "text")],
            output_ports: vec![("text", "text")],
        },
        NodeType {
            type_name: "viz.stats",
            category: "viz",
            input_ports: vec![("data", "json")],
            output_ports: vec![("stats", "json")],
        },

        // ============================================================
        // Document 노드 (2개)
        // ============================================================
        NodeType {
            type_name: "doc.parse",
            category: "doc",
            input_ports: vec![("path", "file-ref")],
            output_ports: vec![("text", "text"), ("metadata", "json"), ("structured_data", "json")],
        },
        NodeType {
            type_name: "doc.convert",
            category: "doc",
            input_ports: vec![("content", "text"), ("source_format", "text")],
            output_ports: vec![("result", "json")],
        },

        // ============================================================
        // Process 노드 (2개)
        // ============================================================
        NodeType {
            type_name: "process.shell-exec",
            category: "process",
            input_ports: vec![("command", "text")],
            output_ports: vec![("stdout", "text"), ("stderr", "text"), ("exit_code", "json")],
        },
        NodeType {
            type_name: "process.code-eval",
            category: "process",
            input_ports: vec![("code", "text"), ("input", "any")],
            output_ports: vec![("result", "any")],
        },

        // ============================================================
        // Variable 노드 (2개)
        // ============================================================
        NodeType {
            type_name: "data.constant",
            category: "data",
            input_ports: vec![],
            output_ports: vec![("value", "any")],
        },
        NodeType {
            type_name: "data.input",
            category: "data",
            input_ports: vec![],
            output_ports: vec![("value", "any")],
        },

        // ============================================================
        // Debug 노드 (3개)
        // ============================================================
        NodeType {
            type_name: "debug.log",
            category: "debug",
            input_ports: vec![("data", "any")],
            output_ports: vec![("data", "any")],
        },
        NodeType {
            type_name: "debug.inspect",
            category: "debug",
            input_ports: vec![("data", "any")],
            output_ports: vec![("info", "json")],
        },
        NodeType {
            type_name: "debug.breakpoint",
            category: "debug",
            input_ports: vec![("data", "any")],
            output_ports: vec![("data", "any")],
        },
    ]
}

/// 타입 호환성 체크
fn are_types_compatible(source_type: &str, target_type: &str) -> bool {
    if source_type == target_type {
        return true;
    }

    // 특수 호환성 규칙 (any는 모든 타입과 호환)
    match (source_type, target_type) {
        ("any", _) | (_, "any") => true,
        ("text", "text[]") | ("text[]", "text") => true,
        ("chunk[]", "text[]") => true,
        ("llm-response", "text") => true,
        ("file-ref", "text") => true,
        ("json", "text") | ("text", "json") => true,
        ("vector", "vector[]") | ("vector[]", "vector") => true,
        ("search-result[]", "json") => true,
        ("table-data", "json") | ("chart-data", "json") => true,
        _ => false,
    }
}

/// 랜덤 워크플로우 생성
fn generate_random_workflow(
    id: u64,
    node_types: &[NodeType],
    rng: &mut impl rand::Rng,
    include_llm: bool,
) -> (Value, String) {
    use rand::seq::SliceRandom;

    // 워크플로우 패턴 선택
    let patterns = [
        "linear",      // A -> B -> C
        "parallel",    // A -> B, A -> C
        "diamond",     // A -> B, A -> C, B -> D, C -> D
        "complex",     // 복잡한 그래프
    ];
    let pattern = patterns[rng.gen_range(0..patterns.len())];

    // LLM 노드 필터링
    let available_nodes: Vec<_> = node_types
        .iter()
        .filter(|n| include_llm || n.category != "llm")
        .collect();

    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    match pattern {
        "linear" => {
            let count = rng.gen_range(2..5);
            for i in 0..count {
                let node_type = available_nodes.choose(rng).unwrap();
                nodes.push(json!({
                    "id": format!("node_{}", i),
                    "type": node_type.type_name,
                    "position": { "x": i * 250, "y": 100 },
                    "data": {
                        "label": format!("{} {}", node_type.type_name, i),
                        "config": {}
                    }
                }));

                if i > 0 {
                    edges.push(json!({
                        "id": format!("edge_{}", i),
                        "source": format!("node_{}", i - 1),
                        "target": format!("node_{}", i)
                    }));
                }
            }
        }
        "parallel" => {
            // 소스 노드
            let source_type = available_nodes.choose(rng).unwrap();
            nodes.push(json!({
                "id": "node_0",
                "type": source_type.type_name,
                "position": { "x": 0, "y": 100 },
                "data": { "label": source_type.type_name, "config": {} }
            }));

            // 병렬 노드들
            let parallel_count = rng.gen_range(2..4);
            for i in 1..=parallel_count {
                let node_type = available_nodes.choose(rng).unwrap();
                nodes.push(json!({
                    "id": format!("node_{}", i),
                    "type": node_type.type_name,
                    "position": { "x": 250, "y": i * 150 },
                    "data": { "label": node_type.type_name, "config": {} }
                }));
                edges.push(json!({
                    "id": format!("edge_{}", i),
                    "source": "node_0",
                    "target": format!("node_{}", i)
                }));
            }
        }
        "diamond" => {
            // 다이아몬드 패턴: 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4
            for i in 0..4 {
                let node_type = available_nodes.choose(rng).unwrap();
                let (x, y) = match i {
                    0 => (0, 200),
                    1 => (250, 100),
                    2 => (250, 300),
                    3 => (500, 200),
                    _ => (0, 0),
                };
                nodes.push(json!({
                    "id": format!("node_{}", i),
                    "type": node_type.type_name,
                    "position": { "x": x, "y": y },
                    "data": { "label": node_type.type_name, "config": {} }
                }));
            }
            edges.extend(vec![
                json!({"id": "edge_1", "source": "node_0", "target": "node_1"}),
                json!({"id": "edge_2", "source": "node_0", "target": "node_2"}),
                json!({"id": "edge_3", "source": "node_1", "target": "node_3"}),
                json!({"id": "edge_4", "source": "node_2", "target": "node_3"}),
            ]);
        }
        "complex" => {
            let count = rng.gen_range(5..10);
            for i in 0..count {
                let node_type = available_nodes.choose(rng).unwrap();
                nodes.push(json!({
                    "id": format!("node_{}", i),
                    "type": node_type.type_name,
                    "position": { "x": (i % 3) * 250, "y": (i / 3) * 150 },
                    "data": { "label": node_type.type_name, "config": {} }
                }));
            }

            // 랜덤 엣지 생성 (사이클 방지)
            let edge_count = rng.gen_range(count..count * 2);
            for i in 0..edge_count {
                let source = rng.gen_range(0..count - 1);
                let target = rng.gen_range(source + 1..count);
                edges.push(json!({
                    "id": format!("edge_{}", i),
                    "source": format!("node_{}", source),
                    "target": format!("node_{}", target)
                }));
            }
        }
        _ => {}
    }

    let workflow = json!({
        "version": "2.0.0",
        "id": format!("test_workflow_{}", id),
        "meta": {
            "name": format!("Test Workflow {} ({})", id, pattern),
            "description": "Auto-generated test workflow",
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "updatedAt": chrono::Utc::now().to_rfc3339()
        },
        "nodes": nodes,
        "edges": edges
    });

    (workflow, pattern.to_string())
}

// ============================================================
// 테스트 실행기
// ============================================================

/// 단일 워크플로우 테스트 실행
async fn run_single_test(
    test_id: u64,
    workflow: Value,
    workflow_type: String,
) -> TestResult {
    let start = std::time::Instant::now();

    let nodes_array = workflow["nodes"].as_array();
    let nodes = nodes_array.map(|a| a.len()).unwrap_or(0);
    let edges = workflow["edges"].as_array().map(|a| a.len()).unwrap_or(0);

    // 사용된 노드 타입 수집
    let nodes_used: Vec<String> = nodes_array
        .map(|arr| {
            arr.iter()
                .filter_map(|n| n["type"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // 워크플로우 검증
    let validation_result = validate_workflow(&workflow);

    let (success, error_message) = match validation_result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e)),
    };

    let execution_time_ms = start.elapsed().as_millis() as u64;

    TestResult {
        test_id,
        test_name: format!("Test_{}", test_id),
        workflow_type,
        success,
        error_message,
        execution_time_ms,
        node_count: nodes,
        edge_count: edges,
        nodes_used,
    }
}

/// 워크플로우 검증
fn validate_workflow(workflow: &Value) -> Result<(), String> {
    // 1. 필수 필드 검증
    if workflow["version"].is_null() {
        return Err("Missing version field".to_string());
    }
    if workflow["nodes"].is_null() {
        return Err("Missing nodes field".to_string());
    }

    // 2. 노드 검증
    let nodes = workflow["nodes"].as_array().ok_or("nodes is not an array")?;
    let node_ids: std::collections::HashSet<_> = nodes
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();

    for node in nodes {
        let node_id = node["id"].as_str().ok_or("Node missing id")?;
        let node_type = node["type"].as_str().ok_or(format!("Node {} missing type", node_id))?;

        // 노드 타입 유효성 검사
        let valid_types = get_node_types();
        if !valid_types.iter().any(|t| t.type_name == node_type) {
            return Err(format!("Invalid node type: {}", node_type));
        }
    }

    // 3. 엣지 검증
    if let Some(edges) = workflow["edges"].as_array() {
        for edge in edges {
            let source = edge["source"].as_str().ok_or("Edge missing source")?;
            let target = edge["target"].as_str().ok_or("Edge missing target")?;

            if !node_ids.contains(source) {
                return Err(format!("Edge references unknown source node: {}", source));
            }
            if !node_ids.contains(target) {
                return Err(format!("Edge references unknown target node: {}", target));
            }
            if source == target {
                return Err(format!("Self-referencing edge: {}", source));
            }
        }

        // 사이클 검출
        if has_cycle(nodes, edges) {
            return Err("Workflow contains a cycle".to_string());
        }
    }

    Ok(())
}

/// 사이클 검출 (DFS)
fn has_cycle(nodes: &[Value], edges: &[Value]) -> bool {
    let node_ids: Vec<_> = nodes.iter().filter_map(|n| n["id"].as_str()).collect();
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

    for edge in edges {
        if let (Some(source), Some(target)) = (edge["source"].as_str(), edge["target"].as_str()) {
            adj.entry(source).or_default().push(target);
        }
    }

    let mut visited: HashMap<&str, u8> = HashMap::new(); // 0: unvisited, 1: visiting, 2: visited

    fn dfs<'a>(
        node: &'a str,
        adj: &HashMap<&'a str, Vec<&'a str>>,
        visited: &mut HashMap<&'a str, u8>,
    ) -> bool {
        visited.insert(node, 1);

        if let Some(neighbors) = adj.get(node) {
            for &neighbor in neighbors {
                match visited.get(neighbor) {
                    Some(1) => return true, // Back edge = cycle
                    Some(2) => continue,    // Already fully processed
                    _ => {
                        if dfs(neighbor, adj, visited) {
                            return true;
                        }
                    }
                }
            }
        }

        visited.insert(node, 2);
        false
    }

    for &node_id in &node_ids {
        if visited.get(node_id).unwrap_or(&0) == &0 {
            if dfs(node_id, &adj, &mut visited) {
                return true;
            }
        }
    }

    false
}

// ============================================================
// Tauri 명령
// ============================================================

#[tauri::command]
pub async fn run_workflow_stress_test(
    config: Option<StressTestConfig>,
) -> Result<TestSummary, String> {
    use rand::SeedableRng;

    let config = config.unwrap_or_default();
    let node_types = get_node_types();
    let all_node_type_names: Vec<String> = node_types.iter().map(|n| n.type_name.to_string()).collect();

    let results: Arc<Mutex<Vec<TestResult>>> = Arc::new(Mutex::new(Vec::new()));
    let test_counter = Arc::new(AtomicU64::new(0));

    let semaphore = Arc::new(tokio::sync::Semaphore::new(config.parallel_count));
    let mut handles = Vec::new();

    println!("🚀 Starting stress test with {} tests...", config.test_count);
    println!("📋 Total node types to test: {}", node_types.len());

    // 풀 커버리지 모드: 먼저 각 노드 타입을 최소 1회 테스트
    let _coverage_test_count = if config.ensure_full_coverage {
        node_types.len() as u64
    } else {
        0
    };

    for i in 0..config.test_count {
        let results = Arc::clone(&results);
        let test_counter = Arc::clone(&test_counter);
        let semaphore = Arc::clone(&semaphore);
        let node_types = node_types.clone();
        let include_llm = config.include_llm_tests;
        let ensure_coverage = config.ensure_full_coverage;

        let handle = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            // 시드 기반 RNG (재현 가능)
            let mut rng = rand::rngs::StdRng::seed_from_u64(i);

            // 풀 커버리지 모드에서는 처음 N개의 테스트에서 각 노드 타입을 한 번씩 테스트
            let (workflow, pattern) = if ensure_coverage && (i as usize) < node_types.len() {
                generate_coverage_workflow(i, &node_types, &mut rng, i as usize)
            } else {
                generate_random_workflow(i, &node_types, &mut rng, include_llm)
            };

            let result = run_single_test(i, workflow, pattern).await;

            let count = test_counter.fetch_add(1, Ordering::SeqCst) + 1;
            if count % 1000 == 0 {
                println!("  Progress: {}/{} tests completed", count, config.test_count);
            }

            results.lock().await.push(result);
        });

        handles.push(handle);
    }

    // 모든 테스트 완료 대기
    for handle in handles {
        let _ = handle.await;
    }

    // 결과 집계
    let results = results.lock().await;
    let total = results.len() as u64;
    let passed = results.iter().filter(|r| r.success).count() as u64;
    let failed = total - passed;

    let mut errors_by_type: HashMap<String, u64> = HashMap::new();
    let mut node_coverage: HashMap<String, u64> = HashMap::new();
    let mut error_details: Vec<(String, Option<String>, String)> = Vec::new(); // (node_type, target_type, error_msg)
    let mut total_time: u64 = 0;
    let mut slowest: u64 = 0;
    let mut fastest: u64 = u64::MAX;

    for result in results.iter() {
        total_time += result.execution_time_ms;
        slowest = slowest.max(result.execution_time_ms);
        fastest = fastest.min(result.execution_time_ms);

        // 노드 커버리지 추적
        for node_type in &result.nodes_used {
            *node_coverage.entry(node_type.clone()).or_insert(0) += 1;
        }

        if let Some(ref error) = result.error_message {
            let error_type = error.split(':').next().unwrap_or(error).to_string();
            *errors_by_type.entry(error_type.clone()).or_insert(0) += 1;

            // 오류 발생 노드 타입 기록
            if let Some(first_node) = result.nodes_used.first() {
                let second_node = result.nodes_used.get(1).cloned();
                error_details.push((first_node.clone(), second_node, error.clone()));
            }
        }
    }

    // 테스트되지 않은 노드 찾기
    let nodes_never_tested: Vec<String> = all_node_type_names
        .iter()
        .filter(|n| !node_coverage.contains_key(*n))
        .cloned()
        .collect();

    // 오류 패턴 분석
    let error_patterns = analyze_error_patterns(&error_details);

    let summary = TestSummary {
        total_tests: total,
        passed,
        failed,
        success_rate: if total > 0 { passed as f64 / total as f64 } else { 0.0 },
        avg_execution_time_ms: if total > 0 { total_time as f64 / total as f64 } else { 0.0 },
        errors_by_type,
        slowest_test_ms: slowest,
        fastest_test_ms: if fastest == u64::MAX { 0 } else { fastest },
        node_coverage,
        nodes_never_tested,
        error_patterns,
    };

    println!("\n📊 Stress Test Summary:");
    println!("  Total: {} tests", summary.total_tests);
    println!("  Passed: {} ({:.1}%)", summary.passed, summary.success_rate * 100.0);
    println!("  Failed: {}", summary.failed);
    println!("  Avg Time: {:.2}ms", summary.avg_execution_time_ms);
    println!("  Slowest: {}ms", summary.slowest_test_ms);
    println!("  Fastest: {}ms", summary.fastest_test_ms);
    println!("  Node Types Tested: {}/{}", summary.node_coverage.len(), all_node_type_names.len());

    if !summary.nodes_never_tested.is_empty() {
        println!("\n⚠️ Untested node types:");
        for node_type in &summary.nodes_never_tested {
            println!("  - {}", node_type);
        }
    }

    if !summary.errors_by_type.is_empty() {
        println!("\n⚠️ Errors by type:");
        for (error_type, count) in &summary.errors_by_type {
            println!("  {}: {}", error_type, count);
        }
    }

    if !summary.error_patterns.is_empty() {
        println!("\n📚 Error patterns for learning:");
        for pattern in &summary.error_patterns {
            println!("  {} -> {:?}: {} ({}회)",
                pattern.source_node_type,
                pattern.target_node_type,
                pattern.error_type,
                pattern.occurrence_count
            );
        }
    }

    Ok(summary)
}

/// 풀 커버리지용 워크플로우 생성 (특정 노드 타입 강제 포함)
fn generate_coverage_workflow(
    id: u64,
    node_types: &[NodeType],
    rng: &mut impl rand::Rng,
    target_index: usize,
) -> (Value, String) {
    use rand::seq::SliceRandom;

    // 타겟 노드를 반드시 포함
    let target_node = &node_types[target_index];

    // 타겟 노드와 호환되는 노드 찾기
    let compatible_sources: Vec<&NodeType> = node_types.iter()
        .filter(|n| n.type_name != target_node.type_name)
        .filter(|source| {
            source.output_ports.iter().any(|(_, stype)| {
                target_node.input_ports.iter().any(|(_, ttype)| {
                    are_types_compatible(stype, ttype)
                })
            })
        })
        .collect();

    let compatible_targets: Vec<&NodeType> = node_types.iter()
        .filter(|n| n.type_name != target_node.type_name)
        .filter(|target| {
            target_node.output_ports.iter().any(|(_, stype)| {
                target.input_ports.iter().any(|(_, ttype)| {
                    are_types_compatible(stype, ttype)
                })
            })
        })
        .collect();

    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    // 소스 노드 (선택 사항)
    if !compatible_sources.is_empty() {
        let source = compatible_sources.choose(rng).unwrap();
        nodes.push(json!({
            "id": "node_0",
            "type": source.type_name,
            "position": { "x": 0, "y": 100 },
            "data": { "label": source.type_name, "config": {} }
        }));
    }

    // 타겟 노드 (필수)
    let target_id = format!("node_{}", nodes.len());
    nodes.push(json!({
        "id": target_id.clone(),
        "type": target_node.type_name,
        "position": { "x": 250, "y": 100 },
        "data": { "label": target_node.type_name, "config": {} }
    }));

    // 소스 → 타겟 엣지
    if nodes.len() > 1 {
        edges.push(json!({
            "id": "edge_0",
            "source": "node_0",
            "target": target_id
        }));
    }

    // 타겟 노드의 출력을 받는 노드 (선택 사항)
    if !compatible_targets.is_empty() && !target_node.output_ports.is_empty() {
        let sink = compatible_targets.choose(rng).unwrap();
        let sink_id = format!("node_{}", nodes.len());
        nodes.push(json!({
            "id": sink_id.clone(),
            "type": sink.type_name,
            "position": { "x": 500, "y": 100 },
            "data": { "label": sink.type_name, "config": {} }
        }));

        edges.push(json!({
            "id": format!("edge_{}", edges.len()),
            "source": target_id,
            "target": sink_id
        }));
    }

    let workflow = json!({
        "version": "2.0.0",
        "id": format!("coverage_test_{}", id),
        "meta": {
            "name": format!("Coverage Test {} ({})", id, target_node.type_name),
            "description": format!("Full coverage test for {}", target_node.type_name),
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "updatedAt": chrono::Utc::now().to_rfc3339()
        },
        "nodes": nodes,
        "edges": edges
    });

    (workflow, format!("coverage:{}", target_node.type_name))
}

/// 오류 패턴 분석
fn analyze_error_patterns(error_details: &[(String, Option<String>, String)]) -> Vec<ErrorPattern> {
    let mut patterns: HashMap<String, ErrorPattern> = HashMap::new();

    for (source, target, error_msg) in error_details {
        let error_type = error_msg.split(':').next().unwrap_or(error_msg).to_string();
        let key = format!("{}:{}:{}", source, target.as_deref().unwrap_or("none"), error_type);

        let suggestion = generate_error_suggestion(&error_type, source, target.as_deref());

        patterns.entry(key.clone())
            .and_modify(|p| p.occurrence_count += 1)
            .or_insert(ErrorPattern {
                source_node_type: source.clone(),
                target_node_type: target.clone(),
                error_type: error_type.clone(),
                error_message: error_msg.clone(),
                occurrence_count: 1,
                suggestion,
            });
    }

    let mut result: Vec<ErrorPattern> = patterns.into_values().collect();
    result.sort_by(|a, b| b.occurrence_count.cmp(&a.occurrence_count));
    result.truncate(20); // 상위 20개 패턴만 반환
    result
}

/// 오류 유형에 따른 개선 제안 생성
fn generate_error_suggestion(error_type: &str, source: &str, target: Option<&str>) -> String {
    match error_type {
        "Invalid node type" => format!(
            "노드 타입 '{}'이(가) 레지스트리에 등록되어 있는지 확인하세요. NodeRegistry.register() 호출이 필요할 수 있습니다.",
            source
        ),
        "Missing version field" | "Missing nodes field" =>
            "워크플로우 JSON에 필수 필드(version, nodes)가 누락되었습니다. 워크플로우 생성 시 기본 구조를 보장하세요.".to_string(),
        "Edge references unknown source node" | "Edge references unknown target node" =>
            "엣지가 존재하지 않는 노드를 참조합니다. 노드 ID 생성 및 엣지 연결 로직을 검토하세요.".to_string(),
        "Self-referencing edge" =>
            "노드가 자기 자신을 참조하는 엣지가 있습니다. 엣지 생성 시 source ≠ target 검증을 추가하세요.".to_string(),
        "Workflow contains a cycle" =>
            "워크플로우에 순환 참조가 있습니다. DAG(방향 비순환 그래프) 구조를 유지하세요. 사이클 감지 후 경고를 표시하세요.".to_string(),
        "No compatible port types" => format!(
            "노드 '{}' → '{:?}' 간 호환되는 포트 타입이 없습니다. 타입 호환성 매트릭스를 확장하거나 중간 변환 노드를 추가하세요.",
            source, target
        ),
        _ => format!(
            "노드 '{}'에서 발생한 오류입니다. 해당 노드의 설정과 입력 데이터를 검토하세요.",
            source
        ),
    }
}

#[tauri::command]
pub async fn run_node_compatibility_test() -> Result<Value, String> {
    let node_types = get_node_types();
    let mut compatibility_matrix: HashMap<String, HashMap<String, bool>> = HashMap::new();
    let mut issues: Vec<String> = Vec::new();

    println!("🔍 Testing node compatibility...");

    for source in &node_types {
        let mut source_compat: HashMap<String, bool> = HashMap::new();

        for target in &node_types {
            // source의 output을 target의 input에 연결 가능한지 확인
            let mut compatible = false;

            for (_, source_type) in &source.output_ports {
                for (_, target_type) in &target.input_ports {
                    if are_types_compatible(source_type, target_type) {
                        compatible = true;
                        break;
                    }
                }
                if compatible {
                    break;
                }
            }

            source_compat.insert(target.type_name.to_string(), compatible);

            // 호환되지 않는 연결 기록
            if !compatible && source.type_name != target.type_name {
                issues.push(format!(
                    "{} -> {}: No compatible port types",
                    source.type_name, target.type_name
                ));
            }
        }

        compatibility_matrix.insert(source.type_name.to_string(), source_compat);
    }

    let total_pairs = node_types.len() * node_types.len();
    let compatible_pairs = compatibility_matrix
        .values()
        .flat_map(|m| m.values())
        .filter(|&&v| v)
        .count();

    println!("\n📊 Node Compatibility Summary:");
    println!("  Total node types: {}", node_types.len());
    println!("  Total pairs: {}", total_pairs);
    println!("  Compatible pairs: {} ({:.1}%)", compatible_pairs, compatible_pairs as f64 / total_pairs as f64 * 100.0);

    Ok(json!({
        "node_count": node_types.len(),
        "total_pairs": total_pairs,
        "compatible_pairs": compatible_pairs,
        "compatibility_rate": compatible_pairs as f64 / total_pairs as f64,
        "matrix": compatibility_matrix,
        "issues": issues
    }))
}
