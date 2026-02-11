"""
기본 평가 에이전트
- Bedrock Claude + RAG 기반
"""

import json
import boto3
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig
from aws_agent.preprocessing.embedder import BedrockEmbedder
from aws_agent.vectorstore.opensearch_client import OpenSearchVectorStore


@dataclass
class EvaluationResult:
    """평가 결과 데이터 구조"""
    criterion: str  # 평가 항목 (신규성, 진보성 등)
    score: float  # 점수 (1-5)
    grade: str  # 등급 (우수, 양호, 보통, 미흡, 불인정)
    evidence: List[Dict[str, Any]]  # 근거 목록
    comments: str  # 평가 의견
    pass_status: bool  # 통과 여부
    sub_scores: Optional[Dict[str, float]] = None  # 세부 항목 점수

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class BaseEvaluationAgent(ABC):
    """평가 에이전트 기본 클래스"""

    GRADE_MAP = {
        5: "우수",
        4: "양호",
        3: "보통",
        2: "미흡",
        1: "불인정"
    }

    def __init__(self, config: AWSConfig = None):
        self.config = config or AWSConfig()
        self.bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=self.config.bedrock_region
        )
        self.embedder = BedrockEmbedder(self.config)
        self.vectorstore = OpenSearchVectorStore(self.config)

        # 에이전트 설정
        self.criterion_name = "기본"
        self.system_prompt = self._get_system_prompt()

    @abstractmethod
    def _get_system_prompt(self) -> str:
        """시스템 프롬프트 반환 (하위 클래스에서 구현)"""
        pass

    @abstractmethod
    def _get_evaluation_prompt(self, context: str, tech_id: str) -> str:
        """평가 프롬프트 생성 (하위 클래스에서 구현)"""
        pass

    def retrieve_context(
        self,
        tech_id: str,
        queries: List[str],
        k: int = None
    ) -> str:
        """RAG: 관련 문서 검색 및 컨텍스트 구성"""
        k = k or self.config.retrieval_k
        all_results = []

        for query in queries:
            # 쿼리 임베딩 생성
            query_embedding = self.embedder.embed_query(query)

            # 벡터 검색
            results = self.vectorstore.search(
                query_embedding=query_embedding,
                tech_id=tech_id,
                k=k
            )
            all_results.extend(results)

        # 중복 제거 및 정렬
        seen = set()
        unique_results = []
        for r in all_results:
            key = f"{r['tech_id']}_{r['chunk_index']}"
            if key not in seen:
                seen.add(key)
                unique_results.append(r)

        # 점수순 정렬
        unique_results.sort(key=lambda x: x.get("_score", 0), reverse=True)

        # 컨텍스트 문자열 생성
        context_parts = []
        for i, result in enumerate(unique_results[:k * len(queries)]):
            context_parts.append(
                f"[문서 {i+1}] (섹션: {result.get('section', '알 수 없음')}, "
                f"페이지: {result.get('page_numbers', [])})\n"
                f"{result.get('content', '')}\n"
            )

        return "\n---\n".join(context_parts)

    def invoke_llm(self, prompt: str) -> str:
        """Bedrock Claude 호출"""
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "temperature": 0.1,
            "system": self.system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        response = self.bedrock_client.invoke_model(
            modelId=self.config.bedrock_model_id,
            body=json.dumps(request_body),
            contentType="application/json",
            accept="application/json"
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]

    def parse_evaluation_response(self, response: str) -> EvaluationResult:
        """LLM 응답 파싱"""
        # JSON 추출 시도
        try:
            # JSON 블록 찾기
            import re
            json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # JSON 객체 직접 찾기
                json_match = re.search(r'\{.*\}', response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    raise ValueError("JSON not found")

            data = json.loads(json_str)

            # 점수를 등급으로 변환
            score = data.get("score", 3)
            grade = self.GRADE_MAP.get(round(score), "보통")

            return EvaluationResult(
                criterion=self.criterion_name,
                score=score,
                grade=grade,
                evidence=data.get("evidence", []),
                comments=data.get("comments", ""),
                pass_status=score >= 3,
                sub_scores=data.get("sub_scores")
            )

        except Exception as e:
            print(f"[경고] 응답 파싱 실패: {e}")
            # 기본 결과 반환
            return EvaluationResult(
                criterion=self.criterion_name,
                score=0,
                grade="파싱오류",
                evidence=[],
                comments=f"응답 파싱 실패: {response[:500]}",
                pass_status=False
            )

    def evaluate(self, tech_id: str) -> EvaluationResult:
        """평가 실행"""
        print(f"\n[평가] {tech_id} - {self.criterion_name}")

        # 1. 관련 문서 검색
        queries = self._get_search_queries()
        context = self.retrieve_context(tech_id, queries)

        if not context:
            return EvaluationResult(
                criterion=self.criterion_name,
                score=0,
                grade="검색실패",
                evidence=[],
                comments="관련 문서를 찾을 수 없습니다.",
                pass_status=False
            )

        # 2. 평가 프롬프트 생성
        prompt = self._get_evaluation_prompt(context, tech_id)

        # 3. LLM 호출
        response = self.invoke_llm(prompt)

        # 4. 결과 파싱
        result = self.parse_evaluation_response(response)

        print(f"  → {result.grade} ({result.score}점)")
        return result

    @abstractmethod
    def _get_search_queries(self) -> List[str]:
        """검색 쿼리 목록 반환 (하위 클래스에서 구현)"""
        pass


class MockEvaluationAgent(BaseEvaluationAgent):
    """테스트용 모의 에이전트"""

    def __init__(self, criterion_name: str = "테스트"):
        self.criterion_name = criterion_name
        self.config = AWSConfig()

    def _get_system_prompt(self) -> str:
        return "테스트 시스템 프롬프트"

    def _get_evaluation_prompt(self, context: str, tech_id: str) -> str:
        return f"테스트 평가 프롬프트: {tech_id}"

    def _get_search_queries(self) -> List[str]:
        return ["테스트 쿼리"]

    def evaluate(self, tech_id: str) -> EvaluationResult:
        """모의 평가 결과 반환"""
        return EvaluationResult(
            criterion=self.criterion_name,
            score=4.0,
            grade="양호",
            evidence=[{"type": "mock", "content": "테스트 근거"}],
            comments="테스트 평가 의견",
            pass_status=True
        )


if __name__ == "__main__":
    # 테스트
    print("=== 평가 에이전트 테스트 ===")

    mock_agent = MockEvaluationAgent("신규성")
    result = mock_agent.evaluate("2367")

    print(f"\n평가 결과:")
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
