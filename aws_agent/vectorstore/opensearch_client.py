"""
OpenSearch Serverless 벡터 스토어 클라이언트
"""

import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
import boto3

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig


class OpenSearchVectorStore:
    """OpenSearch Serverless 벡터 스토어"""

    def __init__(self, config: AWSConfig = None):
        self.config = config or AWSConfig()
        self.index_name = self.config.opensearch_index_name
        self.client = self._create_client()

    def _create_client(self) -> Optional[OpenSearch]:
        """OpenSearch 클라이언트 생성"""
        if not self.config.opensearch_endpoint:
            print("[경고] OPENSEARCH_ENDPOINT가 설정되지 않았습니다.")
            print("OpenSearch Serverless 컬렉션을 생성하고 엔드포인트를 설정하세요.")
            return None

        # AWS 인증
        credentials = boto3.Session().get_credentials()
        auth = AWS4Auth(
            credentials.access_key,
            credentials.secret_key,
            self.config.region,
            "aoss",  # OpenSearch Serverless 서비스명
            session_token=credentials.token
        )

        # 엔드포인트에서 호스트 추출
        host = self.config.opensearch_endpoint.replace("https://", "").replace("http://", "")

        client = OpenSearch(
            hosts=[{"host": host, "port": 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=30
        )

        return client

    def create_index(self) -> bool:
        """벡터 인덱스 생성"""
        if not self.client:
            return False

        # 인덱스 존재 여부 확인
        if self.client.indices.exists(index=self.index_name):
            print(f"[정보] 인덱스 이미 존재: {self.index_name}")
            return True

        # 인덱스 매핑 정의
        index_body = {
            "settings": {
                "index": {
                    "knn": True,
                    "knn.algo_param.ef_search": 512
                }
            },
            "mappings": {
                "properties": {
                    "tech_id": {"type": "keyword"},
                    "file_name": {"type": "keyword"},
                    "chunk_index": {"type": "integer"},
                    "content": {"type": "text", "analyzer": "standard"},
                    "page_numbers": {"type": "integer"},
                    "section": {"type": "keyword"},
                    "token_count": {"type": "integer"},
                    "embedding": {
                        "type": "knn_vector",
                        "dimension": 1536,  # Titan Embeddings v1
                        "method": {
                            "name": "hnsw",
                            "space_type": "l2",
                            "engine": "nmslib",
                            "parameters": {
                                "ef_construction": 512,
                                "m": 16
                            }
                        }
                    }
                }
            }
        }

        try:
            response = self.client.indices.create(
                index=self.index_name,
                body=index_body
            )
            print(f"[성공] 인덱스 생성: {self.index_name}")
            return True
        except Exception as e:
            print(f"[오류] 인덱스 생성 실패: {e}")
            return False

    def index_documents(
        self,
        documents: List[Dict[str, Any]],
        batch_size: int = 100
    ) -> int:
        """문서들을 벡터 인덱스에 추가"""
        if not self.client:
            return 0

        indexed_count = 0

        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            bulk_body = []

            for doc in batch:
                # 임베딩이 없거나 비어있으면 건너뛰기
                if not doc.get("embedding"):
                    continue

                # 인덱스 액션
                action = {
                    "index": {
                        "_index": self.index_name,
                        "_id": f"{doc['tech_id']}_{doc['chunk_index']}"
                    }
                }
                bulk_body.append(action)
                bulk_body.append(doc)

            if bulk_body:
                try:
                    response = self.client.bulk(body=bulk_body)
                    if not response.get("errors"):
                        indexed_count += len(batch)
                        print(f"[진행] {indexed_count}개 문서 인덱싱 완료")
                    else:
                        print(f"[경고] 일부 문서 인덱싱 실패")
                except Exception as e:
                    print(f"[오류] 벌크 인덱싱 실패: {e}")

        print(f"[완료] 총 {indexed_count}개 문서 인덱싱")
        return indexed_count

    def search(
        self,
        query_embedding: List[float],
        tech_id: Optional[str] = None,
        k: int = 10
    ) -> List[Dict[str, Any]]:
        """벡터 유사도 검색"""
        if not self.client:
            return []

        # kNN 검색 쿼리
        query = {
            "size": k,
            "query": {
                "knn": {
                    "embedding": {
                        "vector": query_embedding,
                        "k": k
                    }
                }
            }
        }

        # tech_id 필터 추가
        if tech_id:
            query["query"] = {
                "bool": {
                    "must": [
                        {
                            "knn": {
                                "embedding": {
                                    "vector": query_embedding,
                                    "k": k * 2  # 필터링을 고려해 더 많이 검색
                                }
                            }
                        }
                    ],
                    "filter": [
                        {"term": {"tech_id": tech_id}}
                    ]
                }
            }

        try:
            response = self.client.search(
                index=self.index_name,
                body=query
            )

            results = []
            for hit in response["hits"]["hits"]:
                result = hit["_source"].copy()
                result["_score"] = hit["_score"]
                result["_id"] = hit["_id"]
                # 임베딩은 반환에서 제외 (너무 큼)
                result.pop("embedding", None)
                results.append(result)

            return results[:k]

        except Exception as e:
            print(f"[오류] 검색 실패: {e}")
            return []

    def hybrid_search(
        self,
        query_text: str,
        query_embedding: List[float],
        tech_id: Optional[str] = None,
        k: int = 10
    ) -> List[Dict[str, Any]]:
        """하이브리드 검색 (키워드 + 벡터)"""
        if not self.client:
            return []

        query = {
            "size": k,
            "query": {
                "bool": {
                    "should": [
                        # 키워드 검색
                        {
                            "match": {
                                "content": {
                                    "query": query_text,
                                    "boost": 0.3
                                }
                            }
                        },
                        # 벡터 검색
                        {
                            "knn": {
                                "embedding": {
                                    "vector": query_embedding,
                                    "k": k * 2,
                                    "boost": 0.7
                                }
                            }
                        }
                    ]
                }
            }
        }

        # tech_id 필터
        if tech_id:
            query["query"]["bool"]["filter"] = [
                {"term": {"tech_id": tech_id}}
            ]

        try:
            response = self.client.search(
                index=self.index_name,
                body=query
            )

            results = []
            for hit in response["hits"]["hits"]:
                result = hit["_source"].copy()
                result["_score"] = hit["_score"]
                result.pop("embedding", None)
                results.append(result)

            return results[:k]

        except Exception as e:
            print(f"[오류] 하이브리드 검색 실패: {e}")
            return []

    def delete_by_tech_id(self, tech_id: str) -> int:
        """특정 신기술의 모든 청크 삭제"""
        if not self.client:
            return 0

        query = {
            "query": {
                "term": {"tech_id": tech_id}
            }
        }

        try:
            response = self.client.delete_by_query(
                index=self.index_name,
                body=query
            )
            deleted = response.get("deleted", 0)
            print(f"[성공] {tech_id}의 {deleted}개 청크 삭제")
            return deleted
        except Exception as e:
            print(f"[오류] 삭제 실패: {e}")
            return 0

    def get_stats(self) -> Dict[str, Any]:
        """인덱스 통계 조회"""
        if not self.client:
            return {}

        try:
            stats = self.client.indices.stats(index=self.index_name)
            return {
                "document_count": stats["indices"][self.index_name]["primaries"]["docs"]["count"],
                "size_bytes": stats["indices"][self.index_name]["primaries"]["store"]["size_in_bytes"]
            }
        except Exception as e:
            print(f"[오류] 통계 조회 실패: {e}")
            return {}


class LocalVectorStore:
    """로컬 테스트용 인메모리 벡터 스토어"""

    def __init__(self):
        self.documents: List[Dict[str, Any]] = []

    def index_documents(self, documents: List[Dict[str, Any]], **kwargs) -> int:
        self.documents.extend(documents)
        return len(documents)

    def search(
        self,
        query_embedding: List[float],
        tech_id: Optional[str] = None,
        k: int = 10
    ) -> List[Dict[str, Any]]:
        import numpy as np

        # 필터링
        filtered = self.documents
        if tech_id:
            filtered = [d for d in self.documents if d.get("tech_id") == tech_id]

        # 유사도 계산
        results = []
        query_vec = np.array(query_embedding)

        for doc in filtered:
            if not doc.get("embedding"):
                continue

            doc_vec = np.array(doc["embedding"])
            # 코사인 유사도
            similarity = np.dot(query_vec, doc_vec) / (
                np.linalg.norm(query_vec) * np.linalg.norm(doc_vec)
            )

            result = doc.copy()
            result["_score"] = float(similarity)
            result.pop("embedding", None)
            results.append(result)

        # 정렬 및 상위 k개 반환
        results.sort(key=lambda x: x["_score"], reverse=True)
        return results[:k]


def get_vectorstore(use_opensearch: bool = True) -> Any:
    """환경에 따라 적절한 벡터스토어 반환"""
    if use_opensearch:
        return OpenSearchVectorStore()
    else:
        return LocalVectorStore()


if __name__ == "__main__":
    # 테스트
    print("=== OpenSearch 연결 테스트 ===")

    store = OpenSearchVectorStore()

    if store.client:
        print("[성공] OpenSearch 클라이언트 생성")
        stats = store.get_stats()
        print(f"인덱스 통계: {stats}")
    else:
        print("[정보] OpenSearch가 설정되지 않았습니다.")
        print("로컬 벡터스토어를 사용합니다.")
        local_store = LocalVectorStore()
        print(f"로컬 스토어 문서 수: {len(local_store.documents)}")
