/**
 * Plugin System — Tier 2 플러그인 등록 및 초기화
 *
 * GitHub MCP 서버를 설치/관리하고 노드로 자동 변환하는 플러그인 시스템.
 * PluginManager를 통해 전체 라이프사이클을 관리합니다.
 */

export { PluginManager } from './PluginManager'
export { usePluginStore } from './PluginStore'
export { initializePluginNodeSync, syncAllPluginTools } from './PluginToNode'
export type {
  PluginManifest,
  PluginStatus,
  PluginInstallRequest,
  PluginMCPTool,
  RecommendedPlugin,
} from './types'

/**
 * 플러그인 시스템 초기화.
 * main.tsx에서 호출됩니다.
 */
export function registerBuiltinPlugins(): void {
  // PluginManager.initialize()는 비동기이므로 별도로 호출
  // 여기서는 동기 초기화만 수행
  console.log('[Plugins] 플러그인 시스템 초기화 완료')
}

/**
 * 비동기 플러그인 초기화 (App mount 이후 호출)
 */
export async function initializePluginSystem(): Promise<void> {
  const { PluginManager } = await import('./PluginManager')
  await PluginManager.initialize()
}
