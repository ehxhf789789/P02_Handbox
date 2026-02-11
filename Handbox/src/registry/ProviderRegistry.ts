/**
 * Provider Registry — AI/Cloud 프로바이더 중앙 관리
 *
 * LLM, 임베딩, 클라우드 서비스 프로바이더를 등록하고 관리한다.
 * 노드 실행 시 ProviderRegistry를 통해 활성 프로바이더를 가져온다.
 */

import type { LLMRequest, LLMResponse, EmbeddingRequest, EmbeddingResponse } from '../engine/types'

// ============================================================
// LLM Provider 인터페이스
// ============================================================

export interface ModelInfo {
  id: string
  name: string
  description?: string
  maxTokens?: number
  supportsFunctions?: boolean
  supportsVision?: boolean
}

export interface LLMProvider {
  /** 프로바이더 고유 ID (e.g., 'bedrock', 'openai') */
  readonly id: string
  /** 표시 이름 */
  readonly name: string
  /** 아이콘 (선택) */
  readonly icon?: string

  /** 연결 (자격 증명 설정) */
  connect(credentials: Record<string, any>): Promise<boolean>
  /** 연결 해제 */
  disconnect(): void
  /** 연결 상태 확인 */
  isConnected(): boolean

  /** 사용 가능한 모델 목록 */
  listModels(): Promise<ModelInfo[]>

  /** LLM 호출 */
  invoke(request: LLMRequest): Promise<LLMResponse>
}

// ============================================================
// Embedding Provider 인터페이스
// ============================================================

export interface EmbeddingProvider {
  readonly id: string
  readonly name: string

  connect(credentials: Record<string, any>): Promise<boolean>
  disconnect(): void
  isConnected(): boolean

  listModels(): Promise<ModelInfo[]>
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>
}

// ============================================================
// Cloud Provider 인터페이스 (AWS, GCP, Azure 등)
// ============================================================

export interface CloudServiceInfo {
  id: string
  name: string
  available: boolean
  error?: string
}

export type CloudAuthMethod = 'cli' | 'api-key' | 'credentials' | 'oauth'

export interface CloudProvider {
  readonly id: string
  readonly name: string

  /** 지원하는 인증 방법 */
  supportedAuthMethods(): CloudAuthMethod[]
  /** 인증 */
  authenticate(method: CloudAuthMethod, credentials?: Record<string, any>): Promise<boolean>
  /** 연결 테스트 */
  testConnection(): Promise<boolean>
  /** 사용 가능한 서비스 목록 */
  listServices(): Promise<CloudServiceInfo[]>
  /** 연결 상태 */
  isConnected(): boolean

  /** CLI 실행 (CLI 기반 프로바이더용) */
  executeCli?(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

// ============================================================
// Provider Registry 구현
// ============================================================

class ProviderRegistryImpl {
  private llmProviders: Map<string, LLMProvider> = new Map()
  private embeddingProviders: Map<string, EmbeddingProvider> = new Map()
  private cloudProviders: Map<string, CloudProvider> = new Map()

  private activeLLMProviderId: string | null = null
  private activeEmbeddingProviderId: string | null = null

  private listeners: Set<() => void> = new Set()

  // ============================================================
  // LLM 프로바이더
  // ============================================================

  registerLLM(provider: LLMProvider): void {
    this.llmProviders.set(provider.id, provider)
    // 첫 번째 등록된 프로바이더를 기본으로 설정
    if (!this.activeLLMProviderId) {
      this.activeLLMProviderId = provider.id
    }
    this.notifyListeners()
  }

  unregisterLLM(id: string): void {
    this.llmProviders.delete(id)
    if (this.activeLLMProviderId === id) {
      this.activeLLMProviderId = this.llmProviders.keys().next().value ?? null
    }
    this.notifyListeners()
  }

  getLLMProvider(id?: string): LLMProvider | undefined {
    const providerId = id || this.activeLLMProviderId
    return providerId ? this.llmProviders.get(providerId) : undefined
  }

  getAllLLMProviders(): LLMProvider[] {
    return Array.from(this.llmProviders.values())
  }

  getConnectedLLMProviders(): LLMProvider[] {
    return this.getAllLLMProviders().filter(p => p.isConnected())
  }

  setActiveLLMProvider(id: string): void {
    if (this.llmProviders.has(id)) {
      this.activeLLMProviderId = id
      this.notifyListeners()
    }
  }

  getActiveLLMProviderId(): string | null {
    return this.activeLLMProviderId
  }

  // ============================================================
  // Embedding 프로바이더
  // ============================================================

  registerEmbedding(provider: EmbeddingProvider): void {
    this.embeddingProviders.set(provider.id, provider)
    if (!this.activeEmbeddingProviderId) {
      this.activeEmbeddingProviderId = provider.id
    }
    this.notifyListeners()
  }

  getEmbeddingProvider(id?: string): EmbeddingProvider | undefined {
    const providerId = id || this.activeEmbeddingProviderId
    return providerId ? this.embeddingProviders.get(providerId) : undefined
  }

  getAllEmbeddingProviders(): EmbeddingProvider[] {
    return Array.from(this.embeddingProviders.values())
  }

  setActiveEmbeddingProvider(id: string): void {
    if (this.embeddingProviders.has(id)) {
      this.activeEmbeddingProviderId = id
      this.notifyListeners()
    }
  }

  // ============================================================
  // Cloud 프로바이더
  // ============================================================

  registerCloud(provider: CloudProvider): void {
    this.cloudProviders.set(provider.id, provider)
    this.notifyListeners()
  }

  getCloudProvider(id: string): CloudProvider | undefined {
    return this.cloudProviders.get(id)
  }

  getAllCloudProviders(): CloudProvider[] {
    return Array.from(this.cloudProviders.values())
  }

  getConnectedCloudProviders(): CloudProvider[] {
    return this.getAllCloudProviders().filter(p => p.isConnected())
  }

  // ============================================================
  // 변경 감지
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/** 전역 ProviderRegistry 싱글턴 */
export const ProviderRegistry = new ProviderRegistryImpl()
