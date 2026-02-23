/**
 * Workflow Orchestrator Agent
 *
 * LLM을 통해 자연어에서 워크플로우를 생성하는 에이전트.
 * - 대화 기록을 유지하며 멀티턴 대화 지원
 * - 워크플로우 JSON 추출 및 검증
 * - 학습 시스템 통합: 성공 패턴 학습 및 프롬프트 개선
 */

import { invoke } from '@tauri-apps/api/tauri'
import { generateSystemPrompt, formatConversationHistory } from '../utils/nodeDescriptionGenerator'
import type { WorkflowFile, SerializedNode, SerializedEdge } from '../types/WorkflowFile'
import type { ChatMessage, WorkflowGenerationResult } from '../types/ChatTypes'
import { NodeRegistry } from '../registry/NodeRegistry'
import {
  enhanceSystemPrompt,
  generateFewShotExamples,
  recordWorkflowFeedback,
  getLearningStats,
} from './WorkflowLearningService'
import { getAvailableProviders } from '../components/ConfigSchemaRenderer'
import {
  analyzePrompt,
  enhancePrompt,
  type PromptAnalysisResult,
} from './PromptAnalyzer'
import {
  validateWorkflow,
  generateValidationSummary,
  type WorkflowNode,
  type WorkflowEdge,
} from './WorkflowValidator'
import {
  ReinforcementLearningSystem,
  RLDatabase,
  type LearningPattern,
  type ImprovementProposal,
  type RLSystemState,
} from './ReinforcementLearningSystem'

// ============================================================
// 강화학습 기반 자동 프롬프트 개선 시스템
// ============================================================

/**
 * RL 시스템에서 학습된 성공 패턴을 Few-shot 예시로 변환
 */
async function generateRLFewShotExamples(): Promise<string> {
  try {
    const patterns = await RLDatabase.getPatterns('success')
    if (patterns.length === 0) return ''

    const topPatterns = patterns.slice(0, 5)

    let examples = '\n\n## 🎯 검증된 성공 패턴 (강화학습 결과)\n\n'
    examples += '다음 패턴들은 실제 시뮬레이션에서 높은 성공률을 보인 검증된 워크플로우입니다.\n\n'

    for (const pattern of topPatterns) {
      examples += `### 패턴: ${pattern.pattern}\n`
      examples += `- 성공 횟수: ${pattern.frequency}회\n`
      examples += `- 신뢰도: ${(pattern.confidence * 100).toFixed(0)}%\n`
      examples += `- 추천 사용: ${pattern.suggestedAction}\n\n`
    }

    return examples
  } catch (e) {
    console.warn('[RL Few-shot] 생성 실패:', e)
    return ''
  }
}

/**
 * RL 시스템에서 학습된 실패 패턴을 경고로 변환
 */
async function generateRLFailureWarnings(): Promise<string> {
  try {
    const patterns = await RLDatabase.getPatterns('failure')
    if (patterns.length === 0) return ''

    const topFailures = patterns.slice(0, 10)

    let warnings = '\n\n## ⚠️ 피해야 할 패턴 (강화학습 경고)\n\n'
    warnings += '다음 패턴들은 실제 시뮬레이션에서 반복적으로 실패한 패턴입니다. **절대 사용하지 마세요.**\n\n'

    for (const pattern of topFailures) {
      warnings += `- ❌ ${pattern.pattern} (${pattern.frequency}회 실패)\n`
      if (pattern.suggestedAction) {
        warnings += `  - 해결책: ${pattern.suggestedAction}\n`
      }
    }

    return warnings
  } catch (e) {
    console.warn('[RL Warnings] 생성 실패:', e)
    return ''
  }
}

/**
 * RL 시스템에서 대기 중인 개선안을 시스템 프롬프트에 적용
 */
async function applyRLImprovementProposals(): Promise<string> {
  try {
    const proposals = await ReinforcementLearningSystem.getPendingProposals()
    if (proposals.length === 0) return ''

    let additions = '\n\n## 🔧 자동 개선사항 (강화학습 제안)\n\n'

    for (const proposal of proposals.slice(0, 5)) {
      if (proposal.area === 'system_prompt' && proposal.proposedChange) {
        additions += `### ${proposal.rationale}\n`
        additions += `${proposal.proposedChange}\n\n`

        // 적용됨 상태로 업데이트
        await ReinforcementLearningSystem.applyProposal(proposal.id)
      }
    }

    return additions
  } catch (e) {
    console.warn('[RL Proposals] 적용 실패:', e)
    return ''
  }
}

/**
 * RL 시스템의 현재 성능 지표를 시스템 프롬프트에 추가
 */
async function generateRLPerformanceContext(): Promise<string> {
  try {
    const state = await ReinforcementLearningSystem.getSystemState()
    if (state.totalFeedbacks === 0) return ''

    let context = '\n\n## 📊 현재 시스템 성능 (실시간)\n\n'
    context += `- 총 피드백: ${state.totalFeedbacks}건\n`
    context += `- 성공률: ${state.successRate.toFixed(1)}%\n`
    context += `- 평균 NotebookLM 점수: ${state.avgScores.notebookLM.toFixed(1)}/100\n`

    // 성공률이 낮으면 추가 경고
    if (state.successRate < 70) {
      context += '\n⚠️ **성공률이 낮습니다.** 다음 사항을 특히 주의하세요:\n'
      for (const fp of state.topFailurePatterns.slice(0, 3)) {
        context += `- ${fp.pattern} (${fp.count}회)\n`
      }
    }

    // NotebookLM 점수 목표 강조
    if (state.avgScores.notebookLM < 80) {
      context += '\n🎯 **목표: NotebookLM 능가** - 추론 능력과 결과물 품질을 높이세요.\n'
      context += '- 단순 나열 대신 논리적 추론과 근거를 제시하세요.\n'
      context += '- 워크플로우의 각 단계가 왜 필요한지 명확히 설계하세요.\n'
    }

    return context
  } catch (e) {
    console.warn('[RL Context] 생성 실패:', e)
    return ''
  }
}

/**
 * 전체 RL 기반 프롬프트 보강 (모든 학습 결과 통합)
 */
async function enhanceSystemPromptWithRL(basePrompt: string): Promise<string> {
  let enhancedPrompt = basePrompt

  // 1. 성능 컨텍스트 추가
  enhancedPrompt += await generateRLPerformanceContext()

  // 2. 검증된 성공 패턴 Few-shot 추가
  enhancedPrompt += await generateRLFewShotExamples()

  // 3. 실패 패턴 경고 추가
  enhancedPrompt += await generateRLFailureWarnings()

  // 4. 대기 중인 개선안 적용
  enhancedPrompt += await applyRLImprovementProposals()

  // 5. 학습 인사이트 추가
  const insights = await ReinforcementLearningSystem.generateLearningInsights()
  if (insights) {
    enhancedPrompt += '\n\n' + insights
  }

  return enhancedPrompt
}

// ============================================================
// LLM 호출
// ============================================================

/**
 * 대화 기록과 새 사용자 입력을 기반으로 LLM 응답 생성
 * 학습 시스템 통합: 성공 패턴 기반 프롬프트 개선
 * 프롬프트 분석: 모호성 감지 및 의도 분리
 */
export async function generateWorkflowFromChat(
  messages: ChatMessage[],
  userInput: string,
): Promise<WorkflowGenerationResult> {
  // ════════════════════════════════════════════════════════════
  // 1단계: 프롬프트 분석 (모호성 감지, 의도 분리)
  // ════════════════════════════════════════════════════════════
  const promptAnalysis = analyzePrompt(userInput)

  console.log('[WorkflowOrchestrator] 프롬프트 분석:', {
    의도수: promptAnalysis.intents.length,
    누락정보: promptAnalysis.missingInfo.length,
    복잡도: promptAnalysis.complexity,
    신뢰도: `${(promptAnalysis.confidence * 100).toFixed(0)}%`,
    명확화필요: promptAnalysis.needsClarification,
    추천노드: promptAnalysis.suggestedNodes.slice(0, 5),
  })

  // 명확화가 필요한 경우 질문 반환 (워크플로우 생성 없이)
  if (promptAnalysis.needsClarification && messages.length < 2) {
    const clarificationResponse = generateClarificationResponse(promptAnalysis)
    return {
      responseText: clarificationResponse,
      workflow: null,
      validationErrors: [],
      warnings: ['프롬프트 명확화 필요'],
      _meta: {
        userRequest: userInput,
        conversationTurns: messages.length + 1,
        promptAnalysis,
      },
    }
  }

  // ════════════════════════════════════════════════════════════
  // 2단계: 시스템 프롬프트 구성 (강화학습 통합)
  // ════════════════════════════════════════════════════════════
  let systemPrompt = generateSystemPrompt()

  // 기존 학습 데이터 기반 시스템 프롬프트 보강
  systemPrompt = enhanceSystemPrompt(systemPrompt)

  // 유사한 성공 사례 Few-shot 예시 추가
  const fewShotExamples = generateFewShotExamples(userInput)
  if (fewShotExamples) {
    systemPrompt += '\n' + fewShotExamples
  }

  // 🎯 강화학습 시스템 통합 - 학습 결과를 시스템 프롬프트에 자동 반영
  try {
    systemPrompt = await enhanceSystemPromptWithRL(systemPrompt)
    console.log('[WorkflowOrchestrator] ✅ 강화학습 결과 시스템 프롬프트에 통합됨')
  } catch (rlError) {
    console.warn('[WorkflowOrchestrator] RL 통합 실패 (폴백):', rlError)
  }

  // 프롬프트 분석 결과 기반 힌트 추가
  systemPrompt += generateAnalysisHints(promptAnalysis)

  // 학습 통계 로깅 (기존 + RL 통합)
  const stats = getLearningStats()
  if (stats.totalFeedbacks > 0) {
    console.log('[WorkflowOrchestrator] 학습 통계:', {
      피드백수: stats.totalFeedbacks,
      성공률: `${(stats.successRate * 100).toFixed(0)}%`,
      평균대화턴: stats.avgConversationTurns.toFixed(1),
    })
  }

  // RL 시스템 상태 로깅
  try {
    const rlState = await ReinforcementLearningSystem.getSystemState()
    if (rlState.totalFeedbacks > 0) {
      console.log('[WorkflowOrchestrator] 🧠 강화학습 상태:', {
        총피드백: rlState.totalFeedbacks,
        성공률: `${rlState.successRate.toFixed(1)}%`,
        평균NotebookLM점수: rlState.avgScores.notebookLM.toFixed(1),
        대기제안: rlState.pendingProposals,
        적용개선: rlState.appliedImprovements,
      })
    }
  } catch (e) {
    // RL 상태 로깅 실패는 무시
  }

  // ════════════════════════════════════════════════════════════
  // 3단계: LLM 호출
  // ════════════════════════════════════════════════════════════
  const historyMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const conversationHistory = formatConversationHistory(historyMessages)

  // 의도 분리 정보 추가
  const intentInfo = promptAnalysis.intents.length > 1
    ? `\n[분석된 의도: ${promptAnalysis.intents.map(i => i.action).join(' → ')}]`
    : ''

  const fullPrompt = conversationHistory
    ? `${conversationHistory}\n\nUser: ${userInput}${intentInfo}`
    : `User: ${userInput}${intentInfo}`

  try {
    const result = await invoke<{
      response: string
      usage: { input_tokens: number; output_tokens: number }
    }>('invoke_bedrock', {
      request: {
        model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        prompt: fullPrompt,
        system_prompt: systemPrompt,
        max_tokens: 8192,
        temperature: 0.7,
      },
    })

    console.log('[WorkflowOrchestrator] LLM 응답:', result.usage)

    // ════════════════════════════════════════════════════════════
    // 4단계: 워크플로우 추출 및 검증
    // ════════════════════════════════════════════════════════════
    const extracted = extractWorkflowFromResponse(result.response)

    // 워크플로우가 추출된 경우 추가 검증 및 자동 수정
    if (extracted.workflow) {
      const validationResult = validateAndFixWorkflow(extracted.workflow)
      extracted.workflow = validationResult.workflow
      extracted.warnings.push(...validationResult.warnings)
      extracted.errors.push(...validationResult.errors)
    }

    return {
      responseText: result.response,
      workflow: extracted.workflow,
      validationErrors: extracted.errors,
      warnings: extracted.warnings,
      _meta: {
        userRequest: userInput,
        conversationTurns: messages.length + 1,
        promptAnalysis,
      },
    }
  } catch (error) {
    console.error('[WorkflowOrchestrator] LLM 호출 실패:', error)
    throw new Error(`LLM 호출 실패: ${error}`)
  }
}

/**
 * 명확화 응답 생성
 * 역질문을 통해 워크플로우 요구사항을 구체화
 */
function generateClarificationResponse(analysis: PromptAnalysisResult): string {
  if (analysis.clarificationQuestions.length === 0) {
    return '워크플로우를 생성하겠습니다.'
  }

  let response = ''

  for (const question of analysis.clarificationQuestions) {
    response += `❓ ${question}\n`
  }

  return response.trim()
}

/**
 * 프롬프트 분석 결과 기반 힌트 생성
 */
function generateAnalysisHints(analysis: PromptAnalysisResult): string {
  if (analysis.intents.length <= 1 && analysis.suggestedNodes.length === 0) {
    return ''
  }

  let hints = '\n\n[분석 힌트]\n'

  // 의도 분석
  if (analysis.intents.length > 1) {
    hints += `- 의도: ${analysis.intents.map(i => i.action).join(' → ')}\n`
  }

  // 추천 노드
  if (analysis.suggestedNodes.length > 0) {
    hints += `- 추천 노드: ${analysis.suggestedNodes.slice(0, 5).join(', ')}\n`
  }

  // 누락 정보
  if (analysis.missingInfo.length > 0) {
    hints += `- 누락 정보: ${analysis.missingInfo.join(', ')}\n`
  }

  return hints
}

/**
 * 워크플로우 검증 및 자동 수정
 */
function validateAndFixWorkflow(workflow: WorkflowFile): {
  workflow: WorkflowFile
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []

  // WorkflowValidator를 사용한 검증
  const nodes: WorkflowNode[] = workflow.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  }))

  const edges: WorkflowEdge[] = workflow.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || undefined,
    targetHandle: e.targetHandle || undefined,
  }))

  const validationResult = validateWorkflow(nodes, edges, true)

  // 검증 이슈를 warnings/errors로 분류
  for (const issue of validationResult.issues) {
    if (issue.type === 'error' && !issue.autoFixable) {
      errors.push(issue.message)
    } else {
      warnings.push(issue.message)
    }
  }

  // 수정된 워크플로우 반환
  const fixedWorkflow: WorkflowFile = {
    ...workflow,
    nodes: validationResult.fixedNodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as any,
    })),
    edges: validationResult.fixedEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
      animated: true,
    })),
  }

  // 삽입된 변환 노드 로깅
  if (validationResult.insertedNodes.length > 0) {
    console.log('[WorkflowOrchestrator] 자동 삽입된 변환 노드:', validationResult.insertedNodes.map(n => n.type))
    warnings.push(`${validationResult.insertedNodes.length}개의 타입 변환 노드가 자동 추가되었습니다`)
  }

  return { workflow: fixedWorkflow, warnings, errors }
}

/**
 * 워크플로우 적용 후 피드백 기록
 * AIWorkflowGenerator에서 워크플로우 적용 시 호출
 */
export function recordWorkflowApplied(
  userRequest: string,
  workflow: WorkflowFile,
  conversationTurns: number,
): void {
  recordWorkflowFeedback({
    workflowId: workflow.id,
    userRequest,
    generatedWorkflow: workflow,
    wasApplied: true,
    wasModified: false,
    wasExecuted: false,
    executionSuccess: false,
    conversationTurns,
    clarificationCount: Math.max(0, conversationTurns - 2),
  })
}

/**
 * 워크플로우 실행 결과 기록
 * 실행 완료 후 호출
 */
export function recordWorkflowExecuted(
  workflowId: string,
  success: boolean,
): void {
  // localStorage에서 해당 워크플로우의 피드백 찾아 업데이트
  const STORAGE_KEY = 'handbox-workflow-feedbacks'
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const feedbacks = JSON.parse(stored)
      const feedback = feedbacks.find((f: any) => f.workflowId === workflowId)
      if (feedback) {
        feedback.wasExecuted = true
        feedback.executionSuccess = success
        localStorage.setItem(STORAGE_KEY, JSON.stringify(feedbacks))
        console.log('[WorkflowOrchestrator] 실행 결과 기록:', workflowId, success ? '성공' : '실패')
      }
    }
  } catch (error) {
    console.error('[WorkflowOrchestrator] 실행 결과 기록 실패:', error)
  }
}

// ============================================================
// 워크플로우 JSON 추출 및 검증
// ============================================================

interface ExtractResult {
  workflow: WorkflowFile | null
  errors: string[]
  warnings: string[]
}

/**
 * LLM 응답에서 워크플로우 JSON 추출 및 검증
 */
function extractWorkflowFromResponse(response: string): ExtractResult {
  // JSON 코드 블록 찾기
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
    || response.match(/```\s*(\{[\s\S]*?\})\s*```/)

  if (!jsonMatch) {
    return {
      workflow: null,
      errors: [],
      warnings: [],
    }
  }

  try {
    const jsonStr = jsonMatch[1].trim()
    const parsed = JSON.parse(jsonStr)

    // 필수 필드 검증
    const errors: string[] = []
    const warnings: string[] = []

    if (!parsed.version) {
      parsed.version = '2.0.0'
      warnings.push('버전 필드가 없어 2.0.0으로 설정')
    }

    if (!parsed.id) {
      parsed.id = `generated_${Date.now()}`
      warnings.push('ID 필드가 없어 자동 생성')
    }

    if (!parsed.meta) {
      parsed.meta = {
        name: '생성된 워크플로우',
        description: 'LLM이 생성한 워크플로우',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      warnings.push('메타데이터가 없어 기본값 적용')
    }

    if (!Array.isArray(parsed.nodes)) {
      errors.push('nodes 배열이 필요합니다')
      return { workflow: null, errors, warnings }
    }

    if (!Array.isArray(parsed.edges)) {
      parsed.edges = []
      warnings.push('edges 배열이 없어 빈 배열로 설정')
    }

    // 노드 검증 및 보정
    const validatedNodes: SerializedNode[] = []
    for (let i = 0; i < parsed.nodes.length; i++) {
      const node = parsed.nodes[i]
      const validated = validateNode(node, i, warnings)
      if (validated) {
        validatedNodes.push(validated)
      }
    }

    if (validatedNodes.length === 0) {
      errors.push('유효한 노드가 없습니다')
      return { workflow: null, errors, warnings }
    }

    // 엣지 검증
    const validNodeIds = new Set(validatedNodes.map(n => n.id))
    const validatedEdges: SerializedEdge[] = parsed.edges
      .filter((edge: any) => {
        if (!validNodeIds.has(edge.source)) {
          warnings.push(`엣지 ${edge.id}: 소스 노드 '${edge.source}' 없음`)
          return false
        }
        if (!validNodeIds.has(edge.target)) {
          warnings.push(`엣지 ${edge.id}: 타겟 노드 '${edge.target}' 없음`)
          return false
        }
        return true
      })
      .map((edge: any) => ({
        id: edge.id || `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || null,
        targetHandle: edge.targetHandle || null,
        animated: edge.animated ?? true,
      }))

    const workflow: WorkflowFile = {
      version: parsed.version,
      id: parsed.id,
      meta: {
        name: parsed.meta.name || '생성된 워크플로우',
        description: parsed.meta.description || '',
        createdAt: parsed.meta.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      nodes: validatedNodes,
      edges: validatedEdges,
    }

    return { workflow, errors, warnings }
  } catch (e) {
    return {
      workflow: null,
      errors: [`JSON 파싱 실패: ${e}`],
      warnings: [],
    }
  }
}

/**
 * 사용 가능한 프로바이더와 기본 모델을 가져옴
 */
function getAvailableProviderAndModel(): { provider: string; model: string } | null {
  try {
    const providers = getAvailableProviders()
    const available = providers.find(p => p.available)

    if (!available) return null

    const provider = available.provider
    const defaultModel = provider.models[0]?.id || ''

    return {
      provider: provider.id,
      model: defaultModel,
    }
  } catch {
    return null
  }
}

/**
 * 단일 노드 검증 및 보정
 * LLM 노드의 경우 API 키가 설정된 프로바이더를 자동 선택
 */
function validateNode(
  node: any,
  index: number,
  warnings: string[]
): SerializedNode | null {
  if (!node.type) {
    warnings.push(`노드 ${index}: type 필드 없음`)
    return null
  }

  // 노드 타입이 레지스트리에 있는지 확인
  const definition = NodeRegistry.get(node.type)
  if (!definition) {
    warnings.push(`노드 ${index}: 알 수 없는 타입 '${node.type}'`)
  }

  // 노드 색상 결정
  const color = node.data?.color
    || definition?.meta?.color
    || '#6366f1'

  // config 초기화
  let config = node.data?.config || {}

  // ═══════════════════════════════════════════════════════════════
  // 노드 타입별 필수 설정 자동 채우기
  // ═══════════════════════════════════════════════════════════════

  // LLM 관련 노드: provider, model 자동 설정
  const llmNodeTypes = ['llm.chat', 'llm.embed', 'llm.structured']
  if (llmNodeTypes.includes(node.type)) {
    const availableProviderModel = getAvailableProviderAndModel()

    if (availableProviderModel) {
      if (!config.provider) {
        config.provider = availableProviderModel.provider
      }
      if (!config.model) {
        config.model = availableProviderModel.model
      }
    }
  }

  // 파일 IO 노드: path 기본값 설정
  const fileNodeTypes = ['io.file-read', 'io.file-write', 'io.file-list']
  if (fileNodeTypes.includes(node.type) && !config.path) {
    config.path = node.type === 'io.file-list' ? './input' : './input/document.pdf'
  }

  // 페르소나 에이전트: persona_id 기본값
  if (node.type === 'agent.persona' && !config.persona_id) {
    config.persona_id = 'default_expert'
  }

  // 투표 집계: voting_method 기본값
  if (node.type === 'control.voting-aggregator' && !config.voting_method) {
    config.voting_method = 'two_thirds'
  }

  // 벡터 저장소/검색: collection 기본값
  const vectorNodeTypes = ['storage.vector-store', 'storage.vector-search']
  if (vectorNodeTypes.includes(node.type) && !config.collection) {
    config.collection = 'default'
  }

  // RAG retriever: top_k 기본값
  if (node.type === 'rag.retriever' && !config.top_k) {
    config.top_k = 10
  }

  // Export 노드: output_path 기본값 (필수)
  const exportNodeTypes = ['export.word', 'export.ppt', 'export.pdf', 'export.excel', 'export.csv']
  if (exportNodeTypes.includes(node.type) && !config.output_path) {
    const extensions: Record<string, string> = {
      'export.word': 'docx',
      'export.ppt': 'pptx',
      'export.pdf': 'pdf',
      'export.excel': 'xlsx',
      'export.csv': 'csv'
    }
    const ext = extensions[node.type] || 'txt'
    config.output_path = `./output/result_${Date.now()}.${ext}`
  }

  // 시각화 노드: format 기본값
  const vizNodeTypes = ['viz.chart', 'viz.table', 'viz.text']
  if (vizNodeTypes.includes(node.type)) {
    if (!config.format) config.format = 'markdown'
    if (node.type === 'viz.chart' && !config.chart_type) config.chart_type = 'bar'
  }

  // 문서 변환 노드: output_format 기본값
  if (node.type === 'doc.convert' && !config.output_format) {
    config.output_format = 'pdf'
  }

  return {
    id: node.id || `node_${Date.now()}_${index}`,
    type: node.type,
    position: {
      x: node.position?.x ?? index * 250,
      y: node.position?.y ?? 100,
    },
    data: {
      label: node.data?.label || definition?.meta?.label || node.type,
      color,
      description: node.data?.description || definition?.meta?.description,
      config,
      enabled: node.data?.enabled ?? true,
    },
  }
}

// ============================================================
// 워크플로우 적용
// ============================================================

/**
 * WorkflowFile을 ReactFlow 노드/엣지로 변환
 */
export function deserializeWorkflow(workflow: WorkflowFile): {
  nodes: any[]
  edges: any[]
} {
  const nodes = workflow.nodes.map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: {
      ...node.data,
      // ReactFlow에서 필요한 추가 필드
      provider: '',
      useCase: '',
    },
  }))

  const edges = workflow.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: edge.animated ?? true,
    style: { stroke: '#6366f1', strokeWidth: 2 },
  }))

  return { nodes, edges }
}

// ============================================================
// 워크플로우 JSON 분석 (업로드 파일 분석용)
// ============================================================

/**
 * 워크플로우 분석 결과 인터페이스
 */
export interface WorkflowAnalysisResult {
  /** 분석 성공 여부 */
  success: boolean
  /** 응답 텍스트 (LLM 분석 결과) */
  responseText: string
  /** 구조 분석 */
  structure: {
    nodeCount: number
    edgeCount: number
    nodeTypes: string[]
    hasStartNode: boolean
    hasEndNode: boolean
    orphanNodes: string[]
    unreachableNodes: string[]
  }
  /** 발견된 이슈 */
  issues: {
    severity: 'error' | 'warning' | 'info'
    message: string
    nodeId?: string
    suggestion?: string
  }[]
  /** 개선 제안 */
  suggestions: string[]
  /** 워크플로우 복잡도 */
  complexity: 'simple' | 'moderate' | 'complex' | 'expert'
  /** 예상 실행 시간 (초) */
  estimatedDuration?: number
  /** 분석 컨텍스트 (UI 표시용) */
  analysisContext?: {
    workflowId: string
    workflowName: string
    nodeCount: number
    edgeCount: number
    nodeTypes: string[]
    issues: string[]
    suggestions: string[]
  }
}

/**
 * 업로드된 워크플로우 JSON 검증
 * 구문 검사 및 기본 구조 검증
 */
export function validateWorkflowFile(workflow: WorkflowFile): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // 필수 필드 검증
  if (!workflow.version) {
    warnings.push('버전 정보가 없습니다.')
  }

  if (!workflow.id) {
    warnings.push('워크플로우 ID가 없습니다.')
  }

  if (!Array.isArray(workflow.nodes)) {
    errors.push('노드 배열이 필요합니다.')
    return { valid: false, errors, warnings }
  }

  if (workflow.nodes.length === 0) {
    errors.push('워크플로우에 노드가 없습니다.')
    return { valid: false, errors, warnings }
  }

  // 각 노드 검증
  const nodeIds = new Set<string>()
  for (let i = 0; i < workflow.nodes.length; i++) {
    const node = workflow.nodes[i]

    if (!node.id) {
      errors.push(`노드 ${i}: ID가 없습니다.`)
    } else if (nodeIds.has(node.id)) {
      errors.push(`노드 ${i}: 중복된 ID '${node.id}'`)
    } else {
      nodeIds.add(node.id)
    }

    if (!node.type) {
      errors.push(`노드 ${node.id || i}: 타입이 없습니다.`)
    } else {
      // 노드 타입이 레지스트리에 있는지 확인
      const definition = NodeRegistry.get(node.type)
      if (!definition) {
        warnings.push(`노드 '${node.id}': 알 수 없는 타입 '${node.type}'`)
      }
    }

    if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
      warnings.push(`노드 '${node.id}': 위치 정보가 없거나 잘못됨`)
    }
  }

  // 엣지 검증
  if (Array.isArray(workflow.edges)) {
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source)) {
        warnings.push(`엣지 '${edge.id}': 소스 노드 '${edge.source}'를 찾을 수 없음`)
      }
      if (!nodeIds.has(edge.target)) {
        warnings.push(`엣지 '${edge.id}': 타겟 노드 '${edge.target}'를 찾을 수 없음`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 업로드된 워크플로우 JSON을 AI에게 분석 요청
 * 구조 분석, 잠재적 문제점 식별, 개선 제안 생성
 */
export async function analyzeWorkflowJSON(
  workflow: WorkflowFile,
  userRequest: string,
  analysisType: 'analyze' | 'improve' = 'analyze',
): Promise<WorkflowAnalysisResult> {
  // 기본 구조 분석
  const nodeTypes = [...new Set(workflow.nodes.map(n => n.type))]
  const nodeIds = new Set(workflow.nodes.map(n => n.id))

  // 연결되지 않은 노드 찾기
  const connectedNodes = new Set<string>()
  for (const edge of workflow.edges || []) {
    connectedNodes.add(edge.source)
    connectedNodes.add(edge.target)
  }
  const orphanNodes = workflow.nodes
    .filter(n => !connectedNodes.has(n.id))
    .map(n => n.id)

  // 시작/종료 노드 확인 (입력 엣지가 없는 노드 = 시작, 출력 엣지가 없는 노드 = 종료)
  const targetNodes = new Set((workflow.edges || []).map(e => e.target))
  const sourceNodes = new Set((workflow.edges || []).map(e => e.source))

  const startNodes = workflow.nodes.filter(n => !targetNodes.has(n.id) && sourceNodes.has(n.id))
  const endNodes = workflow.nodes.filter(n => !sourceNodes.has(n.id) && targetNodes.has(n.id))

  // 복잡도 계산
  const nodeCount = workflow.nodes.length
  const edgeCount = workflow.edges?.length || 0
  let complexity: WorkflowAnalysisResult['complexity'] = 'simple'
  if (nodeCount > 10 || edgeCount > 15) complexity = 'expert'
  else if (nodeCount > 6 || edgeCount > 8) complexity = 'complex'
  else if (nodeCount > 3 || edgeCount > 4) complexity = 'moderate'

  // LLM 분석을 위한 시스템 프롬프트
  const analysisPrompt = analysisType === 'analyze'
    ? `당신은 워크플로우 분석 전문가입니다. 주어진 워크플로우 JSON을 분석하고 다음을 제공해주세요:

1. **구조 분석**: 워크플로우의 전체 구조와 데이터 흐름 설명
2. **잠재적 문제점**: 성능 병목, 에러 가능성, 비효율적인 구조 등
3. **개선 제안**: 더 효율적이거나 강건한 워크플로우로 만들기 위한 제안
4. **모범 사례 적용**: 현재 워크플로우가 모범 사례를 따르고 있는지 평가

사용자 요청: ${userRequest || '이 워크플로우를 분석해주세요'}

워크플로우 메타데이터:
- 이름: ${workflow.meta?.name || '(없음)'}
- 설명: ${workflow.meta?.description || '(없음)'}
- 노드 수: ${nodeCount}
- 연결 수: ${edgeCount}
- 노드 타입: ${nodeTypes.join(', ')}

분석 결과를 구조화된 형식으로 제공해주세요.`
    : `당신은 워크플로우 아키텍트입니다. 주어진 워크플로우를 개선하여 새로운 버전을 생성해주세요.

개선 요청: ${userRequest || '이 워크플로우를 개선해주세요'}

현재 워크플로우:
- 이름: ${workflow.meta?.name || '(없음)'}
- 설명: ${workflow.meta?.description || '(없음)'}
- 노드 수: ${nodeCount}
- 연결 수: ${edgeCount}
- 노드 타입: ${nodeTypes.join(', ')}

개선 사항과 함께 새로운 워크플로우 JSON을 \`\`\`json 코드 블록으로 제공해주세요.
응답 형식:
1. 개선 사항 요약
2. 변경된 부분 설명
3. 새로운 워크플로우 JSON`

  // 워크플로우 JSON을 문자열로 변환 (분석용)
  const workflowJson = JSON.stringify(workflow, null, 2)

  try {
    const result = await invoke<{
      response: string
      usage: { input_tokens: number; output_tokens: number }
    }>('invoke_bedrock', {
      request: {
        model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
        prompt: `다음 워크플로우 JSON을 분석해주세요:\n\n\`\`\`json\n${workflowJson}\n\`\`\``,
        system_prompt: analysisPrompt,
        max_tokens: 4096,
        temperature: 0.5,
      },
    })

    console.log('[WorkflowOrchestrator] 워크플로우 분석 완료:', result.usage)

    // 이슈 및 제안 추출
    const issues: WorkflowAnalysisResult['issues'] = []
    const suggestions: string[] = []

    // 기본 이슈 추가
    if (orphanNodes.length > 0) {
      issues.push({
        severity: 'warning',
        message: `연결되지 않은 노드가 ${orphanNodes.length}개 있습니다.`,
        suggestion: '해당 노드들을 워크플로우에 연결하거나 제거하세요.',
      })
    }

    if (startNodes.length === 0) {
      issues.push({
        severity: 'info',
        message: '명확한 시작 노드가 없습니다.',
        suggestion: '워크플로우의 진입점을 명확히 정의하세요.',
      })
    }

    if (startNodes.length > 1) {
      issues.push({
        severity: 'info',
        message: `시작 노드가 ${startNodes.length}개 있습니다. (병렬 실행)`,
      })
    }

    // LLM 응답에서 제안 추출
    const suggestionMatches = result.response.match(/(?:개선|제안|추천)[:：]\s*([^\n]+)/g)
    if (suggestionMatches) {
      for (const match of suggestionMatches) {
        suggestions.push(match.replace(/(?:개선|제안|추천)[:：]\s*/, '').trim())
      }
    }

    return {
      success: true,
      responseText: result.response,
      structure: {
        nodeCount,
        edgeCount,
        nodeTypes,
        hasStartNode: startNodes.length > 0,
        hasEndNode: endNodes.length > 0,
        orphanNodes,
        unreachableNodes: [],
      },
      issues,
      suggestions,
      complexity,
      estimatedDuration: nodeCount * 2, // 노드당 약 2초 (추정)
      analysisContext: {
        workflowId: workflow.meta?.id || 'unknown',
        workflowName: workflow.meta?.name || 'Untitled',
        nodeCount,
        edgeCount,
        nodeTypes,
        issues: issues.map(i => i.message),
        suggestions,
      },
    }
  } catch (error) {
    console.error('[WorkflowOrchestrator] 워크플로우 분석 실패:', error)
    return {
      success: false,
      responseText: `분석 중 오류 발생: ${error}`,
      structure: {
        nodeCount,
        edgeCount,
        nodeTypes,
        hasStartNode: startNodes.length > 0,
        hasEndNode: endNodes.length > 0,
        orphanNodes,
        unreachableNodes: [],
      },
      issues: [{
        severity: 'error',
        message: `분석 실패: ${error}`,
      }],
      suggestions: [],
      complexity,
    }
  }
}
