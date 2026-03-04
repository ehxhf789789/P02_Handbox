import { memo, useMemo } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

export const ChartPreview = memo(function ChartPreview({ data, mode }: PreviewRendererProps) {
  const chartData = useMemo(() => parseChartData(data), [data])

  if (!chartData || chartData.values.length === 0) {
    return <div className="p-2 text-[10px] text-neutral-500">No chart data</div>
  }

  const w = mode === 'inline' ? 260 : 600
  const h = mode === 'inline' ? 120 : 300
  const padding = { top: 10, right: 10, bottom: 20, left: 30 }
  const plotW = w - padding.left - padding.right
  const plotH = h - padding.top - padding.bottom
  const maxVal = Math.max(...chartData.values, 1)

  return (
    <svg width={w} height={h} className="p-1">
      {/* Y-axis */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={h - padding.bottom} stroke="#525252" strokeWidth={1} />
      {/* X-axis */}
      <line x1={padding.left} y1={h - padding.bottom} x2={w - padding.right} y2={h - padding.bottom} stroke="#525252" strokeWidth={1} />

      {/* Bars */}
      {chartData.values.map((val, i) => {
        const barW = Math.max(2, plotW / chartData.values.length - 2)
        const barH = (val / maxVal) * plotH
        const x = padding.left + (i * (plotW / chartData.values.length)) + 1
        const y = h - padding.bottom - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill="#3b82f6" rx={1} opacity={0.8} />
            {mode === 'fullscreen' && chartData.labels[i] && (
              <text x={x + barW / 2} y={h - 4} textAnchor="middle" fill="#a3a3a3" fontSize={8}>
                {chartData.labels[i]}
              </text>
            )}
          </g>
        )
      })}

      {/* Y-axis labels */}
      <text x={padding.left - 4} y={padding.top + 6} textAnchor="end" fill="#a3a3a3" fontSize={8}>{maxVal.toFixed(0)}</text>
      <text x={padding.left - 4} y={h - padding.bottom} textAnchor="end" fill="#a3a3a3" fontSize={8}>0</text>
    </svg>
  )
})

function parseChartData(data: unknown): { values: number[]; labels: string[] } | null {
  if (Array.isArray(data)) {
    if (data.every(v => typeof v === 'number')) {
      return { values: data as number[], labels: data.map((_, i) => String(i)) }
    }
    if (data.every(v => typeof v === 'object' && v !== null)) {
      const items = data as Record<string, unknown>[]
      const valueKey = ['value', 'count', 'score', 'y'].find(k => typeof items[0]?.[k] === 'number')
      const labelKey = ['label', 'name', 'x', 'key'].find(k => typeof items[0]?.[k] === 'string')
      if (valueKey) {
        return {
          values: items.map(item => Number(item[valueKey]) || 0),
          labels: items.map(item => labelKey ? String(item[labelKey]) : ''),
        }
      }
    }
  }
  return null
}
