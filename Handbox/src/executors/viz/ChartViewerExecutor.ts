/**
 * ChartViewerExecutor - Chart visualization
 *
 * Render data as bar, line, pie, or scatter charts
 */

import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'scatter'
  labels: string[]
  datasets: {
    label: string
    data: number[]
    color?: string
  }[]
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const predecessors = input._predecessors as unknown[] | undefined
    const inputData = input.data || input.rows || (predecessors?.[0])
    const chartType = (config.chart_type as string) || 'bar'
    const labelKey = (config.label_key as string) || 'label'
    const valueKey = (config.value_key as string) || 'value'
    const title = (config.title as string) || ''

    if (!inputData) {
      return {
        chart_data: null,
        error: '차트 데이터를 제공하세요.',
      }
    }

    try {
      let chartData: ChartData = {
        type: chartType as ChartData['type'],
        labels: [],
        datasets: [],
      }

      // Handle different input formats
      if (Array.isArray(inputData)) {
        // Array of objects: [{label: 'A', value: 10}, ...]
        chartData.labels = inputData.map((item: Record<string, unknown>) =>
          String(item[labelKey] || item.name || item.key || '')
        )

        const values = inputData.map((item: Record<string, unknown>) =>
          Number(item[valueKey] || item.count || item.amount || 0)
        )

        chartData.datasets = [{
          label: title || valueKey,
          data: values,
        }]
      } else if (typeof inputData === 'object') {
        // Object with key-value pairs: {A: 10, B: 20, ...}
        const obj = inputData as Record<string, unknown>
        chartData.labels = Object.keys(obj)
        const values = Object.values(obj).map(v => Number(v) || 0)

        chartData.datasets = [{
          label: title || 'Value',
          data: values,
        }]
      }

      // Add colors
      const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
      ]

      chartData.datasets = chartData.datasets.map((ds, i) => ({
        ...ds,
        color: colors[i % colors.length],
      }))

      return {
        chart_data: chartData,
        chart_type: chartType,
        label_count: chartData.labels.length,
        _renderType: 'chart', // Signal to UI to render as chart
      }
    } catch (error) {
      return {
        chart_data: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
}

export const ChartViewerDefinition: NodeDefinition = {
  type: 'viz.chart',
  category: 'viz',
  meta: {
    label: '차트',
    description: '데이터를 막대, 선, 파이, 산점도 차트로 시각화합니다',
    icon: 'BarChart',
    color: '#3b82f6',
    tags: ['시각화', '차트', '그래프', '막대', '파이'],
  },
  ports: {
    inputs: [
      { name: 'data', type: 'any', required: true, description: '차트 데이터 (배열 또는 객체)' },
    ],
    outputs: [
      { name: 'chart_data', type: 'json', required: true, description: '차트 설정 데이터' },
    ],
  },
  configSchema: [
    {
      key: 'chart_type',
      label: '차트 유형',
      type: 'select',
      required: true,
      default: 'bar',
      options: [
        { label: '막대 차트', value: 'bar' },
        { label: '선 차트', value: 'line' },
        { label: '파이 차트', value: 'pie' },
        { label: '산점도', value: 'scatter' },
      ],
    },
    { key: 'title', label: '차트 제목', type: 'text', required: false },
    { key: 'label_key', label: '라벨 키', type: 'text', required: false, default: 'label' },
    { key: 'value_key', label: '값 키', type: 'text', required: false, default: 'value' },
  ],
  runtime: 'internal',
  executor,
}

export default ChartViewerDefinition
