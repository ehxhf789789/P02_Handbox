/**
 * Reinforcement Learning System for Handbox
 *
 * LLM API를 최대한 활용한 메타 학습 시스템
 *
 * 핵심 역할:
 * 1. 모든 시뮬레이션 결과 수집 및 분석
 * 2. LLM을 사용한 패턴 마이닝 및 개선안 도출
 * 3. 도구/MCP 개선 자동 제안
 * 4. 프롬프트 엔지니어링 자동 최적화
 * 5. 장기 패턴 기반 플랫폼 성능 향상
 */

import { invoke } from '@tauri-apps/api/tauri'
import { LocalLLMProvider, configureOllama } from './LocalLLMProvider'
import { ProviderRegistry } from '../registry/ProviderRegistry'
import { useAppStore } from '../stores/appStore'

// ============================================================
// Types
// ============================================================

export interface SimulationFeedback {
  id: string
  timestamp: string
  prompt: string
  promptCategory: string

  // 결과
  success: boolean
  failureReason?: string

  // 워크플로우 정보
  nodeTypes: string[]
  edgeCount: number
  nodeCount: number

  // 평가 점수
  scores: {
    xai: number
    competitor: number
    notebookLM: number
    timeEfficiency: number
  }

  // 오류 정보
  errors: Array<{
    type: 'CONNECTION' | 'UNREGISTERED_NODE' | 'EXECUTION' | 'VALIDATION'
    detail: string
  }>

  // 메타데이터
  generationTimeMs: number
  executionTimeMs: number
}

export interface LearningPattern {
  id: string
  type: 'success' | 'failure' | 'improvement'
  category: string

  // 패턴 정보
  pattern: string
  frequency: number
  confidence: number

  // 영향 분석
  impactArea: 'prompt' | 'tool' | 'connection' | 'executor'
  suggestedAction: string

  // 추적
  discoveredAt: string
  lastUpdated: string
  appliedCount: number
}

export interface ImprovementProposal {
  id: string
  timestamp: string

  // 개선 영역
  area: 'system_prompt' | 'few_shot' | 'cot_strategy' | 'connection_rule' | 'node_definition' | 'executor_config'

  // 제안 내용
  currentState: string
  proposedChange: string
  rationale: string

  // 영향 예측
  expectedImpact: {
    successRateChange: number  // 예: +5.2%
    qualityScoreChange: number
    affectedScenarios: string[]
  }

  // 상태
  status: 'pending' | 'applied' | 'rejected' | 'testing'
  testResults?: {
    before: { successRate: number; avgScore: number }
    after: { successRate: number; avgScore: number }
  }
}

export interface RLSystemState {
  totalFeedbacks: number
  successRate: number
  avgScores: {
    xai: number
    competitor: number
    notebookLM: number
  }
  topFailurePatterns: Array<{ pattern: string; count: number }>
  topSuccessPatterns: Array<{ pattern: string; count: number }>
  pendingProposals: number
  appliedImprovements: number
}

// ============================================================
// Database Layer
// ============================================================

class RLDatabaseImpl {
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // 피드백 테이블
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS rl_feedbacks (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            prompt TEXT,
            prompt_category TEXT,
            success INTEGER,
            failure_reason TEXT,
            node_types TEXT,
            edge_count INTEGER,
            node_count INTEGER,
            score_xai REAL,
            score_competitor REAL,
            score_notebooklm REAL,
            score_time_efficiency REAL,
            errors TEXT,
            generation_time_ms INTEGER,
            execution_time_ms INTEGER
          )
        `,
        params: [],
      })

      // 패턴 테이블
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS rl_patterns (
            id TEXT PRIMARY KEY,
            type TEXT,
            category TEXT,
            pattern TEXT,
            frequency INTEGER,
            confidence REAL,
            impact_area TEXT,
            suggested_action TEXT,
            discovered_at TEXT,
            last_updated TEXT,
            applied_count INTEGER
          )
        `,
        params: [],
      })

      // 개선 제안 테이블
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS rl_proposals (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            area TEXT,
            current_state TEXT,
            proposed_change TEXT,
            rationale TEXT,
            expected_impact TEXT,
            status TEXT,
            test_results TEXT
          )
        `,
        params: [],
      })

      // 메타 학습 상태 테이블
      await invoke('memory_db_execute', {
        sql: `
          CREATE TABLE IF NOT EXISTS rl_meta_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
          )
        `,
        params: [],
      })

      this.initialized = true
      console.log('[RL Database] 초기화 완료')
    } catch (error) {
      console.warn('[RL Database] 초기화 실패, 메모리 모드:', error)
      this.initialized = true
    }
  }

  async saveFeedback(feedback: SimulationFeedback): Promise<void> {
    await this.initialize()
    try {
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO rl_feedbacks
          (id, timestamp, prompt, prompt_category, success, failure_reason,
           node_types, edge_count, node_count, score_xai, score_competitor,
           score_notebooklm, score_time_efficiency, errors, generation_time_ms, execution_time_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          feedback.id,
          feedback.timestamp,
          feedback.prompt,
          feedback.promptCategory,
          feedback.success ? 1 : 0,
          feedback.failureReason || '',
          JSON.stringify(feedback.nodeTypes),
          feedback.edgeCount,
          feedback.nodeCount,
          feedback.scores.xai,
          feedback.scores.competitor,
          feedback.scores.notebookLM,
          feedback.scores.timeEfficiency,
          JSON.stringify(feedback.errors),
          feedback.generationTimeMs,
          feedback.executionTimeMs,
        ],
      })
    } catch (e) {
      console.warn('[RL Database] 피드백 저장 실패:', e)
    }
  }

  async getFeedbacks(limit: number = 100): Promise<SimulationFeedback[]> {
    await this.initialize()
    try {
      const rows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT * FROM rl_feedbacks ORDER BY timestamp DESC LIMIT ?',
        params: [limit],
      })
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        prompt: row.prompt,
        promptCategory: row.prompt_category,
        success: row.success === 1,
        failureReason: row.failure_reason || undefined,
        nodeTypes: JSON.parse(row.node_types || '[]'),
        edgeCount: row.edge_count,
        nodeCount: row.node_count,
        scores: {
          xai: row.score_xai,
          competitor: row.score_competitor,
          notebookLM: row.score_notebooklm,
          timeEfficiency: row.score_time_efficiency,
        },
        errors: JSON.parse(row.errors || '[]'),
        generationTimeMs: row.generation_time_ms,
        executionTimeMs: row.execution_time_ms,
      }))
    } catch (e) {
      console.warn('[RL Database] 피드백 조회 실패:', e)
      return []
    }
  }

  async savePattern(pattern: LearningPattern): Promise<void> {
    await this.initialize()
    try {
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO rl_patterns
          (id, type, category, pattern, frequency, confidence, impact_area,
           suggested_action, discovered_at, last_updated, applied_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          pattern.id,
          pattern.type,
          pattern.category,
          pattern.pattern,
          pattern.frequency,
          pattern.confidence,
          pattern.impactArea,
          pattern.suggestedAction,
          pattern.discoveredAt,
          pattern.lastUpdated,
          pattern.appliedCount,
        ],
      })
    } catch (e) {
      console.warn('[RL Database] 패턴 저장 실패:', e)
    }
  }

  async getPatterns(type?: 'success' | 'failure' | 'improvement'): Promise<LearningPattern[]> {
    await this.initialize()
    try {
      const sql = type
        ? 'SELECT * FROM rl_patterns WHERE type = ? ORDER BY frequency DESC LIMIT 50'
        : 'SELECT * FROM rl_patterns ORDER BY frequency DESC LIMIT 50'
      const params = type ? [type] : []

      const rows = await invoke<any[]>('memory_db_query', { sql, params })
      return rows.map(row => ({
        id: row.id,
        type: row.type,
        category: row.category,
        pattern: row.pattern,
        frequency: row.frequency,
        confidence: row.confidence,
        impactArea: row.impact_area,
        suggestedAction: row.suggested_action,
        discoveredAt: row.discovered_at,
        lastUpdated: row.last_updated,
        appliedCount: row.applied_count,
      }))
    } catch (e) {
      console.warn('[RL Database] 패턴 조회 실패:', e)
      return []
    }
  }

  async saveProposal(proposal: ImprovementProposal): Promise<void> {
    await this.initialize()
    try {
      await invoke('memory_db_execute', {
        sql: `
          INSERT OR REPLACE INTO rl_proposals
          (id, timestamp, area, current_state, proposed_change, rationale,
           expected_impact, status, test_results)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        params: [
          proposal.id,
          proposal.timestamp,
          proposal.area,
          proposal.currentState,
          proposal.proposedChange,
          proposal.rationale,
          JSON.stringify(proposal.expectedImpact),
          proposal.status,
          proposal.testResults ? JSON.stringify(proposal.testResults) : null,
        ],
      })
    } catch (e) {
      console.warn('[RL Database] 제안 저장 실패:', e)
    }
  }

  async getProposals(status?: ImprovementProposal['status']): Promise<ImprovementProposal[]> {
    await this.initialize()
    try {
      const sql = status
        ? 'SELECT * FROM rl_proposals WHERE status = ? ORDER BY timestamp DESC'
        : 'SELECT * FROM rl_proposals ORDER BY timestamp DESC LIMIT 50'
      const params = status ? [status] : []

      const rows = await invoke<any[]>('memory_db_query', { sql, params })
      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        area: row.area,
        currentState: row.current_state,
        proposedChange: row.proposed_change,
        rationale: row.rationale,
        expectedImpact: JSON.parse(row.expected_impact || '{}'),
        status: row.status,
        testResults: row.test_results ? JSON.parse(row.test_results) : undefined,
      }))
    } catch (e) {
      console.warn('[RL Database] 제안 조회 실패:', e)
      return []
    }
  }

  async getStatistics(): Promise<RLSystemState> {
    await this.initialize()
    try {
      // 전체 통계
      const totalRows = await invoke<any[]>('memory_db_query', {
        sql: 'SELECT COUNT(*) as total, SUM(success) as successes FROM rl_feedbacks',
        params: [],
      })
      const total = totalRows[0]?.total || 0
      const successes = totalRows[0]?.successes || 0

      // 평균 점수
      const avgRows = await invoke<any[]>('memory_db_query', {
        sql: `
          SELECT
            AVG(score_xai) as avg_xai,
            AVG(score_competitor) as avg_competitor,
            AVG(score_notebooklm) as avg_notebooklm
          FROM rl_feedbacks
          WHERE success = 1
        `,
        params: [],
      })

      // 실패 패턴
      const failurePatterns = await invoke<any[]>('memory_db_query', {
        sql: `
          SELECT failure_reason as pattern, COUNT(*) as count
          FROM rl_feedbacks
          WHERE success = 0 AND failure_reason != ''
          GROUP BY failure_reason
          ORDER BY count DESC
          LIMIT 10
        `,
        params: [],
      })

      // 성공 패턴 (노드 조합)
      const successPatterns = await invoke<any[]>('memory_db_query', {
        sql: `
          SELECT node_types as pattern, COUNT(*) as count
          FROM rl_feedbacks
          WHERE success = 1
          GROUP BY node_types
          ORDER BY count DESC
          LIMIT 10
        `,
        params: [],
      })

      // 대기 중인 제안
      const pendingRows = await invoke<any[]>('memory_db_query', {
        sql: "SELECT COUNT(*) as count FROM rl_proposals WHERE status = 'pending'",
        params: [],
      })

      // 적용된 개선
      const appliedRows = await invoke<any[]>('memory_db_query', {
        sql: "SELECT COUNT(*) as count FROM rl_proposals WHERE status = 'applied'",
        params: [],
      })

      return {
        totalFeedbacks: total,
        successRate: total > 0 ? (successes / total) * 100 : 0,
        avgScores: {
          xai: avgRows[0]?.avg_xai || 0,
          competitor: avgRows[0]?.avg_competitor || 0,
          notebookLM: avgRows[0]?.avg_notebooklm || 0,
        },
        topFailurePatterns: failurePatterns.map(r => ({ pattern: r.pattern, count: r.count })),
        topSuccessPatterns: successPatterns.map(r => ({ pattern: r.pattern, count: r.count })),
        pendingProposals: pendingRows[0]?.count || 0,
        appliedImprovements: appliedRows[0]?.count || 0,
      }
    } catch (e) {
      console.warn('[RL Database] 통계 조회 실패:', e)
      return {
        totalFeedbacks: 0,
        successRate: 0,
        avgScores: { xai: 0, competitor: 0, notebookLM: 0 },
        topFailurePatterns: [],
        topSuccessPatterns: [],
        pendingProposals: 0,
        appliedImprovements: 0,
      }
    }
  }
}

const RLDatabase = new RLDatabaseImpl()

// ============================================================
// Pattern Mining Engine
// ============================================================

class PatternMiningEngineImpl {
  /**
   * 피드백에서 패턴 추출
   */
  async minePatterns(feedbacks: SimulationFeedback[]): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = []
    const now = new Date().toISOString()

    // 1. 실패 패턴 분석
    const failureGroups = this.groupByFailureReason(feedbacks.filter(f => !f.success))
    for (const [reason, group] of Object.entries(failureGroups)) {
      if (group.length >= 3) {  // 3회 이상 발생한 패턴만
        patterns.push({
          id: `failure_${this.hashString(reason)}`,
          type: 'failure',
          category: this.categorizeFailure(reason),
          pattern: reason,
          frequency: group.length,
          confidence: group.length / feedbacks.filter(f => !f.success).length,
          impactArea: this.determineImpactArea(reason),
          suggestedAction: this.suggestActionForFailure(reason),
          discoveredAt: now,
          lastUpdated: now,
          appliedCount: 0,
        })
      }
    }

    // 2. 성공 패턴 분석 (노드 시퀀스)
    const successGroups = this.groupByNodeSequence(feedbacks.filter(f => f.success))
    for (const [sequence, group] of Object.entries(successGroups)) {
      if (group.length >= 2) {
        const avgScore = group.reduce((sum, f) => sum + f.scores.notebookLM, 0) / group.length
        patterns.push({
          id: `success_${this.hashString(sequence)}`,
          type: 'success',
          category: 'node_sequence',
          pattern: sequence,
          frequency: group.length,
          confidence: avgScore / 100,  // NotebookLM 점수 기반 신뢰도
          impactArea: 'prompt',
          suggestedAction: `Few-shot 예시로 활용: ${sequence}`,
          discoveredAt: now,
          lastUpdated: now,
          appliedCount: 0,
        })
      }
    }

    // 3. 연결 오류 패턴
    const connectionErrors = feedbacks
      .flatMap(f => f.errors.filter(e => e.type === 'CONNECTION'))
      .map(e => e.detail)
    const connectionGroups = this.countOccurrences(connectionErrors)
    for (const [connection, count] of Object.entries(connectionGroups)) {
      if (count >= 2) {
        patterns.push({
          id: `connection_${this.hashString(connection)}`,
          type: 'improvement',
          category: 'connection_rule',
          pattern: connection,
          frequency: count,
          confidence: 0.9,  // 연결 오류는 확실한 개선 포인트
          impactArea: 'connection',
          suggestedAction: `연결 규칙 추가 필요: ${connection}`,
          discoveredAt: now,
          lastUpdated: now,
          appliedCount: 0,
        })
      }
    }

    // DB에 저장
    for (const pattern of patterns) {
      await RLDatabase.savePattern(pattern)
    }

    return patterns
  }

  private groupByFailureReason(feedbacks: SimulationFeedback[]): Record<string, SimulationFeedback[]> {
    const groups: Record<string, SimulationFeedback[]> = {}
    for (const f of feedbacks) {
      const reason = f.failureReason || 'UNKNOWN'
      if (!groups[reason]) groups[reason] = []
      groups[reason].push(f)
    }
    return groups
  }

  private groupByNodeSequence(feedbacks: SimulationFeedback[]): Record<string, SimulationFeedback[]> {
    const groups: Record<string, SimulationFeedback[]> = {}
    for (const f of feedbacks) {
      const sequence = f.nodeTypes.join(' → ')
      if (!groups[sequence]) groups[sequence] = []
      groups[sequence].push(f)
    }
    return groups
  }

  private countOccurrences(items: string[]): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const item of items) {
      counts[item] = (counts[item] || 0) + 1
    }
    return counts
  }

  private categorizeFailure(reason: string): string {
    if (reason.includes('CONNECTION')) return 'connection'
    if (reason.includes('UNREGISTERED')) return 'node_definition'
    if (reason.includes('EXECUTION')) return 'executor'
    if (reason.includes('SCORE')) return 'quality'
    if (reason.includes('SIMULATION_FALLBACK')) return 'implementation'
    return 'other'
  }

  private determineImpactArea(reason: string): LearningPattern['impactArea'] {
    if (reason.includes('CONNECTION')) return 'connection'
    if (reason.includes('UNREGISTERED')) return 'tool'
    if (reason.includes('EXECUTION')) return 'executor'
    return 'prompt'
  }

  private suggestActionForFailure(reason: string): string {
    if (reason.includes('CONNECTION')) {
      const match = reason.match(/(\w+\.\w+)\s*→\s*(\w+\.\w+)/)
      if (match) {
        return `NodeConnectionRules.ts에 ${match[1]} → ${match[2]} 연결 규칙 추가`
      }
    }
    if (reason.includes('UNREGISTERED_NODE')) {
      const match = reason.match(/UNREGISTERED_NODE:\s*(\S+)/)
      if (match) {
        return `시스템 프롬프트에 "${match[1]}" 노드 사용 금지 추가`
      }
    }
    if (reason.includes('NOTEBOOKLM_SCORE')) {
      return '워크플로우 품질 향상을 위한 프롬프트 개선 필요'
    }
    return '추가 분석 필요'
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }
}

const PatternMiningEngine = new PatternMiningEngineImpl()

// ============================================================
// LLM Meta-Learner
// ============================================================

class LLMMetaLearnerImpl {
  /**
   * LLM을 사용하여 패턴 분석 및 개선안 도출
   */
  async analyzeAndPropose(
    patterns: LearningPattern[],
    statistics: RLSystemState
  ): Promise<ImprovementProposal[]> {
    const proposals: ImprovementProposal[] = []

    // 1. 시스템 프롬프트 개선 제안
    const promptProposal = await this.proposePromptImprovement(patterns, statistics)
    if (promptProposal) proposals.push(promptProposal)

    // 2. Few-shot 예시 개선 제안
    const fewShotProposal = await this.proposeFewShotImprovement(patterns)
    if (fewShotProposal) proposals.push(fewShotProposal)

    // 3. 연결 규칙 개선 제안
    const connectionProposals = await this.proposeConnectionRules(patterns)
    proposals.push(...connectionProposals)

    // DB에 저장
    for (const proposal of proposals) {
      await RLDatabase.saveProposal(proposal)
    }

    return proposals
  }

  /**
   * LLM을 사용한 시스템 프롬프트 개선 분석
   */
  private async proposePromptImprovement(
    patterns: LearningPattern[],
    statistics: RLSystemState
  ): Promise<ImprovementProposal | null> {
    const failurePatterns = patterns.filter(p => p.type === 'failure')
    if (failurePatterns.length === 0) return null

    const prompt = `당신은 AI 워크플로우 생성 시스템의 품질 개선 전문가입니다.

## 현재 시스템 상태
- 성공률: ${statistics.successRate.toFixed(1)}%
- 평균 NotebookLM 점수: ${statistics.avgScores.notebookLM.toFixed(1)}/100
- 총 피드백: ${statistics.totalFeedbacks}건

## 주요 실패 패턴 (빈도순)
${failurePatterns.slice(0, 10).map(p => `- ${p.pattern} (${p.frequency}회, ${(p.confidence * 100).toFixed(1)}%)`).join('\n')}

## 요청
위 실패 패턴을 분석하고, 워크플로우 생성 에이전트의 시스템 프롬프트에 추가할 **구체적인 지침**을 제안하세요.

응답 형식:
\`\`\`json
{
  "analysis": "실패 원인 분석",
  "proposedAddition": "시스템 프롬프트에 추가할 구체적인 텍스트",
  "expectedImpact": "예상되는 개선 효과 (성공률 변화 %)"
}
\`\`\`
`

    try {
      const response = await this.callLLM(prompt)
      const parsed = this.parseJSON(response)

      if (parsed) {
        return {
          id: `prompt_${Date.now()}`,
          timestamp: new Date().toISOString(),
          area: 'system_prompt',
          currentState: '현재 시스템 프롬프트',
          proposedChange: parsed.proposedAddition,
          rationale: parsed.analysis,
          expectedImpact: {
            successRateChange: parseFloat(parsed.expectedImpact) || 5,
            qualityScoreChange: 3,
            affectedScenarios: failurePatterns.map(p => p.pattern).slice(0, 5),
          },
          status: 'pending',
        }
      }
    } catch (e) {
      console.warn('[LLM Meta-Learner] 프롬프트 분석 실패:', e)
    }

    return null
  }

  /**
   * Few-shot 예시 개선 제안
   */
  private async proposeFewShotImprovement(
    patterns: LearningPattern[]
  ): Promise<ImprovementProposal | null> {
    const successPatterns = patterns.filter(p => p.type === 'success' && p.frequency >= 3)
    if (successPatterns.length === 0) return null

    const prompt = `당신은 AI 프롬프트 엔지니어링 전문가입니다.

## 검증된 성공 워크플로우 패턴
${successPatterns.slice(0, 5).map(p => `- ${p.pattern} (${p.frequency}회 성공, 신뢰도 ${(p.confidence * 100).toFixed(1)}%)`).join('\n')}

## 요청
위 성공 패턴을 기반으로 Few-shot 예시를 생성하세요.
워크플로우 생성 에이전트가 참고할 수 있는 **구체적인 예시**를 만들어주세요.

응답 형식:
\`\`\`json
{
  "examples": [
    {
      "userRequest": "사용자 요청 예시",
      "workflowPattern": "노드1 → 노드2 → 노드3",
      "reasoning": "이 패턴을 선택한 이유"
    }
  ],
  "usage": "이 예시들을 시스템 프롬프트에 어떻게 활용할지"
}
\`\`\`
`

    try {
      const response = await this.callLLM(prompt)
      const parsed = this.parseJSON(response)

      if (parsed && parsed.examples) {
        return {
          id: `fewshot_${Date.now()}`,
          timestamp: new Date().toISOString(),
          area: 'few_shot',
          currentState: '기존 Few-shot 예시',
          proposedChange: JSON.stringify(parsed.examples, null, 2),
          rationale: parsed.usage,
          expectedImpact: {
            successRateChange: 8,
            qualityScoreChange: 5,
            affectedScenarios: successPatterns.map(p => p.pattern),
          },
          status: 'pending',
        }
      }
    } catch (e) {
      console.warn('[LLM Meta-Learner] Few-shot 분석 실패:', e)
    }

    return null
  }

  /**
   * 연결 규칙 개선 제안
   */
  private async proposeConnectionRules(
    patterns: LearningPattern[]
  ): Promise<ImprovementProposal[]> {
    const connectionPatterns = patterns.filter(p => p.impactArea === 'connection')
    const proposals: ImprovementProposal[] = []

    for (const pattern of connectionPatterns.slice(0, 5)) {
      const match = pattern.pattern.match(/(\w+\.\w+)\s*→\s*(\w+\.\w+)/)
      if (match) {
        proposals.push({
          id: `connection_${match[1]}_${match[2]}_${Date.now()}`,
          timestamp: new Date().toISOString(),
          area: 'connection_rule',
          currentState: `${match[1]} → ${match[2]} 연결 불가`,
          proposedChange: `NODE_PORT_REGISTRY['${match[1]}'].canConnectTo에 '${match[2]}' 추가`,
          rationale: `${pattern.frequency}회 연결 시도 실패. 연결 규칙 추가 필요.`,
          expectedImpact: {
            successRateChange: pattern.frequency * 0.5,
            qualityScoreChange: 0,
            affectedScenarios: [pattern.pattern],
          },
          status: 'pending',
        })
      }
    }

    return proposals
  }

  /**
   * LLM 호출 (Bedrock 또는 로컬)
   */
  private async callLLM(prompt: string): Promise<string> {
    const state = useAppStore.getState()

    // Bedrock 우선 시도
    try {
      const result = await invoke<{ content: string }>('invoke_bedrock', {
        request: {
          model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
          prompt,
          system_prompt: '당신은 AI 시스템 개선 전문가입니다. JSON 형식으로 응답하세요.',
          max_tokens: 2000,
          temperature: 0.3,  // 낮은 temperature로 일관성 확보
        },
      })
      return result.content
    } catch (bedrockError) {
      console.warn('[LLM Meta-Learner] Bedrock 실패, 로컬 시도:', bedrockError)
    }

    // 로컬 LLM 폴백
    try {
      if (!LocalLLMProvider.getConfig()) {
        configureOllama()
      }
      const response = await LocalLLMProvider.generate({
        prompt,
        systemPrompt: '당신은 AI 시스템 개선 전문가입니다. JSON 형식으로 응답하세요.',
        temperature: 0.3,
        maxTokens: 2000,
      })
      return response.text
    } catch (localError) {
      console.warn('[LLM Meta-Learner] 로컬 LLM도 실패:', localError)
      throw localError
    }
  }

  private parseJSON(text: string): any {
    try {
      // JSON 블록 추출
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1])
      }
      // 직접 파싱 시도
      return JSON.parse(text)
    } catch {
      return null
    }
  }
}

const LLMMetaLearner = new LLMMetaLearnerImpl()

// ============================================================
// Main RL System
// ============================================================

class ReinforcementLearningSystemImpl {
  private isRunning = false
  private learningInterval: number | null = null

  /**
   * 시뮬레이션 결과 피드백 기록
   */
  async recordFeedback(result: {
    prompt: string
    promptCategory?: string
    success: boolean
    failureReason?: string
    nodeTypes?: string[]
    edgeCount?: number
    nodeCount?: number
    scores?: {
      xai?: number
      competitor?: number
      notebookLM?: number
      timeEfficiency?: number
    }
    errors?: Array<{ type: string; detail: string }>
    generationTimeMs?: number
    executionTimeMs?: number
  }): Promise<void> {
    const feedback: SimulationFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      prompt: result.prompt,
      promptCategory: result.promptCategory || 'general',
      success: result.success,
      failureReason: result.failureReason,
      nodeTypes: result.nodeTypes || [],
      edgeCount: result.edgeCount || 0,
      nodeCount: result.nodeCount || 0,
      scores: {
        xai: result.scores?.xai || 0,
        competitor: result.scores?.competitor || 0,
        notebookLM: result.scores?.notebookLM || 0,
        timeEfficiency: result.scores?.timeEfficiency || 0,
      },
      errors: (result.errors || []).map(e => ({
        type: e.type as SimulationFeedback['errors'][0]['type'],
        detail: e.detail,
      })),
      generationTimeMs: result.generationTimeMs || 0,
      executionTimeMs: result.executionTimeMs || 0,
    }

    await RLDatabase.saveFeedback(feedback)
    console.log(`[RL System] 피드백 기록: ${feedback.success ? '✅ 성공' : '❌ 실패'}`)
  }

  /**
   * 학습 사이클 실행 (수동)
   */
  async runLearningCycle(): Promise<{
    patternsFound: number
    proposalsGenerated: number
    statistics: RLSystemState
  }> {
    console.log('[RL System] 🧠 학습 사이클 시작...')

    // 1. 최근 피드백 수집
    const feedbacks = await RLDatabase.getFeedbacks(500)
    console.log(`[RL System] 피드백 ${feedbacks.length}건 로드`)

    // 2. 패턴 마이닝
    const patterns = await PatternMiningEngine.minePatterns(feedbacks)
    console.log(`[RL System] 패턴 ${patterns.length}개 발견`)

    // 3. 통계 수집
    const statistics = await RLDatabase.getStatistics()

    // 4. LLM 기반 개선안 도출
    const proposals = await LLMMetaLearner.analyzeAndPropose(patterns, statistics)
    console.log(`[RL System] 개선안 ${proposals.length}개 생성`)

    // 5. 결과 로깅
    console.log('\n[RL System] 📊 학습 결과:')
    console.log(`  성공률: ${statistics.successRate.toFixed(1)}%`)
    console.log(`  평균 점수: XAI=${statistics.avgScores.xai.toFixed(1)}, NB=${statistics.avgScores.notebookLM.toFixed(1)}`)
    console.log(`  패턴 발견: ${patterns.length}개`)
    console.log(`  개선 제안: ${proposals.length}개`)

    return {
      patternsFound: patterns.length,
      proposalsGenerated: proposals.length,
      statistics,
    }
  }

  /**
   * 자동 학습 루프 시작
   */
  startAutoLearning(intervalMs: number = 60000): void {
    if (this.isRunning) {
      console.warn('[RL System] 이미 자동 학습 중')
      return
    }

    this.isRunning = true
    console.log(`[RL System] 🔄 자동 학습 시작 (${intervalMs / 1000}초 간격)`)

    this.learningInterval = window.setInterval(async () => {
      try {
        await this.runLearningCycle()
      } catch (e) {
        console.error('[RL System] 학습 사이클 오류:', e)
      }
    }, intervalMs)
  }

  /**
   * 자동 학습 루프 중지
   */
  stopAutoLearning(): void {
    if (this.learningInterval) {
      clearInterval(this.learningInterval)
      this.learningInterval = null
    }
    this.isRunning = false
    console.log('[RL System] 자동 학습 중지')
  }

  /**
   * 현재 상태 조회
   */
  async getSystemState(): Promise<RLSystemState> {
    return RLDatabase.getStatistics()
  }

  /**
   * 대기 중인 개선 제안 조회
   */
  async getPendingProposals(): Promise<ImprovementProposal[]> {
    return RLDatabase.getProposals('pending')
  }

  /**
   * 개선 제안 적용 (수동)
   */
  async applyProposal(proposalId: string): Promise<boolean> {
    const proposals = await RLDatabase.getProposals()
    const proposal = proposals.find(p => p.id === proposalId)

    if (!proposal) {
      console.warn('[RL System] 제안을 찾을 수 없음:', proposalId)
      return false
    }

    // TODO: 실제 적용 로직 구현
    // - system_prompt: IntegratedWorkflowAgent 수정
    // - few_shot: 예시 추가
    // - connection_rule: NodeConnectionRules.ts 수정

    console.log(`[RL System] 제안 적용: ${proposal.area}`)
    console.log(`  변경: ${proposal.proposedChange.slice(0, 100)}...`)

    // 상태 업데이트
    proposal.status = 'applied'
    await RLDatabase.saveProposal(proposal)

    return true
  }

  /**
   * 시스템 프롬프트용 학습 인사이트 생성
   */
  async generateLearningInsights(): Promise<string> {
    const statistics = await RLDatabase.getStatistics()
    const patterns = await RLDatabase.getPatterns('success')
    const failurePatterns = await RLDatabase.getPatterns('failure')

    const lines: string[] = []

    // 성공률 기반 조언
    if (statistics.successRate < 50) {
      lines.push('## ⚠️ 학습 시스템 경고')
      lines.push(`현재 성공률이 ${statistics.successRate.toFixed(1)}%로 낮습니다.`)
      lines.push('다음 사항을 특히 주의하세요:')
      for (const fp of statistics.topFailurePatterns.slice(0, 3)) {
        lines.push(`- ❌ ${fp.pattern}`)
      }
      lines.push('')
    }

    // 검증된 성공 패턴
    if (patterns.length > 0) {
      lines.push('## ✅ 검증된 성공 패턴 (우선 사용)')
      for (const p of patterns.slice(0, 5)) {
        lines.push(`- ${p.pattern} (${p.frequency}회 성공)`)
      }
      lines.push('')
    }

    // 피해야 할 패턴
    if (failurePatterns.length > 0) {
      lines.push('## 🚫 피해야 할 패턴')
      for (const p of failurePatterns.slice(0, 5)) {
        lines.push(`- ${p.pattern} (${p.frequency}회 실패)`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

export const ReinforcementLearningSystem = new ReinforcementLearningSystemImpl()

// ============================================================
// Exports
// ============================================================

export {
  RLDatabase,
  PatternMiningEngine,
  LLMMetaLearner,
}
