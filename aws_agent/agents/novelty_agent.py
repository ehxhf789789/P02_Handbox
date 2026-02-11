"""
신규성 평가 에이전트
- 기존기술과의 차별성
- 독창성 및 자립성
"""

from typing import List
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.agents.base_agent import BaseEvaluationAgent, EvaluationResult
from aws_agent.config import AWSConfig


class NoveltyEvaluationAgent(BaseEvaluationAgent):
    """신규성 평가 에이전트"""

    def __init__(self, config: AWSConfig = None):
        super().__init__(config)
        self.criterion_name = "신규성"

    def _get_system_prompt(self) -> str:
        return """당신은 대한민국 국토교통과학기술진흥원의 건설신기술(CNT) 심사위원입니다.

## 역할
건설기술진흥법 제14조제1항에 따른 건설신기술 심사 전문가로서 "신규성" 항목을 평가합니다.

## 신규성 정의
최초로 개발된 기술이거나 개량된 기술로서 기존기술과 차별성, 독창성과 자립성 등이 인정되는 기술

## 평가 항목 및 가중치

### 1. 기존기술과의 차별성 (60%)
- 선행기술 대비 차별화된 기술요소 존재 여부
- 기술적 접근방법의 새로움
- 적용 분야의 새로움
- 필수 증빙: 선행기술조사 결과서, 기술 비교분석표

### 2. 독창성 및 자립성 (40%)
- 독자적 연구개발 수행 여부
- 핵심기술의 독자 보유
- 외국 기술 의존도
- 필수 증빙: 특허/실용신안 등록증, 연구개발 보고서

## 평가 등급
- 우수 (5점): 핵심 기술요소 3개 이상 차별화, 특허 등록 완료
- 양호 (4점): 기술요소 1-2개 차별화, 특허 출원 이상
- 보통 (3점): 선행기술 개량 수준, 자체 기술요소 포함
- 미흡 (2점): 차별성 불명확, 외국기술 의존도 높음
- 불인정 (1점): 선행기술과 동일, 독자기술 없음

## 핵심 키워드 (통과 제안서 평균 48.5회 언급)
차별, 최초, 독자, 독창, 신규, 새로운, 혁신

## 통과 제안서 특허 보유율: 98%

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
```json
{
  "score": 0.0,
  "sub_scores": {
    "differentiation": 0.0,
    "originality": 0.0
  },
  "evidence": [
    {
      "type": "차별성" 또는 "독창성",
      "content": "근거 내용",
      "location": "문서/페이지 위치"
    }
  ],
  "comments": "종합 평가 의견"
}
```"""

    def _get_evaluation_prompt(self, context: str, tech_id: str) -> str:
        return f"""## 평가 대상
신기술 번호: {tech_id}

## 검색된 관련 문서
{context}

## 평가 지시사항

위 문서를 바탕으로 신기술 {tech_id}의 **신규성**을 평가해주세요.

### 확인해야 할 사항:
1. **기존기술과의 차별성** (60%)
   - 선행기술조사 결과가 제시되어 있는가?
   - 기존 기술 대비 차별화된 기술요소가 명확한가?
   - 기술적 접근방법이 새로운가?

2. **독창성 및 자립성** (40%)
   - 특허/지식재산권이 등록/출원되어 있는가?
   - 독자적 연구개발을 수행했는가?
   - 외국 기술에 의존하지 않는가?

### 평가 기준:
- 문서에서 "차별", "최초", "독자", "독창" 등 키워드 확인
- 특허 등록/출원 여부 확인
- 선행기술 비교분석 내용 확인

### 출력:
반드시 JSON 형식으로 평가 결과를 제시하세요."""

    def _get_search_queries(self) -> List[str]:
        return [
            "선행기술조사 기존기술 비교 차별성",
            "특허 지식재산권 등록 출원",
            "독자개발 독창 신규 최초",
            "기술 차별화 요소 핵심기술"
        ]


if __name__ == "__main__":
    # 테스트
    print("=== 신규성 평가 에이전트 테스트 ===")

    agent = NoveltyEvaluationAgent()

    print("\n시스템 프롬프트 길이:", len(agent.system_prompt))
    print("\n검색 쿼리:", agent._get_search_queries())
