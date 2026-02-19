# Development Log

## 2025-02-19: UI/UX 리팩토링 및 정리

### 작업 내용

1. **노드 렌더링 버그 수정**
   - 문제: `data.file-loader` 등 새 노드 타입이 React Flow에 등록되지 않아 원형 핸들만 표시됨
   - 원인: `registerBuiltinExecutors()`가 App.tsx에서 호출되어, WorkflowEditor 모듈 로드 시점에 NodeRegistry가 비어있었음
   - 해결: main.tsx에서 App import 전에 executor 등록 수행

2. **불필요한 노드 제거**
   - 공공데이터 API 노드 삭제 (KIPRIS, data.go.kr)
   - NODE_CATEGORIES에서 '공공데이터 API' 카테고리 제거
   - AWS 기능에 집중하도록 정리

3. **파일 변경 목록**
   - `src/main.tsx`: executor 등록을 App import 전으로 이동
   - `src/App.tsx`: 중복 등록 코드 제거
   - `src/components/WorkflowEditor/index.tsx`: NodeRegistry에서 노드 타입 동적 등록
   - `src/components/NodePalette/index.tsx`: 공공데이터 API 노드 제거

### 다음 작업

- [ ] AWS Bedrock 연결 테스트 (Claude 모델 호출)
- [ ] 파일 로드 → 텍스트 추출 → LLM 분석 파이프라인 테스트
- [ ] 로컬 저장소 (SQLite) 연동 테스트

### 참고 사항

- 타 환경에서 개발 시 `npm install` 후 `npm run tauri dev` 실행
- AWS 자격 증명은 앱 시작 시 설정하거나 건너뛸 수 있음
- 노드가 제대로 렌더링되지 않으면 브라우저 localStorage 클리어 필요

---

## Architecture Decisions

### Node Type Registration Flow

```
main.tsx
  ├── registerBuiltinExecutors()  ← NodeRegistry 채움
  ├── registerBuiltinProviders()
  ├── registerBuiltinPlugins()
  └── import App
        └── MainLayout
              └── WorkflowEditor
                    └── registerAllNodeTypes()  ← NodeRegistry에서 가져옴
```

### 확장성 설계

- `src/executors/extension/`: Azure, GCP CLI 확장 슬롯 (현재 비활성화)
- `NodeDefinition.requirements.provider`: 인증 요구사항 명시
- 새 AI 프로바이더 추가 시 executor만 구현하면 자동 등록
