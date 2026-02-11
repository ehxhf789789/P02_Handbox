"""
S3 업로드 및 관리
"""

import os
import json
import boto3
from pathlib import Path
from typing import List, Dict, Any, Optional
from botocore.exceptions import ClientError

import sys
sys.path.append(str(Path(__file__).parent.parent.parent))
from aws_agent.config import AWSConfig


class S3Uploader:
    """S3에 문서 업로드 및 관리"""

    def __init__(self, config: AWSConfig = None):
        self.config = config or AWSConfig()
        self.s3_client = boto3.client("s3", region_name=self.config.region)
        self.bucket = self.config.s3_bucket

    def create_bucket_if_not_exists(self) -> bool:
        """버킷이 없으면 생성"""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
            print(f"[정보] 버킷 존재: {self.bucket}")
            return True
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code == "404":
                print(f"[정보] 버킷 생성: {self.bucket}")
                try:
                    # 리전별 설정
                    if self.config.region == "us-east-1":
                        self.s3_client.create_bucket(Bucket=self.bucket)
                    else:
                        self.s3_client.create_bucket(
                            Bucket=self.bucket,
                            CreateBucketConfiguration={
                                "LocationConstraint": self.config.region
                            }
                        )
                    return True
                except ClientError as create_error:
                    print(f"[오류] 버킷 생성 실패: {create_error}")
                    return False
            else:
                print(f"[오류] 버킷 확인 실패: {e}")
                return False

    def upload_file(self, local_path: str, s3_key: str) -> Optional[str]:
        """로컬 파일을 S3에 업로드"""
        try:
            self.s3_client.upload_file(local_path, self.bucket, s3_key)
            s3_uri = f"s3://{self.bucket}/{s3_key}"
            print(f"[성공] 업로드: {local_path} -> {s3_uri}")
            return s3_uri
        except ClientError as e:
            print(f"[오류] 업로드 실패: {e}")
            return None

    def upload_json(self, data: Dict[str, Any], s3_key: str) -> Optional[str]:
        """JSON 데이터를 S3에 업로드"""
        try:
            json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            self.s3_client.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=json_bytes,
                ContentType="application/json"
            )
            s3_uri = f"s3://{self.bucket}/{s3_key}"
            print(f"[성공] JSON 업로드: {s3_uri}")
            return s3_uri
        except ClientError as e:
            print(f"[오류] JSON 업로드 실패: {e}")
            return None

    def upload_directory(
        self,
        local_dir: str,
        s3_prefix: str,
        file_extension: str = ".json"
    ) -> List[str]:
        """디렉토리 내 파일들을 S3에 업로드"""
        uploaded = []
        local_path = Path(local_dir)

        for file_path in local_path.glob(f"*{file_extension}"):
            s3_key = f"{s3_prefix}{file_path.name}"
            result = self.upload_file(str(file_path), s3_key)
            if result:
                uploaded.append(result)

        print(f"[완료] {len(uploaded)}개 파일 업로드")
        return uploaded

    def download_file(self, s3_key: str, local_path: str) -> bool:
        """S3에서 파일 다운로드"""
        try:
            self.s3_client.download_file(self.bucket, s3_key, local_path)
            print(f"[성공] 다운로드: {s3_key} -> {local_path}")
            return True
        except ClientError as e:
            print(f"[오류] 다운로드 실패: {e}")
            return False

    def list_objects(self, prefix: str = "") -> List[Dict[str, Any]]:
        """버킷 내 객체 목록 조회"""
        try:
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket,
                Prefix=prefix
            )

            objects = []
            for obj in response.get("Contents", []):
                objects.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat()
                })

            return objects
        except ClientError as e:
            print(f"[오류] 목록 조회 실패: {e}")
            return []

    def get_json(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """S3에서 JSON 파일 읽기"""
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=s3_key)
            content = response["Body"].read().decode("utf-8")
            return json.loads(content)
        except ClientError as e:
            print(f"[오류] JSON 읽기 실패: {e}")
            return None


def upload_extracted_jsons(json_dir: str = None):
    """추출된 JSON 파일들을 S3에 업로드하는 유틸리티 함수"""
    if json_dir is None:
        json_dir = Path(__file__).parent.parent.parent / "extracted_json"

    uploader = S3Uploader()

    # 버킷 생성 확인
    if not uploader.create_bucket_if_not_exists():
        print("[오류] 버킷 생성/확인 실패")
        return

    # JSON 파일 업로드
    uploaded = uploader.upload_directory(
        local_dir=str(json_dir),
        s3_prefix="processed/",
        file_extension=".json"
    )

    print(f"\n총 {len(uploaded)}개 파일 업로드 완료")
    return uploaded


if __name__ == "__main__":
    # 테스트
    upload_extracted_jsons()
