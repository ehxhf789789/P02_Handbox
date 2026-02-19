/**
 * Tier 2 플러그인 시스템 — 타입 정의
 *
 * GitHub MCP 서버를 설치/관리하고 노드로 변환하는 플러그인 시스템의 핵심 타입.
 */

// ─────────────────────────────────────────────
// 플러그인 소스 (설치 출처)
// ─────────────────────────────────────────────

export interface PluginSource {
  type: 'github' | 'npm' | 'local'
  url: string
}

// ─────────────────────────────────────────────
// 플러그인 매니페스트 (설치 메타데이터)
// ─────────────────────────────────────────────

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  category: string
  source: PluginSource
  runtime: 'node' | 'python' | 'rust' | 'docker'
  entry: string
  args: string[]
  env?: Record<string, string>
  status: PluginStatus
  installed_at: string
  install_path: string
  tools_discovered: string[]
  error?: string
}

// ─────────────────────────────────────────────
// 플러그인 상태
// ─────────────────────────────────────────────

export type PluginStatus = 'installed' | 'running' | 'stopped' | 'error'

// ─────────────────────────────────────────────
// 플러그인 설치 요청
// ─────────────────────────────────────────────

export interface PluginInstallRequest {
  source: string           // GitHub URL, npm 패키지, 또는 로컬 경로
  name?: string            // 사용자 지정 이름
  runtime?: string         // 수동 런타임 지정 (자동 감지 가능)
  category?: string        // 수동 카테고리 지정
}

// ─────────────────────────────────────────────
// MCP 도구 (플러그인에서 발견된 도구)
// ─────────────────────────────────────────────

export interface PluginMCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, PluginMCPSchemaProperty>
    required?: string[]
  }
}

export interface PluginMCPSchemaProperty {
  type: string
  description?: string
  enum?: string[]
  default?: unknown
  items?: { type: string }
}

// ─────────────────────────────────────────────
// 추천 플러그인 (스토어에 표시)
// ─────────────────────────────────────────────

export interface RecommendedPlugin {
  name: string
  description: string
  source: string
  runtime: string
  category: string
  stars?: number
  icon?: string
}

// ─────────────────────────────────────────────
// 플러그인 콜백 (노드 레지스트리 동기화)
// ─────────────────────────────────────────────

export interface PluginNodeRegistryCallback {
  onPluginStarted: (pluginId: string, tools: PluginMCPTool[]) => void
  onPluginStopped: (pluginId: string) => void
}
