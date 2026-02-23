/**
 * Orchestrator Agent
 *
 * 사용자 요청을 분석하여 작업 계획을 생성하고, 에이전트/도구를
 * 조율하여 실행하는 핵심 에이전트.
 *
 * 핵심 기능:
 * - 요청 분석 및 의도 파악
 * - 작업 계획 생성 (XAI 설명 포함)
 * - 계획을 VLP 워크플로우로 변환
 * - 사용자 검토/승인 후 실행
 * - 실행 모니터링 및 오류 복구
 */

import { invoke } from '@tauri-apps/api/tauri'
import { MemoryAgent } from './MemoryAgent'
import { MCPScriptSystem } from '../mcp/MCPScriptSystem'
import type {
  AgentContext,
  AgentResponse,
  TaskPlan,
  TaskStep,
  InterpretedIntent,
  XAIExplanation,
  ReasoningStep,
  Alternative,
  KnowledgeReference,
  ConfidenceFactor,
  IOrchestratorAgent,
  PlanModification,
  ExecutionResult,
  ExecutionProgress,
  RecoveryAction,
  Resource,
  Risk,
} from './types'

// ============================================================
// Constants
// ============================================================

const SYSTEM_PROMPT = `당신은 Handbox의 Orchestrator Agent입니다.
사용자 요청을 분석하여 구조화된 작업 계획을 생성합니다.

규칙:
1. 요청의 의도를 명확히 파악합니다
2. 작업을 원자적 단계로 분해합니다
3. 각 단계에 적절한 도구/에이전트를 할당합니다
4. 의사결정 과정을 상세히 설명합니다 (XAI)
5. 잠재적 위험과 대안을 식별합니다

응답 형식: 반드시 JSON으로 응답하세요.
`

// ============================================================
// Orchestrator Agent Implementation
// ============================================================

class OrchestratorAgentImpl implements IOrchestratorAgent {
  private plans: Map<string, TaskPlan> = new Map()

  // ── 작업 계획 생성 ──

  async createPlan(
    request: string,
    context: AgentContext
  ): Promise<AgentResponse<TaskPlan>> {
    const startTime = Date.now()
    const reasoningSteps: ReasoningStep[] = []

    try {
      // Step 1: 요청 분석
      reasoningSteps.push({
        step: 1,
        action: '요청 분석',
        rationale: '사용자 요청의 의도, 도메인, 복잡도를 파악합니다',
        input: request,
        output: null,
        duration: 0,
      })

      const stepStart = Date.now()
      const intent = await this.analyzeIntent(request, context)
      reasoningSteps[0].output = intent
      reasoningSteps[0].duration = Date.now() - stepStart

      // Step 2: 관련 기억 검색
      reasoningSteps.push({
        step: 2,
        action: '관련 기억 검색',
        rationale: '과거 유사 작업, 사용자 선호도, 학습된 패턴을 검색합니다',
        input: { intent, userId: context.userProfile.userId },
        output: null,
        duration: 0,
      })

      const step2Start = Date.now()
      const memories = await this.fetchRelevantMemories(intent, context)
      reasoningSteps[1].output = { count: memories.length, categories: [...new Set(memories.map(m => m.category))] }
      reasoningSteps[1].duration = Date.now() - step2Start

      // Step 3: 사용 가능한 도구 파악
      reasoningSteps.push({
        step: 3,
        action: '도구 분석',
        rationale: '작업에 필요한 MCP 도구와 노드를 식별합니다',
        input: intent,
        output: null,
        duration: 0,
      })

      const step3Start = Date.now()
      const availableTools = await this.identifyTools(intent)
      reasoningSteps[2].output = { toolCount: availableTools.length, tools: availableTools.map(t => t.name) }
      reasoningSteps[2].duration = Date.now() - step3Start

      // Step 4: 작업 단계 생성
      reasoningSteps.push({
        step: 4,
        action: '작업 단계 생성',
        rationale: '요청을 실행 가능한 원자적 단계로 분해합니다',
        input: { intent, tools: availableTools, memories },
        output: null,
        duration: 0,
      })

      const step4Start = Date.now()
      const steps = await this.generateSteps(intent, availableTools, memories, context)
      reasoningSteps[3].output = { stepCount: steps.length, steps: steps.map(s => s.name) }
      reasoningSteps[3].duration = Date.now() - step4Start

      // Step 5: 위험 분석
      reasoningSteps.push({
        step: 5,
        action: '위험 분석',
        rationale: '실행 중 발생할 수 있는 위험과 대응 방안을 분석합니다',
        input: steps,
        output: null,
        duration: 0,
      })

      const step5Start = Date.now()
      const risks = this.analyzeRisks(steps, intent)
      reasoningSteps[4].output = { riskCount: risks.length, highRisks: risks.filter(r => r.probability * r.impact > 0.5).length }
      reasoningSteps[4].duration = Date.now() - step5Start

      // Step 6: 대안 계획 생성
      reasoningSteps.push({
        step: 6,
        action: '대안 계획 수립',
        rationale: '주요 계획이 실패할 경우를 대비한 대안을 준비합니다',
        input: { intent, steps },
        output: null,
        duration: 0,
      })

      const step6Start = Date.now()
      const alternatives = await this.generateAlternatives(intent, steps, context)
      reasoningSteps[5].output = { alternativeCount: alternatives.length }
      reasoningSteps[5].duration = Date.now() - step6Start

      // 계획 생성
      const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      const plan: TaskPlan = {
        id: planId,
        originalRequest: request,
        interpretedIntent: intent,
        steps,
        estimatedDuration: steps.reduce((sum, s) => sum + s.estimatedDuration, 0),
        requiredResources: this.identifyResources(steps),
        risks,
        alternativePlans: [],
        explanation: this.buildExplanation(reasoningSteps, intent, steps),
        status: 'draft',
      }

      this.plans.set(planId, plan)

      // 활동 로깅
      await MemoryAgent.logActivity({
        timestamp: Date.now(),
        type: 'plan_create',
        action: `작업 계획 생성: ${intent.primaryGoal}`,
        input: request,
        output: { planId, stepCount: steps.length },
        explanation: plan.explanation,
      })

      const processingTime = Date.now() - startTime

      return {
        data: plan,
        explanation: plan.explanation,
        confidence: this.calculateConfidence(intent, steps, memories),
        processingTime,
      }
    } catch (error) {
      const errorExplanation = this.buildErrorExplanation(error, reasoningSteps)

      return {
        data: null as any,
        explanation: errorExplanation,
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── 계획 수정 ──

  async modifyPlan(
    planId: string,
    modifications: PlanModification[]
  ): Promise<AgentResponse<TaskPlan>> {
    const startTime = Date.now()
    const plan = this.plans.get(planId)

    if (!plan) {
      throw new Error(`계획을 찾을 수 없음: ${planId}`)
    }

    const reasoningSteps: ReasoningStep[] = []

    for (const mod of modifications) {
      switch (mod.type) {
        case 'add':
          if (mod.newStep) {
            const step: TaskStep = {
              id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              order: plan.steps.length,
              name: mod.newStep.name || '새 단계',
              description: mod.newStep.description || '',
              assignedAgent: mod.newStep.assignedAgent || 'default',
              nodeType: mod.newStep.nodeType || 'control.script',
              nodeConfig: mod.newStep.nodeConfig || {},
              dependencies: mod.newStep.dependencies || [],
              estimatedDuration: mod.newStep.estimatedDuration || 1000,
              status: 'pending',
            }
            plan.steps.push(step)
            reasoningSteps.push({
              step: reasoningSteps.length + 1,
              action: '단계 추가',
              rationale: `사용자 요청에 따라 "${step.name}" 단계 추가`,
              input: mod,
              output: step,
              duration: 0,
            })
          }
          break

        case 'remove':
          if (mod.stepId) {
            const idx = plan.steps.findIndex(s => s.id === mod.stepId)
            if (idx >= 0) {
              const removed = plan.steps.splice(idx, 1)[0]
              reasoningSteps.push({
                step: reasoningSteps.length + 1,
                action: '단계 제거',
                rationale: `사용자 요청에 따라 "${removed.name}" 단계 제거`,
                input: mod,
                output: removed,
                duration: 0,
              })
            }
          }
          break

        case 'modify':
          if (mod.stepId && mod.newStep) {
            const step = plan.steps.find(s => s.id === mod.stepId)
            if (step) {
              Object.assign(step, mod.newStep)
              reasoningSteps.push({
                step: reasoningSteps.length + 1,
                action: '단계 수정',
                rationale: `사용자 요청에 따라 "${step.name}" 단계 수정`,
                input: mod,
                output: step,
                duration: 0,
              })
            }
          }
          break

        case 'reorder':
          if (mod.stepId && mod.newOrder !== undefined) {
            const idx = plan.steps.findIndex(s => s.id === mod.stepId)
            if (idx >= 0) {
              const [step] = plan.steps.splice(idx, 1)
              plan.steps.splice(mod.newOrder, 0, step)
              // 순서 재정렬
              plan.steps.forEach((s, i) => { s.order = i })
              reasoningSteps.push({
                step: reasoningSteps.length + 1,
                action: '단계 순서 변경',
                rationale: `"${step.name}" 단계를 위치 ${mod.newOrder}로 이동`,
                input: mod,
                output: { newOrder: plan.steps.map(s => s.name) },
                duration: 0,
              })
            }
          }
          break
      }
    }

    // 수정된 계획 저장
    plan.explanation = this.buildExplanation(
      reasoningSteps,
      plan.interpretedIntent,
      plan.steps
    )
    this.plans.set(planId, plan)

    // 활동 로깅
    await MemoryAgent.logActivity({
      timestamp: Date.now(),
      type: 'plan_modify',
      action: `작업 계획 수정: ${modifications.length}개 변경`,
      input: { planId, modifications },
      output: { stepCount: plan.steps.length },
    })

    return {
      data: plan,
      explanation: plan.explanation,
      confidence: 0.9,
      processingTime: Date.now() - startTime,
    }
  }

  // ── 계획 실행 ──

  async executePlan(
    plan: TaskPlan,
    context: AgentContext
  ): Promise<AgentResponse<ExecutionResult>> {
    const startTime = Date.now()
    plan.status = 'executing'
    this.plans.set(plan.id, plan)

    const results: Record<string, any> = {}
    const errors: Error[] = []
    let completedSteps = 0

    // 활동 로깅
    await MemoryAgent.logActivity({
      timestamp: Date.now(),
      type: 'plan_approve',
      action: `작업 계획 실행 시작: ${plan.interpretedIntent.primaryGoal}`,
      input: { planId: plan.id },
    })

    try {
      // 토폴로지 정렬로 실행 순서 결정
      const executionOrder = this.topologicalSort(plan.steps)

      for (const step of executionOrder) {
        try {
          step.status = 'running'

          // 의존성 결과 수집
          const dependencies: Record<string, any> = {}
          for (const depId of step.dependencies) {
            dependencies[depId] = results[depId]
          }

          // MCP 스크립트 실행
          const result = await MCPScriptSystem.executeScript(
            step.nodeType,
            { ...step.nodeConfig, _dependencies: dependencies }
          )

          if (result.success) {
            step.status = 'completed'
            step.result = result.output
            results[step.id] = result.output
            completedSteps++
          } else {
            throw new Error(result.error)
          }
        } catch (stepError) {
          step.status = 'failed'
          errors.push(stepError as Error)

          // 오류 복구 시도
          const recovery = await this.handleError(stepError as Error, context)
          if (recovery.data.type === 'skip') {
            continue
          } else if (recovery.data.type === 'abort') {
            break
          }
        }
      }

      plan.status = errors.length === 0 ? 'completed' : 'failed'
      this.plans.set(plan.id, plan)

      // 워크플로우 패턴 학습
      await MemoryAgent.learnWorkflowPattern(
        plan.steps.map(s => s.nodeType),
        errors.length === 0,
        Date.now() - startTime
      )

      return {
        data: {
          success: errors.length === 0,
          outputs: results,
          errors,
          duration: Date.now() - startTime,
          stepsCompleted: completedSteps,
          totalSteps: plan.steps.length,
        },
        explanation: this.buildExecutionExplanation(plan, results, errors),
        confidence: completedSteps / plan.steps.length,
        processingTime: Date.now() - startTime,
      }
    } catch (error) {
      plan.status = 'failed'
      this.plans.set(plan.id, plan)

      return {
        data: {
          success: false,
          outputs: results,
          errors: [...errors, error as Error],
          duration: Date.now() - startTime,
          stepsCompleted: completedSteps,
          totalSteps: plan.steps.length,
        },
        explanation: this.buildErrorExplanation(error, []),
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  // ── 실행 모니터링 ──

  async *monitorExecution(planId: string): AsyncIterable<ExecutionProgress> {
    const plan = this.plans.get(planId)
    if (!plan) return

    while (plan.status === 'executing') {
      const completedCount = plan.steps.filter(s => s.status === 'completed').length
      const runningStep = plan.steps.find(s => s.status === 'running')

      yield {
        planId,
        currentStep: runningStep?.name || '',
        progress: completedCount / plan.steps.length,
        status: plan.status,
        message: runningStep ? `실행 중: ${runningStep.name}` : '대기 중',
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    yield {
      planId,
      currentStep: '',
      progress: 1,
      status: plan.status,
      message: plan.status === 'completed' ? '완료' : '실패',
    }
  }

  // ── 오류 복구 ──

  async handleError(
    error: Error,
    context: AgentContext
  ): Promise<AgentResponse<RecoveryAction>> {
    const startTime = Date.now()

    // 오류 분석
    const errorType = this.classifyError(error)

    let recoveryAction: RecoveryAction

    switch (errorType) {
      case 'network':
        recoveryAction = {
          type: 'retry',
          description: '네트워크 오류 - 재시도 권장',
          steps: [],
        }
        break

      case 'resource':
        recoveryAction = {
          type: 'skip',
          description: '리소스 부족 - 단계 건너뛰기',
          steps: [],
        }
        break

      case 'permission':
        recoveryAction = {
          type: 'abort',
          description: '권한 부족 - 실행 중단',
          steps: [],
        }
        break

      default:
        recoveryAction = {
          type: 'alternative',
          description: '대체 방안 실행',
          steps: [],
        }
    }

    // 오류 학습
    await MemoryAgent.store({
      type: 'episodic',
      category: 'error',
      key: `error_${errorType}_${Date.now()}`,
      value: {
        error: error.message,
        type: errorType,
        recovery: recoveryAction.type,
        context: context.workflowContext?.workflowName,
      },
      metadata: {
        source: 'orchestrator',
        context: error.stack || '',
        tags: ['error', errorType],
        verified: true,
      },
      importance: 0.8,
      relatedMemories: [],
    })

    return {
      data: recoveryAction,
      explanation: {
        id: `exp_${Date.now()}`,
        decisionType: 'error_recovery',
        reasoningSteps: [{
          step: 1,
          action: '오류 분석',
          rationale: `오류 유형: ${errorType}`,
          input: error.message,
          output: recoveryAction,
          duration: Date.now() - startTime,
        }],
        alternatives: [],
        knowledgeUsed: [],
        confidenceFactors: [],
        summary: `${errorType} 오류 발생, ${recoveryAction.type} 수행`,
      },
      confidence: 0.7,
      processingTime: Date.now() - startTime,
    }
  }

  // ── 계획을 워크플로우 노드로 변환 ──

  planToWorkflowNodes(plan: TaskPlan): { nodes: any[]; edges: any[] } {
    const nodes: any[] = []
    const edges: any[] = []

    const NODE_WIDTH = 200
    const NODE_HEIGHT = 120
    const H_GAP = 100
    const V_GAP = 60
    const START_X = 100
    const START_Y = 100

    // 레이어 할당 (의존성 기반)
    const layers = this.assignLayers(plan.steps)

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx]
      const x = START_X + layerIdx * (NODE_WIDTH + H_GAP)

      for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
        const step = layer[nodeIdx]
        const y = START_Y + nodeIdx * (NODE_HEIGHT + V_GAP)

        nodes.push({
          id: step.id,
          type: step.nodeType,
          position: { x, y },
          data: {
            label: step.name,
            description: step.description,
            config: step.nodeConfig,
            status: step.status,
            // XAI 데이터
            xai: {
              assignedAgent: step.assignedAgent,
              estimatedDuration: step.estimatedDuration,
              explanation: step.explanation,
            },
          },
        })

        // 의존성 엣지
        for (const depId of step.dependencies) {
          edges.push({
            id: `edge_${depId}_${step.id}`,
            source: depId,
            target: step.id,
            animated: true,
          })
        }
      }
    }

    return { nodes, edges }
  }

  // ── 계획 조회 ──

  getPlan(planId: string): TaskPlan | undefined {
    return this.plans.get(planId)
  }

  getAllPlans(): TaskPlan[] {
    return Array.from(this.plans.values())
  }

  // ── 내부 헬퍼 메서드 ──

  private async analyzeIntent(
    request: string,
    context: AgentContext
  ): Promise<InterpretedIntent> {
    // LLM을 사용하여 의도 분석
    const prompt = `
다음 사용자 요청을 분석하세요:
"${request}"

사용자 정보:
- 선호 모델: ${context.userProfile.preferences.preferredModel}
- 도메인 전문성: ${JSON.stringify(context.userProfile.domainExpertise)}
- 최근 패턴: ${context.userProfile.frequentPatterns.slice(0, 3).map(p => p.nodeSequence.join('->')).join(', ')}

JSON 형식으로 응답하세요:
{
  "primaryGoal": "주요 목표",
  "secondaryGoals": ["부차적 목표들"],
  "constraints": ["제약 조건들"],
  "expectedOutputs": ["기대 출력들"],
  "domain": "도메인",
  "complexity": 1-10
}
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 1024,
          temperature: 0.3,
        },
      })

      // JSON 파싱
      const jsonMatch = response.response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.warn('[OrchestratorAgent] LLM 의도 분석 실패, 기본 분석 사용:', error)
    }

    // 폴백: 기본 분석
    return {
      primaryGoal: request,
      secondaryGoals: [],
      constraints: [],
      expectedOutputs: ['결과'],
      domain: 'general',
      complexity: 5,
    }
  }

  private async fetchRelevantMemories(
    intent: InterpretedIntent,
    context: AgentContext
  ): Promise<any[]> {
    const memories = await MemoryAgent.search(intent.primaryGoal, 10)
    return memories
  }

  private async identifyTools(intent: InterpretedIntent): Promise<any[]> {
    const allTools = MCPScriptSystem.getAllScripts()
    const relevantTools = allTools.filter(tool => {
      const tags = tool.metadata.tags.join(' ').toLowerCase()
      const domain = intent.domain.toLowerCase()
      const goal = intent.primaryGoal.toLowerCase()

      return (
        tags.includes(domain) ||
        tool.description.toLowerCase().includes(goal.slice(0, 20)) ||
        tool.category === 'llm' ||
        tool.category === 'data'
      )
    })

    return relevantTools.length > 0 ? relevantTools : allTools.slice(0, 10)
  }

  private async generateSteps(
    intent: InterpretedIntent,
    tools: any[],
    memories: any[],
    context: AgentContext
  ): Promise<TaskStep[]> {
    // LLM을 사용하여 단계 생성
    const prompt = `
다음 작업을 실행 단계로 분해하세요:
목표: ${intent.primaryGoal}
부차 목표: ${intent.secondaryGoals.join(', ')}
제약: ${intent.constraints.join(', ')}

사용 가능한 도구:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

JSON 배열로 응답하세요:
[
  {
    "name": "단계 이름",
    "description": "설명",
    "nodeType": "도구 이름 (위 목록에서)",
    "nodeConfig": {},
    "dependencies": ["의존하는 단계 ID"],
    "estimatedDuration": 1000
  }
]
`

    try {
      const response = await invoke<any>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
          temperature: 0.5,
        },
      })

      const jsonMatch = response.response.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return parsed.map((step: any, idx: number) => ({
          id: `step_${idx}_${Date.now()}`,
          order: idx,
          name: step.name,
          description: step.description,
          assignedAgent: 'orchestrator',
          nodeType: step.nodeType || 'control.script',
          nodeConfig: step.nodeConfig || {},
          dependencies: step.dependencies || (idx > 0 ? [`step_${idx - 1}_${Date.now()}`] : []),
          estimatedDuration: step.estimatedDuration || 1000,
          status: 'pending' as const,
        }))
      }
    } catch (error) {
      console.warn('[OrchestratorAgent] LLM 단계 생성 실패, 기본 단계 사용:', error)
    }

    // 폴백: 기본 단계
    return [
      {
        id: `step_0_${Date.now()}`,
        order: 0,
        name: '입력 처리',
        description: '사용자 입력을 처리합니다',
        assignedAgent: 'orchestrator',
        nodeType: 'data.file-loader',
        nodeConfig: {},
        dependencies: [],
        estimatedDuration: 1000,
        status: 'pending',
      },
      {
        id: `step_1_${Date.now()}`,
        order: 1,
        name: 'LLM 처리',
        description: 'LLM을 호출하여 처리합니다',
        assignedAgent: 'orchestrator',
        nodeType: 'ai.llm-invoke',
        nodeConfig: { prompt: intent.primaryGoal },
        dependencies: [`step_0_${Date.now()}`],
        estimatedDuration: 5000,
        status: 'pending',
      },
      {
        id: `step_2_${Date.now()}`,
        order: 2,
        name: '결과 출력',
        description: '결과를 출력합니다',
        assignedAgent: 'orchestrator',
        nodeType: 'viz.result-viewer',
        nodeConfig: {},
        dependencies: [`step_1_${Date.now()}`],
        estimatedDuration: 500,
        status: 'pending',
      },
    ]
  }

  private analyzeRisks(steps: TaskStep[], intent: InterpretedIntent): Risk[] {
    const risks: Risk[] = []

    // LLM 의존성 위험
    const llmSteps = steps.filter(s => s.nodeType.startsWith('ai.'))
    if (llmSteps.length > 0) {
      risks.push({
        type: 'api_dependency',
        description: 'LLM API 호출 실패 가능성',
        probability: 0.1,
        impact: 0.8,
        mitigation: '재시도 로직 및 폴백 응답 준비',
      })
    }

    // 파일 작업 위험
    const fileSteps = steps.filter(s => s.nodeType.includes('file') || s.nodeType.includes('storage'))
    if (fileSteps.length > 0) {
      risks.push({
        type: 'file_operation',
        description: '파일 접근/쓰기 권한 문제',
        probability: 0.15,
        impact: 0.6,
        mitigation: '사전 권한 확인 및 임시 파일 사용',
      })
    }

    // 복잡도 위험
    if (intent.complexity > 7) {
      risks.push({
        type: 'complexity',
        description: '작업 복잡도로 인한 예상치 못한 오류',
        probability: 0.3,
        impact: 0.5,
        mitigation: '단계별 검증 및 중간 결과 저장',
      })
    }

    return risks
  }

  private async generateAlternatives(
    intent: InterpretedIntent,
    steps: TaskStep[],
    context: AgentContext
  ): Promise<Alternative[]> {
    return [
      {
        description: '단순화된 접근법',
        rejectionReason: '결과 품질이 낮을 수 있음',
        expectedOutcome: '빠른 실행, 낮은 정확도',
        score: 0.6,
      },
      {
        description: '수동 개입 포함',
        rejectionReason: '사용자 입력 대기 필요',
        expectedOutcome: '높은 정확도, 느린 실행',
        score: 0.7,
      },
    ]
  }

  private identifyResources(steps: TaskStep[]): Resource[] {
    const resources: Resource[] = []

    // API 리소스
    resources.push({
      type: 'api',
      name: 'LLM API',
      required: steps.some(s => s.nodeType.startsWith('ai.')),
      available: true,
    })

    // 파일 시스템
    resources.push({
      type: 'file',
      name: '로컬 파일 시스템',
      required: steps.some(s => s.nodeType.includes('file')),
      available: true,
    })

    // 메모리
    resources.push({
      type: 'memory',
      name: '메모리 시스템',
      required: true,
      available: true,
    })

    return resources
  }

  private buildExplanation(
    reasoningSteps: ReasoningStep[],
    intent: InterpretedIntent,
    steps: TaskStep[]
  ): XAIExplanation {
    return {
      id: `exp_${Date.now()}`,
      decisionType: 'task_planning',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [
        {
          factor: '의도 명확성',
          contribution: intent.complexity < 5 ? 0.3 : -0.1,
          explanation: `복잡도 ${intent.complexity}/10`,
        },
        {
          factor: '도구 가용성',
          contribution: 0.2,
          explanation: '필요한 도구 사용 가능',
        },
      ],
      summary: `"${intent.primaryGoal}" 작업을 ${steps.length}개 단계로 분해하여 계획을 생성했습니다.`,
      visualizationData: {
        type: 'flowchart',
        nodes: steps.map(s => ({
          id: s.id,
          label: s.name,
          type: s.nodeType,
          data: { status: s.status },
        })),
        edges: steps.slice(1).map((s, i) => ({
          source: steps[i].id,
          target: s.id,
        })),
      },
    }
  }

  private buildExecutionExplanation(
    plan: TaskPlan,
    results: Record<string, any>,
    errors: Error[]
  ): XAIExplanation {
    return {
      id: `exp_exec_${Date.now()}`,
      decisionType: 'execution_result',
      reasoningSteps: plan.steps.map((s, i) => ({
        step: i + 1,
        action: s.name,
        rationale: s.description,
        input: s.nodeConfig,
        output: results[s.id],
        duration: s.estimatedDuration,
      })),
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [],
      summary: errors.length === 0
        ? `${plan.steps.length}개 단계 모두 성공적으로 완료`
        : `${plan.steps.length}개 중 ${errors.length}개 단계에서 오류 발생`,
    }
  }

  private buildErrorExplanation(error: any, reasoningSteps: ReasoningStep[]): XAIExplanation {
    return {
      id: `exp_err_${Date.now()}`,
      decisionType: 'error',
      reasoningSteps,
      alternatives: [],
      knowledgeUsed: [],
      confidenceFactors: [],
      summary: `오류 발생: ${error?.message || error}`,
    }
  }

  private calculateConfidence(
    intent: InterpretedIntent,
    steps: TaskStep[],
    memories: any[]
  ): number {
    let confidence = 0.5

    // 복잡도에 따른 조정
    confidence -= (intent.complexity - 5) * 0.05

    // 관련 기억이 있으면 증가
    if (memories.length > 0) {
      confidence += Math.min(0.2, memories.length * 0.02)
    }

    // 단계 수에 따른 조정
    if (steps.length <= 5) {
      confidence += 0.1
    } else if (steps.length > 10) {
      confidence -= 0.1
    }

    return Math.max(0, Math.min(1, confidence))
  }

  private classifyError(error: Error): string {
    const message = error.message.toLowerCase()

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return 'permission'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'resource'
    }
    if (message.includes('invalid') || message.includes('parse')) {
      return 'validation'
    }

    return 'unknown'
  }

  private assignLayers(steps: TaskStep[]): TaskStep[][] {
    const layers: TaskStep[][] = []
    const stepMap = new Map(steps.map(s => [s.id, s]))
    const assigned = new Set<string>()

    while (assigned.size < steps.length) {
      const layer: TaskStep[] = []

      for (const step of steps) {
        if (assigned.has(step.id)) continue

        // 모든 의존성이 이전 레이어에 있는지 확인
        const depsAssigned = step.dependencies.every(d => assigned.has(d))
        if (depsAssigned) {
          layer.push(step)
        }
      }

      if (layer.length === 0) {
        // 순환 의존성 - 나머지 모두 추가
        for (const step of steps) {
          if (!assigned.has(step.id)) {
            layer.push(step)
          }
        }
      }

      for (const step of layer) {
        assigned.add(step.id)
      }

      layers.push(layer)
    }

    return layers
  }

  private topologicalSort(steps: TaskStep[]): TaskStep[] {
    const layers = this.assignLayers(steps)
    return layers.flat()
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const OrchestratorAgent = new OrchestratorAgentImpl()
