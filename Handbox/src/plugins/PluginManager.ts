/**
 * Tier 2 플러그인 매니저 — 라이프사이클 오케스트레이션
 *
 * 플러그인의 전체 라이프사이클을 관리하는 고수준 API.
 * PluginStore(상태) + PluginToNode(레지스트리) + MCP(통신)을 통합합니다.
 */

import { usePluginStore } from './PluginStore'
import { unregisterPluginTools, initializePluginNodeSync } from './PluginToNode'
import type { PluginManifest, PluginInstallRequest, PluginMCPTool, RecommendedPlugin } from './types'

// ─────────────────────────────────────────────
// 라이프사이클 이벤트
// ─────────────────────────────────────────────

type PluginEventType = 'installed' | 'started' | 'stopped' | 'uninstalled' | 'error'

interface PluginEvent {
  type: PluginEventType
  pluginId: string
  data?: unknown
}

type PluginEventListener = (event: PluginEvent) => void

const _listeners: Set<PluginEventListener> = new Set()

function emitEvent(event: PluginEvent) {
  for (const listener of _listeners) {
    try {
      listener(event)
    } catch (err) {
      console.error('[PluginManager] Event listener error:', err)
    }
  }
}

// ─────────────────────────────────────────────
// PluginManager API
// ─────────────────────────────────────────────

export const PluginManager = {
  /**
   * 플러그인 시스템 초기화.
   * 앱 시작 시 한 번 호출합니다.
   */
  async initialize(): Promise<void> {
    // NodeRegistry ↔ PluginStore 자동 동기화 설정
    initializePluginNodeSync()

    // 설치된 플러그인 목록 로드
    await usePluginStore.getState().refreshPlugins()

    // 추천 플러그인 목록 로드
    await usePluginStore.getState().fetchAvailablePlugins()

    console.log('[PluginManager] 초기화 완료')
  },

  /**
   * 플러그인 설치 → 시작 → 도구 발견 → 노드 등록 (원스텝)
   */
  async installAndStart(request: PluginInstallRequest): Promise<{
    manifest: PluginManifest
    tools: PluginMCPTool[]
  }> {
    const store = usePluginStore.getState()

    // 1. 설치
    const manifest = await store.installPlugin(request)
    emitEvent({ type: 'installed', pluginId: manifest.id, data: manifest })

    // 2. 시작 + 도구 발견
    try {
      const tools = await store.startPlugin(manifest.id)
      emitEvent({ type: 'started', pluginId: manifest.id, data: tools })
      return { manifest: usePluginStore.getState().plugins[manifest.id], tools }
    } catch (err) {
      // 설치는 성공했지만 시작 실패 → 설치 상태 유지
      emitEvent({ type: 'error', pluginId: manifest.id, data: err })
      return { manifest, tools: [] }
    }
  },

  /**
   * 플러그인만 설치 (시작하지 않음)
   */
  async install(request: PluginInstallRequest): Promise<PluginManifest> {
    const manifest = await usePluginStore.getState().installPlugin(request)
    emitEvent({ type: 'installed', pluginId: manifest.id, data: manifest })
    return manifest
  },

  /**
   * 플러그인 시작 (MCP 서버 실행 + 도구 발견 + 노드 등록)
   */
  async start(pluginId: string): Promise<PluginMCPTool[]> {
    const tools = await usePluginStore.getState().startPlugin(pluginId)
    emitEvent({ type: 'started', pluginId, data: tools })
    return tools
  },

  /**
   * 플러그인 중지 (MCP 서버 종료 + 노드 해제)
   */
  async stop(pluginId: string): Promise<void> {
    await usePluginStore.getState().stopPlugin(pluginId)
    emitEvent({ type: 'stopped', pluginId })
  },

  /**
   * 플러그인 재시작
   */
  async restart(pluginId: string): Promise<PluginMCPTool[]> {
    const tools = await usePluginStore.getState().restartPlugin(pluginId)
    emitEvent({ type: 'started', pluginId, data: tools })
    return tools
  },

  /**
   * 플러그인 완전 제거 (중지 + 노드 해제 + 파일 삭제)
   */
  async uninstall(pluginId: string): Promise<boolean> {
    // 노드 먼저 해제 (스토어에서 자동으로 하지만 안전하게)
    unregisterPluginTools(pluginId)
    const result = await usePluginStore.getState().uninstallPlugin(pluginId)
    if (result) {
      emitEvent({ type: 'uninstalled', pluginId })
    }
    return result
  },

  /**
   * 모든 실행 중인 플러그인 중지
   */
  async stopAll(): Promise<void> {
    const running = usePluginStore.getState().getRunningPlugins()
    await Promise.allSettled(running.map(p => this.stop(p.id)))
  },

  /**
   * 추천 플러그인에서 원클릭 설치
   */
  async installRecommended(recommended: RecommendedPlugin): Promise<{
    manifest: PluginManifest
    tools: PluginMCPTool[]
  }> {
    return this.installAndStart({
      source: recommended.source,
      name: recommended.name,
      runtime: recommended.runtime,
      category: recommended.category,
    })
  },

  // ── 조회 API ──

  /** 설치된 플러그인 목록 */
  getInstalledPlugins(): PluginManifest[] {
    return Object.values(usePluginStore.getState().plugins)
  },

  /** 실행 중인 플러그인 */
  getRunningPlugins(): PluginManifest[] {
    return usePluginStore.getState().getRunningPlugins()
  },

  /** 추천 플러그인 목록 */
  getAvailablePlugins(): RecommendedPlugin[] {
    return usePluginStore.getState().availablePlugins
  },

  /** 특정 플러그인 정보 */
  getPlugin(pluginId: string): PluginManifest | undefined {
    return usePluginStore.getState().plugins[pluginId]
  },

  /** 특정 플러그인의 도구 목록 */
  getPluginTools(pluginId: string): PluginMCPTool[] {
    return usePluginStore.getState().pluginTools[pluginId] || []
  },

  /** 모든 플러그인의 모든 도구 */
  getAllTools() {
    return usePluginStore.getState().getAllTools()
  },

  /** 플러그인이 설치되어 있는지 확인 */
  isInstalled(pluginId: string): boolean {
    return pluginId in usePluginStore.getState().plugins
  },

  /** 플러그인이 실행 중인지 확인 */
  isRunning(pluginId: string): boolean {
    return usePluginStore.getState().plugins[pluginId]?.status === 'running'
  },

  // ── 이벤트 ──

  /** 이벤트 구독 */
  onEvent(listener: PluginEventListener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  // ── 새로고침 ──

  /** 설치된 플러그인 목록 새로고침 */
  async refresh(): Promise<void> {
    await usePluginStore.getState().refreshPlugins()
  },
}
