/**
 * PersonaService — 페르소나 데이터베이스 프론트엔드 서비스
 *
 * Tauri 백엔드의 persona_db 명령어와 통신하여
 * 페르소나 CRUD 및 평가 이력 관리를 수행합니다.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  PersonaDefinition,
  EvaluationRecord,
  EvaluationStats,
} from '../types/PersonaTypes'
import { BUILTIN_PERSONAS } from '../data/builtinPersonas'

// ============================================================
// 타입 정의
// ============================================================

interface DbResult {
  success: boolean
  message: string
  id: string | null
}

interface PersonaSummary {
  id: string
  name: string
  title: string
  domain: string
  category: string
  is_builtin: boolean
  is_active: boolean
  experience_level: string
  total_evaluations: number
}

// ============================================================
// 데이터베이스 초기화
// ============================================================

let initialized = false

/**
 * 페르소나 DB 초기화 및 내장 페르소나 시드
 */
export async function initPersonaDB(): Promise<void> {
  if (initialized) return

  try {
    // DB 초기화
    await invoke('persona_init_db')

    // 내장 페르소나 시드 확인
    const existingPersonas = await listPersonas()

    // 내장 페르소나가 없으면 시드
    if (existingPersonas.filter(p => p.is_builtin).length === 0) {
      console.log('[PersonaService] 내장 페르소나 시드 시작...')

      for (const persona of BUILTIN_PERSONAS) {
        try {
          await savePersona(persona)
          console.log(`[PersonaService] 내장 페르소나 '${persona.name}' 시드 완료`)
        } catch (e) {
          console.warn(`[PersonaService] 페르소나 '${persona.name}' 시드 실패:`, e)
        }
      }
    }

    initialized = true
    console.log('[PersonaService] 초기화 완료')
  } catch (error) {
    console.error('[PersonaService] 초기화 실패:', error)
    throw error
  }
}

// ============================================================
// 페르소나 CRUD
// ============================================================

/**
 * 페르소나 저장 (생성 또는 업데이트)
 */
export async function savePersona(persona: PersonaDefinition): Promise<string> {
  const result = await invoke<DbResult>('persona_save', {
    persona: {
      id: persona.id,
      name: persona.name,
      title: persona.title,
      domain: persona.domain,
      expertise: persona.expertise,
      experience: persona.experience,
      evaluation_behavior: persona.evaluationBehavior,
      xai_config: persona.xaiConfig,
      knowledge_bases: persona.knowledgeBases,
      evaluation_history: persona.evaluationHistory,
      evaluation_stats: persona.evaluationStats,
      system_prompt: persona.systemPrompt,
      category: persona.category,
      is_builtin: persona.isBuiltin,
      is_active: persona.isActive,
      created_at: persona.createdAt,
      updated_at: persona.updatedAt,
    },
  })

  if (!result.success) {
    throw new Error(result.message)
  }

  return result.id || persona.id
}

/**
 * 페르소나 조회 (단일)
 */
export async function loadPersona(personaId: string): Promise<PersonaDefinition> {
  const result = await invoke<any>('persona_load', { personaId })

  return {
    id: result.id,
    name: result.name,
    title: result.title,
    domain: result.domain,
    expertise: result.expertise,
    experience: result.experience,
    evaluationBehavior: result.evaluation_behavior,
    xaiConfig: result.xai_config,
    knowledgeBases: result.knowledge_bases || [],
    evaluationHistory: result.evaluation_history || [],
    evaluationStats: result.evaluation_stats || {},
    systemPrompt: result.system_prompt,
    category: result.category,
    isBuiltin: result.is_builtin,
    isActive: result.is_active,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  }
}

/**
 * 페르소나 목록 조회
 */
export async function listPersonas(
  category?: string,
  activeOnly?: boolean,
): Promise<PersonaSummary[]> {
  const result = await invoke<PersonaSummary[]>('persona_list', {
    category: category || null,
    activeOnly: activeOnly || false,
  })

  return result
}

/**
 * 페르소나 삭제
 */
export async function deletePersona(personaId: string): Promise<void> {
  const result = await invoke<DbResult>('persona_delete', { personaId })

  if (!result.success) {
    throw new Error(result.message)
  }
}

/**
 * 페르소나 활성화/비활성화 토글
 */
export async function togglePersonaActive(
  personaId: string,
  isActive: boolean,
): Promise<void> {
  const result = await invoke<DbResult>('persona_toggle_active', {
    personaId,
    isActive,
  })

  if (!result.success) {
    throw new Error(result.message)
  }
}

/**
 * 페르소나 검색
 */
export async function searchPersonas(
  query: string,
  domains?: string[],
  limit?: number,
): Promise<PersonaSummary[]> {
  const result = await invoke<PersonaSummary[]>('persona_search', {
    query,
    domains: domains || null,
    limit: limit || 20,
  })

  return result
}

// ============================================================
// 평가 이력 관리
// ============================================================

/**
 * 평가 이력 저장
 */
export async function saveEvaluationRecord(
  record: EvaluationRecord,
): Promise<string> {
  const result = await invoke<DbResult>('evaluation_record_save', {
    record: {
      id: record.id,
      persona_id: record.id.split('_')[0], // 페르소나 ID 추출
      target_name: record.targetName,
      target_id: record.targetId,
      evaluated_at: record.evaluatedAt,
      result: record.result,
      scores: record.scores,
      total_score: record.totalScore,
      opinion: record.opinion,
      reasoning: record.reasoning,
      key_insights: record.keyInsights,
      workflow_id: record.workflowId || null,
      session_id: record.sessionId || null,
    },
  })

  if (!result.success) {
    throw new Error(result.message)
  }

  return result.id || record.id
}

/**
 * 페르소나별 평가 이력 조회
 */
export async function listEvaluationRecords(
  personaId: string,
  limit?: number,
): Promise<EvaluationRecord[]> {
  const results = await invoke<any[]>('evaluation_record_list', {
    personaId,
    limit: limit || 100,
  })

  return results.map((r) => ({
    id: r.id,
    targetName: r.target_name,
    targetId: r.target_id,
    evaluatedAt: r.evaluated_at,
    result: r.result,
    scores: r.scores,
    totalScore: r.total_score,
    opinion: r.opinion,
    reasoning: r.reasoning,
    keyInsights: r.key_insights || [],
    workflowId: r.workflow_id,
    sessionId: r.session_id,
  }))
}

// ============================================================
// 헬퍼 함수
// ============================================================

/**
 * 카테고리별 페르소나 그룹화
 */
export async function getPersonasByCategory(): Promise<Record<string, PersonaSummary[]>> {
  const personas = await listPersonas()
  const grouped: Record<string, PersonaSummary[]> = {}

  for (const persona of personas) {
    if (!grouped[persona.category]) {
      grouped[persona.category] = []
    }
    grouped[persona.category].push(persona)
  }

  return grouped
}

/**
 * 특정 도메인에 적합한 페르소나 추천
 */
export async function recommendPersonasForDomain(
  domain: string,
  count: number = 5,
): Promise<PersonaSummary[]> {
  // 도메인과 관련된 키워드로 검색
  const results = await searchPersonas(domain, undefined, count * 2)

  // 경험 레벨 순으로 정렬 후 상위 N개 반환
  const levelOrder = ['master', 'expert', 'senior', 'mid', 'junior']

  return results
    .sort((a, b) => {
      const aIdx = levelOrder.indexOf(a.experience_level)
      const bIdx = levelOrder.indexOf(b.experience_level)
      return aIdx - bIdx
    })
    .slice(0, count)
}

/**
 * 페르소나 패널 구성 (균형 잡힌 평가 위원회)
 */
export async function composeEvaluationPanel(
  domains: string[],
  panelSize: number = 5,
): Promise<PersonaSummary[]> {
  const panel: PersonaSummary[] = []
  const domainsPerExpert = Math.ceil(domains.length / panelSize)

  for (let i = 0; i < panelSize; i++) {
    const domainSubset = domains.slice(
      i * domainsPerExpert,
      (i + 1) * domainsPerExpert,
    )

    for (const domain of domainSubset) {
      const candidates = await searchPersonas(domain, undefined, 3)
      if (candidates.length > 0) {
        // 중복 제거
        const existing = panel.find((p) => p.id === candidates[0].id)
        if (!existing) {
          panel.push(candidates[0])
          break
        } else if (candidates.length > 1) {
          const next = candidates.find((c) => !panel.some((p) => p.id === c.id))
          if (next) {
            panel.push(next)
            break
          }
        }
      }
    }
  }

  return panel.slice(0, panelSize)
}

/**
 * 페르소나 복제 (내장 페르소나를 기반으로 사용자 정의 페르소나 생성)
 */
export async function clonePersona(
  sourceId: string,
  newName: string,
  modifications?: Partial<PersonaDefinition>,
): Promise<string> {
  const source = await loadPersona(sourceId)

  const newPersona: PersonaDefinition = {
    ...source,
    ...modifications,
    id: `custom_${Date.now()}`,
    name: newName,
    isBuiltin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    evaluationHistory: [],
    evaluationStats: {
      totalEvaluations: 0,
      approveCount: 0,
      conditionalCount: 0,
      rejectCount: 0,
      averageScore: 0,
      primaryDomains: [],
    },
  }

  return savePersona(newPersona)
}

// ============================================================
// 통계 및 분석
// ============================================================

/**
 * 페르소나 평가 통계 조회
 */
export async function getPersonaStats(personaId: string): Promise<EvaluationStats> {
  const persona = await loadPersona(personaId)
  return persona.evaluationStats
}

/**
 * 전체 시스템 통계
 */
export async function getSystemStats(): Promise<{
  totalPersonas: number
  builtinPersonas: number
  customPersonas: number
  totalEvaluations: number
  activePersonas: number
}> {
  const personas = await listPersonas()

  return {
    totalPersonas: personas.length,
    builtinPersonas: personas.filter((p) => p.is_builtin).length,
    customPersonas: personas.filter((p) => !p.is_builtin).length,
    totalEvaluations: personas.reduce((sum, p) => sum + p.total_evaluations, 0),
    activePersonas: personas.filter((p) => p.is_active).length,
  }
}
