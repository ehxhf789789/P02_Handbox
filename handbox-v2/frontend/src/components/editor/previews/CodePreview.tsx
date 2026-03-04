import { memo, useEffect, useRef } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import type { PreviewRendererProps } from '@/types/preview'

export const CodePreview = memo(function CodePreview({ data, metadata, mode }: PreviewRendererProps) {
  const ref = useRef<HTMLElement>(null)
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const lang = metadata.language ?? 'text'
  const maxLines = mode === 'inline' ? 12 : Infinity
  const lines = text.split('\n')
  const display = lines.length > maxLines ? lines.slice(0, maxLines).join('\n') + '\n...' : text

  useEffect(() => {
    if (ref.current) Prism.highlightElement(ref.current)
  }, [display, lang])

  return (
    <pre className="text-[10px] leading-tight p-2 overflow-auto" style={{ maxHeight: mode === 'inline' ? 160 : undefined }}>
      <code ref={ref} className={`language-${lang}`}>
        {display}
      </code>
    </pre>
  )
})
