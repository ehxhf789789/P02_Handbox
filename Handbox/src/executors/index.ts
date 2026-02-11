/**
 * Executor Registry — 모든 내장 executor를 NodeRegistry에 등록
 *
 * 이 파일은 앱 초기화 시 한 번 호출된다.
 * 각 executor 파일은 NodeDefinition을 export하고,
 * 이 파일이 모아서 NodeRegistry.registerAll()로 일괄 등록한다.
 *
 * 레거시 노드 타입(workflowStore.ts에서 사용하던 타입)과
 * 새 타입(type: 'io.local-folder' 등)의 매핑도 제공한다.
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'

// === IO ===
import { LocalFolderDefinition } from './io/LocalFolderExecutor'
import { LocalFileDefinition } from './io/LocalFileExecutor'

// === File Conversion ===
import { DocParserDefinition } from './file/DocParserExecutor'

// === Text Processing ===
import { TextSplitterDefinition } from './text/TextSplitterExecutor'

// === Prompt Engineering ===
import { PromptTemplateDefinition } from './prompt/PromptTemplateExecutor'

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

// ============================================================
// 내장 노드 정의 목록
// ============================================================

export const BUILTIN_DEFINITIONS: NodeDefinition[] = [
  // IO
  LocalFolderDefinition,
  LocalFileDefinition,
  // File Conversion
  DocParserDefinition,
  // Text
  TextSplitterDefinition,
  // Prompt
  PromptTemplateDefinition,
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
]

// ============================================================
// 레거시 타입 → 신규 타입 매핑
// workflowStore.ts의 기존 노드 타입을 새 레지스트리 타입으로 연결
// ============================================================

export const LEGACY_TYPE_MAP: Record<string, string> = {
  // IO
  'local-folder':     'io.local-folder',
  'local-file':       'io.local-file',
  'input':            'io.local-file',

  // File Conversion / Document Parsing
  'doc-pdf-parser':   'convert.doc-parser',
  'doc-hwp-parser':   'convert.doc-parser',
  'doc-txt-parser':   'convert.doc-parser',
  'doc-word-parser':  'convert.doc-parser',
  'doc-excel-parser': 'convert.doc-parser',

  // Text
  'text-splitter':    'text.splitter',

  // Prompt
  'prompt-template':  'prompt.template',

  // AI Models (Bedrock-specific types → generic LLM invoke)
  'model-claude-3-5-sonnet': 'ai.llm-invoke',
  'model-claude-3-opus':     'ai.llm-invoke',
  'model-claude-3-haiku':    'ai.llm-invoke',
  'custom-agent':            'ai.llm-invoke',

  // Embedding
  'embedder':         'ai.embedding',

  // Control
  'merge':            'control.merge',
  'conditional':      'control.conditional',
  'sub-workflow':     'control.sub-workflow',

  // Export
  'export-excel':     'export.excel',
  'export-pdf':       'export.pdf',
  'export-word':      'export.word',
  'export-ppt':       'export.ppt',
  'export-json':      'export.json',

  // Visualization
  'viz-result-viewer': 'viz.result-viewer',
  'viz-json-viewer':   'viz.json-viewer',
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

  console.log(`[Executors] ${BUILTIN_DEFINITIONS.length}개 내장 노드 + ${Object.keys(LEGACY_TYPE_MAP).length}개 레거시 별칭 등록 완료`)
}

// ============================================================
// Re-exports
// ============================================================

export {
  LocalFolderDefinition,
  LocalFileDefinition,
  DocParserDefinition,
  TextSplitterDefinition,
  PromptTemplateDefinition,
  LLMInvokeDefinition,
  EmbeddingDefinition,
  MergeDefinition,
  ConditionalDefinition,
  CliDefinition,
  ScriptDefinition,
  SubWorkflowDefinition,
  HttpRequestDefinition,
  ExcelExportDefinition,
  ResultViewerDefinition,
  JsonViewerDefinition,
}
