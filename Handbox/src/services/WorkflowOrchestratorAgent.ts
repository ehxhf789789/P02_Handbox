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
  // 2단계: 시스템 프롬프트 구성
  // ════════════════════════════════════════════════════════════
  let systemPrompt = generateSystemPrompt()

  // 학습 데이터 기반 시스템 프롬프트 보강
  systemPrompt = enhanceSystemPrompt(systemPrompt)

  // 유사한 성공 사례 Few-shot 예시 추가
  const fewShotExamples = generateFewShotExamples(userInput)
  if (fewShotExamples) {
    systemPrompt += '\n' + fewShotExamples
  }

  // 프롬프트 분석 결과 기반 힌트 추가
  systemPrompt += generateAnalysisHints(promptAnalysis)

  // 학습 통계 로깅
  const stats = getLearningStats()
  if (stats.totalFeedbacks > 0) {
    console.log('[WorkflowOrchestrator] 학습 통계:', {
      피드백수: stats.totalFeedbacks,
      성공률: `${(stats.successRate * 100).toFixed(0)}%`,
      평균대화턴: stats.avgConversationTurns.toFixed(1),
    })
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
 */
function generateClarificationResponse(analysis: PromptAnalysisResult): string {
  let response = '요청을 더 정확하게 이해하기 위해 몇 가지 질문드릴게요:\n\n'

  for (const question of analysis.clarificationQuestions) {
    response += `❓ ${question}\n`
  }

  response += '\n위 정보를 알려주시면 더 정확한 워크플로우를 생성할 수 있습니다.'

  // 현재 파악된 의도 안내
  if (analysis.intents.length > 0 && analysis.intents[0].action !== 'process') {
    response += `\n\n📋 현재 파악된 의도: ${analysis.intents.map(i => i.action).join(', ')}`
  }

  // 추천 노드 안내
  if (analysis.suggestedNodes.length > 0) {
    response += `\n💡 사용 가능한 노드: ${analysis.suggestedNodes.slice(0, 5).join(', ')}`
  }

  return response
}

/**
 * 프롬프트 분석 결과 기반 힌트 생성
 */
function generateAnalysisHints(analysis: PromptAnalysisResult): string {
  if (analysis.intents.length <= 1 && analysis.suggestedNodes.length === 0) {
    return ''
  }

  let hints = '\n\n## 프롬프트 분석 힌트\n\n'

  // 의도 분석
  if (analysis.intents.length > 1) {
    hints += `### 분석된 의도 (${analysis.intents.length}개)\n`
    for (const intent of analysis.intents) {
      hints += `- ${intent.action}${intent.target ? ` (대상: ${intent.target})` : ''}${intent.output ? ` → ${intent.output}` : ''}\n`
    }
    hints += '\n**중요**: 모든 의도를 순서대로 워크플로우에 포함해야 합니다.\n\n'
  }

  // 추천 노드
  if (analysis.suggestedNodes.length > 0) {
    hints += `### 추천 노드\n`
    hints += `다음 노드 사용을 우선 고려하세요: ${analysis.suggestedNodes.join(', ')}\n\n`
  }

  // 복잡도 안내
  hints += `### 예상 복잡도: ${analysis.complexity}\n`
  const nodeCountGuide = {
    simple: '2-3개 노드',
    moderate: '4-6개 노드',
    complex: '7-10개 노드',
    expert: '10개 이상 노드',
  }
  hints += `권장 노드 수: ${nodeCountGuide[analysis.complexity]}\n`

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

  // LLM 관련 노드의 경우 자동으로 사용 가능한 프로바이더/모델 설정
  const llmNodeTypes = ['llm.chat', 'llm.embed', 'llm.structured']
  if (llmNodeTypes.includes(node.type)) {
    const availableProviderModel = getAvailableProviderAndModel()

    if (availableProviderModel) {
      // 프로바이더가 설정되지 않았으면 자동 설정
      if (!config.provider) {
        config.provider = availableProviderModel.provider
        warnings.push(`노드 ${index} (${node.type}): 프로바이더 자동 설정 → ${availableProviderModel.provider}`)
      }

      // 모델이 설정되지 않았으면 자동 설정
      if (!config.model) {
        config.model = availableProviderModel.model
        warnings.push(`노드 ${index} (${node.type}): 모델 자동 설정 → ${availableProviderModel.model}`)
      }
    } else {
      warnings.push(`노드 ${index} (${node.type}): 사용 가능한 LLM 프로바이더가 없습니다. API 키를 설정하세요.`)
    }
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
