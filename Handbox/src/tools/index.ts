/**
 * Tier 1 도구 등록 — 모든 내장 도구 노드를 NodeRegistry에 등록
 *
 * 72개 노드를 14개 카테고리로 조직:
 * - IO (5): file.read, file.write, file.list, file.info, http.request
 * - Transform (9): json.query, json.parse, json.stringify, csv.parse, csv.stringify,
 *                   text.split, text.regex, text.template, xml.parse
 * - Storage (8): kv.get/set/delete/list, vector.store/search/hybrid, sqlite.query
 * - Doc (2): doc.parse, doc.convert
 * - Process (2): shell.exec, code.eval
 * - Control (10): if, switch, loop, forEach, while, merge, split, gate, variable.get/set
 * - Variable (2): constant, input
 * - Debug (3): log, inspect, breakpoint
 * - Viz (5): table, chart, json, text, stats
 * - LLM (6): llm.chat, llm.embed, llm.structured, prompt.template, prompt.fewshot, prompt.chain
 * - Vision (4): vision.analyze, vision.compare, vision.extract, vision.ocr-advanced
 * - VLM (4): vlm.experiment, vlm.benchmark, vlm.prompt-optimizer, vlm.dataset-builder
 * - Agent (4): agent.react, agent.tool-use, agent.multi, agent.planner
 * - ML (4): ml.classify, ml.cluster, ml.regression, ml.feature-engineering
 * - Export (4): export.docx, export.pptx, export.pdf, export.xlsx
 */

import { NodeRegistry } from '../registry/NodeRegistry'
import type { NodeDefinition } from '../registry/NodeDefinition'

import { IO_DEFINITIONS } from './io.tools'
import { TRANSFORM_DEFINITIONS } from './transform.tools'
import { STORAGE_DEFINITIONS } from './storage.tools'
import { DOC_DEFINITIONS } from './doc.tools'
import { PROCESS_DEFINITIONS } from './process.tools'
import { CONTROL_DEFINITIONS } from './control.tools'
import { VARIABLE_DEFINITIONS } from './variable.tools'
import { DEBUG_DEFINITIONS } from './debug.tools'
import { VIZ_DEFINITIONS } from './viz.tools'
import { LLM_DEFINITIONS } from './llm.tools'
import { VISION_DEFINITIONS } from './vision.tools'
import { VLM_DEFINITIONS } from './vlm.tools'
import { AGENT_DEFINITIONS } from './agent.tools'
import { ML_DEFINITIONS } from './ml.tools'
import { EXPORT_DEFINITIONS } from './export.tools'

// ============================================================
// Tier 1 도구 카테고리 정의
// ============================================================

export const TIER1_CATEGORIES = [
  // Core Data Pipeline
  { id: 'io',        label: 'IO',            icon: 'FolderOpen',    order: 10, defaultExpanded: true },
  { id: 'transform', label: 'Transform',     icon: 'Transform',     order: 11, defaultExpanded: true },
  { id: 'storage',   label: 'Storage',       icon: 'Storage',       order: 12, defaultExpanded: true },
  { id: 'doc',       label: 'Document',      icon: 'Description',   order: 13, defaultExpanded: true },
  { id: 'process',   label: 'Process',       icon: 'Terminal',      order: 14, defaultExpanded: false },
  { id: 'control',   label: 'Control',       icon: 'AccountTree',   order: 15, defaultExpanded: true },
  { id: 'data',      label: 'Data',          icon: 'DataObject',    order: 16, defaultExpanded: true },
  { id: 'debug',     label: 'Debug',         icon: 'BugReport',     order: 17, defaultExpanded: false },
  { id: 'viz',       label: 'Visualization', icon: 'BarChart',      order: 18, defaultExpanded: true },
  // AI & ML
  { id: 'llm',       label: 'LLM',           icon: 'Psychology',    order: 19, defaultExpanded: true },
  { id: 'ai',        label: 'AI/Vision/Agent', icon: 'AutoAwesome', order: 20, defaultExpanded: true },
  // Export
  { id: 'export',    label: 'Export',        icon: 'Download',      order: 21, defaultExpanded: true },
]

// ============================================================
// 전체 도구 정의 목록
// ============================================================

export const TIER1_DEFINITIONS: NodeDefinition[] = [
  ...IO_DEFINITIONS,
  ...TRANSFORM_DEFINITIONS,
  ...STORAGE_DEFINITIONS,
  ...DOC_DEFINITIONS,
  ...PROCESS_DEFINITIONS,
  ...CONTROL_DEFINITIONS,
  ...VARIABLE_DEFINITIONS,
  ...DEBUG_DEFINITIONS,
  ...VIZ_DEFINITIONS,
  ...LLM_DEFINITIONS,
  ...VISION_DEFINITIONS,
  ...VLM_DEFINITIONS,
  ...AGENT_DEFINITIONS,
  ...ML_DEFINITIONS,
  ...EXPORT_DEFINITIONS,
]

// ============================================================
// 등록 함수
// ============================================================

/**
 * 모든 Tier 1 도구를 NodeRegistry에 등록합니다.
 * main.tsx의 초기화 과정에서 호출됩니다.
 */
export function registerAllTools(): void {
  // 카테고리 등록
  for (const category of TIER1_CATEGORIES) {
    NodeRegistry.registerCategory(category)
  }

  // 도구 노드 등록
  NodeRegistry.registerAll(TIER1_DEFINITIONS)

  console.log(`[Tools] Tier 1 도구 ${TIER1_DEFINITIONS.length}개 등록 완료 (${TIER1_CATEGORIES.length}개 카테고리)`)
}

// ============================================================
// Re-exports
// ============================================================

export { IO_DEFINITIONS } from './io.tools'
export { TRANSFORM_DEFINITIONS } from './transform.tools'
export { STORAGE_DEFINITIONS } from './storage.tools'
export { DOC_DEFINITIONS } from './doc.tools'
export { PROCESS_DEFINITIONS } from './process.tools'
export { CONTROL_DEFINITIONS } from './control.tools'
export { VARIABLE_DEFINITIONS } from './variable.tools'
export { DEBUG_DEFINITIONS } from './debug.tools'
export { VIZ_DEFINITIONS } from './viz.tools'
export { LLM_DEFINITIONS } from './llm.tools'
export { VISION_DEFINITIONS } from './vision.tools'
export { VLM_DEFINITIONS } from './vlm.tools'
export { AGENT_DEFINITIONS } from './agent.tools'
export { ML_DEFINITIONS } from './ml.tools'
export { EXPORT_DEFINITIONS } from './export.tools'
