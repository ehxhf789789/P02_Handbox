# Handbox MCP 고도화 전략

## 현재 상태 vs 목표

### 현재 (Basic MCP)
- 16개 기본 도구 (workflow, persona, kb, storage, llm)
- 단순 요청-응답 패턴
- 상태 비저장 (stateless)

### 목표 (Claude Code 수준)
- **자율 에이전트 시스템**
- **프롬프트 엔지니어링 에이전트**
- **학습/기억 관리 에이전트**
- **MCP 서버 간 통신**

---

## Phase 1: 내부 에이전트 시스템

### 1.1 PromptEngineerAgent
프롬프트를 자동 최적화하는 내부 에이전트

```typescript
// src/agents/PromptEngineerAgent.ts
interface PromptEngineerAgent {
  // 프롬프트 분석 및 개선
  analyzePrompt(userPrompt: string): PromptAnalysis
  enhancePrompt(prompt: string, context: WorkflowContext): string

  // 프롬프트 템플릿 생성
  generateTemplate(task: string, domain: string): PromptTemplate

  // Few-shot 예시 자동 생성
  generateExamples(task: string, count: number): Example[]

  // Chain-of-Thought 자동 분해
  decomposeToSteps(complexTask: string): Step[]
}
```

### 1.2 MemoryAgent
학습 및 기억을 관리하는 에이전트

```typescript
// src/agents/MemoryAgent.ts
interface MemoryAgent {
  // 단기 기억 (세션 내)
  shortTermMemory: Map<string, any>

  // 장기 기억 (SQLite 기반)
  longTermMemory: {
    store(key: string, value: any, metadata: Metadata): void
    recall(query: string, limit: number): Memory[]
    forget(key: string): void
  }

  // 워크플로우 학습
  learnFromExecution(workflow: Workflow, result: ExecutionResult): void

  // 패턴 인식
  recognizePattern(input: any): Pattern[]

  // 컨텍스트 유지
  maintainContext(conversationId: string): Context
}
```

### 1.3 OrchestratorAgent
다른 에이전트들을 조율하는 메타 에이전트

```typescript
// src/agents/OrchestratorAgent.ts
interface OrchestratorAgent {
  // 작업 분해 및 할당
  decomposeTask(task: string): SubTask[]
  assignToAgent(subTask: SubTask): AgentId

  // 실행 모니터링
  monitorExecution(taskId: string): ExecutionStatus

  // 오류 복구
  handleError(error: Error, context: Context): Recovery

  // 결과 집계
  aggregateResults(results: Result[]): FinalResult
}
```

---

## Phase 2: 고급 MCP 도구

### 2.1 에이전트 관련 MCP 도구
```typescript
// 새로운 MCP 도구 추가
const AGENT_MCP_TOOLS = [
  {
    name: 'handbox_agent_prompt_engineer',
    description: '프롬프트를 분석하고 최적화합니다',
    inputSchema: {
      prompt: { type: 'string' },
      optimization_goal: { type: 'string', enum: ['clarity', 'specificity', 'creativity', 'accuracy'] },
      domain: { type: 'string' }
    }
  },
  {
    name: 'handbox_agent_memory_store',
    description: '정보를 장기 기억에 저장합니다',
    inputSchema: {
      key: { type: 'string' },
      value: { type: 'any' },
      category: { type: 'string' },
      importance: { type: 'number' }
    }
  },
  {
    name: 'handbox_agent_memory_recall',
    description: '관련 기억을 검색합니다',
    inputSchema: {
      query: { type: 'string' },
      category: { type: 'string' },
      time_range: { type: 'string' }
    }
  },
  {
    name: 'handbox_agent_learn',
    description: '실행 결과로부터 학습합니다',
    inputSchema: {
      execution_id: { type: 'string' },
      feedback: { type: 'string' },
      success_indicators: { type: 'array' }
    }
  }
]
```

### 2.2 자율 실행 도구
```typescript
const AUTONOMOUS_MCP_TOOLS = [
  {
    name: 'handbox_auto_workflow_create',
    description: '자연어 설명으로 워크플로우를 자동 생성합니다',
    inputSchema: {
      description: { type: 'string' },
      constraints: { type: 'array' },
      examples: { type: 'array' }
    }
  },
  {
    name: 'handbox_auto_workflow_debug',
    description: '워크플로우 오류를 자동 진단하고 수정합니다',
    inputSchema: {
      workflow_id: { type: 'string' },
      error_log: { type: 'string' }
    }
  },
  {
    name: 'handbox_auto_optimize',
    description: '워크플로우 성능을 자동 최적화합니다',
    inputSchema: {
      workflow_id: { type: 'string' },
      optimization_target: { type: 'string', enum: ['speed', 'cost', 'quality'] }
    }
  }
]
```

---

## Phase 3: 노드 원자화 확장

### 현재 34개 → 목표 100+ 노드

#### 3.1 Data 카테고리 확장
```
현재: data.file-loader, data.preprocess
추가:
- data.csv-reader
- data.json-reader
- data.xml-reader
- data.parquet-reader
- data.database-reader
- data.api-fetcher
- data.web-scraper
- data.stream-reader
- data.validator
- data.transformer
- data.aggregator
- data.filter
- data.sorter
- data.joiner
- data.deduplicator
```

#### 3.2 AI 카테고리 확장
```
현재: ai.llm-invoke, ai.embedding
추가:
- ai.claude-chat
- ai.gpt-chat
- ai.gemini-chat
- ai.local-llm (ollama)
- ai.vision-analyze
- ai.audio-transcribe
- ai.image-generate
- ai.embedding-openai
- ai.embedding-cohere
- ai.embedding-local
- ai.classifier
- ai.sentiment-analyzer
- ai.entity-extractor
- ai.summarizer
- ai.translator
```

#### 3.3 Agent 카테고리 확장
```
현재: agent.persona
추가:
- agent.researcher
- agent.writer
- agent.reviewer
- agent.coder
- agent.planner
- agent.executor
- agent.validator
- agent.coordinator
- agent.memory-keeper
- agent.tool-user
```

#### 3.4 Control 카테고리 확장
```
현재: control.merge, control.conditional, control.cli, control.script, control.sub-workflow, control.voting-aggregator
추가:
- control.loop
- control.parallel
- control.retry
- control.timeout
- control.rate-limiter
- control.circuit-breaker
- control.scheduler
- control.event-trigger
- control.state-machine
- control.checkpoint
```

---

## Phase 4: MCP 서버 아키텍처

### 4.1 로컬 MCP 서버 구조
```
┌─────────────────────────────────────────────────────────┐
│                    Handbox MCP Server                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Prompt    │  │   Memory    │  │ Orchestrator│     │
│  │  Engineer   │  │   Agent     │  │   Agent     │     │
│  │   Agent     │  │             │  │             │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│  ┌──────▼────────────────▼────────────────▼──────┐     │
│  │              Agent Communication Bus           │     │
│  └──────────────────────┬────────────────────────┘     │
│                         │                               │
│  ┌──────────────────────▼────────────────────────┐     │
│  │                  MCP Tool Layer                │     │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│     │
│  │  │ WF   │ │Persona│ │  KB  │ │Store │ │ LLM  ││     │
│  │  │Tools │ │Tools │ │Tools │ │Tools │ │Tools ││     │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘│     │
│  └──────────────────────────────────────────────┘     │
│                         │                               │
│  ┌──────────────────────▼────────────────────────┐     │
│  │              Tauri Backend (Rust)              │     │
│  │  SQLite │ Vector Store │ File System │ APIs   │     │
│  └──────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### 4.2 외부 MCP 서버 연동
```typescript
// 외부 MCP 서버 (Claude Code, Claude Web 등)와 연동
interface ExternalMCPConnection {
  // MCP 서버 연결
  connect(serverUrl: string): Promise<MCPConnection>

  // 도구 목록 조회
  listTools(): Promise<MCPTool[]>

  // 도구 호출
  callTool(name: string, args: any): Promise<MCPResult>

  // 스트리밍 지원
  streamTool(name: string, args: any): AsyncIterable<MCPChunk>
}
```

---

## 구현 우선순위

### P0 (즉시)
1. MemoryAgent 기본 구현 (SQLite 기반)
2. PromptEngineerAgent 기본 구현
3. 노드 10개 추가 (data, ai, control 각 카테고리)

### P1 (1주일)
1. OrchestratorAgent 구현
2. 에이전트 MCP 도구 추가
3. 노드 20개 추가

### P2 (2주일)
1. 자율 워크플로우 생성 기능
2. 외부 MCP 서버 연동
3. 노드 30개 추가 (총 100개 달성)

### P3 (1개월)
1. 학습 시스템 고도화
2. 멀티 에이전트 협업
3. 실시간 모니터링 대시보드

---

## 파일 구조

```
src/
├── agents/
│   ├── PromptEngineerAgent.ts
│   ├── MemoryAgent.ts
│   ├── OrchestratorAgent.ts
│   └── index.ts
├── mcp/
│   ├── HandboxMCPServer.ts      (기존)
│   ├── HandboxMCPTools.ts       (기존)
│   ├── AgentMCPTools.ts         (신규)
│   ├── AutonomousMCPTools.ts    (신규)
│   └── ExternalMCPClient.ts     (신규)
├── executors/
│   ├── data/                    (확장)
│   ├── ai/                      (확장)
│   ├── agent/                   (확장)
│   └── control/                 (확장)
└── stores/
    └── memoryStore.ts           (신규)
```
