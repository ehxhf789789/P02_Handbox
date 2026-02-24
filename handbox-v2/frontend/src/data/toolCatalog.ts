/**
 * Built-in tool catalog for the node palette.
 * Each entry defines what nodes are available to drag onto the canvas.
 */

export interface ToolDef {
  id: string
  label: string
  category: string
  description: string
  icon: string // lucide icon name
  inputs: { name: string; type: string }[]
  outputs: { name: string; type: string }[]
  configFields: { name: string; type: string; label: string; default?: unknown }[]
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
        outputs: [{ name: 'content', type: 'string' }],
        configFields: [{ name: 'encoding', type: 'select', label: 'Encoding', default: 'utf-8' }],
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
        configFields: [{ name: 'format', type: 'select', label: 'Format', default: 'text' }],
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
          { name: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514' },
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
          { name: 'model', type: 'select', label: 'Model', default: 'claude-sonnet-4-20250514' },
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
          { name: 'model', type: 'select', label: 'Model', default: 'text-embedding-3-small' },
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
