"""
Bedrock 임베딩 생성기
"""

import json
import boto3
from typing import List, Dict, Any, Optional
from pathlib import Path
from tenacity import retry, stop_after_attempt, wait_exponential

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig
from aws_agent.preprocessing.chunker import DocumentChunk


class BedrockEmbedder:
    """Amazon Bedrock을 사용한 임베딩 생성"""

    def __init__(self, config: AWSConfig = None):
        self.config = config or AWSConfig()
        self.bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=self.config.bedrock_region
        )
        self.model_id = self.config.bedrock_embedding_model_id

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def create_embedding(self, text: str) -> List[float]:
        """단일 텍스트의 임베딩 생성"""
        # 텍스트 길이 제한 (Titan은 8192 토큰)
        max_chars = 25000  # 대략 8000 토큰
        if len(text) > max_chars:
            text = text[:max_chars]

        request_body = {
            "inputText": text
        }

        response = self.bedrock_client.invoke_model(
            modelId=self.model_id,
            body=json.dumps(request_body),
            contentType="application/json",
            accept="application/json"
        )

        response_body = json.loads(response["body"].read())
        embedding = response_body.get("embedding", [])

        return embedding

    def create_embeddings_batch(
        self,
        chunks: List[DocumentChunk],
        batch_size: int = 10
    ) -> List[Dict[str, Any]]:
        """여러 청크의 임베딩을 배치로 생성"""
        embedded_chunks = []

        for i, chunk in enumerate(chunks):
            try:
                embedding = self.create_embedding(chunk.content)

                embedded_chunk = chunk.to_dict()
                embedded_chunk["embedding"] = embedding

                embedded_chunks.append(embedded_chunk)

                if (i + 1) % batch_size == 0:
                    print(f"[진행] {i + 1}/{len(chunks)} 청크 임베딩 완료")

            except Exception as e:
                print(f"[오류] 청크 {i} 임베딩 실패: {e}")
                # 임베딩 실패시 빈 벡터 추가
                embedded_chunk = chunk.to_dict()
                embedded_chunk["embedding"] = []
                embedded_chunk["embedding_error"] = str(e)
                embedded_chunks.append(embedded_chunk)

        print(f"[완료] 총 {len(embedded_chunks)}개 청크 임베딩 생성")
        return embedded_chunks

    def embed_query(self, query: str) -> List[float]:
        """검색 쿼리의 임베딩 생성"""
        return self.create_embedding(query)


class LocalEmbedder:
    """로컬 테스트용 임베딩 생성기 (sentence-transformers 사용)"""

    def __init__(self, model_name: str = "jhgan/ko-sroberta-multitask"):
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(model_name)
            self.available = True
        except ImportError:
            print("[경고] sentence-transformers가 설치되지 않았습니다.")
            print("pip install sentence-transformers")
            self.available = False
            self.model = None

    def create_embedding(self, text: str) -> List[float]:
        if not self.available:
            return []

        embedding = self.model.encode(text)
        return embedding.tolist()

    def create_embeddings_batch(
        self,
        chunks: List[DocumentChunk],
        batch_size: int = 32
    ) -> List[Dict[str, Any]]:
        if not self.available:
            return [chunk.to_dict() for chunk in chunks]

        texts = [chunk.content for chunk in chunks]
        embeddings = self.model.encode(texts, batch_size=batch_size, show_progress_bar=True)

        embedded_chunks = []
        for chunk, embedding in zip(chunks, embeddings):
            embedded_chunk = chunk.to_dict()
            embedded_chunk["embedding"] = embedding.tolist()
            embedded_chunks.append(embedded_chunk)

        return embedded_chunks


def get_embedder(use_bedrock: bool = True) -> Any:
    """환경에 따라 적절한 임베더 반환"""
    if use_bedrock:
        return BedrockEmbedder()
    else:
        return LocalEmbedder()


if __name__ == "__main__":
    # 테스트
    print("=== Bedrock 임베딩 테스트 ===")

    try:
        embedder = BedrockEmbedder()
        test_text = "건설신기술 인증 제안서 평가 시스템"

        embedding = embedder.create_embedding(test_text)
        print(f"임베딩 차원: {len(embedding)}")
        print(f"임베딩 샘플: {embedding[:5]}")
    except Exception as e:
        print(f"[오류] Bedrock 연결 실패: {e}")
        print("\nAWS 자격 증명을 확인하세요:")
        print("  aws configure")
        print("\n또는 로컬 임베더를 사용하세요:")
        print("  embedder = LocalEmbedder()")
