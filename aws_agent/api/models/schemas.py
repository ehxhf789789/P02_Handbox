"""
API 요청/응답 스키마
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum


class EvaluatorType(str, Enum):
    """평가 유형"""
    NOVELTY = "novelty"
    PROGRESSIVENESS = "progressiveness"
    FIELD = "field"


class EvaluatorStance(str, Enum):
    """평가 성향"""
    CONSERVATIVE = "conservative"
    PROGRESSIVE = "progressive"
    NEUTRAL = "neutral"


class EvaluatorExpertise(str, Enum):
    """전문 분야"""
    STRUCTURE = "structure"
    GEOTECHNICAL = "geotechnical"
    MATERIALS = "materials"
    CONSTRUCTION = "construction"
    ENVIRONMENTAL = "environmental"
    SAFETY = "safety"
    ECONOMICS = "economics"
    PATENT = "patent"
    POLICY = "policy"
    SUSTAINABILITY = "sustainability"


# ===== 평가 요청/응답 =====

class EvaluateRequest(BaseModel):
    """단일 평가 요청"""
    tech_id: str = Field(..., description="신기술 ID")
    evaluator_type: EvaluatorType = Field(..., description="평가 유형 (novelty/progressiveness/field)")
    expertise: Optional[EvaluatorExpertise] = Field(None, description="전문 분야")
    stance: Optional[EvaluatorStance] = Field(None, description="평가 성향")
    context: Optional[str] = Field(None, description="추가 컨텍스트")


class EvidenceItem(BaseModel):
    """평가 근거 항목"""
    type: str
    content: str
    location: Optional[str] = None
    quantitative_data: Optional[str] = None


class EvaluateResponse(BaseModel):
    """단일 평가 응답"""
    success: bool
    tech_id: str
    evaluator_type: str
    score: float = Field(..., ge=0, le=5, description="점수 (0-5)")
    grade: str = Field(..., description="등급")
    pass_status: bool = Field(..., description="통과 여부")
    evidence: List[EvidenceItem] = Field(default_factory=list)
    comments: str = Field("", description="평가 의견")
    sub_scores: Optional[Dict[str, float]] = None
    error: Optional[str] = None


class FullEvaluateRequest(BaseModel):
    """전체 평가 요청"""
    tech_id: str = Field(..., description="신기술 ID")
    use_aws: bool = Field(True, description="AWS Bedrock 사용 여부")


class FullEvaluateResponse(BaseModel):
    """전체 평가 응답"""
    success: bool
    tech_id: str
    evaluation_date: str
    stage_1: Dict[str, Any]
    stage_2: Dict[str, Any]
    overall_score: float
    overall_pass: bool
    summary: Dict[str, Any]
    error: Optional[str] = None


# ===== 문서 처리 요청/응답 =====

class ChunkRequest(BaseModel):
    """청킹 요청"""
    text: str = Field(..., description="청킹할 텍스트")
    chunk_size: int = Field(1000, description="청크 크기")
    chunk_overlap: int = Field(200, description="오버랩 크기")


class ChunkResponse(BaseModel):
    """청킹 응답"""
    success: bool
    chunks: List[Dict[str, Any]]
    chunks_count: int
    error: Optional[str] = None


class EmbeddingRequest(BaseModel):
    """임베딩 요청"""
    texts: List[str] = Field(..., description="임베딩할 텍스트 목록")


class EmbeddingResponse(BaseModel):
    """임베딩 응답"""
    success: bool
    embeddings: List[List[float]]
    dimension: int
    error: Optional[str] = None


class SearchRequest(BaseModel):
    """검색 요청"""
    query: str = Field(..., description="검색 쿼리")
    tech_id: Optional[str] = Field(None, description="신기술 ID 필터")
    k: int = Field(10, description="반환할 결과 수")


class SearchResult(BaseModel):
    """검색 결과 항목"""
    content: str
    section: Optional[str]
    page_numbers: List[int]
    score: float


class SearchResponse(BaseModel):
    """검색 응답"""
    success: bool
    results: List[SearchResult]
    total: int
    error: Optional[str] = None


# ===== LLM 직접 호출 =====

class LLMRequest(BaseModel):
    """LLM 호출 요청"""
    prompt: str = Field(..., description="프롬프트")
    system_prompt: Optional[str] = Field(None, description="시스템 프롬프트")
    max_tokens: int = Field(4096, description="최대 토큰")
    temperature: float = Field(0.1, description="온도")


class LLMResponse(BaseModel):
    """LLM 호출 응답"""
    success: bool
    response: str
    model: str
    usage: Optional[Dict[str, int]] = None
    error: Optional[str] = None


# ===== 10명 평가위원 요청 =====

class MultiEvaluatorRequest(BaseModel):
    """다중 평가위원 요청"""
    tech_id: str = Field(..., description="신기술 ID")
    document_context: Optional[str] = Field(None, description="문서 컨텍스트")
    evaluators: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="평가위원 설정 목록"
    )


class EvaluatorResult(BaseModel):
    """개별 평가위원 결과"""
    evaluator_id: str
    expertise: str
    stance: str
    verdict: str  # "Approved" or "Rejected"
    novelty_score: float
    progress_score: float
    confidence: float
    citation: str
    evidence: List[Dict[str, Any]]


class MultiEvaluatorResponse(BaseModel):
    """다중 평가위원 응답"""
    success: bool
    tech_id: str
    evaluator_results: List[EvaluatorResult]
    approved_count: int
    rejected_count: int
    final_verdict: str
    error: Optional[str] = None


# ===== 헬스 체크 =====

class HealthResponse(BaseModel):
    """헬스 체크 응답"""
    status: str
    aws_configured: bool
    bedrock_available: bool
    opensearch_available: bool
    version: str = "1.0.0"
