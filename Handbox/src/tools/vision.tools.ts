/**
 * Vision/Multimodal 도구 노드 정의
 * AWS Bedrock Claude Vision, GPT-4V 등 멀티모달 LLM 지원
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

export const VisionAnalyzeDefinition: NodeDefinition = {
  type: 'vision.analyze',
  category: 'ai',
  meta: {
    label: '이미지 분석',
    description: 'Claude Vision, GPT-4V 등으로 이미지를 분석합니다. 객체 감지, 장면 이해, 텍스트 추출.',
    icon: 'ImageSearch',
    color: '#8b5cf6',
    tags: ['vision', 'image', 'analyze', 'multimodal', 'claude', 'gpt4v', '이미지', '분석', '멀티모달'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: false, description: '이미지 파일 경로' },
      { name: 'image_url', type: 'text', required: false, description: '이미지 URL' },
      { name: 'image_base64', type: 'text', required: false, description: 'Base64 인코딩 이미지' },
      { name: 'prompt', type: 'text', required: false, description: '분석 요청 프롬프트' },
    ],
    outputs: [
      { name: 'analysis', type: 'llm-response', required: true, description: '분석 결과 텍스트' },
      { name: 'structured', type: 'json', required: false, description: '구조화된 분석 결과' },
      { name: 'objects', type: 'json', required: false, description: '감지된 객체 목록' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true,
      description: 'Claude 3 Opus/Sonnet 또는 GPT-4V 지원' },
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
        { label: '비교 분석', value: 'compare' },
      ] },
    { key: 'prompt', label: '분석 프롬프트', type: 'textarea', rows: 3,
      description: '추가 지시사항. 비워두면 분석 유형에 맞는 기본 프롬프트 사용' },
    { key: 'output_format', label: '출력 형식', type: 'select', default: 'text',
      options: [
        { label: '텍스트', value: 'text' },
        { label: 'JSON (구조화)', value: 'json' },
        { label: 'Markdown', value: 'markdown' },
      ] },
    { key: 'max_tokens', label: '최대 토큰', type: 'number', default: 4096 },
    { key: 'detail_level', label: '상세 수준', type: 'select', default: 'high',
      options: [
        { label: '낮음 (빠름)', value: 'low' },
        { label: '자동', value: 'auto' },
        { label: '높음 (정밀)', value: 'high' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)
      if (!provider) throw new Error(`프로바이더 '${providerId}'를 찾을 수 없습니다`)

      // 이미지 소스 결정
      let imageSource: { type: 'path' | 'url' | 'base64'; value: string } | null = null
      if (input.image || config.image_path) {
        imageSource = { type: 'path', value: input.image || config.image_path }
      } else if (input.image_url) {
        imageSource = { type: 'url', value: input.image_url }
      } else if (input.image_base64) {
        imageSource = { type: 'base64', value: input.image_base64 }
      }

      if (!imageSource) {
        throw new Error('이미지 소스가 필요합니다 (경로, URL, 또는 Base64)')
      }

      // 분석 유형별 기본 프롬프트
      const analysisPrompts: Record<string, string> = {
        general: '이 이미지를 상세히 분석하고 설명해주세요.',
        objects: '이 이미지에서 모든 객체를 감지하고 각각의 위치와 특성을 JSON 형식으로 나열해주세요.',
        ocr: '이 이미지에서 모든 텍스트를 추출해주세요. 레이아웃과 구조를 유지해서 출력하세요.',
        scene: '이 이미지의 장면을 묘사해주세요. 배경, 분위기, 상황을 포함해서 설명하세요.',
        document: '이 문서 이미지를 분석하고 내용을 구조화해서 추출해주세요.',
        chart: '이 차트/그래프를 분석하고 데이터와 인사이트를 추출해주세요.',
        compare: '이 이미지들을 비교 분석하고 유사점과 차이점을 설명해주세요.',
      }

      let prompt = input.prompt || config.prompt || analysisPrompts[config.analysis_type] || analysisPrompts.general

      // JSON 출력 형식이면 프롬프트 수정
      if (config.output_format === 'json') {
        prompt += '\n\n출력은 반드시 유효한 JSON 형식으로 해주세요.'
      }

      // 이미지를 Base64로 변환 (필요한 경우)
      let imageBase64: string
      if (imageSource.type === 'path') {
        const result = await invoke('tool_read_image_base64', { path: imageSource.value }) as string
        imageBase64 = result
      } else if (imageSource.type === 'url') {
        const result = await invoke('tool_fetch_image_base64', { url: imageSource.value }) as string
        imageBase64 = result
      } else {
        imageBase64 = imageSource.value
      }

      // Vision API 호출
      const response = await provider.invoke({
        model: config.model,
        prompt,
        images: [{ base64: imageBase64, detail: config.detail_level || 'high' }],
        maxTokens: config.max_tokens,
      })

      // 결과 파싱
      let structured = null
      let objects = null
      if (config.output_format === 'json' || config.analysis_type === 'objects') {
        try {
          const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                            response.text.match(/(\{[\s\S]*\})/) ||
                            response.text.match(/(\[[\s\S]*\])/)
          if (jsonMatch) {
            structured = JSON.parse(jsonMatch[1].trim())
            if (config.analysis_type === 'objects' && Array.isArray(structured)) {
              objects = structured
            } else if (structured.objects) {
              objects = structured.objects
            }
          }
        } catch { /* 파싱 실패 시 무시 */ }
      }

      return {
        analysis: response.text,
        structured,
        objects,
        usage: response.usage,
      }
    },
  },
  requirements: { provider: 'any' },
}

export const VisionCompareDefinition: NodeDefinition = {
  type: 'vision.compare',
  category: 'ai',
  meta: {
    label: '이미지 비교',
    description: '두 개 이상의 이미지를 비교 분석합니다. 변화 감지, 유사도, 차이점 분석.',
    icon: 'Compare',
    color: '#8b5cf6',
    tags: ['vision', 'compare', 'diff', 'similarity', '비교', '이미지'],
  },
  ports: {
    inputs: [
      { name: 'image1', type: 'file-ref', required: true, description: '첫 번째 이미지' },
      { name: 'image2', type: 'file-ref', required: true, description: '두 번째 이미지' },
      { name: 'image3', type: 'file-ref', required: false, description: '세 번째 이미지 (선택)' },
    ],
    outputs: [
      { name: 'comparison', type: 'llm-response', required: true, description: '비교 분석 결과' },
      { name: 'differences', type: 'json', required: false, description: '차이점 목록' },
      { name: 'similarity_score', type: 'json', required: false, description: '유사도 점수' },
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
    { key: 'focus_areas', label: '집중 영역', type: 'text',
      description: '쉼표로 구분: 색상, 구도, 객체, 텍스트 등' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)
      if (!provider) throw new Error(`프로바이더 '${providerId}'를 찾을 수 없습니다`)

      const images: string[] = []
      for (const key of ['image1', 'image2', 'image3']) {
        if (input[key]) {
          const base64 = await invoke('tool_read_image_base64', { path: input[key] }) as string
          images.push(base64)
        }
      }

      if (images.length < 2) {
        throw new Error('비교를 위해 최소 2개의 이미지가 필요합니다')
      }

      const comparisonPrompts: Record<string, string> = {
        general: `이 ${images.length}개의 이미지를 비교 분석해주세요. 유사점과 차이점을 상세히 설명하세요.`,
        change: '이 이미지들 사이의 변화를 감지하고 설명해주세요. 무엇이 추가/제거/수정되었나요?',
        similarity: '이 이미지들의 유사도를 분석하고 0-100 점수로 평가해주세요. JSON 형식으로 출력하세요.',
        quality: '이 이미지들의 품질을 비교 분석해주세요. 해상도, 선명도, 색상 등을 평가하세요.',
      }

      let prompt = comparisonPrompts[config.comparison_type] || comparisonPrompts.general
      if (config.focus_areas) {
        prompt += `\n\n특히 다음 영역에 집중해서 분석해주세요: ${config.focus_areas}`
      }

      const response = await provider.invoke({
        model: config.model,
        prompt,
        images: images.map(base64 => ({ base64, detail: 'high' })),
        maxTokens: 4096,
      })

      // 결과 파싱
      let differences = null
      let similarity_score = null
      try {
        const jsonMatch = response.text.match(/(\{[\s\S]*\})/) || response.text.match(/(\[[\s\S]*\])/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[1])
          if (parsed.differences) differences = parsed.differences
          if (parsed.similarity || parsed.score) similarity_score = parsed.similarity || parsed.score
        }
      } catch { /* 무시 */ }

      return { comparison: response.text, differences, similarity_score }
    },
  },
}

export const VisionExtractDefinition: NodeDefinition = {
  type: 'vision.extract',
  category: 'ai',
  meta: {
    label: '이미지 데이터 추출',
    description: '이미지에서 구조화된 데이터를 추출합니다. 표, 양식, 영수증, 명함 등.',
    icon: 'TableView',
    color: '#8b5cf6',
    tags: ['vision', 'extract', 'table', 'form', 'receipt', '추출', '표', '양식'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지 파일' },
      { name: 'schema', type: 'json', required: false, description: '추출할 데이터 스키마' },
    ],
    outputs: [
      { name: 'data', type: 'json', required: true, description: '추출된 구조화 데이터' },
      { name: 'raw_text', type: 'text', required: false, description: '원본 텍스트' },
      { name: 'confidence', type: 'json', required: false, description: '신뢰도 점수' },
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
        { label: '영수증/인보이스', value: 'receipt' },
        { label: '명함', value: 'business_card' },
        { label: '신분증/문서', value: 'id_document' },
        { label: '커스텀 스키마', value: 'custom' },
      ] },
    { key: 'schema', label: '커스텀 스키마 (JSON)', type: 'code', language: 'json', rows: 6,
      description: '추출할 필드 정의. 예: {"name": "string", "amount": "number"}' },
    { key: 'language', label: '문서 언어', type: 'select', default: 'auto',
      options: [
        { label: '자동 감지', value: 'auto' },
        { label: '한국어', value: 'ko' },
        { label: '영어', value: 'en' },
        { label: '일본어', value: 'ja' },
        { label: '중국어', value: 'zh' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)
      if (!provider) throw new Error(`프로바이더 '${providerId}'를 찾을 수 없습니다`)

      const imageBase64 = await invoke('tool_read_image_base64', { path: input.image }) as string

      // 추출 유형별 프롬프트
      const extractionPrompts: Record<string, string> = {
        auto: '이 이미지에서 모든 구조화된 데이터를 추출해주세요. JSON 형식으로 출력하세요.',
        table: '이 이미지의 표/테이블 데이터를 추출해주세요. 헤더와 행을 구분해서 JSON 배열로 출력하세요.',
        form: '이 양식의 모든 필드와 값을 추출해주세요. JSON 객체로 출력하세요.',
        receipt: '이 영수증/인보이스의 상점명, 날짜, 항목, 금액, 합계를 추출해주세요. JSON으로 출력하세요.',
        business_card: '이 명함의 이름, 직함, 회사, 전화, 이메일, 주소를 추출해주세요. JSON으로 출력하세요.',
        id_document: '이 신분증/문서의 모든 정보를 추출해주세요. JSON으로 출력하세요.',
        custom: '',
      }

      let prompt = extractionPrompts[config.extraction_type] || extractionPrompts.auto

      // 커스텀 스키마 사용
      if (config.extraction_type === 'custom' && (input.schema || config.schema)) {
        const schema = input.schema || JSON.parse(config.schema || '{}')
        prompt = `이 이미지에서 다음 스키마에 맞는 데이터를 추출해주세요:\n${JSON.stringify(schema, null, 2)}\n\n반드시 유효한 JSON 형식으로 출력하세요.`
      }

      if (config.language && config.language !== 'auto') {
        const langNames: Record<string, string> = { ko: '한국어', en: '영어', ja: '일본어', zh: '중국어' }
        prompt += `\n\n문서 언어: ${langNames[config.language]}`
      }

      const response = await provider.invoke({
        model: config.model,
        prompt,
        images: [{ base64: imageBase64, detail: 'high' }],
        maxTokens: 4096,
      })

      // JSON 파싱
      let data = null
      try {
        const jsonMatch = response.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                          response.text.match(/(\{[\s\S]*\})/) ||
                          response.text.match(/(\[[\s\S]*\])/)
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[1].trim())
        }
      } catch {
        data = { raw: response.text, parseError: true }
      }

      return {
        data,
        raw_text: response.text,
        confidence: data?.confidence || null,
      }
    },
  },
}

export const VisionOcrAdvancedDefinition: NodeDefinition = {
  type: 'vision.ocr-advanced',
  category: 'ai',
  meta: {
    label: '고급 OCR',
    description: 'AI 기반 고급 OCR. 레이아웃 이해, 다국어, 손글씨 지원.',
    icon: 'DocumentScanner',
    color: '#8b5cf6',
    tags: ['ocr', 'text', 'extract', 'handwriting', '텍스트', '추출', '손글씨'],
  },
  ports: {
    inputs: [
      { name: 'image', type: 'file-ref', required: true, description: '이미지 파일' },
    ],
    outputs: [
      { name: 'text', type: 'text', required: true, description: '추출된 텍스트' },
      { name: 'blocks', type: 'json', required: false, description: '텍스트 블록 (위치 포함)' },
      { name: 'layout', type: 'json', required: false, description: '문서 레이아웃 구조' },
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
        { label: 'HTML', value: 'html' },
        { label: 'JSON (블록)', value: 'json' },
      ] },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const providerId = config.provider || context.defaultLLMProvider
      const provider = ProviderRegistry.getLLMProvider(providerId)
      if (!provider) throw new Error(`프로바이더 '${providerId}'를 찾을 수 없습니다`)

      const imageBase64 = await invoke('tool_read_image_base64', { path: input.image }) as string

      let prompt = '이 이미지에서 모든 텍스트를 추출해주세요.'
      if (config.preserve_layout) {
        prompt += ' 원본 문서의 레이아웃과 구조를 최대한 유지해주세요.'
      }
      if (config.detect_handwriting) {
        prompt += ' 손글씨도 인식해주세요.'
      }
      if (config.output_format === 'markdown') {
        prompt += ' Markdown 형식으로 출력해주세요.'
      } else if (config.output_format === 'html') {
        prompt += ' HTML 형식으로 출력해주세요.'
      } else if (config.output_format === 'json') {
        prompt += ' 각 텍스트 블록을 JSON 배열로 출력해주세요. [{text, type, position}] 형식.'
      }

      const response = await provider.invoke({
        model: config.model,
        prompt,
        images: [{ base64: imageBase64, detail: 'high' }],
        maxTokens: 8192,
      })

      let blocks = null
      let layout = null
      if (config.output_format === 'json') {
        try {
          const jsonMatch = response.text.match(/(\[[\s\S]*\])/)
          if (jsonMatch) {
            blocks = JSON.parse(jsonMatch[1])
            layout = { blocks: blocks.length, type: 'detected' }
          }
        } catch { /* 무시 */ }
      }

      return {
        text: response.text,
        blocks,
        layout,
      }
    },
  },
}

export const VISION_DEFINITIONS: NodeDefinition[] = [
  VisionAnalyzeDefinition,
  VisionCompareDefinition,
  VisionExtractDefinition,
  VisionOcrAdvancedDefinition,
]
