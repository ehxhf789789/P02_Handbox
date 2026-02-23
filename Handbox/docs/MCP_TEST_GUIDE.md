# Handbox MCP 고도화 테스트 가이드

## 개요

이 가이드는 Handbox의 Local MCP (Model Context Protocol) 시스템을 테스트하기 위한 프롬프트와 시나리오를 제공합니다. 총 20개의 내장 도구(기본 10개 + 고급 10개)를 다양한 시나리오에서 테스트합니다.

---

## 1. 기본 도구 테스트

### 1.1 텍스트 변환 (text_transform)

```
테스트 프롬프트:
"Hello World를 대문자로 변환해줘"
"이 문자열을 Base64로 인코딩해줘: Handbox MCP Test"
"https%3A%2F%2Fexample.com 을 URL 디코딩해줘"
```

**예상 결과:**
- uppercase: "HELLO WORLD"
- base64_encode: "SGFuZGJveCBNQ1AgVGVzdA=="
- url_decode: "https://example.com"

### 1.2 JSON 처리 (json_process)

```
테스트 프롬프트:
"이 JSON을 예쁘게 포맷해줘: {\"name\":\"test\",\"value\":123}"
"JSON에서 name 필드 값을 추출해줘: {\"user\":{\"name\":\"홍길동\",\"age\":30}}"
```

**테스트 입력:**
```json
{
  "operation": "query",
  "json": "{\"users\":[{\"name\":\"Alice\"},{\"name\":\"Bob\"}]}",
  "query": "$.users[0].name"
}
```

### 1.3 수학 계산 (math_calculate)

```
테스트 프롬프트:
"(10 + 20) * 3 / 2 계산해줘"
"[85, 90, 78, 92, 88]의 통계 분석을 해줘"
"0.75를 백분율로 변환해줘"
"100미터를 피트로 변환해줘"
```

**복합 테스트:**
```json
{
  "operation": "statistics",
  "numbers": [100, 200, 150, 300, 250, 180, 220]
}
```

### 1.4 날짜/시간 (datetime)

```
테스트 프롬프트:
"현재 날짜와 시간을 알려줘"
"2024-12-25를 YYYY년 MM월 DD일 형식으로 변환해줘"
"오늘부터 30일 후는 언제야?"
```

### 1.5 차트 생성 (chart_generate)

```json
{
  "type": "bar",
  "data": {
    "labels": ["1분기", "2분기", "3분기", "4분기"],
    "datasets": [{
      "label": "매출",
      "data": [120, 190, 300, 250]
    }]
  },
  "title": "2024년 분기별 매출"
}
```

### 1.6 HTTP 요청 (http_request)

```
테스트 프롬프트:
"https://jsonplaceholder.typicode.com/posts/1 에서 데이터를 가져와줘"
```

### 1.7 정규식 (regex)

```
테스트 프롬프트:
"이메일 주소를 추출해줘: 연락처는 test@example.com 또는 info@company.co.kr 입니다"
"전화번호 형식을 010-XXXX-XXXX로 마스킹해줘: 010-1234-5678"
```

### 1.8 암호화 유틸 (crypto_utils)

```
테스트 프롬프트:
"새 UUID를 생성해줘"
"'password123'의 SHA-256 해시를 계산해줘"
"32자리 랜덤 문자열을 생성해줘"
```

### 1.9 데이터 변환 (data_transform)

```
테스트 프롬프트:
"이 CSV를 JSON으로 변환해줘:
name,age,city
Alice,30,Seoul
Bob,25,Busan"

"이 JSON을 마크다운 테이블로 변환해줘:
[{\"name\":\"Alice\",\"score\":95},{\"name\":\"Bob\",\"score\":87}]"
```

---

## 2. RAG (검색 증강 생성) 테스트

### 2.1 문서 인제스트 (rag_ingest)

```
시나리오: 로컬 PDF 문서를 지식 베이스에 추가

테스트 입력:
{
  "sourceType": "local",
  "sourcePath": "C:/Documents/manual.pdf",
  "knowledgeBaseName": "product_docs",
  "chunkingStrategy": "semantic",
  "chunkSize": 512
}
```

```
시나리오: S3의 문서 폴더 전체 인제스트

테스트 입력:
{
  "sourceType": "s3",
  "sourcePath": "s3://my-bucket/documents/",
  "knowledgeBaseName": "company_knowledge",
  "metadata": {
    "department": "engineering",
    "year": 2024
  }
}
```

### 2.2 시맨틱 검색 (rag_query)

```
테스트 프롬프트:
"product_docs 지식 베이스에서 '설치 방법'을 검색해줘"
"기술 문서에서 API 인증 방법에 대한 정보를 찾아줘"
```

**고급 검색:**
```json
{
  "query": "머신러닝 모델 배포 방법",
  "knowledgeBaseName": "tech_docs",
  "topK": 10,
  "similarityThreshold": 0.8,
  "filters": {
    "category": "deployment",
    "year": 2024
  },
  "reranking": true
}
```

### 2.3 RAG 기반 응답 생성 (rag_generate)

```
테스트 프롬프트:
"product_docs를 참고해서 제품 설치 단계를 설명해줘"
"기술 문서를 기반으로 API 사용 예제 코드를 작성해줘"
```

**복합 RAG 질의:**
```json
{
  "question": "AWS Lambda에서 Python 함수를 배포하는 전체 과정을 설명해주세요. 코드 예제도 포함해주세요.",
  "knowledgeBaseName": "aws_docs",
  "model": "claude-3-sonnet",
  "topK": 7,
  "maxTokens": 2048,
  "includeSourceCitations": true
}
```

---

## 3. AWS S3 연동 테스트

### 3.1 파일 업로드 (s3_upload)

```json
{
  "localPath": "C:/Data/report.pdf",
  "bucket": "my-handbox-bucket",
  "key": "reports/2024/monthly_report.pdf",
  "region": "ap-northeast-2",
  "metadata": {
    "author": "system",
    "type": "report"
  }
}
```

### 3.2 파일 다운로드 (s3_download)

```json
{
  "bucket": "my-handbox-bucket",
  "key": "datasets/training_data.csv",
  "localPath": "C:/Downloads/training_data.csv",
  "region": "ap-northeast-2"
}
```

### 3.3 버킷 탐색 (s3_list)

```json
{
  "bucket": "my-handbox-bucket",
  "prefix": "documents/2024/",
  "maxKeys": 50
}
```

---

## 4. 지식 베이스 관리 테스트

### 4.1 지식 베이스 생성 (kb_create)

```json
{
  "name": "engineering_docs",
  "description": "엔지니어링 팀 기술 문서",
  "embeddingModel": "local",
  "vectorDB": "local",
  "chunkingStrategy": "semantic",
  "chunkSize": 512
}
```

### 4.2 지식 베이스 목록 (kb_list)

```json
{
  "status": "active"
}
```

---

## 5. AI 에이전트 테스트

### 5.1 에이전트 호출 (agent_invoke)

```
시나리오: 코드 리뷰 에이전트

테스트 입력:
{
  "agentName": "code_reviewer",
  "prompt": "다음 Python 코드를 리뷰해줘:\ndef calc(x,y): return x+y",
  "enableTrace": true,
  "maxIterations": 3
}
```

```
시나리오: 데이터 분석 에이전트

테스트 입력:
{
  "agentName": "data_analyst",
  "prompt": "sales.csv 파일을 분석하고 월별 트렌드를 요약해줘",
  "sessionId": "analysis_session_001"
}
```

---

## 6. 비전/멀티모달 테스트

### 6.1 이미지 분석 (vision_analyze)

```
시나리오: 일반 이미지 분석

{
  "imagePath": "C:/Images/diagram.png",
  "analysisType": "general",
  "prompt": "이 다이어그램의 구조를 설명해줘"
}
```

```
시나리오: 문서 OCR

{
  "imagePath": "C:/Scans/invoice.pdf",
  "analysisType": "ocr",
  "model": "claude-3-sonnet"
}
```

```
시나리오: 차트 분석

{
  "imagePath": "C:/Charts/sales_chart.png",
  "analysisType": "chart",
  "prompt": "이 차트에서 가장 높은 매출 월을 찾아줘"
}
```

---

## 7. 복합 워크플로우 테스트

### 7.1 문서 처리 파이프라인

```
시나리오: S3에서 문서 다운로드 → RAG 인제스트 → 질의 응답

단계:
1. s3_download로 문서 다운로드
2. rag_ingest로 지식 베이스에 추가
3. rag_generate로 질의 응답

프롬프트:
"S3의 technical_docs 폴더에서 최신 API 문서를 다운받아서 지식 베이스에 추가하고,
'인증 토큰 갱신 방법'에 대해 질문해줘"
```

### 7.2 데이터 분석 파이프라인

```
시나리오: 파일 읽기 → JSON 변환 → 통계 분석 → 차트 생성

단계:
1. file_read로 CSV 읽기
2. data_transform으로 JSON 변환
3. math_calculate로 통계 분석
4. chart_generate로 시각화

프롬프트:
"sales_data.csv를 읽어서 월별 매출 통계를 계산하고 바 차트로 시각화해줘"
```

### 7.3 멀티 에이전트 평가

```
시나리오: 여러 에이전트가 협업하여 문서 평가

단계:
1. vision_analyze로 문서 구조 파악
2. rag_query로 관련 기준 검색
3. agent_invoke (평가자 1) - 기술적 관점
4. agent_invoke (평가자 2) - 비즈니스 관점
5. math_calculate로 점수 집계

프롬프트:
"제출된 기술 제안서를 기술적 관점과 비즈니스 관점에서 평가하고,
평가 기준에 따른 종합 점수를 계산해줘"
```

---

## 8. XAI (설명 가능한 AI) 테스트

### 8.1 추론 과정 추적

모든 도구 실행 시 XAI 패널에서 확인해야 할 항목:

1. **추론 단계 (Reasoning Steps)**
   - 각 단계의 action과 rationale 확인
   - 단계별 소요 시간 확인

2. **토큰 기여도 (Token Attribution)**
   - 핵심 키워드 하이라이트
   - 기여도 백분율 확인

3. **신뢰도 요인 (Confidence Factors)**
   - 각 요인별 기여도 확인
   - 불확실성 요인 확인

4. **대안 분석 (Alternatives)**
   - 고려된 대안 목록
   - 선택되지 않은 이유

### 8.2 XAI 테스트 프롬프트

```
"XAI를 활성화하고 '분기별 매출 데이터를 분석해서 트렌드를 예측해줘'에 대한
AI의 추론 과정을 확인해줘"
```

---

## 9. 성능 및 스트레스 테스트

### 9.1 대용량 데이터 처리

```
시나리오: 1000개 청크 RAG 검색

{
  "query": "복잡한 기술적 질문...",
  "knowledgeBaseName": "large_kb",
  "topK": 50,
  "reranking": true
}
```

### 9.2 동시 도구 호출

```
동시에 여러 도구 실행:
1. rag_query (검색 1)
2. rag_query (검색 2)
3. math_calculate (통계)
4. chart_generate (시각화)
```

---

## 10. 테스트 체크리스트

### 기본 도구 (10개)
- [ ] text_transform - 모든 operation 테스트
- [ ] json_process - parse, query, prettify 테스트
- [ ] math_calculate - evaluate, statistics, convert 테스트
- [ ] datetime - now, parse, format, add 테스트
- [ ] chart_generate - bar, line, pie 테스트
- [ ] file_read - 텍스트, JSON 파일 테스트
- [ ] http_request - GET, POST 테스트
- [ ] regex - match, replace, split 테스트
- [ ] crypto_utils - uuid, hash, random 테스트
- [ ] data_transform - csv→json, json→markdown 테스트

### 고급 도구 (10개)
- [ ] rag_ingest - local, s3 소스 테스트
- [ ] rag_query - 기본 검색, 필터, 리랭킹 테스트
- [ ] rag_generate - 응답 생성, 출처 인용 테스트
- [ ] s3_upload - 단일 파일, 메타데이터 테스트
- [ ] s3_download - 파일 다운로드 테스트
- [ ] s3_list - 버킷 탐색, prefix 필터 테스트
- [ ] kb_create - 지식 베이스 생성 테스트
- [ ] kb_list - 목록 조회 테스트
- [ ] agent_invoke - 에이전트 호출, 추적 테스트
- [ ] vision_analyze - general, ocr, chart 테스트

### XAI 기능
- [ ] 추론 단계 표시 확인
- [ ] 토큰 기여도 분석 확인
- [ ] 신뢰도 계산 및 요인 표시 확인
- [ ] 대안 분석 확인

### 복합 워크플로우
- [ ] 문서 처리 파이프라인 테스트
- [ ] 데이터 분석 파이프라인 테스트
- [ ] 멀티 에이전트 평가 테스트

---

## 문제 해결

### 도구 실행 실패 시
1. 브라우저 콘솔에서 오류 메시지 확인
2. Tauri 백엔드 로그 확인 (`src-tauri/target/debug/`)
3. 입력 파라미터 JSON Schema 검증

### RAG 검색 품질 저하 시
1. 청킹 전략 변경 (semantic → paragraph)
2. 청크 크기 조정 (256 ~ 1024)
3. 유사도 임계값 조정 (0.6 ~ 0.9)
4. 리랭킹 활성화

### XAI 데이터 누락 시
1. xaiEnabled 설정 확인
2. LLM 응답 형식 확인 (CoT 패턴)
3. XAI 패널 토글 상태 확인

---

## 다음 단계

1. **Tauri 백엔드 구현**: RAG 엔진, 벡터 DB, AWS SDK 연동
2. **실제 LLM 연동**: Claude, GPT-4 API 연결
3. **벡터 DB 선택**: Chroma, Pinecone, OpenSearch 중 선택
4. **성능 최적화**: 캐싱, 배치 처리, 인덱싱
