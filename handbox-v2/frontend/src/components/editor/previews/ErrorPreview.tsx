import { memo } from 'react'

export const ErrorPreview = memo(function ErrorPreview({ error }: { error: string }) {
  return (
    <pre className="text-[10px] leading-tight text-red-400 whitespace-pre-wrap break-words p-2 font-mono">
      {error}
    </pre>
  )
})
