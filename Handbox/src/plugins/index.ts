/**
 * Plugin Registration — 도메인 특화 플러그인 등록
 *
 * 범용 노드(executors/)와 달리, 특정 도메인에 종속적인 노드들.
 * 향후 플러그인 시스템이 확장되면 동적 로딩으로 전환 가능.
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import { KISTI_DEFINITIONS } from './kisti/KistiSearchExecutor'
import { CNT_EVALUATION_DEFINITIONS } from './cnt-evaluation/CntEvaluationPlugin'

export function registerBuiltinPlugins(): void {
  // KISTI ScienceON 검색 플러그인
  NodeRegistry.registerAll(KISTI_DEFINITIONS)

  // CNT (건설신기술) 평가 플러그인
  NodeRegistry.registerAll(CNT_EVALUATION_DEFINITIONS)

  // 레거시 타입 별칭 (기존 워크플로우 호환)
  const legacyKistiMap: Record<string, string> = {
    'kisti-articles': 'kisti.articles',
    'kisti-patents': 'kisti.patents',
    'kisti-reports': 'kisti.reports',
    'kisti-trends': 'kisti.trends',
    'kisti-search': 'kisti.articles',
    'api-kisti': 'kisti.articles',
  }

  for (const [legacyType, newType] of Object.entries(legacyKistiMap)) {
    const def = NodeRegistry.get(newType)
    if (def && !NodeRegistry.get(legacyType)) {
      NodeRegistry.register({ ...def, type: legacyType })
    }
  }

  console.log(`[Plugins] KISTI(${KISTI_DEFINITIONS.length}), CNT(${CNT_EVALUATION_DEFINITIONS.length}) 플러그인 등록 완료`)
}

export { KISTI_DEFINITIONS, CNT_EVALUATION_DEFINITIONS }
