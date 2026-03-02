# -*- coding: utf-8 -*-
import random
import sys
from typing import List

# Set console output encoding to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
from expert import Expert
from proposal import Proposal
from knowledge_base import KnowledgeBase
from evaluation import EvaluationCommittee, evaluate_proposals

def create_experts(num_experts: int) -> List[Expert]:
    fields = ['구조', '지반', '시공', '환경', '설비']
    return [Expert(f'Expert_{i}', random.choice(fields)) for i in range(num_experts)]

def create_proposals(num_proposals: int) -> List[Proposal]:
    fields = ['구조', '지반', '시공', '환경', '설비']
    proposals = []
    for i in range(num_proposals):
        field = random.choice(fields)
        if field == '구조':
            title = f'신형 내진 구조 시스템 제안_{i}'
            content = '고층 건물의 내진 성능 향상을 위한 혁신적인 구조 시스템'
            description = '본 제안은 최신 재료 공학과 구조 역학을 결합하여 개발된 신형 내진 구조 시스템을 소개합니다. 이 시스템은 지진 에너지를 효과적으로 흡수하고 분산시켜 건물의 안전성을 크게 향상시킵니다.'
        elif field == '지반':
            title = f'AI 기반 지반 안정화 기술_{i}'
            content = '인공지능을 활용한 지반 침하 예측 및 대응 시스템'
            description = '본 기술은 머신러닝 알고리즘을 사용하여 지반 침하를 정확히 예측하고, 실시간으로 대응 방안을 제시합니다. 이를 통해 건설 현장의 안전성과 효율성을 크게 개선할 수 있습니다.'
        elif field == '시공':
            title = f'로봇 기반 모듈러 건축 공법_{i}'
            content = '자동화된 로봇 시스템을 이용한 고효율 모듈러 건축 방식'
            description = '이 혁신적인 공법은 로봇 기술과 모듈러 건축을 결합하여 건설 속도를 획기적으로 높이고 인건비를 절감합니다. 또한, 정밀한 품질 관리로 건축물의 완성도를 높입니다.'
        elif field == '환경':
            title = f'바이오필릭 디자인을 적용한 탄소중립 건축_{i}'
            content = '자연 친화적 설계와 첨단 환경 기술의 융합'
            description = '본 제안은 바이오필릭 디자인 원리를 적용하여 건물 내 자연 요소를 극대화하고, 최신 환경 기술을 통합하여 탄소 배출을 최소화합니다. 이를 통해 거주자의 웰빙과 환경 보호를 동시에 달성합니다.'
        else:  # 설비
            title = f'IoT 기반 스마트 빌딩 통합 관리 시스템_{i}'
            content = '인공지능과 사물인터넷을 활용한 건물 설비 최적화 솔루션'
            description = '이 시스템은 건물 내 모든 설비를 IoT 센서로 연결하고 AI 알고리즘으로 분석하여 에너지 사용을 최적화합니다. 실시간 모니터링과 예측 유지보수로 건물 운영 효율성을 극대화합니다.'
        proposals.append(Proposal(title, field, content, description))
    return proposals

def populate_knowledge_base(kb: KnowledgeBase):
    # Static knowledge
    kb.add_static_knowledge('구조', '철근콘크리트 구조물의 내진 설계 기준')
    kb.add_static_knowledge('구조', '프리스트레스트 콘크리트의 설계 및 시공 기술')
    kb.add_static_knowledge('구조', '고층 건물의 풍하중 저감을 위한 구조 시스템')
    kb.add_static_knowledge('지반', '지반 안정화를 위한 압밀 침하 이론')
    kb.add_static_knowledge('지반', '연약지반 개량을 위한 지반주입공법')
    kb.add_static_knowledge('지반', '말뚝기초의 수평저항력 산정 방법')
    kb.add_static_knowledge('시공', '모듈러 건축 공법의 현장 적용 사례')
    kb.add_static_knowledge('시공', '3D 프린팅 기술을 활용한 건설 자동화')
    kb.add_static_knowledge('시공', '스마트 건설기술 도입을 통한 현장 안전관리')
    kb.add_static_knowledge('환경', '친환경 건축물 인증 제도 및 평가 기준')
    kb.add_static_knowledge('환경', '건물 에너지 효율화를 위한 패시브 디자인 전략')
    kb.add_static_knowledge('환경', '실내 공기질 개선을 위한 자연 환기 시스템')
    kb.add_static_knowledge('설비', 'BIM을 활용한 MEP 시스템 최적화 방안')
    kb.add_static_knowledge('설비', '스마트 빌딩을 위한 IoT 기반 설비 제어 시스템')
    kb.add_static_knowledge('설비', '신재생에너지 통합 설비 시스템 설계')

    # Dynamic knowledge (simulating recent developments or case studies)
    kb.add_dynamic_knowledge('구조', '카본 나노튜브 보강 콘크리트의 내구성 향상 사례 연구')
    kb.add_dynamic_knowledge('지반', '인공지능을 활용한 지반침하 예측 모델 개발')
    kb.add_dynamic_knowledge('시공', '드론과 LiDAR를 이용한 건설현장 3D 매핑 기술')
    kb.add_dynamic_knowledge('환경', '탄소중립 건축을 위한 바이오필릭 디자인 적용 사례')
    kb.add_dynamic_knowledge('설비', '디지털 트윈 기술을 활용한 건물 설비 최적화 연구')

def run_simulation():
    kb = KnowledgeBase()
    populate_knowledge_base(kb)

    experts = create_experts(10)
    committee = EvaluationCommittee(experts, kb)

    proposals = create_proposals(5)
    evaluated_proposals = evaluate_proposals(committee, proposals)

    print("\n=== 건설 신기술 제안서 평가 결과 ===\n")
    for proposal in evaluated_proposals:
        decision = '통과' if committee.get_final_decision(proposal) else '불통과'
        print(f'제안서: {proposal.title}')
        print(f'분야: {proposal.field}')
        print(f'내용: {proposal.content}')
        print(f'설명: {proposal.description}')
        print(f'평균 점수: {proposal.get_average_score():.2f}')
        print(f'결과: {decision}')
        print("개별 평가 점수:")
        for expert, score in proposal.scores.items():
            print(f'  - {expert}: {score:.2f}')
        print()

if __name__ == '__main__':
    run_simulation()
