/**
 * VLM (Vision Language Model) 실험/연구 도구 노드 정의
 * 모델 벤치마킹, A/B 테스트, 프롬프트 최적화, 파인튜닝 준비
 */
import { invoke } from '@tauri-apps/api/tauri'
import type { NodeDefinition } from '../registry/NodeDefinition'
import { ProviderRegistry } from '../registry/ProviderRegistry'

export const VlmExperimentDefinition: NodeDefinition = {
  type: 'vlm.experiment',
  category: 'ai',
  meta: {
    label: 'VLM 실험',
    description: '여러 VLM 모델/프롬프트를 동시에 테스트하고 결과를 비교합니다.',
    icon: 'Science',
    color: '#a855f7',
    tags: ['vlm', 'experiment', 'test', 'compare', '실험', 'VLM', '비교'],
  },
  ports: {
    inputs: [
      { name: 'images', type: 'json', required: true, description: '이미지 경로 배열' },
      { name: 'prompts', type: 'json', required: false, description: '테스트할 프롬프트 배열' },
    ],
    outputs: [
      { name: 'results', type: 'json', required: true, description: '모든 실험 결과' },
      { name: 'comparison', type: 'json', required: false, description: '모델별 비교 분석' },
      { name: 'best_config', type: 'json', required: false, description: '최적 설정 추천' },
    ],
  },
  configSchema: [
    { key: 'models', label: '테스트 모델', type: 'textarea', required: true, rows: 3,
      description: '모델 ID를 줄바꿈으로 구분. 예:\nclaude-3-opus-20240229\nclaude-3-sonnet-20240229\ngpt-4-vision-preview' },
    { key: 'prompts', label: '테스트 프롬프트', type: 'textarea', rows: 4,
      description: '프롬프트를 ---로 구분' },
    { key: 'metrics', label: '평가 지표', type: 'select', default: 'all',
      options: [
        { label: '모든 지표', value: 'all' },
        { label: '응답 품질', value: 'quality' },
        { label: '응답 속도', value: 'latency' },
        { label: '토큰 효율', value: 'tokens' },
        { label: '일관성', value: 'consistency' },
      ] },
    { key: 'runs_per_config', label: '설정당 실행 횟수', type: 'number', default: 3,
      description: '일관성 측정을 위한 반복 횟수' },
    { key: 'temperature_range', label: '온도 범위', type: 'text', default: '0.0,0.5,1.0',
      description: '쉼표로 구분된 temperature 값들' },
    { key: 'save_results', label: '결과 저장', type: 'toggle', default: true },
    { key: 'output_path', label: '결과 저장 경로', type: 'folder' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const models = (config.models || '').split('\n').map((m: string) => m.trim()).filter(Boolean)
      const prompts = input.prompts || (config.prompts || '').split('---').map((p: string) => p.trim()).filter(Boolean)
      const images = Array.isArray(input.images) ? input.images : [input.images]
      const temperatures = (config.temperature_range || '0.7').split(',').map((t: string) => parseFloat(t.trim()))
      const runsPerConfig = config.runs_per_config || 1

      if (models.length === 0) throw new Error('테스트할 모델을 지정해주세요')
      if (images.length === 0) throw new Error('테스트할 이미지가 필요합니다')
      if (prompts.length === 0) {
        prompts.push('이 이미지를 상세히 분석하고 설명해주세요.')
      }

      // 이미지 Base64 변환
      const imageBase64List: string[] = []
      for (const img of images) {
        const base64 = await invoke('tool_read_image_base64', { path: img }) as string
        imageBase64List.push(base64)
      }

      const results: any[] = []
      const modelMetrics: Record<string, any> = {}

      // 실험 실행
      for (const model of models) {
        modelMetrics[model] = { totalLatency: 0, totalTokens: 0, runs: 0, responses: [] }

        for (const prompt of prompts) {
          for (const temp of temperatures) {
            for (let run = 0; run < runsPerConfig; run++) {
              const provider = ProviderRegistry.getLLMProvider(context.defaultLLMProvider)
              if (!provider) continue

              const startTime = Date.now()
              try {
                const response = await provider.invoke({
                  model,
                  prompt,
                  images: imageBase64List.map(base64 => ({ base64, detail: 'high' })),
                  temperature: temp,
                  maxTokens: 2048,
                })

                const latency = Date.now() - startTime
                const tokens = response.usage?.totalTokens || 0

                const result = {
                  model,
                  prompt: prompt.slice(0, 50) + '...',
                  temperature: temp,
                  run: run + 1,
                  latency,
                  tokens,
                  responseLength: response.text.length,
                  response: response.text.slice(0, 500),
                  success: true,
                }

                results.push(result)
                modelMetrics[model].totalLatency += latency
                modelMetrics[model].totalTokens += tokens
                modelMetrics[model].runs++
                modelMetrics[model].responses.push(response.text)
              } catch (error) {
                results.push({
                  model,
                  prompt: prompt.slice(0, 50) + '...',
                  temperature: temp,
                  run: run + 1,
                  error: String(error),
                  success: false,
                })
              }
            }
          }
        }
      }

      // 비교 분석 생성
      const comparison: Record<string, any> = {}
      for (const [model, metrics] of Object.entries(modelMetrics)) {
        if (metrics.runs > 0) {
          comparison[model] = {
            avgLatency: Math.round(metrics.totalLatency / metrics.runs),
            avgTokens: Math.round(metrics.totalTokens / metrics.runs),
            successRate: results.filter(r => r.model === model && r.success).length / metrics.runs * 100,
            consistencyScore: calculateConsistency(metrics.responses),
          }
        }
      }

      // 최적 설정 추천
      const bestConfig = Object.entries(comparison)
        .map(([model, metrics]: [string, any]) => ({
          model,
          score: (100 - metrics.avgLatency / 100) + metrics.successRate + metrics.consistencyScore,
          ...metrics,
        }))
        .sort((a, b) => b.score - a.score)[0]

      // 결과 저장
      if (config.save_results && config.output_path) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        await invoke('tool_write_file', {
          path: `${config.output_path}/vlm_experiment_${timestamp}.json`,
          content: JSON.stringify({ results, comparison, bestConfig }, null, 2),
        })
      }

      return { results, comparison, best_config: bestConfig }
    },
  },
}

// 응답 일관성 계산 (간단한 유사도 기반)
function calculateConsistency(responses: string[]): number {
  if (responses.length < 2) return 100
  let totalSimilarity = 0
  let comparisons = 0
  for (let i = 0; i < responses.length - 1; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      totalSimilarity += stringSimilarity(responses[i], responses[j])
      comparisons++
    }
  }
  return comparisons > 0 ? Math.round(totalSimilarity / comparisons * 100) : 100
}

function stringSimilarity(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().split(/\s+/))
  const words2 = new Set(s2.toLowerCase().split(/\s+/))
  const intersection = [...words1].filter(w => words2.has(w)).length
  const union = new Set([...words1, ...words2]).size
  return union > 0 ? intersection / union : 0
}

export const VlmBenchmarkDefinition: NodeDefinition = {
  type: 'vlm.benchmark',
  category: 'ai',
  meta: {
    label: 'VLM 벤치마크',
    description: '표준 VLM 벤치마크 데이터셋으로 모델 성능을 측정합니다.',
    icon: 'Speed',
    color: '#a855f7',
    tags: ['vlm', 'benchmark', 'performance', 'evaluation', '벤치마크', '성능'],
  },
  ports: {
    inputs: [
      { name: 'custom_dataset', type: 'json', required: false, description: '커스텀 벤치마크 데이터셋' },
    ],
    outputs: [
      { name: 'scores', type: 'json', required: true, description: '벤치마크 점수' },
      { name: 'details', type: 'json', required: false, description: '상세 결과' },
      { name: 'report', type: 'text', required: false, description: 'Markdown 보고서' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'benchmark_type', label: '벤치마크 유형', type: 'select', default: 'general',
      options: [
        { label: '일반 VQA', value: 'general' },
        { label: 'OCR 정확도', value: 'ocr' },
        { label: '객체 감지', value: 'object' },
        { label: '문서 이해', value: 'document' },
        { label: '차트 해석', value: 'chart' },
        { label: '수학 문제', value: 'math' },
        { label: '커스텀', value: 'custom' },
      ] },
    { key: 'sample_size', label: '샘플 크기', type: 'number', default: 10 },
    { key: 'include_baseline', label: '베이스라인 비교', type: 'toggle', default: true },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      // 벤치마크 유형별 테스트 케이스
      const benchmarkCases: Record<string, any[]> = {
        general: [
          { question: '이 이미지에 무엇이 있나요?', expectedType: 'description' },
          { question: '이미지의 주요 색상은 무엇인가요?', expectedType: 'color' },
        ],
        ocr: [
          { question: '이미지의 모든 텍스트를 읽어주세요', expectedType: 'text' },
        ],
        document: [
          { question: '이 문서의 제목과 주요 내용을 요약해주세요', expectedType: 'summary' },
        ],
      }

      const testCases = input.custom_dataset || benchmarkCases[config.benchmark_type] || benchmarkCases.general
      const results: any[] = []
      let correctCount = 0

      for (const testCase of testCases.slice(0, config.sample_size)) {
        const startTime = Date.now()
        try {
          const response = await provider.invoke({
            model: config.model,
            prompt: testCase.question,
            images: testCase.image ? [{ base64: testCase.image, detail: 'high' }] : [],
            maxTokens: 1024,
          })

          const latency = Date.now() - startTime
          const isCorrect = testCase.expected
            ? response.text.toLowerCase().includes(testCase.expected.toLowerCase())
            : true

          if (isCorrect) correctCount++

          results.push({
            question: testCase.question,
            response: response.text.slice(0, 200),
            latency,
            correct: isCorrect,
            tokens: response.usage?.totalTokens,
          })
        } catch (error) {
          results.push({
            question: testCase.question,
            error: String(error),
            correct: false,
          })
        }
      }

      const scores = {
        accuracy: (correctCount / results.length * 100).toFixed(1) + '%',
        avgLatency: Math.round(results.reduce((a, r) => a + (r.latency || 0), 0) / results.length) + 'ms',
        totalTests: results.length,
        passed: correctCount,
        failed: results.length - correctCount,
      }

      const report = `# VLM 벤치마크 결과

## 모델: ${config.model}
## 벤치마크: ${config.benchmark_type}

### 점수
- 정확도: ${scores.accuracy}
- 평균 응답시간: ${scores.avgLatency}
- 통과: ${scores.passed}/${scores.totalTests}

### 상세 결과
${results.map((r, i) => `${i + 1}. ${r.question}\n   - ${r.correct ? '✅' : '❌'} ${r.latency || 0}ms`).join('\n')}
`

      return { scores, details: results, report }
    },
  },
}

export const VlmPromptOptimizerDefinition: NodeDefinition = {
  type: 'vlm.prompt-optimizer',
  category: 'ai',
  meta: {
    label: '프롬프트 최적화',
    description: 'VLM 프롬프트를 자동으로 최적화하고 효과적인 프롬프트를 생성합니다.',
    icon: 'AutoAwesome',
    color: '#a855f7',
    tags: ['vlm', 'prompt', 'optimize', 'tuning', '프롬프트', '최적화'],
  },
  ports: {
    inputs: [
      { name: 'base_prompt', type: 'text', required: true, description: '기본 프롬프트' },
      { name: 'test_images', type: 'json', required: true, description: '테스트 이미지 배열' },
      { name: 'expected_outputs', type: 'json', required: false, description: '기대 출력 예시' },
    ],
    outputs: [
      { name: 'optimized_prompt', type: 'text', required: true, description: '최적화된 프롬프트' },
      { name: 'variations', type: 'json', required: false, description: '프롬프트 변형들' },
      { name: 'performance', type: 'json', required: false, description: '성능 비교' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더', type: 'provider', required: true },
    { key: 'model', label: '모델', type: 'model', required: true },
    { key: 'optimization_goal', label: '최적화 목표', type: 'select', default: 'accuracy',
      options: [
        { label: '정확도', value: 'accuracy' },
        { label: '구체성', value: 'specificity' },
        { label: '간결성', value: 'conciseness' },
        { label: '일관성', value: 'consistency' },
        { label: '창의성', value: 'creativity' },
      ] },
    { key: 'iterations', label: '최적화 반복 횟수', type: 'number', default: 5 },
    { key: 'generate_variations', label: '변형 생성 수', type: 'number', default: 3 },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      const provider = ProviderRegistry.getLLMProvider(config.provider || context.defaultLLMProvider)
      if (!provider) throw new Error('프로바이더를 찾을 수 없습니다')

      const basePrompt = input.base_prompt
      const testImages = Array.isArray(input.test_images) ? input.test_images : [input.test_images]
      const expectedOutputs = input.expected_outputs || []

      // 프롬프트 변형 생성
      const variationPrompt = `다음 Vision 모델 프롬프트를 "${config.optimization_goal}" 목표로 ${config.generate_variations}개의 변형을 생성해주세요.

원본 프롬프트: "${basePrompt}"

각 변형은 다음을 고려해야 합니다:
- 명확하고 구체적인 지시
- 출력 형식 명시
- 관련 컨텍스트 포함

JSON 배열로 출력해주세요: ["변형1", "변형2", ...]`

      const variationResponse = await provider.invoke({
        model: config.model,
        prompt: variationPrompt,
        maxTokens: 2048,
      })

      let variations: string[] = [basePrompt]
      try {
        const match = variationResponse.text.match(/\[[\s\S]*\]/)
        if (match) {
          variations = [basePrompt, ...JSON.parse(match[0])]
        }
      } catch { /* 무시 */ }

      // 각 변형 테스트
      const performance: any[] = []
      for (const prompt of variations) {
        let totalScore = 0
        for (let i = 0; i < testImages.length; i++) {
          const imageBase64 = await invoke('tool_read_image_base64', { path: testImages[i] }) as string
          const startTime = Date.now()

          const response = await provider.invoke({
            model: config.model,
            prompt,
            images: [{ base64: imageBase64, detail: 'high' }],
            maxTokens: 1024,
          })

          const latency = Date.now() - startTime
          let score = 50 // 기본 점수

          // 기대 출력과 비교
          if (expectedOutputs[i]) {
            const expected = expectedOutputs[i].toLowerCase()
            const actual = response.text.toLowerCase()
            if (actual.includes(expected)) score += 30
          }

          // 응답 품질 평가
          if (response.text.length > 100) score += 10
          if (latency < 3000) score += 10

          totalScore += score
        }

        performance.push({
          prompt: prompt.slice(0, 100),
          avgScore: totalScore / testImages.length,
          fullPrompt: prompt,
        })
      }

      // 최적 프롬프트 선택
      performance.sort((a, b) => b.avgScore - a.avgScore)
      const optimized_prompt = performance[0].fullPrompt

      return {
        optimized_prompt,
        variations: performance.map(p => ({ prompt: p.fullPrompt, score: p.avgScore })),
        performance: {
          original_score: performance.find(p => p.fullPrompt === basePrompt)?.avgScore,
          optimized_score: performance[0].avgScore,
          improvement: ((performance[0].avgScore - (performance.find(p => p.fullPrompt === basePrompt)?.avgScore || 0)) / 100 * 100).toFixed(1) + '%',
        },
      }
    },
  },
}

export const VlmDatasetBuilderDefinition: NodeDefinition = {
  type: 'vlm.dataset-builder',
  category: 'ai',
  meta: {
    label: '데이터셋 빌더',
    description: 'VLM 파인튜닝/평가용 데이터셋을 구축합니다.',
    icon: 'Dataset',
    color: '#a855f7',
    tags: ['vlm', 'dataset', 'finetune', 'training', '데이터셋', '파인튜닝'],
  },
  ports: {
    inputs: [
      { name: 'images_folder', type: 'file-ref', required: true, description: '이미지 폴더 경로' },
      { name: 'annotations', type: 'json', required: false, description: '기존 어노테이션' },
    ],
    outputs: [
      { name: 'dataset', type: 'json', required: true, description: '완성된 데이터셋' },
      { name: 'stats', type: 'json', required: false, description: '데이터셋 통계' },
      { name: 'export_path', type: 'text', required: false, description: '내보내기 경로' },
    ],
  },
  configSchema: [
    { key: 'provider', label: '프로바이더 (자동 어노테이션용)', type: 'provider' },
    { key: 'model', label: '모델', type: 'model' },
    { key: 'dataset_format', label: '데이터셋 형식', type: 'select', default: 'jsonl',
      options: [
        { label: 'JSONL', value: 'jsonl' },
        { label: 'CSV', value: 'csv' },
        { label: 'Parquet', value: 'parquet' },
        { label: 'HuggingFace', value: 'hf' },
      ] },
    { key: 'auto_annotate', label: '자동 어노테이션', type: 'toggle', default: false,
      description: 'AI로 자동으로 이미지 설명 생성' },
    { key: 'annotation_prompt', label: '어노테이션 프롬프트', type: 'textarea', rows: 3,
      default: '이 이미지를 상세히 설명해주세요.' },
    { key: 'split_ratio', label: '분할 비율 (train/val/test)', type: 'text', default: '0.8,0.1,0.1' },
    { key: 'export_path', label: '내보내기 경로', type: 'folder' },
  ],
  runtime: 'tauri',
  executor: {
    async execute(input, config, context) {
      // 이미지 폴더에서 파일 목록 가져오기
      const files = await invoke('tool_list_files', {
        path: input.images_folder,
        pattern: '*.{jpg,jpeg,png,gif,webp}',
      }) as string[]

      const dataset: any[] = []
      const annotations = input.annotations || {}

      for (const file of files) {
        const entry: any = {
          image: file,
          filename: file.split(/[\\/]/).pop(),
        }

        // 기존 어노테이션 사용
        if (annotations[entry.filename]) {
          entry.annotation = annotations[entry.filename]
        }
        // 자동 어노테이션
        else if (config.auto_annotate && config.provider) {
          const provider = ProviderRegistry.getLLMProvider(config.provider)
          if (provider) {
            const imageBase64 = await invoke('tool_read_image_base64', { path: file }) as string
            const response = await provider.invoke({
              model: config.model,
              prompt: config.annotation_prompt || '이 이미지를 설명해주세요.',
              images: [{ base64: imageBase64, detail: 'auto' }],
              maxTokens: 512,
            })
            entry.annotation = response.text
          }
        }

        dataset.push(entry)
      }

      // 데이터셋 분할
      const ratios = (config.split_ratio || '0.8,0.1,0.1').split(',').map((r: string) => parseFloat(r))
      const shuffled = dataset.sort(() => Math.random() - 0.5)
      const trainSize = Math.floor(shuffled.length * ratios[0])
      const valSize = Math.floor(shuffled.length * ratios[1])

      const splits = {
        train: shuffled.slice(0, trainSize),
        validation: shuffled.slice(trainSize, trainSize + valSize),
        test: shuffled.slice(trainSize + valSize),
      }

      // 통계 계산
      const stats = {
        total: dataset.length,
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
        annotated: dataset.filter(d => d.annotation).length,
        format: config.dataset_format,
      }

      // 내보내기
      let export_path = null
      if (config.export_path) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        export_path = `${config.export_path}/vlm_dataset_${timestamp}`

        // JSONL 형식으로 저장
        if (config.dataset_format === 'jsonl') {
          for (const [split, data] of Object.entries(splits)) {
            const content = data.map(d => JSON.stringify(d)).join('\n')
            await invoke('tool_write_file', {
              path: `${export_path}/${split}.jsonl`,
              content,
            })
          }
        }
      }

      return { dataset: splits, stats, export_path }
    },
  },
}

export const VLM_DEFINITIONS: NodeDefinition[] = [
  VlmExperimentDefinition,
  VlmBenchmarkDefinition,
  VlmPromptOptimizerDefinition,
  VlmDatasetBuilderDefinition,
]
