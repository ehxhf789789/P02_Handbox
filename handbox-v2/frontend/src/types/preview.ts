/** Preview content types detected from tool output */
export type PreviewContentType =
  | 'text'
  | 'markdown'
  | 'html'
  | 'code'
  | 'json'
  | 'csv-table'
  | 'image'
  | 'pdf'
  | 'geojson'
  | 'audio'
  | 'video'
  | 'chart'
  | 'error'

export interface PreviewPayload {
  type: PreviewContentType
  data: unknown
  metadata: {
    toolRef: string
    mimeType?: string
    fileName?: string
    fileSize?: number
    duration_ms?: number
    truncated?: boolean
    language?: string  // for code preview
    rowCount?: number  // for csv
    pageCount?: number // for pdf
  }
}

export interface PreviewRendererProps {
  data: unknown
  metadata: PreviewPayload['metadata']
  mode: 'inline' | 'fullscreen'
  width?: number
  height?: number
}
