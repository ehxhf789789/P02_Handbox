/**
 * CSV Tools - CSV 처리
 *
 * 원자화된 CSV 도구 6개:
 * - csv.parse      : CSV 파싱
 * - csv.stringify  : CSV 문자열화
 * - csv.query      : CSV 쿼리/필터
 * - csv.transform  : 열 변환
 * - csv.merge      : CSV 병합
 * - csv.split      : CSV 분할
 */

import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'

// ============================================================
// Helper: Simple CSV Parser
// ============================================================

function parseCSV(text: string, delimiter = ',', hasHeader = true): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = hasHeader ? parseRow(lines[0]) : parseRow(lines[0]).map((_, i) => `col${i + 1}`)
  const dataLines = hasHeader ? lines.slice(1) : lines

  const rows = dataLines.map(line => {
    const values = parseRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = values[i] || ''
    })
    return obj
  })

  return { headers, rows }
}

function stringifyCSV(rows: Record<string, unknown>[], headers?: string[], delimiter = ','): string {
  if (rows.length === 0) return ''

  const cols = headers || Object.keys(rows[0])
  const escape = (val: unknown): string => {
    const str = String(val ?? '')
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headerLine = cols.map(escape).join(delimiter)
  const dataLines = rows.map(row => cols.map(col => escape(row[col])).join(delimiter))

  return [headerLine, ...dataLines].join('\n')
}

// ============================================================
// csv.parse - CSV 파싱
// ============================================================

const csvParseExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.csv || config.text || '') as string
    const delimiter = (config.delimiter || ',') as string
    const hasHeader = config.hasHeader !== false

    if (!text.trim()) {
      return { success: false, outputs: {}, error: 'CSV 텍스트가 필요합니다' }
    }

    try {
      const { headers, rows } = parseCSV(text, delimiter, hasHeader)

      return {
        success: true,
        outputs: {
          data: rows,
          rows,
          headers,
          rowCount: rows.length,
          columnCount: headers.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `CSV 파싱 실패: ${error}` }
    }
  },
}

export const csvParse: UnifiedToolDefinition = {
  name: 'csv.parse',
  version: '1.0.0',
  description: 'CSV 문자열을 배열로 파싱합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'CSV 문자열' },
      delimiter: { type: 'string', description: '구분자', default: ',' },
      hasHeader: { type: 'boolean', description: '첫 행이 헤더인지', default: true },
    },
    required: ['text'],
  },
  meta: {
    label: 'CSV 파싱',
    description: 'CSV를 배열로 변환합니다',
    icon: 'TableChart',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'parse', 'table', 'data', '파싱'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: 'CSV 문자열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '파싱된 배열' },
      { name: 'rows', type: 'json', required: false, description: '행 배열' },
      { name: 'headers', type: 'json', required: false, description: '헤더 배열' },
      { name: 'rowCount', type: 'number', required: false, description: '행 수' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: ',' },
    { key: 'hasHeader', label: '헤더 포함', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: csvParseExecutor,
}

// ============================================================
// csv.stringify - CSV 문자열화
// ============================================================

const csvStringifyExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data as Record<string, unknown>[] | undefined
    const delimiter = (config.delimiter || ',') as string
    const headers = config.headers as string[] | undefined

    if (!Array.isArray(data) || data.length === 0) {
      return { success: false, outputs: {}, error: '데이터 배열이 필요합니다' }
    }

    try {
      const text = stringifyCSV(data, headers, delimiter)

      return {
        success: true,
        outputs: {
          text,
          csv: text,
          length: text.length,
          rowCount: data.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `CSV 문자열화 실패: ${error}` }
    }
  },
}

export const csvStringify: UnifiedToolDefinition = {
  name: 'csv.stringify',
  version: '1.0.0',
  description: '배열을 CSV 문자열로 변환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', items: { type: 'object' }, description: '변환할 배열' },
      delimiter: { type: 'string', default: ',' },
      headers: { type: 'array', items: { type: 'string' }, description: '헤더 순서 지정' },
    },
    required: ['data'],
  },
  meta: {
    label: 'CSV 문자열화',
    description: '배열을 CSV로 변환합니다',
    icon: 'TextFields',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'stringify', 'export', '문자열화'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터 배열' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: 'CSV 문자열' },
      { name: 'csv', type: 'text', required: false, description: 'CSV 문자열 (alias)' },
      { name: 'rowCount', type: 'number', required: false, description: '행 수' },
    ],
  },
  configSchema: [
    { key: 'delimiter', label: '구분자', type: 'text', default: ',' },
  ],
  runtime: 'internal',
  executor: csvStringifyExecutor,
}

// ============================================================
// csv.query - CSV 쿼리/필터
// ============================================================

const csvQueryExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data as Record<string, unknown>[]
    const filter = config.filter as Record<string, unknown> | undefined
    const columns = config.columns as string[] | undefined
    const limit = config.limit as number | undefined
    const offset = config.offset as number | undefined
    const sortBy = config.sortBy as string | undefined
    const sortOrder = (config.sortOrder || 'asc') as 'asc' | 'desc'

    if (!Array.isArray(data)) {
      return { success: false, outputs: {}, error: '데이터 배열이 필요합니다' }
    }

    try {
      let result = [...data]

      // Filter
      if (filter && typeof filter === 'object') {
        result = result.filter(row => {
          return Object.entries(filter).every(([key, value]) => {
            const rowValue = row[key]
            if (typeof value === 'object' && value !== null) {
              const op = value as { $eq?: unknown; $ne?: unknown; $gt?: number; $lt?: number; $contains?: string }
              if (op.$eq !== undefined) return rowValue === op.$eq
              if (op.$ne !== undefined) return rowValue !== op.$ne
              if (op.$gt !== undefined) return Number(rowValue) > op.$gt
              if (op.$lt !== undefined) return Number(rowValue) < op.$lt
              if (op.$contains !== undefined) return String(rowValue).includes(String(op.$contains))
              return true
            }
            return rowValue === value
          })
        })
      }

      // Sort
      if (sortBy) {
        result.sort((a, b) => {
          const aVal = a[sortBy]
          const bVal = b[sortBy]
          const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
          return sortOrder === 'desc' ? -cmp : cmp
        })
      }

      // Offset & Limit
      if (offset) {
        result = result.slice(offset)
      }
      if (limit) {
        result = result.slice(0, limit)
      }

      // Select columns
      if (columns && columns.length > 0) {
        result = result.map(row => {
          const filtered: Record<string, unknown> = {}
          columns.forEach(col => {
            filtered[col] = row[col]
          })
          return filtered
        })
      }

      return {
        success: true,
        outputs: {
          data: result,
          rows: result,
          count: result.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `쿼리 실패: ${error}` }
    }
  },
}

export const csvQuery: UnifiedToolDefinition = {
  name: 'csv.query',
  version: '1.0.0',
  description: 'CSV 데이터를 필터링, 정렬, 선택합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '쿼리할 데이터' },
      filter: { type: 'object', description: '필터 조건' },
      columns: { type: 'array', items: { type: 'string' }, description: '선택할 열' },
      sortBy: { type: 'string', description: '정렬 기준 열' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
      limit: { type: 'number', description: '최대 행 수' },
      offset: { type: 'number', description: '시작 오프셋' },
    },
    required: ['data'],
  },
  meta: {
    label: 'CSV 쿼리',
    description: 'CSV 데이터를 쿼리합니다',
    icon: 'FilterList',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'query', 'filter', 'sort', '쿼리'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터 배열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '결과 데이터' },
      { name: 'rows', type: 'json', required: false, description: '결과 행' },
      { name: 'count', type: 'number', required: false, description: '결과 수' },
    ],
  },
  configSchema: [
    { key: 'columns', label: '선택할 열 (쉼표 구분)', type: 'text' },
    { key: 'sortBy', label: '정렬 기준 열', type: 'text' },
    {
      key: 'sortOrder', label: '정렬 순서', type: 'select', default: 'asc',
      options: [
        { value: 'asc', label: '오름차순' },
        { value: 'desc', label: '내림차순' },
      ],
    },
    { key: 'limit', label: '최대 행 수', type: 'number' },
    { key: 'offset', label: '시작 오프셋', type: 'number' },
  ],
  runtime: 'internal',
  executor: csvQueryExecutor,
}

// ============================================================
// csv.transform - 열 변환
// ============================================================

const csvTransformExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data as Record<string, unknown>[]
    const transformations = config.transformations as Record<string, string> | undefined
    const addColumns = config.addColumns as Record<string, string> | undefined
    const removeColumns = config.removeColumns as string[] | undefined
    const renameColumns = config.renameColumns as Record<string, string> | undefined

    if (!Array.isArray(data)) {
      return { success: false, outputs: {}, error: '데이터 배열이 필요합니다' }
    }

    try {
      let result = data.map(row => ({ ...row }))

      // Remove columns
      if (removeColumns && removeColumns.length > 0) {
        result = result.map(row => {
          const newRow = { ...row }
          removeColumns.forEach(col => delete newRow[col])
          return newRow
        })
      }

      // Rename columns
      if (renameColumns) {
        result = result.map(row => {
          const newRow: Record<string, unknown> = {}
          Object.entries(row).forEach(([key, value]) => {
            const newKey = renameColumns[key] || key
            newRow[newKey] = value
          })
          return newRow
        })
      }

      // Transform columns (simple expressions)
      if (transformations) {
        result = result.map(row => {
          const newRow = { ...row }
          Object.entries(transformations).forEach(([col, expr]) => {
            try {
              // Simple expression evaluation: supports column references like {{col}}
              const evaluated = expr.replace(/\{\{(\w+)\}\}/g, (_, colName) => String(row[colName] || ''))
              newRow[col] = evaluated
            } catch {
              // Keep original on error
            }
          })
          return newRow
        })
      }

      // Add columns
      if (addColumns) {
        result = result.map(row => {
          const newRow = { ...row }
          Object.entries(addColumns).forEach(([col, value]) => {
            newRow[col] = value
          })
          return newRow
        })
      }

      return {
        success: true,
        outputs: { data: result, rows: result },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `변환 실패: ${error}` }
    }
  },
}

export const csvTransform: UnifiedToolDefinition = {
  name: 'csv.transform',
  version: '1.0.0',
  description: 'CSV 열을 추가, 삭제, 변환, 이름 변경합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '변환할 데이터' },
      addColumns: { type: 'object', description: '추가할 열 (이름: 값)' },
      removeColumns: { type: 'array', items: { type: 'string' }, description: '삭제할 열' },
      renameColumns: { type: 'object', description: '이름 변경 (기존: 새이름)' },
      transformations: { type: 'object', description: '열 변환 (열: 표현식)' },
    },
    required: ['data'],
  },
  meta: {
    label: 'CSV 변환',
    description: 'CSV 열을 변환합니다',
    icon: 'Transform',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'transform', 'column', '변환'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터 배열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '변환된 데이터' },
    ],
  },
  configSchema: [
    { key: 'removeColumns', label: '삭제할 열 (쉼표 구분)', type: 'text' },
    { key: 'renameColumns', label: '이름 변경 (JSON)', type: 'code', language: 'json', rows: 2 },
  ],
  runtime: 'internal',
  executor: csvTransformExecutor,
}

// ============================================================
// csv.merge - CSV 병합
// ============================================================

const csvMergeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const datasets = inputs.datasets as Record<string, unknown>[][] | undefined
    const joinKey = config.joinKey as string | undefined
    const mode = (config.mode || 'concat') as 'concat' | 'join'

    if (!Array.isArray(datasets) || datasets.length === 0) {
      return { success: false, outputs: {}, error: '병합할 데이터셋 배열이 필요합니다' }
    }

    try {
      let result: Record<string, unknown>[]

      if (mode === 'join' && joinKey) {
        // Inner join on key
        result = datasets[0] as Record<string, unknown>[]
        for (let i = 1; i < datasets.length; i++) {
          const rightData = datasets[i] as Record<string, unknown>[]
          const rightMap = new Map(rightData.map(r => [r[joinKey], r]))

          result = result
            .filter(left => rightMap.has(left[joinKey]))
            .map(left => ({ ...left, ...rightMap.get(left[joinKey]) }))
        }
      } else {
        // Simple concatenation
        result = datasets.flat() as Record<string, unknown>[]
      }

      return {
        success: true,
        outputs: { data: result, count: result.length },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `병합 실패: ${error}` }
    }
  },
}

export const csvMerge: UnifiedToolDefinition = {
  name: 'csv.merge',
  version: '1.0.0',
  description: '여러 CSV 데이터를 병합합니다 (연결 또는 조인).',
  inputSchema: {
    type: 'object',
    properties: {
      datasets: { type: 'array', items: { type: 'array' }, description: '병합할 데이터셋들' },
      mode: { type: 'string', enum: ['concat', 'join'], default: 'concat' },
      joinKey: { type: 'string', description: '조인 키 (join 모드에서 사용)' },
    },
    required: ['datasets'],
  },
  meta: {
    label: 'CSV 병합',
    description: 'CSV 데이터를 병합합니다',
    icon: 'MergeType',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'merge', 'join', 'concat', '병합'],
  },
  ports: {
    inputs: [
      { name: 'datasets', type: 'json', required: true, description: '데이터셋 배열' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '병합된 데이터' },
      { name: 'count', type: 'number', required: false, description: '결과 행 수' },
    ],
  },
  configSchema: [
    {
      key: 'mode', label: '병합 모드', type: 'select', default: 'concat',
      options: [
        { value: 'concat', label: '연결 (Concat)' },
        { value: 'join', label: '조인 (Join)' },
      ],
    },
    { key: 'joinKey', label: '조인 키', type: 'text', description: 'join 모드에서 매칭할 열' },
  ],
  runtime: 'internal',
  executor: csvMergeExecutor,
}

// ============================================================
// csv.split - CSV 분할
// ============================================================

const csvSplitExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const data = inputs.data as Record<string, unknown>[]
    const groupBy = config.groupBy as string | undefined
    const chunkSize = config.chunkSize as number | undefined

    if (!Array.isArray(data)) {
      return { success: false, outputs: {}, error: '데이터 배열이 필요합니다' }
    }

    try {
      let chunks: Record<string, unknown>[][]

      if (groupBy) {
        // Group by column value
        const groups = new Map<unknown, Record<string, unknown>[]>()
        data.forEach(row => {
          const key = row[groupBy]
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(row)
        })
        chunks = Array.from(groups.values())
      } else if (chunkSize && chunkSize > 0) {
        // Split by chunk size
        chunks = []
        for (let i = 0; i < data.length; i += chunkSize) {
          chunks.push(data.slice(i, i + chunkSize))
        }
      } else {
        return { success: false, outputs: {}, error: 'groupBy 또는 chunkSize가 필요합니다' }
      }

      return {
        success: true,
        outputs: {
          chunks,
          count: chunks.length,
          sizes: chunks.map(c => c.length),
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `분할 실패: ${error}` }
    }
  },
}

export const csvSplit: UnifiedToolDefinition = {
  name: 'csv.split',
  version: '1.0.0',
  description: 'CSV 데이터를 그룹 또는 청크로 분할합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'array', description: '분할할 데이터' },
      groupBy: { type: 'string', description: '그룹화할 열' },
      chunkSize: { type: 'number', description: '청크 크기' },
    },
    required: ['data'],
  },
  meta: {
    label: 'CSV 분할',
    description: 'CSV 데이터를 분할합니다',
    icon: 'CallSplit',
    color: '#84cc16',
    category: 'csv',
    tags: ['csv', 'split', 'group', 'chunk', '분할'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'json', required: true, description: '데이터 배열' },
    ],
    outputs: [
      { name: 'chunks', type: 'json', required: true, description: '분할된 청크 배열' },
      { name: 'count', type: 'number', required: false, description: '청크 수' },
      { name: 'sizes', type: 'json', required: false, description: '각 청크 크기' },
    ],
  },
  configSchema: [
    { key: 'groupBy', label: '그룹화 열', type: 'text' },
    { key: 'chunkSize', label: '청크 크기', type: 'number' },
  ],
  runtime: 'internal',
  executor: csvSplitExecutor,
}

// ============================================================
// Export All CSV Tools
// ============================================================

export const CSV_TOOLS: UnifiedToolDefinition[] = [
  csvParse,
  csvStringify,
  csvQuery,
  csvTransform,
  csvMerge,
  csvSplit,
]
