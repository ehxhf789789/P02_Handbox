"""
문서 청킹 모듈
- 슬라이딩 윈도우 청킹
- 섹션 기반 청킹
- 메타데이터 보존
"""

import re
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig


@dataclass
class DocumentChunk:
    """청크 데이터 구조"""
    tech_id: str
    file_name: str
    chunk_index: int
    content: str
    page_numbers: List[int]
    section: Optional[str] = None
    token_count: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class DocumentChunker:
    """문서를 청크로 분할"""

    def __init__(self, config: AWSConfig = None):
        self.config = config or AWSConfig()
        self.chunk_size = self.config.chunk_size
        self.chunk_overlap = self.config.chunk_overlap

    def chunk_document(self, document: Dict[str, Any]) -> List[DocumentChunk]:
        """문서를 청크로 분할 (슬라이딩 윈도우)"""
        tech_id = document.get("metadata", {}).get("tech_id", "unknown")
        file_name = document.get("metadata", {}).get("filename", "unknown")

        # 페이지별 텍스트 결합
        pages = document.get("pages", [])
        page_texts = []

        for page in pages:
            page_num = page.get("page_number", 0)
            full_text = page.get("full_text", "")
            if full_text.strip():
                page_texts.append({
                    "page": page_num,
                    "text": full_text
                })

        # 전체 텍스트 생성 (페이지 마커 포함)
        combined_text = ""
        page_positions = []  # (position, page_number)

        for pt in page_texts:
            start_pos = len(combined_text)
            combined_text += f"\n[페이지 {pt['page']}]\n{pt['text']}"
            page_positions.append((start_pos, pt['page']))

        # 슬라이딩 윈도우 청킹
        chunks = []
        chunk_index = 0

        for i in range(0, len(combined_text), self.chunk_size - self.chunk_overlap):
            chunk_text = combined_text[i:i + self.chunk_size]

            if not chunk_text.strip():
                continue

            # 청크에 포함된 페이지 번호 추출
            included_pages = self._get_pages_in_range(
                page_positions, i, i + self.chunk_size
            )

            # 섹션 감지
            section = self._detect_section(chunk_text)

            chunk = DocumentChunk(
                tech_id=tech_id,
                file_name=file_name,
                chunk_index=chunk_index,
                content=chunk_text.strip(),
                page_numbers=included_pages,
                section=section,
                token_count=len(chunk_text) // 4  # 대략적인 토큰 수
            )

            chunks.append(chunk)
            chunk_index += 1

        return chunks

    def chunk_by_section(self, document: Dict[str, Any]) -> List[DocumentChunk]:
        """섹션 기반 청킹 (목차 구조 활용)"""
        tech_id = document.get("metadata", {}).get("tech_id", "unknown")
        file_name = document.get("metadata", {}).get("filename", "unknown")

        toc = document.get("table_of_contents", [])
        pages = document.get("pages", [])

        # 목차가 있으면 섹션 기반 분할
        if toc:
            return self._chunk_by_toc(tech_id, file_name, toc, pages)

        # 목차가 없으면 헤더 감지 기반 분할
        return self._chunk_by_headers(tech_id, file_name, pages)

    def _get_pages_in_range(
        self,
        page_positions: List[tuple],
        start: int,
        end: int
    ) -> List[int]:
        """특정 범위에 포함된 페이지 번호 반환"""
        pages = []
        for pos, page_num in page_positions:
            if pos >= start and pos < end:
                if page_num not in pages:
                    pages.append(page_num)
        return pages or [1]

    def _detect_section(self, text: str) -> Optional[str]:
        """텍스트에서 섹션 이름 감지"""
        # 주요 섹션 패턴
        section_patterns = [
            (r'기술\s*개요', '기술개요'),
            (r'기존\s*기술|문제점', '기존기술/문제점'),
            (r'신기술\s*내용', '신기술내용'),
            (r'비교\s*분석', '비교분석'),
            (r'성능\s*시험|검증', '성능시험/검증'),
            (r'현장\s*적용|실적', '현장적용실적'),
            (r'경제성\s*분석', '경제성분석'),
            (r'시공\s*방법', '시공방법'),
            (r'품질|안전\s*관리', '품질/안전관리'),
            (r'유지\s*관리', '유지관리'),
            (r'특허|지식\s*재산', '특허/지식재산권'),
            (r'결론|기대\s*효과', '결론/기대효과'),
        ]

        for pattern, section_name in section_patterns:
            if re.search(pattern, text[:500], re.IGNORECASE):
                return section_name

        return None

    def _chunk_by_toc(
        self,
        tech_id: str,
        file_name: str,
        toc: List[Dict],
        pages: List[Dict]
    ) -> List[DocumentChunk]:
        """목차 기반 섹션 분할"""
        chunks = []
        chunk_index = 0

        # 페이지 번호로 텍스트 매핑
        page_map = {p.get("page_number"): p.get("full_text", "") for p in pages}

        for i, toc_item in enumerate(toc):
            start_page = toc_item.get("page", 1)
            end_page = toc[i + 1].get("page", start_page + 5) if i + 1 < len(toc) else start_page + 5

            section_text = ""
            included_pages = []

            for page_num in range(start_page, min(end_page, max(page_map.keys()) + 1)):
                if page_num in page_map:
                    section_text += f"\n{page_map[page_num]}"
                    included_pages.append(page_num)

            if section_text.strip():
                # 큰 섹션은 추가 분할
                if len(section_text) > self.chunk_size * 2:
                    sub_chunks = self._split_large_section(
                        section_text, tech_id, file_name, chunk_index,
                        included_pages, toc_item.get("title")
                    )
                    chunks.extend(sub_chunks)
                    chunk_index += len(sub_chunks)
                else:
                    chunk = DocumentChunk(
                        tech_id=tech_id,
                        file_name=file_name,
                        chunk_index=chunk_index,
                        content=section_text.strip(),
                        page_numbers=included_pages,
                        section=toc_item.get("title"),
                        token_count=len(section_text) // 4
                    )
                    chunks.append(chunk)
                    chunk_index += 1

        return chunks

    def _chunk_by_headers(
        self,
        tech_id: str,
        file_name: str,
        pages: List[Dict]
    ) -> List[DocumentChunk]:
        """헤더 감지 기반 분할"""
        # 간단한 구현: 슬라이딩 윈도우 사용
        document = {
            "metadata": {"tech_id": tech_id, "filename": file_name},
            "pages": pages
        }
        return self.chunk_document(document)

    def _split_large_section(
        self,
        text: str,
        tech_id: str,
        file_name: str,
        start_index: int,
        pages: List[int],
        section: str
    ) -> List[DocumentChunk]:
        """큰 섹션을 작은 청크로 분할"""
        chunks = []
        chunk_index = start_index

        for i in range(0, len(text), self.chunk_size - self.chunk_overlap):
            chunk_text = text[i:i + self.chunk_size]
            if chunk_text.strip():
                chunk = DocumentChunk(
                    tech_id=tech_id,
                    file_name=file_name,
                    chunk_index=chunk_index,
                    content=chunk_text.strip(),
                    page_numbers=pages,
                    section=section,
                    token_count=len(chunk_text) // 4
                )
                chunks.append(chunk)
                chunk_index += 1

        return chunks


def process_json_file(json_path: str) -> List[Dict[str, Any]]:
    """JSON 파일을 청킹하는 유틸리티 함수"""
    with open(json_path, 'r', encoding='utf-8') as f:
        document = json.load(f)

    chunker = DocumentChunker()
    chunks = chunker.chunk_document(document)

    return [chunk.to_dict() for chunk in chunks]


if __name__ == "__main__":
    # 테스트
    json_dir = Path(__file__).parent.parent.parent / "extracted_json"
    sample_file = next(json_dir.glob("*.json"), None)

    if sample_file:
        print(f"테스트 파일: {sample_file}")
        chunks = process_json_file(str(sample_file))
        print(f"생성된 청크 수: {len(chunks)}")

        if chunks:
            print(f"\n첫 번째 청크:")
            print(f"  - tech_id: {chunks[0]['tech_id']}")
            print(f"  - section: {chunks[0]['section']}")
            print(f"  - pages: {chunks[0]['page_numbers']}")
            print(f"  - content 길이: {len(chunks[0]['content'])}")
