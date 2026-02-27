/**
 * 통합 도구 레지스트리 — 144+ 원자화 도구
 *
 * 17개 카테고리:
 * - file (12): 파일 읽기/쓰기/복사/삭제 등
 * - text (14): 텍스트 분할/결합/변환 등
 * - json (10): JSON 파싱/쿼리/변환 등
 * - csv (6): CSV 파싱/생성/변환 등
 * - xml (4): XML 파싱/생성/쿼리/변환
 * - http (8): HTTP 요청/다운로드/업로드
 * - storage (12): KV 저장소, 벡터 DB, SQLite, S3
 * - doc (10): 문서 파싱/변환/OCR
 * - llm (10): LLM 채팅/임베딩/구조화 출력
 * - prompt (8): 프롬프트 템플릿/Few-shot/체이닝
 * - rag (8): 문서 인제스트/검색/생성
 * - vision (8): 이미지 분석/OCR/비교
 * - agent (8): ReAct/Tool-Use/멀티 에이전트
 * - control (12): 조건문/반복문/병렬 처리
 * - variable (6): 변수 관리/상수
 * - viz (8): 테이블/차트/통계 시각화
 * - export (10): XLSX/PDF/DOCX/PPTX 생성
 */

import { ToolRegistry, TOOL_CATEGORIES } from '../registry/ToolRegistry'
import type { UnifiedToolDefinition, CategoryDefinition } from '../registry/UnifiedToolDefinition'

// ============================================================================
// 도구 정의 임포트
// ============================================================================

import { FILE_TOOLS } from './file.tools'
import { TEXT_TOOLS } from './text.tools'
import { JSON_TOOLS } from './json.tools'
import { CSV_TOOLS } from './csv.tools'
import { XML_TOOLS } from './xml.tools'
import { HTTP_TOOLS } from './http.tools'
import { STORAGE_TOOLS } from './storage.tools'
import { DOC_TOOLS } from './doc.tools'
import { LLM_TOOLS } from './llm.tools'
import { PROMPT_TOOLS } from './prompt.tools'
import { RAG_TOOLS } from './rag.tools'
import { VISION_TOOLS } from './vision.tools'
import { AGENT_TOOLS } from './agent.tools'
import { CONTROL_TOOLS } from './control.tools'
import { VARIABLE_TOOLS } from './variable.tools'
import { VIZ_TOOLS } from './viz.tools'
import { EXPORT_TOOLS } from './export.tools'

// ============================================================================
// 전체 도구 목록
// ============================================================================

export const ALL_TOOLS: UnifiedToolDefinition[] = [
  ...FILE_TOOLS,       // 12개
  ...TEXT_TOOLS,       // 14개
  ...JSON_TOOLS,       // 10개
  ...CSV_TOOLS,        // 6개
  ...XML_TOOLS,        // 4개
  ...HTTP_TOOLS,       // 8개
  ...STORAGE_TOOLS,    // 12개
  ...DOC_TOOLS,        // 10개
  ...LLM_TOOLS,        // 10개
  ...PROMPT_TOOLS,     // 8개
  ...RAG_TOOLS,        // 8개
  ...VISION_TOOLS,     // 8개
  ...AGENT_TOOLS,      // 8개
  ...CONTROL_TOOLS,    // 12개
  ...VARIABLE_TOOLS,   // 6개
  ...VIZ_TOOLS,        // 8개
  ...EXPORT_TOOLS,     // 10개
]

// ============================================================================
// 카테고리 정의
// ============================================================================

export const UNIFIED_CATEGORIES: CategoryDefinition[] = [
  // Core Data
  { id: 'file', label: '파일', icon: 'FolderOpen', color: '#3b82f6', order: 10 },
  { id: 'text', label: '텍스트', icon: 'TextFields', color: '#10b981', order: 11 },
  { id: 'json', label: 'JSON', icon: 'DataObject', color: '#f59e0b', order: 12 },
  { id: 'csv', label: 'CSV', icon: 'TableChart', color: '#22c55e', order: 13 },
  { id: 'xml', label: 'XML', icon: 'Code', color: '#f97316', order: 14 },
  { id: 'http', label: 'HTTP', icon: 'Http', color: '#06b6d4', order: 15 },
  { id: 'storage', label: '저장소', icon: 'Storage', color: '#f59e0b', order: 16 },
  { id: 'doc', label: '문서', icon: 'Description', color: '#10b981', order: 17 },

  // AI & ML
  { id: 'llm', label: 'LLM', icon: 'Psychology', color: '#8b5cf6', order: 20 },
  { id: 'prompt', label: '프롬프트', icon: 'EditNote', color: '#a855f7', order: 21 },
  { id: 'rag', label: 'RAG', icon: 'AutoAwesome', color: '#06b6d4', order: 22 },
  { id: 'vision', label: '비전', icon: 'ImageSearch', color: '#8b5cf6', order: 23 },
  { id: 'agent', label: '에이전트', icon: 'SmartToy', color: '#f97316', order: 24 },

  // Control Flow
  { id: 'control', label: '제어', icon: 'AccountTree', color: '#64748b', order: 30 },
  { id: 'variable', label: '변수', icon: 'DataObject', color: '#64748b', order: 31 },

  // Output
  { id: 'viz', label: '시각화', icon: 'BarChart', color: '#ec4899', order: 40 },
  { id: 'export', label: '내보내기', icon: 'Download', color: '#16a34a', order: 41 },
]

// ============================================================================
// 등록 함수
// ============================================================================

let _initialized = false

/**
 * 모든 도구를 ToolRegistry에 등록합니다.
 * main.tsx의 초기화 과정에서 한 번만 호출됩니다.
 */
export function initializeTools(): void {
  if (_initialized) {
    console.log('[Tools] 이미 초기화됨')
    return
  }

  // 카테고리 등록
  for (const category of UNIFIED_CATEGORIES) {
    ToolRegistry.registerCategory(category)
  }

  // 도구 등록
  ToolRegistry.registerAll(ALL_TOOLS)

  // 레거시 별칭 등록
  import('../registry/legacyAliases').then(({ registerLegacyAliases }) => {
    registerLegacyAliases()
  })

  _initialized = true

  console.log(`[Tools] 초기화 완료: ${ALL_TOOLS.length}개 도구, ${UNIFIED_CATEGORIES.length}개 카테고리`)
}

/**
 * 도구 수 통계를 반환합니다.
 */
export function getToolStats(): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {}
  for (const tool of ALL_TOOLS) {
    const cat = tool.meta.category
    byCategory[cat] = (byCategory[cat] || 0) + 1
  }
  return { total: ALL_TOOLS.length, byCategory }
}

// ============================================================================
// Re-exports
// ============================================================================

export { FILE_TOOLS } from './file.tools'
export { TEXT_TOOLS } from './text.tools'
export { JSON_TOOLS } from './json.tools'
export { CSV_TOOLS } from './csv.tools'
export { XML_TOOLS } from './xml.tools'
export { HTTP_TOOLS } from './http.tools'
export { STORAGE_TOOLS } from './storage.tools'
export { DOC_TOOLS } from './doc.tools'
export { LLM_TOOLS } from './llm.tools'
export { PROMPT_TOOLS } from './prompt.tools'
export { RAG_TOOLS } from './rag.tools'
export { VISION_TOOLS } from './vision.tools'
export { AGENT_TOOLS } from './agent.tools'
export { CONTROL_TOOLS } from './control.tools'
export { VARIABLE_TOOLS } from './variable.tools'
export { VIZ_TOOLS } from './viz.tools'
export { EXPORT_TOOLS } from './export.tools'

// Legacy compatibility exports
export { STORAGE_TOOLS as STORAGE_DEFINITIONS } from './storage.tools'
export { DOC_TOOLS as DOC_DEFINITIONS } from './doc.tools'
export { VARIABLE_TOOLS as VARIABLE_DEFINITIONS } from './variable.tools'
export { EXPORT_TOOLS as EXPORT_DEFINITIONS } from './export.tools'
export { VIZ_TOOLS as VIZ_DEFINITIONS } from './viz.tools'
export { VISION_TOOLS as VISION_DEFINITIONS } from './vision.tools'
export { AGENT_TOOLS as AGENT_DEFINITIONS } from './agent.tools'
export { CONTROL_TOOLS as CONTROL_DEFINITIONS } from './control.tools'
export { LLM_TOOLS as LLM_DEFINITIONS } from './llm.tools'

// Legacy TIER1 compatibility
export const TIER1_DEFINITIONS = ALL_TOOLS
export const TIER1_CATEGORIES = UNIFIED_CATEGORIES
export const registerAllTools = initializeTools
