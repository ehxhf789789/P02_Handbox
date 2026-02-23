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
import { VotingAggregatorDefinition } from './control/VotingAggregatorExecutor'

// === Agent ===
import { PersonaAgentDefinition } from './agent/PersonaAgentExecutor'

// === API ===
import { HttpRequestDefinition } from './api/HttpRequestExecutor'

// === Export ===
import { ExcelExportDefinition } from './export/ExcelExportExecutor'

// === Visualization ===
import { ResultViewerDefinition, JsonViewerDefinition } from './viz/ResultViewerExecutor'
import { ChartViewerDefinition } from './viz/ChartViewerExecutor'
import { TableViewerDefinition } from './viz/TableViewerExecutor'
import { StatsViewerDefinition } from './viz/StatsViewerExecutor'

// === Vision (NEW) ===
import { VisionAnalyzeDefinition } from './vision/VisionAnalyzeExecutor'
import { ImageGenerateDefinition } from './vision/ImageGenerateExecutor'

// === Extension Stubs (NEW) ===
import { AzureCLIDefinition, GCPCLIDefinition, CustomCLIDefinition } from './extension/CLIExtensionExecutor'

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
  VotingAggregatorDefinition,

  // Agent
  PersonaAgentDefinition,

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

  // Vision (NEW)
  VisionAnalyzeDefinition,
  ImageGenerateDefinition,

  // Extension Stubs (NEW - disabled by default)
  AzureCLIDefinition,
  GCPCLIDefinition,
  CustomCLIDefinition,
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
  'voting-aggregator': 'control.voting-aggregator',
  'vote': 'control.voting-aggregator',
  'consensus': 'control.voting-aggregator',

  // Agent
  'persona-agent': 'agent.persona',
  'expert-agent': 'agent.persona',
  'evaluator': 'agent.persona',

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

  // Vision
  'vision-analyze': 'vision.analyze',
  'image-analyze': 'vision.analyze',
  'ocr': 'vision.analyze',
  'image-generate': 'vision.generate',
  'image-gen': 'vision.generate',

  // Output (워크플로우 끝단)
  'output': 'viz.result-viewer',
  'result': 'viz.result-viewer',
  'display': 'viz.result-viewer',

  // Vector DB / RAG 검색 (미등록 타입들 → rag.retriever로 통일)
  'vector-opensearch': 'rag.retriever',
  'vector-search': 'rag.retriever',
  'vector-query': 'rag.retriever',
  'kb-query': 'rag.retriever',
  'kb-search': 'rag.retriever',
  'vector-pinecone': 'rag.retriever',
  'vector-chroma': 'rag.retriever',
  'vector-faiss': 'rag.retriever',

  // Vector DB 인제스트 → ai.embedding으로 매핑
  'kb-ingest': 'ai.embedding',
  'vector-ingest': 'ai.embedding',

  // 추가 LLM 모델 타입들
  'model-titan-text-premier': 'ai.llm-invoke',
  'model-llama-3-1-405b': 'ai.llm-invoke',
  'model-llama-3-1-70b': 'ai.llm-invoke',
  'model-mistral-large': 'ai.llm-invoke',
  'llm': 'ai.llm-invoke',
  'chat': 'ai.llm-invoke',

  // MCP 도구 → 적절한 executor로 매핑
  'text_transform': 'data.preprocess',
  'json_process': 'data.preprocess',
  'data_transform': 'data.preprocess',
  'math_calculate': 'viz.stats',
  'chart_generate': 'viz.chart',
  'http_request': 'api.http-request',
  'regex': 'data.preprocess',
  'datetime': 'data.preprocess',
  'crypto_utils': 'data.preprocess',

  // MCP RAG 도구
  'rag_ingest': 'ai.embedding',
  'rag_query': 'rag.retriever',
  'rag_generate': 'ai.llm-invoke',

  // MCP S3 도구 → storage 매핑
  's3_upload': 'storage.cloud',
  's3_download': 'storage.cloud',
  's3_list': 'storage.cloud',
  // LLM이 생성하는 S3 dotted 패턴
  's3.upload': 'storage.cloud',
  's3.download': 'storage.cloud',
  's3.list': 'storage.cloud',
  's3.list-buckets': 'storage.cloud',
  's3.get-object': 'storage.cloud',
  's3.put-object': 'storage.cloud',
  'storage.s3': 'storage.cloud',
  'storage.s3-upload': 'storage.cloud',
  'storage.s3-download': 'storage.cloud',
  // data.s3_xxx 패턴 (LLM이 자주 생성)
  'data.s3_list': 'storage.cloud',
  'data.s3_download': 'storage.cloud',
  'data.s3_upload': 'storage.cloud',
  'data.s3-list': 'storage.cloud',
  'data.s3-download': 'storage.cloud',
  'data.s3-upload': 'storage.cloud',

  // MCP KB 도구
  'kb_create': 'rag.context-builder',
  'kb_list': 'rag.retriever',
  'data.kb_create': 'rag.context-builder',  // LLM이 생성할 수 있는 패턴
  'data.kb-create': 'rag.context-builder',
  'kb-create': 'rag.context-builder',
  'kb.create': 'rag.context-builder',
  'vector_store': 'storage.local',
  'vector-store': 'storage.local',
  'data.vector_store': 'storage.local',

  // MCP 에이전트
  'agent_invoke': 'agent.persona',

  // LLM이 자주 생성하는 잘못된 노드 타입들 (dotted variants)
  'data.data_transform': 'data.preprocess',
  'data.data-transform': 'data.preprocess',
  'data.transform': 'data.preprocess',
  'data.analysis': 'viz.stats',
  'data.trend_analysis': 'viz.stats',
  'data.anomaly_detection': 'viz.stats',
  'data.prediction': 'ai.llm-invoke',
  'data.seasonality': 'viz.stats',

  // 분석 관련
  'analysis.trend': 'viz.stats',
  'analysis.product': 'viz.stats',
  'analysis.regional': 'viz.stats',
  'analysis.anomaly': 'viz.stats',
  'analysis.prediction': 'ai.llm-invoke',
  'analysis.seasonality': 'viz.stats',

  // 비전 관련 잘못된 패턴
  'vision.image-analyze': 'vision.analyze',
  'vision.ocr': 'vision.analyze',
  'image.analyze': 'vision.analyze',
  'image.ocr': 'vision.analyze',
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

  // Note: MCP 플러그인은 별도의 PluginStore/PluginToNode 시스템으로 관리됨
  // (src/plugins/PluginToNode.ts 참조)

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
  VotingAggregatorDefinition,
  // Agent
  PersonaAgentDefinition,
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
  // Vision
  VisionAnalyzeDefinition,
  ImageGenerateDefinition,
  // Extensions
  AzureCLIDefinition,
  GCPCLIDefinition,
  CustomCLIDefinition,
}
