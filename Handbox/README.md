# CNT Agent Studio

**건설신기술 AI 에이전트 워크플로우 스튜디오**

Make.ai 스타일의 노드 기반 워크플로우 에디터로 AWS 에이전트를 시각적으로 구성하고 실행할 수 있습니다.

![CNT Agent Studio](./docs/screenshot.png)

## 주요 기능

### 📊 노드 기반 워크플로우 에디터
- **드래그 앤 드롭**: 노드를 캔버스에 끌어다 놓기
- **시각적 연결**: 노드 간 데이터 흐름을 선으로 연결
- **실시간 미리보기**: 워크플로우 실행 결과 즉시 확인

### 🤖 AI 에이전트 노드
- **신규성 평가**: 건설신기술 신규성 자동 평가
- **진보성 평가**: 품질향상, 안전성, 첨단기술성 평가
- **현장적용성 평가**: 시공성, 경제성, 보급성 평가
- **커스텀 에이전트**: 사용자 정의 프롬프트로 에이전트 생성

### 📚 지식베이스 관리
- **문서 로더**: PDF/JSON 문서 업로드
- **자동 청킹**: 슬라이딩 윈도우 기반 문서 분할
- **벡터 임베딩**: Amazon Titan으로 임베딩 생성
- **RAG 검색**: 유사도 기반 컨텍스트 검색

### ☁️ AWS 서비스 통합
- **Amazon Bedrock**: Claude 3.5 Sonnet, Claude 3 모델
- **Amazon S3**: 문서 저장소
- **OpenSearch Serverless**: 벡터 데이터베이스

---

## 설치 방법

### 사전 요구사항

1. **Node.js** (v18+)
2. **Rust** (v1.70+)
3. **AWS CLI** 및 자격 증명

### 1. 의존성 설치

```bash
cd cnt-agent-studio

# Node.js 패키지
npm install

# Rust 의존성 (자동 설치)
cd src-tauri
cargo build
```

### 2. AWS 자격 증명 설정

```bash
# AWS CLI로 설정
aws configure

# 또는 환경 변수 설정
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=ap-southeast-2
```

### 3. 개발 모드 실행

```bash
npm run tauri dev
```

### 4. 프로덕션 빌드

```bash
npm run tauri build
```

빌드된 앱은 `src-tauri/target/release/bundle/` 에 생성됩니다.

---

## 사용 방법

### 1. AWS 로그인
앱 실행 후 AWS Access Key ID와 Secret Access Key를 입력합니다.

### 2. 워크플로우 생성
1. 왼쪽 **노드 팔레트**에서 노드를 선택
2. 캔버스로 **드래그 앤 드롭**
3. 노드 간 **연결선**으로 데이터 흐름 정의

### 3. 노드 설정
노드 클릭 시 오른쪽 **속성 패널**에서:
- 모델 선택 (Claude 3.5 Sonnet 등)
- 시스템 프롬프트 설정
- Temperature, Max Tokens 조정
- RAG 활성화 여부

### 4. 워크플로우 실행
상단 **실행** 버튼 클릭으로 워크플로우 실행

---

## 노드 타입

| 카테고리 | 노드 | 설명 |
|----------|------|------|
| 입력/출력 | Input | 워크플로우 시작점 |
| 입력/출력 | Output | 워크플로우 종료점 |
| AI 에이전트 | AI Agent | Claude 기반 평가 에이전트 |
| AI 에이전트 | 신규성 평가 | 건설신기술 신규성 평가 |
| AI 에이전트 | 진보성 평가 | 건설신기술 진보성 평가 |
| AI 에이전트 | 현장적용성 평가 | 건설신기술 현장적용성 평가 |
| 지식베이스 | Knowledge Base | RAG용 벡터 데이터베이스 |
| 지식베이스 | Document Loader | PDF/JSON 문서 로드 |
| 지식베이스 | Chunker | 문서 청킹 |
| 지식베이스 | Embedder | Titan 임베딩 생성 |
| AWS 서비스 | S3 | AWS S3 버킷 연결 |
| AWS 서비스 | Bedrock | AWS Bedrock LLM |
| AWS 서비스 | OpenSearch | 벡터 검색 |

---

## 프로젝트 구조

```
cnt-agent-studio/
├── src-tauri/              # Rust 백엔드
│   ├── src/
│   │   ├── main.rs         # 진입점
│   │   ├── commands/       # Tauri 커맨드
│   │   │   ├── workflow.rs
│   │   │   ├── aws_service.rs
│   │   │   ├── agent.rs
│   │   │   └── knowledge_base.rs
│   │   └── prompts/        # 시스템 프롬프트
│   └── Cargo.toml
│
├── src/                    # React 프론트엔드
│   ├── components/
│   │   ├── AWSLogin/       # AWS 로그인 화면
│   │   ├── MainLayout/     # 메인 레이아웃
│   │   ├── NodePalette/    # 노드 팔레트
│   │   ├── WorkflowEditor/ # 워크플로우 에디터
│   │   └── PropertyPanel/  # 속성 패널
│   ├── nodes/              # 커스텀 노드 컴포넌트
│   ├── stores/             # Zustand 상태 관리
│   └── App.tsx
│
├── package.json
└── README.md
```

---

## AWS 서비스 설정

### Bedrock 모델 액세스
1. AWS 콘솔 → Amazon Bedrock → Model access
2. Claude 3.5 Sonnet 모델 액세스 요청
3. 승인 후 사용 가능

### OpenSearch Serverless (선택)
1. AWS 콘솔 → OpenSearch Service → Serverless
2. 컬렉션 생성 (Vector search 타입)
3. 엔드포인트 URL 복사하여 설정

---

## 트러블슈팅

### AWS 연결 오류
```bash
# 자격 증명 확인
aws sts get-caller-identity

# Bedrock 리전 확인 (us-east-1 등)
aws bedrock list-foundation-models --region us-east-1
```

### Rust 빌드 오류
```bash
# 의존성 재설치
cd src-tauri
cargo clean
cargo build
```

---

## 라이선스

MIT License

---

## 문의

건설신기술 평가 시스템 관련 문의는 이슈를 통해 접수해 주세요.
