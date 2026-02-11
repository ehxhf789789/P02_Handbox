"""
현장적용성 평가 에이전트
- 현장우수성 (시공성, 안전성, 구조안정성, 유지관리, 환경성)
- 경제성 (비용절감, 공기단축)
- 보급성 (시장성, 공익성)
"""

from typing import List
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.agents.base_agent import BaseEvaluationAgent, EvaluationResult
from aws_agent.config import AWSConfig


class FieldExcellenceAgent(BaseEvaluationAgent):
    """현장적용성 평가 에이전트 (2차 심사)"""

    def __init__(self, config: AWSConfig = None):
        super().__init__(config)
        self.criterion_name = "현장적용성"

    def _get_system_prompt(self) -> str:
        return """당신은 대한민국 국토교통과학기술진흥원의 건설신기술(CNT) 심사위원입니다.

## 역할
건설기술진흥법 제14조제1항에 따른 건설신기술 2차심사 전문가로서 "현장적용성" 항목을 평가합니다.

## 현장적용성 구성

### 1. 현장우수성 (40%)

#### 1.1 시공성
- 시공 절차의 간편성
- 작업 효율성
- 품질관리 용이성
- 기존 장비 활용 가능성

#### 1.2 안전성
- 시공 중 안전성
- 완공 후 안전성
- 비상시 대응성

#### 1.3 구조안정성
- 하중 지지력
- 내구 연한
- 환경 저항성

#### 1.4 유지관리 편리성
- 점검 용이성
- 보수 편리성
- 교체 용이성

#### 1.5 환경성 (평균 85.3회 키워드 언급)
- 환경오염 최소화
- 소음/진동 저감
- 자원 재활용

**필수**: 현장 적용 실적 3건 이상

### 2. 경제성 (35%)

#### 2.1 설계·시공비 절감 (통과 평균: 19.3%)
- 우수(5): 20% 이상 절감
- 양호(4): 10-20% 절감
- 보통(3): 5-10% 절감

#### 2.2 공사기간 단축 (통과 평균: 23.1%)
- 우수(5): 30% 이상 단축
- 양호(4): 15-30% 단축
- 보통(3): 5-15% 단축

#### 2.3 유지관리비 절감
- LCC(수명주기비용) 분석

**필수 증빙**: 원가계산서, 비교견적서

### 3. 보급성 (25%)

#### 3.1 시장성
- 적용 가능 분야
- 시장 규모
- 수요 전망

#### 3.2 공익성
- 국민 안전 기여
- 사회적 편익
- 정책 부합성

## 핵심 키워드
- 경제성: 절감, 저감, 단축, 비용, 공기, 효율, 경제 (평균 129회)
- 환경성: 환경, 친환경, 저탄소, 재활용 (평균 85.3회)

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
```json
{
  "score": 0.0,
  "sub_scores": {
    "field_excellence": 0.0,
    "economy": 0.0,
    "marketability": 0.0
  },
  "evidence": [
    {
      "type": "현장우수성" 또는 "경제성" 또는 "보급성",
      "sub_type": "시공성/안전성/비용절감 등",
      "content": "근거 내용",
      "location": "문서/페이지 위치",
      "quantitative_data": "정량적 수치"
    }
  ],
  "field_records": {
    "count": 0,
    "sites": ["현장명1", "현장명2"],
    "has_client_confirmation": true/false
  },
  "comments": "종합 평가 의견"
}
```"""

    def _get_evaluation_prompt(self, context: str, tech_id: str) -> str:
        return f"""## 평가 대상
신기술 번호: {tech_id}

## 검색된 관련 문서
{context}

## 평가 지시사항

위 문서를 바탕으로 신기술 {tech_id}의 **현장적용성**을 평가해주세요.

### 확인해야 할 사항:

#### 1. 현장우수성 (40%)
- 시공 방법이 간편한가?
- 안전하게 시공할 수 있는가?
- 구조적으로 안정적인가?
- 유지관리가 편리한가?
- 환경친화적인가?
- **필수**: 현장 적용 실적이 3건 이상인가?

#### 2. 경제성 (35%)
- 비용 절감률은? (통과 평균: 19.3%)
- 공기 단축률은? (통과 평균: 23.1%)
- 원가계산서가 있는가?
- LCC 분석이 있는가?

#### 3. 보급성 (25%)
- 시장 수요가 있는가?
- 적용 가능한 분야가 넓은가?
- 공익적 가치가 있는가?

### 평가 기준:
- "절감", "단축", "효율" 등 키워드와 정량적 수치 확인
- 현장 적용 실적 및 발주처 확인서 존재 여부
- 원가계산서, 경제성 분석자료 확인

### 출력:
반드시 JSON 형식으로 평가 결과를 제시하세요."""

    def _get_search_queries(self) -> List[str]:
        return [
            "현장적용 실적 시공사례 발주처",
            "시공성 시공방법 작업 효율",
            "비용 절감 공사비 원가계산서",
            "공기단축 공사기간 공정",
            "유지관리 보수 점검",
            "환경 친환경 소음 진동 저감",
            "시장성 수요 보급 적용분야"
        ]


class EconomyAgent(BaseEvaluationAgent):
    """경제성 세부 평가 에이전트"""

    def __init__(self, config: AWSConfig = None):
        super().__init__(config)
        self.criterion_name = "경제성"

    def _get_system_prompt(self) -> str:
        return """당신은 건설신기술 경제성 평가 전문가입니다.

## 평가 항목

### 1. 설계·시공비 절감
- 직접공사비 절감율
- 간접공사비 절감율
- 통과 기준: 평균 19.3% 절감

### 2. 공사기간 단축
- 시공기간 단축율
- 공정 단순화
- 통과 기준: 평균 23.1% 단축

### 3. 유지관리비 절감
- 점검비용 절감
- 보수비용 절감
- LCC 분석

## 점수 기준
| 항목 | 우수(5) | 양호(4) | 보통(3) | 미흡(2) |
|------|---------|---------|---------|---------|
| 비용절감 | 20%+ | 10-20% | 5-10% | <5% |
| 공기단축 | 30%+ | 15-30% | 5-15% | <5% |

## 응답 형식
```json
{
  "score": 0.0,
  "sub_scores": {
    "cost_reduction": 0.0,
    "time_reduction": 0.0,
    "maintenance_cost": 0.0
  },
  "evidence": [...],
  "comments": ""
}
```"""

    def _get_evaluation_prompt(self, context: str, tech_id: str) -> str:
        return f"""신기술 {tech_id}의 경제성을 평가하세요.

문서:
{context}

정량적 수치(절감률, 단축률)를 찾아 평가하세요."""

    def _get_search_queries(self) -> List[str]:
        return [
            "비용 절감 공사비 원가",
            "공기단축 공사기간 공정",
            "유지관리비 LCC 수명주기"
        ]


if __name__ == "__main__":
    # 테스트
    print("=== 현장적용성 평가 에이전트 테스트 ===")

    agent = FieldExcellenceAgent()

    print("\n시스템 프롬프트 길이:", len(agent.system_prompt))
    print("\n검색 쿼리:", agent._get_search_queries())
