/**
 * Legacy Aliases - 레거시 노드 타입 → 새 도구 이름 매핑
 *
 * 기존 워크플로우와의 호환성을 위해 레거시 노드 타입을 새 도구 이름으로 변환합니다.
 * 점진적으로 제거될 예정이며, 새 워크플로우에서는 새 도구 이름을 직접 사용해야 합니다.
 */

import { ToolRegistry } from './ToolRegistry'

// ============================================================
// Legacy Aliases Mapping
// ============================================================

/**
 * 레거시 노드 타입 → 새 도구 이름 매핑
 *
 * 형식: 'legacy.type': 'new.type'
 */
export const LEGACY_ALIASES: Record<string, string> = {
  // ============================================================
  // IO → file / http
  // ============================================================
  'io.local-folder': 'file.list',
  'io.local-file': 'file.read',
  'io.file-read': 'file.read',
  'io.file-write': 'file.write',
  'io.file-list': 'file.list',
  'io.file-info': 'file.info',
  'io.http-request': 'http.get',
  'local-folder': 'file.list',
  'local-file': 'file.read',
  'input': 'file.read',
  'file-read': 'file.read',
  'file-write': 'file.write',

  // ============================================================
  // Data → file
  // ============================================================
  'data.file-loader': 'file.read',
  'data.preprocess': 'text.replace',
  'file-loader': 'file.read',
  'data-preprocess': 'text.replace',

  // ============================================================
  // Storage
  // ============================================================
  'storage.local': 'storage.kv-set',
  'storage.cloud': 'storage.s3-put',
  'storage.unified': 'storage.kv-set',
  'local-storage': 'storage.kv-set',
  'cloud-storage': 'storage.s3-put',

  // ============================================================
  // Transform → text / json / csv / xml
  // ============================================================
  'transform.json-query': 'json.query',
  'transform.json-parse': 'json.parse',
  'transform.json-stringify': 'json.stringify',
  'transform.csv-parse': 'csv.parse',
  'transform.csv-stringify': 'csv.stringify',
  'transform.text-split': 'text.split',
  'transform.text-regex': 'text.regex-match',
  'transform.text-template': 'text.template',
  'transform.xml-parse': 'xml.parse',
  'json-query': 'json.query',
  'json-parse': 'json.parse',
  'csv-parse': 'csv.parse',
  'text-split': 'text.split',

  // ============================================================
  // Document → doc
  // ============================================================
  'convert.doc-parser': 'doc.pdf-parse',
  'doc.parse': 'doc.pdf-parse',
  'doc.convert': 'doc.pdf-parse',
  'doc-pdf-parser': 'doc.pdf-parse',
  'doc-hwp-parser': 'doc.hwp-parse',
  'doc-word-parser': 'doc.docx-parse',
  'doc-excel-parser': 'doc.xlsx-parse',
  'doc-txt-parser': 'file.read',

  // ============================================================
  // Text
  // ============================================================
  'text.splitter': 'text.split',
  'text-splitter': 'text.split',

  // ============================================================
  // AI → llm
  // ============================================================
  'ai.llm-invoke': 'llm.chat',
  'ai.embedding': 'llm.embed',
  'llm-invoke': 'llm.chat',
  'llm': 'llm.chat',
  'chat': 'llm.chat',
  'embedder': 'llm.embed',

  // LLM 모델 별칭
  'model-claude-3-5-sonnet': 'llm.chat',
  'model-claude-3-opus': 'llm.chat',
  'model-claude-3-haiku': 'llm.chat',
  'model-titan-text-premier': 'llm.chat',
  'model-llama-3-1-405b': 'llm.chat',
  'model-llama-3-1-70b': 'llm.chat',
  'model-mistral-large': 'llm.chat',

  // ============================================================
  // Prompt
  // ============================================================
  'prompt.template': 'prompt.template',
  'prompt.agent': 'prompt.persona',
  'prompt.few-shot': 'prompt.fewshot',
  'prompt.cot': 'prompt.chain',
  'prompt-template': 'prompt.template',
  'prompt-agent': 'prompt.persona',
  'few-shot': 'prompt.fewshot',
  'chain-of-thought': 'prompt.chain',

  // ============================================================
  // RAG
  // ============================================================
  'rag.retriever': 'rag.search',
  'rag.context-builder': 'rag.generate',
  'rag-retriever': 'rag.search',
  'rag_ingest': 'rag.ingest',
  'rag_query': 'rag.search',
  'rag_generate': 'rag.generate',
  'vector-search': 'rag.search',
  'vector-query': 'rag.search',
  'kb-query': 'rag.search',
  'kb-search': 'rag.search',
  'kb-ingest': 'rag.ingest',
  'vector-ingest': 'rag.ingest',
  'vector-opensearch': 'rag.search',
  'vector-pinecone': 'rag.search',
  'vector-chroma': 'rag.search',
  'vector-faiss': 'rag.search',
  'kb_create': 'rag.ingest',
  'kb_list': 'rag.search',

  // ============================================================
  // Vision
  // ============================================================
  'vision.analyze': 'vision.analyze',
  'vision.generate': 'vision.generate',
  'vision-analyze': 'vision.analyze',
  'image-analyze': 'vision.analyze',
  'vision.ocr': 'vision.ocr',
  'vision.image-analyze': 'vision.analyze',
  'image.analyze': 'vision.analyze',
  'image.ocr': 'vision.ocr',
  'ocr': 'vision.ocr',
  'image-generate': 'vision.generate',
  'image-gen': 'vision.generate',
  'vision_analyze': 'vision.analyze',
  'image_generate': 'vision.generate',

  // ============================================================
  // Agent
  // ============================================================
  'agent.persona': 'agent.react',
  'agent.react': 'agent.react',
  'agent.tool-use': 'agent.tool-use',
  'agent.multi': 'agent.multi',
  'agent.planner': 'agent.plan',
  'persona-agent': 'agent.react',
  'expert-agent': 'agent.react',
  'evaluator': 'agent.react',
  'custom-agent': 'agent.react',
  'agent_invoke': 'agent.react',

  // ============================================================
  // Control
  // ============================================================
  'control.merge': 'control.merge',
  'control.conditional': 'control.if',
  'control.cli': 'control.loop',
  'control.script': 'control.loop',
  'control.sub-workflow': 'control.loop',
  'control.voting-aggregator': 'control.merge',
  'merge': 'control.merge',
  'conditional': 'control.if',
  'sub-workflow': 'control.loop',
  'voting-aggregator': 'control.merge',
  'vote': 'control.merge',
  'consensus': 'control.merge',

  // ============================================================
  // API → http
  // ============================================================
  'api.http-request': 'http.get',
  'http-request': 'http.get',
  'http_request': 'http.get',

  // ============================================================
  // Export
  // ============================================================
  'export.excel': 'export.xlsx',
  'export.pdf': 'export.pdf',
  'export.word': 'export.docx',
  'export.ppt': 'export.pptx',
  'export.json': 'export.json',
  'export-excel': 'export.xlsx',
  'export-pdf': 'export.pdf',
  'export-word': 'export.docx',
  'export-ppt': 'export.pptx',
  'export-json': 'export.json',

  // ============================================================
  // Visualization → viz
  // ============================================================
  'viz.result-viewer': 'viz.text',
  'viz.json-viewer': 'viz.json',
  'viz.chart': 'viz.chart',
  'viz.table': 'viz.table',
  'viz.stats': 'viz.stats',
  'viz-result-viewer': 'viz.text',
  'viz-json-viewer': 'viz.json',
  'viz-chart': 'viz.chart',
  'viz-table': 'viz.table',
  'viz-stats': 'viz.stats',
  'output': 'viz.text',
  'result': 'viz.text',
  'display': 'viz.text',
  'result_view': 'viz.text',
  'result_display': 'viz.text',
  'display_results': 'viz.text',

  // ============================================================
  // MCP 도구 (underscore 스타일)
  // ============================================================
  'text_transform': 'text.case',
  'json_process': 'json.parse',
  'math_calculate': 'viz.stats',
  'chart_generate': 'viz.chart',
  'file_read': 'file.read',
  'regex': 'text.regex-match',
  'datetime': 'variable.set',
  'crypto_utils': 'text.encode',
  'data_transform': 'json.parse',
  's3_upload': 'storage.s3-put',
  's3_download': 'storage.s3-get',
  's3_list': 'storage.s3-list',

  // ============================================================
  // S3 dotted 패턴
  // ============================================================
  's3.upload': 'storage.s3-put',
  's3.download': 'storage.s3-get',
  's3.list': 'storage.s3-list',
  's3.list-buckets': 'storage.s3-list',
  's3.get-object': 'storage.s3-get',
  's3.put-object': 'storage.s3-put',
  'storage.s3': 'storage.s3-list',
  'storage.s3-upload': 'storage.s3-put',
  'storage.s3-download': 'storage.s3-get',
  'data.s3_list': 'storage.s3-list',
  'data.s3_download': 'storage.s3-get',
  'data.s3_upload': 'storage.s3-put',
  'data.s3-list': 'storage.s3-list',
  'data.s3-download': 'storage.s3-get',
  'data.s3-upload': 'storage.s3-put',

  // ============================================================
  // LLM이 생성하는 잘못된 패턴
  // ============================================================
  'data.data_transform': 'json.parse',
  'data.data-transform': 'json.parse',
  'data.transform': 'json.parse',
  'data.analysis': 'viz.stats',
  'data.trend_analysis': 'viz.stats',
  'data.anomaly_detection': 'viz.stats',
  'data.prediction': 'llm.chat',
  'data.seasonality': 'viz.stats',
  'analysis.trend': 'viz.stats',
  'analysis.product': 'viz.stats',
  'analysis.regional': 'viz.stats',
  'analysis.anomaly': 'viz.stats',
  'analysis.prediction': 'llm.chat',
  'analysis.seasonality': 'viz.stats',

  // ============================================================
  // 카테고리 없는 짧은 이름 (환각 방지)
  // ============================================================
  'retriever': 'rag.search',
  'preprocess': 'text.replace',
  'analyze': 'llm.chat',
  'result_viewer': 'viz.text',
  'text_preprocessing': 'text.replace',
  'vector_search': 'rag.search',
  'document_parser': 'doc.pdf-parse',
  'llm_invoke': 'llm.chat',
  'data_analyzer': 'viz.stats',
  'text_processor': 'text.replace',
  'search_docs': 'rag.search',
  'image_analysis': 'vision.analyze',
  'context_retriever': 'rag.search',
  'text_merger': 'control.merge',
}

// ============================================================
// Registration Function
// ============================================================

/**
 * 모든 레거시 별칭을 ToolRegistry에 등록
 */
export function registerLegacyAliases(): void {
  ToolRegistry.registerAliases(LEGACY_ALIASES)
  console.log(`[LegacyAliases] ${Object.keys(LEGACY_ALIASES).length}개 별칭 등록 완료`)
}

// ============================================================
// Migration Utilities
// ============================================================

/**
 * 레거시 타입을 새 타입으로 변환
 * @param legacyType 레거시 노드 타입
 * @returns 새 도구 이름 또는 원본 (매핑 없으면)
 */
export function migrateLegacyType(legacyType: string): string {
  return LEGACY_ALIASES[legacyType] || legacyType
}

/**
 * 워크플로우의 모든 노드 타입 마이그레이션
 */
export function migrateWorkflowTypes(nodes: Array<{ type: string; [key: string]: unknown }>): Array<{ type: string; [key: string]: unknown }> {
  return nodes.map(node => ({
    ...node,
    type: migrateLegacyType(node.type),
    _migratedFrom: LEGACY_ALIASES[node.type] ? node.type : undefined,
  }))
}

/**
 * 타입이 레거시인지 확인
 */
export function isLegacyType(type: string): boolean {
  return type in LEGACY_ALIASES
}

/**
 * 레거시 타입 사용 경고 출력
 */
export function warnLegacyUsage(legacyType: string): void {
  const newType = LEGACY_ALIASES[legacyType]
  if (newType) {
    console.warn(`[Deprecation] '${legacyType}'는 레거시 타입입니다. '${newType}'를 사용하세요.`)
  }
}
