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

- [ ] **노드 렌더링 완전 해결** - data.file-loader 타입이 여전히 누락될 수 있음
- [ ] AWS Bedrock 연결 테스트 (Claude 모델 호출)
- [ ] 파일 로드 → 텍스트 추출 → LLM 분석 파이프라인 테스트
- [ ] 로컬 저장소 (SQLite) 연동 테스트

### 현재 이슈 (2025-02-19 세션 종료 시점)

**노드 렌더링 문제가 완전히 해결되지 않음:**
- ES 모듈 호이스팅으로 인해 main.tsx에서 executor 등록 전에 모듈이 로드됨
- useMemo로 nodeTypes 생성을 컴포넌트 렌더링 시점으로 이동했으나 여전히 문제 발생 가능
- **해결 방안**: nodeTypes에 모든 필요한 타입을 하드코딩하거나, 동적 import 사용

### 참고 사항

- 타 환경에서 개발 시 `npm install` 후 `npm run tauri dev` 실행
- AWS 자격 증명은 앱 시작 시 설정하거나 건너뛸 수 있음
- 노드가 제대로 렌더링되지 않으면 브라우저 localStorage 클리어 필요
- 콘솔에서 `[WorkflowEditor] nodeTypes 생성 완료: XX개 타입` 확인

---

## Architecture Decisions

### Node Type Registration Flow (현재)

```
main.tsx
  ├── import { registerBuiltinExecutors }  ← 모듈 호이스팅됨
  ├── registerBuiltinExecutors()           ← 실행
  └── import App                           ← 이미 로드됨 (문제!)
        └── MainLayout
              └── WorkflowEditor
                    └── useMemo(() => nodeTypes)  ← 렌더링 시 생성
```

### 권장 수정 방향

1. **하드코딩 방식**: 모든 노드 타입을 WorkflowEditor에 직접 명시
2. **동적 import**: `await import('./executors')` 사용
3. **Context 기반**: nodeTypes를 Context로 전달

### 확장성 설계

- `src/executors/extension/`: Azure, GCP CLI 확장 슬롯 (현재 비활성화)
- `NodeDefinition.requirements.provider`: 인증 요구사항 명시
- 새 AI 프로바이더 추가 시 executor만 구현하면 자동 등록
