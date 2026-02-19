# Handbox - AI Workflow Automation Platform

## Project Overview

Handbox는 비개발자가 시각적으로 AI 워크플로우를 설계할 수 있는 데스크톱 애플리케이션입니다.

- **Tech Stack**: Tauri (Rust) + React + TypeScript
- **Primary Cloud**: AWS Bedrock (Claude, Titan 모델)
- **Local Features**: 파일 로드, 문서 파싱, SQLite 저장

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript)                              │
│  ├── WorkflowEditor (React Flow)                            │
│  ├── NodePalette (드래그 앤 드롭)                            │
│  ├── PropertyPanel (노드 설정)                               │
│  └── MainLayout                                             │
├─────────────────────────────────────────────────────────────┤
│  State Management (Zustand)                                 │
│  ├── workflowStore (노드, 엣지, 실행 상태)                    │
│  ├── appStore (인증, AWS 상태)                               │
│  └── dragStore (드래그 앤 드롭)                              │
├─────────────────────────────────────────────────────────────┤
│  Node System                                                │
│  ├── NodeRegistry (노드 정의 중앙 관리)                       │
│  ├── ExecutionEngine (워크플로우 실행)                        │
│  └── Executors (노드별 실행 로직)                            │
├─────────────────────────────────────────────────────────────┤
│  Backend (Tauri/Rust)                                       │
│  ├── AWS 연동 (Bedrock, S3, OpenSearch)                      │
│  ├── 파일 처리 (PDF, Excel, HWP)                             │
│  └── 로컬 저장소 (SQLite, JSON)                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| Path | Description |
|------|-------------|
| `src/main.tsx` | 앱 진입점 - **executor 등록이 App import 전에 실행되어야 함** |
| `src/App.tsx` | 메인 앱 컴포넌트, AWS 인증 플로우 |
| `src/executors/index.ts` | 모든 노드 executor 등록 |
| `src/registry/NodeRegistry.ts` | 노드 정의 중앙 관리 |
| `src/components/WorkflowEditor/index.tsx` | React Flow 기반 워크플로우 에디터 |
| `src/components/NodePalette/index.tsx` | 노드 드래그 팔레트 |
| `src/nodes/GenericNode.tsx` | 범용 노드 렌더링 컴포넌트 |
| `src-tauri/src/commands/` | Rust 백엔드 명령어 |

## Node Categories (8개)

1. **입출력** (io): input, output, local-file, local-folder
2. **문서 파싱** (convert): PDF, HWP, Word, Excel 파서
3. **텍스트 처리** (text): 텍스트 분할, 프롬프트 템플릿
4. **지식베이스** (vector): 임베딩, 벡터 저장소, RAG 검색 [AWS]
5. **AI 모델** (ai): Claude, Titan 등 Bedrock 모델 [AWS]
6. **제어 흐름** (control): 병합, 조건 분기
7. **내보내기** (export): Excel, PDF 내보내기
8. **시각화** (viz): 결과 뷰어, JSON 뷰어, 차트

## Critical Implementation Notes

### 1. Executor 등록 순서 (중요!)
```typescript
// main.tsx - App import 전에 실행 필수
registerBuiltinExecutors()  // NodeRegistry 채우기
registerBuiltinProviders()
registerBuiltinPlugins()

import App from './App'  // 이후 App import
```
**이유**: WorkflowEditor가 모듈 로드 시 NodeRegistry에서 노드 타입을 가져오므로, 등록이 먼저 되어야 함.

### 2. 노드 타입 등록
- `NodeRegistry`: 노드 정의 (executor, 포트, 설정 스키마)
- `WorkflowEditor.nodeTypes`: React Flow 컴포넌트 매핑
- 두 곳이 동기화되어야 노드가 정상 렌더링됨

### 3. AWS 인증
- `useAppStore.useAWSConnection`: AWS 사용 여부
- `useAppStore.awsStatus`: 연결 상태, 서비스 가용성
- Bedrock 노드는 AWS 인증 필요 (`authRequired: 'aws'`)

## Development Commands

```bash
# 개발 서버 실행
npm run tauri dev

# 빌드
npm run tauri build

# TypeScript 타입 체크
npx tsc --noEmit
```

## Current Status (2025-02-19)

### Completed
- [x] 공공데이터 API 노드 제거 (KIPRIS, data.go.kr)
- [x] 노드 타입 동적 등록 (NodeRegistry → React Flow)
- [x] main.tsx에서 executor 등록 순서 수정
- [x] 8개 핵심 카테고리로 정리

### In Progress
- [ ] AWS Bedrock 연결 테스트
- [ ] 로컬 파일 로드 → LLM 파이프라인 테스트

### Future Expansion
- Azure OpenAI 통합 (extension 슬롯 준비됨)
- GCP Vertex AI 통합
- 로컬 LLM (Ollama) 지원

## Known Issues

1. **노드 렌더링 문제**: executor 등록 순서가 잘못되면 노드가 원형 핸들만 표시됨
   - 해결: main.tsx에서 App import 전에 registerBuiltinExecutors() 호출

2. **localStorage 캐시**: 이전 버전의 워크플로우가 저장되어 있으면 렌더링 오류 발생 가능
   - 해결: 개발자 도구에서 localStorage 클리어

## Contact

이 프로젝트에 대한 질문은 Git 이슈 또는 대화를 통해 문의하세요.
