/**
 * Tier 2 플러그인 스토어 — Zustand 상태 관리
 *
 * 플러그인 설치/제거/시작/중지를 관리하고,
 * NodeRegistry와 자동 동기화하는 콜백 시스템을 제공합니다.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/tauri'
import type {
  PluginManifest,
  PluginInstallRequest,
  PluginMCPTool,
  PluginNodeRegistryCallback,
  RecommendedPlugin,
} from './types'

// ─────────────────────────────────────────────
// 스토어 상태 타입
// ─────────────────────────────────────────────

interface PluginStoreState {
  /** 설치된 플러그인 목록 (pluginId → manifest) */
  plugins: Record<string, PluginManifest>

  /** 각 플러그인에서 발견된 MCP 도구 (pluginId → tools[]) */
  pluginTools: Record<string, PluginMCPTool[]>

  /** 추천 플러그인 목록 (캐시) */
  availablePlugins: RecommendedPlugin[]

  /** 로딩 상태 */
  loading: boolean

  /** 에러 메시지 */
  error: string | null

  // ── 플러그인 관리 ──

  /** GitHub/npm/로컬에서 플러그인 설치 */
  installPlugin: (request: PluginInstallRequest) => Promise<PluginManifest>

  /** 플러그인 제거 */
  uninstallPlugin: (pluginId: string) => Promise<boolean>

  /** MCP 서버로 플러그인 시작 → 도구 발견 */
  startPlugin: (pluginId: string) => Promise<PluginMCPTool[]>

  /** 플러그인 MCP 서버 중지 */
  stopPlugin: (pluginId: string) => Promise<boolean>

  /** 플러그인 재시작 */
  restartPlugin: (pluginId: string) => Promise<PluginMCPTool[]>

  // ── 목록 조회 ──

  /** 설치된 플러그인 새로고침 (Rust 백엔드에서 동기화) */
  refreshPlugins: () => Promise<void>

  /** 추천 플러그인 목록 조회 */
  fetchAvailablePlugins: () => Promise<void>

  // ── 유틸리티 ──

  /** 실행 중인 플러그인 목록 */
  getRunningPlugins: () => PluginManifest[]

  /** 모든 발견된 도구 (전체 플러그인) */
  getAllTools: () => Array<{ pluginId: string; pluginName: string; tool: PluginMCPTool }>

  /** 에러 초기화 */
  clearError: () => void
}

// ─────────────────────────────────────────────
// 콜백 시스템 (NodeRegistry 동기화)
// ─────────────────────────────────────────────

let _registryCallback: PluginNodeRegistryCallback | null = null

export function setPluginNodeRegistryCallback(cb: PluginNodeRegistryCallback): () => void {
  _registryCallback = cb
  return () => { _registryCallback = null }
}

function notifyPluginStarted(pluginId: string, tools: PluginMCPTool[]) {
  _registryCallback?.onPluginStarted(pluginId, tools)
}

function notifyPluginStopped(pluginId: string) {
  _registryCallback?.onPluginStopped(pluginId)
}

// ─────────────────────────────────────────────
// 스토어 생성
// ─────────────────────────────────────────────

export const usePluginStore = create<PluginStoreState>()(
  persist(
    (set, get) => ({
      plugins: {},
      pluginTools: {},
      availablePlugins: [],
      loading: false,
      error: null,

      // ── installPlugin ──
      async installPlugin(request: PluginInstallRequest): Promise<PluginManifest> {
        set({ loading: true, error: null })
        try {
          const result = await invoke<Record<string, unknown>>('plugin_install', { request })
          const manifest: PluginManifest = {
            id: result.plugin_id as string,
            name: result.name as string,
            version: result.version as string,
            description: result.description as string || '',
            category: result.category as string || 'plugin',
            source: {
              type: (result.source_type as string || 'github') as 'github' | 'npm' | 'local',
              url: request.source,
            },
            runtime: result.runtime as 'node' | 'python' | 'rust' | 'docker',
            entry: result.entry as string || '',
            args: (result.args as string[]) || [],
            status: 'installed',
            installed_at: result.installed_at as string || new Date().toISOString(),
            install_path: result.install_path as string || '',
            tools_discovered: (result.tools_discovered as string[]) || [],
          }

          set(state => ({
            plugins: { ...state.plugins, [manifest.id]: manifest },
            loading: false,
          }))

          return manifest
        } catch (err) {
          const msg = String(err)
          set({ loading: false, error: msg })
          throw new Error(msg)
        }
      },

      // ── uninstallPlugin ──
      async uninstallPlugin(pluginId: string): Promise<boolean> {
        set({ loading: true, error: null })
        try {
          // 실행 중이면 먼저 중지
          const plugin = get().plugins[pluginId]
          if (plugin?.status === 'running') {
            await get().stopPlugin(pluginId)
          }

          await invoke('plugin_uninstall', { pluginId })

          set(state => {
            const { [pluginId]: _, ...rest } = state.plugins
            const { [pluginId]: __, ...restTools } = state.pluginTools
            return { plugins: rest, pluginTools: restTools, loading: false }
          })

          return true
        } catch (err) {
          set({ loading: false, error: String(err) })
          return false
        }
      },

      // ── startPlugin ──
      async startPlugin(pluginId: string): Promise<PluginMCPTool[]> {
        const plugin = get().plugins[pluginId]
        if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)

        set(state => ({
          plugins: {
            ...state.plugins,
            [pluginId]: { ...plugin, status: 'running' as const, error: undefined },
          },
        }))

        try {
          // MCP 서버 시작 (기존 mcp 인프라 재활용)
          await invoke('mcp_start_server', {
            serverId: `plugin-${pluginId}`,
            command: plugin.runtime === 'node' ? 'node' : plugin.runtime === 'python' ? 'python' : plugin.entry,
            args: plugin.runtime === 'node' || plugin.runtime === 'python'
              ? [plugin.entry, ...plugin.args]
              : plugin.args,
            env: plugin.env || {},
          })

          // MCP 초기화
          await invoke('mcp_initialize', {
            serverId: `plugin-${pluginId}`,
            clientName: 'handbox',
            clientVersion: '2.0.0',
          })

          // 도구 발견
          const toolsResult = await invoke<{ tools: PluginMCPTool[] }>('mcp_list_tools', {
            serverId: `plugin-${pluginId}`,
          })
          const tools = toolsResult.tools || []

          // 상태 업데이트
          set(state => ({
            plugins: {
              ...state.plugins,
              [pluginId]: {
                ...state.plugins[pluginId],
                status: 'running',
                tools_discovered: tools.map(t => t.name),
              },
            },
            pluginTools: {
              ...state.pluginTools,
              [pluginId]: tools,
            },
          }))

          // Rust 백엔드 매니페스트 업데이트
          await invoke('plugin_update_manifest', {
            pluginId,
            tools: tools.map(t => t.name),
            status: 'running',
          }).catch(() => { /* best-effort */ })

          // NodeRegistry 동기화 콜백
          notifyPluginStarted(pluginId, tools)

          return tools
        } catch (err) {
          const errMsg = String(err)
          set(state => ({
            plugins: {
              ...state.plugins,
              [pluginId]: { ...state.plugins[pluginId], status: 'error', error: errMsg },
            },
          }))
          throw new Error(errMsg)
        }
      },

      // ── stopPlugin ──
      async stopPlugin(pluginId: string): Promise<boolean> {
        try {
          await invoke('mcp_stop_server', { serverId: `plugin-${pluginId}` })

          set(state => ({
            plugins: {
              ...state.plugins,
              [pluginId]: { ...state.plugins[pluginId], status: 'stopped', error: undefined },
            },
            pluginTools: {
              ...state.pluginTools,
              [pluginId]: [],
            },
          }))

          // Rust 백엔드 매니페스트 업데이트
          await invoke('plugin_update_manifest', {
            pluginId,
            tools: [] as string[],
            status: 'stopped',
          }).catch(() => {})

          notifyPluginStopped(pluginId)
          return true
        } catch (err) {
          set({ error: String(err) })
          return false
        }
      },

      // ── restartPlugin ──
      async restartPlugin(pluginId: string): Promise<PluginMCPTool[]> {
        await get().stopPlugin(pluginId)
        return get().startPlugin(pluginId)
      },

      // ── refreshPlugins ──
      async refreshPlugins(): Promise<void> {
        set({ loading: true, error: null })
        try {
          const result = await invoke<{ plugins: PluginManifest[] }>('plugin_list')
          const pluginsMap: Record<string, PluginManifest> = {}
          for (const p of result.plugins || []) {
            pluginsMap[p.id] = {
              ...p,
              source: p.source || { type: 'github', url: '' },
              status: p.status as PluginManifest['status'] || 'installed',
            }
          }
          set({ plugins: pluginsMap, loading: false })
        } catch (err) {
          set({ loading: false, error: String(err) })
        }
      },

      // ── fetchAvailablePlugins ──
      async fetchAvailablePlugins(): Promise<void> {
        try {
          const result = await invoke<{ plugins: RecommendedPlugin[] }>('plugin_list_available')
          set({ availablePlugins: result.plugins || [] })
        } catch (err) {
          console.warn('[PluginStore] Failed to fetch available plugins:', err)
        }
      },

      // ── getRunningPlugins ──
      getRunningPlugins(): PluginManifest[] {
        return Object.values(get().plugins).filter(p => p.status === 'running')
      },

      // ── getAllTools ──
      getAllTools() {
        const { plugins, pluginTools } = get()
        const result: Array<{ pluginId: string; pluginName: string; tool: PluginMCPTool }> = []
        for (const [pluginId, tools] of Object.entries(pluginTools)) {
          const pluginName = plugins[pluginId]?.name || pluginId
          for (const tool of tools) {
            result.push({ pluginId, pluginName, tool })
          }
        }
        return result
      },

      // ── clearError ──
      clearError() {
        set({ error: null })
      },
    }),
    {
      name: 'handbox-plugins',
      partialize: (state) => ({
        // 지속 저장: 플러그인 매니페스트만 (런타임 상태 제외)
        plugins: Object.fromEntries(
          Object.entries(state.plugins).map(([id, p]) => [
            id,
            { ...p, status: 'installed' as const, error: undefined, tools_discovered: p.tools_discovered },
          ])
        ),
      }),
    }
  )
)
