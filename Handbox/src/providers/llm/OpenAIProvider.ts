/**
 * OpenAI LLM Provider — OpenAI API 직접 호출
 *
 * fetch()로 OpenAI REST API를 직접 호출.
 * API 키는 appStore의 AIModelConfig에서 관리.
 */

import type { LLMRequest, LLMResponse } from '../../engine/types'
import type { LLMProvider, ModelInfo } from '../../registry/ProviderRegistry'

const OPENAI_API_URL = 'https://api.openai.com/v1'

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  readonly icon = 'SmartToy'

  private apiKey = ''
  private connected = false

  async connect(credentials: Record<string, any>): Promise<boolean> {
    this.apiKey = credentials.apiKey || credentials.api_key || ''
    if (!this.apiKey) {
      this.connected = false
      return false
    }

    // API 키 검증: 모델 목록 조회
    try {
      const response = await fetch(`${OPENAI_API_URL}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      this.connected = response.ok
      return this.connected
    } catch {
      this.connected = false
      return false
    }
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
      { id: 'gpt-4o', name: 'GPT-4o', description: '가장 빠른 GPT-4 급 모델', maxTokens: 128000, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '경제적인 GPT-4o', maxTokens: 128000, supportsVision: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: '강력한 범용 모델', maxTokens: 128000, supportsVision: true },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '빠르고 경제적', maxTokens: 16385 },
      { id: 'o1', name: 'o1', description: '추론 특화 모델', maxTokens: 200000 },
      { id: 'o1-mini', name: 'o1 Mini', description: '경제적 추론 모델', maxTokens: 128000 },
    ]
  }

  async invoke(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다')
    }

    const messages: Array<{ role: string; content: string }> = []
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt })
    }
    messages.push({ role: 'user', content: request.prompt })

    const response = await fetch(`${OPENAI_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || 'gpt-4o',
        messages,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        top_p: request.topP,
        stop: request.stopSequences,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API Error [${response.status}]: ${errorText}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const usage = data.usage || {}

    return {
      text: choice?.message?.content || '',
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      },
      model: data.model || request.model || 'gpt-4o',
      finishReason: choice?.finish_reason,
    }
  }
}
