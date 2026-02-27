/**
 * McpPluginPanel — UI for managing MCP server plugins.
 *
 * Features:
 * - Browse and install curated MCP servers
 * - Search GitHub for MCP servers
 * - Connect/disconnect servers
 * - View discovered tools
 * - Test tool execution
 */

import { useState, useEffect } from 'react'
import { useMcpStore, selectServerStats, selectAvailableCurated } from '@/stores/mcpStore'
import type { McpServerInstance, GithubMcpRepo, McpRegistryEntry } from '@/types/mcp'
import {
  Plug,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  ExternalLink,
  Github,
  Package,
  Folder,
  Globe,
  Check,
  X,
  AlertCircle,
  ChevronRight,
  Star,
  Download,
  Terminal,
  Wrench,
  Loader2,
} from 'lucide-react'

type TabType = 'installed' | 'browse' | 'github'

export function McpPluginPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('installed')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const {
    servers,
    allTools: _allTools,
    githubRepos,
    githubSearching,
    isInstalling,
    installError,
    loadServers,
    searchGithub,
    loadPopularRepos,
  } = useMcpStore()
  void _allTools // reserved for tool listing feature

  const stats = useMcpStore(selectServerStats)
  const availableCurated = useMcpStore(selectAvailableCurated)

  // Load servers on mount
  useEffect(() => {
    loadServers()
  }, [loadServers])

  // Load popular repos when GitHub tab is selected
  useEffect(() => {
    if (activeTab === 'github' && githubRepos.length === 0) {
      loadPopularRepos()
    }
  }, [activeTab, githubRepos.length, loadPopularRepos])

  const handleGithubSearch = () => {
    if (searchQuery.trim()) {
      searchGithub(searchQuery)
    }
  }

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Plug size={18} className="text-violet-400" />
            <span className="font-semibold">MCP Plugins</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg"
            title="Add Server"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            {stats.connected} connected
          </span>
          <span>{stats.totalTools} tools</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <TabButton
          active={activeTab === 'installed'}
          onClick={() => setActiveTab('installed')}
          icon={<Package size={12} />}
          label="Installed"
          count={stats.total}
        />
        <TabButton
          active={activeTab === 'browse'}
          onClick={() => setActiveTab('browse')}
          icon={<Star size={12} />}
          label="Browse"
          count={availableCurated.length}
        />
        <TabButton
          active={activeTab === 'github'}
          onClick={() => setActiveTab('github')}
          icon={<Github size={12} />}
          label="GitHub"
        />
      </div>

      {/* Search (for GitHub tab) */}
      {activeTab === 'github' && (
        <div className="p-3 border-b border-neutral-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGithubSearch()}
              placeholder="Search MCP servers on GitHub..."
              className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm
                       focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={handleGithubSearch}
              disabled={githubSearching}
              className="px-3 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg disabled:opacity-50"
            >
              {githubSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'installed' && (
          <InstalledServersTab servers={Object.values(servers)} />
        )}
        {activeTab === 'browse' && (
          <BrowseCuratedTab entries={availableCurated} isInstalling={isInstalling} />
        )}
        {activeTab === 'github' && (
          <GithubReposTab repos={githubRepos} isSearching={githubSearching} />
        )}
      </div>

      {/* Install Error */}
      {installError && (
        <div className="p-3 bg-red-500/20 border-t border-red-500/30 text-red-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={12} />
            {installError}
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showAddModal && <AddServerModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}

// ========== Tab Button ==========

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium
                border-b-2 transition-colors ${
                  active
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className="ml-1 px-1.5 py-0.5 bg-neutral-800 rounded text-[10px]">{count}</span>
      )}
    </button>
  )
}

// ========== Installed Servers Tab ==========

function InstalledServersTab({ servers }: { servers: McpServerInstance[] }) {
  const { connectServer, disconnectServer, removeServer, refreshTools } = useMcpStore()

  if (servers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-6">
        <Package size={48} className="mb-3 opacity-50" />
        <p className="text-sm">No MCP servers installed</p>
        <p className="text-xs mt-1">Browse curated servers or search GitHub</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {servers.map(server => (
        <ServerCard
          key={server.config.id}
          server={server}
          onConnect={() => connectServer(server.config.id)}
          onDisconnect={() => disconnectServer(server.config.id)}
          onRemove={() => removeServer(server.config.id)}
          onRefresh={() => refreshTools(server.config.id)}
        />
      ))}
    </div>
  )
}

// ========== Server Card ==========

function ServerCard({
  server,
  onConnect,
  onDisconnect,
  onRemove,
  onRefresh,
}: {
  server: McpServerInstance
  onConnect: () => void
  onDisconnect: () => void
  onRemove: () => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const statusColors = {
    connected: 'bg-emerald-500',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-neutral-500',
    error: 'bg-red-500',
  }

  return (
    <div className="bg-neutral-800 rounded-lg overflow-hidden">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-2 h-2 rounded-full ${statusColors[server.status]}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{server.config.name}</div>
              <div className="text-xs text-neutral-500 truncate">
                {server.config.description || server.config.id}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {server.status === 'connected' ? (
              <>
                <button
                  onClick={onRefresh}
                  className="p-1.5 hover:bg-neutral-700 rounded"
                  title="Refresh tools"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  onClick={onDisconnect}
                  className="p-1.5 hover:bg-neutral-700 rounded text-yellow-400"
                  title="Disconnect"
                >
                  <Pause size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={onConnect}
                className="p-1.5 hover:bg-neutral-700 rounded text-emerald-400"
                title="Connect"
              >
                <Play size={12} />
              </button>
            )}
            <button
              onClick={onRemove}
              className="p-1.5 hover:bg-neutral-700 rounded text-red-400"
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 hover:bg-neutral-700 rounded"
            >
              <ChevronRight
                size={12}
                className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Tools count */}
        {server.status === 'connected' && server.tools.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            <Wrench size={10} />
            {server.tools.length} tools available
          </div>
        )}

        {/* Error message */}
        {server.status === 'error' && server.error && (
          <div className="mt-2 text-xs text-red-400">{server.error}</div>
        )}
      </div>

      {/* Expanded: Tool list */}
      {expanded && server.tools.length > 0 && (
        <div className="border-t border-neutral-700 p-3 bg-neutral-900/50">
          <div className="text-xs font-medium text-neutral-400 mb-2">Available Tools</div>
          <div className="space-y-1.5 max-h-48 overflow-auto">
            {server.tools.map(tool => (
              <div
                key={tool.name}
                className="flex items-center gap-2 p-2 bg-neutral-800 rounded text-xs"
              >
                <Terminal size={10} className="text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{tool.name}</div>
                  <div className="text-neutral-500 truncate">{tool.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ========== Browse Curated Tab ==========

function BrowseCuratedTab({
  entries,
  isInstalling,
}: {
  entries: McpRegistryEntry[]
  isInstalling: boolean
}) {
  const { installCurated } = useMcpStore()
  const [installingId, setInstallingId] = useState<string | null>(null)

  const handleInstall = async (entryId: string) => {
    setInstallingId(entryId)
    await installCurated(entryId)
    setInstallingId(null)
  }

  // Group by category
  const grouped = entries.reduce(
    (acc, entry) => {
      const cat = entry.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(entry)
      return acc
    },
    {} as Record<string, McpRegistryEntry[]>
  )

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-6">
        <Check size={48} className="mb-3 text-emerald-400" />
        <p className="text-sm">All curated servers installed!</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-4">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            {category}
          </div>
          <div className="space-y-2">
            {items.map(entry => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{entry.name}</span>
                    {entry.verified && (
                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] rounded">
                        Verified
                      </span>
                    )}
                    {entry.featured && (
                      <Star size={10} className="text-yellow-400" />
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 truncate">{entry.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {entry.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 bg-neutral-700 text-neutral-400 text-[10px] rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleInstall(entry.id)}
                  disabled={isInstalling}
                  className="ml-3 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-xs
                           disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {installingId === entry.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  Install
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ========== GitHub Repos Tab ==========

function GithubReposTab({
  repos,
  isSearching,
}: {
  repos: GithubMcpRepo[]
  isSearching: boolean
}) {
  const { install } = useMcpStore()
  const [installingId, setInstallingId] = useState<string | null>(null)

  const handleInstall = async (repo: GithubMcpRepo) => {
    setInstallingId(repo.id)
    await install({
      source: 'github',
      identifier: repo.fullName,
    })
    setInstallingId(null)
  }

  if (isSearching) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p className="text-sm">Searching GitHub...</p>
      </div>
    )
  }

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 p-6">
        <Github size={48} className="mb-3 opacity-50" />
        <p className="text-sm">Search for MCP servers on GitHub</p>
        <p className="text-xs mt-1">Or browse popular repositories</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {repos.map(repo => (
        <div key={repo.id} className="p-3 bg-neutral-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <a
                  href={`https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm hover:text-violet-400 flex items-center gap-1"
                >
                  {repo.name}
                  <ExternalLink size={10} />
                </a>
              </div>
              <p className="text-xs text-neutral-400 mt-1">{repo.owner}</p>
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{repo.description}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                <span className="flex items-center gap-1">
                  <Star size={10} />
                  {repo.stars.toLocaleString()}
                </span>
                <span>{repo.language}</span>
                {repo.license && <span>{repo.license}</span>}
              </div>
            </div>
            <button
              onClick={() => handleInstall(repo)}
              disabled={installingId === repo.id}
              className="ml-3 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-xs
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {installingId === repo.id ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              Install
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ========== Add Server Modal ==========

function AddServerModal({ onClose }: { onClose: () => void }) {
  const [source, setSource] = useState<'npm' | 'local' | 'url'>('npm')
  const [identifier, setIdentifier] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const { install } = useMcpStore()

  const handleAdd = async () => {
    if (!identifier.trim()) return

    setIsAdding(true)
    await install({ source, identifier: identifier.trim() })
    setIsAdding(false)
    onClose()
  }

  const sourceIcons = {
    npm: <Package size={14} />,
    local: <Folder size={14} />,
    url: <Globe size={14} />,
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-4 w-96 max-w-[90vw]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Add MCP Server</h3>
          <button onClick={onClose} className="p-1 hover:bg-neutral-700 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Source selection */}
        <div className="flex gap-2 mb-4">
          {(['npm', 'local', 'url'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm
                        ${source === s ? 'bg-violet-600' : 'bg-neutral-700 hover:bg-neutral-600'}`}
            >
              {sourceIcons[s]}
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="mb-4">
          <label className="block text-xs text-neutral-400 mb-1">
            {source === 'npm' && 'NPM Package Name'}
            {source === 'local' && 'Command Path'}
            {source === 'url' && 'Server URL (http/ws)'}
          </label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder={
              source === 'npm'
                ? '@modelcontextprotocol/server-filesystem'
                : source === 'local'
                  ? '/path/to/mcp-server'
                  : 'http://localhost:3000/mcp'
            }
            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-sm
                     focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!identifier.trim() || isAdding}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm
                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isAdding && <Loader2 size={14} className="animate-spin" />}
            Add Server
          </button>
        </div>
      </div>
    </div>
  )
}

export default McpPluginPanel
