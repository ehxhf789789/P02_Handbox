"""
KISTI ScienceON API 클라이언트
- 논문(ARTI), 특허(PATENT), 보고서(REPORT), 동향(ATT) 검색 지원
- AES256 암호화 기반 토큰 인증
"""

import os
import json
import base64
import hashlib
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import requests
import xml.etree.ElementTree as ET


@dataclass
class KISTITokenInfo:
    """KISTI 토큰 정보"""
    access_token: str = ""
    access_token_expire: datetime = None
    refresh_token: str = ""
    refresh_token_expire: datetime = None
    client_id: str = ""
    issued_at: datetime = None

    def is_access_token_valid(self) -> bool:
        """Access Token 유효성 확인"""
        if not self.access_token or not self.access_token_expire:
            return False
        return datetime.now() < self.access_token_expire

    def is_refresh_token_valid(self) -> bool:
        """Refresh Token 유효성 확인"""
        if not self.refresh_token or not self.refresh_token_expire:
            return False
        return datetime.now() < self.refresh_token_expire


@dataclass
class KISTIConfig:
    """KISTI API 설정 (.env 파일에서 로드)"""
    api_key: str = field(default_factory=lambda: os.getenv("KISTI_API_KEY", "65d00ab7cbf841258017ffde7d8ed9fa"))
    client_id: str = field(default_factory=lambda: os.getenv("KISTI_CLIENT_ID", "2cdbac21f1e013308bc27ebd2dc20353d7a301b6f3af75b7def062075261f393"))
    mac_address: str = field(default_factory=lambda: os.getenv("KISTI_MAC_ADDRESS", "D8-43-AE-1B-9F-B7"))
    base_url: str = "https://apigateway.kisti.re.kr"
    api_version: str = "1.0"
    verify_ssl: bool = False  # SSL 인증서 검증 (KISTI 서버 인증서 이슈로 비활성화)

    def __post_init__(self):
        """환경 변수에서 설정 로드"""
        from dotenv import load_dotenv
        load_dotenv()

        # 환경 변수 다시 확인
        if os.getenv("KISTI_API_KEY"):
            self.api_key = os.getenv("KISTI_API_KEY")
        if os.getenv("KISTI_CLIENT_ID"):
            self.client_id = os.getenv("KISTI_CLIENT_ID")
        if os.getenv("KISTI_MAC_ADDRESS"):
            self.mac_address = os.getenv("KISTI_MAC_ADDRESS")


class KISTIClient:
    """KISTI ScienceON API 클라이언트"""

    # 서비스 타입 매핑
    SERVICE_TARGETS = {
        "ARTI": "ARTI",      # 논문
        "PATENT": "PATENT",  # 특허
        "REPORT": "REPORT",  # 보고서
        "ATT": "ATT",        # 동향
    }

    # KISTI 고정 IV (이 값이 핵심!)
    FIXED_IV = 'jvHJ1EFA0IXBrxxz'
    BLOCK_SIZE = 16

    def __init__(self, config: KISTIConfig = None):
        self.config = config or KISTIConfig()
        self.token_info = KISTITokenInfo()

    def _pad(self, plain_txt: str) -> str:
        """PKCS7 패딩 (문자열 기반)"""
        number_of_bytes_to_pad = self.BLOCK_SIZE - len(plain_txt) % self.BLOCK_SIZE
        ascii_str = chr(number_of_bytes_to_pad)
        padding_str = number_of_bytes_to_pad * ascii_str
        return plain_txt + padding_str

    def _aes256_encrypt_kisti(self, data: str) -> str:
        """KISTI 공식 AES256 암호화 방식

        - 고정 IV: 'jvHJ1EFA0IXBrxxz'
        - URL-safe Base64 인코딩
        - URL quote 적용
        """
        key_bytes = self.config.api_key.encode('utf-8')
        iv_bytes = self.FIXED_IV.encode('utf-8')

        cipher = AES.new(key_bytes, AES.MODE_CBC, iv_bytes)
        padded_txt = self._pad(data)
        encrypted_bytes = cipher.encrypt(padded_txt.encode('utf-8'))

        # URL-safe Base64 + URL 인코딩
        encrypted_str = base64.urlsafe_b64encode(encrypted_bytes).decode('utf-8')
        return urllib.parse.quote(encrypted_str, safe='')

    def _generate_accounts_param(self) -> str:
        """accounts 파라미터 생성 (KISTI 공식 방식)

        - datetime: YYYYMMDDHHmmss 형식 문자열
        - mac_address: 하이픈 형식 (XX-XX-XX-XX-XX-XX)
        - JSON 필드 순서: datetime 먼저, mac_address 다음
        - AES256-CBC with 고정 IV + URL-safe Base64
        """
        import re

        # 현재 시간 (숫자만 추출)
        time_str = ''.join(re.findall(r"\d", datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

        # JSON 데이터 (datetime 먼저!)
        plain_data = {
            "datetime": time_str,
            "mac_address": self.config.mac_address
        }
        json_data = json.dumps(plain_data, separators=(',', ':'))

        # AES256 암호화 (KISTI 공식 방식)
        encrypted = self._aes256_encrypt_kisti(json_data)

        return encrypted

    def request_token(self) -> bool:
        """토큰 발급 요청 (KISTI 공식 방식)"""
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        accounts = self._generate_accounts_param()

        # URL 직접 구성 (accounts는 이미 URL 인코딩됨)
        url = f"{self.config.base_url}/tokenrequest.do?client_id={self.config.client_id}&accounts={accounts}"

        try:
            response = requests.get(url, timeout=30, verify=self.config.verify_ssl)

            if response.status_code == 200:
                data = response.json()

                # 에러 체크
                if "errorCode" in data:
                    error_code = data.get('errorCode')
                    error_msg = data.get('errorMessage')
                    print(f"[KISTI 토큰 오류] {error_code}: {error_msg}")
                    return False

                # 토큰 정보 저장
                self.token_info.access_token = data.get("access_token", "")
                self.token_info.refresh_token = data.get("refresh_token", "")
                self.token_info.client_id = data.get("client_id", "")

                # 만료 시간 파싱
                if data.get("access_token_expire"):
                    self.token_info.access_token_expire = datetime.strptime(
                        data["access_token_expire"][:19], "%Y-%m-%d %H:%M:%S"
                    )
                if data.get("refresh_token_expire"):
                    self.token_info.refresh_token_expire = datetime.strptime(
                        data["refresh_token_expire"][:19], "%Y-%m-%d %H:%M:%S"
                    )
                if data.get("issued_at"):
                    self.token_info.issued_at = datetime.strptime(
                        data["issued_at"][:19], "%Y-%m-%d %H:%M:%S"
                    )

                print(f"[KISTI] 토큰 발급 성공!")
                print(f"  Access Token 만료: {self.token_info.access_token_expire}")
                return True
            else:
                print(f"[KISTI 오류] HTTP {response.status_code}: {response.text}")
                return False

        except Exception as e:
            print(f"[KISTI 오류] 토큰 요청 실패: {e}")
            return False

    def refresh_access_token(self) -> bool:
        """Refresh Token으로 Access Token 재발급"""
        if not self.token_info.is_refresh_token_valid():
            print("[KISTI] Refresh Token이 만료되었습니다. 새로운 토큰을 요청합니다.")
            return self.request_token()

        url = f"{self.config.base_url}/tokenrequest.do"
        params = {
            "refresh_token": self.token_info.refresh_token,
            "client_id": self.config.client_id
        }

        try:
            response = requests.get(url, params=params, timeout=30, verify=self.config.verify_ssl)

            if response.status_code == 200:
                data = response.json()

                if "errorCode" in data:
                    print(f"[KISTI 토큰 갱신 오류] {data.get('errorCode')}: {data.get('errorMessage')}")
                    return self.request_token()  # 실패 시 새 토큰 요청

                # Access Token 업데이트
                self.token_info.access_token = data.get("access_token", "")
                if data.get("access_token_expire"):
                    self.token_info.access_token_expire = datetime.strptime(
                        data["access_token_expire"][:19], "%Y-%m-%d %H:%M:%S"
                    )

                print(f"[KISTI] Access Token 갱신 성공")
                return True
            else:
                return self.request_token()

        except Exception as e:
            print(f"[KISTI 오류] 토큰 갱신 실패: {e}")
            return self.request_token()

    def ensure_valid_token(self) -> bool:
        """유효한 토큰 확보"""
        if self.token_info.is_access_token_valid():
            return True

        if self.token_info.is_refresh_token_valid():
            return self.refresh_access_token()

        return self.request_token()

    def search(
        self,
        target: str,
        query: str,
        search_field: str = "BI",  # 기본: 기본색인
        cur_page: int = 1,
        row_count: int = 10,
        sort_field: str = "",
        session_id: str = "cnt_eval_system"
    ) -> Dict[str, Any]:
        """
        KISTI 검색 API 호출

        Args:
            target: 서비스 타입 (ARTI, PATENT, REPORT, ATT)
            query: 검색어
            search_field: 검색 필드 (BI: 기본색인, TI: 제목, AU: 저자 등)
            cur_page: 현재 페이지
            row_count: 결과 수 (최대 100)
            sort_field: 정렬 필드
            session_id: 세션 ID

        Returns:
            검색 결과 딕셔너리
        """
        # 토큰 확인
        if not self.ensure_valid_token():
            return {"success": False, "error": "토큰 발급 실패"}

        # 타겟 검증
        if target.upper() not in self.SERVICE_TARGETS:
            return {"success": False, "error": f"지원하지 않는 서비스: {target}"}

        # 검색 쿼리 생성
        search_query = json.dumps({search_field: query}, ensure_ascii=False)

        url = f"{self.config.base_url}/openapicall.do"
        params = {
            "client_id": self.config.client_id,
            "token": self.token_info.access_token,
            "version": self.config.api_version,
            "action": "search",
            "target": target.upper(),
            "searchQuery": search_query,
            "curPage": cur_page,
            "rowCount": min(row_count, 100),  # 최대 100건
            "session_id": session_id,
        }

        if sort_field:
            params["sortField"] = sort_field

        try:
            response = requests.get(url, params=params, timeout=60, verify=self.config.verify_ssl)

            if response.status_code == 200:
                return self._parse_xml_response(response.text, target)
            elif response.status_code == 401:
                # 토큰 만료 - 갱신 후 재시도
                if self.refresh_access_token():
                    params["token"] = self.token_info.access_token
                    response = requests.get(url, params=params, timeout=60, verify=self.config.verify_ssl)
                    if response.status_code == 200:
                        return self._parse_xml_response(response.text, target)
                return {"success": False, "error": "인증 실패"}
            else:
                return {"success": False, "error": f"HTTP {response.status_code}"}

        except Exception as e:
            return {"success": False, "error": str(e)}

    def _parse_xml_response(self, xml_text: str, target: str) -> Dict[str, Any]:
        """XML 응답 파싱"""
        try:
            root = ET.fromstring(xml_text)

            # 에러 체크
            status_code = root.findtext(".//statusCode")
            if status_code and status_code != "200":
                error_code = root.findtext(".//errorCode", "")
                error_msg = root.findtext(".//errorMessage", "")
                return {
                    "success": False,
                    "error": f"[{error_code}] {error_msg}",
                    "status_code": status_code
                }

            # 결과 요약
            total_count = int(root.findtext(".//TotalCount", "0"))
            cur_page = int(root.findtext(".//curPage", "1"))

            # 레코드 파싱
            records = []
            record_list = root.find(".//recordList")

            if record_list is not None:
                for record in record_list.findall("record"):
                    record_data = self._parse_record(record, target)
                    if record_data:
                        records.append(record_data)

            return {
                "success": True,
                "target": target,
                "total_count": total_count,
                "current_page": cur_page,
                "records_count": len(records),
                "records": records
            }

        except ET.ParseError as e:
            return {"success": False, "error": f"XML 파싱 오류: {e}"}

    def _parse_record(self, record: ET.Element, target: str) -> Dict[str, Any]:
        """개별 레코드 파싱

        XML 구조: <item metaCode="Title" metaName="논문제목">내용</item>
        """
        data = {}

        # 모든 item 요소를 딕셔너리로 변환
        items = {}
        for item in record.findall("item"):
            meta_code = item.get("metaCode", "")
            if meta_code:
                items[meta_code] = item.text or ""

        # 공통 필드 매핑
        data["cn"] = items.get("CN", items.get("ArticleId", ""))
        data["title"] = items.get("Title", items.get("TI", ""))
        data["title_en"] = items.get("Title2", items.get("TI_EN", ""))

        if target == "ARTI":  # 논문
            data["authors"] = items.get("Authors", items.get("AU", ""))
            data["journal"] = items.get("JournalName", items.get("JT", ""))
            data["volume"] = items.get("VolNo1", items.get("VO", ""))
            data["issue"] = items.get("VolNo2", items.get("IS", ""))
            data["year"] = items.get("Pubyear", items.get("PY", ""))
            data["doi"] = items.get("DOI", "")
            data["issn"] = items.get("ISSN", "")
            data["abstract"] = items.get("Abstract", items.get("AB", ""))
            data["keywords"] = items.get("Keyword", items.get("KW", ""))
            data["publisher"] = items.get("Publisher", "")

        elif target == "PATENT":  # 특허
            data["applicant"] = items.get("Applicant", items.get("AP", ""))
            data["inventor"] = items.get("Inventor", items.get("IN", ""))
            data["application_no"] = items.get("ApplicationNo", items.get("AN", ""))
            data["publication_no"] = items.get("PublicationNo", items.get("PN", ""))
            data["application_date"] = items.get("ApplicationDate", items.get("AD", ""))
            data["publication_date"] = items.get("PublicationDate", items.get("PD", ""))
            data["ipc"] = items.get("IPC", "")
            data["abstract"] = items.get("Abstract", items.get("AB", ""))

        elif target == "REPORT":  # 보고서
            data["authors"] = items.get("Authors", items.get("AU", ""))
            data["organization"] = items.get("Organization", items.get("OG", ""))
            data["year"] = items.get("Pubyear", items.get("PY", ""))
            data["report_no"] = items.get("ReportNo", items.get("RN", ""))
            data["abstract"] = items.get("Abstract", items.get("AB", ""))
            data["keywords"] = items.get("Keyword", items.get("KW", ""))

        elif target == "ATT":  # 동향
            data["authors"] = items.get("Authors", items.get("AU", ""))
            data["source"] = items.get("Source", items.get("SO", ""))
            data["year"] = items.get("Pubyear", items.get("PY", ""))
            data["abstract"] = items.get("Abstract", items.get("AB", ""))
            data["keywords"] = items.get("Keyword", items.get("KW", ""))

        return data

    def search_articles(self, query: str, **kwargs) -> Dict[str, Any]:
        """논문 검색"""
        return self.search("ARTI", query, **kwargs)

    def search_patents(self, query: str, **kwargs) -> Dict[str, Any]:
        """특허 검색"""
        return self.search("PATENT", query, **kwargs)

    def search_reports(self, query: str, **kwargs) -> Dict[str, Any]:
        """보고서 검색"""
        return self.search("REPORT", query, **kwargs)

    def search_trends(self, query: str, **kwargs) -> Dict[str, Any]:
        """동향 검색"""
        return self.search("ATT", query, **kwargs)


# 테스트용 싱글톤 인스턴스
_kisti_client: Optional[KISTIClient] = None

def get_kisti_client() -> KISTIClient:
    """KISTI 클라이언트 싱글톤 반환"""
    global _kisti_client
    if _kisti_client is None:
        _kisti_client = KISTIClient()
    return _kisti_client


if __name__ == "__main__":
    # 테스트
    print("=" * 60)
    print("KISTI ScienceON API 테스트")
    print("=" * 60)

    client = KISTIClient()

    # 토큰 발급 테스트
    print("\n[1] 토큰 발급 테스트")
    if client.request_token():
        print(f"  Access Token: {client.token_info.access_token[:20]}...")
        print(f"  만료 시간: {client.token_info.access_token_expire}")

        # 논문 검색 테스트
        print("\n[2] 논문 검색 테스트 (건설신기술)")
        result = client.search_articles("건설신기술", row_count=5)

        if result["success"]:
            print(f"  총 결과: {result['total_count']}건")
            print(f"  반환 결과: {result['records_count']}건")
            for i, record in enumerate(result["records"][:3], 1):
                print(f"\n  [{i}] {record.get('title', 'N/A')[:50]}...")
                print(f"      저자: {record.get('authors', 'N/A')[:30]}")
                print(f"      학술지: {record.get('journal', 'N/A')}")
        else:
            print(f"  검색 실패: {result.get('error')}")
    else:
        print("  토큰 발급 실패")
