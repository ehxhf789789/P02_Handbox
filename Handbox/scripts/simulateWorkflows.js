/**
 * Standalone Workflow Simulation Script (Template-Based)
 *
 * ⚠️ 주의: 이 스크립트는 템플릿 기반 검증용입니다.
 *
 * 실제 LLM을 호출하는 시뮬레이션은 Handbox 앱 내에서 실행해야 합니다:
 * 1. Handbox 앱 실행
 * 2. 설정 → LLM 시뮬레이션 패널 열기
 * 3. AWS Bedrock 또는 로컬 LLM 연결 확인
 * 4. 시뮬레이션 시작
 *
 * 이 스크립트는 노드 연결 규칙 및 워크플로우 구조 검증만 수행합니다.
 * 실행: node scripts/simulateWorkflows.js [count]
 */

// ============================================================
// Node Connection Rules (registry/NodeConnectionRules.ts 복제)
// ============================================================

const NODE_PORT_REGISTRY = {
  'io.local-folder': {
    type: 'io.local-folder',
    label: '폴더 입력',
    category: 'io',
    inputs: [],
    outputs: [{ name: 'files', type: 'file-ref[]' }, { name: 'text', type: 'text' }],
    canConnectTo: ['convert.doc-parser', 'text.splitter', 'ai.llm-invoke', 'ai.embedding', 'data.preprocess', 'prompt.template', 'viz.result-viewer'],
    canReceiveFrom: [],
  },
  'io.local-file': {
    type: 'io.local-file',
    label: '파일 입력',
    category: 'io',
    inputs: [],
    outputs: [{ name: 'file', type: 'file-ref' }, { name: 'text', type: 'text' }],
    canConnectTo: ['convert.doc-parser', 'text.splitter', 'ai.llm-invoke', 'ai.embedding', 'data.preprocess', 'prompt.template', 'viz.result-viewer'],
    canReceiveFrom: [],
  },
  'convert.doc-parser': {
    type: 'convert.doc-parser',
    label: '문서 파싱',
    category: 'convert',
    inputs: [{ name: 'file', type: 'file-ref', required: true }],
    outputs: [{ name: 'text', type: 'text' }],
    canConnectTo: ['text.splitter', 'ai.llm-invoke', 'ai.embedding', 'prompt.template', 'prompt.cot', 'rag.context-builder', 'viz.result-viewer'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'data.file-loader'],
  },
  'text.splitter': {
    type: 'text.splitter',
    label: '텍스트 분할',
    category: 'text',
    inputs: [{ name: 'text', type: 'text', required: true }],
    outputs: [{ name: 'chunks', type: 'text[]' }, { name: 'text', type: 'text' }],
    canConnectTo: ['ai.llm-invoke', 'ai.embedding', 'rag.retriever', 'prompt.template', 'viz.result-viewer'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'convert.doc-parser', 'data.preprocess'],
  },
  'ai.llm-invoke': {
    type: 'ai.llm-invoke',
    label: 'LLM 호출',
    category: 'ai',
    inputs: [{ name: 'prompt', type: 'text', required: true }],
    outputs: [{ name: 'text', type: 'text' }, { name: 'response', type: 'json' }],
    canConnectTo: ['viz.result-viewer', 'viz.chart', 'viz.table', 'export.excel', 'ai.llm-invoke', 'control.conditional'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'convert.doc-parser', 'text.splitter', 'prompt.template', 'prompt.cot', 'rag.retriever'],
  },
  'ai.embedding': {
    type: 'ai.embedding',
    label: '임베딩 생성',
    category: 'ai',
    inputs: [{ name: 'text', type: 'text', required: true }],
    outputs: [{ name: 'embedding', type: 'embedding' }],
    canConnectTo: ['rag.retriever', 'storage.local'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'convert.doc-parser', 'text.splitter'],
  },
  'prompt.template': {
    type: 'prompt.template',
    label: '프롬프트 템플릿',
    category: 'prompt',
    inputs: [{ name: 'variables', type: 'any', required: false }],
    outputs: [{ name: 'prompt', type: 'text' }],
    canConnectTo: ['ai.llm-invoke', 'prompt.cot', 'agent.persona'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'convert.doc-parser', 'text.splitter', 'rag.retriever'],
  },
  'prompt.cot': {
    type: 'prompt.cot',
    label: 'Chain of Thought',
    category: 'prompt',
    inputs: [{ name: 'input', type: 'text', required: true }],
    outputs: [{ name: 'prompt', type: 'text' }],
    canConnectTo: ['ai.llm-invoke', 'agent.persona'],
    canReceiveFrom: ['convert.doc-parser', 'text.splitter', 'prompt.template'],
  },
  'rag.retriever': {
    type: 'rag.retriever',
    label: 'RAG 검색',
    category: 'rag',
    inputs: [{ name: 'query', type: 'text', required: true }],
    outputs: [{ name: 'context', type: 'text' }, { name: 'results', type: 'json[]' }],
    canConnectTo: ['ai.llm-invoke', 'prompt.template', 'viz.result-viewer'],
    canReceiveFrom: ['io.local-file', 'data.preprocess'],
  },
  'rag.context-builder': {
    type: 'rag.context-builder',
    label: '컨텍스트 빌더',
    category: 'rag',
    inputs: [{ name: 'documents', type: 'text[]', required: false }],
    outputs: [{ name: 'context', type: 'text' }],
    canConnectTo: ['ai.llm-invoke', 'prompt.template', 'prompt.cot'],
    canReceiveFrom: ['rag.retriever', 'text.splitter', 'convert.doc-parser'],
  },
  'control.merge': {
    type: 'control.merge',
    label: '병합',
    category: 'control',
    inputs: [{ name: 'inputs', type: 'any', required: true }],
    outputs: [{ name: 'merged', type: 'text' }],
    canConnectTo: ['ai.llm-invoke', 'viz.result-viewer', 'control.voting-aggregator'],
    canReceiveFrom: ['ai.llm-invoke', 'agent.persona', 'convert.doc-parser'],
  },
  'control.voting-aggregator': {
    type: 'control.voting-aggregator',
    label: '투표 집계',
    category: 'control',
    inputs: [{ name: 'votes', type: 'json[]', required: true }],
    outputs: [{ name: 'result', type: 'json' }, { name: 'summary', type: 'text' }],
    canConnectTo: ['viz.result-viewer', 'viz.chart', 'export.excel'],
    canReceiveFrom: ['ai.llm-invoke', 'agent.persona', 'control.merge'],
  },
  'agent.persona': {
    type: 'agent.persona',
    label: '페르소나 에이전트',
    category: 'agent',
    inputs: [{ name: 'input', type: 'text', required: true }],
    outputs: [{ name: 'response', type: 'text' }, { name: 'evaluation', type: 'json' }],
    canConnectTo: ['control.voting-aggregator', 'control.merge', 'viz.result-viewer'],
    canReceiveFrom: ['convert.doc-parser', 'prompt.template', 'prompt.cot', 'rag.context-builder'],
  },
  'viz.result-viewer': {
    type: 'viz.result-viewer',
    label: '결과 뷰어',
    category: 'viz',
    inputs: [{ name: 'data', type: 'any', required: true }],
    outputs: [],
    canConnectTo: [],
    canReceiveFrom: ['ai.llm-invoke', 'control.voting-aggregator', 'convert.doc-parser', 'text.splitter', 'rag.retriever'],
  },
  'viz.chart': {
    type: 'viz.chart',
    label: '차트 뷰어',
    category: 'viz',
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [],
    canConnectTo: [],
    canReceiveFrom: ['ai.llm-invoke', 'data.preprocess', 'control.voting-aggregator'],
  },
  'viz.table': {
    type: 'viz.table',
    label: '테이블 뷰어',
    category: 'viz',
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [],
    canConnectTo: [],
    canReceiveFrom: ['ai.llm-invoke', 'data.preprocess', 'io.local-folder'],
  },
  'export.excel': {
    type: 'export.excel',
    label: 'Excel 내보내기',
    category: 'export',
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [{ name: 'file', type: 'file-ref' }],
    canConnectTo: [],
    canReceiveFrom: ['ai.llm-invoke', 'control.voting-aggregator', 'data.preprocess'],
  },
  'data.file-loader': {
    type: 'data.file-loader',
    label: '데이터 로더',
    category: 'data',
    inputs: [],
    outputs: [{ name: 'data', type: 'json' }, { name: 'text', type: 'text' }],
    canConnectTo: ['convert.doc-parser', 'data.preprocess', 'ai.llm-invoke', 'viz.table'],
    canReceiveFrom: [],
  },
  'data.preprocess': {
    type: 'data.preprocess',
    label: '데이터 전처리',
    category: 'data',
    inputs: [{ name: 'input', type: 'any', required: true }],
    outputs: [{ name: 'output', type: 'any' }],
    canConnectTo: ['ai.llm-invoke', 'viz.result-viewer', 'viz.chart', 'viz.table', 'export.excel', 'text.splitter'],
    canReceiveFrom: ['io.local-folder', 'io.local-file', 'convert.doc-parser', 'ai.llm-invoke', 'data.file-loader'],
  },
}

// ============================================================
// Workflow Templates (nodeTemplates.ts 간소화 버전)
// ============================================================

const WORKFLOW_TEMPLATES = {
  general: {
    name: '범용 분석',
    description: '범용 텍스트 처리 및 분석',
    nodes: [
      { type: 'io.local-file', label: '파일 입력', description: '분석할 파일' },
      { type: 'convert.doc-parser', label: '문서 파싱', description: '문서 내용 추출' },
      { type: 'ai.llm-invoke', label: 'LLM 분석', description: 'AI 분석' },
      { type: 'viz.result-viewer', label: '결과 표시', description: '분석 결과' },
    ],
  },
  rag: {
    name: 'RAG 문서 검색',
    description: '문서 기반 질의응답',
    nodes: [
      { type: 'io.local-folder', label: '문서 폴더', description: '문서들 로드' },
      { type: 'convert.doc-parser', label: '문서 파싱', description: '텍스트 추출' },
      { type: 'text.splitter', label: '텍스트 분할', description: '청킹' },
      { type: 'ai.embedding', label: '임베딩 생성', description: '벡터화' },
      { type: 'rag.retriever', label: 'RAG 검색', description: '관련 문서 검색' },
      { type: 'ai.llm-invoke', label: 'LLM 답변', description: '답변 생성' },
      { type: 'viz.result-viewer', label: '결과 표시', description: '답변 표시' },
    ],
  },
  analysis: {
    name: '데이터 분석',
    description: '데이터 분석 및 시각화',
    nodes: [
      { type: 'io.local-file', label: '데이터 로드', description: '데이터 파일' },
      { type: 'data.preprocess', label: '전처리', description: '데이터 정리' },
      { type: 'ai.llm-invoke', label: 'AI 분석', description: '분석' },
      { type: 'viz.chart', label: '차트', description: '시각화' },
    ],
  },
  multi_agent: {
    name: '다중 에이전트 평가',
    description: '복수 전문가 평가',
    pattern: 'parallel_then_aggregate',
    nodes: [
      { type: 'io.local-file', label: '평가 대상', description: '평가 문서' },
      { type: 'agent.persona', label: '전문가 1', description: '분야 1 평가' },
      { type: 'agent.persona', label: '전문가 2', description: '분야 2 평가' },
      { type: 'agent.persona', label: '전문가 3', description: '분야 3 평가' },
      { type: 'control.voting-aggregator', label: '투표 집계', description: '결과 종합' },
      { type: 'viz.result-viewer', label: '최종 결과', description: '평가 결과' },
    ],
  },
}

// ============================================================
// Simple Workflow Generator (IntegratedWorkflowAgent 간소화)
// ============================================================

function analyzeIntent(message) {
  const lowerMessage = message.toLowerCase()
  let category = 'general'
  const keywords = []
  const suggestedTools = []
  const semanticHints = {
    isMultiFile: false,
    isLargeScale: false,
    needsParallel: false,
    outputFormat: null,
  }

  // 다중 파일 감지
  if (/(\d+)\s*(건|개|편|장).*?(논문|문서|파일|보고서)/.test(message) ||
      /(수십|수백|많은|다수|여러|모든|전체).*?(논문|문서|파일|보고서)/.test(message) ||
      /폴더|디렉토리|폴더\s*내/.test(lowerMessage)) {
    semanticHints.isMultiFile = true
    suggestedTools.push('io.local-folder')
  }

  // 대규모 감지
  if (/대량|대규모|수천|수만|많은|대용량/.test(lowerMessage)) {
    semanticHints.isLargeScale = true
    suggestedTools.push('text.splitter')
  }

  // 병렬 처리 감지
  if (/병렬|동시|각각|개별|각\s*전문가|위원/.test(lowerMessage)) {
    semanticHints.needsParallel = true
  }

  // 카테고리 분류
  if (/문서|검색|지식|rag|qa|질문.?답변/.test(lowerMessage)) {
    category = 'rag'
  } else if (/분석|통계|차트|그래프|데이터|시각화/.test(lowerMessage)) {
    category = 'analysis'
  } else if (/평가|위원|투표|다수결|전문가|패널|에이전트/.test(lowerMessage)) {
    category = 'multi_agent'
  }

  return { category, keywords, suggestedTools, semanticHints }
}

function generateWorkflowFromTemplate(intent, userRequest) {
  const template = WORKFLOW_TEMPLATES[intent.category] || WORKFLOW_TEMPLATES['general']

  const nodes = template.nodes.map((nodeDef, i) => {
    let nodeType = nodeDef.type

    // 다중 파일인 경우 io.local-file → io.local-folder
    if (intent.semanticHints.isMultiFile && nodeType === 'io.local-file') {
      nodeType = 'io.local-folder'
    }

    return {
      id: `node_${i + 1}`,
      type: nodeType,
      label: nodeDef.label,
      description: nodeDef.description,
      position: { x: 100 + (i % 3) * 280, y: 100 + Math.floor(i / 3) * 180 },
      reasoning: `${nodeDef.description}를 위해 사용됩니다.`,
    }
  })

  const edges = []
  if (template.pattern === 'parallel_then_aggregate' && nodes.length > 2) {
    const inputNode = nodes[0]
    const aggregatorNode = nodes[nodes.length - 2]
    const outputNode = nodes[nodes.length - 1]
    const agentNodes = nodes.slice(1, -2)

    agentNodes.forEach((agentNode, i) => {
      edges.push({ id: `edge_in_${i + 1}`, source: inputNode.id, target: agentNode.id })
    })
    agentNodes.forEach((agentNode, i) => {
      edges.push({ id: `edge_out_${i + 1}`, source: agentNode.id, target: aggregatorNode.id })
    })
    edges.push({ id: 'edge_final', source: aggregatorNode.id, target: outputNode.id })
  } else {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ id: `edge_${i + 1}`, source: nodes[i].id, target: nodes[i + 1].id })
    }
  }

  return {
    name: template.name,
    description: template.description,
    nodes,
    edges,
    summary: `"${userRequest}"에 대한 ${template.name}`,
    reasoning: `${intent.category} 카테고리의 요청으로 분석되어 ${template.name} 템플릿을 적용했습니다.`,
    suggestions: [],
  }
}

// ============================================================
// Validation Functions
// ============================================================

function canConnect(sourceType, targetType) {
  const sourceInfo = NODE_PORT_REGISTRY[sourceType]
  const targetInfo = NODE_PORT_REGISTRY[targetType]

  if (!sourceInfo) return { canConnect: false, reason: `미등록 소스 노드: ${sourceType}` }
  if (!targetInfo) return { canConnect: false, reason: `미등록 타겟 노드: ${targetType}` }

  if (sourceInfo.canConnectTo.includes(targetType)) {
    return { canConnect: true, reason: '연결 가능' }
  }
  if (targetInfo.canReceiveFrom.includes(sourceType)) {
    return { canConnect: true, reason: '연결 가능' }
  }

  return { canConnect: false, reason: `${sourceInfo.label} → ${targetInfo.label} 연결 불가` }
}

function validateWorkflow(workflow) {
  const errors = []

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('노드가 없습니다')
    return { valid: false, errors }
  }

  for (const node of workflow.nodes) {
    if (!node.type) {
      errors.push(`노드 ${node.id}에 타입 없음`)
    }
    if (!NODE_PORT_REGISTRY[node.type]) {
      errors.push(`미등록 노드 타입: ${node.type}`)
    }
  }

  const nodeIds = new Set(workflow.nodes.map(n => n.id))
  for (const edge of workflow.edges || []) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`엣지 소스 없음: ${edge.source}`)
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`엣지 타겟 없음: ${edge.target}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

function validateConnections(workflow) {
  const errors = []
  const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]))

  for (const edge of workflow.edges || []) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)
    if (!sourceNode || !targetNode) continue

    const result = canConnect(sourceNode.type, targetNode.type)
    if (!result.canConnect) {
      errors.push(`연결 불가: ${sourceNode.type} → ${targetNode.type}`)
    }
  }

  return errors
}

// ============================================================
// Prompt Generation
// ============================================================

const SIMPLE_PROMPTS = [
  "PDF 파일 읽어줘", "이 문서 분석해줘", "텍스트 요약해줘", "엑셀로 내보내기",
  "데이터 시각화 해줘", "파일 변환해줘", "이미지 분석해줘", "차트 그려줘",
  "통계 보여줘", "결과 저장해줘", "폴더 내 파일들 읽어", "문서 내용 추출",
]

const COMPLEX_TEMPLATES = [
  "{n}건의 {docType} 분석해서 {output} 만들어줘",
  "폴더에 있는 모든 {docType}를 분석하고 {output}으로 정리해",
  "이 문서들을 기반으로 {question}에 대해 답변해줘",
  "{n}명의 전문가가 {target}을 평가하는 워크플로우 만들어",
  "{domain1}, {domain2}, {domain3} 관점에서 {target} 분석해줘",
  "위원회 방식으로 {n}명이 {target} 평가하고 다수결로 결정",
  "{input}를 분석하고 {process} 후 {output}으로 변환",
  "PDF 읽고 → 요약하고 → 엑셀로 저장",
  "데이터 전처리 후 LLM으로 분석하고 차트로 시각화",
  "아 그냥 이거 분석해줘",
  "뭔가 보고서 비슷한 거 만들어줄 수 있어?",
  "여러 파일 한번에 처리하고 싶은데",
]

const VARIABLES = {
  n: [3, 5, 7, 10, 15, 20, 50],
  docType: ['논문', '보고서', '계약서', 'PDF', '문서'],
  output: ['보고서', '엑셀', '차트', '요약문'],
  question: ['핵심 내용이 뭐야', '결론은', '장단점은'],
  target: ['신기술', '프로젝트', '제안서', '논문'],
  domain1: ['기술', '구조', '재료'],
  domain2: ['경제성', '시공성', '품질'],
  domain3: ['안전', '환경', '법규'],
  input: ['PDF', '엑셀', '문서'],
  process: ['분석', '변환', '요약'],
}

function generatePrompt(index) {
  const isSimple = Math.random() < 0.2

  if (isSimple) {
    return { prompt: SIMPLE_PROMPTS[index % SIMPLE_PROMPTS.length], type: 'simple' }
  }

  let template = COMPLEX_TEMPLATES[index % COMPLEX_TEMPLATES.length]

  for (const [key, values] of Object.entries(VARIABLES)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g')
    const value = values[Math.floor(Math.random() * values.length)]
    template = template.replace(regex, String(value))
  }

  return { prompt: template, type: 'complex' }
}

// ============================================================
// Simulation
// ============================================================

function simulateOne(promptId) {
  const { prompt, type } = generatePrompt(promptId)

  const result = {
    promptId,
    prompt,
    promptType: type,
    workflowGenerated: false,
    validationPassed: false,
    validationErrors: [],
    connectionErrors: [],
    overallSuccess: false,
    failureReasons: [],
  }

  try {
    const intent = analyzeIntent(prompt)
    const workflow = generateWorkflowFromTemplate(intent, prompt)
    result.workflowGenerated = true
    result.workflow = workflow

    const validation = validateWorkflow(workflow)
    result.validationPassed = validation.valid
    result.validationErrors = validation.errors
    if (!validation.valid) {
      result.failureReasons.push(...validation.errors)
    }

    result.connectionErrors = validateConnections(workflow)
    if (result.connectionErrors.length > 0) {
      result.failureReasons.push(...result.connectionErrors)
    }

    result.overallSuccess =
      result.workflowGenerated &&
      result.validationPassed &&
      result.connectionErrors.length === 0

  } catch (error) {
    result.failureReasons.push(`생성 오류: ${error.message}`)
  }

  return result
}

async function runSimulation(count) {
  console.log('\n' + '='.repeat(60))
  console.log('워크플로우 시뮬레이션 테스트')
  console.log('='.repeat(60))
  console.log(`테스트 수: ${count}건`)
  console.log('시작 시간:', new Date().toLocaleString())
  console.log('='.repeat(60) + '\n')

  const results = []
  const startTime = Date.now()

  for (let i = 0; i < count; i++) {
    const result = simulateOne(i)
    results.push(result)

    if ((i + 1) % 1000 === 0) {
      const successRate = (results.filter(r => r.overallSuccess).length / results.length * 100).toFixed(2)
      console.log(`진행: ${i + 1}/${count} (성공률: ${successRate}%)`)
    }
  }

  const totalTime = Date.now() - startTime

  // 요약 생성
  const successes = results.filter(r => r.overallSuccess)
  const simpleResults = results.filter(r => r.promptType === 'simple')
  const complexResults = results.filter(r => r.promptType === 'complex')

  const errorsByType = {}
  const connectionIssueMap = new Map()

  for (const result of results) {
    for (const reason of result.failureReasons) {
      if (reason.includes('미등록')) {
        errorsByType['미등록 노드'] = (errorsByType['미등록 노드'] || 0) + 1
      } else if (reason.includes('연결 불가')) {
        errorsByType['연결 오류'] = (errorsByType['연결 오류'] || 0) + 1
        const match = reason.match(/연결 불가: (\S+) → (\S+)/)
        if (match) {
          const key = `${match[1]} → ${match[2]}`
          connectionIssueMap.set(key, (connectionIssueMap.get(key) || 0) + 1)
        }
      } else {
        errorsByType['기타'] = (errorsByType['기타'] || 0) + 1
      }
    }
  }

  // 결과 출력
  console.log('\n' + '='.repeat(60))
  console.log('시뮬레이션 결과')
  console.log('='.repeat(60))

  console.log(`\n### 전체 결과 ###`)
  console.log(`총 테스트: ${count}건`)
  console.log(`성공: ${successes.length}건`)
  console.log(`실패: ${count - successes.length}건`)
  console.log(`성공률: ${(successes.length / count * 100).toFixed(2)}%`)

  console.log(`\n### 프롬프트 유형별 ###`)
  console.log(`단순 프롬프트: ${simpleResults.length}건, 성공률: ${(simpleResults.filter(r => r.overallSuccess).length / simpleResults.length * 100).toFixed(2)}%`)
  console.log(`복잡 프롬프트: ${complexResults.length}건, 성공률: ${(complexResults.filter(r => r.overallSuccess).length / complexResults.length * 100).toFixed(2)}%`)

  console.log(`\n### 오류 유형별 ###`)
  for (const [type, count] of Object.entries(errorsByType)) {
    console.log(`  ${type}: ${count}건`)
  }

  if (connectionIssueMap.size > 0) {
    console.log(`\n### 연결 이슈 (상위 10개) ###`)
    const sorted = Array.from(connectionIssueMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
    sorted.forEach(([key, cnt], i) => {
      console.log(`  ${i + 1}. ${key}: ${cnt}건`)
    })
  }

  console.log(`\n### 성능 ###`)
  console.log(`총 소요 시간: ${(totalTime / 1000).toFixed(2)}초`)
  console.log(`평균 시간: ${(totalTime / count).toFixed(2)}ms/건`)

  // 실패 케이스 상세 (상위 10개)
  const failedCases = results.filter(r => !r.overallSuccess).slice(0, 10)
  if (failedCases.length > 0) {
    console.log(`\n### 실패 케이스 상세 (상위 10개) ###`)
    failedCases.forEach((fc, i) => {
      console.log(`\n${i + 1}. [${fc.promptType}] ${fc.prompt.slice(0, 50)}...`)
      fc.failureReasons.forEach(r => console.log(`   - ${r}`))
    })
  }

  console.log('\n' + '='.repeat(60))

  return {
    total: count,
    success: successes.length,
    successRate: (successes.length / count * 100).toFixed(2),
    timeMs: totalTime,
    errorsByType,
  }
}

// ============================================================
// Main
// ============================================================

const count = parseInt(process.argv[2]) || 1000
runSimulation(count).then(summary => {
  console.log('\n시뮬레이션 완료!')
  process.exit(summary.success === summary.total ? 0 : 1)
}).catch(err => {
  console.error('시뮬레이션 오류:', err)
  process.exit(1)
})
