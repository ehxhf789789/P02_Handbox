/**
 * Prompt 도구 정의 — prompt.* (8개 도구)
 * 프롬프트 템플릿, Few-shot, Chain, 최적화 등
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// prompt.template - 프롬프트 템플릿
// ============================================================================
const promptTemplate: UnifiedToolDefinition = {
  name: 'prompt.template',
  version: '1.0.0',
  description: '변수를 사용한 프롬프트 템플릿을 렌더링합니다. {{variable}} 문법.',
  inputSchema: {
    type: 'object',
    properties: {
      template: { type: 'string', description: '템플릿 문자열' },
      variables: { type: 'object', description: '변수 객체' },
    },
    required: ['template'],
  },
  meta: {
    label: '프롬프트 템플릿',
    icon: 'Description',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'template', 'variable', '프롬프트', '템플릿'],
  },
  ports: {
    inputs: [
      { name: 'template', type: 'text', required: false },
      { name: 'variables', type: 'json', required: false },
    ],
    outputs: [
      { name: 'prompt', type: 'text', required: true, description: '렌더링된 프롬프트' },
      { name: 'used_vars', type: 'json', required: false, description: '사용된 변수' },
    ],
  },
  configSchema: [
    { key: 'template', label: '템플릿', type: 'textarea', rows: 8, required: true,
      description: '{{변수명}} 문법 사용. 예: {{user_input}}' },
    { key: 'default_vars', label: '기본 변수 (JSON)', type: 'code', language: 'json', rows: 4 },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const template = (inp.template || cfg.template || '') as string
      let variables: Record<string, any> = inp.variables || {}

      // 기본 변수 병합
      if (cfg.default_vars) {
        try {
          const defaults = JSON.parse(cfg.default_vars as string)
          variables = { ...defaults, ...variables }
        } catch {}
      }

      // 템플릿 렌더링
      const usedVars: string[] = []
      const prompt = template.replace(/\{\{(\w+)\}\}/g, (_: string, varName: string) => {
        usedVars.push(varName)
        return variables[varName] ?? `{{${varName}}}`
      })

      return { prompt, used_vars: usedVars }
    },
  },
}

// ============================================================================
// prompt.fewshot - Few-shot 프롬프트
// ============================================================================
const promptFewshot: UnifiedToolDefinition = {
  name: 'prompt.fewshot',
  version: '1.0.0',
  description: 'Few-shot 예시를 포함한 프롬프트를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      instruction: { type: 'string', description: '지시사항' },
      examples: { type: 'array', description: '예시 배열 [{input, output}]' },
      query: { type: 'string', description: '실제 쿼리' },
    },
    required: ['examples', 'query'],
  },
  meta: {
    label: 'Few-shot 프롬프트',
    icon: 'FormatListNumbered',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'fewshot', 'examples', '예시', '퓨샷'],
  },
  ports: {
    inputs: [
      { name: 'instruction', type: 'text', required: false },
      { name: 'examples', type: 'json', required: true },
      { name: 'query', type: 'text', required: true },
    ],
    outputs: [{ name: 'prompt', type: 'text', required: true }],
  },
  configSchema: [
    { key: 'instruction', label: '지시사항', type: 'textarea', rows: 3 },
    { key: 'examples', label: '예시 (JSON)', type: 'code', language: 'json', rows: 8,
      default: `[
  {"input": "예시 입력 1", "output": "예시 출력 1"},
  {"input": "예시 입력 2", "output": "예시 출력 2"}
]` },
    { key: 'max_examples', label: '최대 예시 수', type: 'number', default: 3 },
    { key: 'format', label: '형식', type: 'select', default: 'chat',
      options: [
        { label: '대화 형식', value: 'chat' },
        { label: '입출력 형식', value: 'io' },
        { label: 'Q&A 형식', value: 'qa' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const instruction = (inp.instruction || cfg.instruction || '') as string
      let examples: any[] = inp.examples || []
      if (!examples.length && cfg.examples) {
        try { examples = JSON.parse(cfg.examples as string) } catch {}
      }

      const maxExamples = (cfg.max_examples as number) || 3
      examples = examples.slice(0, maxExamples)

      let prompt = ''
      if (instruction) {
        prompt += `${instruction}\n\n`
      }

      // 예시 포맷팅
      const formatExample = (ex: any, idx: number) => {
        switch (cfg.format) {
          case 'qa':
            return `Q: ${ex.input}\nA: ${ex.output}`
          case 'io':
            return `Input: ${ex.input}\nOutput: ${ex.output}`
          default: // chat
            return `User: ${ex.input}\nAssistant: ${ex.output}`
        }
      }

      prompt += '예시:\n'
      examples.forEach((ex: any, idx: number) => {
        prompt += `${formatExample(ex, idx)}\n\n`
      })

      // 실제 쿼리
      switch (cfg.format) {
        case 'qa':
          prompt += `Q: ${inp.query}\nA:`
          break
        case 'io':
          prompt += `Input: ${inp.query}\nOutput:`
          break
        default:
          prompt += `User: ${inp.query}\nAssistant:`
      }

      return { prompt }
    },
  },
}

// ============================================================================
// prompt.chain - 프롬프트 체이닝
// ============================================================================
const promptChain: UnifiedToolDefinition = {
  name: 'prompt.chain',
  version: '1.0.0',
  description: '여러 프롬프트를 순차적으로 실행하고 결과를 연결합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: { type: 'array', description: '프롬프트 단계 배열' },
      input: { description: '초기 입력' },
    },
    required: ['steps'],
  },
  meta: {
    label: '프롬프트 체인',
    icon: 'Link',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'chain', 'sequence', '체인', '연쇄'],
  },
  ports: {
    inputs: [
      { name: 'steps', type: 'json', required: true },
      { name: 'input', type: 'any', required: false },
    ],
    outputs: [
      { name: 'result', type: 'any', required: true, description: '최종 결과' },
      { name: 'history', type: 'json', required: false, description: '단계별 결과' },
    ],
  },
  configSchema: [
    { key: 'steps', label: '단계 정의 (JSON)', type: 'code', language: 'json', rows: 10,
      default: `[
  {"name": "step1", "prompt": "첫 번째 분석: {{input}}"},
  {"name": "step2", "prompt": "{{step1}} 결과를 요약:"}
]` },
    { key: 'pass_context', label: '컨텍스트 전달', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      let steps: any[] = inp.steps || []
      if (!steps.length && cfg.steps) {
        try { steps = JSON.parse(cfg.steps as string) } catch {}
      }

      const history: any[] = []
      let context: Record<string, any> = { input: inp.input }

      for (const step of steps) {
        // 템플릿 렌더링
        const prompt = (step.prompt || '').replace(/\{\{(\w+)\}\}/g, (_: string, varName: string) => {
          return context[varName] ?? `{{${varName}}}`
        })

        // 결과 저장 (실제로는 LLM 호출이 필요)
        const result = `[Step ${step.name}] ${prompt}`

        history.push({ name: step.name, prompt, result })

        if (cfg.pass_context) {
          context[step.name] = result
        }
      }

      return {
        result: history[history.length - 1]?.result || null,
        history,
      }
    },
  },
}

// ============================================================================
// prompt.optimize - 프롬프트 최적화
// ============================================================================
const promptOptimize: UnifiedToolDefinition = {
  name: 'prompt.optimize',
  version: '1.0.0',
  description: 'LLM을 사용하여 프롬프트를 최적화합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '최적화할 프롬프트' },
      goal: { type: 'string', description: '최적화 목표' },
    },
    required: ['prompt'],
  },
  meta: {
    label: '프롬프트 최적화',
    icon: 'AutoFixHigh',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'optimize', 'improve', '최적화', '개선'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true },
      { name: 'goal', type: 'text', required: false },
    ],
    outputs: [
      { name: 'optimized', type: 'text', required: true, description: '최적화된 프롬프트' },
      { name: 'suggestions', type: 'json', required: false, description: '개선 제안' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'optimization_type', label: '최적화 유형', type: 'select', default: 'clarity',
      options: [
        { label: '명확성 향상', value: 'clarity' },
        { label: '구체성 향상', value: 'specificity' },
        { label: '토큰 절약', value: 'concise' },
        { label: '구조화', value: 'structure' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const { ProviderRegistry } = await import('../registry/ProviderRegistry')
      const provider = ProviderRegistry.getLLMProvider(cfg.provider || ctx?.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      const optimizationPrompts: Record<string, string> = {
        clarity: '이 프롬프트를 더 명확하고 이해하기 쉽게 다시 작성하세요.',
        specificity: '이 프롬프트에 더 구체적인 지시와 제약 조건을 추가하세요.',
        concise: '이 프롬프트를 의미를 유지하면서 최대한 간결하게 줄이세요.',
        structure: '이 프롬프트를 더 구조화된 형식(번호 매기기, 섹션 등)으로 재구성하세요.',
      }

      const optimType = cfg.optimization_type as string
      const metaPrompt = `당신은 프롬프트 엔지니어링 전문가입니다.

원본 프롬프트:
"""
${inp.prompt}
"""

${inp.goal ? `최적화 목표: ${inp.goal}\n` : ''}

${optimizationPrompts[optimType]}

최적화된 프롬프트만 출력하세요.`

      const response = await provider.invoke({
        model: cfg.model,
        prompt: metaPrompt,
        temperature: 0.3,
        maxTokens: 2048,
      })

      return {
        optimized: response.text as string,
        suggestions: [],
      }
    },
  },
}

// ============================================================================
// prompt.persona - 페르소나 프롬프트
// ============================================================================
const promptPersona: UnifiedToolDefinition = {
  name: 'prompt.persona',
  version: '1.0.0',
  description: '특정 페르소나/역할을 가진 시스템 프롬프트를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      persona: { type: 'string', description: '페르소나 이름 또는 설명' },
      traits: { type: 'array', description: '특성 배열' },
    },
    required: ['persona'],
  },
  meta: {
    label: '페르소나 프롬프트',
    icon: 'Person',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'persona', 'role', 'character', '페르소나', '역할'],
  },
  ports: {
    inputs: [
      { name: 'persona', type: 'text', required: true },
      { name: 'traits', type: 'json', required: false },
    ],
    outputs: [{ name: 'system_prompt', type: 'text', required: true }],
  },
  configSchema: [
    { key: 'persona', label: '페르소나', type: 'select', default: 'expert',
      options: [
        { label: '전문가', value: 'expert' },
        { label: '코치/멘토', value: 'coach' },
        { label: '분석가', value: 'analyst' },
        { label: '창작자', value: 'creator' },
        { label: '비평가', value: 'critic' },
        { label: '커스텀', value: 'custom' },
      ] },
    { key: 'custom_persona', label: '커스텀 페르소나', type: 'textarea', rows: 4 },
    { key: 'tone', label: '어조', type: 'select', default: 'professional',
      options: [
        { label: '전문적', value: 'professional' },
        { label: '친근한', value: 'friendly' },
        { label: '학술적', value: 'academic' },
        { label: '캐주얼', value: 'casual' },
      ] },
    { key: 'language', label: '언어', type: 'select', default: 'ko',
      options: [
        { label: '한국어', value: 'ko' },
        { label: '영어', value: 'en' },
        { label: '일본어', value: 'ja' },
      ] },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const personaTemplates: Record<string, string> = {
        expert: '당신은 해당 분야의 최고 전문가입니다. 깊은 지식과 풍부한 경험을 바탕으로 정확하고 상세한 정보를 제공합니다.',
        coach: '당신은 경험이 풍부한 코치이자 멘토입니다. 격려하면서도 건설적인 피드백을 제공하고, 성장을 돕습니다.',
        analyst: '당신은 뛰어난 분석가입니다. 데이터와 사실에 기반하여 객관적이고 통찰력 있는 분석을 제공합니다.',
        creator: '당신은 창의적인 작가이자 콘텐츠 크리에이터입니다. 독창적이고 매력적인 콘텐츠를 만들어냅니다.',
        critic: '당신은 건설적인 비평가입니다. 강점과 약점을 모두 분석하고 개선점을 제시합니다.',
        custom: '',
      }

      const toneDescriptions: Record<string, string> = {
        professional: '전문적이고 신뢰감 있는 어조로 소통합니다.',
        friendly: '친근하고 따뜻한 어조로 소통합니다.',
        academic: '학술적이고 정확한 표현을 사용합니다.',
        casual: '편안하고 자연스러운 대화체를 사용합니다.',
      }

      const personaKey = cfg.persona as string
      let personaDesc = inp.persona || personaTemplates[personaKey] || personaTemplates.expert
      if (cfg.persona === 'custom' && cfg.custom_persona) {
        personaDesc = cfg.custom_persona as string
      }

      let systemPrompt = personaDesc

      // 특성 추가
      if (inp.traits && Array.isArray(inp.traits)) {
        systemPrompt += '\n\n주요 특성:\n' + inp.traits.map((t: string) => `- ${t}`).join('\n')
      }

      // 어조 추가
      const toneKey = cfg.tone as string
      systemPrompt += '\n\n' + (toneDescriptions[toneKey] || toneDescriptions.professional)

      // 언어 지시
      const langInstructions: Record<string, string> = {
        ko: '모든 응답은 한국어로 작성합니다.',
        en: 'Respond in English.',
        ja: '日本語で回答してください。',
      }
      const langKey = cfg.language as string
      systemPrompt += '\n\n' + (langInstructions[langKey] || langInstructions.ko)

      return { system_prompt: systemPrompt }
    },
  },
}

// ============================================================================
// prompt.structured - 구조화된 출력 프롬프트
// ============================================================================
const promptStructured: UnifiedToolDefinition = {
  name: 'prompt.structured',
  version: '1.0.0',
  description: '구조화된 출력(JSON)을 요청하는 프롬프트를 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      instruction: { type: 'string', description: '지시사항' },
      schema: { type: 'object', description: '출력 스키마' },
    },
    required: ['instruction', 'schema'],
  },
  meta: {
    label: '구조화 프롬프트',
    icon: 'DataObject',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'structured', 'json', 'schema', '구조화'],
  },
  ports: {
    inputs: [
      { name: 'instruction', type: 'text', required: true },
      { name: 'schema', type: 'json', required: true },
      { name: 'input', type: 'any', required: false },
    ],
    outputs: [{ name: 'prompt', type: 'text', required: true }],
  },
  configSchema: [
    { key: 'instruction', label: '지시사항', type: 'textarea', rows: 4 },
    { key: 'schema', label: '출력 스키마 (JSON)', type: 'code', language: 'json', rows: 8,
      default: `{
  "summary": "string - 요약",
  "key_points": ["array - 핵심 포인트"],
  "score": "number - 점수 (0-100)"
}` },
    { key: 'strict', label: '엄격 모드', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const instruction = (inp.instruction || cfg.instruction || '') as string
      let schema = inp.schema
      if (!schema && cfg.schema) {
        try { schema = JSON.parse(cfg.schema as string) } catch {}
      }

      let prompt = instruction

      if (inp.input) {
        prompt += `\n\n입력 데이터:\n${typeof inp.input === 'string' ? inp.input : JSON.stringify(inp.input, null, 2)}`
      }

      prompt += `\n\n다음 JSON 스키마에 맞게 응답하세요:\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``

      if (cfg.strict) {
        prompt += '\n\n주의: 반드시 유효한 JSON 형식으로만 응답하세요. 추가 설명이나 마크다운 없이 JSON만 출력하세요.'
      }

      return { prompt }
    },
  },
}

// ============================================================================
// prompt.evaluate - 프롬프트 품질 평가
// ============================================================================
const promptEvaluate: UnifiedToolDefinition = {
  name: 'prompt.evaluate',
  version: '1.0.0',
  description: '프롬프트의 품질과 효과성을 평가합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '평가할 프롬프트' },
      criteria: { type: 'array', description: '평가 기준' },
    },
    required: ['prompt'],
  },
  meta: {
    label: '프롬프트 평가',
    icon: 'Grade',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'evaluate', 'quality', '평가', '품질'],
  },
  ports: {
    inputs: [{ name: 'prompt', type: 'text', required: true }],
    outputs: [
      { name: 'score', type: 'number', required: true, description: '총점 (0-100)' },
      { name: 'breakdown', type: 'json', required: false, description: '항목별 점수' },
      { name: 'suggestions', type: 'json', required: false, description: '개선 제안' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const { ProviderRegistry } = await import('../registry/ProviderRegistry')
      const provider = ProviderRegistry.getLLMProvider(cfg.provider || ctx?.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      const evalPrompt = `프롬프트 품질 평가자로서, 다음 프롬프트를 분석하세요.

프롬프트:
"""
${inp.prompt}
"""

다음 JSON 형식으로 평가하세요:
{
  "score": 0-100 사이의 총점,
  "breakdown": {
    "clarity": {"score": 0-100, "comment": "명확성 평가"},
    "specificity": {"score": 0-100, "comment": "구체성 평가"},
    "structure": {"score": 0-100, "comment": "구조 평가"},
    "completeness": {"score": 0-100, "comment": "완전성 평가"}
  },
  "suggestions": ["개선 제안 1", "개선 제안 2"]
}`

      const response = await provider.invoke({
        model: cfg.model,
        prompt: evalPrompt,
        temperature: 0.3,
        maxTokens: 1024,
      })

      let result: { score: number; breakdown: Record<string, any>; suggestions: string[] } = { score: 0, breakdown: {}, suggestions: [] }
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) result = JSON.parse(jsonMatch[0])
      } catch {}

      return result
    },
  },
}

// ============================================================================
// prompt.combine - 프롬프트 결합
// ============================================================================
const promptCombine: UnifiedToolDefinition = {
  name: 'prompt.combine',
  version: '1.0.0',
  description: '여러 프롬프트 조각을 하나로 결합합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      parts: { type: 'array', description: '프롬프트 조각 배열' },
      separator: { type: 'string', description: '구분자' },
    },
    required: ['parts'],
  },
  meta: {
    label: '프롬프트 결합',
    icon: 'MergeType',
    color: '#a855f7',
    category: 'prompt',
    tags: ['prompt', 'combine', 'merge', '결합', '병합'],
  },
  ports: {
    inputs: [{ name: 'parts', type: 'json', required: true }],
    outputs: [{ name: 'prompt', type: 'text', required: true }],
  },
  configSchema: [
    { key: 'separator', label: '구분자', type: 'select', default: 'newline',
      options: [
        { label: '줄바꿈', value: 'newline' },
        { label: '빈 줄', value: 'paragraph' },
        { label: '구분선', value: 'line' },
        { label: '없음', value: 'none' },
      ] },
    { key: 'filter_empty', label: '빈 항목 제외', type: 'toggle', default: true },
  ],
  runtime: 'internal',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      let parts: any[] = inp.parts || []
      if (cfg.filter_empty) {
        parts = parts.filter((p: any) => p && String(p).trim())
      }

      const separators: Record<string, string> = {
        newline: '\n',
        paragraph: '\n\n',
        line: '\n---\n',
        none: '',
      }

      const sepKey = cfg.separator as string
      const sep = inp.separator || separators[sepKey] || '\n\n'
      const prompt = parts.map((p: any) => String(p).trim()).join(sep)

      return { prompt }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const PROMPT_TOOLS: UnifiedToolDefinition[] = [
  promptTemplate,
  promptFewshot,
  promptChain,
  promptOptimize,
  promptPersona,
  promptStructured,
  promptEvaluate,
  promptCombine,
]
