import { memo } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

export const AudioVideoPreview = memo(function AudioVideoPreview({ data, metadata, mode }: PreviewRendererProps) {
  const src = typeof data === 'string'
    ? data
    : (data as Record<string, unknown>)?.['path'] as string ?? ''

  const isAudio = metadata.mimeType?.startsWith('audio') ?? true

  if (isAudio) {
    return (
      <div className="p-2">
        <audio src={src} controls className="w-full h-8" preload="metadata" />
      </div>
    )
  }

  return (
    <div className="p-1">
      <video
        src={src}
        controls
        className="w-full rounded"
        style={{ maxHeight: mode === 'inline' ? 150 : '80vh' }}
        preload="metadata"
      />
    </div>
  )
})
