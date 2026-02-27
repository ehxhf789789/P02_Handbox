/**
 * Visualization 도구 정의 — viz.* (8개 도구)
 * 테이블, 차트, JSON, 텍스트, 통계, 마크다운, 진행률, 비교 뷰
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// viz.table - 테이블 시각화
// ============================================================================
const vizTable: UnifiedToolDefinition = {
  name: 'viz.table',
  version: '1.0.0',
  description: '데이터를 테이블/그리드로 시각화합니다. 정렬, 필터링, 페이지네이션 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: ['array', 'object'], description: '배열 또는 객체 데이터' },
      title: { type: 'string', description: '테이블 제목' },
    },
    required: ['data'],
  },
  meta: {
    label: '테이블 뷰',
    icon: 'TableChart',
    color: '#ec4899',
    category: 'viz',
    tags: ['table', 'view', 'data', 'grid', '테이블', '표'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '배열 또는 객체' }],
    outputs: [{ name: 'data', type: 'table', required: true, description: '테이블 데이터' }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'max_rows', label: '최대 행 수', type: 'number', default: 100 },
    { key: 'sortable', label: '정렬 허용', type: 'toggle', default: true },
    { key: 'filterable', label: '필터 허용', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const data = inp.data
      let rows: any[] = []
      let headers: string[] = []

      if (Array.isArray(data)) {
        rows = data.slice(0, cfg.max_rows || 100)
        if (rows.length > 0 && typeof rows[0] === 'object') {
          headers = Object.keys(rows[0])
        }
      } else if (typeof data === 'object' && data !== null) {
        headers = Object.keys(data)
        rows = [data]
      }

      return {
        data: {
          headers,
          rows,
          title: cfg.title,
          rowCount: rows.length,
          sortable: cfg.sortable,
          filterable: cfg.filterable,
        }
      }
    },
  },
}

// ============================================================================
// viz.chart - 차트 시각화
// ============================================================================
const vizChart: UnifiedToolDefinition = {
  name: 'viz.chart',
  version: '1.0.0',
  description: '데이터를 차트로 시각화합니다. 바, 라인, 파이, 산점도 차트 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '차트 데이터 배열' },
      type: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter', 'area', 'radar'] },
      x_field: { type: 'string', description: 'X축 필드명' },
      y_field: { type: 'string', description: 'Y축 필드명' },
    },
    required: ['data'],
  },
  meta: {
    label: '차트 뷰',
    icon: 'BarChart',
    color: '#ec4899',
    category: 'viz',
    tags: ['chart', 'graph', 'bar', 'line', 'pie', '차트', '그래프'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '차트 데이터' }],
    outputs: [{ name: 'data', type: 'chart', required: true, description: '차트 설정' }],
  },
  configSchema: [
    { key: 'type', label: '차트 타입', type: 'select', default: 'bar',
      options: [
        { label: '바 차트', value: 'bar' },
        { label: '라인 차트', value: 'line' },
        { label: '파이 차트', value: 'pie' },
        { label: '산점도', value: 'scatter' },
        { label: '영역 차트', value: 'area' },
        { label: '레이더 차트', value: 'radar' },
      ] },
    { key: 'title', label: '제목', type: 'text' },
    { key: 'x_field', label: 'X축 필드', type: 'text' },
    { key: 'y_field', label: 'Y축 필드', type: 'text' },
    { key: 'colors', label: '색상 팔레트', type: 'text', description: '쉼표로 구분된 색상 코드' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const data = Array.isArray(inp.data) ? inp.data : [inp.data]
      const xField = cfg.x_field || inp.x_field
      const yField = cfg.y_field || inp.y_field

      const labels = data.map((d: any) => xField ? d[xField] : String(d))
      const values = data.map((d: any) => yField ? Number(d[yField]) : Number(d))

      const colors = cfg.colors
        ? cfg.colors.split(',').map((c: string) => c.trim())
        : ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6']

      return {
        data: {
          chartType: cfg.type || inp.type || 'bar',
          title: cfg.title,
          labels,
          datasets: [{
            label: yField || 'value',
            data: values,
            backgroundColor: colors,
          }],
        },
      }
    },
  },
}

// ============================================================================
// viz.json - JSON 트리 뷰
// ============================================================================
const vizJson: UnifiedToolDefinition = {
  name: 'viz.json',
  version: '1.0.0',
  description: 'JSON 데이터를 트리 형태로 시각화합니다. 접기/펼치기, 검색 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { description: 'JSON 데이터' },
      expanded_depth: { type: 'number', description: '자동 펼침 깊이' },
    },
    required: ['data'],
  },
  meta: {
    label: 'JSON 뷰',
    icon: 'DataObject',
    color: '#ec4899',
    category: 'viz',
    tags: ['json', 'view', 'tree', 'inspect', 'JSON', '뷰'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: 'JSON 데이터' }],
    outputs: [{ name: 'data', type: 'json', required: true, description: '원본 데이터' }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'expanded_depth', label: '자동 펼침 깊이', type: 'number', default: 2 },
    { key: 'searchable', label: '검색 허용', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      return {
        data: inp.data,
        _viewConfig: {
          title: cfg.title,
          expandedDepth: cfg.expanded_depth,
          searchable: cfg.searchable,
        }
      }
    },
  },
}

// ============================================================================
// viz.text - 텍스트 뷰
// ============================================================================
const vizText: UnifiedToolDefinition = {
  name: 'viz.text',
  version: '1.0.0',
  description: '텍스트를 서식 있게 표시합니다. Plain, Markdown, 코드 형식 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '표시할 텍스트' },
      format: { type: 'string', enum: ['plain', 'markdown', 'code'] },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 뷰',
    icon: 'Article',
    color: '#ec4899',
    category: 'viz',
    tags: ['text', 'view', 'markdown', 'display', '텍스트', '뷰'],
  },
  ports: {
    inputs: [{ name: 'text', type: 'text', required: true, description: '텍스트' }],
    outputs: [{ name: 'text', type: 'text', required: true, description: '텍스트' }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'format', label: '형식', type: 'select', default: 'plain',
      options: [
        { label: '일반 텍스트', value: 'plain' },
        { label: 'Markdown', value: 'markdown' },
        { label: '코드', value: 'code' },
      ] },
    { key: 'language', label: '코드 언어', type: 'text', description: 'format이 code일 때 사용' },
    { key: 'max_length', label: '최대 길이', type: 'number', description: '0 = 무제한' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      let text = String(inp.text || '')
      if (cfg.max_length && (cfg.max_length as number) > 0 && text.length > (cfg.max_length as number)) {
        text = text.slice(0, cfg.max_length as number) + '...'
      }
      return {
        text,
        _viewConfig: {
          title: cfg.title,
          format: cfg.format,
          language: cfg.language,
        }
      }
    },
  },
}

// ============================================================================
// viz.stats - 통계 뷰
// ============================================================================
const vizStats: UnifiedToolDefinition = {
  name: 'viz.stats',
  version: '1.0.0',
  description: '숫자 데이터의 통계를 계산합니다. 합, 평균, 중앙값, 표준편차, 사분위수.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '숫자 배열 또는 객체 배열' },
      field: { type: 'string', description: '객체 배열인 경우 분석할 필드명' },
    },
    required: ['data'],
  },
  meta: {
    label: '통계 뷰',
    icon: 'Analytics',
    color: '#ec4899',
    category: 'viz',
    tags: ['stats', 'statistics', 'average', 'sum', '통계', '분석'],
  },
  ports: {
    inputs: [{ name: 'data', type: 'json', required: true, description: '숫자 배열 또는 객체 배열' }],
    outputs: [{ name: 'stats', type: 'json', required: true, description: '통계 결과' }],
  },
  configSchema: [
    { key: 'field', label: '분석 필드', type: 'text', description: '객체 배열이면 숫자 필드명 지정' },
    { key: 'precision', label: '소수점 자릿수', type: 'number', default: 2 },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const precision = (cfg.precision as number) ?? 2
      let numbers: number[]

      if (Array.isArray(inp.data)) {
        const field = cfg.field || inp.field
        if (field) {
          numbers = inp.data.map((d: any) => Number(d[field])).filter((n: number) => !isNaN(n))
        } else {
          numbers = inp.data.map((d: any) => Number(d)).filter((n: number) => !isNaN(n))
        }
      } else {
        numbers = []
      }

      if (numbers.length === 0) {
        return { stats: { error: '분석할 숫자 데이터가 없습니다', count: 0 } }
      }

      const sorted = [...numbers].sort((a, b) => a - b)
      const sum = numbers.reduce((a, b) => a + b, 0)
      const mean = sum / numbers.length
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]
      const variance = numbers.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / numbers.length
      const stddev = Math.sqrt(variance)

      const round = (n: number) => Number(n.toFixed(precision))

      return {
        stats: {
          count: numbers.length,
          sum: round(sum),
          mean: round(mean),
          median: round(median),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          stddev: round(stddev),
          variance: round(variance),
          q1: sorted[Math.floor(sorted.length * 0.25)],
          q3: sorted[Math.floor(sorted.length * 0.75)],
          range: round(sorted[sorted.length - 1] - sorted[0]),
        },
      }
    },
  },
}

// ============================================================================
// viz.markdown - 마크다운 렌더링
// ============================================================================
const vizMarkdown: UnifiedToolDefinition = {
  name: 'viz.markdown',
  version: '1.0.0',
  description: 'Markdown 텍스트를 렌더링합니다. GFM, 표, 코드 블록 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string', description: 'Markdown 텍스트' },
    },
    required: ['markdown'],
  },
  meta: {
    label: '마크다운 뷰',
    icon: 'Description',
    color: '#ec4899',
    category: 'viz',
    tags: ['markdown', 'render', 'document', '마크다운', '문서'],
  },
  ports: {
    inputs: [{ name: 'markdown', type: 'text', required: true, description: 'Markdown 텍스트' }],
    outputs: [{ name: 'html', type: 'text', required: true, description: '렌더링된 HTML' }],
  },
  configSchema: [
    { key: 'title', label: '제목', type: 'text' },
    { key: 'gfm', label: 'GitHub Flavored MD', type: 'toggle', default: true },
    { key: 'sanitize', label: 'HTML 정화', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const markdown = String(inp.markdown || '')
      // 간단한 Markdown → HTML 변환 (실제로는 marked 같은 라이브러리 사용)
      let html = markdown
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>')

      return {
        html,
        _raw: markdown,
        _viewConfig: {
          title: cfg.title,
          gfm: cfg.gfm,
        }
      }
    },
  },
}

// ============================================================================
// viz.progress - 진행률 표시
// ============================================================================
const vizProgress: UnifiedToolDefinition = {
  name: 'viz.progress',
  version: '1.0.0',
  description: '진행률을 시각적으로 표시합니다. 프로그레스 바, 원형 게이지.',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: '현재 값' },
      max: { type: 'number', description: '최대 값', default: 100 },
      label: { type: 'string', description: '라벨' },
    },
    required: ['value'],
  },
  meta: {
    label: '진행률 뷰',
    icon: 'HourglassEmpty',
    color: '#ec4899',
    category: 'viz',
    tags: ['progress', 'bar', 'gauge', '진행률', '게이지'],
  },
  ports: {
    inputs: [
      { name: 'value', type: 'number', required: true, description: '현재 값' },
      { name: 'max', type: 'number', required: false, description: '최대 값' },
    ],
    outputs: [{ name: 'data', type: 'json', required: true, description: '진행률 데이터' }],
  },
  configSchema: [
    { key: 'max', label: '최대 값', type: 'number', default: 100 },
    { key: 'style', label: '스타일', type: 'select', default: 'bar',
      options: [
        { label: '프로그레스 바', value: 'bar' },
        { label: '원형 게이지', value: 'circular' },
        { label: '반원 게이지', value: 'semicircle' },
      ] },
    { key: 'color', label: '색상', type: 'text', default: '#3b82f6' },
    { key: 'show_percentage', label: '퍼센트 표시', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const value = Number(inp.value) || 0
      const max = Number(inp.max || cfg.max) || 100
      const percentage = Math.min(100, Math.max(0, (value / max) * 100))

      return {
        data: {
          value,
          max,
          percentage: Math.round(percentage * 10) / 10,
          style: cfg.style,
          color: cfg.color,
          showPercentage: cfg.show_percentage,
          label: inp.label,
        }
      }
    },
  },
}

// ============================================================================
// viz.diff - 비교/차이 뷰
// ============================================================================
const vizDiff: UnifiedToolDefinition = {
  name: 'viz.diff',
  version: '1.0.0',
  description: '두 텍스트/JSON의 차이를 시각화합니다. 추가/삭제/변경 하이라이트.',
  inputSchema: {
    type: 'object',
    properties: {
      before: { description: '이전 데이터' },
      after: { description: '이후 데이터' },
    },
    required: ['before', 'after'],
  },
  meta: {
    label: '비교 뷰',
    icon: 'Compare',
    color: '#ec4899',
    category: 'viz',
    tags: ['diff', 'compare', 'difference', '비교', '차이'],
  },
  ports: {
    inputs: [
      { name: 'before', type: 'any', required: true, description: '이전 데이터' },
      { name: 'after', type: 'any', required: true, description: '이후 데이터' },
    ],
    outputs: [{ name: 'diff', type: 'json', required: true, description: '차이 분석 결과' }],
  },
  configSchema: [
    { key: 'mode', label: '비교 모드', type: 'select', default: 'auto',
      options: [
        { label: '자동', value: 'auto' },
        { label: '텍스트 (줄 단위)', value: 'text' },
        { label: 'JSON (키 단위)', value: 'json' },
        { label: '문자 단위', value: 'char' },
      ] },
    { key: 'show_unchanged', label: '변경 없음 표시', type: 'toggle', default: false },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const before = inp.before
      const after = inp.after

      // 간단한 diff 구현
      const changes: any[] = []

      if (typeof before === 'string' && typeof after === 'string') {
        // 텍스트 비교 (줄 단위)
        const beforeLines = (before as string).split('\n')
        const afterLines = (after as string).split('\n')

        const maxLen = Math.max(beforeLines.length, afterLines.length)
        for (let i = 0; i < maxLen; i++) {
          const bLine = beforeLines[i]
          const aLine = afterLines[i]

          if (bLine === aLine) {
            if (cfg.show_unchanged) {
              changes.push({ type: 'unchanged', line: i + 1, content: bLine })
            }
          } else if (bLine === undefined) {
            changes.push({ type: 'added', line: i + 1, content: aLine })
          } else if (aLine === undefined) {
            changes.push({ type: 'removed', line: i + 1, content: bLine })
          } else {
            changes.push({ type: 'modified', line: i + 1, before: bLine, after: aLine })
          }
        }
      } else if (typeof before === 'object' && typeof after === 'object') {
        // JSON 비교 (키 단위)
        const allKeys = new Set([...Object.keys((before as Record<string, unknown>) || {}), ...Object.keys((after as Record<string, unknown>) || {})])
        for (const key of allKeys) {
          const bVal = (before as any)?.[key]
          const aVal = (after as any)?.[key]

          if (JSON.stringify(bVal) === JSON.stringify(aVal)) {
            if (cfg.show_unchanged) {
              changes.push({ type: 'unchanged', key, value: bVal })
            }
          } else if (bVal === undefined) {
            changes.push({ type: 'added', key, value: aVal })
          } else if (aVal === undefined) {
            changes.push({ type: 'removed', key, value: bVal })
          } else {
            changes.push({ type: 'modified', key, before: bVal, after: aVal })
          }
        }
      }

      return {
        diff: {
          changes,
          summary: {
            added: changes.filter(c => c.type === 'added').length,
            removed: changes.filter(c => c.type === 'removed').length,
            modified: changes.filter(c => c.type === 'modified').length,
            unchanged: changes.filter(c => c.type === 'unchanged').length,
          }
        }
      }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const VIZ_TOOLS: UnifiedToolDefinition[] = [
  vizTable,
  vizChart,
  vizJson,
  vizText,
  vizStats,
  vizMarkdown,
  vizProgress,
  vizDiff,
]
