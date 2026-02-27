/**
 * McpPluginService — Manages MCP server connections and tool discovery.
 *
 * Features:
 * - Connect/disconnect MCP servers
 * - Discover tools from connected servers
 * - Convert MCP tools to workflow nodes
 * - Health monitoring
 * - GitHub MCP repository browsing
 */

import type {
  McpServerConfig,
  McpServerInstance,
  McpRemoteTool,
  McpInstallRequest,
  McpInstallResult,
  McpToolCallRequest,
  McpToolCallResult,
  McpEvent,
  McpEventType,
  McpHealthCheck,
  GithubMcpRepo,
} from '@/types/mcp'
import { CURATED_MCP_SERVERS } from '@/types/mcp'
import type { ToolDef, ToolCategory } from '@/data/toolCatalog'

type EventCallback = (event: McpEvent) => void

/**
 * MCP Plugin Service
 */
export class McpPluginService {
  private servers: Map<string, McpServerInstance> = new Map()
  private eventCallbacks: Set<EventCallback> = new Set()
  private healthCheckInterval?: ReturnType<typeof setInterval>
  private discoveredTools: Map<string, McpRemoteTool[]> = new Map()

  constructor() {
    // Load saved server configs on init
    this.loadSavedConfigs()
  }

  // ========== Server Management ==========

  /**
   * Add a new MCP server configuration
   */
  async addServer(config: McpServerConfig): Promise<McpServerInstance> {
    const instance: McpServerInstance = {
      config,
      status: 'disconnected',
      tools: [],
    }

    this.servers.set(config.id, instance)
    this.emitEvent('server_added', config.id)

    // Auto-connect if enabled
    if (config.autoStart) {
      await this.connectServer(config.id)
    }

    // Persist config
    this.saveConfigs()

    return instance
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverId: string): Promise<void> {
    const instance = this.servers.get(serverId)
    if (!instance) return

    // Disconnect first if connected
    if (instance.status === 'connected') {
      await this.disconnectServer(serverId)
    }

    this.servers.delete(serverId)
    this.discoveredTools.delete(serverId)
    this.emitEvent('server_removed', serverId)

    // Persist
    this.saveConfigs()
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<boolean> {
    const instance = this.servers.get(serverId)
    if (!instance) return false

    instance.status = 'connecting'
    this.emitEvent('server_connected', serverId)

    try {
      // Call Tauri backend to connect
      const result = await this.invokeConnect(instance.config)

      if (result.success) {
        instance.status = 'connected'
        instance.connectedAt = new Date().toISOString()
        instance.tools = result.tools || []
        instance.error = undefined

        // Store discovered tools
        this.discoveredTools.set(serverId, instance.tools)

        this.emitEvent('server_connected', serverId, { tools: instance.tools })

        // Emit tool discovery events
        for (const tool of instance.tools) {
          this.emitEvent('tool_discovered', serverId, { tool })
        }

        return true
      } else {
        instance.status = 'error'
        instance.error = result.error
        this.emitEvent('server_error', serverId, { error: result.error })
        return false
      }
    } catch (error) {
      instance.status = 'error'
      instance.error = error instanceof Error ? error.message : String(error)
      this.emitEvent('server_error', serverId, { error: instance.error })
      return false
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const instance = this.servers.get(serverId)
    if (!instance) return

    try {
      await this.invokeDisconnect(serverId)
    } catch (error) {
      console.error('Error disconnecting:', error)
    }

    instance.status = 'disconnected'
    instance.connectedAt = undefined
    this.emitEvent('server_disconnected', serverId)
  }

  /**
   * Get server instance by ID
   */
  getServer(serverId: string): McpServerInstance | undefined {
    return this.servers.get(serverId)
  }

  /**
   * Get all servers
   */
  getAllServers(): McpServerInstance[] {
    return Array.from(this.servers.values())
  }

  /**
   * Get connected servers
   */
  getConnectedServers(): McpServerInstance[] {
    return this.getAllServers().filter(s => s.status === 'connected')
  }

  // ========== Tool Discovery ==========

  /**
   * Get all discovered tools across all connected servers
   */
  getAllTools(): McpRemoteTool[] {
    const tools: McpRemoteTool[] = []
    for (const serverTools of this.discoveredTools.values()) {
      tools.push(...serverTools)
    }
    return tools
  }

  /**
   * Get tools from a specific server
   */
  getServerTools(serverId: string): McpRemoteTool[] {
    return this.discoveredTools.get(serverId) || []
  }

  /**
   * Refresh tools from a connected server
   */
  async refreshTools(serverId: string): Promise<McpRemoteTool[]> {
    const instance = this.servers.get(serverId)
    if (!instance || instance.status !== 'connected') {
      return []
    }

    try {
      const tools = await this.invokeListTools(serverId)
      instance.tools = tools
      this.discoveredTools.set(serverId, tools)

      for (const tool of tools) {
        this.emitEvent('tool_discovered', serverId, { tool })
      }

      return tools
    } catch (error) {
      console.error('Failed to refresh tools:', error)
      return instance.tools
    }
  }

  /**
   * Convert MCP tool to ToolDef for workflow nodes
   */
  convertToToolDef(tool: McpRemoteTool): ToolDef {
    const inputs = this.schemaToInputs(tool.inputSchema)
    const configFields = this.schemaToConfigFields(tool.inputSchema)

    return {
      id: `mcp:${tool.serverId}:${tool.name}`,
      label: this.formatToolLabel(tool.name),
      category: tool.category || 'mcp',
      description: tool.description,
      icon: 'Plug',
      inputs,
      outputs: [{ name: 'result', type: 'any' }],
      configFields,
    }
  }

  /**
   * Convert all discovered tools to a ToolCategory
   */
  getMcpToolCategory(): ToolCategory {
    const tools = this.getAllTools().map(t => this.convertToToolDef(t))

    return {
      id: 'mcp',
      label: 'MCP Tools',
      icon: 'Plug',
      color: '#8b5cf6',
      tools,
    }
  }

  // ========== Tool Execution ==========

  /**
   * Call an MCP tool
   */
  async callTool(request: McpToolCallRequest): Promise<McpToolCallResult> {
    const startTime = Date.now()

    try {
      const result = await this.invokeCallTool(request)

      this.emitEvent('tool_called', request.serverId, {
        toolName: request.toolName,
        success: result.success,
        executionTime: Date.now() - startTime,
      })

      return {
        ...result,
        executionTime: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      this.emitEvent('tool_error', request.serverId, {
        toolName: request.toolName,
        error: errorMsg,
      })

      return {
        success: false,
        error: errorMsg,
        executionTime: Date.now() - startTime,
      }
    }
  }

  // ========== Installation ==========

  /**
   * Install MCP server from various sources
   */
  async install(request: McpInstallRequest): Promise<McpInstallResult> {
    const serverId = `${request.source}:${request.identifier.replace(/[^a-zA-Z0-9]/g, '-')}`

    try {
      // Generate config based on source
      const config = await this.generateConfig(request, serverId)

      // Add and connect
      const instance = await this.addServer(config)

      if (config.autoStart) {
        const connected = await this.connectServer(serverId)
        if (!connected) {
          return {
            success: false,
            error: instance.error || 'Failed to connect',
          }
        }
      }

      return {
        success: true,
        serverId,
        tools: instance.tools,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Install from curated list
   */
  async installCurated(entryId: string): Promise<McpInstallResult> {
    const entry = CURATED_MCP_SERVERS.find(s => s.id === entryId)
    if (!entry) {
      return { success: false, error: 'Server not found in curated list' }
    }

    const config: McpServerConfig = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      source: entry.source,
      transport: entry.configTemplate.transport!,
      autoStart: true,
      enabled: true,
      env: entry.configTemplate.env,
      metadata: {
        tags: entry.tags,
      },
    }

    const instance = await this.addServer(config)
    const connected = await this.connectServer(entry.id)

    return {
      success: connected,
      serverId: entry.id,
      tools: instance.tools,
      error: instance.error,
    }
  }

  // ========== GitHub Integration ==========

  /**
   * Search GitHub for MCP servers
   */
  async searchGithubRepos(query: string): Promise<GithubMcpRepo[]> {
    try {
      const searchQuery = `${query} mcp server in:name,description,topics`
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&per_page=20`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()

      return data.items.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || '',
        owner: repo.owner.login,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        topics: repo.topics || [],
        language: repo.language || 'Unknown',
        license: repo.license?.spdx_id,
        updatedAt: repo.updated_at,
        installCommand: this.guessInstallCommand(repo),
      }))
    } catch (error) {
      console.error('GitHub search failed:', error)
      return []
    }
  }

  /**
   * Get popular MCP repositories
   */
  async getPopularMcpRepos(): Promise<GithubMcpRepo[]> {
    return this.searchGithubRepos('modelcontextprotocol')
  }

  // ========== Health Check ==========

  /**
   * Check health of a specific server
   */
  async checkHealth(serverId: string): Promise<McpHealthCheck> {
    const instance = this.servers.get(serverId)
    const now = new Date().toISOString()

    if (!instance) {
      return {
        serverId,
        status: 'error',
        lastError: 'Server not found',
        checkedAt: now,
      }
    }

    if (instance.status !== 'connected') {
      return {
        serverId,
        status: instance.status,
        lastError: instance.error,
        checkedAt: now,
      }
    }

    const startTime = Date.now()

    try {
      // Ping by listing tools
      const tools = await this.invokeListTools(serverId)
      const latency = Date.now() - startTime

      instance.lastHealthCheck = now

      return {
        serverId,
        status: 'connected',
        latencyMs: latency,
        toolCount: tools.length,
        checkedAt: now,
      }
    } catch (error) {
      return {
        serverId,
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
        checkedAt: now,
      }
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthMonitor(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(async () => {
      const connectedServers = this.getConnectedServers()
      for (const server of connectedServers) {
        const health = await this.checkHealth(server.config.id)
        if (health.status === 'error') {
          // Try to reconnect
          await this.connectServer(server.config.id)
        }
      }
    }, intervalMs)
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitor(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }

  // ========== Event System ==========

  /**
   * Subscribe to MCP events
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback)
    return () => this.eventCallbacks.delete(callback)
  }

  private emitEvent(type: McpEventType, serverId: string, payload?: unknown): void {
    const event: McpEvent = {
      type,
      serverId,
      timestamp: new Date().toISOString(),
      payload,
    }

    for (const callback of this.eventCallbacks) {
      try {
        callback(event)
      } catch (e) {
        console.error('Event callback error:', e)
      }
    }
  }

  // ========== Persistence ==========

  private loadSavedConfigs(): void {
    try {
      const saved = localStorage.getItem('handbox:mcp-servers')
      if (saved) {
        const configs: McpServerConfig[] = JSON.parse(saved)
        for (const config of configs) {
          if (config.enabled) {
            this.servers.set(config.id, {
              config,
              status: 'disconnected',
              tools: [],
            })
          }
        }
      }
    } catch (error) {
      console.error('Failed to load MCP configs:', error)
    }
  }

  private saveConfigs(): void {
    try {
      const configs = Array.from(this.servers.values()).map(s => s.config)
      localStorage.setItem('handbox:mcp-servers', JSON.stringify(configs))
    } catch (error) {
      console.error('Failed to save MCP configs:', error)
    }
  }

  // ========== Tauri Backend Calls ==========

  private async invokeConnect(
    config: McpServerConfig
  ): Promise<{ success: boolean; tools?: McpRemoteTool[]; error?: string }> {
    // In real implementation, this calls Tauri backend
    // For now, simulate connection
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{ success: boolean; tools?: any[]; error?: string }>(
        'mcp_connect',
        { config }
      )

      if (result.tools) {
        result.tools = result.tools.map(t => ({
          ...t,
          serverId: config.id,
        }))
      }

      return result
    } catch (error) {
      // Fallback for development
      console.warn('Tauri not available, using mock:', error)
      return { success: true, tools: [] }
    }
  }

  private async invokeDisconnect(serverId: string): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mcp_disconnect', { serverId })
    } catch (error) {
      console.warn('Tauri disconnect failed:', error)
    }
  }

  private async invokeListTools(serverId: string): Promise<McpRemoteTool[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const tools = await invoke<any[]>('mcp_list_tools', { serverId })
      return tools.map(t => ({ ...t, serverId }))
    } catch (error) {
      console.warn('Tauri list_tools failed:', error)
      return []
    }
  }

  private async invokeCallTool(
    request: McpToolCallRequest
  ): Promise<{ success: boolean; output?: unknown; error?: string }> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke('mcp_call_tool', { request })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // ========== Helpers ==========

  private async generateConfig(
    request: McpInstallRequest,
    serverId: string
  ): Promise<McpServerConfig> {
    const base: McpServerConfig = {
      id: serverId,
      name: request.identifier,
      description: '',
      source: request.source,
      transport: { type: 'stdio', command: '', args: [] },
      autoStart: true,
      enabled: true,
    }

    switch (request.source) {
      case 'npm':
        return {
          ...base,
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', request.identifier],
          },
        }

      case 'github':
        // Parse github URL or owner/repo
        const repoMatch = request.identifier.match(/github\.com\/([^\/]+\/[^\/]+)/)
        const repo = (repoMatch && repoMatch[1]) ? repoMatch[1] : request.identifier
        const repoName = repo.split('/').pop()
        return {
          ...base,
          name: repoName || repo,
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', `github:${repo}`],
          },
          metadata: { repository: `https://github.com/${repo}` },
        }

      case 'local':
        return {
          ...base,
          transport: {
            type: 'stdio',
            command: request.identifier,
            args: [],
          },
        }

      case 'url':
        if (request.identifier.startsWith('http')) {
          return {
            ...base,
            transport: { type: 'sse', url: request.identifier },
          }
        } else if (request.identifier.startsWith('ws')) {
          return {
            ...base,
            transport: { type: 'websocket', url: request.identifier },
          }
        }
        break
    }

    return { ...base, ...request.config }
  }

  private schemaToInputs(schema: any): { name: string; type: string }[] {
    if (!schema?.properties) return []

    return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
      name,
      type: this.jsonTypeToToolType(prop.type),
    }))
  }

  private schemaToConfigFields(schema: any): any[] {
    if (!schema?.properties) return []

    return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
      name,
      type: this.jsonTypeToConfigType(prop.type, prop.enum),
      label: this.formatFieldLabel(name),
      default: prop.default,
      options: prop.enum?.map((v: any) => ({ value: v, label: String(v) })),
    }))
  }

  private jsonTypeToToolType(type: string): string {
    switch (type) {
      case 'string':
        return 'string'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'boolean'
      case 'array':
        return 'array'
      case 'object':
        return 'json'
      default:
        return 'any'
    }
  }

  private jsonTypeToConfigType(type: string, hasEnum?: unknown[]): string {
    if (hasEnum) return 'select'
    switch (type) {
      case 'string':
        return 'string'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'boolean'
      default:
        return 'string'
    }
  }

  private formatToolLabel(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
  }

  private formatFieldLabel(name: string): string {
    return this.formatToolLabel(name)
  }

  private guessInstallCommand(repo: any): string {
    // Try to guess install command from repo metadata
    if (repo.language === 'JavaScript' || repo.language === 'TypeScript') {
      return `npx -y github:${repo.full_name}`
    } else if (repo.language === 'Python') {
      return `uvx ${repo.name}`
    }
    return `npx -y github:${repo.full_name}`
  }
}

// Singleton instance
export const mcpPluginService = new McpPluginService()
