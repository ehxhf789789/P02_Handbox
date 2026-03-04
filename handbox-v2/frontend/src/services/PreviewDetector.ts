import type { PreviewPayload, PreviewContentType } from '@/types/preview'

/** Detect the appropriate preview type from tool output */
export function detectPreviewType(
  toolRef: string,
  output: unknown,
  config?: Record<string, unknown>,
): PreviewPayload {
  const meta = {
    toolRef,
    mimeType: undefined as string | undefined,
    fileName: undefined as string | undefined,
    fileSize: undefined as number | undefined,
    language: undefined as string | undefined,
    rowCount: undefined as number | undefined,
    pageCount: undefined as number | undefined,
  }

  // 1. Explicit tool mapping
  const toolTypeMap: Record<string, PreviewContentType> = {
    'csv-read': 'csv-table',
    'pdf-read': 'pdf',
    'gis-read': 'geojson',
    'geojson-read': 'geojson',
    'embedding': 'json',
    'json-parse': 'json',
    'json-path': 'json',
    'data-filter': 'json',
    'vector-search': 'json',
    'reranker': 'json',
  }

  if (toolRef in toolTypeMap) {
    const type = toolTypeMap[toolRef]!
    if (type === 'csv-table' && isObject(output)) {
      meta.rowCount = (output as Record<string, unknown>)['row_count'] as number
    }
    if (type === 'pdf' && isObject(output)) {
      meta.pageCount = (output as Record<string, unknown>)['pages'] as number
    }
    return { type, data: output, metadata: meta }
  }

  // 2. Config hints (display-output with format)
  if (toolRef === 'display-output' && config?.format) {
    const fmt = String(config.format).toLowerCase()
    if (fmt === 'markdown' || fmt === 'md') return { type: 'markdown', data: output, metadata: meta }
    if (fmt === 'html') return { type: 'html', data: output, metadata: meta }
    if (fmt === 'json') return { type: 'json', data: output, metadata: meta }
    if (fmt === 'code') return { type: 'code', data: output, metadata: meta }
  }

  // 3. Content sniffing
  const text = extractText(output)

  // Image detection (base64 data URL or file paths)
  if (text.startsWith('data:image/') || /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(text.trim())) {
    return { type: 'image', data: output, metadata: { ...meta, mimeType: 'image/*' } }
  }

  // Audio/Video detection
  if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(text.trim())) {
    return { type: 'audio', data: output, metadata: { ...meta, mimeType: 'audio/*' } }
  }
  if (/\.(mp4|webm|avi|mov|mkv)$/i.test(text.trim())) {
    return { type: 'video', data: output, metadata: { ...meta, mimeType: 'video/*' } }
  }

  // JSON detection
  if (isObject(output) || isArray(output)) {
    return { type: 'json', data: output, metadata: meta }
  }
  if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      return { type: 'json', data: parsed, metadata: meta }
    } catch { /* not valid JSON */ }
  }

  // HTML detection
  if (text.trimStart().startsWith('<') && (text.includes('<html') || text.includes('<div') || text.includes('<table'))) {
    return { type: 'html', data: output, metadata: meta }
  }

  // Markdown detection (heuristic)
  if (/^#{1,6}\s/m.test(text) || /^\*\*[^*]+\*\*/m.test(text) || /^-\s/m.test(text) || text.includes('```')) {
    return { type: 'markdown', data: output, metadata: meta }
  }

  // Code detection
  const codePatterns = [
    /^(import|from|export|const|let|var|function|class|def|fn |pub |use |#include)/m,
    /\{\s*\n.*\n\s*\}/s,
  ]
  if (codePatterns.some(p => p.test(text))) {
    meta.language = detectLanguage(text)
    return { type: 'code', data: output, metadata: meta }
  }

  // GeoJSON detection
  if (text.includes('"type"') && (text.includes('"FeatureCollection"') || text.includes('"Feature"'))) {
    return { type: 'geojson', data: output, metadata: meta }
  }

  // Default: plain text
  return { type: 'text', data: output, metadata: meta }
}

function extractText(output: unknown): string {
  if (typeof output === 'string') return output
  if (isObject(output)) {
    const obj = output as Record<string, unknown>
    return String(obj['text'] ?? obj['content'] ?? obj['result'] ?? JSON.stringify(output))
  }
  return String(output ?? '')
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function detectLanguage(text: string): string {
  if (/^(import|from)\s/.test(text) && /def\s/.test(text)) return 'python'
  if (/^(import|export|const|let|var)\s/.test(text)) return 'typescript'
  if (/^(use |fn |pub |mod |struct |impl )/.test(text)) return 'rust'
  if (/^#include/.test(text)) return 'cpp'
  if (/^package\s/.test(text)) return 'go'
  return 'text'
}

/** Get a short text summary for the collapsed preview header */
export function getPreviewSummary(payload: PreviewPayload): string {
  const { type, data, metadata } = payload
  switch (type) {
    case 'csv-table': return `Table: ${metadata.rowCount ?? '?'} rows`
    case 'pdf': return `PDF: ${metadata.pageCount ?? '?'} pages`
    case 'image': return 'Image'
    case 'json': {
      const keys = isObject(data) ? Object.keys(data as Record<string, unknown>) : []
      return keys.length > 0 ? `JSON: {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}` : 'JSON'
    }
    case 'markdown': return `Markdown (${extractText(data).length} chars)`
    case 'html': return `HTML preview`
    case 'code': return `Code (${metadata.language ?? 'text'})`
    case 'geojson': return 'GeoJSON map'
    case 'audio': return 'Audio'
    case 'video': return 'Video'
    case 'chart': return 'Chart'
    case 'error': return 'Error'
    default: {
      const text = extractText(data)
      return text.length > 80 ? text.slice(0, 80) + '...' : text || '(empty)'
    }
  }
}
