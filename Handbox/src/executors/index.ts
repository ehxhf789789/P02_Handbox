/**
 * Executor Registry — 모든 내장 executor를 NodeRegistry에 등록
 *
 * 이 파일은 앱 초기화 시 한 번 호출된다.
 * 각 executor 파일은 NodeDefinition을 export하고,
 * 이 파일이 모아서 NodeRegistry.registerAll()로 일괄 등록한다.
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'

// === Data Loading (NEW) ===
import { DataLoaderDefinition } from './data/DataLoaderExecutor'
import { DataPreprocessDefinition } from './data/DataPreprocessExecutor'

// === Storage (NEW) ===
import { LocalStorageDefinition } from './storage/LocalStorageExecutor'
import { CloudStorageDefinition } from './storage/CloudStorageExecutor'
import { UnifiedStorageDefinition } from './storage/UnifiedStorageExecutor'

// === RAG (NEW) ===
import { RAGRetrieverDefinition } from './rag/RAGRetrieverExecutor'
import { ContextBuilderDefinition } from './rag/ContextBuilderExecutor'

// === IO (기존) ===
import { LocalFolderDefinition } from './io/LocalFolderExecutor'
import { LocalFileDefinition } from './io/LocalFileExecutor'

// === File Conversion ===
import { DocParserDefinition } from './file/DocParserExecutor'

// === Text Processing ===
import { TextSplitterDefinition } from './text/TextSplitterExecutor'

// === Prompt Engineering ===
import { PromptTemplateDefinition } from './prompt/PromptTemplateExecutor'
import { PromptAgentDefinition } from './prompt/PromptAgentExecutor'
import { FewShotDefinition } from './prompt/FewShotExecutor'
import { ChainOfThoughtDefinition } from './prompt/ChainOfThoughtExecutor'

// === AI Models ===
import { LLMInvokeDefinition } from './ai/LLMInvokeExecutor'
import { EmbeddingDefinition } from './ai/EmbeddingExecutor'

// === Control Flow ===
import { MergeDefinition } from './control/MergeExecutor'
import { ConditionalDefinition } from './control/ConditionalExecutor'
import { CliDefinition } from './control/CliExecutor'
import { ScriptDefinition } from './control/ScriptExecutor'
import { SubWorkflowDefinition } from './control/SubWorkflowExecutor'

// === API ===
import { HttpRequestDefinition } from './api/HttpRequestExecutor'

// === Export ===
import { ExcelExportDefinition } from './export/ExcelExportExecutor'

// === Visualization ===
import { ResultViewerDefinition, JsonViewerDefinition } from './viz/ResultViewerExecutor'
import { ChartViewerDefinition } from './viz/ChartViewerExecutor'
import { TableViewerDefinition } from './viz/TableViewerExecutor'
import { StatsViewerDefinition } from './viz/StatsViewerExecutor'

// === Extension Stubs (NEW) ===
import { AzureCLIDefinition, GCPCLIDefinition, CustomCLIDefinition } from './extension/CLIExtensionExecutor'

// === MCP ===
import { MCPToolDefinition } from './mcp/MCPToolExecutor'

// === MCP 동적 노드 ===
import { MCP_CATEGORIES, syncMCPToolsToRegistry, initializeMCPNodeSync } from '../adapters/mcp'

// ============================================================
// 내장 노드 정의 목록
// ============================================================

export const BUILTIN_DEFINITIONS: NodeDefinition[] = [
  // Data Loading (NEW)
  DataLoaderDefinition,
  DataPreprocessDefinition,

  // Storage (NEW)
  LocalStorageDefinition,
  CloudStorageDefinition,
  UnifiedStorageDefinition,

  // RAG (NEW)
  RAGRetrieverDefinition,
  ContextBuilderDefinition,

  // IO (기존)
  LocalFolderDefinition,
  LocalFileDefinition,

  // File Conversion
  DocParserDefinition,

  // Text
  TextSplitterDefinition,

  // Prompt (기존 + NEW)
  PromptTemplateDefinition,
  PromptAgentDefinition,
  FewShotDefinition,
  ChainOfThoughtDefinition,

  // AI
  LLMInvokeDefinition,
  EmbeddingDefinition,

  // Control
  MergeDefinition,
  ConditionalDefinition,
  CliDefinition,
  ScriptDefinition,
  SubWorkflowDefinition,

  // API
  HttpRequestDefinition,

  // Export
  ExcelExportDefinition,

  // Visualization (기존 + NEW)
  ResultViewerDefinition,
  JsonViewerDefinition,
  ChartViewerDefinition,
  TableViewerDefinition,
  StatsViewerDefinition,

  // Extension Stubs (NEW - disabled by default)
  AzureCLIDefinition,
  GCPCLIDefinition,
  CustomCLIDefinition,

  // MCP
  MCPToolDefinition,
]

// ============================================================
// 레거시 타입 → 신규 타입 매핑
// ============================================================

export const LEGACY_TYPE_MAP: Record<string, string> = {
  // IO
  'local-folder': 'io.local-folder',
  'local-file': 'io.local-file',
  'input': 'io.local-file',

  // Data (새 노드에 대한 레거시 매핑)
  'file-loader': 'data.file-loader',
  'data-preprocess': 'data.preprocess',

  // Storage
  'local-storage': 'storage.local',
  'cloud-storage': 'storage.cloud',

  // RAG
  'rag-retriever': 'rag.retriever',

  // File Conversion / Document Parsing
  'doc-pdf-parser': 'convert.doc-parser',
  'doc-hwp-parser': 'convert.doc-parser',
  'doc-txt-parser': 'convert.doc-parser',
  'doc-word-parser': 'convert.doc-parser',
  'doc-excel-parser': 'convert.doc-parser',

  // Text
  'text-splitter': 'text.splitter',

  // Prompt
  'prompt-template': 'prompt.template',
  'prompt-agent': 'prompt.agent',
  'few-shot': 'prompt.few-shot',
  'chain-of-thought': 'prompt.cot',

  // AI Models (Bedrock-specific types → generic LLM invoke)
  'model-claude-3-5-sonnet': 'ai.llm-invoke',
  'model-claude-3-opus': 'ai.llm-invoke',
  'model-claude-3-haiku': 'ai.llm-invoke',
  'custom-agent': 'ai.llm-invoke',

  // Embedding
  'embedder': 'ai.embedding',

  // Control
  'merge': 'control.merge',
  'conditional': 'control.conditional',
  'sub-workflow': 'control.sub-workflow',

  // Export
  'export-excel': 'export.excel',
  'export-pdf': 'export.pdf',
  'export-word': 'export.word',
  'export-ppt': 'export.ppt',
  'export-json': 'export.json',

  // Visualization
  'viz-result-viewer': 'viz.result-viewer',
  'viz-json-viewer': 'viz.json-viewer',
  'viz-chart': 'viz.chart',
  'viz-table': 'viz.table',
  'viz-stats': 'viz.stats',
}

// ============================================================
// 등록 함수
// ============================================================

/**
 * 모든 내장 executor를 NodeRegistry에 등록.
 * 레거시 타입도 별칭(alias)으로 등록하여 기존 워크플로우와 호환.
 */
export function registerBuiltinExecutors(): void {
  // 1. 신규 타입으로 등록
  NodeRegistry.registerAll(BUILTIN_DEFINITIONS)

  // 2. 레거시 타입 → 신규 executor 별칭 등록
  for (const [legacyType, newType] of Object.entries(LEGACY_TYPE_MAP)) {
    const definition = NodeRegistry.get(newType)
    if (definition && !NodeRegistry.get(legacyType)) {
      // 레거시 타입으로 동일 executor를 추가 등록 (타입 이름만 다름)
      NodeRegistry.register({
        ...definition,
        type: legacyType,
        meta: {
          ...definition.meta,
          tags: [...definition.meta.tags, `legacy:${legacyType}`],
        },
      })
    }
  }

  // 3. MCP 카테고리 등록
  for (const category of MCP_CATEGORIES) {
    NodeRegistry.registerCategory(category)
  }

  // 4. 기존 MCP 서버 도구 동기화 (연결된 서버가 있으면)
  syncMCPToolsToRegistry()

  // 5. MCP 서버 상태 변경 시 자동 노드 등록/해제 구독
  initializeMCPNodeSync()

  console.log(`[Executors] ${BUILTIN_DEFINITIONS.length}개 내장 노드 + ${Object.keys(LEGACY_TYPE_MAP).length}개 레거시 별칭 등록 완료`)
}

// ============================================================
// Re-exports
// ============================================================

export {
  // Data
  DataLoaderDefinition,
  DataPreprocessDefinition,
  // Storage
  LocalStorageDefinition,
  CloudStorageDefinition,
  UnifiedStorageDefinition,
  // RAG
  RAGRetrieverDefinition,
  ContextBuilderDefinition,
  // IO
  LocalFolderDefinition,
  LocalFileDefinition,
  // File
  DocParserDefinition,
  // Text
  TextSplitterDefinition,
  // Prompt
  PromptTemplateDefinition,
  PromptAgentDefinition,
  FewShotDefinition,
  ChainOfThoughtDefinition,
  // AI
  LLMInvokeDefinition,
  EmbeddingDefinition,
  // Control
  MergeDefinition,
  ConditionalDefinition,
  CliDefinition,
  ScriptDefinition,
  SubWorkflowDefinition,
  // API
  HttpRequestDefinition,
  // Export
  ExcelExportDefinition,
  // Visualization
  ResultViewerDefinition,
  JsonViewerDefinition,
  ChartViewerDefinition,
  TableViewerDefinition,
  StatsViewerDefinition,
  // Extensions
  AzureCLIDefinition,
  GCPCLIDefinition,
  CustomCLIDefinition,
  // MCP
  MCPToolDefinition,
}

// MCP 관련 유틸리티 re-export
export { syncMCPToolsToRegistry, initializeMCPNodeSync, MCP_CATEGORIES } from '../adapters/mcp'
export { getMCPServerOptions, getMCPToolOptions } from './mcp/MCPToolExecutor'
