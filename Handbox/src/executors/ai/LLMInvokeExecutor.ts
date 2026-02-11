/**
 * LLMInvoke Executor — 범용 LLM 호출
 *
 * Provider 추상화를 통해 여러 LLM 백엔드 지원.
 * 현재: ProviderRegistry의 활성 LLM Provider를 사용.
 * 향후: Bedrock, OpenAI, Anthropic, Ollama 등 자동 전환.
 *
 * 레거시 호환: 직접 Tauri invoke_bedrock 호출도 지원.
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'
import { ProviderRegistry } from '../../registry/ProviderRegistry'

/** 선행 노드 출력에서 텍스트를 추출 */
function extractInputText(input: Record<string, any>): string {
  if (input.text && typeof input.text === 'string') return input.text
  if (input.prompt && typeof input.prompt === 'string') return input.prompt
  if (input.content && typeof input.content === 'string') return input.content

  const predecessors: Record<string, any>[] = input._predecessors || []
  for (const pred of predecessors) {
    if (pred?.text) return pred.text
    if (pred?.prompt) return pred.prompt
    if (pred?.content) return pred.content
  }

  return ''
}

/** Bedrock 모델 ID 매핑 */
const BEDROCK_MODEL_MAP: Record<string, string> = {
  'claude-3.5-sonnet': 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0',
  'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
  'claude-3.5-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, any>,
    config: Record<string, any>,
    context: ExecutionContext,
  ): Promise<Record<string, any>> {
    const inputText = extractInputText(input)
    const systemPrompt = config.system_prompt || '당신은 유용한 AI 어시스턴트입니다.'
    const maxInputChars = config.max_input_chars || 100000
    const rawPrompt = inputText || config.prompt || ''
    const userPrompt = rawPrompt.length > maxInputChars
      ? rawPrompt.slice(0, maxInputChars) + `\n\n[... 총 ${rawPrompt.length}자 중 ${maxInputChars}자까지 포함됨]`
      : rawPrompt

    if (!userPrompt) {
      return { error: '입력 프롬프트가 없습니다', status: '프롬프트 없음' }
    }

    // Provider Registry에서 활성 LLM 프로바이더 확인
    const providerId = config.provider || context.defaultLLMProvider
    const provider = ProviderRegistry.getLLMProvider(providerId)

    if (provider && provider.isConnected()) {
      // Provider 기반 호출
      const response = await provider.invoke({
        model: config.model || '',
        prompt: userPrompt,
        systemPrompt,
        maxTokens: config.max_tokens || 4096,
        temperature: config.temperature || 0.7,
      })

      return {
        text: response.text,
        response: response.text,
        model: response.model,
        tokens_used: response.usage.inputTokens + response.usage.outputTokens,
        usage: response.usage,
        status: '응답 생성 완료',
      }
    }

    // 레거시 폴백: Tauri invoke_bedrock 직접 호출
    const modelId = config.model_id
      || BEDROCK_MODEL_MAP[config.model || '']
      || 'anthropic.claude-3-5-sonnet-20240620-v1:0'

    const bedrockResult = await invoke<{
      response: string
      usage: { input_tokens: number; output_tokens: number }
    }>('invoke_bedrock', {
      request: {
        model_id: modelId,
        prompt: userPrompt,
        system_prompt: systemPrompt,
        max_tokens: config.max_tokens || 4096,
        temperature: config.temperature || 0.7,
      },
    })

    // JSON 응답 파싱 시도
    if (bedrockResult.response) {
      try {
        const jsonMatch = bedrockResult.response.match(/```json\s*([\s\S]*?)\s*```/)
          || bedrockResult.response.match(/\{[\s\S]*\}/)
        if (jsonMatch && config.parse_json) {
          const parsedData = JSON.parse(jsonMatch[1] || jsonMatch[0])
          return {
            ...parsedData,
            text: bedrockResult.response,
            response: bedrockResult.response,
            tokens_used: bedrockResult.usage.input_tokens + bedrockResult.usage.output_tokens,
            status: '응답 생성 완료 (JSON 파싱)',
          }
        }
      } catch {
        // JSON 파싱 실패 시 텍스트 그대로 반환
      }

      return {
        text: bedrockResult.response,
        response: bedrockResult.response,
        model: modelId,
        tokens_used: bedrockResult.usage.input_tokens + bedrockResult.usage.output_tokens,
        status: '응답 생성 완료',
      }
    }

    throw new Error('LLM 응답 없음')
  },
}

export const LLMInvokeDefinition: NodeDefinition = {
  type: 'ai.llm-invoke',
  category: 'ai',
  meta: {
    label: 'LLM 호출',
    description: 'AI 모델에 프롬프트를 보내고 응답을 받습니다',
    icon: 'Psychology',
    color: '#673AB7',
    tags: ['LLM', 'AI', 'Claude', 'GPT', '모델', 'invoke', 'bedrock', 'openai'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '입력 프롬프트 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'llm-response', required: true, description: 'LLM 응답 텍스트' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', description: '비워두면 기본 프로바이더 사용' },
    { key: 'model', label: '모델', type: 'model', description: '모델 선택' },
    { key: 'model_id', label: '모델 ID (직접 지정)', type: 'text', placeholder: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'code', language: 'markdown', rows: 5, default: '당신은 유용한 AI 어시스턴트입니다.' },
    { key: 'prompt', label: '사용자 프롬프트 (입력 없을 때)', type: 'code', language: 'markdown', rows: 3 },
    { key: 'temperature', label: '온도', type: 'slider', default: 0.7, min: 0, max: 1, step: 0.1 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 4096, min: 1, max: 200000 },
    { key: 'parse_json', label: 'JSON 파싱', type: 'toggle', default: false, description: '응답에서 JSON을 자동 추출합니다' },
    { key: 'max_input_chars', label: '최대 입력 문자', type: 'number', default: 100000 },
  ],
  runtime: 'tauri',
  executor,
  requirements: {
    provider: 'aws',
  },
}
