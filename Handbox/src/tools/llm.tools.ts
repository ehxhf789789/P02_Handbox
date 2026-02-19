/**
 * LLM 도구 노드 정의 — llm.chat, llm.embed, llm.structured, prompt.*
 * LLM 프로바이더를 통한 AI 모델 호출
 */
import type { NodeDefinition } from '../registry/NodeDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

export const LlmChatDefinition: NodeDefinition = {
  type: 'llm.chat',
  category: 'llm',
  meta: {
    label: 'LLM 대화',
    description: 'LLM에 프롬프트를 보내고 응답을 받습니다. 모든 프로바이더 지원.',
    icon: 'Psychology',
    color: '#06b6d4',
    tags: ['llm', 'chat', 'ai', 'gpt', 'claude', 'bedrock', 'LLM', '대화', 'AI'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: false, description: '사용자 프롬프트' },
      { name: 'system', type: 'text', required: false, description: '시스템 프롬프트' },
      { name: 'context', type: 'text', required: false, description: '컨텍스트 (RAG 검색 결과 등)' },
    ],
    outputs: [
      { name: 'text', type: 'llm-response', required: true, description: 'LLM 응답 텍스트' },
      { name: 'usage', type: 'json', required: false, description: '토큰 사용량' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 3 },
    { key: 'prompt_template', label: '프롬프트 템플릿', type: 'textarea', rows: 5,
      description: '{{prompt}}, {{context}} 변수 사용 가능' },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.7 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 4096 },
    { key: 'top_p', label: 'Top P', type: 'slider', min: 0, max: 1, step: 0.05, default: 1 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)

      // 프롬프트 조립
      let prompt = input.prompt || ''
      if (config.prompt_template) {
        prompt = config.prompt_template
          .replace('{{prompt}}', input.prompt || '')
          .replace('{{context}}', input.context || '')
      }
      const systemPrompt = input.system || config.system_prompt || ''
      if (input.context && !config.prompt_template) {
        prompt = `Context:\n${input.context}\n\nQuestion:\n${prompt}`
      }

      if (!provider) {
        throw new Error(`LLM 프로바이더 '${providerId}'를 찾을 수 없습니다.`)
      }

      const response = await provider.invoke({
        model: config.model,
        prompt,
        systemPrompt,
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        topP: config.top_p,
      })

      return {
        text: response.text,
        usage: response.usage,
        response: response,
      }
    },
  },
  requirements: { provider: 'any' },
}

export const LlmEmbedDefinition: NodeDefinition = {
  type: 'llm.embed',
  category: 'llm',
  meta: {
    label: '임베딩 생성',
    description: '텍스트를 벡터 임베딩으로 변환합니다. RAG 파이프라인의 필수 요소.',
    icon: 'Grain',
    color: '#06b6d4',
    tags: ['embedding', 'vector', 'llm', 'rag', '임베딩', '벡터'],
  },
  ports: {
    inputs: [
      { name: 'texts', type: 'text[]', required: false, description: '텍스트 배열' },
      { name: 'text', type: 'text', required: false, description: '단일 텍스트' },
    ],
    outputs: [
      { name: 'embeddings', type: 'vector[]', required: true, description: '임베딩 벡터 배열' },
      { name: 'embedding', type: 'vector', required: false, description: '첫 번째 임베딩 벡터' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '임베딩 모델', type: 'model' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultEmbeddingProvider
      const provider = ProviderRegistry.getEmbeddingProvider(providerId)

      let texts: string[] = []
      if (input.texts) {
        texts = Array.isArray(input.texts) ? input.texts : [input.texts]
      } else if (input.text) {
        texts = [input.text]
      }

      if (texts.length === 0) throw new Error('임베딩할 텍스트가 없습니다')
      if (!provider) throw new Error(`임베딩 프로바이더 '${providerId}'를 찾을 수 없습니다`)

      const response = await provider.embed({ texts, model: config.model })

      return {
        embeddings: response.embeddings,
        embedding: response.embeddings[0] || [],
        dimension: response.dimension,
      }
    },
  },
  requirements: { provider: 'any' },
}

export const LlmStructuredDefinition: NodeDefinition = {
  type: 'llm.structured',
  category: 'llm',
  meta: {
    label: 'LLM 구조화 출력',
    description: 'LLM이 JSON 스키마에 맞는 구조화된 응답을 생성합니다.',
    icon: 'Schema',
    color: '#06b6d4',
    tags: ['llm', 'structured', 'json', 'schema', '구조화', 'JSON'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true },
      { name: 'context', type: 'text', required: false },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '구조화된 JSON' },
      { name: 'text', type: 'text', required: false, description: '원본 응답' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'schema', label: 'JSON 스키마', type: 'code', language: 'json', rows: 8, required: true,
      description: '응답의 JSON 스키마를 정의하세요' },
    { key: 'system_prompt', label: '시스템 프롬프트', type: 'textarea', rows: 2,
      default: 'You must respond with valid JSON matching the provided schema.' },
    { key: 'temperature', label: '온도', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.3 },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 2048 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)
      if (!provider) throw new Error(`LLM 프로바이더 '${providerId}'를 찾을 수 없습니다`)

      const prompt = `${input.prompt}\n\n${input.context ? `Context: ${input.context}\n\n` : ''}JSON Schema:\n${config.schema}\n\nRespond with valid JSON only.`

      const response = await provider.invoke({
        model: config.model, prompt,
        systemPrompt: config.system_prompt,
        temperature: config.temperature, maxTokens: config.max_tokens,
      })

      let data: any
      try {
        // JSON 블록 추출 시도
        const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          response.text.match(/(\{[\s\S]*\})/) ||
                          response.text.match(/(\[[\s\S]*\])/)
        data = JSON.parse(jsonMatch ? jsonMatch[1].trim() : response.text.trim())
      } catch {
        data = { raw: response.text, parseError: true }
      }

      return { data, text: response.text }
    },
  },
}

export const PromptTemplateDefinition: NodeDefinition = {
  type: 'prompt.template',
  category: 'llm',
  meta: {
    label: '프롬프트 템플릿',
    description: '변수를 포함한 프롬프트를 조립합니다. {{변수}} 문법 지원.',
    icon: 'TextSnippet',
    color: '#06b6d4',
    tags: ['prompt', 'template', '프롬프트', '템플릿'],
  },
  ports: {
    inputs: [
      { name: 'variables', type: 'json', required: false, description: '변수 맵' },
      { name: 'context', type: 'text', required: false, description: '컨텍스트' },
      { name: 'query', type: 'text', required: false, description: '사용자 쿼리' },
    ],
    outputs: [{ name: 'text', type: 'text', required: true, description: '조립된 프롬프트' }],
  },
  configSchema: [
    { key: 'template', label: '프롬프트 템플릿', type: 'textarea', required: true, rows: 8,
      description: '{{context}}, {{query}}, {{변수명}} 사용 가능' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let text = config.template || ''
      // 기본 변수 치환
      text = text.replace(/\{\{context\}\}/g, input.context || '')
      text = text.replace(/\{\{query\}\}/g, input.query || '')
      // 추가 변수 치환
      if (input.variables && typeof input.variables === 'object') {
        for (const [key, value] of Object.entries(input.variables)) {
          text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
        }
      }
      return { text: text.trim() }
    },
  },
}

export const PromptFewShotDefinition: NodeDefinition = {
  type: 'prompt.fewshot',
  category: 'llm',
  meta: {
    label: 'Few-Shot 프롬프트',
    description: '예시를 포함한 Few-Shot 프롬프트를 생성합니다.',
    icon: 'FormatListNumbered',
    color: '#06b6d4',
    tags: ['prompt', 'fewshot', 'example', 'few-shot', '예시'],
  },
  ports: {
    inputs: [{ name: 'query', type: 'text', required: true, description: '사용자 입력' }],
    outputs: [{ name: 'text', type: 'text', required: true, description: 'Few-shot 프롬프트' }],
  },
  configSchema: [
    { key: 'instruction', label: '지시사항', type: 'textarea', rows: 2 },
    { key: 'examples', label: '예시 (JSON)', type: 'code', language: 'json', rows: 8,
      default: '[{"input": "예시 입력", "output": "예시 출력"}]',
      description: '[{input, output}] 형식의 배열' },
    { key: 'format', label: '형식', type: 'select', default: 'numbered',
      options: [
        { label: '번호 매기기', value: 'numbered' },
        { label: 'Input/Output', value: 'io' },
        { label: 'Q&A', value: 'qa' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let examples: any[] = []
      try { examples = JSON.parse(config.examples || '[]') } catch { /* empty */ }

      let prompt = config.instruction ? `${config.instruction}\n\n` : ''

      for (let i = 0; i < examples.length; i++) {
        const ex = examples[i]
        switch (config.format) {
          case 'io':
            prompt += `Input: ${ex.input}\nOutput: ${ex.output}\n\n`; break
          case 'qa':
            prompt += `Q: ${ex.input}\nA: ${ex.output}\n\n`; break
          default:
            prompt += `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}\n\n`
        }
      }

      switch (config.format) {
        case 'io': prompt += `Input: ${input.query}\nOutput:`; break
        case 'qa': prompt += `Q: ${input.query}\nA:`; break
        default: prompt += `Now your turn:\nInput: ${input.query}\nOutput:`
      }

      return { text: prompt }
    },
  },
}

export const PromptChainDefinition: NodeDefinition = {
  type: 'prompt.chain',
  category: 'llm',
  meta: {
    label: '프롬프트 체인',
    description: '여러 프롬프트를 순차적으로 연결합니다. Chain-of-Thought 구현.',
    icon: 'LinearScale',
    color: '#06b6d4',
    tags: ['prompt', 'chain', 'cot', 'chain-of-thought', '체인', '순차'],
  },
  ports: {
    inputs: [
      { name: 'input', type: 'text', required: true },
      { name: 'previous_response', type: 'text', required: false, description: '이전 단계 응답' },
    ],
    outputs: [{ name: 'text', type: 'text', required: true, description: '체인 프롬프트' }],
  },
  configSchema: [
    { key: 'step_prompt', label: '단계 프롬프트', type: 'textarea', required: true, rows: 5,
      description: '{{input}}, {{previous}} 변수 사용 가능' },
    { key: 'step_name', label: '단계 이름', type: 'text', default: 'Step' },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      let text = config.step_prompt || '{{input}}'
      text = text.replace(/\{\{input\}\}/g, input.input || '')
      text = text.replace(/\{\{previous\}\}/g, input.previous_response || '')
      return { text: text.trim() }
    },
  },
}

export const LLM_DEFINITIONS: NodeDefinition[] = [
  LlmChatDefinition, LlmEmbedDefinition, LlmStructuredDefinition,
  PromptTemplateDefinition, PromptFewShotDefinition, PromptChainDefinition,
]
