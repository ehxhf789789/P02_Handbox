/**
 * 프롬프트 분석 서비스
 *
 * 사용자 프롬프트의 모호성 감지, 의도 분리, 필수 정보 추출을 담당합니다.
 * 워크플로우 생성 품질 향상을 위한 핵심 전처리 모듈.
 */

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
  question: string
  suggestions?: string[]
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
  'agent': ['agent.react', 'agent.tool-use'],
  'plan': ['agent.planner'],
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
