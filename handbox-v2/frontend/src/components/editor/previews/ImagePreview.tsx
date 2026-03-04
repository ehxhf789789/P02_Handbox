import { memo, useState } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

export const ImagePreview = memo(function ImagePreview({ data, mode }: PreviewRendererProps) {
  const [error, setError] = useState(false)

  const src = typeof data === 'string'
    ? data
    : (data as Record<string, unknown>)?.['base64']
      ? `data:image/png;base64,${(data as Record<string, unknown>)['base64']}`
      : (data as Record<string, unknown>)?.['path']
        ? String((data as Record<string, unknown>)['path'])
        : ''

  if (!src || error) {
    return <div className="p-2 text-[10px] text-neutral-500">Image not available</div>
  }

  return (
    <div className="p-1 flex items-center justify-center" style={{ maxHeight: mode === 'inline' ? 160 : undefined }}>
      <img
        src={src}
        alt="Preview"
        className="max-w-full object-contain rounded"
        style={{ maxHeight: mode === 'inline' ? 150 : '80vh' }}
        onError={() => setError(true)}
      />
    </div>
  )
})
