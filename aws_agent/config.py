"""
AWS 서비스 설정
"""

import os
from dataclasses import dataclass, field
from typing import Optional
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()


@dataclass
class AWSConfig:
    """AWS 서비스 설정"""

    # AWS 기본 설정
    region: str = field(default_factory=lambda: os.getenv("AWS_DEFAULT_REGION", "ap-southeast-2"))

    # S3 설정
    s3_bucket: str = field(default_factory=lambda: os.getenv("S3_BUCKET_NAME", "cnt-evaluation-system"))
    s3_raw_prefix: str = field(default_factory=lambda: os.getenv("S3_RAW_PREFIX", "raw/"))
    s3_processed_prefix: str = field(default_factory=lambda: os.getenv("S3_PROCESSED_PREFIX", "processed/"))

    # Bedrock 설정
    bedrock_region: str = field(default_factory=lambda: os.getenv("BEDROCK_REGION", "us-east-1"))
    bedrock_model_id: str = field(default_factory=lambda: os.getenv(
        "BEDROCK_MODEL_ID",
        "anthropic.claude-3-5-sonnet-20240620-v1:0"
    ))
    bedrock_embedding_model_id: str = field(default_factory=lambda: os.getenv(
        "BEDROCK_EMBEDDING_MODEL_ID",
        "amazon.titan-embed-text-v1"
    ))

    # OpenSearch Serverless 설정
    opensearch_endpoint: str = field(default_factory=lambda: os.getenv("OPENSEARCH_ENDPOINT", ""))
    opensearch_index_name: str = field(default_factory=lambda: os.getenv("OPENSEARCH_INDEX_NAME", "cnt-vectors"))

    # 청킹 설정
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # 검색 설정
    retrieval_k: int = 10  # 검색할 청크 수

    def validate(self) -> bool:
        """설정 유효성 검사"""
        required = [
            ("AWS_ACCESS_KEY_ID", os.getenv("AWS_ACCESS_KEY_ID")),
            ("AWS_SECRET_ACCESS_KEY", os.getenv("AWS_SECRET_ACCESS_KEY")),
        ]

        missing = [name for name, value in required if not value]

        if missing:
            print(f"[경고] 누락된 환경변수: {', '.join(missing)}")
            print("AWS CLI 설정을 확인하세요: aws configure")
            return False

        return True

    def __post_init__(self):
        """초기화 후 검증"""
        self.validate()


@dataclass
class BedrockModelConfig:
    """Bedrock 모델별 설정"""

    # Claude 3 모델 옵션
    CLAUDE_3_5_SONNET = "anthropic.claude-3-5-sonnet-20240620-v1:0"
    CLAUDE_3_SONNET = "anthropic.claude-3-sonnet-20240229-v1:0"
    CLAUDE_3_HAIKU = "anthropic.claude-3-haiku-20240307-v1:0"
    CLAUDE_3_OPUS = "anthropic.claude-3-opus-20240229-v1:0"

    # Titan 임베딩 모델
    TITAN_EMBED_TEXT_V1 = "amazon.titan-embed-text-v1"
    TITAN_EMBED_TEXT_V2 = "amazon.titan-embed-text-v2:0"

    # 모델별 파라미터
    MODEL_PARAMS = {
        "claude-3": {
            "max_tokens": 4096,
            "temperature": 0.1,
            "top_p": 0.9,
        },
        "titan-embed": {
            "dimension": 1536,  # v1
        }
    }


# 전역 설정 인스턴스
config = AWSConfig()
