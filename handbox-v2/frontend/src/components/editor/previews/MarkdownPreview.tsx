import { memo, useMemo } from 'react'
import { marked } from 'marked'
import type { PreviewRendererProps } from '@/types/preview'

export const MarkdownPreview = memo(function MarkdownPreview({ data, mode }: PreviewRendererProps) {
  const text = typeof data === 'string' ? data : (data as Record<string, unknown>)?.['text'] as string ?? ''
  const maxChars = mode === 'inline' ? 1000 : Infinity
  const truncated = text.length > maxChars ? text.slice(0, maxChars) + '\n\n...' : text

  const html = useMemo(() => {
    try {
      return marked.parse(truncated, { async: false }) as string
    } catch {
      return `<pre>${truncated}</pre>`
    }
  }, [truncated])

  return (
    <div
      className="preview-markdown text-[10px] leading-tight p-2 overflow-auto prose prose-invert prose-xs max-w-none"
      style={{ maxHeight: mode === 'inline' ? 160 : undefined }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
