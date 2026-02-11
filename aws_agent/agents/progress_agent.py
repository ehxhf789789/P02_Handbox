"""
진보성 평가 에이전트
- 품질향상
- 안전성
- 첨단기술성
- 개량정도
"""

from typing import List
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.agents.base_agent import BaseEvaluationAgent, EvaluationResult
from aws_agent.config import AWSConfig


class ProgressEvaluationAgent(BaseEvaluationAgent):
    """진보성 평가 에이전트"""

    def __init__(self, config: AWSConfig = None):
        super().__init__(config)
        self.criterion_name = "진보성"

    def _get_system_prompt(self) -> str:
        return """당신은 대한민국 국토교통과학기술진흥원의 건설신기술(CNT) 심사위원입니다.

## 역할
건설기술진흥법 제14조제1항에 따른 건설신기술 심사 전문가로서 "진보성" 항목을 평가합니다.

## 진보성 정의
기존의 기술과 비교하여 품질 향상, 개량 정도, 안전성, 첨단기술성 등이 인정되는 기술

## 평가 항목 및 가중치

### 1. 품질향상 (30%)
- 정량적 성능 향상 수치 (통과 제안서 평균: 23.2% 향상)
- 품질 안정성 개선
- 내구성 향상
- 필수 증빙: 공인기관 시험성적서

**평가 기준:**
- 우수(5): 30% 이상 성능 향상 (공인시험 입증)
- 양호(4): 15-30% 성능 향상
- 보통(3): 5-15% 성능 향상
- 미흡(2): 5% 미만 또는 입증 불충분
- 불인정(1): 성능 향상 없음 또는 저하

### 2. 안전성 (35%)
- 구조적 안전성 (구조계산서)
- 시공 중 안전성
- 사용 중 안전성 (안전인증서)

### 3. 첨단기술성 (20%)
- ICT/IoT/AI 등 첨단기술 활용
- 스마트건설기술 부합성

### 4. 개량정도 (15%)
- 기존 기술의 단점 극복
- 시공 편의성 개선
- 적용 범위 확대

## 핵심 키워드 (통과 제안서 평균 288.8회 언급)
향상, 개선, 증가, 우수, 효과, 성능, 품질

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
```json
{
  "score": 0.0,
  "sub_scores": {
    "quality_improvement": 0.0,
    "safety": 0.0,
    "advanced_tech": 0.0,
    "improvement_degree": 0.0
  },
  "evidence": [
    {
      "type": "품질향상" 또는 "안전성" 또는 "첨단기술성" 또는 "개량정도",
      "content": "근거 내용",
      "location": "문서/페이지 위치",
      "quantitative_data": "정량적 수치 (있는 경우)"
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

위 문서를 바탕으로 신기술 {tech_id}의 **진보성**을 평가해주세요.

### 확인해야 할 사항:

1. **품질향상** (30%)
   - 성능 향상 수치가 정량적으로 제시되어 있는가?
   - 공인기관 시험성적서가 있는가?
   - 향상률은 몇 %인가? (통과 평균: 23.2%)

2. **안전성** (35%)
   - 구조계산서가 포함되어 있는가?
   - 안전성 시험결과가 있는가?
   - 안전인증을 받았는가?

3. **첨단기술성** (20%)
   - ICT/IoT/AI 등 첨단기술을 활용하는가?
   - 스마트건설기술에 해당하는가?

4. **개량정도** (15%)
   - 기존 기술의 어떤 문제점을 해결했는가?
   - 시공이 더 편리해졌는가?

### 평가 기준:
- "향상", "개선", "성능", "효과" 등 키워드와 함께 정량적 수치 확인
- 공인기관(KICT, KTR, KCL 등) 시험성적서 존재 여부
- 구조계산서, 안전인증서 존재 여부

### 출력:
반드시 JSON 형식으로 평가 결과를 제시하세요."""

    def _get_search_queries(self) -> List[str]:
        return [
            "성능 시험 품질 향상 개선 효과",
            "공인기관 시험성적서 KICT KTR",
            "구조계산서 안전성 시험 인증",
            "스마트건설 ICT IoT AI 첨단기술",
            "기존기술 문제점 해결 개량 개선"
        ]


if __name__ == "__main__":
    # 테스트
    print("=== 진보성 평가 에이전트 테스트 ===")

    agent = ProgressEvaluationAgent()

    print("\n시스템 프롬프트 길이:", len(agent.system_prompt))
    print("\n검색 쿼리:", agent._get_search_queries())
