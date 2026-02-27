// @ts-nocheck
/**
 * RL Simulation System - 강화학습 시뮬레이션 메인 오케스트레이터
 *
 * 20,000건 성공 목표를 향한 실제 워크플로우 생성 및 실행 시뮬레이션
 *
 * 중요: 이 시스템은 실제 LLM 호출, 실제 워크플로우 실행을 수행합니다.
 * Mock이나 가상 환경이 아닌, 실제 사용자와 동일한 환경에서 동작합니다.
 */

// UUID 생성 함수 (crypto API 사용)
function uuidv4(): string {
  return crypto.randomUUID()
}
import { RLLogger, rlLogger } from './RLLogger'
import { ExperienceBuffer, experienceBuffer, createState, createExperienceMetadata } from './ExperienceBuffer'
import { RewardCalculator, rewardCalculator } from './RewardCalculator'
import { PolicyNetwork, policyNetwork } from './PolicyNetwork'
import { SupervisorAgent, supervisorAgent } from './SupervisorAgent'
import { MultiTurnHandler, multiTurnHandler } from './MultiTurnHandler'
import type {
  RLSimulationConfig,
  SimulationResult,
  SimulationMetrics,
  Checkpoint,
  LoopResult,
  State,
  Strategy,
  SuccessChecklist,
  WorkflowSnapshot,
  ExecutionSnapshot,
  PromptFeatures,
  ComplexPromptTemplate,
  RLGuardrailConfig,
  APIUsageStats,
  LearningDataQuery,
  LearningDataExport,
  LearningDataImportResult,
  DeveloperSimulationControl,
  Experience,
} from '../types/RLTypes'
import {
  DEFAULT_RL_CONFIG,
  DEFAULT_GUARDRAIL_CONFIG,
  createInitialUsageStats,
} from '../types/RLTypes'

// ============================================================
// Types
// ============================================================

interface SimulationState {
  isRunning: boolean
  isPaused: boolean
  isCooldown: boolean
  successCount: number
  totalAttempts: number
  currentBatch: number
  startTime: Date
  lastCheckpointId: string | null
  errors: string[]
  warnings: string[]
}

interface WorkflowAgent {
  generateWorkflow(prompt: string, strategy: string): Promise<{
    workflow: WorkflowSnapshot | null
    xaiScore: number
    intentScore: number
  }>
}

interface ExecutionEngine {
  execute(workflow: WorkflowSnapshot): Promise<ExecutionSnapshot>
}

// ============================================================
// Guardrail Manager (API 사용량 제한 및 비용 관리)
// ============================================================

class GuardrailManager {
  private config: RLGuardrailConfig
  private usage: APIUsageStats
  private minuteResetInterval: ReturnType<typeof setInterval> | null = null
  private hourResetInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: RLGuardrailConfig = DEFAULT_GUARDRAIL_CONFIG) {
    this.config = config
    this.usage = createInitialUsageStats()
    this.startResetTimers()
  }

  private startResetTimers(): void {
    // 분당 리셋
    this.minuteResetInterval = setInterval(() => {
      this.usage.callsThisMinute = 0
    }, 60 * 1000)

    // 시간당 리셋
    this.hourResetInterval = setInterval(() => {
      this.usage.callsThisHour = 0
      this.usage.costThisHour = 0
    }, 60 * 60 * 1000)
  }

  stopTimers(): void {
    if (this.minuteResetInterval) clearInterval(this.minuteResetInterval)
    if (this.hourResetInterval) clearInterval(this.hourResetInterval)
  }

  /**
   * API 호출 전 체크 - 호출 가능 여부 반환
   */
  canMakeAPICall(): { allowed: boolean; reason?: string } {
    // 쿨다운 체크
    if (this.usage.cooldownUntil && new Date() < this.usage.cooldownUntil) {
      const remaining = Math.ceil((this.usage.cooldownUntil.getTime() - Date.now()) / 1000 / 60)
      return { allowed: false, reason: `쿨다운 중 (${remaining}분 남음)` }
    }

    // 분당 제한
    if (this.usage.callsThisMinute >= this.config.maxAPICallsPerMinute) {
      return { allowed: false, reason: `분당 호출 제한 도달 (${this.config.maxAPICallsPerMinute}/분)` }
    }

    // 시간당 제한
    if (this.usage.callsThisHour >= this.config.maxAPICallsPerHour) {
      return { allowed: false, reason: `시간당 호출 제한 도달 (${this.config.maxAPICallsPerHour}/시간)` }
    }

    // 일일 제한
    if (this.usage.callsThisDay >= this.config.maxAPICallsPerDay) {
      return { allowed: false, reason: `일일 호출 제한 도달 (${this.config.maxAPICallsPerDay}/일)` }
    }

    // 시간당 비용 제한
    if (this.usage.costThisHour >= this.config.maxCostPerHour) {
      return { allowed: false, reason: `시간당 비용 제한 도달 ($${this.config.maxCostPerHour}/시간)` }
    }

    // 일일 비용 제한
    if (this.usage.costThisDay >= this.config.maxCostPerDay) {
      return { allowed: false, reason: `일일 비용 제한 도달 ($${this.config.maxCostPerDay}/일)` }
    }

    return { allowed: true }
  }

  /**
   * API 호출 기록
   */
  recordAPICall(success: boolean, estimatedCost?: number): void {
    const cost = estimatedCost ?? this.config.estimatedCostPerCall

    this.usage.callsThisMinute++
    this.usage.callsThisHour++
    this.usage.callsThisDay++
    this.usage.costThisHour += cost
    this.usage.costThisDay += cost
    this.usage.lastCallTime = new Date()

    if (success) {
      this.usage.consecutiveFailures = 0
    } else {
      this.usage.consecutiveFailures++

      // 연속 실패 시 쿨다운
      if (this.usage.consecutiveFailures >= this.config.pauseOnConsecutiveFailures) {
        this.activateCooldown()
      }
    }

    this.usage.isRateLimited = !this.canMakeAPICall().allowed
  }

  /**
   * 쿨다운 활성화
   */
  activateCooldown(): void {
    this.usage.cooldownUntil = new Date(Date.now() + this.config.cooldownMinutes * 60 * 1000)
    this.usage.isRateLimited = true
    console.warn(`[Guardrail] 쿨다운 활성화: ${this.config.cooldownMinutes}분`)
  }

  /**
   * 쿨다운 해제
   */
  clearCooldown(): void {
    this.usage.cooldownUntil = null
    this.usage.consecutiveFailures = 0
    this.usage.isRateLimited = !this.canMakeAPICall().allowed
  }

  /**
   * 경고 체크
   */
  getWarnings(): string[] {
    const warnings: string[] = []
    const threshold = this.config.warnAtUsagePercent / 100

    if (this.usage.callsThisHour / this.config.maxAPICallsPerHour >= threshold) {
      warnings.push(`시간당 API 호출 ${(this.usage.callsThisHour / this.config.maxAPICallsPerHour * 100).toFixed(0)}% 사용`)
    }
    if (this.usage.callsThisDay / this.config.maxAPICallsPerDay >= threshold) {
      warnings.push(`일일 API 호출 ${(this.usage.callsThisDay / this.config.maxAPICallsPerDay * 100).toFixed(0)}% 사용`)
    }
    if (this.usage.costThisHour / this.config.maxCostPerHour >= threshold) {
      warnings.push(`시간당 비용 ${(this.usage.costThisHour / this.config.maxCostPerHour * 100).toFixed(0)}% 사용`)
    }
    if (this.usage.costThisDay / this.config.maxCostPerDay >= threshold) {
      warnings.push(`일일 비용 ${(this.usage.costThisDay / this.config.maxCostPerDay * 100).toFixed(0)}% 사용`)
    }

    return warnings
  }

  /**
   * 사용량 통계 조회
   */
  getUsageStats(): APIUsageStats {
    return { ...this.usage }
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<RLGuardrailConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 일일 카운터 리셋 (수동)
   */
  resetDailyCounters(): void {
    this.usage.callsThisDay = 0
    this.usage.costThisDay = 0
    this.usage.lastResetTime = new Date()
    console.log('[Guardrail] 일일 카운터 리셋됨')
  }

  /**
   * 전체 리셋
   */
  reset(): void {
    this.usage = createInitialUsageStats()
    console.log('[Guardrail] 전체 리셋됨')
  }
}

// ============================================================
// Complex Prompt Generator
// ============================================================

const COMPLEX_PROMPTS: ComplexPromptTemplate[] = [
  // 문서 처리
  {
    id: 'doc_1',
    category: 'document_processing',
    template: '여러 {file_type} 파일을 읽어서 각각 텍스트 추출하고, 중요 내용만 필터링해서 {output_format}으로 정리해줘.',
    variables: ['file_type', 'output_format'],
    complexity: 3,
    expectedNodeTypes: ['file.list', 'doc.pdf-parse', 'llm.summarize', 'export.xlsx'],
    expectedMinNodes: 4,
    expectedMaxNodes: 8,
  },
  {
    id: 'doc_2',
    category: 'document_processing',
    template: '{document_count}개의 보고서 파일에서 핵심 데이터를 추출해서 통합 요약본을 만들어줘. 각 보고서별 주요 지표도 함께 정리해줘.',
    variables: ['document_count'],
    complexity: 4,
    expectedNodeTypes: ['file.list', 'doc.pdf-parse', 'llm.structured', 'json.merge', 'llm.summarize'],
    expectedMinNodes: 5,
    expectedMaxNodes: 10,
  },

  // 데이터 변환
  {
    id: 'data_1',
    category: 'data_transformation',
    template: 'CSV 파일 {count}개를 읽어서 공통 컬럼 기준으로 병합하고, 결측치는 {fill_method}으로 채우고, 통계 요약본과 차트도 같이 생성해줘.',
    variables: ['count', 'fill_method'],
    complexity: 4,
    expectedNodeTypes: ['file.list', 'csv.parse', 'csv.merge', 'csv.transform', 'viz.chart', 'viz.stats'],
    expectedMinNodes: 5,
    expectedMaxNodes: 10,
  },
  {
    id: 'data_2',
    category: 'data_transformation',
    template: 'JSON 데이터에서 {target_field} 필드만 추출해서 배열로 만들고, 중복 제거한 후 정렬해서 새 파일로 저장해줘.',
    variables: ['target_field'],
    complexity: 2,
    expectedNodeTypes: ['file.read', 'json.query', 'json.stringify', 'file.write'],
    expectedMinNodes: 3,
    expectedMaxNodes: 6,
  },

  // RAG 파이프라인
  {
    id: 'rag_1',
    category: 'rag_pipeline',
    template: '우리 회사 문서들을 벡터 DB에 넣고, 사용자 질문에 맞는 문서를 검색해서 컨텍스트 기반으로 답변 생성하는 RAG 파이프라인 만들어줘.',
    variables: [],
    complexity: 5,
    expectedNodeTypes: ['file.list', 'doc.pdf-parse', 'rag.chunk', 'llm.embed', 'rag.store', 'rag.search', 'llm.chat'],
    expectedMinNodes: 6,
    expectedMaxNodes: 12,
  },
  {
    id: 'rag_2',
    category: 'rag_pipeline',
    template: '{topic} 관련 문서만 필터링해서 RAG 시스템을 구축하고, 질문에 대해 {response_style} 스타일로 답변하도록 해줘.',
    variables: ['topic', 'response_style'],
    complexity: 4,
    expectedNodeTypes: ['file.list', 'rag.ingest', 'rag.search', 'prompt.template', 'llm.chat'],
    expectedMinNodes: 5,
    expectedMaxNodes: 9,
  },

  // 조건부 분기
  {
    id: 'conditional_1',
    category: 'conditional_logic',
    template: '이메일 내용을 분석해서 긍정적이면 감사 답장, 부정적이면 사과 답장을 자동 생성해줘. 답장 템플릿은 기존 것 참고하고.',
    variables: [],
    complexity: 4,
    expectedNodeTypes: ['llm.classify', 'control.if', 'prompt.template', 'llm.chat'],
    expectedMinNodes: 4,
    expectedMaxNodes: 8,
  },
  {
    id: 'conditional_2',
    category: 'conditional_logic',
    template: '문서의 {criteria}에 따라 A/B/C 등급으로 분류하고, 각 등급별로 다른 처리를 수행해줘. A는 요약, B는 전체 텍스트, C는 스킵.',
    variables: ['criteria'],
    complexity: 4,
    expectedNodeTypes: ['llm.classify', 'control.switch', 'llm.summarize'],
    expectedMinNodes: 4,
    expectedMaxNodes: 10,
  },

  // 다중 파일 처리
  {
    id: 'multi_file_1',
    category: 'multi_file',
    template: '{folder_path} 폴더의 모든 파일을 처리해서, 각 파일별로 요약하고, 전체 통합 보고서도 만들어줘. 엑셀로 정리해서 저장해줘.',
    variables: ['folder_path'],
    complexity: 4,
    expectedNodeTypes: ['file.list', 'control.foreach', 'llm.summarize', 'json.merge', 'export.xlsx'],
    expectedMinNodes: 5,
    expectedMaxNodes: 10,
  },

  // API 통합
  {
    id: 'api_1',
    category: 'api_integration',
    template: '{api_name} API에서 데이터를 가져와서 가공하고, 결과를 우리 DB에 저장해줘.',
    variables: ['api_name'],
    complexity: 3,
    expectedNodeTypes: ['http.get', 'json.query', 'storage.kv-set'],
    expectedMinNodes: 3,
    expectedMaxNodes: 6,
  },

  // 이미지/비전
  {
    id: 'vision_1',
    category: 'vision',
    template: '이미지 파일들을 분석해서 각 이미지에 있는 텍스트를 추출하고, 분류해줘.',
    variables: [],
    complexity: 4,
    expectedNodeTypes: ['file.list', 'vision.ocr', 'llm.classify', 'json.stringify'],
    expectedMinNodes: 4,
    expectedMaxNodes: 8,
  },

  // 보고서 생성
  {
    id: 'report_1',
    category: 'report_generation',
    template: '주어진 데이터를 분석해서 {report_type} 보고서를 작성해줘. 차트와 테이블도 포함하고, PDF로 내보내줘.',
    variables: ['report_type'],
    complexity: 4,
    expectedNodeTypes: ['csv.parse', 'llm.structured', 'viz.chart', 'viz.table', 'export.pdf'],
    expectedMinNodes: 4,
    expectedMaxNodes: 9,
  },

  // 배치 처리
  {
    id: 'batch_1',
    category: 'batch_processing',
    template: '{count}개의 항목을 {batch_size}개씩 나눠서 처리하고, 각 배치 결과를 병합해줘. 실패한 항목은 따로 기록해줘.',
    variables: ['count', 'batch_size'],
    complexity: 4,
    expectedNodeTypes: ['control.loop', 'control.parallel', 'json.merge', 'control.if'],
    expectedMinNodes: 5,
    expectedMaxNodes: 10,
  },
]

// 다중 턴 프롬프트
const MULTI_TURN_PROMPTS: Array<{ initial: string; followUp: string }> = [
  {
    initial: 'PDF 파일을 읽어서 텍스트를 추출하고 요약해줘',
    followUp: '아까 만든 워크플로우에서 요약 노드를 번역 노드로 바꿔줘',
  },
  {
    initial: 'CSV 데이터를 분석해서 차트로 시각화해줘',
    followUp: '거기에 테이블 출력도 추가해줘',
  },
  {
    initial: 'JSON 파일을 파싱해서 특정 필드만 추출해줘',
    followUp: '추출한 결과를 정렬해서 새 파일로 저장하도록 수정해줘',
  },
]

// ============================================================
// RL Simulation System Class
// ============================================================

export class RLSimulationSystem {
  private config: RLSimulationConfig
  private state: SimulationState
  private logger: RLLogger
  private buffer: ExperienceBuffer
  private rewardCalc: RewardCalculator
  private policy: PolicyNetwork
  private supervisor: SupervisorAgent
  private multiTurn: MultiTurnHandler
  private guardrail: GuardrailManager

  // 실제 에이전트와 엔진 (외부에서 주입)
  private workflowAgent: WorkflowAgent | null = null
  private executionEngine: ExecutionEngine | null = null

  // 이벤트 콜백
  private onProgress?: (state: SimulationState) => void
  private onLoopComplete?: (result: LoopResult) => void
  private onCheckpoint?: (checkpoint: Checkpoint) => void
  private onError?: (error: Error) => void
  private onGuardrailWarning?: (warnings: string[]) => void

  constructor(config: Partial<RLSimulationConfig> = {}) {
    this.config = {
      ...DEFAULT_RL_CONFIG,
      ...config,
      guardrails: {
        ...DEFAULT_GUARDRAIL_CONFIG,
        ...(config.guardrails || {}),
      },
    }

    this.state = {
      isRunning: false,
      isPaused: false,
      isCooldown: false,
      successCount: 0,
      totalAttempts: 0,
      currentBatch: 0,
      startTime: new Date(),
      lastCheckpointId: null,
      errors: [],
      warnings: [],
    }

    // 가드레일 매니저 초기화
    this.guardrail = new GuardrailManager(this.config.guardrails)

    this.logger = rlLogger
    this.buffer = experienceBuffer
    this.rewardCalc = rewardCalculator
    this.policy = policyNetwork
    this.supervisor = supervisorAgent
    this.multiTurn = multiTurnHandler
  }

  // ============================================================
  // Dependency Injection
  // ============================================================

  /**
   * 실제 워크플로우 에이전트 설정 (IntegratedWorkflowAgent)
   */
  setWorkflowAgent(agent: WorkflowAgent): void {
    this.workflowAgent = agent
  }

  /**
   * 실제 실행 엔진 설정 (ExecutionEngine)
   */
  setExecutionEngine(engine: ExecutionEngine): void {
    this.executionEngine = engine
  }

  /**
   * 이벤트 핸들러 설정
   */
  setEventHandlers(handlers: {
    onProgress?: (state: SimulationState) => void
    onLoopComplete?: (result: LoopResult) => void
    onCheckpoint?: (checkpoint: Checkpoint) => void
    onError?: (error: Error) => void
  }): void {
    this.onProgress = handlers.onProgress
    this.onLoopComplete = handlers.onLoopComplete
    this.onCheckpoint = handlers.onCheckpoint
    this.onError = handlers.onError
  }

  // ============================================================
  // Main Simulation Loop
  // ============================================================

  /**
   * 시뮬레이션 시작 (20,000건 목표)
   */
  async runSimulation(): Promise<SimulationResult> {
    if (!this.workflowAgent || !this.executionEngine) {
      throw new Error('워크플로우 에이전트와 실행 엔진을 먼저 설정해야 합니다.')
    }

    await this.logger.init()

    // 이전 체크포인트에서 복원 시도
    await this.tryRestore()

    this.state.isRunning = true
    this.state.startTime = new Date()

    console.log(`[RLSimulation] 시뮬레이션 시작 - 목표: ${this.config.targetSuccesses}건`)
    console.log(`[RLSimulation] 현재 진행: ${this.state.successCount}/${this.config.targetSuccesses}`)
    console.log(`[RLSimulation] 가드레일: 분당 ${this.config.guardrails.maxAPICallsPerMinute}회, 시간당 $${this.config.guardrails.maxCostPerHour}`)

    try {
      while (this.state.successCount < this.config.targetSuccesses && this.state.isRunning) {
        // 일시정지 체크
        if (this.state.isPaused) {
          await this.waitForResume()
          continue
        }

        // 🛡️ 가드레일 체크
        const guardrailCheck = this.guardrail.canMakeAPICall()
        if (!guardrailCheck.allowed) {
          console.warn(`[RLSimulation] 가드레일 제한: ${guardrailCheck.reason}`)
          this.state.isCooldown = true
          this.state.warnings.push(guardrailCheck.reason || '가드레일 제한')

          // 쿨다운 대기 (1분)
          await this.sleep(60000)
          continue
        }
        this.state.isCooldown = false

        // 🛡️ 경고 체크
        const warnings = this.guardrail.getWarnings()
        if (warnings.length > 0) {
          this.state.warnings = warnings
          this.onGuardrailWarning?.(warnings)
        }

        // 프롬프트 선택 (다양성 유지)
        const { prompt, isMultiTurn, sessionId } = this.selectPrompt()

        // 루프 실행
        const result = await this.executeLoop(prompt, isMultiTurn, sessionId)

        // 🛡️ API 사용량 기록
        this.guardrail.recordAPICall(result.success)

        // 카운트 업데이트 (실패해도 누적 유지, 리셋 안 함)
        this.state.totalAttempts++
        if (result.success) {
          this.state.successCount++
        }

        // 콜백
        this.onLoopComplete?.(result)
        this.onProgress?.(this.state)

        // 진행 상황 로그 (100건마다)
        if (this.state.totalAttempts % 100 === 0) {
          const rate = (this.state.successCount / this.state.totalAttempts * 100).toFixed(2)
          const usage = this.guardrail.getUsageStats()
          console.log(`[RLSimulation] 진행: ${this.state.successCount}/${this.state.totalAttempts} (${rate}% 성공률)`)
          console.log(`[RLSimulation] API 사용: ${usage.callsThisHour}/${this.config.guardrails.maxAPICallsPerHour}회, $${usage.costThisHour.toFixed(2)}/${this.config.guardrails.maxCostPerHour}`)
        }

        // 체크포인트 (설정된 간격마다)
        if (this.state.totalAttempts % this.config.checkpointInterval === 0) {
          await this.createCheckpoint()
        }

        // 배치 완료 시 학습
        if (this.state.totalAttempts % this.config.batchSize === 0) {
          await this.batchLearn()
          this.state.currentBatch++
        }
      }

      // 최종 체크포인트
      await this.createCheckpoint()

      return this.createSimulationResult()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.onError?.(err)
      this.state.errors.push(err.message)

      // 에러 시에도 체크포인트 저장 (영속성 보장)
      await this.createCheckpoint()

      throw error
    } finally {
      this.state.isRunning = false
      this.guardrail.stopTimers()
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 단일 루프 실행
   */
  private async executeLoop(
    prompt: string,
    isMultiTurn: boolean,
    sessionId?: string
  ): Promise<LoopResult> {
    const loopId = uuidv4()
    const startTime = Date.now()

    try {
      // 1. 상태 캡처
      const state = await this.captureState(prompt)

      // 2. 전략 선택 (ε-greedy)
      const strategy = this.policy.selectStrategy(state) as Strategy

      // 3. 워크플로우 생성 (실제 LLM 호출)
      const { workflow, xaiScore, intentScore } = await this.workflowAgent!.generateWorkflow(prompt, strategy)

      if (!workflow) {
        return this.createFailureResult(loopId, prompt, strategy, startTime, '워크플로우 생성 실패')
      }

      // 4. 워크플로우 실행 (실제 실행)
      const executionResult = await this.executeWithTimeout(workflow)

      // 5. 12-Point 체크리스트 검증
      const checklist = this.evaluateChecklist(workflow, executionResult, xaiScore, intentScore)

      // 6. NotebookLM 비교 점수 계산
      const notebookLMScore = this.calculateNotebookLMScore(checklist)

      // 7. 성공 여부 결정
      const success = this.isSuccessful(checklist)

      // 8. 루프 결과 생성
      const result: LoopResult = {
        id: loopId,
        prompt,
        workflow,
        executionResult,
        success,
        checklist,
        reward: 0,  // 나중에 계산
        xaiScore,
        notebookLMScore,
        intentAlignmentScore: intentScore,
        executionTime: Date.now() - startTime,
        nodeCount: workflow.nodes.length,
        strategy,
        timestamp: new Date(),
      }

      // 9. 보상 계산
      result.reward = this.rewardCalc.calculate(result)

      // 10. 경험 저장 (영속성)
      await this.saveExperience(state, result)

      // 11. Supervisor 학습
      await this.supervisor.learn(result)

      // 12. 정책 업데이트
      this.policy.updateWeights(strategy, result.reward, result.success)

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return this.createFailureResult(loopId, prompt, 'chain_of_thought' as Strategy, startTime, errorMsg)
    }
  }

  // ============================================================
  // Prompt Selection
  // ============================================================

  private selectPrompt(): { prompt: string; isMultiTurn: boolean; sessionId?: string } {
    // 10% 확률로 다중 턴 시나리오
    if (Math.random() < 0.1) {
      const scenario = MULTI_TURN_PROMPTS[Math.floor(Math.random() * MULTI_TURN_PROMPTS.length)]
      return {
        prompt: scenario.initial,
        isMultiTurn: true,
        sessionId: this.multiTurn.startSession(),
      }
    }

    // 템플릿에서 랜덤 선택 및 변수 채우기
    const template = COMPLEX_PROMPTS[Math.floor(Math.random() * COMPLEX_PROMPTS.length)]
    const prompt = this.instantiateTemplate(template)

    return { prompt, isMultiTurn: false }
  }

  private instantiateTemplate(template: ComplexPromptTemplate): string {
    let prompt = template.template

    const variableValues: Record<string, string[]> = {
      file_type: ['PDF', 'Word', 'Excel', 'PowerPoint', 'HWP'],
      output_format: ['엑셀', 'PDF', 'JSON', '텍스트 파일'],
      document_count: ['3', '5', '10', '20'],
      count: ['3', '5', '10'],
      fill_method: ['평균값', '중앙값', '최빈값', '0'],
      target_field: ['name', 'email', 'data', 'items', 'results'],
      topic: ['마케팅', '재무', '기술', '인사', '법률'],
      response_style: ['공식적', '친근한', '간결한', '상세한'],
      criteria: ['점수', '날짜', '중요도', '카테고리'],
      folder_path: ['documents', 'reports', 'data', 'exports'],
      api_name: ['REST', 'GraphQL', '외부 서비스'],
      report_type: ['월간', '분기별', '연간', '프로젝트'],
      batch_size: ['10', '50', '100'],
    }

    for (const variable of template.variables) {
      const values = variableValues[variable] || ['기본값']
      const value = values[Math.floor(Math.random() * values.length)]
      prompt = prompt.replace(`{${variable}}`, value)
    }

    return prompt
  }

  // ============================================================
  // State & Evaluation
  // ============================================================

  private async captureState(prompt: string): Promise<State> {
    const features = this.analyzePromptFeatures(prompt)
    const recentExp = this.buffer.getRecent(10)

    return createState(features, {
      currentSuccessRate: this.state.successCount / Math.max(1, this.state.totalAttempts),
      recentRewards: recentExp.map(e => e.reward),
      strategyPerformance: this.policy.getWeights() as unknown as Map<Strategy, number>,
      errorPatterns: this.supervisor.getTopBugPatterns(5).map(b => b.pattern),
    })
  }

  private analyzePromptFeatures(prompt: string): PromptFeatures {
    const lower = prompt.toLowerCase()

    return {
      length: prompt.length,
      complexity: this.calculateComplexity(prompt),
      hasMultiStep: /그리고|그 다음|후에|이어서|마지막으로/.test(lower),
      hasConditional: /만약|조건|경우에|따라|분기/.test(lower),
      hasRAG: /검색|rag|벡터|임베딩|컨텍스트/.test(lower),
      hasVision: /이미지|사진|비전|ocr|시각/.test(lower),
      hasMultiTurn: /아까|방금|이전|거기|그것/.test(lower),
      domainCategory: this.detectDomainCategory(prompt),
      keywordCount: prompt.split(/\s+/).length,
      intentClarity: this.measureIntentClarity(prompt),
    }
  }

  private calculateComplexity(prompt: string): number {
    let score = 0

    // 길이 기반
    if (prompt.length > 200) score += 0.2
    if (prompt.length > 500) score += 0.1

    // 키워드 수
    const keywords = prompt.split(/\s+/).length
    if (keywords > 20) score += 0.1
    if (keywords > 50) score += 0.1

    // 복잡성 지표
    const complexPatterns = [
      /여러|다수|복수|각각/,
      /변환|추출|분석|처리/,
      /조건|분기|경우/,
      /병합|통합|결합/,
      /반복|루프|배치/,
    ]

    for (const pattern of complexPatterns) {
      if (pattern.test(prompt)) score += 0.1
    }

    return Math.min(1, score)
  }

  private detectDomainCategory(prompt: string): string {
    const lower = prompt.toLowerCase()

    if (/pdf|문서|보고서|hwp/.test(lower)) return 'document_processing'
    if (/csv|엑셀|데이터|테이블/.test(lower)) return 'data_transformation'
    if (/rag|검색|벡터|임베딩/.test(lower)) return 'rag_pipeline'
    if (/이미지|사진|비전/.test(lower)) return 'vision'
    if (/api|http|rest/.test(lower)) return 'api_integration'
    if (/조건|분기|경우/.test(lower)) return 'conditional_logic'

    return 'general'
  }

  private measureIntentClarity(prompt: string): number {
    let score = 0.5

    // 명확한 동작 동사
    if (/해줘|만들어|생성|추출|변환|분석/.test(prompt)) score += 0.2

    // 구체적인 대상
    if (/파일|데이터|문서|이미지|텍스트/.test(prompt)) score += 0.1

    // 출력 형식 명시
    if (/저장|내보내|출력|형식|포맷/.test(prompt)) score += 0.1

    // 모호한 표현
    if (/뭔가|어떻게든|대충|적당히/.test(prompt)) score -= 0.2

    return Math.max(0, Math.min(1, score))
  }

  private evaluateChecklist(
    workflow: WorkflowSnapshot,
    execution: ExecutionSnapshot | null,
    xaiScore: number,
    intentScore: number
  ): SuccessChecklist {
    const notebookLMPassing = this.calculateNotebookLMScore({
      hasValidStructure: this.hasValidStructure(workflow),
      hasRequiredNodes: workflow.nodes.length >= 2,
      hasValidConnections: this.hasValidConnections(workflow),
      hasNoOrphanNodes: !this.hasOrphanNodes(workflow),
      executionCompleted: execution ? execution.status === 'completed' : false,
      noRuntimeErrors: execution ? execution.errors.length === 0 : false,
      outputsGenerated: Boolean(execution?.outputs && Object.keys(execution.outputs).length > 0),
      withinTimeLimit: execution ? execution.duration < this.config.timeoutMs : false,
      intentAligned: intentScore >= this.config.intentThreshold,
      xaiExplainable: xaiScore >= this.config.xaiThreshold,
      notebookLMPassing: true,  // 임시
      toolSelectionOptimal: this.isToolSelectionOptimal(workflow),
    }) >= this.config.notebookLMThreshold

    return {
      hasValidStructure: this.hasValidStructure(workflow),
      hasRequiredNodes: workflow.nodes.length >= 2,
      hasValidConnections: this.hasValidConnections(workflow),
      hasNoOrphanNodes: !this.hasOrphanNodes(workflow),
      executionCompleted: execution ? execution.status === 'completed' : false,
      noRuntimeErrors: execution ? execution.errors.length === 0 : false,
      outputsGenerated: Boolean(execution?.outputs && Object.keys(execution.outputs).length > 0),
      withinTimeLimit: execution ? execution.duration < this.config.timeoutMs : false,
      intentAligned: intentScore >= this.config.intentThreshold,
      xaiExplainable: xaiScore >= this.config.xaiThreshold,
      notebookLMPassing,
      toolSelectionOptimal: this.isToolSelectionOptimal(workflow),
    }
  }

  private hasValidStructure(workflow: WorkflowSnapshot): boolean {
    if (workflow.nodes.length === 0) return false

    // DAG 검증 (사이클 체크)
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId)
      recursionStack.add(nodeId)

      const outgoingEdges = workflow.edges.filter(e => e.source === nodeId)
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          if (hasCycle(edge.target)) return true
        } else if (recursionStack.has(edge.target)) {
          return true
        }
      }

      recursionStack.delete(nodeId)
      return false
    }

    for (const node of workflow.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycle(node.id)) return false
      }
    }

    return true
  }

  private hasValidConnections(workflow: WorkflowSnapshot): boolean {
    const nodeIds = new Set(workflow.nodes.map(n => n.id))

    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        return false
      }
    }

    return true
  }

  private hasOrphanNodes(workflow: WorkflowSnapshot): boolean {
    if (workflow.nodes.length <= 1) return false

    const connectedNodes = new Set<string>()

    for (const edge of workflow.edges) {
      connectedNodes.add(edge.source)
      connectedNodes.add(edge.target)
    }

    for (const node of workflow.nodes) {
      if (!connectedNodes.has(node.id)) return true
    }

    return false
  }

  private isToolSelectionOptimal(workflow: WorkflowSnapshot): boolean {
    // 간단한 휴리스틱: 노드 타입이 다양하면 최적
    const uniqueTypes = new Set(workflow.nodes.map(n => n.type.split('.')[0]))
    return uniqueTypes.size >= Math.min(2, workflow.nodes.length)
  }

  private calculateNotebookLMScore(checklist: SuccessChecklist): number {
    const trueCount = Object.values(checklist).filter(Boolean).length
    return trueCount / 12
  }

  private isSuccessful(checklist: SuccessChecklist): boolean {
    const score = Object.values(checklist).filter(Boolean).length
    return score >= 10  // 12점 만점 중 10점 이상
  }

  // ============================================================
  // Execution
  // ============================================================

  private async executeWithTimeout(workflow: WorkflowSnapshot): Promise<ExecutionSnapshot | null> {
    try {
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), this.config.timeoutMs)
      })

      const executionPromise = this.executionEngine!.execute(workflow)

      return await Promise.race([executionPromise, timeoutPromise])
    } catch (error) {
      return {
        status: 'timeout',
        outputs: {},
        errors: [error instanceof Error ? error.message : String(error)],
        duration: this.config.timeoutMs,
      }
    }
  }

  // ============================================================
  // Learning & Persistence
  // ============================================================

  private async saveExperience(state: State, result: LoopResult): Promise<void> {
    const metadata = createExperienceMetadata(
      result.prompt,
      result.workflow?.id || '',
      result.success,
      result.checklist,
      result.executionTime,
      result.nodeCount,
      result.errorMessage
    )

    await this.buffer.add({
      state,
      action: result.strategy,
      reward: result.reward,
      nextState: null,
      metadata,
    })
  }

  private async batchLearn(): Promise<void> {
    const experiences = this.buffer.getRecent(this.config.batchSize)

    // 정책 네트워크 배치 업데이트
    this.policy.batchUpdate(
      experiences.map(e => ({
        strategy: e.action as Strategy,
        reward: e.reward,
        success: e.metadata.success,
      }))
    )

    console.log(`[RLSimulation] 배치 학습 완료 (${experiences.length}개 경험)`)
  }

  private async createCheckpoint(): Promise<void> {
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      timestamp: new Date(),
      successCount: this.state.successCount,
      totalAttempts: this.state.totalAttempts,
      policyWeights: this.policy.getWeights() as unknown as Map<Strategy, number>,
      supervisorState: this.supervisor.export(),
      experienceBufferSize: this.buffer.size,
      metrics: await this.calculateMetrics(),
    }

    await this.logger.logCheckpoint(checkpoint)
    this.state.lastCheckpointId = checkpoint.id

    this.onCheckpoint?.(checkpoint)

    console.log(`[RLSimulation] 체크포인트 저장: ${checkpoint.id}`)
  }

  private async tryRestore(): Promise<void> {
    const lastCheckpoint = await this.logger.getLastCheckpoint()

    if (lastCheckpoint) {
      this.state.successCount = lastCheckpoint.successCount
      this.state.totalAttempts = lastCheckpoint.totalAttempts
      this.state.lastCheckpointId = lastCheckpoint.id

      this.policy.import({
        weights: Object.fromEntries(lastCheckpoint.policyWeights),
      })

      this.supervisor.import(lastCheckpoint.supervisorState)

      await this.buffer.restore()

      console.log(`[RLSimulation] 체크포인트 복원: ${lastCheckpoint.id}`)
      console.log(`[RLSimulation] 복원된 진행: ${this.state.successCount}/${this.config.targetSuccesses}`)
    }
  }

  // ============================================================
  // Results & Metrics
  // ============================================================

  private async calculateMetrics(): Promise<SimulationMetrics> {
    const experiences = this.buffer.export()
    const stats = this.buffer.getStats()
    const growthMetrics = await this.supervisor.getGrowthMetrics()

    const strategyUsage: Record<string, number> = {}
    const strategySuccess: Record<string, number> = {}
    const strategyTotal: Record<string, number> = {}

    for (const exp of experiences) {
      const strategy = exp.action as string
      strategyUsage[strategy] = (strategyUsage[strategy] || 0) + 1
      strategyTotal[strategy] = (strategyTotal[strategy] || 0) + 1
      if (exp.metadata.success) {
        strategySuccess[strategy] = (strategySuccess[strategy] || 0) + 1
      }
    }

    const strategySuccessRate: Record<string, number> = {}
    for (const strategy of Object.keys(strategyTotal)) {
      strategySuccessRate[strategy] = strategyTotal[strategy] > 0
        ? (strategySuccess[strategy] || 0) / strategyTotal[strategy]
        : 0
    }

    return {
      successCount: this.state.successCount,
      totalAttempts: this.state.totalAttempts,
      successRate: stats.successRate,
      averageReward: stats.averageReward,
      averageExecutionTime: experiences.length > 0
        ? experiences.reduce((sum, e) => sum + e.metadata.executionTime, 0) / experiences.length
        : 0,
      averageNodeCount: experiences.length > 0
        ? experiences.reduce((sum, e) => sum + e.metadata.nodeCount, 0) / experiences.length
        : 0,
      strategyUsage: strategyUsage as Record<Strategy, number>,
      strategySuccessRate: strategySuccessRate as Record<Strategy, number>,
      topErrorPatterns: this.supervisor.getTopBugPatterns(5),
      xaiAverageScore: 0.75,  // TODO: 실제 계산
      notebookLMAverageScore: stats.successRate,
      intentAverageScore: 0.8,  // TODO: 실제 계산
    }
  }

  private createSimulationResult(): SimulationResult {
    return {
      success: this.state.successCount >= this.config.targetSuccesses,
      finalMetrics: {} as SimulationMetrics,  // calculateMetrics에서 채워짐
      checkpoints: [],
      totalDuration: Date.now() - this.state.startTime.getTime(),
      completedAt: new Date(),
    }
  }

  private createFailureResult(
    id: string,
    prompt: string,
    strategy: Strategy,
    startTime: number,
    errorMessage: string
  ): LoopResult {
    return {
      id,
      prompt,
      workflow: null,
      executionResult: null,
      success: false,
      checklist: {
        hasValidStructure: false,
        hasRequiredNodes: false,
        hasValidConnections: false,
        hasNoOrphanNodes: false,
        executionCompleted: false,
        noRuntimeErrors: false,
        outputsGenerated: false,
        withinTimeLimit: false,
        intentAligned: false,
        xaiExplainable: false,
        notebookLMPassing: false,
        toolSelectionOptimal: false,
      },
      reward: -3,
      xaiScore: 0,
      notebookLMScore: 0,
      intentAlignmentScore: 0,
      executionTime: Date.now() - startTime,
      nodeCount: 0,
      strategy,
      errorMessage,
      timestamp: new Date(),
    }
  }

  // ============================================================
  // Control
  // ============================================================

  pause(): void {
    this.state.isPaused = true
    console.log('[RLSimulation] 일시정지됨')
  }

  resume(): void {
    this.state.isPaused = false
    console.log('[RLSimulation] 재개됨')
  }

  stop(): void {
    this.state.isRunning = false
    console.log('[RLSimulation] 중지됨')
  }

  private async waitForResume(): Promise<void> {
    while (this.state.isPaused && this.state.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // ============================================================
  // Status
  // ============================================================

  getState(): SimulationState {
    return { ...this.state }
  }

  async getStats(): Promise<SimulationMetrics> {
    return this.calculateMetrics()
  }

  // ============================================================
  // 개발자 전용: 가드레일 관리
  // ============================================================

  /**
   * 가드레일 설정 업데이트
   */
  updateGuardrails(config: Partial<RLGuardrailConfig>): void {
    this.guardrail.updateConfig(config)
    this.config.guardrails = { ...this.config.guardrails, ...config }
    console.log('[RLSimulation] 가드레일 설정 업데이트됨')
  }

  /**
   * API 사용량 통계 조회
   */
  getAPIUsage(): APIUsageStats {
    return this.guardrail.getUsageStats()
  }

  /**
   * 쿨다운 수동 해제
   */
  clearCooldown(): void {
    this.guardrail.clearCooldown()
    this.state.isCooldown = false
    console.log('[RLSimulation] 쿨다운 해제됨')
  }

  /**
   * 일일 카운터 리셋
   */
  resetDailyCounters(): void {
    this.guardrail.resetDailyCounters()
  }

  /**
   * 긴급 중지 (가드레일)
   */
  emergencyStop(): void {
    this.state.isRunning = false
    this.guardrail.activateCooldown()
    console.warn('[RLSimulation] 긴급 중지 실행됨')
  }

  // ============================================================
  // 개발자 전용: 학습 데이터 관리 (CRUD)
  // ============================================================

  /**
   * 학습 데이터 조회
   */
  async queryExperiences(query: LearningDataQuery): Promise<Experience[]> {
    let experiences = this.buffer.export()

    // 필터 적용
    if (query.filter) {
      const f = query.filter
      experiences = experiences.filter(e => {
        if (f.success !== undefined && e.metadata.success !== f.success) return false
        if (f.strategy?.length && !f.strategy.includes(e.action as Strategy)) return false
        if (f.minReward !== undefined && e.reward < f.minReward) return false
        if (f.maxReward !== undefined && e.reward > f.maxReward) return false
        if (f.startDate && e.timestamp < f.startDate) return false
        if (f.endDate && e.timestamp > f.endDate) return false
        return true
      })
    }

    // 정렬 적용
    if (query.sort) {
      const { field, order } = query.sort
      experiences.sort((a, b) => {
        let cmp = 0
        switch (field) {
          case 'timestamp':
            cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            break
          case 'reward':
            cmp = a.reward - b.reward
            break
          case 'executionTime':
            cmp = a.metadata.executionTime - b.metadata.executionTime
            break
          case 'nodeCount':
            cmp = a.metadata.nodeCount - b.metadata.nodeCount
            break
        }
        return order === 'desc' ? -cmp : cmp
      })
    }

    // 페이지네이션 적용
    if (query.pagination) {
      const { offset, limit } = query.pagination
      experiences = experiences.slice(offset, offset + limit)
    }

    return experiences
  }

  /**
   * 특정 경험 삭제
   */
  async deleteExperience(id: string): Promise<boolean> {
    const deleted = await this.buffer.delete(id)
    if (deleted) {
      console.log(`[RLSimulation] 경험 삭제됨: ${id}`)
    }
    return deleted
  }

  /**
   * 조건에 맞는 경험 일괄 삭제
   */
  async deleteExperiencesByCondition(condition: {
    olderThan?: Date
    belowReward?: number
    failed?: boolean
  }): Promise<number> {
    const all = this.buffer.export()
    let deletedCount = 0

    for (const exp of all) {
      let shouldDelete = false

      if (condition.olderThan && new Date(exp.timestamp) < condition.olderThan) {
        shouldDelete = true
      }
      if (condition.belowReward !== undefined && exp.reward < condition.belowReward) {
        shouldDelete = true
      }
      if (condition.failed && !exp.metadata.success) {
        shouldDelete = true
      }

      if (shouldDelete) {
        await this.buffer.delete(exp.id)
        deletedCount++
      }
    }

    console.log(`[RLSimulation] ${deletedCount}개 경험 삭제됨`)
    return deletedCount
  }

  /**
   * 전체 학습 데이터 내보내기
   */
  async exportLearningData(): Promise<LearningDataExport> {
    const experiences = this.buffer.export()
    const checkpoints = await this.logger.getAllCheckpoints()
    const bugPatterns = this.supervisor.getTopBugPatterns(100)

    return {
      version: '1.0.0',
      exportedAt: new Date(),
      config: this.config,
      experiences,
      checkpoints,
      bugPatterns,
      policyWeights: this.policy.getWeights() as unknown as Record<Strategy, number>,
      stats: {
        startTime: this.state.startTime,
        currentTime: new Date(),
        runningTime: Date.now() - this.state.startTime.getTime(),
        successCount: this.state.successCount,
        totalAttempts: this.state.totalAttempts,
        successRate: this.state.totalAttempts > 0
          ? this.state.successCount / this.state.totalAttempts
          : 0,
        averageReward: this.buffer.getStats().averageReward,
        currentBatchProgress: this.state.currentBatch,
        estimatedTimeRemaining: 0,
        lastCheckpointId: this.state.lastCheckpointId,
      },
    }
  }

  /**
   * 학습 데이터 가져오기
   */
  async importLearningData(data: LearningDataExport): Promise<LearningDataImportResult> {
    const result: LearningDataImportResult = {
      success: true,
      imported: {
        experiences: 0,
        checkpoints: 0,
        bugPatterns: 0,
      },
      errors: [],
    }

    try {
      // 경험 데이터 가져오기
      for (const exp of data.experiences) {
        try {
          await this.buffer.add({
            state: exp.state,
            action: exp.action,
            reward: exp.reward,
            nextState: exp.nextState,
            metadata: exp.metadata,
          })
          result.imported.experiences++
        } catch (e) {
          result.errors.push(`경험 ${exp.id} 가져오기 실패: ${e}`)
        }
      }

      // 정책 가중치 가져오기
      if (data.policyWeights) {
        this.policy.import({ weights: data.policyWeights })
      }

      // 버그 패턴 가져오기
      for (const pattern of data.bugPatterns) {
        this.supervisor.addBugPattern(pattern)
        result.imported.bugPatterns++
      }

      console.log(`[RLSimulation] 학습 데이터 가져오기 완료: ${result.imported.experiences}개 경험`)
    } catch (e) {
      result.success = false
      result.errors.push(`가져오기 실패: ${e}`)
    }

    return result
  }

  /**
   * 전체 학습 데이터 초기화
   */
  async clearAllLearningData(): Promise<void> {
    await this.buffer.clear()
    await this.logger.clear()
    this.supervisor.clear()
    this.policy.reset()
    this.guardrail.reset()

    this.state = {
      isRunning: false,
      isPaused: false,
      isCooldown: false,
      successCount: 0,
      totalAttempts: 0,
      currentBatch: 0,
      startTime: new Date(),
      lastCheckpointId: null,
      errors: [],
      warnings: [],
    }

    console.log('[RLSimulation] 전체 학습 데이터 초기화됨')
  }

  // ============================================================
  // 개발자 전용: 통합 제어 상태
  // ============================================================

  /**
   * 개발자 제어판용 통합 상태 조회
   */
  getDeveloperControl(): DeveloperSimulationControl {
    const recentExperiences = this.buffer.getRecent(10)

    return {
      status: this.state.isCooldown
        ? 'cooldown'
        : this.state.isPaused
          ? 'paused'
          : this.state.isRunning
            ? 'running'
            : 'idle',
      apiUsage: this.guardrail.getUsageStats(),
      metrics: null, // 필요 시 calculateMetrics() 호출
      recentResults: recentExperiences.map(e => ({
        id: e.id,
        prompt: e.metadata.prompt,
        workflow: null,
        executionResult: null,
        success: e.metadata.success,
        checklist: e.metadata.checklist,
        reward: e.reward,
        xaiScore: 0,
        notebookLMScore: 0,
        intentAlignmentScore: 0,
        executionTime: e.metadata.executionTime,
        nodeCount: e.metadata.nodeCount,
        strategy: e.action as Strategy,
        timestamp: e.timestamp,
      })),
      warnings: this.state.warnings,
    }
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const rlSimulationSystem = new RLSimulationSystem()
