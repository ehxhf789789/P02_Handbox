// 에이전트 관리 커맨드

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub agent_type: AgentType,
    pub model_id: String,
    pub system_prompt: String,
    pub evaluation_criteria: Vec<EvaluationCriterion>,
    pub tools: Vec<AgentTool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum AgentType {
    NoveltyEvaluator,       // 신규성 평가
    ProgressEvaluator,      // 진보성 평가
    FieldExcellenceEvaluator, // 현장적용성 평가
    CustomEvaluator,        // 사용자 정의
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EvaluationCriterion {
    pub name: String,
    pub weight: f32,
    pub description: String,
    pub scoring_guide: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentTool {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentExecutionRequest {
    pub agent_id: String,
    pub input: serde_json::Value,
    pub context: Option<Vec<String>>,  // RAG 컨텍스트
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentExecutionResult {
    pub agent_id: String,
    pub score: f32,
    pub grade: String,
    pub evidence: Vec<Evidence>,
    pub comments: String,
    pub raw_response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Evidence {
    pub evidence_type: String,
    pub content: String,
    pub source: String,
}

// 기본 에이전트 템플릿
lazy_static::lazy_static! {
    static ref DEFAULT_AGENTS: Vec<AgentConfig> = vec![
        AgentConfig {
            id: "novelty-agent".to_string(),
            name: "신규성 평가 에이전트".to_string(),
            description: "건설신기술의 신규성을 평가합니다".to_string(),
            agent_type: AgentType::NoveltyEvaluator,
            model_id: "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
            system_prompt: include_str!("../../prompts/novelty_system.txt").to_string(),
            evaluation_criteria: vec![
                EvaluationCriterion {
                    name: "기존기술과의 차별성".to_string(),
                    weight: 0.6,
                    description: "선행기술 대비 차별화된 기술요소".to_string(),
                    scoring_guide: "5점: 3개 이상 차별화, 4점: 1-2개 차별화, 3점: 개량 수준".to_string(),
                },
                EvaluationCriterion {
                    name: "독창성 및 자립성".to_string(),
                    weight: 0.4,
                    description: "독자적 연구개발 및 특허 보유".to_string(),
                    scoring_guide: "5점: 특허 등록 완료, 4점: 특허 출원, 3점: 자체 기술요소 포함".to_string(),
                },
            ],
            tools: vec![],
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        },
        AgentConfig {
            id: "progress-agent".to_string(),
            name: "진보성 평가 에이전트".to_string(),
            description: "건설신기술의 진보성을 평가합니다".to_string(),
            agent_type: AgentType::ProgressEvaluator,
            model_id: "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
            system_prompt: include_str!("../../prompts/progress_system.txt").to_string(),
            evaluation_criteria: vec![
                EvaluationCriterion {
                    name: "품질향상".to_string(),
                    weight: 0.3,
                    description: "정량적 성능 향상 수치".to_string(),
                    scoring_guide: "5점: 30%+, 4점: 15-30%, 3점: 5-15%".to_string(),
                },
                EvaluationCriterion {
                    name: "안전성".to_string(),
                    weight: 0.35,
                    description: "구조적/시공/사용 안전성".to_string(),
                    scoring_guide: "구조계산서, 안전인증 보유 여부".to_string(),
                },
                EvaluationCriterion {
                    name: "첨단기술성".to_string(),
                    weight: 0.2,
                    description: "ICT/IoT/AI 등 첨단기술 활용".to_string(),
                    scoring_guide: "스마트건설기술 부합성".to_string(),
                },
                EvaluationCriterion {
                    name: "개량정도".to_string(),
                    weight: 0.15,
                    description: "기존 기술 단점 극복".to_string(),
                    scoring_guide: "문제점 해결 및 시공 편의성".to_string(),
                },
            ],
            tools: vec![],
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        },
        AgentConfig {
            id: "field-agent".to_string(),
            name: "현장적용성 평가 에이전트".to_string(),
            description: "건설신기술의 현장적용성을 평가합니다".to_string(),
            agent_type: AgentType::FieldExcellenceEvaluator,
            model_id: "anthropic.claude-3-5-sonnet-20240620-v1:0".to_string(),
            system_prompt: include_str!("../../prompts/field_system.txt").to_string(),
            evaluation_criteria: vec![
                EvaluationCriterion {
                    name: "현장우수성".to_string(),
                    weight: 0.4,
                    description: "시공성, 안전성, 유지관리, 환경성".to_string(),
                    scoring_guide: "현장 적용 실적 3건 이상 필수".to_string(),
                },
                EvaluationCriterion {
                    name: "경제성".to_string(),
                    weight: 0.35,
                    description: "비용절감, 공기단축".to_string(),
                    scoring_guide: "5점: 20%+ 절감 또는 30%+ 공기단축".to_string(),
                },
                EvaluationCriterion {
                    name: "보급성".to_string(),
                    weight: 0.25,
                    description: "시장성, 공익성".to_string(),
                    scoring_guide: "적용 분야 및 시장 규모".to_string(),
                },
            ],
            tools: vec![],
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        },
    ];
}

/// 에이전트 생성
#[tauri::command]
pub async fn create_agent(config: AgentConfig) -> Result<AgentConfig, String> {
    let mut agent = config;

    if agent.id.is_empty() {
        agent.id = Uuid::new_v4().to_string();
    }

    let now = Utc::now().to_rfc3339();
    agent.created_at = now.clone();
    agent.updated_at = now;

    // 저장 로직 (실제로는 파일 또는 DB에 저장)

    Ok(agent)
}

/// 에이전트 목록 조회
#[tauri::command]
pub async fn list_agents() -> Result<Vec<AgentConfig>, String> {
    // 기본 에이전트 + 사용자 정의 에이전트
    Ok(DEFAULT_AGENTS.clone())
}

/// 에이전트 실행
#[tauri::command]
pub async fn execute_agent(
    request: AgentExecutionRequest,
) -> Result<AgentExecutionResult, String> {
    // 에이전트 설정 로드
    let agent = DEFAULT_AGENTS.iter()
        .find(|a| a.id == request.agent_id)
        .ok_or(format!("Agent not found: {}", request.agent_id))?;

    // 컨텍스트 구성
    let context_str = request.context
        .map(|c| c.join("\n\n---\n\n"))
        .unwrap_or_default();

    // 프롬프트 구성
    let prompt = format!(
        "## 평가 대상 문서\n{}\n\n## 컨텍스트\n{}\n\n## 평가 요청\n위 내용을 평가 기준에 따라 분석하고 JSON 형식으로 결과를 제시하세요.",
        serde_json::to_string_pretty(&request.input).unwrap_or_default(),
        context_str
    );

    // Bedrock 호출 (실제로는 aws_service::invoke_bedrock 사용)
    let raw_response = format!(
        r#"{{"score": 4.0, "grade": "양호", "comments": "평가 완료"}}"#
    );

    // 응답 파싱
    let parsed: serde_json::Value = serde_json::from_str(&raw_response)
        .map_err(|e| format!("Response parsing failed: {}", e))?;

    Ok(AgentExecutionResult {
        agent_id: agent.id.clone(),
        score: parsed["score"].as_f64().unwrap_or(0.0) as f32,
        grade: parsed["grade"].as_str().unwrap_or("").to_string(),
        evidence: vec![],
        comments: parsed["comments"].as_str().unwrap_or("").to_string(),
        raw_response,
    })
}
