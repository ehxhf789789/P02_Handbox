import { memo, Suspense, lazy } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Maximize2 } from 'lucide-react'
import { usePreviewStore } from '@/stores/previewStore'
import { useExecutionStore } from '@/stores/executionStore'
import { detectPreviewType, getPreviewSummary } from '@/services/PreviewDetector'
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

const MarkdownPreview = lazy(() => import('./MarkdownPreview').then(m => ({ default: m.MarkdownPreview })))
const CsvTablePreview = lazy(() => import('./CsvTablePreview').then(m => ({ default: m.CsvTablePreview })))

function FullscreenRenderer({ payload }: { payload: PreviewPayload }) {
  const props: PreviewRendererProps = {
    data: payload.data,
    metadata: payload.metadata,
    mode: 'fullscreen',
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

export const FullscreenPreviewModal = memo(function FullscreenPreviewModal() {
  const { fullscreenNodeId, closeFullscreen } = usePreviewStore()
  const nodeDetails = useExecutionStore((s) => s.nodeDetails)

  if (!fullscreenNodeId) return null

  const detail = nodeDetails[fullscreenNodeId]
  if (!detail) return null

  const output = detail.output
  const error = detail.error

  // Detect preview type
  const payload: PreviewPayload = error
    ? { type: 'error', data: error, metadata: { toolRef: '' } }
    : detectPreviewType('', output, undefined)

  const summary = getPreviewSummary(payload)

  return (
    <Dialog.Root open={!!fullscreenNodeId} onOpenChange={(open) => { if (!open) closeFullscreen() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed z-[9999] inset-4 flex flex-col bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
          onPointerDownOutside={() => closeFullscreen()}
          onEscapeKeyDown={() => closeFullscreen()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-700 bg-neutral-800/50">
            <Maximize2 size={16} className="text-neutral-400" />
            <span className="text-sm font-medium text-neutral-200 flex-1 truncate">
              {summary}
            </span>
            {detail.duration_ms !== undefined && (
              <span className="text-xs text-neutral-500">{detail.duration_ms}ms</span>
            )}
            <Dialog.Close asChild>
              <button
                className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            <Suspense fallback={<PreviewSkeleton />}>
              <FullscreenRenderer payload={payload} />
            </Suspense>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
