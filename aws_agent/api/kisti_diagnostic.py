"""
KISTI ScienceON API 진단 스크립트
- 다양한 암호화 방식과 MAC 주소 형식을 테스트합니다.
- KISTI 기술 지원에 문의할 때 이 스크립트 결과를 공유하세요.
"""

import os
import sys
import json
import base64
import hashlib
from datetime import datetime, timezone
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 환경변수에서 로드 시도
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# 설정값
API_KEY = os.getenv("KISTI_API_KEY", "65d00ab7cbf841258017ffde7d8ed9fa")
CLIENT_ID = os.getenv("KISTI_CLIENT_ID", "2cdbac21f1e013308bc27ebd2dc20353d7a301b6f3af75b7def062075261f393")
MAC_ADDRESS = os.getenv("KISTI_MAC_ADDRESS", "D8-43-AE-1B-9F-B7")
BASE_URL = "https://apigateway.kisti.re.kr"


def aes_encrypt(data: str, key_bytes: bytes, iv: bytes, mode=AES.MODE_CBC) -> str:
    """AES 암호화"""
    cipher = AES.new(key_bytes, mode, iv) if mode == AES.MODE_CBC else AES.new(key_bytes, mode)
    encrypted = cipher.encrypt(pad(data.encode('utf-8'), AES.block_size))
    return base64.b64encode(encrypted).decode('utf-8')


def test_token_request(json_data: str, key_bytes: bytes, iv: bytes, description: str) -> dict:
    """토큰 요청 테스트"""
    try:
        encrypted = aes_encrypt(json_data, key_bytes, iv)

        url = f"{BASE_URL}/tokenrequest.do"
        params = {
            "accounts": encrypted,
            "client_id": CLIENT_ID
        }

        response = requests.get(url, params=params, timeout=30, verify=False)
        data = response.json()

        return {
            "description": description,
            "json": json_data,
            "encrypted": encrypted[:50] + "...",
            "status": response.status_code,
            "error_code": data.get("errorCode", "N/A"),
            "error_message": data.get("errorMessage", "SUCCESS"),
            "success": "errorCode" not in data
        }
    except Exception as e:
        return {
            "description": description,
            "json": json_data,
            "error": str(e),
            "success": False
        }


def run_diagnostics():
    """진단 테스트 실행"""
    print("=" * 70)
    print("KISTI ScienceON API 진단")
    print("=" * 70)
    print()

    # 설정 정보 출력
    print("[설정 정보]")
    print(f"  API Key: {API_KEY[:8]}...{API_KEY[-4:]} (len={len(API_KEY)})")
    print(f"  Client ID: {CLIENT_ID[:8]}...{CLIENT_ID[-4:]} (len={len(CLIENT_ID)})")
    print(f"  MAC Address: {MAC_ADDRESS}")
    print(f"  현재 시간 (로컬): {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  현재 시간 (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # datetime 준비
    current_time = datetime.now().strftime("%Y%m%d%H%M%S")

    # MAC 주소 형식
    mac_formats = {
        "hyphen": MAC_ADDRESS,
        "colon": MAC_ADDRESS.replace("-", ":"),
        "none": MAC_ADDRESS.replace("-", ""),
        "lower_hyphen": MAC_ADDRESS.lower(),
        "lower_none": MAC_ADDRESS.replace("-", "").lower(),
    }

    # 키 해석 방식
    key_methods = {
        "api_key_utf8": (API_KEY.encode('utf-8')[:32].ljust(32, b'\0'), API_KEY.encode('utf-8')[:16]),
        "api_key_utf8_zero_iv": (API_KEY.encode('utf-8')[:32].ljust(32, b'\0'), b'\0' * 16),
        "api_key_hex": (bytes.fromhex(API_KEY).ljust(32, b'\0')[:32], b'\0' * 16),
        "api_key_hex_iv": (bytes.fromhex(API_KEY).ljust(16, b'\0'), bytes.fromhex(API_KEY)[:16]),
        "client_id_hex": (bytes.fromhex(CLIENT_ID[:64]), bytes.fromhex(CLIENT_ID[:32])),
        "sha256_api_key": (hashlib.sha256(API_KEY.encode()).digest(), hashlib.sha256(API_KEY.encode()).digest()[:16]),
    }

    # JSON 필드명
    json_field_names = ["mac_address", "macAddress", "mac_addr", "mac"]

    results = []
    test_count = 0

    print("[테스트 실행 중...]")

    # 주요 조합만 테스트 (전체 테스트는 시간이 오래 걸림)
    for key_name, (key_bytes, iv) in key_methods.items():
        for mac_name, mac_value in mac_formats.items():
            for field_name in json_field_names:
                test_count += 1

                json_data = json.dumps({
                    field_name: mac_value,
                    "datetime": current_time
                }, separators=(',', ':'))

                desc = f"key={key_name}, mac={mac_name}, field={field_name}"
                result = test_token_request(json_data, key_bytes[:32], iv, desc)
                results.append(result)

                # 진행 상황 표시
                if test_count % 10 == 0:
                    print(f"  {test_count}개 테스트 완료...")

                # 성공하면 즉시 종료
                if result.get("success"):
                    print(f"\n성공! {desc}")
                    return results

    print(f"  총 {test_count}개 테스트 완료")
    print()

    # 결과 분석
    error_codes = {}
    for r in results:
        code = r.get("error_code", "ERROR")
        error_codes[code] = error_codes.get(code, 0) + 1

    print("[결과 요약]")
    print(f"  총 테스트: {len(results)}")
    print(f"  성공: {sum(1 for r in results if r.get('success'))}")
    print(f"  실패: {sum(1 for r in results if not r.get('success'))}")
    print()
    print("[에러 코드 분포]")
    for code, count in sorted(error_codes.items(), key=lambda x: -x[1]):
        print(f"  {code}: {count}건")
    print()

    # 대표 오류 메시지 출력
    print("[대표 오류 메시지]")
    for r in results[:3]:
        print(f"  - {r.get('error_message', r.get('error', 'Unknown'))}")
    print()

    print("[권장 조치]")
    print("  1. KISTI API 등록 정보 확인 (MAC 주소, API Key, Client ID)")
    print("  2. API 사용 기간이 만료되지 않았는지 확인")
    print("  3. KISTI 기술지원팀에 문의 (이 스크립트 결과 첨부)")
    print()

    return results


if __name__ == "__main__":
    results = run_diagnostics()

    # 결과 저장
    output_file = "kisti_diagnostic_results.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "config": {
                "api_key": API_KEY[:8] + "..." + API_KEY[-4:],
                "client_id": CLIENT_ID[:8] + "..." + CLIENT_ID[-4:],
                "mac_address": MAC_ADDRESS,
            },
            "results_count": len(results),
            "sample_results": results[:10]
        }, f, ensure_ascii=False, indent=2)

    print(f"상세 결과가 {output_file}에 저장되었습니다.")
