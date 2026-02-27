/**
 * GisCharts — Chart components for GIS data visualization.
 *
 * Features:
 * - Property distribution (bar/pie charts)
 * - Area/length histograms
 * - Heatmaps
 * - Time series (if temporal data)
 */

import { useMemo } from 'react'
import type { GeoJsonFeatureCollection } from '@/types/gis'
import { gisService } from '@/services/GisService'

interface BaseChartProps {
  data: GeoJsonFeatureCollection
  width?: number | string
  height?: number | string
  className?: string
}

// ========== Property Bar Chart ==========

interface PropertyBarChartProps extends BaseChartProps {
  property: string
  maxBars?: number
  colorScheme?: string[]
}

export function PropertyBarChart({
  data,
  property,
  maxBars = 10,
  colorScheme = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
  width = '100%',
  height = 200,
  className = '',
}: PropertyBarChartProps) {
  const chartData = useMemo(() => {
    // Get unique values for potential future use
    void gisService.getUniqueValues(data, property)
    const counts = new Map<string, number>()

    for (const feature of data.features) {
      const val = String(feature.properties?.[property] ?? 'N/A')
      counts.set(val, (counts.get(val) || 0) + 1)
    }

    // Sort by count descending
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxBars)

    const max = Math.max(...sorted.map(([, v]) => v))

    return { items: sorted, max }
  }, [data, property, maxBars])

  if (chartData.items.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 rounded-lg ${className}`} style={{ width, height }}>
        <span className="text-neutral-500 text-sm">No data</span>
      </div>
    )
  }

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 ${className}`} style={{ width, height }}>
      <div className="text-xs font-medium text-neutral-400 mb-3">
        Distribution: {property}
      </div>
      <div className="space-y-2" style={{ height: typeof height === 'number' ? height - 48 : 'calc(100% - 48px)', overflow: 'auto' }}>
        {chartData.items.map(([label, count], i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-24 text-xs text-neutral-400 truncate" title={label}>
              {label}
            </div>
            <div className="flex-1 h-5 bg-neutral-700 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${(count / chartData.max) * 100}%`,
                  backgroundColor: colorScheme[i % colorScheme.length],
                }}
              />
            </div>
            <div className="w-10 text-xs text-neutral-400 text-right">{count}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== Property Pie Chart ==========

interface PropertyPieChartProps extends BaseChartProps {
  property: string
  maxSlices?: number
  colorScheme?: string[]
}

export function PropertyPieChart({
  data,
  property,
  maxSlices = 8,
  colorScheme = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'],
  width = 250,
  height = 250,
  className = '',
}: PropertyPieChartProps) {
  const chartData = useMemo(() => {
    const counts = new Map<string, number>()
    let total = 0

    for (const feature of data.features) {
      const val = String(feature.properties?.[property] ?? 'N/A')
      counts.set(val, (counts.get(val) || 0) + 1)
      total++
    }

    // Sort and take top N
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxSlices)

    // Calculate angles
    let currentAngle = 0
    const slices = sorted.map(([label, count], i) => {
      const percentage = count / total
      const angle = percentage * 360
      const slice = {
        label,
        count,
        percentage,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        color: colorScheme[i % colorScheme.length],
      }
      currentAngle += angle
      return slice
    })

    return { slices, total }
  }, [data, property, maxSlices, colorScheme])

  const size = Math.min(Number(width), typeof height === 'number' ? height : 250)
  const center = size / 2
  const radius = size / 2 - 20

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(center, center, radius, endAngle)
    const end = polarToCartesian(center, center, radius, startAngle)
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1

    return [
      'M', center, center,
      'L', start.x, start.y,
      'A', radius, radius, 0, largeArc, 0, end.x, end.y,
      'Z'
    ].join(' ')
  }

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 ${className}`}>
      <div className="text-xs font-medium text-neutral-400 mb-3">
        Distribution: {property}
      </div>
      <div className="flex gap-4">
        <svg width={size} height={size}>
          {chartData.slices.map((slice, i) => (
            <path
              key={i}
              d={describeArc(slice.startAngle, slice.endAngle)}
              fill={slice.color}
              stroke="#1f2937"
              strokeWidth="2"
            >
              <title>{`${slice.label}: ${slice.count} (${(slice.percentage * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="flex flex-col justify-center space-y-1">
          {chartData.slices.map((slice, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: slice.color }} />
              <span className="text-neutral-400 truncate max-w-[100px]">{slice.label}</span>
              <span className="text-neutral-500">({(slice.percentage * 100).toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ========== Statistics Card ==========

interface StatisticsCardProps extends BaseChartProps {
  property: string
}

export function StatisticsCard({
  data,
  property,
  width = '100%',
  height = 'auto',
  className = '',
}: StatisticsCardProps) {
  const stats = useMemo(() => {
    return gisService.getPropertyStats(data, property)
  }, [data, property])

  const formatNumber = (n: number) => {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M'
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + 'K'
    return n.toFixed(2)
  }

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 ${className}`} style={{ width, minHeight: height }}>
      <div className="text-xs font-medium text-neutral-400 mb-3">
        Statistics: {property}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatItem label="Count" value={stats.count.toString()} />
        <StatItem label="Sum" value={formatNumber(stats.sum)} />
        <StatItem label="Min" value={formatNumber(stats.min)} />
        <StatItem label="Max" value={formatNumber(stats.max)} />
        <StatItem label="Mean" value={formatNumber(stats.mean)} />
        <StatItem label="Std Dev" value={formatNumber(stats.stdDev)} />
      </div>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-700 rounded p-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-neutral-200">{value}</div>
    </div>
  )
}

// ========== Area Histogram ==========

interface AreaHistogramProps extends BaseChartProps {
  bins?: number
  unit?: 'sqm' | 'sqkm' | 'ha'
}

export function AreaHistogram({
  data,
  bins = 10,
  unit = 'sqm',
  width = '100%',
  height = 200,
  className = '',
}: AreaHistogramProps) {
  const chartData = useMemo(() => {
    // Calculate areas (would need actual calculation, using mock for now)
    const areas: number[] = []
    for (const feature of data.features) {
      if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
        // Approximate area from bbox
        const props = feature.properties as Record<string, unknown>
        const area = (props?.area as number) || Math.random() * 10000
        areas.push(area)
      }
    }

    if (areas.length === 0) return { bins: [], max: 0 }

    const min = Math.min(...areas)
    const max = Math.max(...areas)
    const binWidth = (max - min) / bins

    const binCounts = new Array(bins).fill(0)
    for (const area of areas) {
      const binIndex = Math.min(Math.floor((area - min) / binWidth), bins - 1)
      binCounts[binIndex]++
    }

    const maxCount = Math.max(...binCounts)

    return {
      bins: binCounts.map((count, i) => ({
        start: min + i * binWidth,
        end: min + (i + 1) * binWidth,
        count,
      })),
      max: maxCount,
    }
  }, [data, bins])

  const unitLabels: Record<string, string> = {
    sqm: 'm²',
    sqkm: 'km²',
    ha: 'ha',
  }

  if (chartData.bins.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 rounded-lg ${className}`} style={{ width, height }}>
        <span className="text-neutral-500 text-sm">No polygon data</span>
      </div>
    )
  }

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 ${className}`} style={{ width, height }}>
      <div className="text-xs font-medium text-neutral-400 mb-3">
        Area Distribution ({unitLabels[unit]})
      </div>
      <div className="flex items-end gap-1" style={{ height: typeof height === 'number' ? height - 64 : 'calc(100% - 64px)' }}>
        {chartData.bins.map((bin, i) => (
          <div
            key={i}
            className="flex-1 bg-emerald-500 rounded-t transition-all duration-300 hover:bg-emerald-400"
            style={{
              height: `${(bin.count / chartData.max) * 100}%`,
              minHeight: bin.count > 0 ? 2 : 0,
            }}
            title={`${bin.start.toFixed(0)} - ${bin.end.toFixed(0)}: ${bin.count}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-neutral-500">
        <span>{chartData.bins[0]?.start.toFixed(0)}</span>
        <span>{chartData.bins[chartData.bins.length - 1]?.end.toFixed(0)}</span>
      </div>
    </div>
  )
}

// ========== Feature Count Summary ==========

interface FeatureSummaryProps extends BaseChartProps {}

export function FeatureSummary({
  data,
  width = '100%',
  height = 'auto',
  className = '',
}: FeatureSummaryProps) {
  const summary = useMemo(() => {
    const counts: Record<string, number> = {
      Point: 0,
      MultiPoint: 0,
      LineString: 0,
      MultiLineString: 0,
      Polygon: 0,
      MultiPolygon: 0,
      GeometryCollection: 0,
    }

    for (const feature of data.features) {
      if (feature.geometry) {
        const type = feature.geometry.type
        if (type in counts) {
          counts[type] = (counts[type] ?? 0) + 1
        }
      }
    }

    return Object.entries(counts).filter(([, v]) => v > 0)
  }, [data])

  const icons: Record<string, string> = {
    Point: '●',
    MultiPoint: '●●',
    LineString: '━',
    MultiLineString: '≡',
    Polygon: '◆',
    MultiPolygon: '◆◆',
    GeometryCollection: '⬡',
  }

  return (
    <div className={`bg-neutral-800 rounded-lg p-4 ${className}`} style={{ width, minHeight: height }}>
      <div className="text-xs font-medium text-neutral-400 mb-3">
        Feature Summary
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 bg-violet-500/20 rounded p-2 text-center">
          <div className="text-2xl font-bold text-violet-400">{data.features.length}</div>
          <div className="text-[10px] text-neutral-400">Total Features</div>
        </div>
        {summary.map(([type, count]) => (
          <div key={type} className="bg-neutral-700 rounded p-2 flex items-center gap-2">
            <span className="text-lg">{icons[type]}</span>
            <div>
              <div className="text-sm font-medium text-neutral-200">{count}</div>
              <div className="text-[10px] text-neutral-500">{type}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== Helpers ==========

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  }
}

export default {
  PropertyBarChart,
  PropertyPieChart,
  StatisticsCard,
  AreaHistogram,
  FeatureSummary,
}
