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

// Local LLM Provider (Ollama, LM Studio)
import { LocalLLMProviderAdapter, LocalEmbeddingProviderAdapter } from './LocalLLMProviderAdapter'

// Embedding Providers
import { BedrockEmbeddingProvider } from './embedding/BedrockEmbeddingProvider'

// Cloud Providers
import { AWSCloudProvider } from './cloud/AWSCloudProvider'

/**
 * 모든 내장 프로바이더를 등록.
 * 등록만 수행하고, 실제 연결(connect)은 사용자가 UI에서 수행.
 */
export function registerBuiltinProviders(): void {
  // LLM - 로컬 LLM을 첫 번째로 등록 (기본 프로바이더로 설정됨)
  ProviderRegistry.registerLLM(LocalLLMProviderAdapter)
  ProviderRegistry.registerLLM(new BedrockLLMProvider())
  ProviderRegistry.registerLLM(new OpenAIProvider())
  ProviderRegistry.registerLLM(new AnthropicProvider())

  // Embedding - 로컬 임베딩을 첫 번째로 등록
  ProviderRegistry.registerEmbedding(LocalEmbeddingProviderAdapter)
  ProviderRegistry.registerEmbedding(new BedrockEmbeddingProvider())

  // Cloud
  ProviderRegistry.registerCloud(new AWSCloudProvider())

  console.log('[Providers] 4 LLM + 2 Embedding + 1 Cloud 프로바이더 등록 완료')
}

export {
  BedrockLLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  LocalLLMProviderAdapter,
  LocalEmbeddingProviderAdapter,
  BedrockEmbeddingProvider,
  AWSCloudProvider,
}
