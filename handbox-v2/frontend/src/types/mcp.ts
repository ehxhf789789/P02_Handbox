/**
 * MCP Plugin System Types — Dynamic tool discovery and management.
 */

/** MCP Server source types */
export type McpServerSource = 'github' | 'npm' | 'local' | 'url'

/** MCP Server status */
export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/** Transport types for MCP connection */
export type McpTransportType = 'stdio' | 'sse' | 'websocket'

/** MCP Server configuration */
export interface McpServerConfig {
  id: string
  name: string
  description: string
  source: McpServerSource
  transport: McpTransportConfig
  autoStart: boolean
  enabled: boolean
  env?: Record<string, string>
  metadata?: McpServerMetadata
}

/** Transport configuration */
export type McpTransportConfig =
  | { type: 'stdio'; command: string; args: string[]; cwd?: string }
  | { type: 'sse'; url: string; headers?: Record<string, string> }
  | { type: 'websocket'; url: string }

/** Server metadata from GitHub/npm */
export interface McpServerMetadata {
  author?: string
  repository?: string
  version?: string
  homepage?: string
  license?: string
  tags?: string[]
  downloads?: number
  stars?: number
  lastUpdated?: string
}

/** Connected MCP server instance */
export interface McpServerInstance {
  config: McpServerConfig
  status: McpServerStatus
  error?: string
  tools: McpRemoteTool[]
  connectedAt?: string
  lastHealthCheck?: string
}

/** Remote tool from MCP server */
export interface McpRemoteTool {
  serverId: string
  name: string
  description: string
  inputSchema: JsonSchema
  category?: string
  tags?: string[]
}

/** JSON Schema for tool inputs */
export interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

export interface JsonSchemaProperty {
  type: string
  description?: string
  default?: unknown
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
}

/** GitHub MCP repository info */
export interface GithubMcpRepo {
  id: string
  name: string
  fullName: string
  description: string
  owner: string
  stars: number
  forks: number
  topics: string[]
  language: string
  license?: string
  updatedAt: string
  installCommand?: string
  configTemplate?: Partial<McpServerConfig>
}

/** MCP Server registry entry */
export interface McpRegistryEntry {
  id: string
  name: string
  description: string
  source: McpServerSource
  installCommand: string
  configTemplate: Partial<McpServerConfig>
  documentation?: string
  examples?: McpUsageExample[]
  category: string
  tags: string[]
  verified: boolean
  featured: boolean
}

/** Usage example for MCP tool */
export interface McpUsageExample {
  title: string
  description: string
  toolName: string
  input: Record<string, unknown>
  expectedOutput?: unknown
}

/** Plugin installation request */
export interface McpInstallRequest {
  source: McpServerSource
  identifier: string // npm package name, github repo, or local path
  config?: Partial<McpServerConfig>
}

/** Plugin installation result */
export interface McpInstallResult {
  success: boolean
  serverId?: string
  error?: string
  tools?: McpRemoteTool[]
}

/** MCP tool call request */
export interface McpToolCallRequest {
  serverId: string
  toolName: string
  arguments: Record<string, unknown>
  timeout?: number
}

/** MCP tool call result */
export interface McpToolCallResult {
  success: boolean
  output?: unknown
  error?: string
  executionTime: number
}

/** Event types for MCP system */
export type McpEventType =
  | 'server_added'
  | 'server_removed'
  | 'server_connected'
  | 'server_disconnected'
  | 'server_error'
  | 'tool_discovered'
  | 'tool_called'
  | 'tool_error'

export interface McpEvent {
  type: McpEventType
  serverId: string
  timestamp: string
  payload?: unknown
}

/** MCP health check result */
export interface McpHealthCheck {
  serverId: string
  status: McpServerStatus
  latencyMs?: number
  toolCount?: number
  lastError?: string
  checkedAt: string
}

/** Curated MCP servers list categories */
export const MCP_CATEGORIES = [
  'filesystem',
  'database',
  'web',
  'ai',
  'code',
  'data',
  'devtools',
  'productivity',
  'gis',
  'cad',
  'visualization',
  'other',
] as const

export type McpCategory = (typeof MCP_CATEGORIES)[number]

/** Popular MCP servers from the ecosystem */
export const CURATED_MCP_SERVERS: McpRegistryEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files, browse directories',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-filesystem',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      },
    },
    category: 'filesystem',
    tags: ['file', 'directory', 'read', 'write'],
    verified: true,
    featured: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, PRs',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-github',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
      },
      env: { GITHUB_TOKEN: '' },
    },
    category: 'devtools',
    tags: ['github', 'git', 'repository', 'issues', 'pr'],
    verified: true,
    featured: true,
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-sqlite',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite', 'database.db'],
      },
    },
    category: 'database',
    tags: ['sqlite', 'database', 'sql', 'query'],
    verified: true,
    featured: true,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL databases',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-postgres',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
      },
      env: { DATABASE_URL: '' },
    },
    category: 'database',
    tags: ['postgres', 'postgresql', 'database', 'sql'],
    verified: true,
    featured: false,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-puppeteer',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
      },
    },
    category: 'web',
    tags: ['browser', 'automation', 'scraping', 'web'],
    verified: true,
    featured: true,
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'HTTP requests and API calls',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-fetch',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch'],
      },
    },
    category: 'web',
    tags: ['http', 'api', 'fetch', 'request'],
    verified: true,
    featured: true,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Knowledge graph memory for persistent context',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-memory',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
      },
    },
    category: 'ai',
    tags: ['memory', 'knowledge', 'graph', 'context'],
    verified: true,
    featured: false,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search using Brave Search API',
    source: 'npm',
    installCommand: 'npx -y @modelcontextprotocol/server-brave-search',
    configTemplate: {
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
      },
      env: { BRAVE_API_KEY: '' },
    },
    category: 'web',
    tags: ['search', 'web', 'brave'],
    verified: true,
    featured: false,
  },
]
