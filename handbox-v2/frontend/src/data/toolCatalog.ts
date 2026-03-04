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
        inputs: [{ name: 'paths', type: 'array' }],
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
        inputs: [{ name: 'path', type: 'string' }],
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
        configFields: [
          {
            name: 'file_path',
            type: 'file',
            label: 'Output File',
            default: '',
            fileFilters: [
              { name: 'Text Files', extensions: ['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          },
        ],
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
      {
        id: 'http-request',
        label: 'HTTP Request',
        category: 'io',
        description: 'Make HTTP/REST API requests (GET, POST, PUT, DELETE). Supports custom headers, authentication, and JSON body.',
        icon: 'Globe',
        inputs: [],
        outputs: [
          { name: 'response', type: 'string' },
          { name: 'status', type: 'number' },
          { name: 'response_json', type: 'json' },
        ],
        configFields: [
          { name: 'url', type: 'string', label: 'URL', default: '' },
          {
            name: 'method',
            type: 'select',
            label: 'Method',
            default: 'GET',
            options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' },
              { value: 'PATCH', label: 'PATCH' },
            ],
          },
          { name: 'headers', type: 'string', label: 'Headers (JSON)', default: '{}' },
          { name: 'body', type: 'string', label: 'Request Body', default: '' },
          { name: 'params', type: 'string', label: 'Query Parameters (JSON)', default: '{}' },
        ],
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
  // ── Web & Download ──────────────────────────
  {
    id: 'web',
    label: 'Web & Download',
    icon: 'Globe',
    color: '#0ea5e9',
    tools: [
      {
        id: 'web-crawl',
        label: 'Web Crawl',
        category: 'web',
        description: 'Crawl a website with BFS, extract content via CSS selectors',
        icon: 'Globe',
        inputs: [{ name: 'url', type: 'string', required: true }],
        outputs: [
          { name: 'pages', type: 'array', description: 'Array of crawled page objects' },
          { name: 'count', type: 'number' },
        ],
        configFields: [
          { name: 'url', type: 'string', label: 'Start URL', default: '' },
          { name: 'max_depth', type: 'number', label: 'Max Depth', default: 2 },
          { name: 'max_pages', type: 'number', label: 'Max Pages', default: 10 },
          { name: 'selector', type: 'string', label: 'CSS Selector (optional)', default: '' },
          { name: 'follow_pattern', type: 'string', label: 'Follow URL Pattern (regex)', default: '' },
        ],
      },
      {
        id: 'file-download',
        label: 'File Download',
        category: 'web',
        description: 'Download a file from URL with streaming progress',
        icon: 'Download',
        inputs: [{ name: 'url', type: 'string', required: true }],
        outputs: [
          { name: 'path', type: 'string' },
          { name: 'size_bytes', type: 'number' },
          { name: 'content_type', type: 'string' },
        ],
        configFields: [
          { name: 'url', type: 'string', label: 'Download URL', default: '' },
          { name: 'output_dir', type: 'folder', label: 'Output Directory', default: '' },
          { name: 'filename', type: 'string', label: 'Filename (auto if empty)', default: '' },
        ],
      },
    ],
  },
  // ── Archive ──────────────────────────
  {
    id: 'archive',
    label: 'Archive',
    icon: 'Archive',
    color: '#78716c',
    tools: [
      {
        id: 'archive-compress',
        label: 'Compress',
        category: 'archive',
        description: 'Create ZIP or tar.gz archive from files/folders',
        icon: 'Archive',
        inputs: [{ name: 'paths', type: 'array', required: true }],
        outputs: [{ name: 'path', type: 'string' }, { name: 'size_bytes', type: 'number' }],
        configFields: [
          { name: 'output_path', type: 'string', label: 'Output Archive Path', default: '' },
          {
            name: 'format',
            type: 'select',
            label: 'Format',
            default: 'zip',
            options: [
              { value: 'zip', label: 'ZIP' },
              { value: 'tar.gz', label: 'tar.gz' },
            ],
          },
        ],
      },
      {
        id: 'archive-decompress',
        label: 'Decompress',
        category: 'archive',
        description: 'Extract ZIP or tar.gz archive',
        icon: 'Archive',
        inputs: [{ name: 'path', type: 'string', required: true }],
        outputs: [{ name: 'output_dir', type: 'string' }, { name: 'files', type: 'array' }],
        configFields: [
          { name: 'archive_path', type: 'file', label: 'Archive File', default: '', fileFilters: [{ name: 'Archives', extensions: ['zip', 'tar.gz', 'tgz'] }] },
          { name: 'output_dir', type: 'folder', label: 'Extract To', default: '' },
        ],
      },
      {
        id: 'archive-list',
        label: 'List Archive',
        category: 'archive',
        description: 'List contents of an archive without extracting',
        icon: 'Archive',
        inputs: [{ name: 'path', type: 'string', required: true }],
        outputs: [{ name: 'entries', type: 'array' }],
        configFields: [
          { name: 'archive_path', type: 'file', label: 'Archive File', default: '', fileFilters: [{ name: 'Archives', extensions: ['zip', 'tar.gz', 'tgz'] }] },
        ],
      },
    ],
  },
  // ── Database ──────────────────────────
  {
    id: 'database',
    label: 'Database',
    icon: 'Database',
    color: '#6366f1',
    tools: [
      {
        id: 'db-query',
        label: 'DB Query',
        category: 'database',
        description: 'Execute SQL query against SQLite or PostgreSQL',
        icon: 'Database',
        inputs: [{ name: 'query', type: 'string', required: true }],
        outputs: [{ name: 'rows', type: 'array' }, { name: 'row_count', type: 'number' }],
        configFields: [
          {
            name: 'db_type',
            type: 'select',
            label: 'Database Type',
            default: 'sqlite',
            options: [
              { value: 'sqlite', label: 'SQLite' },
              { value: 'postgres', label: 'PostgreSQL' },
            ],
          },
          { name: 'connection', type: 'string', label: 'Connection (path or URL)', default: '' },
          { name: 'query', type: 'string', label: 'SQL Query', default: '' },
        ],
      },
      {
        id: 'db-schema',
        label: 'DB Schema',
        category: 'database',
        description: 'Inspect database schema (tables, columns)',
        icon: 'Database',
        inputs: [],
        outputs: [{ name: 'tables', type: 'array' }],
        configFields: [
          {
            name: 'db_type',
            type: 'select',
            label: 'Database Type',
            default: 'sqlite',
            options: [
              { value: 'sqlite', label: 'SQLite' },
              { value: 'postgres', label: 'PostgreSQL' },
            ],
          },
          { name: 'connection', type: 'string', label: 'Connection (path or URL)', default: '' },
        ],
      },
    ],
  },
  // ── System ──────────────────────────
  {
    id: 'system',
    label: 'System',
    icon: 'Terminal',
    color: '#64748b',
    tools: [
      {
        id: 'python-execute',
        label: 'Python Execute',
        category: 'system',
        description: 'Execute Python script and capture output',
        icon: 'PlayCircle',
        inputs: [{ name: 'code', type: 'string', required: true }],
        outputs: [
          { name: 'stdout', type: 'string' },
          { name: 'stderr', type: 'string' },
          { name: 'exit_code', type: 'number' },
          { name: 'files', type: 'array', description: 'Generated files as base64' },
        ],
        configFields: [
          { name: 'code', type: 'string', label: 'Python Code', default: '' },
          { name: 'timeout_ms', type: 'number', label: 'Timeout (ms)', default: 30000 },
          { name: 'capture_files', type: 'string', label: 'Capture Files Pattern', default: '', placeholder: '*.png,*.csv' },
        ],
      },
      {
        id: 'clipboard-read',
        label: 'Clipboard Read',
        category: 'system',
        description: 'Read text or image from system clipboard',
        icon: 'Clipboard',
        inputs: [],
        outputs: [{ name: 'content', type: 'string' }, { name: 'type', type: 'string' }],
        configFields: [],
      },
      {
        id: 'clipboard-write',
        label: 'Clipboard Write',
        category: 'system',
        description: 'Write text to system clipboard',
        icon: 'Clipboard',
        inputs: [{ name: 'text', type: 'string', required: true }],
        outputs: [{ name: 'success', type: 'boolean' }],
        configFields: [
          { name: 'text', type: 'string', label: 'Text to Copy', default: '' },
        ],
      },
    ],
  },
  // ── Agent System Tools ──────────────────────────
  {
    id: 'agent-tools',
    label: 'Agent Tools',
    icon: 'Bot',
    color: '#8b5cf6',
    tools: [
      {
        id: 'agent.bash-execute',
        label: 'Bash Execute',
        category: 'agent-tools',
        description: 'Execute shell commands',
        icon: 'Terminal',
        inputs: [{ name: 'command', type: 'string', required: true }],
        outputs: [{ name: 'stdout', type: 'string' }, { name: 'stderr', type: 'string' }],
        configFields: [
          { name: 'working_dir', type: 'string', label: 'Working Directory' },
          { name: 'timeout_ms', type: 'number', label: 'Timeout (ms)', default: 30000 },
        ],
      },
      {
        id: 'agent.file-read',
        label: 'File Read',
        category: 'agent-tools',
        description: 'Read file contents with line numbers',
        icon: 'FileText',
        inputs: [{ name: 'path', type: 'string', required: true }],
        outputs: [{ name: 'content', type: 'string' }],
        configFields: [
          { name: 'offset', type: 'number', label: 'Line Offset' },
          { name: 'limit', type: 'number', label: 'Line Limit', default: 2000 },
        ],
      },
      {
        id: 'agent.file-write',
        label: 'File Write',
        category: 'agent-tools',
        description: 'Write or create files',
        icon: 'Save',
        inputs: [{ name: 'path', type: 'string', required: true }, { name: 'content', type: 'string', required: true }],
        outputs: [{ name: 'result', type: 'string' }],
        configFields: [],
      },
      {
        id: 'agent.file-edit',
        label: 'File Edit',
        category: 'agent-tools',
        description: 'Find and replace in files',
        icon: 'FileCode',
        inputs: [
          { name: 'path', type: 'string', required: true },
          { name: 'old_string', type: 'string', required: true },
          { name: 'new_string', type: 'string', required: true },
        ],
        outputs: [{ name: 'result', type: 'string' }],
        configFields: [{ name: 'replace_all', type: 'boolean', label: 'Replace All', default: false }],
      },
      {
        id: 'agent.grep-search',
        label: 'Grep Search',
        category: 'agent-tools',
        description: 'Search code with regex patterns',
        icon: 'Search',
        inputs: [{ name: 'pattern', type: 'string', required: true }],
        outputs: [{ name: 'matches', type: 'array' }],
        configFields: [
          { name: 'path', type: 'string', label: 'Search Path' },
          { name: 'glob_filter', type: 'string', label: 'File Filter', placeholder: '*.ts' },
        ],
      },
      {
        id: 'agent.web-search',
        label: 'Web Search',
        category: 'agent-tools',
        description: 'Search the web for information',
        icon: 'Globe',
        inputs: [{ name: 'query', type: 'string', required: true }],
        outputs: [{ name: 'results', type: 'array' }],
        configFields: [{ name: 'max_results', type: 'number', label: 'Max Results', default: 8 }],
      },
      {
        id: 'agent.web-fetch',
        label: 'Web Fetch',
        category: 'agent-tools',
        description: 'Fetch content from a URL',
        icon: 'Download',
        inputs: [{ name: 'url', type: 'string', required: true }],
        outputs: [{ name: 'text', type: 'string' }, { name: 'title', type: 'string' }],
        configFields: [{ name: 'max_chars', type: 'number', label: 'Max Characters', default: 50000 }],
      },
      {
        id: 'agent.git-status',
        label: 'Git Status',
        category: 'agent-tools',
        description: 'Show git repository status',
        icon: 'GitBranch',
        inputs: [],
        outputs: [{ name: 'status', type: 'string' }],
        configFields: [{ name: 'path', type: 'string', label: 'Repository Path' }],
      },
      {
        id: 'agent.project-tree',
        label: 'Project Tree',
        category: 'agent-tools',
        description: 'Show directory structure',
        icon: 'FileText',
        inputs: [],
        outputs: [{ name: 'tree', type: 'string' }],
        configFields: [
          { name: 'path', type: 'string', label: 'Root Path' },
          { name: 'max_depth', type: 'number', label: 'Max Depth', default: 4 },
        ],
      },
      {
        id: 'agent-task',
        label: 'Agent Task',
        category: 'agent-tools',
        description: 'AI 에이전트 루프로 복잡한 작업 수행 (ReAct 패턴)',
        icon: 'Sparkles',
        inputs: [{ name: 'context', type: 'string', description: '에이전트에게 전달할 컨텍스트' }],
        outputs: [
          { name: 'result', type: 'string', description: '최종 답변' },
          { name: 'steps', type: 'array', description: '실행 단계들' },
        ],
        configFields: [
          { name: 'prompt', type: 'string', label: 'Task Prompt', default: '' },
          { name: 'max_iterations', type: 'number', label: 'Max Iterations', default: 10 },
          {
            name: 'mode', type: 'select' as const, label: 'Mode', default: 'auto',
            options: [
              { value: 'auto', label: 'Auto' },
              { value: 'plan', label: 'Plan Only' },
              { value: 'execute', label: 'Execute Only' },
            ],
          },
        ],
      },
    ],
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
