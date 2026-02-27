/**
 * LLM Tools - LLM 호출/임베딩
 *
 * 원자화된 LLM 도구 10개:
 * - llm.chat         : 채팅 완성
 * - llm.complete     : 텍스트 완성
 * - llm.embed        : 임베딩 생성
 * - llm.classify     : 텍스트 분류
 * - llm.summarize    : 요약
 * - llm.translate    : 번역
 * - llm.extract      : 정보 추출
 * - llm.generate     : 텍스트 생성
 * - llm.rewrite      : 텍스트 재작성
 * - llm.structured   : 구조화된 출력
 */

import { invoke } from '@tauri-apps/api/tauri'
import type {
  UnifiedToolDefinition,
  ToolExecutor,
  ToolResult,
  ToolExecutionContext,
} from '../registry/UnifiedToolDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

// ============================================================
// Helper: LLM Invocation
// ============================================================

async function invokeLLM(
  prompt: string,
  systemPrompt: string | undefined,
  config: Record<string, unknown>
): Promise<{ text: string; tokensUsed?: number; model?: string }> {
  const providerId = (config.provider || 'bedrock') as string
  const model = (config.model || 'claude-3-5-sonnet') as string
  const temperature = (config.temperature ?? 0.7) as number
  const maxTokens = (config.maxTokens || config.max_tokens || 4096) as number

  try {
    // Try ProviderRegistry first
    const provider = ProviderRegistry.getLLMProvider(providerId)
    if (provider) {
      const response = await provider.invoke({
        model,
        prompt,
        systemPrompt: systemPrompt || undefined,
        temperature,
        maxTokens,
      })
      return {
        text: response.text,
        tokensUsed: response.usage?.totalTokens,
        model,
      }
    }

    // Fallback to Tauri invoke
    const result = await invoke<{
      content: string
      tokens_used?: number
      model?: string
    }>('invoke_llm', {
      provider: providerId,
      model,
      prompt,
      systemPrompt: systemPrompt || null,
      temperature,
      maxTokens,
    })

    return {
      text: result.content,
      tokensUsed: result.tokens_used,
      model: result.model,
    }
  } catch (error) {
    // Return mock response for development
    console.warn('[LLM] Invocation failed, using mock:', error)
    return {
      text: `[Mock Response] ${prompt.slice(0, 100)}...`,
      tokensUsed: 0,
      model: 'mock',
    }
  }
}

// ============================================================
// llm.chat - 채팅 완성
// ============================================================

const llmChatExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()

    // Support multiple input names
    const prompt = (inputs.prompt || inputs.message || inputs.text || inputs.content || config.prompt || '') as string
    const systemPrompt = (inputs.systemPrompt || inputs.system || config.systemPrompt || config.system_prompt) as string | undefined
    const context = inputs.context as string | undefined

    if (!prompt) {
      return { success: false, outputs: {}, error: '프롬프트가 필요합니다' }
    }

    try {
      // Build full prompt with context if provided
      let fullPrompt = prompt
      if (context) {
        fullPrompt = `Context:\n${context}\n\nQuestion:\n${prompt}`
      }
      if (config.prompt_template) {
        fullPrompt = (config.prompt_template as string)
          .replace(/\{\{prompt\}\}/g, prompt)
          .replace(/\{\{context\}\}/g, context || '')
          .replace(/\{\{text\}\}/g, prompt)
      }

      const result = await invokeLLM(fullPrompt, systemPrompt, config)

      return {
        success: true,
        outputs: {
          text: result.text,
          response: result.text,
          content: result.text,
          tokensUsed: result.tokensUsed,
          model: result.model,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          tokensUsed: result.tokensUsed,
        },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `LLM 호출 실패: ${error}` }
    }
  },
}

export const llmChat: UnifiedToolDefinition = {
  name: 'llm.chat',
  version: '1.0.0',
  description: 'LLM에 프롬프트를 보내고 응답을 받습니다. 채팅, 질문 응답, 분석 등에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '사용자 프롬프트' },
      systemPrompt: { type: 'string', description: '시스템 프롬프트' },
      context: { type: 'string', description: '컨텍스트 (RAG 결과 등)' },
      temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
      maxTokens: { type: 'number', default: 4096 },
    },
    required: ['prompt'],
  },
  meta: {
    label: 'LLM 채팅',
    description: 'LLM에 프롬프트를 보냅니다',
    icon: 'Psychology',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'chat', 'ai', 'claude', 'gpt', '채팅', 'AI'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true, description: '입력 프롬프트' },
      { name: 'systemPrompt', type: 'text', required: false, description: '시스템 프롬프트' },
      { name: 'context', type: 'text', required: false, description: '컨텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: 'LLM 응답' },
      { name: 'response', type: 'text', required: false, description: '응답 (alias)' },
      { name: 'tokensUsed', type: 'number', required: false, description: '사용된 토큰' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 3 },
    { key: 'prompt_template', label: '프롬프트 템플릿', type: 'textarea', rows: 5, description: '{{prompt}}, {{context}} 변수 사용 가능' },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 4096 },
  ],
  runtime: 'tauri',
  requirements: { providers: ['bedrock', 'openai'] },
  executor: llmChatExecutor,
}

// ============================================================
// llm.embed - 임베딩 생성
// ============================================================

const llmEmbedExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.content || '') as string
    const texts = inputs.texts as string[] | undefined

    const textsToEmbed = texts || (text ? [text] : [])
    if (textsToEmbed.length === 0) {
      return { success: false, outputs: {}, error: '임베딩할 텍스트가 필요합니다' }
    }

    try {
      const providerId = (config.provider || 'bedrock') as string
      const model = (config.model || 'titan-embed-text') as string

      // Try ProviderRegistry first
      const provider = ProviderRegistry.getEmbeddingProvider(providerId)
      if (provider) {
        const response = await provider.embed({ texts: textsToEmbed, model })
        return {
          success: true,
          outputs: {
            embeddings: response.embeddings,
            embedding: response.embeddings[0],
            dimensions: response.dimension,
            count: response.embeddings.length,
          },
          metadata: { executionTime: Date.now() - startTime },
        }
      }

      // Fallback to Tauri invoke
      const result = await invoke<{
        embeddings: number[][]
        dimensions: number
      }>('create_embeddings', {
        texts: textsToEmbed,
        model,
      })

      return {
        success: true,
        outputs: {
          embeddings: result.embeddings,
          embedding: result.embeddings[0],
          dimensions: result.dimensions,
          count: result.embeddings.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      // Mock embeddings for development
      const mockEmbeddings = textsToEmbed.map(() => Array(1536).fill(0).map(() => Math.random() - 0.5))
      return {
        success: true,
        outputs: {
          embeddings: mockEmbeddings,
          embedding: mockEmbeddings[0],
          dimensions: 1536,
          count: mockEmbeddings.length,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    }
  },
}

export const llmEmbed: UnifiedToolDefinition = {
  name: 'llm.embed',
  version: '1.0.0',
  description: '텍스트의 임베딩 벡터를 생성합니다. 유사도 검색, 클러스터링에 사용.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '임베딩할 텍스트' },
      texts: { type: 'array', items: { type: 'string' }, description: '임베딩할 텍스트 배열' },
    },
  },
  meta: {
    label: '임베딩 생성',
    description: '텍스트 임베딩을 생성합니다',
    icon: 'Hub',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'embed', 'embedding', 'vector', '임베딩'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: false, description: '입력 텍스트' },
      { name: 'texts', type: 'json', required: false, description: '텍스트 배열' },
    ],
    outputs: [
      { name: 'embedding', type: 'vector', required: true, description: '임베딩 벡터' },
      { name: 'embeddings', type: 'json', required: false, description: '임베딩 배열' },
      { name: 'dimensions', type: 'number', required: false, description: '차원 수' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '임베딩 모델', type: 'model', default: 'titan-embed-text' },
  ],
  runtime: 'tauri',
  executor: llmEmbedExecutor,
}

// ============================================================
// llm.summarize - 요약
// ============================================================

const llmSummarizeExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.content || '') as string
    const style = (config.style || 'concise') as string
    const maxLength = config.maxLength as number | undefined

    if (!text) {
      return { success: false, outputs: {}, error: '요약할 텍스트가 필요합니다' }
    }

    try {
      const stylePrompts: Record<string, string> = {
        concise: '핵심 내용만 간결하게',
        detailed: '세부 사항을 포함하여 상세하게',
        bullet: '글머리 기호(-)로 핵심 포인트 나열',
        executive: '경영진을 위한 핵심 요약',
      }

      const lengthInstruction = maxLength ? ` 약 ${maxLength}자 이내로.` : ''
      const prompt = `다음 텍스트를 ${stylePrompts[style] || '간결하게'} 요약해주세요.${lengthInstruction}\n\n텍스트:\n${text}`

      const result = await invokeLLM(prompt, undefined, { ...config, temperature: 0.3 })

      return {
        success: true,
        outputs: {
          summary: result.text,
          text: result.text,
          originalLength: text.length,
          summaryLength: result.text.length,
          compressionRatio: (result.text.length / text.length * 100).toFixed(1) + '%',
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `요약 실패: ${error}` }
    }
  },
}

export const llmSummarize: UnifiedToolDefinition = {
  name: 'llm.summarize',
  version: '1.0.0',
  description: '텍스트를 요약합니다. 다양한 요약 스타일을 지원합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '요약할 텍스트' },
      style: { type: 'string', enum: ['concise', 'detailed', 'bullet', 'executive'], default: 'concise' },
      maxLength: { type: 'number', description: '최대 길이' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 요약',
    description: '텍스트를 요약합니다',
    icon: 'Summarize',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'summarize', 'summary', '요약'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'summary', type: 'text', required: true, description: '요약 결과' },
      { name: 'compressionRatio', type: 'text', required: false, description: '압축률' },
    ],
  },
  configSchema: [
    {
      key: 'style', label: '요약 스타일', type: 'select', default: 'concise',
      options: [
        { value: 'concise', label: '간결하게' },
        { value: 'detailed', label: '상세하게' },
        { value: 'bullet', label: '글머리 기호' },
        { value: 'executive', label: '경영진 요약' },
      ],
    },
    { key: 'maxLength', label: '최대 길이', type: 'number' },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmSummarizeExecutor,
}

// ============================================================
// llm.translate - 번역
// ============================================================

const llmTranslateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const targetLanguage = (config.targetLanguage || 'ko') as string
    const sourceLanguage = config.sourceLanguage as string | undefined

    if (!text) {
      return { success: false, outputs: {}, error: '번역할 텍스트가 필요합니다' }
    }

    try {
      const languageNames: Record<string, string> = {
        ko: '한국어', en: '영어', ja: '일본어', zh: '중국어',
        es: '스페인어', fr: '프랑스어', de: '독일어', ru: '러시아어',
      }

      const sourceLang = sourceLanguage ? languageNames[sourceLanguage] || sourceLanguage : '자동 감지'
      const targetLang = languageNames[targetLanguage] || targetLanguage

      const prompt = `다음 텍스트를 ${targetLang}로 번역해주세요. 원문의 뉘앙스와 의미를 유지하면서 자연스럽게 번역하세요.\n\n원문${sourceLanguage ? ` (${sourceLang})` : ''}:\n${text}\n\n번역 (${targetLang}):`

      const result = await invokeLLM(prompt, undefined, { ...config, temperature: 0.3 })

      return {
        success: true,
        outputs: {
          translation: result.text.trim(),
          text: result.text.trim(),
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
        },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `번역 실패: ${error}` }
    }
  },
}

export const llmTranslate: UnifiedToolDefinition = {
  name: 'llm.translate',
  version: '1.0.0',
  description: '텍스트를 다른 언어로 번역합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '번역할 텍스트' },
      targetLanguage: { type: 'string', description: '대상 언어 코드', default: 'ko' },
      sourceLanguage: { type: 'string', description: '원본 언어 코드 (생략 시 자동 감지)' },
    },
    required: ['text'],
  },
  meta: {
    label: '번역',
    description: '텍스트를 번역합니다',
    icon: 'Translate',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'translate', 'language', '번역'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'translation', type: 'text', required: true, description: '번역 결과' },
      { name: 'targetLanguage', type: 'text', required: false, description: '대상 언어' },
    ],
  },
  configSchema: [
    {
      key: 'targetLanguage', label: '대상 언어', type: 'select', default: 'ko',
      options: [
        { value: 'ko', label: '한국어' },
        { value: 'en', label: '영어' },
        { value: 'ja', label: '일본어' },
        { value: 'zh', label: '중국어' },
        { value: 'es', label: '스페인어' },
        { value: 'fr', label: '프랑스어' },
        { value: 'de', label: '독일어' },
      ],
    },
    {
      key: 'sourceLanguage', label: '원본 언어', type: 'select',
      options: [
        { value: '', label: '자동 감지' },
        { value: 'ko', label: '한국어' },
        { value: 'en', label: '영어' },
        { value: 'ja', label: '일본어' },
        { value: 'zh', label: '중국어' },
      ],
    },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmTranslateExecutor,
}

// ============================================================
// llm.extract - 정보 추출
// ============================================================

const llmExtractExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const fields = (config.fields || []) as string[]
    const schema = config.schema as Record<string, unknown> | undefined

    if (!text) {
      return { success: false, outputs: {}, error: '텍스트가 필요합니다' }
    }
    if (fields.length === 0 && !schema) {
      return { success: false, outputs: {}, error: '추출할 필드가 필요합니다' }
    }

    try {
      const fieldsDesc = schema ? JSON.stringify(schema, null, 2) : fields.join(', ')
      const prompt = `다음 텍스트에서 정보를 추출하여 JSON 형식으로 반환해주세요.\n\n추출할 필드:\n${fieldsDesc}\n\n텍스트:\n${text}\n\n응답은 반드시 유효한 JSON 객체여야 합니다.`
      const systemPrompt = 'You are an information extraction assistant. Respond only with valid JSON.'
      const result = await invokeLLM(prompt, systemPrompt, { ...config, temperature: 0 })

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(result.text)
        return {
          success: true,
          outputs: { data: extracted, extracted, raw: result.text },
          metadata: { executionTime: Date.now() - startTime },
        }
      } catch {
        return {
          success: true,
          outputs: { raw: result.text },
          metadata: { executionTime: Date.now() - startTime },
        }
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `추출 실패: ${error}` }
    }
  },
}

export const llmExtract: UnifiedToolDefinition = {
  name: 'llm.extract',
  version: '1.0.0',
  description: '텍스트에서 구조화된 정보를 추출합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '추출할 텍스트' },
      fields: { type: 'array', items: { type: 'string' }, description: '추출할 필드 목록' },
      schema: { type: 'object', description: '추출 스키마' },
    },
    required: ['text'],
  },
  meta: {
    label: '정보 추출',
    description: '텍스트에서 정보를 추출합니다',
    icon: 'FindInPage',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'extract', 'parse', '추출'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '추출된 데이터' },
      { name: 'extracted', type: 'json', required: false, description: '추출 결과 (alias)' },
    ],
  },
  configSchema: [
    { key: 'fields', label: '추출 필드 (줄바꿈 구분)', type: 'textarea', rows: 4 },
    { key: 'schema', label: '추출 스키마 (JSON)', type: 'code', language: 'json', rows: 6 },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmExtractExecutor,
}

// ============================================================
// llm.structured - 구조화된 출력
// ============================================================

const llmStructuredExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const prompt = (inputs.prompt || config.prompt || '') as string
    const schema = config.schema as Record<string, unknown> | string | undefined
    const context = inputs.context as string | undefined

    if (!prompt) {
      return { success: false, outputs: {}, error: '프롬프트가 필요합니다' }
    }
    if (!schema) {
      return { success: false, outputs: {}, error: '출력 스키마가 필요합니다' }
    }

    try {
      const schemaStr = typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2)
      const structuredPrompt = `${prompt}\n\n${context ? `Context: ${context}\n\n` : ''}JSON Schema:\n${schemaStr}\n\nRespond with valid JSON only.`
      const systemPrompt = 'You must respond with valid JSON matching the provided schema.'
      const result = await invokeLLM(structuredPrompt, systemPrompt, { ...config, temperature: 0 })

      try {
        const jsonMatch = result.text.match(/```(?:json)?\s*([\s\S]*?)```/) || result.text.match(/(\{[\s\S]*\})/) || result.text.match(/(\[[\s\S]*\])/)
        const structured = JSON.parse(jsonMatch ? jsonMatch[1].trim() : result.text.trim())
        return {
          success: true,
          outputs: { data: structured, result: structured, raw: result.text },
          metadata: { executionTime: Date.now() - startTime },
        }
      } catch {
        return {
          success: false,
          outputs: { raw: result.text },
          error: 'JSON 파싱 실패',
        }
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `구조화 출력 실패: ${error}` }
    }
  },
}

export const llmStructured: UnifiedToolDefinition = {
  name: 'llm.structured',
  version: '1.0.0',
  description: 'LLM에서 지정된 스키마에 맞는 구조화된 JSON 출력을 얻습니다.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '프롬프트' },
      context: { type: 'string', description: '컨텍스트' },
      schema: { type: 'object', description: '출력 JSON 스키마' },
    },
    required: ['prompt', 'schema'],
  },
  meta: {
    label: '구조화 출력',
    description: 'LLM에서 구조화된 출력을 얻습니다',
    icon: 'Schema',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'structured', 'json', 'schema', '구조화'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true, description: '프롬프트' },
      { name: 'context', type: 'text', required: false, description: '컨텍스트' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '구조화된 결과' },
      { name: 'raw', type: 'text', required: false, description: '원본 응답' },
    ],
  },
  configSchema: [
    { key: 'schema', label: '출력 스키마 (JSON)', type: 'code', language: 'json', rows: 8, required: true },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
  ],
  runtime: 'tauri',
  executor: llmStructuredExecutor,
}

// ============================================================
// llm.classify - 텍스트 분류
// ============================================================

const llmClassifyExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const categories = (config.categories || []) as string[]

    if (!text) {
      return { success: false, outputs: {}, error: '텍스트가 필요합니다' }
    }
    if (categories.length === 0) {
      return { success: false, outputs: {}, error: '분류 카테고리가 필요합니다' }
    }

    try {
      const prompt = `다음 텍스트를 아래 카테고리 중 하나로 분류해주세요.\n\n카테고리: ${categories.join(', ')}\n\n텍스트:\n${text}\n\n응답 형식: {"category": "카테고리명", "confidence": 0.0~1.0, "reason": "이유"}`
      const systemPrompt = 'You are a text classification assistant. Respond only with valid JSON.'
      const result = await invokeLLM(prompt, systemPrompt, { ...config, temperature: 0 })

      try {
        const parsed = JSON.parse(result.text)
        return {
          success: true,
          outputs: {
            category: parsed.category,
            confidence: parsed.confidence,
            reason: parsed.reason,
            raw: result.text,
          },
          metadata: { executionTime: Date.now() - startTime },
        }
      } catch {
        const foundCategory = categories.find(c => result.text.toLowerCase().includes(c.toLowerCase()))
        return {
          success: true,
          outputs: { category: foundCategory || categories[0], raw: result.text },
          metadata: { executionTime: Date.now() - startTime },
        }
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `분류 실패: ${error}` }
    }
  },
}

export const llmClassify: UnifiedToolDefinition = {
  name: 'llm.classify',
  version: '1.0.0',
  description: '텍스트를 지정된 카테고리 중 하나로 분류합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '분류할 텍스트' },
      categories: { type: 'array', items: { type: 'string' }, description: '분류 카테고리' },
    },
    required: ['text', 'categories'],
  },
  meta: {
    label: '텍스트 분류',
    description: '텍스트를 분류합니다',
    icon: 'Category',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'classify', 'category', '분류'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'category', type: 'text', required: true, description: '분류 결과' },
      { name: 'confidence', type: 'number', required: false, description: '신뢰도' },
      { name: 'reason', type: 'text', required: false, description: '분류 이유' },
    ],
  },
  configSchema: [
    { key: 'categories', label: '카테고리 (줄바꿈 구분)', type: 'textarea', rows: 4 },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmClassifyExecutor,
}

// ============================================================
// llm.generate - 텍스트 생성
// ============================================================

const llmGenerateExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const topic = (inputs.topic || config.topic || '') as string
    const style = (config.style || 'formal') as string
    const length = (config.length || 'medium') as string

    if (!topic) {
      return { success: false, outputs: {}, error: '주제가 필요합니다' }
    }

    try {
      const stylePrompts: Record<string, string> = {
        formal: '공식적이고 전문적인 어조로',
        casual: '친근하고 대화체로',
        creative: '창의적이고 흥미롭게',
        technical: '기술적이고 정확하게',
      }
      const lengthPrompts: Record<string, string> = {
        short: '1-2 문단으로 짧게',
        medium: '3-4 문단으로',
        long: '5 문단 이상으로 상세하게',
      }
      const prompt = `다음 주제에 대해 ${stylePrompts[style] || '자연스럽게'} ${lengthPrompts[length] || ''} 글을 작성해주세요.\n\n주제: ${topic}`
      const result = await invokeLLM(prompt, undefined, config)

      return {
        success: true,
        outputs: { text: result.text, generated: result.text },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `생성 실패: ${error}` }
    }
  },
}

export const llmGenerate: UnifiedToolDefinition = {
  name: 'llm.generate',
  version: '1.0.0',
  description: '주제에 대한 텍스트를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: '생성할 주제' },
      style: { type: 'string', enum: ['formal', 'casual', 'creative', 'technical'], default: 'formal' },
      length: { type: 'string', enum: ['short', 'medium', 'long'], default: 'medium' },
    },
    required: ['topic'],
  },
  meta: {
    label: '텍스트 생성',
    description: '주제에 대한 글을 생성합니다',
    icon: 'Create',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'generate', 'write', 'create', '생성'],
  },
  ports: {
    inputs: [
      { name: 'topic', type: 'text', required: true, description: '주제' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '생성된 텍스트' },
    ],
  },
  configSchema: [
    { key: 'topic', label: '주제', type: 'textarea', rows: 2 },
    {
      key: 'style', label: '스타일', type: 'select', default: 'formal',
      options: [
        { value: 'formal', label: '공식적' },
        { value: 'casual', label: '친근한' },
        { value: 'creative', label: '창의적' },
        { value: 'technical', label: '기술적' },
      ],
    },
    {
      key: 'length', label: '길이', type: 'select', default: 'medium',
      options: [
        { value: 'short', label: '짧게' },
        { value: 'medium', label: '보통' },
        { value: 'long', label: '길게' },
      ],
    },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmGenerateExecutor,
}

// ============================================================
// llm.rewrite - 텍스트 재작성
// ============================================================

const llmRewriteExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || '') as string
    const instruction = (config.instruction || '더 명확하고 간결하게') as string

    if (!text) {
      return { success: false, outputs: {}, error: '재작성할 텍스트가 필요합니다' }
    }

    try {
      const prompt = `다음 텍스트를 ${instruction} 재작성해주세요. 원문의 핵심 의미는 유지하면서 개선해주세요.\n\n원문:\n${text}\n\n재작성:`
      const result = await invokeLLM(prompt, undefined, config)

      return {
        success: true,
        outputs: { text: result.text.trim(), rewritten: result.text.trim() },
        metadata: { executionTime: Date.now() - startTime },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `재작성 실패: ${error}` }
    }
  },
}

export const llmRewrite: UnifiedToolDefinition = {
  name: 'llm.rewrite',
  version: '1.0.0',
  description: '텍스트를 지시에 따라 재작성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '재작성할 텍스트' },
      instruction: { type: 'string', description: '재작성 지시' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 재작성',
    description: '텍스트를 재작성합니다',
    icon: 'EditNote',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'rewrite', 'improve', '재작성'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '재작성된 텍스트' },
    ],
  },
  configSchema: [
    {
      key: 'instruction', label: '재작성 지시', type: 'select', default: '더 명확하고 간결하게',
      options: [
        { value: '더 명확하고 간결하게', label: '명확하게' },
        { value: '더 공식적인 어조로', label: '공식적으로' },
        { value: '더 친근한 어조로', label: '친근하게' },
        { value: '문법 오류를 수정하여', label: '문법 교정' },
        { value: '전문 용어를 쉽게 풀어서', label: '쉽게' },
      ],
    },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmRewriteExecutor,
}

// ============================================================
// llm.complete - 텍스트 완성
// ============================================================

const llmCompleteExecutor: ToolExecutor = {
  async execute(
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const text = (inputs.text || inputs.prompt || '') as string
    const instruction = (config.instruction || '다음 텍스트를 자연스럽게 완성해주세요:') as string

    if (!text) {
      return { success: false, outputs: {}, error: '텍스트가 필요합니다' }
    }

    try {
      const prompt = `${instruction}\n\n${text}`
      const result = await invokeLLM(prompt, undefined, config)

      return {
        success: true,
        outputs: { text: result.text, completion: result.text },
        metadata: { executionTime: Date.now() - startTime, tokensUsed: result.tokensUsed },
      }
    } catch (error) {
      return { success: false, outputs: {}, error: `완성 실패: ${error}` }
    }
  },
}

export const llmComplete: UnifiedToolDefinition = {
  name: 'llm.complete',
  version: '1.0.0',
  description: '텍스트를 자연스럽게 완성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '완성할 텍스트' },
      instruction: { type: 'string', description: '완성 지시' },
    },
    required: ['text'],
  },
  meta: {
    label: '텍스트 완성',
    description: '텍스트를 완성합니다',
    icon: 'AutoFixHigh',
    color: '#6366f1',
    category: 'llm',
    tags: ['llm', 'complete', 'autocomplete', '완성'],
  },
  ports: {
    inputs: [
      { name: 'text', type: 'text', required: true, description: '입력 텍스트' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '완성된 텍스트' },
      { name: 'completion', type: 'text', required: false, description: '완성 부분' },
    ],
  },
  configSchema: [
    { key: 'instruction', label: '완성 지시', type: 'textarea', rows: 2, default: '다음 텍스트를 자연스럽게 완성해주세요:' },
    { key: 'provider', label: '프로바이더', type: 'provider', default: 'bedrock' },
    { key: 'model', label: '모델', type: 'model', default: 'claude-3-5-sonnet' },
  ],
  runtime: 'tauri',
  executor: llmCompleteExecutor,
}

// ============================================================
// Export All LLM Tools
// ============================================================

export const LLM_TOOLS: UnifiedToolDefinition[] = [
  llmChat,
  llmComplete,
  llmEmbed,
  llmClassify,
  llmSummarize,
  llmTranslate,
  llmExtract,
  llmGenerate,
  llmRewrite,
  llmStructured,
]
