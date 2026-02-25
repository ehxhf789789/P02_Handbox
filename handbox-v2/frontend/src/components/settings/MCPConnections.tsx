/**
 * MCPConnections — manage MCP server connections.
 */

import { useState, useEffect } from 'react'
import {
  Server, Plus, X, Loader2, RefreshCw,
  Trash2, Wifi, WifiOff,
} from 'lucide-react'

interface MCPServer {
  id: string
  name: string
  url: string
  transport: 'stdio' | 'sse' | 'websocket'
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  tools?: string[]
  error?: string
}

interface MCPConnectionsProps {
  isOpen: boolean
  onClose: () => void
}

export function MCPConnections({ isOpen, onClose }: MCPConnectionsProps) {
  const [servers, setServers] = useState<MCPServer[]>([
    // Example built-in servers
    {
      id: 'local-mcp',
      name: 'Local MCP Server',
      url: 'stdio:///handbox-mcp',
      transport: 'stdio',
      status: 'connected',
      tools: ['file-read', 'file-write', 'llm-chat'],
    },
  ])
  const [isAdding, setIsAdding] = useState(false)
  const [newServer, setNewServer] = useState<{
    name: string
    url: string
    transport: 'stdio' | 'sse' | 'websocket'
  }>({
    name: '',
    url: '',
    transport: 'sse',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null)

  // Load servers from backend
  useEffect(() => {
    if (isOpen) {
      loadServers()
    }
  }, [isOpen])

  const loadServers = async () => {
    setIsLoading(true)
    try {
      // Try to load from backend
      // For now, use default servers
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate load
    } catch (error) {
      console.error('Failed to load MCP servers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddServer = () => {
    if (!newServer.name || !newServer.url) return

    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: newServer.name,
      url: newServer.url,
      transport: newServer.transport,
      status: 'disconnected',
    }

    setServers([...servers, server])
    setNewServer({ name: '', url: '', transport: 'sse' })
    setIsAdding(false)
  }

  const handleConnect = async (serverId: string) => {
    setServers(servers.map(s =>
      s.id === serverId ? { ...s, status: 'connecting' as const } : s
    ))

    try {
      // Simulate connection
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Mock tools discovery
      const mockTools = ['tool-1', 'tool-2', 'tool-3']

      setServers(servers.map(s =>
        s.id === serverId ? { ...s, status: 'connected' as const, tools: mockTools } : s
      ))
    } catch (error) {
      setServers(servers.map(s =>
        s.id === serverId ? { ...s, status: 'error' as const, error: String(error) } : s
      ))
    }
  }

  const handleDisconnect = (serverId: string) => {
    setServers(servers.map(s =>
      s.id === serverId ? { ...s, status: 'disconnected' as const, tools: undefined } : s
    ))
  }

  const handleRemove = (serverId: string) => {
    setServers(servers.filter(s => s.id !== serverId))
    if (selectedServer?.id === serverId) {
      setSelectedServer(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[700px] max-h-[80vh] bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-violet-500" />
            <span className="text-sm font-semibold text-neutral-200">MCP Connections</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadServers}
              disabled={isLoading}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Server List */}
          <div className="w-72 border-r border-neutral-800 flex flex-col">
            <div className="flex-1 overflow-y-auto py-2">
              {servers.map((server) => (
                <button
                  key={server.id}
                  onClick={() => setSelectedServer(server)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedServer?.id === server.id
                      ? 'bg-neutral-800'
                      : 'hover:bg-neutral-800/50'
                  }`}
                >
                  {server.status === 'connected' ? (
                    <Wifi size={14} className="text-emerald-500 shrink-0" />
                  ) : server.status === 'connecting' ? (
                    <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />
                  ) : server.status === 'error' ? (
                    <WifiOff size={14} className="text-red-500 shrink-0" />
                  ) : (
                    <WifiOff size={14} className="text-neutral-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-neutral-200 truncate">
                      {server.name}
                    </div>
                    <div className="text-[10px] text-neutral-500 truncate">
                      {server.transport} - {server.tools?.length || 0} tools
                    </div>
                  </div>
                </button>
              ))}

              {servers.length === 0 && !isLoading && (
                <div className="flex items-center justify-center h-32 text-xs text-neutral-600">
                  No MCP servers configured
                </div>
              )}
            </div>

            {/* Add Server Button */}
            <div className="p-3 border-t border-neutral-800">
              <button
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2
                         text-xs font-medium text-neutral-400 hover:text-neutral-200
                         border border-dashed border-neutral-700 rounded-md
                         hover:border-neutral-600 hover:bg-neutral-800/30 transition-colors"
              >
                <Plus size={14} />
                Add Server
              </button>
            </div>
          </div>

          {/* Server Details */}
          <div className="flex-1 p-5 overflow-y-auto">
            {isAdding ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-neutral-200">Add MCP Server</h3>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={newServer.name}
                    onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                    placeholder="My MCP Server"
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Server URL
                  </label>
                  <input
                    type="text"
                    value={newServer.url}
                    onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                    placeholder="http://localhost:3000/mcp or stdio:///path/to/server"
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500 placeholder-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Transport
                  </label>
                  <select
                    value={newServer.transport}
                    onChange={(e) => setNewServer({ ...newServer, transport: e.target.value as 'stdio' | 'sse' | 'websocket' })}
                    className="w-full px-3 py-2 text-xs bg-neutral-800 border border-neutral-700
                             rounded-md text-neutral-200 focus:outline-none focus:ring-1
                             focus:ring-violet-500"
                  >
                    <option value="stdio">stdio (Local Process)</option>
                    <option value="sse">SSE (Server-Sent Events)</option>
                    <option value="websocket">WebSocket</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200
                             rounded-md hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddServer}
                    disabled={!newServer.name || !newServer.url}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium
                             bg-violet-600 hover:bg-violet-500 text-white rounded-md
                             disabled:opacity-50"
                  >
                    <Plus size={12} />
                    Add Server
                  </button>
                </div>
              </div>
            ) : selectedServer ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-200">
                      {selectedServer.name}
                    </h3>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      {selectedServer.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedServer.status === 'connected' ? (
                      <button
                        onClick={() => handleDisconnect(selectedServer.id)}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs
                                 text-red-400 border border-red-800 rounded-md
                                 hover:bg-red-900/30"
                      >
                        <WifiOff size={12} />
                        Disconnect
                      </button>
                    ) : selectedServer.status === 'connecting' ? (
                      <button
                        disabled
                        className="flex items-center gap-1.5 px-3 py-1 text-xs
                                 text-amber-400 border border-amber-800 rounded-md opacity-50"
                      >
                        <Loader2 size={12} className="animate-spin" />
                        Connecting...
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(selectedServer.id)}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs
                                 text-emerald-400 border border-emerald-800 rounded-md
                                 hover:bg-emerald-900/30"
                      >
                        <Wifi size={12} />
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-neutral-500">Transport:</span>
                    <span className="ml-2 text-neutral-300">{selectedServer.transport}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Status:</span>
                    <span className={`ml-2 ${
                      selectedServer.status === 'connected' ? 'text-emerald-400' :
                      selectedServer.status === 'error' ? 'text-red-400' :
                      selectedServer.status === 'connecting' ? 'text-amber-400' :
                      'text-neutral-400'
                    }`}>
                      {selectedServer.status}
                    </span>
                  </div>
                </div>

                {selectedServer.error && (
                  <div className="p-3 rounded-md bg-red-900/20 border border-red-800 text-xs text-red-400">
                    {selectedServer.error}
                  </div>
                )}

                {selectedServer.tools && selectedServer.tools.length > 0 && (
                  <div className="pt-3 border-t border-neutral-800">
                    <h4 className="text-xs font-medium text-neutral-400 mb-2">
                      Available Tools ({selectedServer.tools.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedServer.tools.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-neutral-800">
                  <button
                    onClick={() => handleRemove(selectedServer.id)}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                    Remove Server
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-neutral-600">
                Select a server to view details or add a new one
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-900/50 shrink-0">
          <div className="text-[10px] text-neutral-600">
            {servers.filter(s => s.status === 'connected').length} / {servers.length} connected
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200
                     rounded-md hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
