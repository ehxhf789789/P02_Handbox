/**
 * Built-in tool catalog for the node palette.
 * Each entry defines what nodes are available to drag onto the canvas.
 *
 * Includes: Core tools, GIS tools, IFC tools, Fusion tools
 *
 * NOTE: GIS, IFC, and Fusion tools are defined in separate catalog files:
 * - gisToolCatalog.ts
 * - ifcToolCatalog.ts
 * - fusionToolCatalog.ts
 *
 * They can be imported separately for domain-specific use.
 */

export interface ConfigField {
  name: string
  type: 'string' | 'number' | 'select' | 'boolean' | 'file' | 'files' | 'folder' | 'multiselect'
  label: string
  default?: unknown
  defaultValue?: unknown
  options?: { value: string; label: string }[] // For select type
  // File picker options
  fileFilters?: { name: string; extensions: string[] }[] // e.g., [{ name: 'Text', extensions: ['txt', 'md'] }]
  multiple?: boolean // For file type - allow multiple selection
  description?: string
  placeholder?: string
  required?: boolean
}

export interface ToolDef {
  id: string
  label: string
  name?: string // Alternative to label
  category: string
  description: string
  icon: string // lucide icon name
  inputs: { name: string; type: string; required?: boolean; description?: string }[]
  outputs: { name: string; type: string; description?: string }[]
  configFields: ConfigField[]
}

export interface ToolCategory {
  id: string
  label: string
  icon: string
  color: string
  tools: ToolDef[]
}

export const toolCategories: ToolCategory[] = [
  {
    id: 'io',
    label: 'Input / Output',
    icon: 'FileInput',
    color: '#3b82f6',
    tools: [
      {
        id: 'file-read',
        label: 'File Read',
        category: 'io',
        description: 'Read text from a file',
        icon: 'FileText',
        inputs: [{ name: 'path', type: 'string' }],
        outputs: [{ name: 'content', type: 'string' }, { name: 'size', type: 'number' }],
        configFields: [
          {
            name: 'file_path',
            type: 'file',
            label: 'File',
            default: '',
            fileFilters: [
              { name: 'Text Files', extensions: ['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          },
          {
            name: 'encoding',
            type: 'select',
            label: 'Encoding',
            default: 'utf-8',
            options: [
              { value: 'utf-8', label: 'UTF-8' },
              { value: 'utf-16', label: 'UTF-16' },
              { value: 'ascii', label: 'ASCII' },
              { value: 'euc-kr', label: 'EUC-KR' },
            ],
          },
        ],
      },
      {
        id: 'pdf-read',
        label: 'PDF Read',
        category: 'io',
        description: 'Extract text content from a PDF file',
        icon: 'FileText',
        inputs: [{ name: 'path', type: 'string' }],
        outputs: [{ name: 'content', type: 'string' }, { name: 'pages', type: 'number' }],
        configFields: [
          {
            name: 'file_path',
            type: 'file',
            label: 'PDF File',
            default: '',
            fileFilters: [
              { name: 'PDF Documents', extensions: ['pdf'] },
            ],
          },
          {
            name: 'page_range',
            type: 'string',
            label: 'Page Range (e.g., "1-5" or "all")',
            default: 'all',
          },
        ],
      },
      {
        id: 'files-read',
        label: 'Multi-File Read',
        category: 'io',
        description: 'Read multiple files at once',
        icon: 'Files',
        inputs: [],
        outputs: [{ name: 'contents', type: 'array' }],
        configFields: [
          {
            name: 'file_paths',
            type: 'files',
            label: 'Files',
            default: [],
            fileFilters: [
              { name: 'Text Files', extensions: ['txt', 'md', 'json', 'csv'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          },
        ],
      },
      {
        id: 'folder-read',
        label: 'Folder Read',
        category: 'io',
        description: 'Read all files from a folder',
        icon: 'FolderOpen',
        inputs: [],
        outputs: [{ name: 'files', type: 'array' }],
        configFields: [
          {
            name: 'folder_path',
            type: 'folder',
            label: 'Folder',
            default: '',
          },
          {
            name: 'pattern',
            type: 'string',
            label: 'File Pattern',
            default: '*.*',
          },
          {
            name: 'recursive',
            type: 'boolean',
            label: 'Include Subfolders',
            default: false,
          },
        ],
      },
      {
        id: 'file-write',
        label: 'File Write',
        category: 'io',
        description: 'Write text to a file',
        icon: 'Save',
        inputs: [
          { name: 'path', type: 'string' },
          { name: 'content', type: 'string' },
        ],
        outputs: [{ name: 'success', type: 'boolean' }],
        configFields: [],
      },
      {
        id: 'user-input',
        label: 'User Input',
        category: 'io',
        description: 'Prompt the user for input',
        icon: 'MessageSquare',
        inputs: [],
        outputs: [{ name: 'text', type: 'string' }],
        configFields: [{ name: 'prompt', type: 'string', label: 'Prompt Text', default: 'Enter input:' }],
      },
      {
        id: 'display-output',
        label: 'Display Output',
        category: 'io',
        description: 'Display result to the user',
        icon: 'Monitor',
        inputs: [{ name: 'data', type: 'any' }],
        outputs: [],
        configFields: [{
          name: 'format',
          type: 'select',
          label: 'Format',
          default: 'text',
          options: [
            { value: 'text', label: 'Plain Text' },
            { value: 'json', label: 'JSON' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML' },
          ],
        }],
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI / LLM',
    icon: 'Brain',
    color: '#a855f7',
    tools: [
      {
        id: 'llm-chat',
        label: 'LLM Chat',
        category: 'ai',
        description: 'Send a prompt to an LLM and get a response',
        icon: 'Bot',
        inputs: [
          { name: 'prompt', type: 'string' },
          { name: 'context', type: 'string' },
        ],
        outputs: [{ name: 'response', type: 'string' }],
        configFields: [
          {
            name: 'model',
            type: 'select',
            label: 'Model',
            default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
              { value: 'gpt-4o', label: 'GPT-4o' },
              { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
              { value: 'llama3.2', label: 'Llama 3.2 (Local)' },
            ],
          },
          { name: 'temperature', type: 'number', label: 'Temperature', default: 0.7 },
          { name: 'max_tokens', type: 'number', label: 'Max Tokens', default: 4096 },
        ],
      },
      {
        id: 'llm-summarize',
        label: 'Summarize',
        category: 'ai',
        description: 'Summarize text using LLM',
        icon: 'AlignLeft',
        inputs: [{ name: 'text', type: 'string' }],
        outputs: [{ name: 'summary', type: 'string' }],
        configFields: [
          { name: 'max_length', type: 'number', label: 'Max Length', default: 500 },
          {
            name: 'model',
            type: 'select',
            label: 'Model',
            default: 'claude-sonnet-4-20250514',
            options: [
              { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
              { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
              { value: 'gpt-4o', label: 'GPT-4o' },
              { value: 'llama3.2', label: 'Llama 3.2 (Local)' },
            ],
          },
        ],
      },
      {
        id: 'embedding',
        label: 'Embedding',
        category: 'ai',
        description: 'Generate vector embeddings from text',
        icon: 'Waypoints',
        inputs: [{ name: 'text', type: 'string' }],
        outputs: [{ name: 'vector', type: 'array' }],
        configFields: [
          {
            name: 'model',
            type: 'select',
            label: 'Model',
            default: 'text-embedding-3-small',
            options: [
              { value: 'text-embedding-3-small', label: 'OpenAI Embedding (Small)' },
              { value: 'text-embedding-3-large', label: 'OpenAI Embedding (Large)' },
              { value: 'amazon.titan-embed-text-v1', label: 'Titan Embedding v1' },
              { value: 'nomic-embed-text', label: 'Nomic Embed (Local)' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'text',
    label: 'Text Processing',
    icon: 'Type',
    color: '#22c55e',
    tools: [
      {
        id: 'text-split',
        label: 'Text Splitter',
        category: 'text',
        description: 'Split text into chunks',
        icon: 'Scissors',
        inputs: [{ name: 'text', type: 'string' }],
        outputs: [{ name: 'chunks', type: 'array' }],
        configFields: [
          { name: 'chunk_size', type: 'number', label: 'Chunk Size', default: 1000 },
          { name: 'overlap', type: 'number', label: 'Overlap', default: 200 },
        ],
      },
      {
        id: 'text-merge',
        label: 'Text Merge',
        category: 'text',
        description: 'Merge multiple texts into one',
        icon: 'Merge',
        inputs: [{ name: 'texts', type: 'array' }],
        outputs: [{ name: 'merged', type: 'string' }],
        configFields: [{ name: 'separator', type: 'string', label: 'Separator', default: '\\n' }],
      },
      {
        id: 'text-template',
        label: 'Template',
        category: 'text',
        description: 'Apply a text template with variables',
        icon: 'FileCode',
        inputs: [{ name: 'variables', type: 'json' }],
        outputs: [{ name: 'result', type: 'string' }],
        configFields: [{ name: 'template', type: 'string', label: 'Template', default: '' }],
      },
      {
        id: 'regex-extract',
        label: 'Regex Extract',
        category: 'text',
        description: 'Extract text using regular expressions',
        icon: 'Regex',
        inputs: [{ name: 'text', type: 'string' }],
        outputs: [{ name: 'matches', type: 'array' }],
        configFields: [{ name: 'pattern', type: 'string', label: 'Pattern', default: '' }],
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    icon: 'Database',
    color: '#f59e0b',
    tools: [
      {
        id: 'json-parse',
        label: 'JSON Parse',
        category: 'data',
        description: 'Parse JSON string to object',
        icon: 'Braces',
        inputs: [{ name: 'json_string', type: 'string' }],
        outputs: [{ name: 'data', type: 'json' }],
        configFields: [],
      },
      {
        id: 'json-path',
        label: 'JSON Path',
        category: 'data',
        description: 'Extract data using JSONPath expression',
        icon: 'GitBranch',
        inputs: [{ name: 'data', type: 'json' }],
        outputs: [{ name: 'result', type: 'any' }],
        configFields: [{ name: 'expression', type: 'string', label: 'JSONPath', default: '$.' }],
      },
      {
        id: 'csv-read',
        label: 'CSV Read',
        category: 'data',
        description: 'Read and parse CSV data',
        icon: 'Table',
        inputs: [{ name: 'path', type: 'string' }],
        outputs: [{ name: 'rows', type: 'array' }],
        configFields: [{ name: 'delimiter', type: 'string', label: 'Delimiter', default: ',' }],
      },
      {
        id: 'data-filter',
        label: 'Filter',
        category: 'data',
        description: 'Filter array items by condition',
        icon: 'Filter',
        inputs: [{ name: 'items', type: 'array' }],
        outputs: [{ name: 'filtered', type: 'array' }],
        configFields: [{ name: 'condition', type: 'string', label: 'Condition', default: '' }],
      },
    ],
  },
  {
    id: 'control',
    label: 'Control Flow',
    icon: 'GitFork',
    color: '#ef4444',
    tools: [
      {
        id: 'condition',
        label: 'Condition',
        category: 'control',
        description: 'Branch based on a condition',
        icon: 'GitFork',
        inputs: [{ name: 'value', type: 'any' }],
        outputs: [
          { name: 'true', type: 'any' },
          { name: 'false', type: 'any' },
        ],
        configFields: [{ name: 'expression', type: 'string', label: 'Expression', default: '' }],
      },
      {
        id: 'loop',
        label: 'Loop',
        category: 'control',
        description: 'Iterate over array items',
        icon: 'Repeat',
        inputs: [{ name: 'items', type: 'array' }],
        outputs: [{ name: 'results', type: 'array' }],
        configFields: [{ name: 'max_iterations', type: 'number', label: 'Max Iterations', default: 100 }],
      },
      {
        id: 'merge',
        label: 'Merge',
        category: 'control',
        description: 'Merge multiple inputs into one',
        icon: 'GitMerge',
        inputs: [
          { name: 'input_a', type: 'any' },
          { name: 'input_b', type: 'any' },
        ],
        outputs: [{ name: 'merged', type: 'json' }],
        configFields: [],
      },
      {
        id: 'delay',
        label: 'Delay',
        category: 'control',
        description: 'Wait for specified duration',
        icon: 'Timer',
        inputs: [{ name: 'trigger', type: 'any' }],
        outputs: [{ name: 'trigger', type: 'any' }],
        configFields: [{ name: 'ms', type: 'number', label: 'Delay (ms)', default: 1000 }],
      },
    ],
  },
  {
    id: 'rag',
    label: 'RAG',
    icon: 'Search',
    color: '#06b6d4',
    tools: [
      {
        id: 'vector-store',
        label: 'Vector Store',
        category: 'rag',
        description: 'Store embeddings in vector database',
        icon: 'HardDrive',
        inputs: [
          { name: 'chunks', type: 'array' },
          { name: 'vectors', type: 'array' },
        ],
        outputs: [{ name: 'index_id', type: 'string' }],
        configFields: [{ name: 'index_name', type: 'string', label: 'Index Name', default: '' }],
      },
      {
        id: 'vector-search',
        label: 'Vector Search',
        category: 'rag',
        description: 'Search similar documents by vector',
        icon: 'SearchCode',
        inputs: [{ name: 'query_vector', type: 'array' }],
        outputs: [{ name: 'results', type: 'array' }],
        configFields: [
          { name: 'top_k', type: 'number', label: 'Top K', default: 5 },
          { name: 'index_name', type: 'string', label: 'Index Name', default: '' },
        ],
      },
      {
        id: 'reranker',
        label: 'Reranker',
        category: 'rag',
        description: 'Rerank search results by relevance',
        icon: 'ArrowUpDown',
        inputs: [
          { name: 'query', type: 'string' },
          { name: 'documents', type: 'array' },
        ],
        outputs: [{ name: 'ranked', type: 'array' }],
        configFields: [{ name: 'top_n', type: 'number', label: 'Top N', default: 3 }],
      },
    ],
  },
  {
    id: 'export',
    label: 'Export',
    icon: 'Download',
    color: '#ec4899',
    tools: [
      {
        id: 'to-pdf',
        label: 'Export PDF',
        category: 'export',
        description: 'Export content as PDF',
        icon: 'FileDown',
        inputs: [{ name: 'content', type: 'string' }],
        outputs: [{ name: 'path', type: 'string' }],
        configFields: [{ name: 'filename', type: 'string', label: 'Filename', default: 'output.pdf' }],
      },
      {
        id: 'to-excel',
        label: 'Export Excel',
        category: 'export',
        description: 'Export data as Excel',
        icon: 'Sheet',
        inputs: [{ name: 'data', type: 'array' }],
        outputs: [{ name: 'path', type: 'string' }],
        configFields: [{ name: 'filename', type: 'string', label: 'Filename', default: 'output.xlsx' }],
      },
    ],
  },
  // GIS Categories - Tools are loaded dynamically from gisToolCatalog.ts
  {
    id: 'gis-io',
    label: 'GIS Input/Output',
    icon: 'Map',
    color: '#10b981',
    tools: [], // Loaded from gisToolCatalog
  },
  {
    id: 'gis-transform',
    label: 'GIS Transform',
    icon: 'Repeat',
    color: '#059669',
    tools: [], // Loaded from gisToolCatalog
  },
  {
    id: 'gis-analysis',
    label: 'GIS Analysis',
    icon: 'BarChart2',
    color: '#047857',
    tools: [], // Loaded from gisToolCatalog
  },
  // IFC Categories - Tools are loaded dynamically from ifcToolCatalog.ts
  {
    id: 'ifc-io',
    label: 'IFC Input/Output',
    icon: 'Box',
    color: '#8b5cf6',
    tools: [], // Loaded from ifcToolCatalog
  },
  {
    id: 'ifc-analysis',
    label: 'IFC Analysis',
    icon: 'Layers',
    color: '#7c3aed',
    tools: [], // Loaded from ifcToolCatalog
  },
  {
    id: 'ifc-transform',
    label: 'IFC Transform',
    icon: 'Shuffle',
    color: '#6d28d9',
    tools: [], // Loaded from ifcToolCatalog
  },
  {
    id: 'ifc-export',
    label: 'IFC Export',
    icon: 'Download',
    color: '#5b21b6',
    tools: [], // Loaded from ifcToolCatalog
  },
  // Fusion Categories - Tools are loaded dynamically from fusionToolCatalog.ts
  {
    id: 'fusion-io',
    label: 'Fusion I/O',
    icon: 'FolderPlus',
    color: '#f97316',
    tools: [], // Loaded from fusionToolCatalog
  },
  {
    id: 'fusion-alignment',
    label: 'Fusion Alignment',
    icon: 'Crosshair',
    color: '#ea580c',
    tools: [], // Loaded from fusionToolCatalog
  },
  {
    id: 'fusion-linking',
    label: 'Fusion Linking',
    icon: 'Link',
    color: '#dc2626',
    tools: [], // Loaded from fusionToolCatalog
  },
  {
    id: 'fusion-analysis',
    label: 'Fusion Analysis',
    icon: 'Search',
    color: '#b91c1c',
    tools: [], // Loaded from fusionToolCatalog
  },
  {
    id: 'fusion-export',
    label: 'Fusion Export',
    icon: 'FileDown',
    color: '#991b1b',
    tools: [], // Loaded from fusionToolCatalog
  },
]

/** Flat list of all tools */
export const allTools = toolCategories.flatMap((cat) => cat.tools)

/** Look up a tool by ID */
export function getToolDef(toolId: string): ToolDef | undefined {
  return allTools.find((t) => t.id === toolId)
}

/** Get category color for a tool */
export function getCategoryColor(category: string): string {
  return toolCategories.find((c) => c.id === category)?.color ?? '#6b7280'
}

/** Get all categories (for filtering UI) */
export function getAllCategories(): string[] {
  return toolCategories.map((c) => c.id)
}

/** Get tools by category */
export function getToolsByCategory(categoryId: string): ToolDef[] {
  return toolCategories.find((c) => c.id === categoryId)?.tools ?? []
}

/** Search tools by name or description */
export function searchTools(query: string): ToolDef[] {
  const lowerQuery = query.toLowerCase()
  return allTools.filter(
    (t) =>
      t.label.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery)
  )
}

/** GIS tool category IDs */
export const gisCategories = ['gis-io', 'gis-transform', 'gis-analysis']

/** IFC tool category IDs */
export const ifcCategories = ['ifc-io', 'ifc-analysis', 'ifc-transform', 'ifc-export']

/** Fusion tool category IDs */
export const fusionCategories = ['fusion-io', 'fusion-alignment', 'fusion-linking', 'fusion-analysis', 'fusion-export']
