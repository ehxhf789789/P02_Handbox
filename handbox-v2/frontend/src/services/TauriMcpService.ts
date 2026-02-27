/**
 * TauriMcpService — Tauri backend integration for MCP server management.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  McpServerConfig,
  McpServerInstance,
  McpRemoteTool,
  McpHealthCheck,
} from '@/types/mcp'

// Convert frontend types to backend snake_case format
function toSnakeCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toSnakeCase) as T
  if (typeof obj !== 'object') return obj

  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    converted[snakeKey] = toSnakeCase(value)
  }
  return converted as T
}

// Convert backend snake_case to frontend camelCase
function toCamelCase<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(toCamelCase) as T
  if (typeof obj !== 'object') return obj

  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    converted[camelKey] = toCamelCase(value)
  }
  return converted as T
}

/**
 * TauriMcpService class
 */
class TauriMcpService {
  /**
   * Add a new MCP server
   */
  async addServer(config: McpServerConfig): Promise<McpServerInstance | null> {
    try {
      const backendConfig = toSnakeCase(config)
      const result = await invoke<McpServerInstance>('mcp_add_server', { config: backendConfig })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to add MCP server:', e)
      return null
    }
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverId: string): Promise<boolean> {
    try {
      await invoke('mcp_remove_server', { serverId })
      return true
    } catch (e) {
      console.error('Failed to remove MCP server:', e)
      return false
    }
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(serverId: string): Promise<boolean> {
    try {
      const result = await invoke<boolean>('mcp_connect_server', { serverId })
      return result
    } catch (e) {
      console.error('Failed to connect MCP server:', e)
      return false
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<boolean> {
    try {
      await invoke('mcp_disconnect_server', { serverId })
      return true
    } catch (e) {
      console.error('Failed to disconnect MCP server:', e)
      return false
    }
  }

  /**
   * List all MCP servers
   */
  async listServers(): Promise<McpServerInstance[]> {
    try {
      const result = await invoke<McpServerInstance[]>('mcp_list_servers')
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to list MCP servers:', e)
      return []
    }
  }

  /**
   * Get tools from a server
   */
  async getTools(serverId: string): Promise<McpRemoteTool[]> {
    try {
      const result = await invoke<McpRemoteTool[]>('mcp_get_tools', { serverId })
      return result.map(toCamelCase)
    } catch (e) {
      console.error('Failed to get MCP tools:', e)
      return []
    }
  }

  /**
   * Call a tool on a server
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; output?: unknown; error?: string }> {
    try {
      const result = await invoke<{ success: boolean; output?: unknown; error?: string }>(
        'mcp_call_tool',
        { serverId, toolName, arguments: args }
      )
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to call MCP tool:', e)
      return { success: false, error: String(e) }
    }
  }

  /**
   * Check server health
   */
  async healthCheck(serverId: string): Promise<McpHealthCheck | null> {
    try {
      const result = await invoke<McpHealthCheck>('mcp_health_check', { serverId })
      return toCamelCase(result)
    } catch (e) {
      console.error('Failed to check MCP server health:', e)
      return null
    }
  }
}

// Singleton instance
export const tauriMcpService = new TauriMcpService()
