/**
 * Vision/Multimodal 도구 정의 — vision.* (8개 도구)
 * 이미지 분석, OCR, 비교, 추출, 생성 등 멀티모달 기능
 */
import type { UnifiedToolDefinition } from '../registry/UnifiedToolDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

// ============================================================================
// Helper: 이미지 Base64 변환
// ============================================================================
async function getImageBase64(
  source: { type: 'path' | 'url' | 'base64'; value: string }
): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/tauri')

  if (source.type === 'path') {
    return await invoke('tool_read_image_base64', { path: source.value }) as string
  } else if (source.type === 'url') {
    return await invoke('tool_fetch_image_base64', { url: source.value }) as string
  }
  return source.value
}

// Helper: LLM 호출
async function invokeVisionLLM(
  config: any,
  context: any,
  options: { prompt: string; images: { base64: string; detail?: 'high' | 'low' | 'auto' }[]; maxTokens?: number }
): Promise<{ text: string; usage?: any }> {
  const providerId = config.provider || context?.defaultLLMProvider
  const provider = ProviderRegistry.getLLMProvider(providerId)

  if (provider) {
    return await provider.invoke({
      model: config.model,
      prompt: options.prompt,
      images: options.images as any,
      maxTokens: options.maxTokens,
    })
  }

  throw new Error(`Vision provider '${providerId}' not found`)
}

// ============================================================================
// vision.analyze - 이미지 분석
// ============================================================================
const visionAnalyze: UnifiedToolDefinition = {
  name: 'vision.analyze',
  version: '1.0.0',
  description: 'Claude Vision, GPT-4V 등으로 이미지를 분석합니다. 객체 감지, 장면 이해, 텍스트 추출.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일 경로' },
      image_url: { type: 'string', description: '이미지 URL' },
      image_base64: { type: 'string', description: 'Base64 인코딩 이미지' },
      prompt: { type: 'string', description: '분석 요청 프롬프트' },
    },
  },
  meta: {
    label: '이미지 분석',
    icon: 'ImageSearch',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'image', 'analyze', 'multimodal', 'claude', '이미지', '분석'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: false, description: '이미지 파일 경로' },
      { name: 'image_url', type: 'text', required: false, description: '이미지 URL' },
      { name: 'image_base64', type: 'text', required: false, description: 'Base64 이미지' },
      { name: 'prompt', type: 'text', required: false, description: '분석 프롬프트' },
    ],
    outputs: [
      { name: 'analysis', type: 'llm-response', required: true, description: '분석 결과' },
      { name: 'structured', type: 'json', required: false, description: '구조화된 결과' },
      { name: 'objects', type: 'json', required: false, description: '감지된 객체 목록' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'image_path', label: '이미지 경로', type: 'file' },
    { key: 'analysis_type', label: '분석 유형', type: 'select', default: 'general',
      options: [
        { label: '일반 분석', value: 'general' },
        { label: '객체 감지', value: 'objects' },
        { label: '텍스트 추출 (OCR)', value: 'ocr' },
        { label: '장면 설명', value: 'scene' },
        { label: '문서 분석', value: 'document' },
        { label: '차트/그래프 분석', value: 'chart' },
      ] },
    { key: 'prompt', label: '분석 프롬프트', type: 'textarea', rows: 3 },
    { key: 'output_format', label: '출력 형식', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' },
        { label: 'JSON', value: 'json' },
        { label: 'Markdown', value: 'markdown' },
      ] },
    { key: 'detail_level', label: '상세 수준', type: 'select', default: 'high',
      options: [
        { label: '낮음', value: 'low' },
        { label: '자동', value: 'auto' },
        { label: '높음', value: 'high' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      // 이미지 소스 결정
      let imageSource: { type: 'path' | 'url' | 'base64'; value: string } | null = null
      if (inp.image || cfg.image_path) {
        imageSource = { type: 'path', value: inp.image || cfg.image_path }
      } else if (inp.image_url) {
        imageSource = { type: 'url', value: inp.image_url }
      } else if (inp.image_base64) {
        imageSource = { type: 'base64', value: inp.image_base64 }
      }

      if (!imageSource) {
        throw new Error('이미지 소스가 필요합니다 (경로, URL, 또는 Base64)')
      }

      const analysisPrompts: Record<string, string> = {
        general: '이 이미지를 상세히 분석하고 설명해주세요.',
        objects: '이 이미지에서 모든 객체를 감지하고 JSON 형식으로 나열해주세요.',
        ocr: '이 이미지에서 모든 텍스트를 추출해주세요.',
        scene: '이 이미지의 장면을 묘사해주세요.',
        document: '이 문서 이미지를 분석하고 내용을 구조화해서 추출해주세요.',
        chart: '이 차트/그래프를 분석하고 데이터와 인사이트를 추출해주세요.',
      }

      let prompt = inp.prompt || cfg.prompt || analysisPrompts[cfg.analysis_type] || analysisPrompts.general
      if (cfg.output_format === 'json') {
        prompt += '\n\n출력은 반드시 유효한 JSON 형식으로 해주세요.'
      }

      let imageBase64: string
      try {
        imageBase64 = await getImageBase64(imageSource)
      } catch (err) {
        return {
          analysis: `[시뮬레이션] 이미지 분석 - 경로: ${imageSource.value}, 유형: ${cfg.analysis_type}`,
          structured: null,
          objects: null,
          _simulation: true,
        }
      }

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: cfg.detail_level as 'high' | 'low' | 'auto' | undefined }],
        maxTokens: 4096,
      })

      // 결과 파싱
      let structured = null
      let objects = null
      if (cfg.output_format === 'json' || cfg.analysis_type === 'objects') {
        try {
          const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                            response.text.match(/(\{[\s\S]*\})/) ||
                            response.text.match(/(\[[\s\S]*\])/)
          if (jsonMatch) {
            structured = JSON.parse(jsonMatch[1].trim())
            if (cfg.analysis_type === 'objects' && Array.isArray(structured)) {
              objects = structured
            } else if (structured.objects) {
              objects = structured.objects
            }
          }
        } catch {}
      }

      return { analysis: response.text, structured, objects, usage: response.usage }
    },
  },
}

// ============================================================================
// vision.ocr - OCR 텍스트 추출
// ============================================================================
const visionOcr: UnifiedToolDefinition = {
  name: 'vision.ocr',
  version: '1.0.0',
  description: 'AI 기반 OCR. 레이아웃 이해, 다국어, 손글씨 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일 경로' },
    },
    required: ['image'],
  },
  meta: {
    label: '고급 OCR',
    icon: 'DocumentScanner',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['ocr', 'text', 'extract', 'handwriting', '텍스트', '추출'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지 파일' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트' },
      { name: 'blocks', type: 'json', required: false, description: '텍스트 블록' },
      { name: 'layout', type: 'json', required: false, description: '문서 레이아웃' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'preserve_layout', label: '레이아웃 유지', type: 'toggle', default: true },
    { key: 'detect_handwriting', label: '손글씨 감지', type: 'toggle', default: false },
    { key: 'output_format', label: '출력 형식', type: 'select', default: 'plain',
      options: [
        { label: '일반 텍스트', value: 'plain' },
        { label: 'Markdown', value: 'markdown' },
        { label: 'JSON (블록)', value: 'json' },
      ] },
    { key: 'language', label: '언어', type: 'select', default: 'auto',
      options: [
        { label: '자동', value: 'auto' },
        { label: '한국어', value: 'ko' },
        { label: '영어', value: 'en' },
        { label: '일본어', value: 'ja' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const imageBase64 = await getImageBase64({ type: 'path', value: inp.image })

      let prompt = '이 이미지에서 모든 텍스트를 추출해주세요.'
      if (cfg.preserve_layout) prompt += ' 원본 레이아웃을 유지해주세요.'
      if (cfg.detect_handwriting) prompt += ' 손글씨도 인식해주세요.'
      if (cfg.output_format === 'markdown') prompt += ' Markdown 형식으로 출력해주세요.'
      else if (cfg.output_format === 'json') prompt += ' JSON 배열 [{text, position}] 형식으로 출력해주세요.'

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: 'high' }],
        maxTokens: 8192,
      })

      let blocks = null
      let layout = null
      if (cfg.output_format === 'json') {
        try {
          const jsonMatch = response.text.match(/(\[[\s\S]*\])/)
          if (jsonMatch) {
            blocks = JSON.parse(jsonMatch[1])
            layout = { blocks: blocks.length }
          }
        } catch {}
      }

      return { text: response.text, blocks, layout }
    },
  },
}

// ============================================================================
// vision.compare - 이미지 비교
// ============================================================================
const visionCompare: UnifiedToolDefinition = {
  name: 'vision.compare',
  version: '1.0.0',
  description: '두 개 이상의 이미지를 비교 분석합니다. 변화 감지, 유사도, 차이점 분석.',
  inputSchema: {
    type: 'object',
    properties: {
      image1: { type: 'string', description: '첫 번째 이미지' },
      image2: { type: 'string', description: '두 번째 이미지' },
    },
    required: ['image1', 'image2'],
  },
  meta: {
    label: '이미지 비교',
    icon: 'Compare',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'compare', 'diff', 'similarity', '비교'],
  },
  ports: {
    inputs: [
      { name: 'image1', type: 'file-ref', required: true, description: '첫 번째 이미지' },
      { name: 'image2', type: 'file-ref', required: true, description: '두 번째 이미지' },
      { name: 'image3', type: 'file-ref', required: false, description: '세 번째 이미지' },
    ],
    outputs: [
      { name: 'comparison', type: 'llm-response', required: true, description: '비교 결과' },
      { name: 'differences', type: 'json', required: false, description: '차이점 목록' },
      { name: 'similarity_score', type: 'number', required: false, description: '유사도 점수' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'comparison_type', label: '비교 유형', type: 'select', default: 'general',
      options: [
        { label: '일반 비교', value: 'general' },
        { label: '변화 감지', value: 'change' },
        { label: '유사도 분석', value: 'similarity' },
        { label: '품질 비교', value: 'quality' },
      ] },
    { key: 'focus_areas', label: '집중 영역', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const images: string[] = []
      for (const key of ['image1', 'image2', 'image3']) {
        if (inp[key]) {
          images.push(await getImageBase64({ type: 'path', value: inp[key] }))
        }
      }

      if (images.length < 2) throw new Error('최소 2개 이미지 필요')

      const prompts: Record<string, string> = {
        general: `이 ${images.length}개의 이미지를 비교 분석해주세요. 유사점과 차이점을 설명하세요.`,
        change: '이미지 사이의 변화를 감지하고 설명해주세요.',
        similarity: '이미지들의 유사도를 0-100 점수로 평가해주세요. JSON: {score, reason}',
        quality: '이미지들의 품질을 비교 분석해주세요.',
      }

      let prompt = prompts[cfg.comparison_type] || prompts.general
      if (cfg.focus_areas) prompt += `\n\n집중 영역: ${cfg.focus_areas}`

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: images.map(base64 => ({ base64, detail: 'high' })),
        maxTokens: 4096,
      })

      let differences = null
      let similarity_score = null
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          differences = parsed.differences
          similarity_score = parsed.score || parsed.similarity
        }
      } catch {}

      return { comparison: response.text, differences, similarity_score }
    },
  },
}

// ============================================================================
// vision.extract - 구조화 데이터 추출
// ============================================================================
const visionExtract: UnifiedToolDefinition = {
  name: 'vision.extract',
  version: '1.0.0',
  description: '이미지에서 구조화된 데이터를 추출합니다. 표, 양식, 영수증, 명함 등.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일' },
      schema: { type: 'object', description: '추출할 데이터 스키마' },
    },
    required: ['image'],
  },
  meta: {
    label: '데이터 추출',
    icon: 'TableView',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'extract', 'table', 'form', '추출', '표'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지 파일' },
      { name: 'schema', type: 'json', required: false, description: '추출 스키마' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '추출된 데이터' },
      { name: 'raw_text', type: 'text', required: false, description: '원본 텍스트' },
      { name: 'confidence', type: 'number', required: false, description: '신뢰도' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'extraction_type', label: '추출 유형', type: 'select', default: 'auto',
      options: [
        { label: '자동 감지', value: 'auto' },
        { label: '표/테이블', value: 'table' },
        { label: '양식/폼', value: 'form' },
        { label: '영수증', value: 'receipt' },
        { label: '명함', value: 'business_card' },
        { label: '커스텀', value: 'custom' },
      ] },
    { key: 'schema', label: '커스텀 스키마', type: 'code', language: 'json', rows: 5 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const imageBase64 = await getImageBase64({ type: 'path', value: inp.image })

      const prompts: Record<string, string> = {
        auto: '이 이미지에서 구조화된 데이터를 추출해주세요. JSON 형식으로.',
        table: '이 표 데이터를 추출해주세요. JSON 배열로.',
        form: '이 양식의 필드와 값을 추출해주세요. JSON 객체로.',
        receipt: '이 영수증의 상점명, 날짜, 항목, 금액을 추출해주세요. JSON으로.',
        business_card: '이 명함의 이름, 직함, 연락처를 추출해주세요. JSON으로.',
        custom: '',
      }

      let prompt = prompts[cfg.extraction_type] || prompts.auto
      if (cfg.extraction_type === 'custom' && (inp.schema || cfg.schema)) {
        const schema = inp.schema || JSON.parse(cfg.schema || '{}')
        prompt = `이 이미지에서 다음 스키마로 데이터를 추출해주세요:\n${JSON.stringify(schema, null, 2)}\n\nJSON으로 출력.`
      }

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: 'high' }],
        maxTokens: 4096,
      })

      let data = null
      try {
        const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          response.text.match(/(\{[\s\S]*\})/) ||
                          response.text.match(/(\[[\s\S]*\])/)
        if (jsonMatch) data = JSON.parse(jsonMatch[1].trim())
      } catch {
        data = { raw: response.text, parseError: true }
      }

      return { data, raw_text: response.text, confidence: data?.confidence || null }
    },
  },
}

// ============================================================================
// vision.caption - 이미지 캡션 생성
// ============================================================================
const visionCaption: UnifiedToolDefinition = {
  name: 'vision.caption',
  version: '1.0.0',
  description: '이미지에 대한 설명/캡션을 생성합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일' },
      style: { type: 'string', description: '캡션 스타일' },
    },
    required: ['image'],
  },
  meta: {
    label: '이미지 캡션',
    icon: 'Subtitles',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'caption', 'description', '캡션', '설명'],
  },
  ports: {
    inputs: [{ name: 'image', type: 'file-ref', required: true, description: '이미지' }],
    outputs: [
      { name: 'caption', type: 'text', required: true, description: '캡션' },
      { name: 'tags', type: 'json', required: false, description: '태그' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'style', label: '캡션 스타일', type: 'select', default: 'descriptive',
      options: [
        { label: '설명적', value: 'descriptive' },
        { label: '간결한', value: 'concise' },
        { label: '창의적', value: 'creative' },
        { label: 'SNS용', value: 'social' },
        { label: 'SEO 최적화', value: 'seo' },
      ] },
    { key: 'max_length', label: '최대 길이', type: 'number', default: 200 },
    { key: 'include_tags', label: '태그 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const imageBase64 = await getImageBase64({ type: 'path', value: inp.image })

      const stylePrompts: Record<string, string> = {
        descriptive: '이 이미지를 상세하게 설명하는 캡션을 작성해주세요.',
        concise: '이 이미지를 한 문장으로 설명해주세요.',
        creative: '이 이미지에 대한 창의적이고 흥미로운 캡션을 작성해주세요.',
        social: '이 이미지에 대한 SNS 게시물용 캡션을 작성해주세요. 해시태그 포함.',
        seo: '이 이미지에 대한 SEO 최적화 alt 텍스트를 작성해주세요.',
      }

      let prompt = stylePrompts[cfg.style] || stylePrompts.descriptive
      prompt += `\n최대 ${cfg.max_length || 200}자.`
      if (cfg.include_tags) prompt += '\n\n또한 관련 태그를 JSON 배열로 제공해주세요: {"caption": "...", "tags": [...]}'

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: 'auto' }],
        maxTokens: 512,
      })

      let caption = response.text
      let tags = null

      if (cfg.include_tags) {
        try {
          const jsonMatch = response.text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            caption = parsed.caption || caption
            tags = parsed.tags
          }
        } catch {}
      }

      return { caption, tags }
    },
  },
}

// ============================================================================
// vision.detect - 객체 감지
// ============================================================================
const visionDetect: UnifiedToolDefinition = {
  name: 'vision.detect',
  version: '1.0.0',
  description: '이미지에서 객체를 감지하고 위치와 속성을 반환합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일' },
      objects: { type: 'array', description: '감지할 객체 목록' },
    },
    required: ['image'],
  },
  meta: {
    label: '객체 감지',
    icon: 'CenterFocusStrong',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'detect', 'object', '객체', '감지'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지' },
      { name: 'objects', type: 'json', required: false, description: '감지할 객체 목록' },
    ],
    outputs: [
      { name: 'detections', type: 'json', required: true, description: '감지된 객체' },
      { name: 'count', type: 'json', required: false, description: '객체 수' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'target_objects', label: '감지 대상', type: 'text', description: '쉼표로 구분' },
    { key: 'include_positions', label: '위치 포함', type: 'toggle', default: true },
    { key: 'include_attributes', label: '속성 포함', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const imageBase64 = await getImageBase64({ type: 'path', value: inp.image })

      const targets = inp.objects || (cfg.target_objects as string | undefined)?.split(',').map((s: string) => s.trim()) || []

      let prompt = '이 이미지에서 모든 객체를 감지해주세요.'
      if (targets.length > 0) {
        prompt = `이 이미지에서 다음 객체를 감지해주세요: ${targets.join(', ')}`
      }

      prompt += '\n\nJSON 배열로 출력: [{name, '
      if (cfg.include_positions) prompt += 'position: {x, y, width, height}, '
      if (cfg.include_attributes) prompt += 'attributes: {...}, '
      prompt += 'confidence}]'

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: 'high' }],
        maxTokens: 2048,
      })

      let detections: any[] = []
      try {
        const jsonMatch = response.text.match(/(\[[\s\S]*\])/)
        if (jsonMatch) detections = JSON.parse(jsonMatch[1])
      } catch {}

      const count: Record<string, number> = {}
      for (const d of detections) {
        count[d.name] = (count[d.name] || 0) + 1
      }

      return { detections, count }
    },
  },
}

// ============================================================================
// vision.classify - 이미지 분류
// ============================================================================
const visionClassify: UnifiedToolDefinition = {
  name: 'vision.classify',
  version: '1.0.0',
  description: '이미지를 지정된 카테고리로 분류합니다.',
  inputSchema: {
    type: 'object',
    properties: {
      image: { type: 'string', description: '이미지 파일' },
      categories: { type: 'array', description: '분류 카테고리' },
    },
    required: ['image', 'categories'],
  },
  meta: {
    label: '이미지 분류',
    icon: 'Category',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'classify', 'category', '분류', '카테고리'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지' },
      { name: 'categories', type: 'json', required: true, description: '분류 카테고리' },
    ],
    outputs: [
      { name: 'category', type: 'text', required: true, description: '분류 결과' },
      { name: 'confidence', type: 'number', required: true, description: '신뢰도' },
      { name: 'all_scores', type: 'json', required: false, description: '모든 카테고리 점수' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'categories', label: '카테고리 목록', type: 'textarea', rows: 4,
      description: '줄바꿈으로 구분' },
    { key: 'multi_label', label: '다중 라벨', type: 'toggle', default: false },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const inp = input as any
      const cfg = config as any
      const ctx = context as any
      const imageBase64 = await getImageBase64({ type: 'path', value: inp.image })

      const categories = inp.categories || (cfg.categories as string | undefined)?.split('\n').filter(Boolean) || []
      if (categories.length === 0) throw new Error('카테고리를 지정해주세요')

      const prompt = `이 이미지를 다음 카테고리 중 하나로 분류해주세요:
${categories.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

${cfg.multi_label ? '여러 카테고리에 해당할 수 있습니다.' : '하나의 카테고리만 선택하세요.'}

JSON 출력: {category: "...", confidence: 0.0-1.0, all_scores: {category: score, ...}}`

      const response = await invokeVisionLLM(cfg, ctx, {
        prompt,
        images: [{ base64: imageBase64, detail: 'auto' }],
        maxTokens: 512,
      })

      let result = { category: categories[0], confidence: 0.5, all_scores: {} }
      try {
        const jsonMatch = response.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) result = { ...result, ...JSON.parse(jsonMatch[0]) }
      } catch {}

      return result
    },
  },
}

// ============================================================================
// vision.generate - 이미지 생성 (DALL-E, Stable Diffusion 등)
// ============================================================================
const visionGenerate: UnifiedToolDefinition = {
  name: 'vision.generate',
  version: '1.0.0',
  description: 'AI로 이미지를 생성합니다. DALL-E, Stable Diffusion 등 지원.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '이미지 생성 프롬프트' },
      negative_prompt: { type: 'string', description: '제외할 요소' },
    },
    required: ['prompt'],
  },
  meta: {
    label: '이미지 생성',
    icon: 'AutoAwesome',
    color: '#8b5cf6',
    category: 'vision',
    tags: ['vision', 'generate', 'create', 'dalle', '생성'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true, description: '생성 프롬프트' },
      { name: 'negative_prompt', type: 'text', required: false, description: '제외 프롬프트' },
    ],
    outputs: [
      { name: 'image', type: 'file-ref', required: true, description: '생성된 이미지 경로' },
      { name: 'image_base64', type: 'text', required: false, description: 'Base64 이미지' },
      { name: 'metadata', type: 'json', required: false, description: '생성 메타데이터' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'select', default: 'openai',
      options: [
        { label: 'OpenAI (DALL-E)', value: 'openai' },
        { label: 'Stability AI', value: 'stability' },
        { label: 'Bedrock (Titan)', value: 'bedrock' },
      ] },
    { key: 'model', label: '모델', type: 'text', default: 'dall-e-3' },
    { key: 'size', label: '크기', type: 'select', default: '1024x1024',
      options: [
        { label: '256x256', value: '256x256' },
        { label: '512x512', value: '512x512' },
        { label: '1024x1024', value: '1024x1024' },
        { label: '1792x1024', value: '1792x1024' },
      ] },
    { key: 'quality', label: '품질', type: 'select', default: 'standard',
      options: [
        { label: '표준', value: 'standard' },
        { label: 'HD', value: 'hd' },
      ] },
    { key: 'style', label: '스타일', type: 'select', default: 'vivid',
      options: [
        { label: '생생한', value: 'vivid' },
        { label: '자연스러운', value: 'natural' },
      ] },
    { key: 'output_path', label: '저장 경로', type: 'text' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config) {
      const inp = input as any
      const cfg = config as any
      const { invoke } = await import('@tauri-apps/api/tauri')

      // 이미지 생성 API 호출
      const result = await invoke('tool_generate_image', {
        prompt: inp.prompt,
        negativePrompt: inp.negative_prompt,
        provider: cfg.provider,
        model: cfg.model,
        size: cfg.size,
        quality: cfg.quality,
        style: cfg.style,
        outputPath: cfg.output_path,
      }) as { path: string; base64?: string; metadata?: any }

      return {
        image: result.path,
        image_base64: result.base64,
        metadata: {
          ...result.metadata,
          prompt: inp.prompt,
          size: cfg.size,
          provider: cfg.provider,
        },
      }
    },
  },
}

// ============================================================================
// Export
// ============================================================================
export const VISION_TOOLS: UnifiedToolDefinition[] = [
  visionAnalyze,
  visionOcr,
  visionCompare,
  visionExtract,
  visionCaption,
  visionDetect,
  visionClassify,
  visionGenerate,
]
