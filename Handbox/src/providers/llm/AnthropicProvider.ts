/**
 * Anthropic LLM Provider — Anthropic Messages API 직접 호출
 *
 * fetch()로 Anthropic REST API를 직접 호출.
 * Bedrock이 아닌 Anthropic 직접 API 키 사용 시 사용.
 */

import type { LLMRequest, LLMResponse } from '../../engine/types'
import type { LLMProvider, ModelInfo } from '../../registry/ProviderRegistry'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1'

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic (Direct)'
  readonly icon = 'Psychology'

  private apiKey = ''
  private connected = false

  async connect(credentials: Record<string, any>): Promise<boolean> {
    this.apiKey = credentials.apiKey || credentials.api_key || ''
    if (!this.apiKey) {
      this.connected = false
      return false
    }

    // 간단한 API 키 형식 검증
    this.connected = this.apiKey.startsWith('sk-ant-')
    return this.connected
  }

  disconnect(): void {
    this.apiKey = ''
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected && !!this.apiKey
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', description: '최신 밸런스 모델', maxTokens: 200000, supportsVision: true },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', description: '최고 성능 모델', maxTokens: 200000, supportsVision: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: '빠르고 지능적인 모델', maxTokens: 200000, supportsVision: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: '빠르고 경제적', maxTokens: 200000, supportsVision: true },
    ]
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API 키가 설정되지 않았습니다')
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: request.prompt },
    ]

    const body: Record<string, any> = {
      model: request.model || 'claude-sonnet-4-5-20250929',
      messages,
      max_tokens: request.maxTokens || 4096,
    }

    if (request.systemPrompt) {
      body.system = request.systemPrompt
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }
    if (request.topP !== undefined) {
      body.top_p = request.topP
    }
    if (request.stopSequences) {
      body.stop_sequences = request.stopSequences
    }

    const response = await fetch(`${ANTHROPIC_API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Anthropic API Error [${response.status}]: ${errorText}`)
    }

    const data = await response.json()
    const textContent = data.content?.find((c: any) => c.type === 'text')

    return {
      text: textContent?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      model: data.model || request.model || '',
      finishReason: data.stop_reason,
    }
  }
}
