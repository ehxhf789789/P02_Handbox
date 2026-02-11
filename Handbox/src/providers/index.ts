/**
 * Provider Registration — 모든 내장 프로바이더를 ProviderRegistry에 등록
 *
 * 앱 초기화 시 registerBuiltinProviders()를 호출하여 등록.
 */

import { ProviderRegistry } from '../registry/ProviderRegistry'

// LLM Providers
import { BedrockLLMProvider } from './llm/BedrockLLMProvider'
import { OpenAIProvider } from './llm/OpenAIProvider'
import { AnthropicProvider } from './llm/AnthropicProvider'

// Embedding Providers
import { BedrockEmbeddingProvider } from './embedding/BedrockEmbeddingProvider'

// Cloud Providers
import { AWSCloudProvider } from './cloud/AWSCloudProvider'

/**
 * 모든 내장 프로바이더를 등록.
 * 등록만 수행하고, 실제 연결(connect)은 사용자가 UI에서 수행.
 */
export function registerBuiltinProviders(): void {
  // LLM
  ProviderRegistry.registerLLM(new BedrockLLMProvider())
  ProviderRegistry.registerLLM(new OpenAIProvider())
  ProviderRegistry.registerLLM(new AnthropicProvider())

  // Embedding
  ProviderRegistry.registerEmbedding(new BedrockEmbeddingProvider())

  // Cloud
  ProviderRegistry.registerCloud(new AWSCloudProvider())

  console.log('[Providers] 3 LLM + 1 Embedding + 1 Cloud 프로바이더 등록 완료')
}

export {
  BedrockLLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  BedrockEmbeddingProvider,
  AWSCloudProvider,
}
