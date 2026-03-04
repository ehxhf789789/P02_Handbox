import { memo } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

function extractText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    return String(obj['text'] ?? obj['content'] ?? obj['result'] ?? JSON.stringify(data, null, 2))
  }
  return String(data ?? '')
}

export const TextPreview = memo(function TextPreview({ data, mode }: PreviewRendererProps) {
  const text = extractText(data)
  const maxLen = mode === 'inline' ? 500 : Infinity
  const display = text.length > maxLen ? text.slice(0, maxLen) + '...' : text

  return (
    <pre className="text-[10px] leading-tight text-neutral-300 whitespace-pre-wrap break-words p-2 font-mono">
      {display}
    </pre>
  )
})
