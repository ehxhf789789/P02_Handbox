// Credential Vault Store
// OS 키체인 기반 보안 자격증명 관리

import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/tauri'

// ========================================
// 타입 정의
// ========================================

/** 자격증명 타입 */
export type CredentialType =
  | 'api-key'           // 단일 API 키
  | 'access-key'        // Access Key + Secret Key (AWS 등)
  | 'oauth-token'       // OAuth 토큰
  | 'service-account'   // 서비스 계정 JSON (GCP)
  | 'username-password' // 사용자명/비밀번호
  | 'custom'            // 커스텀 키-값 쌍

/** 프로바이더 타입 */
export type CredentialProvider =
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'custom'

/** 자격증명 메타데이터 */
export interface CredentialMetadata {
  id: string
  name: string
  type: CredentialType
  provider: CredentialProvider
  description?: string
  createdAt: string
  updatedAt: string
  expiresAt?: string
  metadata?: Record<string, string>
}

/** 자격증명 저장 요청 */
export interface CredentialSaveRequest {
  id?: string
  name: string
  type: CredentialType
  provider: CredentialProvider
  description?: string
  values: Record<string, string>
  metadata?: Record<string, string>
  expiresAt?: string
}

/** 자격증명 저장 결과 */
export interface CredentialSaveResult {
  success: boolean
  id: string
  error?: string
}

/** 자격증명 조회 결과 */
export interface CredentialRetrieveResult {
  success: boolean
  values: Record<string, string>
  error?: string
}

// ========================================
// 스토어 상태 타입
// ========================================

interface CredentialStoreState {
  // 상태
  credentials: CredentialMetadata[]
  loading: boolean
  error: string | null

  // 액션
  loadCredentials: () => Promise<void>
  saveCredential: (request: CredentialSaveRequest) => Promise<CredentialSaveResult>
  deleteCredential: (id: string, provider: CredentialProvider) => Promise<boolean>
  retrieveCredential: (id: string, provider: CredentialProvider) => Promise<CredentialRetrieveResult>
  getMetadata: (id: string) => Promise<CredentialMetadata | null>
  hasProvider: (provider: CredentialProvider) => Promise<boolean>

  // AWS 빠른 저장/조회
  saveAWSCredential: (
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    profileName?: string
  ) => Promise<CredentialSaveResult>
  retrieveAWSCredential: (profileName?: string) => Promise<CredentialRetrieveResult>

  // 유틸리티
  clearError: () => void
}

// ========================================
// 스토어 구현
// ========================================

export const useCredentialStore = create<CredentialStoreState>((set, get) => ({
  credentials: [],
  loading: false,
  error: null,

  loadCredentials: async () => {
    set({ loading: true, error: null })
    try {
      // 로컬 스토리지에서 메타데이터 목록 로드 (실제 값은 OS 키체인에 저장)
      const stored = localStorage.getItem('handbox-credentials-meta')
      if (stored) {
        const credentials: CredentialMetadata[] = JSON.parse(stored)
        set({ credentials, loading: false })
      } else {
        set({ credentials: [], loading: false })
      }
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  saveCredential: async (request: CredentialSaveRequest): Promise<CredentialSaveResult> => {
    set({ loading: true, error: null })
    try {
      const result = await invoke<CredentialSaveResult>('credential_store', {
        request: {
          id: request.id,
          name: request.name,
          type: request.type,
          provider: request.provider,
          description: request.description,
          values: request.values,
          metadata: request.metadata,
          expires_at: request.expiresAt,
        },
      })

      if (result.success) {
        // 메타데이터 로컬 저장 (목록 관리용)
        const metadata: CredentialMetadata = {
          id: result.id,
          name: request.name,
          type: request.type,
          provider: request.provider,
          description: request.description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          expiresAt: request.expiresAt,
          metadata: request.metadata,
        }

        const credentials = [...get().credentials.filter((c) => c.id !== result.id), metadata]
        localStorage.setItem('handbox-credentials-meta', JSON.stringify(credentials))
        set({ credentials, loading: false })
      } else {
        set({ error: result.error, loading: false })
      }

      return result
    } catch (error) {
      const errorMsg = String(error)
      set({ error: errorMsg, loading: false })
      return { success: false, id: '', error: errorMsg }
    }
  },

  deleteCredential: async (id: string, provider: CredentialProvider): Promise<boolean> => {
    set({ loading: true, error: null })
    try {
      const result = await invoke<boolean>('credential_delete', { id, provider })

      if (result) {
        // 로컬 메타데이터에서 제거
        const credentials = get().credentials.filter((c) => c.id !== id)
        localStorage.setItem('handbox-credentials-meta', JSON.stringify(credentials))
        set({ credentials, loading: false })
      }

      return result
    } catch (error) {
      set({ error: String(error), loading: false })
      return false
    }
  },

  retrieveCredential: async (
    id: string,
    provider: CredentialProvider
  ): Promise<CredentialRetrieveResult> => {
    try {
      const result = await invoke<CredentialRetrieveResult>('credential_retrieve', { id, provider })
      return result
    } catch (error) {
      return { success: false, values: {}, error: String(error) }
    }
  },

  getMetadata: async (id: string): Promise<CredentialMetadata | null> => {
    try {
      const result = await invoke<CredentialMetadata | null>('credential_get_metadata', { id })
      return result
    } catch {
      return null
    }
  },

  hasProvider: async (provider: CredentialProvider): Promise<boolean> => {
    try {
      const result = await invoke<boolean>('credential_has_provider', { provider })
      return result
    } catch {
      return false
    }
  },

  // AWS 빠른 저장
  saveAWSCredential: async (
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    profileName?: string
  ): Promise<CredentialSaveResult> => {
    set({ loading: true, error: null })
    try {
      const result = await invoke<CredentialSaveResult>('credential_store_aws', {
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey,
        region,
        profile_name: profileName,
      })

      if (result.success) {
        // 메타데이터 로컬 저장
        const profile = profileName || 'default'
        const metadata: CredentialMetadata = {
          id: result.id,
          name: `AWS - ${profile}`,
          type: 'access-key',
          provider: 'aws',
          description: `AWS credentials for profile: ${profile}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { profile, region },
        }

        const credentials = [...get().credentials.filter((c) => c.id !== result.id), metadata]
        localStorage.setItem('handbox-credentials-meta', JSON.stringify(credentials))
        set({ credentials, loading: false })
      }

      return result
    } catch (error) {
      const errorMsg = String(error)
      set({ error: errorMsg, loading: false })
      return { success: false, id: '', error: errorMsg }
    }
  },

  // AWS 빠른 조회
  retrieveAWSCredential: async (profileName?: string): Promise<CredentialRetrieveResult> => {
    try {
      const result = await invoke<CredentialRetrieveResult>('credential_retrieve_aws', {
        profile_name: profileName,
      })
      return result
    } catch (error) {
      return { success: false, values: {}, error: String(error) }
    }
  },

  clearError: () => set({ error: null }),
}))

// ========================================
// 유틸리티 함수
// ========================================

/** 프로바이더별 필수 필드 정의 */
export const PROVIDER_FIELDS: Record<
  CredentialProvider,
  { key: string; label: string; type: 'text' | 'password'; required: boolean }[]
> = {
  aws: [
    { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
    { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
    { key: 'region', label: 'Region', type: 'text', required: true },
    { key: 'profile', label: 'Profile Name', type: 'text', required: false },
  ],
  azure: [
    { key: 'subscription_id', label: 'Subscription ID', type: 'text', required: true },
    { key: 'tenant_id', label: 'Tenant ID', type: 'text', required: true },
    { key: 'client_id', label: 'Client ID', type: 'text', required: true },
    { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
  ],
  gcp: [
    { key: 'project_id', label: 'Project ID', type: 'text', required: true },
    { key: 'service_account_json', label: 'Service Account JSON', type: 'password', required: true },
  ],
  openai: [{ key: 'api_key', label: 'API Key', type: 'password', required: true }],
  anthropic: [{ key: 'api_key', label: 'API Key', type: 'password', required: true }],
  ollama: [{ key: 'base_url', label: 'Base URL', type: 'text', required: false }],
  custom: [
    { key: 'key', label: 'Key Name', type: 'text', required: true },
    { key: 'value', label: 'Value', type: 'password', required: true },
  ],
}

/** 프로바이더 표시 이름 */
export const PROVIDER_NAMES: Record<CredentialProvider, string> = {
  aws: 'Amazon Web Services',
  azure: 'Microsoft Azure',
  gcp: 'Google Cloud Platform',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (Local)',
  custom: 'Custom',
}
