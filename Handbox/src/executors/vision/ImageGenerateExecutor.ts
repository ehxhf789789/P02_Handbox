/**
 * ImageGenerateExecutor - AI Image Generation
 *
 * Generate images using Bedrock Titan Image or Stability AI
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { NodeExecutor, NodeDefinition } from '../../registry/NodeDefinition'
import type { ExecutionContext } from '../../engine/types'

interface ImageGenerationResult {
  imageBase64: string
  imagePath?: string
  model: string
  prompt: string
  dimensions: { width: number; height: number }
}

const executor: NodeExecutor = {
  async execute(
    input: Record<string, unknown>,
    config: Record<string, unknown>,
    _context: ExecutionContext,
  ): Promise<Record<string, unknown>> {
    const prompt = (input.prompt || input.text || config.prompt) as string
    const negativePrompt = (config.negative_prompt as string) || ''
    const model = (config.model as string) || 'titan-image-g1'
    const width = (config.width as number) || 1024
    const height = (config.height as number) || 1024
    const style = (config.style as string) || 'photorealistic'
    const outputPath = (config.output_path as string) || ''

    if (!prompt) {
      return {
        image_base64: '',
        error: '이미지 생성을 위한 프롬프트를 입력하세요.',
      }
    }

    try {
      // Bedrock Titan Image Generator 호출
      const result = await invoke<ImageGenerationResult>('generate_image', {
        request: {
          prompt,
          negative_prompt: negativePrompt,
          model,
          width,
          height,
          style,
          output_path: outputPath,
        },
      })

      return {
        image_base64: result.imageBase64,
        image_path: result.imagePath,
        model: result.model,
        prompt: result.prompt,
        width: result.dimensions.width,
        height: result.dimensions.height,
        _renderType: 'image',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn('[ImageGenerateExecutor] generate_image 호출 실패:', errorMessage)

      // 시뮬레이션 응답
      return {
        image_base64: '',
        model,
        prompt,
        width,
        height,
        _simulation: true,
        error: '이미지 생성 실패. Bedrock Titan Image 연결 필요.',
        _note: `src-tauri에 generate_image Tauri 명령어 구현 필요.

Bedrock Titan Image Generator API:
- Model ID: amazon.titan-image-generator-v1
- Input: { textToImageParams: { text: prompt }, imageGenerationConfig: { ... } }
- Output: Base64 encoded image`,
      }
    }
  },
}

export const ImageGenerateDefinition: NodeDefinition = {
  type: 'vision.generate',
  category: 'vision',
  meta: {
    label: '이미지 생성',
    description: 'AI로 텍스트 프롬프트에서 이미지를 생성합니다 (Bedrock Titan Image)',
    icon: 'Image',
    color: '#ec4899',
    tags: ['비전', '이미지', '생성', 'AI', 'Titan'],
  },
  ports: {
    inputs: [
      { name: 'prompt', type: 'text', required: true, description: '이미지 생성 프롬프트' },
    ],
    outputs: [
      { name: 'image_base64', type: 'text', required: true, description: '생성된 이미지 (Base64)' },
      { name: 'image_path', type: 'text', required: false, description: '저장된 이미지 경로' },
    ],
  },
  configSchema: [
    { key: 'prompt', label: '프롬프트 (고정)', type: 'textarea', required: false },
    { key: 'negative_prompt', label: '네거티브 프롬프트', type: 'textarea', required: false },
    {
      key: 'model',
      label: '이미지 모델',
      type: 'select',
      required: true,
      default: 'titan-image-g1',
      options: [
        { label: 'Amazon Titan Image G1', value: 'titan-image-g1' },
        { label: 'Stability SDXL 1.0', value: 'stability-sdxl' },
      ],
    },
    {
      key: 'width',
      label: '너비',
      type: 'select',
      required: false,
      default: 1024,
      options: [
        { label: '512', value: 512 },
        { label: '768', value: 768 },
        { label: '1024', value: 1024 },
      ],
    },
    {
      key: 'height',
      label: '높이',
      type: 'select',
      required: false,
      default: 1024,
      options: [
        { label: '512', value: 512 },
        { label: '768', value: 768 },
        { label: '1024', value: 1024 },
      ],
    },
    {
      key: 'style',
      label: '스타일',
      type: 'select',
      required: false,
      default: 'photorealistic',
      options: [
        { label: '사진', value: 'photorealistic' },
        { label: '일러스트', value: 'cinematic' },
        { label: '아트', value: 'digital-art' },
        { label: '애니메이션', value: 'anime' },
      ],
    },
    { key: 'output_path', label: '저장 경로', type: 'text', required: false },
  ],
  runtime: 'internal',
  executor,
}

export default ImageGenerateDefinition
