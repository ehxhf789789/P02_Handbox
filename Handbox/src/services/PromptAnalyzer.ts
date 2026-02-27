/**
 * 프롬프트 분석 서비스
 *
 * 사용자 프롬프트의 모호성 감지, 의도 분리, 필수 정보 추출을 담당합니다.
 * 워크플로우 생성 품질 향상을 위한 핵심 전처리 모듈.
 */

import { ToolRegistry } from '../registry/ToolRegistry'
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// Legacy compatibility
import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'

// ============================================================
// 타입 정의
// ============================================================

export interface Intent {
  id: string
  action: string
  target?: string
  output?: string
  confidence: number
  keywords: string[]
}

export interface MissingInfo {
  type: 'file' | 'action' | 'output' | 'detail' | 'domain'
    | 'rag_config' | 'agent_persona' | 'evaluation_criteria' | 'xai_config'
  question: string
  suggestions?: string[]
  priority?: 'required' | 'recommended' | 'optional'
}

export interface PromptAnalysisResult {
  originalPrompt: string
  intents: Intent[]
  missingInfo: MissingInfo[]
  suggestedNodes: string[]
  complexity: 'simple' | 'moderate' | 'complex' | 'expert'
  confidence: number
  needsClarification: boolean
  clarificationQuestions: string[]
}

// ============================================================
// 핵심 키워드 사전
// ============================================================

const ACTION_KEYWORDS: Record<string, string[]> = {
  // IO
  'read': ['읽', '열', '로드', 'read', 'load', 'open', '가져', '불러'],
  'write': ['저장', '쓰', '내보', '출력', 'save', 'write', 'export'],
  'list': ['목록', '리스트', 'list', '파일들', '폴더'],
  'fetch': ['가져오', '요청', 'fetch', 'request', 'api', 'http'],

  // Transform
  'parse': ['파싱', '파스', '분석', 'parse', '추출'],
  'convert': ['변환', '바꿔', 'convert', 'transform', '전환'],
  'split': ['나눠', '분리', '분할', 'split', '청크'],
  'filter': ['필터', '걸러', '선택', 'filter', '조건'],
  'merge': ['합쳐', '병합', '통합', 'merge', 'combine'],

  // LLM
  'summarize': ['요약', '정리', '줄여', 'summarize', 'summary'],
  'translate': ['번역', '변환', 'translate', '영어로', '한국어로'],
  'analyze': ['분석', '해석', 'analyze', '인사이트', '이해'],
  'generate': ['생성', '만들', '작성', 'generate', 'create', 'write'],
  'chat': ['대화', '질문', '답변', 'chat', 'ask', 'answer'],
  'extract': ['추출', '뽑아', 'extract', '찾아'],

  // Vision
  'ocr': ['ocr', '텍스트추출', '글자', '인식', '스캔'],
  'image_analyze': ['이미지분석', '사진분석', '그림', '이미지'],
  'compare': ['비교', '차이', 'compare', '대조'],

  // ML
  'classify': ['분류', '카테고리', 'classify', '라벨', '태그'],
  'cluster': ['클러스터', '그룹', '군집', 'cluster', '유사'],
  'predict': ['예측', '추정', 'predict', '미래', '전망'],

  // Agent
  'agent': ['에이전트', '자동', '자율', 'agent', '스스로'],
  'plan': ['계획', '플랜', 'plan', '단계', '절차'],

  // RAG (Retrieval Augmented Generation)
  'rag': ['지식베이스', '문서검색', '벡터', '임베딩', 'RAG', '검색증강', '색인', '인덱싱', '시맨틱'],
  'embedding': ['임베딩', 'embed', '벡터화', '벡터DB', 'titan-embed', 'titan embed'],
  'kb': ['지식베이스', 'knowledge base', 'KB', 'opensearch', 'pinecone', 'chroma', 'faiss', '문서저장'],
  'retrieve': ['검색', '조회', '찾아', 'search', 'retrieve', 'query', '쿼리'],

  // 페르소나/다중 에이전트
  'persona': ['페르소나', '전문가', '역할', '관점', '캐릭터', '경험', '연차', '성향', '배경'],
  'multi_agent': ['다중에이전트', '복수평가', '위원회', '패널', '투표', '다수결', '합의', '토론', '심사위원', '평가단'],
  'evaluation': ['평가', '심사', '점수', '판정', '검토', '리뷰', '채점', '기준', '심의'],

  // XAI (설명 가능한 AI)
  'xai': ['설명', '근거', '이유', '판단근거', '인사이트', '해석', 'explain', 'reasoning', 'why', 'evidence'],

  // Export
  'export_doc': ['워드', 'word', 'docx', '문서', '보고서'],
  'export_ppt': ['ppt', 'pptx', '프레젠테이션', '슬라이드', '발표'],
  'export_pdf': ['pdf', '피디에프'],
  'export_excel': ['엑셀', 'excel', 'xlsx', '스프레드시트'],

  // Visualization
  'chart': ['차트', '그래프', 'chart', 'graph', '시각화'],
  'table': ['테이블', '표', 'table', '리스트'],
  'stats': ['통계', '수치', 'stats', '평균', '합계'],
}

const FILE_KEYWORDS = ['파일', '문서', 'pdf', 'excel', 'csv', 'json', 'txt', '이미지', '사진', 'word', 'ppt', 'hwp']
const OUTPUT_KEYWORDS = ['저장', '출력', '내보내', '보여', '표시', '생성', '만들']

// ============================================================
// 모호성 감지
// ============================================================

export function detectAmbiguity(prompt: string): MissingInfo[] {
  const missing: MissingInfo[] = []
  const lowerPrompt = prompt.toLowerCase()

  // 1. 파일/데이터 소스 체크
  const hasFileRef = FILE_KEYWORDS.some(kw => lowerPrompt.includes(kw)) ||
                     /[가-힣a-z0-9_.-]+\.(pdf|csv|json|txt|xlsx?|docx?|pptx?|hwp|png|jpg|jpeg)/i.test(prompt)

  if (!hasFileRef && !lowerPrompt.includes('입력') && !lowerPrompt.includes('데이터')) {
    // 모호한 대명사 체크
    if (/이거|그거|저거|이것|그것|저것/.test(prompt)) {
      missing.push({
        type: 'file',
        question: '무엇을 처리해야 하나요? (파일 경로, 데이터 유형 등)',
        suggestions: ['PDF 파일', 'Excel 파일', 'CSV 데이터', '이미지 파일', '텍스트']
      })
    }
  }

  // 2. 액션 명확성 체크
  const detectedActions = detectActions(prompt)
  if (detectedActions.length === 0) {
    missing.push({
      type: 'action',
      question: '어떤 처리를 원하시나요?',
      suggestions: ['요약', '분석', '변환', '분류', '추출', '비교']
    })
  }

  // 3. 출력 형식 체크 (분석/처리 요청인 경우)
  const needsOutput = ['분석', '처리', '작업', '해'].some(kw => lowerPrompt.includes(kw))
  const hasOutputSpec = OUTPUT_KEYWORDS.some(kw => lowerPrompt.includes(kw)) ||
                        ['차트', '테이블', '보고서', 'pdf', 'excel'].some(kw => lowerPrompt.includes(kw))

  if (needsOutput && !hasOutputSpec) {
    missing.push({
      type: 'output',
      question: '결과를 어떤 형식으로 원하시나요?',
      suggestions: ['텍스트로 보기', '차트로 시각화', '보고서 생성', 'Excel로 저장', 'PDF로 저장']
    })
  }

  // 4. 상세 정보 체크 (ML/분석 관련)
  if (lowerPrompt.includes('분류') && !lowerPrompt.includes('기준') && !lowerPrompt.includes('카테고리')) {
    missing.push({
      type: 'detail',
      question: '어떤 기준으로 분류해야 하나요?',
      suggestions: ['카테고리 목록 제공', '자동 분류', '감성 분석', '주제별 분류']
    })
  }

  if (lowerPrompt.includes('예측') && !lowerPrompt.includes('무엇') && !lowerPrompt.includes('타겟')) {
    missing.push({
      type: 'detail',
      question: '무엇을 예측해야 하나요?',
      suggestions: ['매출', '수요', '이탈률', '점수']
    })
  }

  return missing
}

// ============================================================
// 액션 감지
// ============================================================

function detectActions(prompt: string): string[] {
  const lowerPrompt = prompt.toLowerCase()
  const detected: string[] = []

  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some(kw => lowerPrompt.includes(kw))) {
      detected.push(action)
    }
  }

  return detected
}

// ============================================================
// 의도 분리
// ============================================================

const INTENT_SEPARATORS = [
  '하고', '그리고', '그런 다음', '다음에', '그 다음', '또', '또한', '뿐만 아니라',
  '이후', '후에', ',', '→', '->', '=>', '/'
]

export function splitIntents(prompt: string): Intent[] {
  const intents: Intent[] = []

  // 분리자로 나누기
  let segments = [prompt]
  for (const sep of INTENT_SEPARATORS) {
    segments = segments.flatMap(s => s.split(sep).map(p => p.trim()).filter(p => p.length > 0))
  }

  // 중복 제거 및 너무 짧은 세그먼트 제거
  segments = [...new Set(segments)].filter(s => s.length > 2)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const actions = detectActions(segment)

    // 키워드 추출
    const keywords: string[] = []
    for (const kw of FILE_KEYWORDS) {
      if (segment.toLowerCase().includes(kw)) keywords.push(kw)
    }
    for (const kw of OUTPUT_KEYWORDS) {
      if (segment.toLowerCase().includes(kw)) keywords.push(kw)
    }

    intents.push({
      id: `intent_${i + 1}`,
      action: actions[0] || 'process',
      target: extractTarget(segment),
      output: extractOutput(segment),
      confidence: actions.length > 0 ? 0.8 : 0.5,
      keywords
    })
  }

  return intents.length > 0 ? intents : [{
    id: 'intent_1',
    action: 'process',
    confidence: 0.3,
    keywords: []
  }]
}

function extractTarget(segment: string): string | undefined {
  // 파일/데이터 타입 추출
  for (const kw of FILE_KEYWORDS) {
    if (segment.toLowerCase().includes(kw)) return kw
  }
  return undefined
}

function extractOutput(segment: string): string | undefined {
  // 출력 형식 추출
  const outputPatterns = ['차트', '테이블', '보고서', 'pdf', 'excel', 'word', 'ppt', '텍스트', '시각화']
  for (const pattern of outputPatterns) {
    if (segment.toLowerCase().includes(pattern)) return pattern
  }
  return undefined
}

// ============================================================
// 노드 추천
// ============================================================

const ACTION_TO_NODES: Record<string, string[]> = {
  'read': ['io.file-read', 'doc.parse'],
  'write': ['io.file-write'],
  'list': ['io.file-list'],
  'fetch': ['io.http-request'],
  'parse': ['transform.json-parse', 'transform.csv-parse', 'transform.xml-parse'],
  'convert': ['transform.json-stringify', 'transform.csv-stringify', 'doc.convert'],
  'split': ['transform.text-split'],
  'filter': ['transform.json-query', 'control.if'],
  'merge': ['control.merge'],
  'summarize': ['llm.chat'],
  'translate': ['llm.chat'],
  'analyze': ['llm.chat', 'llm.structured', 'viz.stats'],
  'generate': ['llm.chat', 'llm.structured'],
  'chat': ['llm.chat'],
  'extract': ['llm.structured', 'vision.extract'],
  'ocr': ['vision.ocr-advanced'],
  'image_analyze': ['vision.analyze'],
  'compare': ['vision.compare'],
  'classify': ['ml.classify', 'llm.structured'],
  'cluster': ['ml.cluster'],
  'predict': ['ml.regression'],
  'agent': ['agent.react', 'agent.tool-use', 'agent.custom'],
  'plan': ['agent.planner'],

  // RAG 관련 노드
  'rag': ['rag.retriever', 'rag.context-builder', 'ai.embedding'],
  'embedding': ['ai.embedding'],
  'kb': ['storage.vector-store', 'storage.vector-search'],
  'retrieve': ['rag.retriever', 'storage.vector-search'],

  // 페르소나/다중 에이전트 관련 노드
  'persona': ['agent.custom'],
  'multi_agent': ['agent.custom', 'control.voting-aggregator', 'control.merge'],
  'evaluation': ['agent.custom', 'control.voting-aggregator'],

  // XAI 관련 (커스텀 에이전트가 XAI 기능 포함)
  'xai': ['agent.custom'],
  'export_doc': ['export.docx'],
  'export_ppt': ['export.pptx'],
  'export_pdf': ['export.pdf'],
  'export_excel': ['export.xlsx'],
  'chart': ['viz.chart'],
  'table': ['viz.table'],
  'stats': ['viz.stats'],
}

export function suggestNodes(intents: Intent[]): string[] {
  const suggested = new Set<string>()

  for (const intent of intents) {
    const nodes = ACTION_TO_NODES[intent.action] || []
    nodes.forEach(n => suggested.add(n))

    // 출력 형식에 따른 추가 노드
    if (intent.output) {
      const outputNodes = ACTION_TO_NODES[`export_${intent.output}`] ||
                         ACTION_TO_NODES[intent.output] || []
      outputNodes.forEach(n => suggested.add(n))
    }
  }

  // 기본 출력 노드 추가 (시각화가 없으면)
  if (!suggested.has('viz.chart') && !suggested.has('viz.table') && !suggested.has('viz.text')) {
    suggested.add('viz.text')
  }

  return Array.from(suggested)
}

// ============================================================
// 복잡도 계산
// ============================================================

export function calculateComplexity(intents: Intent[], suggestedNodes: string[]): 'simple' | 'moderate' | 'complex' | 'expert' {
  const intentCount = intents.length
  const nodeCount = suggestedNodes.length

  // 에이전트나 ML 노드가 있으면 복잡도 상승
  const hasAdvancedNodes = suggestedNodes.some(n =>
    n.startsWith('agent.') || n.startsWith('ml.') || n.startsWith('vlm.')
  )

  if (intentCount >= 5 || nodeCount >= 10 || hasAdvancedNodes) {
    return 'expert'
  }
  if (intentCount >= 3 || nodeCount >= 6) {
    return 'complex'
  }
  if (intentCount >= 2 || nodeCount >= 4) {
    return 'moderate'
  }
  return 'simple'
}

// ============================================================
// 명확화 질문 생성
// ============================================================

export function generateClarificationQuestions(missingInfo: MissingInfo[]): string[] {
  return missingInfo.map(info => {
    if (info.suggestions && info.suggestions.length > 0) {
      return `${info.question}\n  예: ${info.suggestions.slice(0, 3).join(', ')}`
    }
    return info.question
  })
}

// ============================================================
// 메인 분석 함수
// ============================================================

export function analyzePrompt(prompt: string): PromptAnalysisResult {
  const intents = splitIntents(prompt)
  const missingInfo = detectAmbiguity(prompt)
  const suggestedNodes = suggestNodes(intents)
  const complexity = calculateComplexity(intents, suggestedNodes)
  const clarificationQuestions = generateClarificationQuestions(missingInfo)

  // 신뢰도 계산
  const avgIntentConfidence = intents.reduce((sum, i) => sum + i.confidence, 0) / intents.length
  const missingPenalty = missingInfo.length * 0.1
  const confidence = Math.max(0, Math.min(1, avgIntentConfidence - missingPenalty))

  return {
    originalPrompt: prompt,
    intents,
    missingInfo,
    suggestedNodes,
    complexity,
    confidence,
    needsClarification: missingInfo.length > 0 && confidence < 0.6,
    clarificationQuestions
  }
}

// ============================================================
// 프롬프트 강화 (명확화된 정보 반영)
// ============================================================

export function enhancePrompt(
  originalPrompt: string,
  clarifications: Record<string, string>
): string {
  let enhanced = originalPrompt

  // 파일 정보 추가
  if (clarifications.file) {
    enhanced = `${clarifications.file}를 ${enhanced}`
  }

  // 액션 명확화
  if (clarifications.action) {
    enhanced = `${enhanced} (처리 방식: ${clarifications.action})`
  }

  // 출력 형식 추가
  if (clarifications.output) {
    enhanced = `${enhanced} → ${clarifications.output}로 출력`
  }

  // 상세 정보 추가
  if (clarifications.detail) {
    enhanced = `${enhanced} [${clarifications.detail}]`
  }

  return enhanced
}

// ============================================================
// RAG 관련 상세 질문 생성
// ============================================================

const RAG_KEYWORDS = ['rag', '지식베이스', '문서검색', '벡터', '임베딩', '검색증강', '색인', 'kb', 'knowledge']
const EMBEDDING_KEYWORDS = ['임베딩', 'embed', '벡터화', 'titan', 'openai']
const CHUNKING_KEYWORDS = ['청킹', 'chunking', '분할', '나눠', 'split']

export function generateRAGClarificationQuestions(prompt: string): MissingInfo[] {
  const questions: MissingInfo[] = []
  const lowerPrompt = prompt.toLowerCase()

  const hasRAGIntent = RAG_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  if (!hasRAGIntent) return questions

  // 1. 데이터 소스 확인
  const hasDataSource = ['경로', 'path', '폴더', 'folder', 's3', 'api', 'url', '파일'].some(
    kw => lowerPrompt.includes(kw)
  )
  if (!hasDataSource) {
    questions.push({
      type: 'rag_config',
      question: '문서 데이터는 어디에 있나요?',
      suggestions: ['로컬 폴더 경로 지정', 'S3 버킷', 'API 엔드포인트', '직접 업로드', 'OpenSearch 인덱스'],
      priority: 'required'
    })
  }

  // 2. 임베딩 모델 확인
  const hasEmbeddingSpec = EMBEDDING_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  if (!hasEmbeddingSpec) {
    questions.push({
      type: 'rag_config',
      question: '어떤 임베딩 모델을 사용할까요?',
      suggestions: ['Amazon Titan Embed V2 (다국어, 권장)', 'Cohere Embed Multilingual', '기본값 사용'],
      priority: 'recommended'
    })
  }

  // 3. 청킹 전략 확인
  const hasChunkingSpec = CHUNKING_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  if (!hasChunkingSpec && (lowerPrompt.includes('문서') || lowerPrompt.includes('pdf'))) {
    questions.push({
      type: 'rag_config',
      question: '문서 분할(청킹) 전략은 어떻게 할까요?',
      suggestions: ['고정 크기 (1000자)', '의미 단위 분할', '단락별 분할', '자동 (기본값)'],
      priority: 'optional'
    })
  }

  // 4. 검색 방식 확인
  if (lowerPrompt.includes('검색') || lowerPrompt.includes('search')) {
    questions.push({
      type: 'rag_config',
      question: '검색 방식은 어떻게 할까요?',
      suggestions: ['벡터 유사도 검색 (의미 기반)', '키워드 검색', '하이브리드 (벡터+키워드)'],
      priority: 'recommended'
    })
  }

  return questions
}

// ============================================================
// 에이전트/페르소나 관련 상세 질문 생성
// ============================================================

const AGENT_KEYWORDS = ['에이전트', 'agent', '전문가', '페르소나', '위원회', '패널', '평가단']
const MULTI_AGENT_KEYWORDS = ['다수', '복수', '여러', '위원회', '패널', '투표', '다수결', '명']
const EVALUATION_KEYWORDS = ['평가', '심사', '심의', '판정', '검토', '점수', '채점']

export function generateAgentClarificationQuestions(prompt: string): MissingInfo[] {
  const questions: MissingInfo[] = []
  const lowerPrompt = prompt.toLowerCase()

  const hasAgentIntent = AGENT_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  if (!hasAgentIntent) return questions

  // 1. 페르소나/역할 정의
  const hasPersonaSpec = ['구조', '시공', '재료', '경제', '특허', '안전', '환경', '지반', '정책'].some(
    kw => lowerPrompt.includes(kw)
  )
  if (!hasPersonaSpec) {
    questions.push({
      type: 'agent_persona',
      question: '에이전트의 전문 분야(페르소나)는 무엇인가요?',
      suggestions: [
        '구조공학 전문가', '시공관리 전문가', '재료공학 전문가',
        '경제성 분석가', '특허 전문가', '안전 전문가', '직접 정의'
      ],
      priority: 'required'
    })
  }

  // 2. 다중 에이전트 수
  const hasMultiAgent = MULTI_AGENT_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  const hasCount = /\d+\s*(명|인|개)/.test(prompt)
  if (hasMultiAgent && !hasCount) {
    questions.push({
      type: 'agent_persona',
      question: '몇 명의 전문가가 참여하나요?',
      suggestions: ['3명 (소규모 패널)', '5명 (균형 잡힌 평가)', '10명 (정밀 평가)', '직접 지정'],
      priority: 'required'
    })
  }

  // 3. 평가 기준
  const hasEvaluation = EVALUATION_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  if (hasEvaluation) {
    const hasCriteria = ['기준', '항목', '점수', '척도'].some(kw => lowerPrompt.includes(kw))
    if (!hasCriteria) {
      questions.push({
        type: 'evaluation_criteria',
        question: '평가 기준(항목)은 무엇인가요?',
        suggestions: [
          '기술성/실용성/경제성/안전성',
          '신규성/진보성 (특허 기준)',
          '1-5점 척도',
          '통과/불합격',
          '직접 정의'
        ],
        priority: 'required'
      })
    }
  }

  // 4. 투표/합의 방식
  if (hasMultiAgent && hasEvaluation) {
    const hasVotingSpec = ['다수결', '만장일치', '가중', '합의'].some(kw => lowerPrompt.includes(kw))
    if (!hasVotingSpec) {
      questions.push({
        type: 'evaluation_criteria',
        question: '최종 결정 방식은 어떻게 하나요?',
        suggestions: ['단순 다수결', '2/3 다수결', '가중 투표 (경력 반영)', '만장일치', '점수 평균'],
        priority: 'recommended'
      })
    }
  }

  // 5. 경력/경험 레벨
  if (hasAgentIntent) {
    const hasExperienceSpec = ['경력', '연차', '레벨', '수준', '시니어', '주니어'].some(
      kw => lowerPrompt.includes(kw)
    )
    if (!hasExperienceSpec && hasMultiAgent) {
      questions.push({
        type: 'agent_persona',
        question: '전문가들의 경력 수준은 어떻게 구성할까요?',
        suggestions: ['다양한 경력 혼합 (권장)', '모두 시니어급', '모두 전문가급', '직접 지정'],
        priority: 'optional'
      })
    }
  }

  return questions
}

// ============================================================
// XAI (설명 가능한 AI) 관련 상세 질문 생성
// ============================================================

const XAI_KEYWORDS = ['설명', '근거', '이유', '판단근거', '인사이트', '해석', 'explain', 'why', 'evidence']

export function generateXAIClarificationQuestions(prompt: string): MissingInfo[] {
  const questions: MissingInfo[] = []
  const lowerPrompt = prompt.toLowerCase()

  const hasXAIIntent = XAI_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  const hasEvaluation = EVALUATION_KEYWORDS.some(kw => lowerPrompt.includes(kw))

  // 평가가 있으면 XAI 관련 질문 추가 (기본적으로 설명이 필요)
  if (hasEvaluation || hasXAIIntent) {
    const hasDetailSpec = ['상세', '자세', '간략', '요약'].some(kw => lowerPrompt.includes(kw))
    if (!hasDetailSpec) {
      questions.push({
        type: 'xai_config',
        question: '판단 근거의 상세도는 어느 정도로 할까요?',
        suggestions: ['간략 (핵심만)', '표준 (주요 근거)', '상세 (전체 분석)', '종합 (반대 의견 포함)'],
        priority: 'recommended'
      })
    }
  }

  // 인사이트 생성 여부
  if (hasEvaluation) {
    questions.push({
      type: 'xai_config',
      question: '핵심 인사이트를 생성할까요?',
      suggestions: ['예 (3-5개 인사이트 생성)', '아니오 (결론만)', '상세 (강점/약점/개선점 분석)'],
      priority: 'optional'
    })
  }

  return questions
}

// ============================================================
// 통합 상세 질문 생성
// ============================================================

export function generateDetailedClarificationQuestions(prompt: string): MissingInfo[] {
  const questions: MissingInfo[] = []

  // 기본 모호성 감지
  questions.push(...detectAmbiguity(prompt))

  // RAG 관련 질문
  questions.push(...generateRAGClarificationQuestions(prompt))

  // 에이전트/페르소나 관련 질문
  questions.push(...generateAgentClarificationQuestions(prompt))

  // XAI 관련 질문
  questions.push(...generateXAIClarificationQuestions(prompt))

  // 중복 제거 및 우선순위 정렬
  const uniqueQuestions = questions.filter((q, i, arr) =>
    arr.findIndex(x => x.question === q.question) === i
  )

  // required > recommended > optional 순으로 정렬
  const priorityOrder = { required: 0, recommended: 1, optional: 2 }
  uniqueQuestions.sort((a, b) => {
    const pa = priorityOrder[a.priority || 'optional']
    const pb = priorityOrder[b.priority || 'optional']
    return pa - pb
  })

  return uniqueQuestions
}

// ============================================================
// 고급 분석 함수 (확장된 분석)
// ============================================================

export interface AdvancedPromptAnalysisResult extends PromptAnalysisResult {
  /** RAG 관련 의도 감지 */
  hasRAGIntent: boolean
  /** 다중 에이전트 의도 감지 */
  hasMultiAgentIntent: boolean
  /** 평가/심사 의도 감지 */
  hasEvaluationIntent: boolean
  /** XAI 필요 여부 */
  needsXAI: boolean
  /** 상세 질문 (우선순위 포함) */
  detailedQuestions: MissingInfo[]
}

export function analyzePromptAdvanced(prompt: string): AdvancedPromptAnalysisResult {
  const basicResult = analyzePrompt(prompt)
  const lowerPrompt = prompt.toLowerCase()

  const hasRAGIntent = RAG_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  const hasMultiAgentIntent = MULTI_AGENT_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  const hasEvaluationIntent = EVALUATION_KEYWORDS.some(kw => lowerPrompt.includes(kw))
  const needsXAI = hasEvaluationIntent || XAI_KEYWORDS.some(kw => lowerPrompt.includes(kw))

  const detailedQuestions = generateDetailedClarificationQuestions(prompt)

  // 복잡도 재계산 (RAG, 다중 에이전트 고려)
  let complexity = basicResult.complexity
  if (hasRAGIntent && hasMultiAgentIntent) {
    complexity = 'expert'
  } else if (hasRAGIntent || hasMultiAgentIntent) {
    complexity = complexity === 'simple' ? 'moderate' : complexity === 'moderate' ? 'complex' : complexity
  }

  // 명확화 필요 여부 재계산
  const requiredQuestions = detailedQuestions.filter(q => q.priority === 'required')
  const needsClarification = requiredQuestions.length > 0

  return {
    ...basicResult,
    complexity,
    needsClarification,
    clarificationQuestions: detailedQuestions.map(q => q.question),
    hasRAGIntent,
    hasMultiAgentIntent,
    hasEvaluationIntent,
    needsXAI,
    detailedQuestions,
  }
}
