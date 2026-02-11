"""
벡터스토어 모듈
- OpenSearch Serverless 연동
- 벡터 인덱싱 및 검색
"""

from .opensearch_client import OpenSearchVectorStore

__all__ = ["OpenSearchVectorStore"]
