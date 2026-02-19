/**
 * Stream Handler — 스트리밍 응답 처리
 *
 * LLM 응답, MCP 스트리밍 등 점진적 데이터 수신을 처리한다.
 * UI 업데이트와 상태 관리를 위한 유틸리티 제공.
 */

export interface StreamChunk {
  type: 'text' | 'json' | 'image' | 'status' | 'error'
  content: string | object
  timestamp: number
}

export interface StreamOptions {
  onChunk?: (chunk: StreamChunk) => void
  onComplete?: (fullContent: string) => void
  onError?: (error: Error) => void
  /** 텍스트 청크 디바운스 (ms) */
  debounceMs?: number
}

/**
 * 스트리밍 핸들러 클래스
 */
export class StreamHandler {
  private chunks: StreamChunk[] = []
  private options: StreamOptions
  private fullText = ''
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingText = ''

  constructor(options: StreamOptions = {}) {
    this.options = options
  }

  /**
   * 텍스트 청크 추가
   */
  addText(text: string): void {
    const chunk: StreamChunk = {
      type: 'text',
      content: text,
      timestamp: Date.now(),
    }
    this.chunks.push(chunk)
    this.fullText += text

    if (this.options.debounceMs) {
      this.pendingText += text
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }
      this.debounceTimer = setTimeout(() => {
        this.options.onChunk?.({ ...chunk, content: this.pendingText })
        this.pendingText = ''
      }, this.options.debounceMs)
    } else {
      this.options.onChunk?.(chunk)
    }
  }

  /**
   * JSON 청크 추가
   */
  addJSON(data: object): void {
    const chunk: StreamChunk = {
      type: 'json',
      content: data,
      timestamp: Date.now(),
    }
    this.chunks.push(chunk)
    this.options.onChunk?.(chunk)
  }

  /**
   * 이미지 청크 추가
   */
  addImage(base64Data: string, mimeType = 'image/png'): void {
    const chunk: StreamChunk = {
      type: 'image',
      content: { data: base64Data, mimeType },
      timestamp: Date.now(),
    }
    this.chunks.push(chunk)
    this.options.onChunk?.(chunk)
  }

  /**
   * 상태 메시지 추가
   */
  addStatus(message: string): void {
    const chunk: StreamChunk = {
      type: 'status',
      content: message,
      timestamp: Date.now(),
    }
    this.chunks.push(chunk)
    this.options.onChunk?.(chunk)
  }

  /**
   * 에러 추가
   */
  addError(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error
    const chunk: StreamChunk = {
      type: 'error',
      content: errorMessage,
      timestamp: Date.now(),
    }
    this.chunks.push(chunk)
    this.options.onError?.(error instanceof Error ? error : new Error(errorMessage))
  }

  /**
   * 스트림 완료
   */
  complete(): void {
    // 남은 디바운스 처리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      if (this.pendingText) {
        this.options.onChunk?.({
          type: 'text',
          content: this.pendingText,
          timestamp: Date.now(),
        })
      }
    }
    this.options.onComplete?.(this.fullText)
  }

  /**
   * 전체 텍스트 반환
   */
  getFullText(): string {
    return this.fullText
  }

  /**
   * 모든 청크 반환
   */
  getChunks(): StreamChunk[] {
    return [...this.chunks]
  }

  /**
   * 특정 타입의 청크만 반환
   */
  getChunksByType(type: StreamChunk['type']): StreamChunk[] {
    return this.chunks.filter((c) => c.type === type)
  }

  /**
   * 스트림 초기화
   */
  reset(): void {
    this.chunks = []
    this.fullText = ''
    this.pendingText = ''
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }
}

/**
 * 스트리밍 핸들러 생성 팩토리
 */
export function createStreamHandler(options?: StreamOptions): StreamHandler {
  return new StreamHandler(options)
}

/**
 * SSE (Server-Sent Events) 파싱 유틸리티
 */
export function parseSSELine(line: string): { event?: string; data?: string } | null {
  if (!line.trim() || line.startsWith(':')) return null

  const result: { event?: string; data?: string } = {}

  if (line.startsWith('event:')) {
    result.event = line.slice(6).trim()
  } else if (line.startsWith('data:')) {
    result.data = line.slice(5).trim()
  }

  return Object.keys(result).length > 0 ? result : null
}

/**
 * NDJSON (Newline-delimited JSON) 파싱 유틸리티
 */
export function* parseNDJSON(text: string): Generator<unknown> {
  const lines = text.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {
      // 파싱 실패한 줄은 무시
    }
  }
}
