/**
 * mcpStore — Zustand store for MCP plugin management.
 * Connected to Tauri backend.
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  McpServerConfig,
  McpServerInstance,
  McpRemoteTool,
  McpEvent,
  McpHealthCheck,
  McpInstallRequest,
  GithubMcpRepo,
  McpRegistryEntry,
  McpCategory,
} from '@/types/mcp'
import { CURATED_MCP_SERVERS } from '@/types/mcp'
import { tauriMcpService } from '@/services/TauriMcpService'

interface McpState {
  // Servers
  servers: Record<string, McpServerInstance>

  // Tools
  allTools: McpRemoteTool[]
  toolsByServer: Record<string, McpRemoteTool[]>

  // Events
  events: McpEvent[]

  // GitHub browsing
  githubRepos: GithubMcpRepo[]
  githubSearching: boolean

  // UI State
  selectedServerId: string | null
  selectedToolId: string | null
  isInstalling: boolean
  installError: string | null
  isLoading: boolean

  // Filter
  categoryFilter: McpCategory | 'all'
  searchQuery: string

  // Actions
  loadServers: () => Promise<void>
  addServer: (config: McpServerConfig) => Promise<McpServerInstance | null>
  removeServer: (serverId: string) => Promise<void>
  connectServer: (serverId: string) => Promise<boolean>
  disconnectServer: (serverId: string) => Promise<void>

  install: (request: McpInstallRequest) => Promise<boolean>
  installCurated: (entryId: string) => Promise<boolean>

  refreshTools: (serverId: string) => Promise<void>
  callTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; output?: unknown; error?: string }>

  checkHealth: (serverId: string) => Promise<McpHealthCheck | null>

  searchGithub: (query: string) => Promise<void>
  loadPopularRepos: () => Promise<void>

  selectServer: (serverId: string | null) => void
  selectTool: (toolId: string | null) => void
  setFilter: (filter: { category?: McpCategory | 'all'; search?: string }) => void

  // Sync
  syncFromBackend: () => Promise<void>
}

export const useMcpStore = create<McpState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    servers: {},
    allTools: [],
    toolsByServer: {},
    events: [],
    githubRepos: [],
    githubSearching: false,
    selectedServerId: null,
    selectedToolId: null,
    isInstalling: false,
    installError: null,
    isLoading: false,
    categoryFilter: 'all',
    searchQuery: '',

    // Load servers from backend
    loadServers: async () => {
      set({ isLoading: true })
      try {
        const servers = await tauriMcpService.listServers()
        const serversMap: Record<string, McpServerInstance> = {}
        const toolsByServer: Record<string, McpRemoteTool[]> = {}
        const allTools: McpRemoteTool[] = []

        for (const server of servers) {
          serversMap[server.config.id] = server
          toolsByServer[server.config.id] = server.tools || []
          if (server.tools) {
            allTools.push(...server.tools)
          }
        }

        set({
          servers: serversMap,
          allTools,
          toolsByServer,
          isLoading: false,
        })
      } catch (e) {
        console.error('Failed to load servers:', e)
        set({ isLoading: false })
      }
    },

    // Add a new server - connected to Tauri backend
    addServer: async (config: McpServerConfig) => {
      set({ isLoading: true })
      try {
        const instance = await tauriMcpService.addServer(config)
        if (instance) {
          await get().syncFromBackend()
        }
        set({ isLoading: false })
        return instance
      } catch (error) {
        console.error('Failed to add server:', error)
        set({ isLoading: false })
        return null
      }
    },

    // Remove server - connected to Tauri backend
    removeServer: async (serverId: string) => {
      try {
        await tauriMcpService.removeServer(serverId)
        await get().syncFromBackend()
      } catch (e) {
        console.error('Failed to remove server:', e)
      }
    },

    // Connect to server - connected to Tauri backend
    connectServer: async (serverId: string) => {
      try {
        const success = await tauriMcpService.connectServer(serverId)
        if (success) {
          await get().syncFromBackend()

          // Add event
          set(state => ({
            events: [
              ...state.events.slice(-99),
              {
                type: 'server_connected' as const,
                serverId,
                timestamp: new Date().toISOString(),
                payload: {},
              },
            ],
          }))
        }
        return success
      } catch (e) {
        console.error('Failed to connect server:', e)
        return false
      }
    },

    // Disconnect from server - connected to Tauri backend
    disconnectServer: async (serverId: string) => {
      try {
        await tauriMcpService.disconnectServer(serverId)
        await get().syncFromBackend()

        // Add event
        set(state => ({
          events: [
            ...state.events.slice(-99),
            {
              type: 'server_disconnected' as const,
              serverId,
              timestamp: new Date().toISOString(),
              payload: {},
            },
          ],
        }))
      } catch (e) {
        console.error('Failed to disconnect server:', e)
      }
    },

    // Install from request
    install: async (request: McpInstallRequest) => {
      set({ isInstalling: true, installError: null })

      try {
        // Build config from McpInstallRequest
        const config: McpServerConfig = {
          id: request.config?.id || crypto.randomUUID(),
          name: request.config?.name || request.identifier,
          description: request.config?.description || `MCP Server: ${request.identifier}`,
          source: request.source,
          transport: request.config?.transport || {
            type: 'stdio',
            command: 'npx',
            args: ['-y', request.identifier],
          },
          autoStart: request.config?.autoStart ?? false,
          enabled: request.config?.enabled ?? true,
          env: request.config?.env,
          metadata: request.config?.metadata,
        }

        const instance = await tauriMcpService.addServer(config)
        if (instance) {
          await get().syncFromBackend()
          set({ isInstalling: false })
          return true
        } else {
          set({ isInstalling: false, installError: 'Installation failed' })
          return false
        }
      } catch (error) {
        set({
          isInstalling: false,
          installError: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    },

    // Install from curated list
    installCurated: async (entryId: string) => {
      set({ isInstalling: true, installError: null })

      try {
        const entry = CURATED_MCP_SERVERS.find(s => s.id === entryId)
        if (!entry) {
          set({ isInstalling: false, installError: 'Server not found in curated list' })
          return false
        }

        // Use the configTemplate if available, otherwise build from installCommand
        const config: McpServerConfig = {
          id: entry.id,
          name: entry.name,
          description: entry.description,
          source: entry.source,
          transport: entry.configTemplate?.transport || {
            type: 'stdio',
            command: entry.installCommand?.split(' ')[0] || 'npx',
            args: entry.installCommand?.split(' ').slice(1) || [],
          },
          autoStart: false,
          enabled: true,
          env: entry.configTemplate?.env,
          metadata: {
            tags: entry.tags,
          },
        }

        const instance = await tauriMcpService.addServer(config)
        if (instance) {
          await get().syncFromBackend()
          set({ isInstalling: false })
          return true
        } else {
          set({ isInstalling: false, installError: 'Installation failed' })
          return false
        }
      } catch (error) {
        set({
          isInstalling: false,
          installError: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    },

    // Refresh tools - connected to Tauri backend
    refreshTools: async (serverId: string) => {
      try {
        const tools = await tauriMcpService.getTools(serverId)
        set(state => ({
          toolsByServer: {
            ...state.toolsByServer,
            [serverId]: tools,
          },
          allTools: [
            ...state.allTools.filter(t => t.serverId !== serverId),
            ...tools,
          ],
        }))
      } catch (e) {
        console.error('Failed to refresh tools:', e)
      }
    },

    // Call tool - connected to Tauri backend
    callTool: async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      try {
        const result = await tauriMcpService.callTool(serverId, toolName, args)

        // Add to events
        set(state => ({
          events: [
            ...state.events.slice(-99),
            {
              type: result.success ? 'tool_called' : 'tool_error',
              serverId,
              timestamp: new Date().toISOString(),
              payload: { toolName, result },
            },
          ],
        }))

        return result
      } catch (e) {
        console.error('Failed to call tool:', e)
        return { success: false, error: String(e) }
      }
    },

    // Health check - connected to Tauri backend
    checkHealth: async (serverId: string) => {
      try {
        return await tauriMcpService.healthCheck(serverId)
      } catch (e) {
        console.error('Failed to check health:', e)
        return null
      }
    },

    // GitHub search - mock for now (would need backend implementation)
    searchGithub: async (query: string) => {
      set({ githubSearching: true })

      try {
        // Simulate search with curated servers
        const results: GithubMcpRepo[] = CURATED_MCP_SERVERS.filter(
          s =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.description.toLowerCase().includes(query.toLowerCase())
        ).map(s => ({
          id: s.id,
          name: s.name,
          fullName: `mcp-plugins/${s.id}`,
          description: s.description,
          owner: 'mcp-plugins',
          stars: 100,
          forks: 10,
          topics: s.tags,
          language: 'TypeScript',
          updatedAt: new Date().toISOString(),
          installCommand: s.installCommand,
          configTemplate: s.configTemplate,
        }))

        set({ githubRepos: results, githubSearching: false })
      } catch (error) {
        console.error('GitHub search failed:', error)
        set({ githubSearching: false })
      }
    },

    // Load popular repos - mock for now
    loadPopularRepos: async () => {
      set({ githubSearching: true })

      try {
        const repos: GithubMcpRepo[] = CURATED_MCP_SERVERS.slice(0, 10).map(s => ({
          id: s.id,
          name: s.name,
          fullName: `mcp-plugins/${s.id}`,
          description: s.description,
          owner: 'mcp-plugins',
          stars: 100,
          forks: 10,
          topics: s.tags,
          language: 'TypeScript',
          updatedAt: new Date().toISOString(),
          installCommand: s.installCommand,
          configTemplate: s.configTemplate,
        }))

        set({ githubRepos: repos, githubSearching: false })
      } catch (error) {
        console.error('Failed to load popular repos:', error)
        set({ githubSearching: false })
      }
    },

    // Select server
    selectServer: (serverId: string | null) => {
      set({ selectedServerId: serverId })
    },

    // Select tool
    selectTool: (toolId: string | null) => {
      set({ selectedToolId: toolId })
    },

    // Set filter
    setFilter: (filter: { category?: McpCategory | 'all'; search?: string }) => {
      set(state => ({
        categoryFilter: filter.category ?? state.categoryFilter,
        searchQuery: filter.search ?? state.searchQuery,
      }))
    },

    // Sync from backend
    syncFromBackend: async () => {
      try {
        const servers = await tauriMcpService.listServers()
        const serversMap: Record<string, McpServerInstance> = {}
        const toolsByServer: Record<string, McpRemoteTool[]> = {}
        const allTools: McpRemoteTool[] = []

        for (const server of servers) {
          serversMap[server.config.id] = server
          toolsByServer[server.config.id] = server.tools || []
          if (server.tools) {
            allTools.push(...server.tools)
          }
        }

        set({
          servers: serversMap,
          allTools,
          toolsByServer,
        })
      } catch (e) {
        console.error('Failed to sync from backend:', e)
      }
    },
  }))
)

// ========== Selectors ==========

/**
 * Get servers filtered by status
 */
export const selectServersByStatus = (
  state: McpState,
  status: McpServerInstance['status']
): McpServerInstance[] => {
  return Object.values(state.servers).filter(s => s.status === status)
}

/**
 * Get tools filtered by category and search
 */
export const selectFilteredTools = (state: McpState): McpRemoteTool[] => {
  let tools = state.allTools

  if (state.categoryFilter !== 'all') {
    tools = tools.filter(t => t.category === state.categoryFilter)
  }

  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase()
    tools = tools.filter(
      t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    )
  }

  return tools
}

/**
 * Get curated servers not yet installed
 */
export const selectAvailableCurated = (state: McpState): McpRegistryEntry[] => {
  const installedIds = new Set(Object.keys(state.servers))
  return CURATED_MCP_SERVERS.filter(s => !installedIds.has(s.id))
}

/**
 * Get server statistics
 */
export const selectServerStats = (state: McpState) => {
  const servers = Object.values(state.servers)
  return {
    total: servers.length,
    connected: servers.filter(s => s.status === 'connected').length,
    disconnected: servers.filter(s => s.status === 'disconnected').length,
    error: servers.filter(s => s.status === 'error').length,
    totalTools: state.allTools.length,
  }
}
