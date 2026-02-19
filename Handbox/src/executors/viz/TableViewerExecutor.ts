/**
 * TableViewerExecutor - Table visualization
 *
 * Render data as a formatted table
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface TableData {
  headers: string[]
  rows: (string | number)[][]
  total_rows: number
  total_columns: number
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.rows || (predecessors?.[0])
    const columns = (config.columns as string) || ''
    const maxRows = (config.max_rows as number) || 100
    const showIndex = config.show_index as boolean

    if (!inputData) {
      return {
        table_data: null,
        error: '테이블 데이터를 제공하세요.',
      }
    }

    try {
      let tableData: TableData = {
        headers: [],
        rows: [],
        total_rows: 0,
        total_columns: 0,
      }

      // Parse column filter
      const columnFilter = columns
        ? columns.split(',').map(c => c.trim()).filter(c => c)
        : null

      if (Array.isArray(inputData)) {
        if (inputData.length === 0) {
          return {
            table_data: { headers: [], rows: [], total_rows: 0, total_columns: 0 },
            text: '데이터가 없습니다.',
          }
        }

        // Get headers from first item
        const firstItem = inputData[0]
        if (typeof firstItem === 'object' && firstItem !== null) {
          const allHeaders = Object.keys(firstItem as Record<string, unknown>)
          tableData.headers = columnFilter
            ? allHeaders.filter(h => columnFilter.includes(h))
            : allHeaders

          // Add index column if requested
          if (showIndex) {
            tableData.headers = ['#', ...tableData.headers]
          }

          // Build rows
          const dataSlice = inputData.slice(0, maxRows)
          tableData.rows = dataSlice.map((item, index) => {
            const row = tableData.headers
              .filter(h => h !== '#')
              .map(h => {
                const val = (item as Record<string, unknown>)[h]
                if (val === null || val === undefined) return ''
                if (typeof val === 'object') return JSON.stringify(val)
                return String(val)
              })

            if (showIndex) {
              row.unshift(String(index + 1))
            }

            return row
          })

          tableData.total_rows = inputData.length
          tableData.total_columns = tableData.headers.length
        } else {
          // Array of primitives
          tableData.headers = showIndex ? ['#', 'Value'] : ['Value']
          tableData.rows = inputData.slice(0, maxRows).map((item, index) => {
            const row = [String(item)]
            if (showIndex) row.unshift(String(index + 1))
            return row
          })
          tableData.total_rows = inputData.length
          tableData.total_columns = tableData.headers.length
        }
      } else if (typeof inputData === 'object') {
        // Single object: display as key-value pairs
        const obj = inputData as Record<string, unknown>
        tableData.headers = ['Key', 'Value']
        tableData.rows = Object.entries(obj).map(([key, value]) => {
          const valStr = typeof value === 'object'
            ? JSON.stringify(value)
            : String(value ?? '')
          return [key, valStr]
        })
        tableData.total_rows = tableData.rows.length
        tableData.total_columns = 2
      }

      // Generate text representation
      const textLines: string[] = []
      textLines.push(tableData.headers.join('\t'))
      textLines.push('-'.repeat(50))
      tableData.rows.forEach(row => {
        textLines.push(row.join('\t'))
      })

      if (tableData.total_rows > maxRows) {
        textLines.push(`... (${tableData.total_rows - maxRows}개 행 생략)`)
      }

      return {
        table_data: tableData,
        text: textLines.join('\n'),
        row_count: tableData.total_rows,
        column_count: tableData.total_columns,
        _renderType: 'table',
      }
    } catch (error) {
      return {
        table_data: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const TableViewerDefinition: NodeDefinition = {
  type: 'viz.table',
  category: 'viz',
  meta: {
    label: '테이블',
    description: '데이터를 테이블 형태로 시각화합니다',
    icon: 'TableChart',
    color: '#10b981',
    tags: ['시각화', '테이블', '표', '데이터'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '테이블 데이터 (배열 또는 객체)' },
    ],
    outputs: [
      { name: 'table_data', type: 'json', required: true, description: '테이블 설정 데이터' },
      { name: 'text', type: 'text', required: false, description: '텍스트 표현' },
    ],
  },
  configSchema: [
    { key: 'columns', label: '표시할 열 (콤마 구분)', type: 'text', required: false },
    { key: 'max_rows', label: '최대 행 수', type: 'number', required: false, default: 100 },
    { key: 'show_index', label: '행 번호 표시', type: 'toggle', required: false, default: false },
  ],
  runtime: 'internal',
  executor,
}

export default TableViewerDefinition
