"""
평가 실행기 및 파이프라인
"""

import json
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from pathlib import Path

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig
from aws_agent.preprocessing.s3_uploader import S3Uploader
from aws_agent.preprocessing.chunker import DocumentChunker, process_json_file
from aws_agent.preprocessing.embedder import BedrockEmbedder, get_embedder
from aws_agent.vectorstore.opensearch_client import OpenSearchVectorStore, get_vectorstore
from aws_agent.agents.novelty_agent import NoveltyEvaluationAgent
from aws_agent.agents.progress_agent import ProgressEvaluationAgent
from aws_agent.agents.field_agent import FieldExcellenceAgent
from aws_agent.agents.base_agent import EvaluationResult


@dataclass
class FullEvaluationResult:
    """전체 평가 결과"""
    tech_id: str
    evaluation_date: str
    stage_1: Dict[str, Any]  # 1차 심사 (신규성, 진보성)
    stage_2: Dict[str, Any]  # 2차 심사 (현장적용성)
    overall_score: float
    overall_pass: bool
    summary: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


class EvaluationRunner:
    """평가 실행기"""

    def __init__(self, config: AWSConfig = None, use_aws: bool = True):
        self.config = config or AWSConfig()
        self.use_aws = use_aws

        # 에이전트 초기화
        if use_aws:
            self.novelty_agent = NoveltyEvaluationAgent(self.config)
            self.progress_agent = ProgressEvaluationAgent(self.config)
            self.field_agent = FieldExcellenceAgent(self.config)
        else:
            # 로컬 테스트용 모의 에이전트
            from aws_agent.agents.base_agent import MockEvaluationAgent
            self.novelty_agent = MockEvaluationAgent("신규성")
            self.progress_agent = MockEvaluationAgent("진보성")
            self.field_agent = MockEvaluationAgent("현장적용성")

    def run_stage_1(self, tech_id: str) -> Dict[str, EvaluationResult]:
        """1차 심사 실행 (신규성 + 진보성)"""
        print(f"\n{'='*50}")
        print(f"1차 심사 시작: {tech_id}")
        print(f"{'='*50}")

        results = {}

        # 신규성 평가
        results["novelty"] = self.novelty_agent.evaluate(tech_id)

        # 진보성 평가
        results["progressiveness"] = self.progress_agent.evaluate(tech_id)

        # 1차 심사 통과 여부 판정
        stage_1_pass = (
            results["novelty"].pass_status and
            results["progressiveness"].pass_status
        )

        print(f"\n1차 심사 결과: {'통과' if stage_1_pass else '미통과'}")
        return results

    def run_stage_2(self, tech_id: str) -> Dict[str, EvaluationResult]:
        """2차 심사 실행 (현장적용성)"""
        print(f"\n{'='*50}")
        print(f"2차 심사 시작: {tech_id}")
        print(f"{'='*50}")

        results = {}

        # 현장적용성 평가 (현장우수성 + 경제성 + 보급성 포함)
        results["field_applicability"] = self.field_agent.evaluate(tech_id)

        # 2차 심사 통과 여부 판정
        stage_2_pass = results["field_applicability"].pass_status

        print(f"\n2차 심사 결과: {'통과' if stage_2_pass else '미통과'}")
        return results

    def run_full_evaluation(self, tech_id: str) -> FullEvaluationResult:
        """전체 평가 실행"""
        print(f"\n{'#'*60}")
        print(f"# 건설신기술 평가 시작: {tech_id}")
        print(f"{'#'*60}")

        # 1차 심사
        stage_1_results = self.run_stage_1(tech_id)

        # 2차 심사
        stage_2_results = self.run_stage_2(tech_id)

        # 종합 점수 계산
        # 1차: (신규성 * 0.5 + 진보성 * 0.5) * 50
        # 2차: 현장적용성 * 50
        stage_1_score = (
            stage_1_results["novelty"].score * 0.5 +
            stage_1_results["progressiveness"].score * 0.5
        ) * 10  # 5점 만점 -> 50점

        stage_2_score = stage_2_results["field_applicability"].score * 10

        overall_score = stage_1_score + stage_2_score

        # 통과 여부 판정
        overall_pass = (
            stage_1_results["novelty"].pass_status and
            stage_1_results["progressiveness"].pass_status and
            stage_2_results["field_applicability"].pass_status and
            overall_score >= 70
        )

        # 결과 정리
        result = FullEvaluationResult(
            tech_id=tech_id,
            evaluation_date=datetime.now().isoformat(),
            stage_1={
                "novelty": stage_1_results["novelty"].to_dict(),
                "progressiveness": stage_1_results["progressiveness"].to_dict(),
                "total_score": stage_1_score,
                "pass": stage_1_results["novelty"].pass_status and stage_1_results["progressiveness"].pass_status
            },
            stage_2={
                "field_applicability": stage_2_results["field_applicability"].to_dict(),
                "total_score": stage_2_score,
                "pass": stage_2_results["field_applicability"].pass_status
            },
            overall_score=overall_score,
            overall_pass=overall_pass,
            summary=self._generate_summary(stage_1_results, stage_2_results, overall_score, overall_pass)
        )

        self._print_result(result)
        return result

    def _generate_summary(
        self,
        stage_1: Dict[str, EvaluationResult],
        stage_2: Dict[str, EvaluationResult],
        overall_score: float,
        overall_pass: bool
    ) -> Dict[str, Any]:
        """평가 요약 생성"""
        # 강점
        strong_points = []
        for name, result in {**stage_1, **stage_2}.items():
            if result.score >= 4:
                strong_points.append(f"{result.criterion}: {result.grade}")

        # 약점
        weak_points = []
        for name, result in {**stage_1, **stage_2}.items():
            if result.score < 3:
                weak_points.append(f"{result.criterion}: {result.grade}")

        # 권고사항
        recommendations = []
        for name, result in {**stage_1, **stage_2}.items():
            if not result.pass_status:
                recommendations.append(
                    f"{result.criterion} 보완 필요: {result.comments[:100]}"
                )

        return {
            "overall_grade": "통과" if overall_pass else "미통과",
            "score_out_of_100": overall_score,
            "strong_points": strong_points,
            "weak_points": weak_points,
            "recommendations": recommendations
        }

    def _print_result(self, result: FullEvaluationResult):
        """결과 출력"""
        print(f"\n{'='*60}")
        print(f"평가 결과 요약: {result.tech_id}")
        print(f"{'='*60}")
        print(f"1차 심사: {result.stage_1['total_score']:.1f}/50점")
        print(f"  - 신규성: {result.stage_1['novelty']['grade']} ({result.stage_1['novelty']['score']}점)")
        print(f"  - 진보성: {result.stage_1['progressiveness']['grade']} ({result.stage_1['progressiveness']['score']}점)")
        print(f"2차 심사: {result.stage_2['total_score']:.1f}/50점")
        print(f"  - 현장적용성: {result.stage_2['field_applicability']['grade']} ({result.stage_2['field_applicability']['score']}점)")
        print(f"\n종합: {result.overall_score:.1f}/100점")
        print(f"최종 판정: {'✅ 통과' if result.overall_pass else '❌ 미통과'}")


class EvaluationPipeline:
    """전체 파이프라인 (전처리 → 인덱싱 → 평가)"""

    def __init__(self, config: AWSConfig = None, use_aws: bool = True):
        self.config = config or AWSConfig()
        self.use_aws = use_aws

        # 컴포넌트 초기화
        if use_aws:
            self.s3_uploader = S3Uploader(self.config)
            self.embedder = get_embedder(use_bedrock=True)
            self.vectorstore = get_vectorstore(use_opensearch=True)
        else:
            self.s3_uploader = None
            self.embedder = get_embedder(use_bedrock=False)
            self.vectorstore = get_vectorstore(use_opensearch=False)

        self.chunker = DocumentChunker(self.config)
        self.runner = EvaluationRunner(self.config, use_aws)

    def process_document(self, json_path: str) -> str:
        """문서 처리 (청킹 → 임베딩 → 인덱싱)"""
        print(f"\n[처리] {json_path}")

        # 1. JSON 로드
        with open(json_path, 'r', encoding='utf-8') as f:
            document = json.load(f)

        tech_id = document.get("metadata", {}).get("tech_id", "unknown")
        print(f"  신기술 번호: {tech_id}")

        # 2. 청킹
        chunks = self.chunker.chunk_document(document)
        print(f"  청크 수: {len(chunks)}")

        # 3. 임베딩 생성
        embedded_chunks = self.embedder.create_embeddings_batch(chunks)
        print(f"  임베딩 완료")

        # 4. 벡터 인덱싱
        indexed = self.vectorstore.index_documents(embedded_chunks)
        print(f"  인덱싱: {indexed}개")

        # 5. S3 업로드 (AWS 모드인 경우)
        if self.use_aws and self.s3_uploader:
            s3_key = f"processed/{tech_id}/{Path(json_path).name}"
            self.s3_uploader.upload_file(json_path, s3_key)

        return tech_id

    def run_pipeline(
        self,
        json_paths: List[str],
        evaluate: bool = True
    ) -> List[FullEvaluationResult]:
        """전체 파이프라인 실행"""
        results = []

        # 문서 처리
        tech_ids = []
        for json_path in json_paths:
            tech_id = self.process_document(json_path)
            tech_ids.append(tech_id)

        # 평가 실행
        if evaluate:
            for tech_id in set(tech_ids):  # 중복 제거
                result = self.runner.run_full_evaluation(tech_id)
                results.append(result)

        return results


def evaluate_single_document(json_path: str, use_aws: bool = False) -> FullEvaluationResult:
    """단일 문서 평가 유틸리티"""
    pipeline = EvaluationPipeline(use_aws=use_aws)
    results = pipeline.run_pipeline([json_path], evaluate=True)
    return results[0] if results else None


if __name__ == "__main__":
    # 테스트 (로컬 모드)
    print("=== 평가 파이프라인 테스트 ===")

    # 샘플 JSON 파일 찾기
    json_dir = Path(__file__).parent.parent.parent / "extracted_json"
    sample_files = list(json_dir.glob("*.json"))[:1]

    if sample_files:
        print(f"\n테스트 파일: {sample_files[0]}")

        # 로컬 모드로 테스트
        result = evaluate_single_document(str(sample_files[0]), use_aws=False)

        if result:
            print(f"\n결과 JSON:")
            print(result.to_json())
    else:
        print("JSON 파일을 찾을 수 없습니다.")
