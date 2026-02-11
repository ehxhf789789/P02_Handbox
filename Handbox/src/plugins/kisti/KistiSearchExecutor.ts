/**
 * KISTI ScienceON Search Plugin — 국내외 학술자료 검색
 *
 * KISTI ScienceON Open API를 통한 논문, 특허, 보고서, 동향 검색.
 * Python FastAPI 서버의 /api/kisti/search 엔드포인트를 호출.
 *
 * 플러그인: 이 파일은 도메인 특화 로직으로, 별도 등록됨.
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

const API_BASE_URL = 'http://127.0.0.1:8000'

async function callPythonAPI(endpoint: string, payload: any): Promise<any> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API Error [${response.status}]: ${errorText}`)
  }
  const data = await response.json()
  if (data.success === false && data.error) {
    throw new Error(`API 실패: ${data.error}`)
  }
  return data
}

const SERVICE_LABELS: Record<string, string> = {
  'ARTI': '논문',
  'PATENT': '특허',
  'REPORT': '보고서',
  'ATT': '동향',
}

function createKistiExecutor(defaultTarget: string): NodeExecutor {
  return {
    async execute(
      input: Record<string, any>,
      config: Record<string, any>,
      _context: ExecutionContext,
    ): Promise<Record<string, any>> {
      const target = config.target || defaultTarget
      const query = config.query || config.search_query || input._predecessors?.[0]?.query || ''
      const searchField = config.search_field || 'BI'
      const rowCount = config.row_count || config.limit || 10
      const curPage = config.cur_page || config.page || 1

      if (!query) {
        return { error: '검색어가 설정되지 않았습니다', status: '검색어 필요', results: [], total_count: 0 }
      }

      const result = await callPythonAPI('/api/kisti/search', {
        target: target.toUpperCase(),
        query,
        search_field: searchField,
        cur_page: curPage,
        row_count: rowCount,
      })

      if (result.success) {
        const serviceLabel = SERVICE_LABELS[target.toUpperCase()] || target
        return {
          service: target.toUpperCase(),
          service_label: serviceLabel,
          query,
          total_count: result.total_count,
          current_page: result.current_page,
          results_count: result.records_count,
          results: result.records,
          text: result.records?.map((r: any) => r.title || r.content || '').join('\n\n'),
          status: `KISTI ${serviceLabel} 검색 완료: ${result.total_count}건 중 ${result.records_count}건 반환`,
        }
      }

      return { error: result.error || 'KISTI 검색 실패', status: 'KISTI API 오류', results: [], total_count: 0 }
    },
  }
}

const kistiBaseConfig = [
  { key: 'query', label: '검색어', type: 'text' as const, required: true, placeholder: '검색할 키워드' },
  { key: 'search_field', label: '검색 필드', type: 'select' as const, default: 'BI', options: [
    { label: '기본색인 (전체)', value: 'BI' },
    { label: '제목', value: 'TI' },
    { label: '저자', value: 'AU' },
    { label: '초록', value: 'AB' },
  ]},
  { key: 'row_count', label: '검색 건수', type: 'number' as const, default: 10, min: 1, max: 100 },
  { key: 'cur_page', label: '페이지', type: 'number' as const, default: 1, min: 1 },
]

const kistiBasePorts = {
  inputs: [
    { name: 'query', type: 'text' as const, required: false, description: '이전 노드에서 전달받을 검색어' },
  ],
  outputs: [
    { name: 'results', type: 'search-result[]' as const, required: true, description: '검색 결과 배열' },
    { name: 'text', type: 'text' as const, required: false, description: '결과 텍스트' },
  ],
}

export const KistiArticlesDefinition: NodeDefinition = {
  type: 'kisti.articles',
  category: 'plugin',
  subcategory: 'KISTI ScienceON',
  meta: {
    label: 'KISTI 논문 검색',
    description: '국내외 학술논문을 검색합니다 (ScienceON)',
    icon: 'Description',
    color: '#8b5cf6',
    tags: ['KISTI', '논문', 'article', '학술', 'ScienceON'],
  },
  ports: kistiBasePorts,
  configSchema: kistiBaseConfig,
  runtime: 'api',
  executor: createKistiExecutor('ARTI'),
  requirements: { provider: 'kisti' },
  pluginId: 'kisti',
}

export const KistiPatentsDefinition: NodeDefinition = {
  type: 'kisti.patents',
  category: 'plugin',
  subcategory: 'KISTI ScienceON',
  meta: {
    label: 'KISTI 특허 검색',
    description: '국내외 특허정보를 검색합니다 (ScienceON)',
    icon: 'Description',
    color: '#a855f7',
    tags: ['KISTI', '특허', 'patent', 'ScienceON'],
  },
  ports: kistiBasePorts,
  configSchema: kistiBaseConfig,
  runtime: 'api',
  executor: createKistiExecutor('PATENT'),
  requirements: { provider: 'kisti' },
  pluginId: 'kisti',
}

export const KistiReportsDefinition: NodeDefinition = {
  type: 'kisti.reports',
  category: 'plugin',
  subcategory: 'KISTI ScienceON',
  meta: {
    label: 'KISTI 보고서 검색',
    description: '연구보고서를 검색합니다 (ScienceON)',
    icon: 'Description',
    color: '#c084fc',
    tags: ['KISTI', '보고서', 'report', 'ScienceON'],
  },
  ports: kistiBasePorts,
  configSchema: kistiBaseConfig,
  runtime: 'api',
  executor: createKistiExecutor('REPORT'),
  requirements: { provider: 'kisti' },
  pluginId: 'kisti',
}

export const KistiTrendsDefinition: NodeDefinition = {
  type: 'kisti.trends',
  category: 'plugin',
  subcategory: 'KISTI ScienceON',
  meta: {
    label: 'KISTI 동향 검색',
    description: '과학기술 동향을 검색합니다 (ScienceON)',
    icon: 'Description',
    color: '#d946ef',
    tags: ['KISTI', '동향', 'trend', 'ScienceON'],
  },
  ports: kistiBasePorts,
  configSchema: kistiBaseConfig,
  runtime: 'api',
  executor: createKistiExecutor('ATT'),
  requirements: { provider: 'kisti' },
  pluginId: 'kisti',
}

/** KISTI 플러그인의 모든 노드 정의 */
export const KISTI_DEFINITIONS: NodeDefinition[] = [
  KistiArticlesDefinition,
  KistiPatentsDefinition,
  KistiReportsDefinition,
  KistiTrendsDefinition,
]
