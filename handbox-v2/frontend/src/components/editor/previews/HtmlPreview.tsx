import { memo } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

export const HtmlPreview = memo(function HtmlPreview({ data, mode }: PreviewRendererProps) {
  const html = typeof data === 'string'
    ? data
    : (data as Record<string, unknown>)?.['content'] as string ?? ''

  return (
    <iframe
      srcDoc={html}
      sandbox="allow-same-origin"
      className="w-full border-0 bg-white rounded"
      style={{ height: mode === 'inline' ? 150 : '80vh' }}
      title="HTML Preview"
    />
  )
})
