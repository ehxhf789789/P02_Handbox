/**
 * VisionAnalyzeExecutor - Image/Document analysis
 *
 * Analyze images using Claude Vision (Bedrock) or local vision models
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface VisionAnalysisResult {
  analysis: string
  extractedText?: string
  objects?: Array<{ label: string; confidence: number }>
  tables?: Array<{ rows: string[][] }>
  confidence: number
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const predecessors = input._predecessors as unknown[] | undefined
    const imagePath = (input.image_path || input.file_path || config.image_path) as string
    const imageBase64 = (input.image_base64 || input.base64) as string | undefined
    const analysisType = (config.analysis_type as string) || 'general'
    const prompt = (input.prompt || config.prompt) as string || ''
    const model = (config.model as string) || 'claude-3-sonnet'

    // 이전 노드에서 파일 경로를 받을 수 있음
    const filePathFromPrev = predecessors?.[0] as Record<string, unknown> | undefined
    const resolvedPath = imagePath || filePathFromPrev?.file_path || filePathFromPrev?.path

    if (!resolvedPath && !imageBase64) {
      return {
        analysis: '',
        error: '이미지 경로 또는 Base64 데이터를 제공하세요.',
      }
    }

    try {
      // Bedrock Claude Vision 호출
      const result = await invoke<VisionAnalysisResult>('vision_analyze', {
        imagePath: resolvedPath,
        imageBase64,
        analysisType,
        prompt,
        model,
      })

      return {
        analysis: result.analysis,
        extracted_text: result.extractedText,
        objects: result.objects,
        tables: result.tables,
        confidence: result.confidence,
        model,
        analysis_type: analysisType,
      }
    } catch (error) {
      // Tauri 명령어가 없으면 시뮬레이션 반환
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn('[VisionAnalyzeExecutor] vision_analyze 호출 실패, 시뮬레이션 모드:', errorMessage)

      // 시뮬레이션 응답
      const simulatedAnalysis = getSimulatedAnalysis(analysisType, prompt)

      return {
        analysis: simulatedAnalysis,
        extracted_text: analysisType === 'ocr' ? '[시뮬레이션] 추출된 텍스트입니다...' : undefined,
        confidence: 0.85,
        model,
        analysis_type: analysisType,
        _simulation: true,
        _note: 'Bedrock Vision 연결 필요. src-tauri/src/commands에 vision_analyze 구현 필요.',
      }
    }
  },
}

function getSimulatedAnalysis(analysisType: string, prompt: string): string {
  const analyses: Record<string, string> = {
    general: '[시뮬레이션] 이미지 분석 결과입니다.\n- 이미지 유형: 문서/사진\n- 주요 내용: 분석 대기 중\n- 품질: 양호',
    ocr: '[시뮬레이션] OCR 결과입니다.\n추출된 텍스트가 여기에 표시됩니다.',
    document: '[시뮬레이션] 문서 분석 결과입니다.\n- 문서 유형: 보고서\n- 페이지 수: 1\n- 언어: 한국어',
    chart: '[시뮬레이션] 차트 분석 결과입니다.\n- 차트 유형: 막대 그래프\n- 데이터 포인트: 5개\n- 트렌드: 상승',
    table: '[시뮬레이션] 표 분석 결과입니다.\n- 행: 5개\n- 열: 3개\n- 구조: 정형화됨',
  }

  let result = analyses[analysisType] || analyses.general

  if (prompt) {
    result += `\n\n사용자 프롬프트: "${prompt}"\n→ 프롬프트 기반 분석 대기 중`
  }

  return result
}

export const VisionAnalyzeDefinition: NodeDefinition = {
  type: 'vision.analyze',
  category: 'vision',
  meta: {
    label: '이미지 분석',
    description: 'Claude Vision으로 이미지/문서를 분석합니다 (OCR, 객체 감지, 차트 분석)',
    icon: 'Visibility',
    color: '#8b5cf6',
    tags: ['비전', '이미지', 'OCR', '문서', '분석'],
  },
  ports: {
    inputs: [
      { name: 'image_path', type: 'text', required: false, description: '이미지 파일 경로' },
      { name: 'image_base64', type: 'text', required: false, description: '이미지 Base64 데이터' },
      { name: 'prompt', type: 'text', required: false, description: '분석 프롬프트' },
    ],
    outputs: [
      { name: 'analysis', type: 'text', required: true, description: '분석 결과' },
      { name: 'extracted_text', type: 'text', required: false, description: 'OCR 추출 텍스트' },
      { name: 'objects', type: 'json', required: false, description: '감지된 객체 목록' },
      { name: 'tables', type: 'json', required: false, description: '추출된 표 데이터' },
    ],
  },
  configSchema: [
    { key: 'image_path', label: '이미지 경로 (고정)', type: 'text', required: false },
    {
      key: 'analysis_type',
      label: '분석 유형',
      type: 'select',
      required: true,
      default: 'general',
      options: [
        { label: '일반 분석', value: 'general' },
        { label: 'OCR (텍스트 추출)', value: 'ocr' },
        { label: '문서 분석', value: 'document' },
        { label: '차트 분석', value: 'chart' },
        { label: '표 추출', value: 'table' },
      ],
    },
    {
      key: 'model',
      label: '비전 모델',
      type: 'select',
      required: false,
      default: 'claude-3-sonnet',
      options: [
        { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
        { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet' },
        { label: 'Claude 3 Haiku', value: 'claude-3-haiku' },
      ],
    },
    { key: 'prompt', label: '분석 프롬프트', type: 'textarea', required: false },
  ],
  runtime: 'internal',
  executor,
}

export default VisionAnalyzeDefinition
