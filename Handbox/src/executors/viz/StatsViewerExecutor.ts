/**
 * StatsViewerExecutor - Statistical summary visualization
 *
 * Calculate and display statistical summaries of numeric data
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface Stats {
  count: number
  min: number
  max: number
  sum: number
  mean: number
  median: number
  std: number
  variance: number
  missing: number
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.rows || (predecessors?.[0])
    const numericColumns = (config.numeric_columns as string) || ''
    const showDistribution = config.show_distribution as boolean

    if (!inputData) {
      return {
        stats: null,
        error: '통계 데이터를 제공하세요.',
      }
    }

    try {
      const columnFilter = numericColumns
        ? numericColumns.split(',').map(c => c.trim()).filter(c => c)
        : null

      const stats: Record<string, Stats> = {}
      let allNumbers: number[] = []

      if (Array.isArray(inputData)) {
        if (inputData.length === 0) {
          return {
            stats: {},
            text: '데이터가 없습니다.',
          }
        }

        const firstItem = inputData[0]

        if (typeof firstItem === 'number') {
          // Array of numbers
          allNumbers = inputData.filter(x => typeof x === 'number' && !isNaN(x)) as number[]
          stats['value'] = calculateStats(allNumbers)
        } else if (typeof firstItem === 'object' && firstItem !== null) {
          // Array of objects
          const headers = Object.keys(firstItem as Record<string, unknown>)
          const numericHeaders = columnFilter || headers.filter(h => {
            const val = (firstItem as Record<string, unknown>)[h]
            return typeof val === 'number'
          })

          for (const col of numericHeaders) {
            const values = inputData
              .map(item => (item as Record<string, unknown>)[col])
              .filter(v => typeof v === 'number' && !isNaN(v as number)) as number[]

            if (values.length > 0) {
              stats[col] = calculateStats(values)
              allNumbers = allNumbers.concat(values)
            }
          }
        }
      } else if (typeof inputData === 'object') {
        // Object with numeric values
        const obj = inputData as Record<string, unknown>
        const values = Object.values(obj)
          .filter(v => typeof v === 'number' && !isNaN(v as number)) as number[]

        if (values.length > 0) {
          stats['value'] = calculateStats(values)
          allNumbers = values
        }
      }

      // Build text summary
      const textLines: string[] = ['=== 통계 요약 ===\n']

      for (const [col, s] of Object.entries(stats)) {
        textLines.push(`📊 ${col}`)
        textLines.push(`   개수: ${s.count}`)
        textLines.push(`   최소: ${s.min.toFixed(2)}`)
        textLines.push(`   최대: ${s.max.toFixed(2)}`)
        textLines.push(`   합계: ${s.sum.toFixed(2)}`)
        textLines.push(`   평균: ${s.mean.toFixed(2)}`)
        textLines.push(`   중앙값: ${s.median.toFixed(2)}`)
        textLines.push(`   표준편차: ${s.std.toFixed(2)}`)
        if (s.missing > 0) {
          textLines.push(`   결측: ${s.missing}`)
        }
        textLines.push('')
      }

      // Add distribution if requested
      let distribution = null
      if (showDistribution && allNumbers.length > 0) {
        distribution = calculateDistribution(allNumbers)
        textLines.push('📈 분포')
        for (const [range, count] of Object.entries(distribution)) {
          const bar = '█'.repeat(Math.min(20, Math.round(count / allNumbers.length * 40)))
          textLines.push(`   ${range}: ${bar} (${count})`)
        }
      }

      return {
        stats,
        distribution,
        text: textLines.join('\n'),
        column_count: Object.keys(stats).length,
        _renderType: 'stats',
      }
    } catch (error) {
      return {
        stats: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

function calculateStats(values: number[]): Stats {
  const count = values.length
  const missing = 0 // Already filtered

  if (count === 0) {
    return { count: 0, min: 0, max: 0, sum: 0, mean: 0, median: 0, std: 0, variance: 0, missing: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const sum = values.reduce((a, b) => a + b, 0)
  const mean = sum / count

  // Median
  const mid = Math.floor(count / 2)
  const median = count % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  // Variance and standard deviation
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2))
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count
  const std = Math.sqrt(variance)

  return { count, min, max, sum, mean, median, std, variance, missing }
}

function calculateDistribution(values: number[]): Record<string, number> {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)))
  const binSize = range / binCount

  const distribution: Record<string, number> = {}

  for (let i = 0; i < binCount; i++) {
    const binStart = min + i * binSize
    const binEnd = min + (i + 1) * binSize
    const label = `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`
    distribution[label] = 0
  }

  for (const v of values) {
    const binIndex = Math.min(binCount - 1, Math.floor((v - min) / binSize))
    const binStart = min + binIndex * binSize
    const binEnd = min + (binIndex + 1) * binSize
    const label = `${binStart.toFixed(1)}-${binEnd.toFixed(1)}`
    distribution[label] = (distribution[label] || 0) + 1
  }

  return distribution
}

export const StatsViewerDefinition: NodeDefinition = {
  type: 'viz.stats',
  category: 'viz',
  meta: {
    label: '통계 요약',
    description: '숫자 데이터의 통계 요약을 계산하고 표시합니다',
    icon: 'Analytics',
    color: '#f59e0b',
    tags: ['시각화', '통계', '평균', '분포', '분석'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '숫자 데이터' },
    ],
    outputs: [
      { name: 'stats', type: 'json', required: true, description: '통계 결과' },
      { name: 'text', type: 'text', required: false, description: '텍스트 요약' },
    ],
  },
  configSchema: [
    { key: 'numeric_columns', label: '숫자 열 (콤마 구분)', type: 'text', required: false },
    { key: 'show_distribution', label: '분포 표시', type: 'toggle', required: false, default: true },
  ],
  runtime: 'internal',
  executor,
}

export default StatsViewerDefinition
