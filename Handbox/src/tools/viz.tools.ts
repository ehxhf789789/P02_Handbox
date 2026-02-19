/**
 * Visualization 도구 노드 정의 — table, chart, json, text, stats
 */
import type { NodeDefinition } from '../registry/NodeDefinition'

export const TableViewDefinition: NodeDefinition = {
  type: 'viz.table',
  category: 'viz',
  meta: {
    label: '테이블 뷰',
    description: '데이터를 테이블로 시각화합니다.',
    icon: 'TableChart',
    color: '#ec4899',
    tags: ['table', 'view', 'data', 'grid', '테이블', '표'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '배열 또는 객체' }],
    outputs: [{ name: 'data', type: 'table-data', required: true }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'max_rows', label: '최대 행 수', type: 'number', default: 100 },
    { key: 'sortable', label: '정렬 허용', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const data = input.data
      let rows: any[] = []
      let headers: string[] = []
      if (Array.isArray(data)) {
        rows = data.slice(0, config.max_rows || 100)
        if (rows.length > 0 && typeof rows[0] === 'object') {
          headers = Object.keys(rows[0])
        }
      } else if (typeof data === 'object') {
        headers = Object.keys(data)
        rows = [data]
      }
      return { data: { headers, rows, title: config.title, rowCount: rows.length } }
    },
  },
}

export const ChartViewDefinition: NodeDefinition = {
  type: 'viz.chart',
  category: 'viz',
  meta: {
    label: '차트 뷰',
    description: '데이터를 차트로 시각화합니다. 바, 라인, 파이 차트.',
    icon: 'BarChart',
    color: '#ec4899',
    tags: ['chart', 'graph', 'bar', 'line', 'pie', '차트', '그래프'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [{ name: 'data', type: 'chart-data', required: true }],
  },
  configSchema: [
    { key: 'type', label: '차트 타입', type: 'select', default: 'bar',
      options: [
        { label: '바 차트', value: 'bar' }, { label: '라인 차트', value: 'line' },
        { label: '파이 차트', value: 'pie' }, { label: '산점도', value: 'scatter' },
      ] },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'x_field', label: 'X축 필드', type: 'text' },
    { key: 'y_field', label: 'Y축 필드', type: 'text' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const data = Array.isArray(input.data) ? input.data : [input.data]
      const labels = data.map((d: any) => config.x_field ? d[config.x_field] : String(d))
      const values = data.map((d: any) => config.y_field ? Number(d[config.y_field]) : Number(d))
      return {
        data: {
          chartType: config.type, title: config.title,
          labels, datasets: [{ label: config.y_field || 'value', data: values }],
        },
      }
    },
  },
}

export const JsonViewDefinition: NodeDefinition = {
  type: 'viz.json',
  category: 'viz',
  meta: {
    label: 'JSON 뷰',
    description: 'JSON 데이터를 트리 형태로 시각화합니다.',
    icon: 'DataObject',
    color: '#ec4899',
    tags: ['json', 'view', 'tree', 'inspect', 'JSON', '뷰'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true }],
    outputs: [{ name: 'data', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'expanded_depth', label: '자동 펼침 깊이', type: 'number', default: 2 },
  ],
  runtime: 'internal',
  executor: {
    async execute(input) {
      return { data: input.data }
    },
  },
}

export const TextViewDefinition: NodeDefinition = {
  type: 'viz.text',
  category: 'viz',
  meta: {
    label: '텍스트 뷰',
    description: '텍스트를 서식 있게 표시합니다. Markdown 지원.',
    icon: 'Article',
    color: '#ec4899',
    tags: ['text', 'view', 'markdown', 'display', '텍스트', '뷰'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true }],
    outputs: [{ name: 'text', type: 'text', required: true }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'format', label: '형식', type: 'select', default: 'plain',
      options: [
        { label: '일반 텍스트', value: 'plain' }, { label: 'Markdown', value: 'markdown' },
        { label: '코드', value: 'code' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input) {
      return { text: input.text }
    },
  },
}

export const StatsViewDefinition: NodeDefinition = {
  type: 'viz.stats',
  category: 'viz',
  meta: {
    label: '통계 뷰',
    description: '숫자 데이터의 통계를 계산합니다 (합, 평균, 중앙값, 표준편차 등).',
    icon: 'Analytics',
    color: '#ec4899',
    tags: ['stats', 'statistics', 'average', 'sum', '통계', '분석'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '숫자 배열 또는 객체 배열' }],
    outputs: [{ name: 'stats', type: 'json', required: true }],
  },
  configSchema: [
    { key: 'field', label: '분석 필드', type: 'text', description: '객체 배열이면 숫자 필드명 지정' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let numbers: number[]
      if (Array.isArray(input.data)) {
        if (config.field) {
          numbers = input.data.map((d: any) => Number(d[config.field])).filter((n: number) => !isNaN(n))
        } else {
          numbers = input.data.map((d: any) => Number(d)).filter((n: number) => !isNaN(n))
        }
      } else {
        numbers = []
      }
      if (numbers.length === 0) return { stats: { error: '분석할 숫자 데이터가 없습니다' } }

      const sorted = [...numbers].sort((a, b) => a - b)
      const sum = numbers.reduce((a, b) => a + b, 0)
      const mean = sum / numbers.length
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      const variance = numbers.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / numbers.length
      const stddev = Math.sqrt(variance)

      return {
        stats: {
          count: numbers.length, sum, mean, median,
          min: sorted[0], max: sorted[sorted.length - 1],
          stddev, variance,
          q1: sorted[Math.floor(sorted.length * 0.25)],
          q3: sorted[Math.floor(sorted.length * 0.75)],
        },
      }
    },
  },
}

export const VIZ_DEFINITIONS: NodeDefinition[] = [
  TableViewDefinition, ChartViewDefinition, JsonViewDefinition,
  TextViewDefinition, StatsViewDefinition,
]
