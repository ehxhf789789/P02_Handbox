import { memo } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

/** PDF Preview — shows metadata in inline mode. Full rendering requires pdfjs worker setup. */
export const PdfPreview = memo(function PdfPreview({ data, metadata, mode }: PreviewRendererProps) {
  const obj = typeof data === 'object' && data ? data as Record<string, unknown> : {}
  const pages = metadata.pageCount ?? (obj['pages'] as number) ?? '?'
  const text = (obj['text'] ?? obj['content'] ?? '') as string
  const maxChars = mode === 'inline' ? 500 : 3000
  const display = text.length > maxChars ? text.slice(0, maxChars) + '\n...' : text

  return (
    <div className="p-2">
      <div className="text-[10px] text-neutral-400 mb-1 flex items-center gap-1">
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        PDF - {pages} pages
      </div>
      {display && (
        <pre className="text-[9px] leading-tight text-neutral-300 whitespace-pre-wrap break-words overflow-auto"
          style={{ maxHeight: mode === 'inline' ? 120 : undefined }}>
          {display}
        </pre>
      )}
    </div>
  )
})
