import { memo, useMemo, useRef, lazy, Suspense } from 'react'
import { Maximize2, ChevronDown, ChevronRight } from 'lucide-react'
import { detectPreviewType, getPreviewSummary } from '@/services/PreviewDetector'
import { usePreviewStore } from '@/stores/previewStore'
import { useIsVisible } from '@/hooks/useIsVisible'
import { PreviewSkeleton } from './PreviewSkeleton'
import { TextPreview } from './TextPreview'
import { ErrorPreview } from './ErrorPreview'
import { CodePreview } from './CodePreview'
import { JsonTreePreview } from './JsonTreePreview'
import { ImagePreview } from './ImagePreview'
import { HtmlPreview } from './HtmlPreview'
import { AudioVideoPreview } from './AudioVideoPreview'
import { ChartPreview } from './ChartPreview'
import { PdfPreview } from './PdfPreview'
import { GeoJsonPreview } from './GeoJsonPreview'
import type { PreviewPayload, PreviewRendererProps } from '@/types/preview'

// Lazy-loaded heavy components
const MarkdownPreview = lazy(() => import('./MarkdownPreview').then(m => ({ default: m.MarkdownPreview })))
const CsvTablePreview = lazy(() => import('./CsvTablePreview').then(m => ({ default: m.CsvTablePreview })))

interface NodeInlinePreviewProps {
  nodeId: string
  toolRef: string
  output: unknown
  error?: string | null
  config?: Record<string, unknown>
  duration_ms?: number
}

export const NodeInlinePreview = memo(function NodeInlinePreview({
  nodeId, toolRef, output, error, config, duration_ms,
}: NodeInlinePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isVisible = useIsVisible(containerRef)
  const { expandedNodes, toggleExpand, openFullscreen, cachePreview, previewCache } = usePreviewStore()
  const isExpanded = expandedNodes.has(nodeId)

  // Detect preview type (cached)
  const payload: PreviewPayload = useMemo(() => {
    const cached = previewCache.get(nodeId)
    if (cached) return cached
    const detected = detectPreviewType(toolRef, output, config)
    cachePreview(nodeId, detected)
    return detected
  }, [toolRef, output, config, nodeId, previewCache, cachePreview])

  const summary = useMemo(() => getPreviewSummary(payload), [payload])

  if (error) {
    return (
      <div ref={containerRef} className="border-t border-neutral-800">
        <ErrorPreview error={error} />
      </div>
    )
  }

  if (output === undefined || output === null) return null

  return (
    <div
      ref={containerRef}
      className="border-t border-neutral-800"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-neutral-800/50 text-[9px] text-neutral-400"
        onClick={() => toggleExpand(nodeId)}
      >
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="flex-1 truncate">{summary}</span>
        {duration_ms !== undefined && (
          <span className="text-neutral-500">{duration_ms}ms</span>
        )}
        <button
          className="hover:text-white p-0.5"
          onClick={e => { e.stopPropagation(); openFullscreen(nodeId) }}
          title="Fullscreen"
        >
          <Maximize2 size={10} />
        </button>
      </div>

      {/* Preview content */}
      {isExpanded && isVisible && (
        <div className="overflow-hidden" style={{ maxHeight: 200 }}>
          <Suspense fallback={<PreviewSkeleton />}>
            <PreviewRenderer payload={payload} mode="inline" />
          </Suspense>
        </div>
      )}
    </div>
  )
})

function PreviewRenderer({ payload, mode }: { payload: PreviewPayload; mode: 'inline' | 'fullscreen' }) {
  const props: PreviewRendererProps = {
    data: payload.data,
    metadata: payload.metadata,
    mode,
  }

  switch (payload.type) {
    case 'text': return <TextPreview {...props} />
    case 'code': return <CodePreview {...props} />
    case 'json': return <JsonTreePreview {...props} />
    case 'markdown': return <MarkdownPreview {...props} />
    case 'csv-table': return <CsvTablePreview {...props} />
    case 'image': return <ImagePreview {...props} />
    case 'pdf': return <PdfPreview {...props} />
    case 'html': return <HtmlPreview {...props} />
    case 'geojson': return <GeoJsonPreview {...props} />
    case 'audio':
    case 'video': return <AudioVideoPreview {...props} />
    case 'chart': return <ChartPreview {...props} />
    case 'error': return <ErrorPreview error={String(payload.data)} />
    default: return <TextPreview {...props} />
  }
}

// Re-export PreviewRenderer for fullscreen modal
export { PreviewRenderer }
