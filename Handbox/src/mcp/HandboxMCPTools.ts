/**
 * Handbox MCP 도구 정의
 *
 * Handbox의 핵심 기능을 MCP 도구로 노출합니다.
 * 외부 MCP 클라이언트(Claude Code 등)에서 Handbox 기능을 호출할 수 있습니다.
 *
 * 도구 카테고리:
 * - workflow: 워크플로우 관리 및 실행
 * - persona: 페르소나 관리 및 평가
 * - knowledge: 지식베이스 및 벡터 검색
 * - storage: 로컬 데이터 저장소
 */

import { invoke } from '@tauri-apps/api/tauri'
import type { WorkflowFile } from '../types/WorkflowFile'
import type { PersonaDefinition } from '../types/PersonaTypes'
import {
  listPersonas,
  loadPersona,
  searchPersonas,
  composeEvaluationPanel,
} from '../services/PersonaService'

// ============================================================
// MCP 도구 스키마 정의
// ============================================================

export interface MCPToolSchema {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: string[]
      items?: any
      default?: any
    }>
    required?: string[]
  }
}

export interface MCPToolResult {
  success: boolean
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

// ============================================================
// Handbox MCP 도구 목록
// ============================================================

export const HANDBOX_MCP_TOOLS: MCPToolSchema[] = [
  // ── 워크플로우 도구 ──
  {
    name: 'handbox_workflow_list',
    description: 'Handbox에 저장된 워크플로우 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '최대 조회 개수', default: 20 },
      },
    },
  },
  {
    name: 'handbox_workflow_load',
    description: '특정 워크플로우를 불러옵니다.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: '워크플로우 ID' },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'handbox_workflow_execute',
    description: '워크플로우를 실행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_id: { type: 'string', description: '워크플로우 ID' },
        inputs: { type: 'object', description: '워크플로우 입력값' },
      },
      required: ['workflow_id'],
    },
  },
  {
    name: 'handbox_workflow_analyze',
    description: '워크플로우 JSON을 분석하여 구조, 잠재적 문제점, 개선 제안을 제공합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow_json: { type: 'string', description: '워크플로우 JSON 문자열' },
        analysis_type: {
          type: 'string',
          enum: ['analyze', 'improve'],
          description: '분석 유형 (analyze: 분석만, improve: 개선 제안 포함)',
          default: 'analyze',
        },
      },
      required: ['workflow_json'],
    },
  },

  // ── 페르소나 도구 ──
  {
    name: 'handbox_persona_list',
    description: '등록된 AI 전문가 페르소나 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['engineering', 'economics', 'legal', 'environment', 'policy', 'quality', 'innovation', 'custom'],
          description: '페르소나 카테고리 필터',
        },
        active_only: { type: 'boolean', description: '활성 페르소나만 조회', default: true },
      },
    },
  },
  {
    name: 'handbox_persona_get',
    description: '특정 페르소나의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        persona_id: { type: 'string', description: '페르소나 ID' },
      },
      required: ['persona_id'],
    },
  },
  {
    name: 'handbox_persona_search',
    description: '조건에 맞는 페르소나를 검색합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (이름, 직함, 도메인)' },
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: '도메인 필터 목록',
        },
        limit: { type: 'number', description: '최대 결과 수', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'handbox_persona_compose_panel',
    description: '특정 도메인들에 대한 균형 잡힌 평가 위원회를 구성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: '필요한 전문 도메인 목록',
        },
        panel_size: { type: 'number', description: '위원회 인원 수', default: 5 },
      },
      required: ['domains'],
    },
  },
  {
    name: 'handbox_persona_evaluate',
    description: '페르소나 에이전트가 주어진 내용을 평가합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        persona_id: { type: 'string', description: '평가자 페르소나 ID' },
        content: { type: 'string', description: '평가 대상 내용' },
        criteria: {
          type: 'array',
          items: { type: 'string' },
          description: '평가 기준 목록',
        },
        xai_enabled: { type: 'boolean', description: 'XAI(설명 가능한 AI) 활성화', default: true },
      },
      required: ['persona_id', 'content'],
    },
  },

  // ── 지식베이스 도구 ──
  {
    name: 'handbox_kb_search',
    description: '로컬 벡터 스토어에서 유사 문서를 검색합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        index_name: { type: 'string', description: '벡터 인덱스 이름' },
        query: { type: 'string', description: '검색 쿼리' },
        top_k: { type: 'number', description: '반환할 결과 수', default: 5 },
        filter: { type: 'object', description: '메타데이터 필터' },
      },
      required: ['index_name', 'query'],
    },
  },
  {
    name: 'handbox_kb_hybrid_search',
    description: '벡터 + 키워드 하이브리드 검색을 수행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        index_name: { type: 'string', description: '벡터 인덱스 이름' },
        query: { type: 'string', description: '검색 쿼리' },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '키워드 목록',
        },
        top_k: { type: 'number', description: '반환할 결과 수', default: 5 },
        vector_weight: { type: 'number', description: '벡터 검색 가중치 (0-1)', default: 0.7 },
      },
      required: ['index_name', 'query'],
    },
  },
  {
    name: 'handbox_kb_list_indices',
    description: '사용 가능한 벡터 인덱스 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── 저장소 도구 ──
  {
    name: 'handbox_storage_query',
    description: 'SQLite 데이터베이스에 SQL 쿼리를 실행합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        db_path: { type: 'string', description: '데이터베이스 경로' },
        sql: { type: 'string', description: 'SQL 쿼리' },
        params: {
          type: 'array',
          items: { type: 'string' },
          description: '쿼리 파라미터',
        },
      },
      required: ['db_path', 'sql'],
    },
  },
  {
    name: 'handbox_storage_kv_get',
    description: 'Key-Value 스토어에서 값을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '네임스페이스', default: 'default' },
        key: { type: 'string', description: '키' },
      },
      required: ['key'],
    },
  },
  {
    name: 'handbox_storage_kv_set',
    description: 'Key-Value 스토어에 값을 저장합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: '네임스페이스', default: 'default' },
        key: { type: 'string', description: '키' },
        value: { type: 'string', description: '값 (JSON 문자열)' },
        ttl: { type: 'number', description: 'TTL(초)', default: 0 },
      },
      required: ['key', 'value'],
    },
  },

  // ── LLM 도구 ──
  {
    name: 'handbox_llm_invoke',
    description: 'LLM 모델을 호출하여 텍스트를 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '사용자 프롬프트' },
        system_prompt: { type: 'string', description: '시스템 프롬프트' },
        model: { type: 'string', description: '모델 ID', default: 'claude-3.5-sonnet' },
        temperature: { type: 'number', description: '온도 (0-1)', default: 0.7 },
        max_tokens: { type: 'number', description: '최대 토큰', default: 4096 },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'handbox_llm_embed',
    description: '텍스트를 벡터 임베딩으로 변환합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        texts: {
          type: 'array',
          items: { type: 'string' },
          description: '임베딩할 텍스트 목록',
        },
        model: { type: 'string', description: '임베딩 모델', default: 'text-embedding-3-small' },
      },
      required: ['texts'],
    },
  },
]

// ============================================================
// MCP 도구 실행기
// ============================================================

/**
 * Handbox MCP 도구 호출
 */
export async function executeHandboxMCPTool(
  toolName: string,
  args: Record<string, any>,
): Promise<MCPToolResult> {
  try {
    switch (toolName) {
      // ── 워크플로우 도구 ──
      case 'handbox_workflow_list': {
        const workflows = await invoke<any[]>('list_workflows')
        return success(JSON.stringify(workflows.slice(0, args.limit || 20), null, 2))
      }

      case 'handbox_workflow_load': {
        const workflow = await invoke<WorkflowFile>('load_workflow', {
          id: args.workflow_id,
        })
        return success(JSON.stringify(workflow, null, 2))
      }

      case 'handbox_workflow_execute': {
        const result = await invoke<any>('execute_workflow', {
          workflowId: args.workflow_id,
          inputs: args.inputs || {},
        })
        return success(JSON.stringify(result, null, 2))
      }

      case 'handbox_workflow_analyze': {
        const workflow = JSON.parse(args.workflow_json)
        const { analyzeWorkflowJSON } = await import('../services/WorkflowOrchestratorAgent')
        const analysis = await analyzeWorkflowJSON(
          workflow,
          args.user_request || '',
          args.analysis_type || 'analyze',
        )
        return success(JSON.stringify(analysis, null, 2))
      }

      // ── 페르소나 도구 ──
      case 'handbox_persona_list': {
        const personas = await listPersonas(args.category, args.active_only)
        return success(JSON.stringify(personas, null, 2))
      }

      case 'handbox_persona_get': {
        const persona = await loadPersona(args.persona_id)
        return success(JSON.stringify(persona, null, 2))
      }

      case 'handbox_persona_search': {
        const results = await searchPersonas(args.query, args.domains, args.limit)
        return success(JSON.stringify(results, null, 2))
      }

      case 'handbox_persona_compose_panel': {
        const panel = await composeEvaluationPanel(args.domains, args.panel_size)
        return success(JSON.stringify(panel, null, 2))
      }

      case 'handbox_persona_evaluate': {
        // PersonaAgentExecutor를 통해 평가 수행
        const persona = await loadPersona(args.persona_id)
        const result = await invoke<any>('invoke_bedrock', {
          request: {
            model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
            prompt: args.content,
            system_prompt: persona.systemPrompt,
            max_tokens: 4096,
            temperature: 0.5,
          },
        })
        return success(JSON.stringify({
          evaluator: persona.name,
          domain: persona.domain,
          response: result.response,
        }, null, 2))
      }

      // ── 지식베이스 도구 ──
      case 'handbox_kb_search': {
        const results = await invoke<any>('vector_text_search', {
          indexName: args.index_name,
          query: args.query,
          topK: args.top_k || 5,
        })
        return success(JSON.stringify(results, null, 2))
      }

      case 'handbox_kb_hybrid_search': {
        const results = await invoke<any>('vector_hybrid_search', {
          indexName: args.index_name,
          query: args.query,
          keywords: args.keywords || [],
          topK: args.top_k || 5,
          vectorWeight: args.vector_weight || 0.7,
        })
        return success(JSON.stringify(results, null, 2))
      }

      case 'handbox_kb_list_indices': {
        const indices = await invoke<any>('vector_list_indices')
        return success(JSON.stringify(indices, null, 2))
      }

      // ── 저장소 도구 ──
      case 'handbox_storage_query': {
        const result = await invoke<any>('sqlite_query', {
          dbPath: args.db_path,
          sql: args.sql,
          paramsJson: args.params || null,
        })
        return success(JSON.stringify(result, null, 2))
      }

      case 'handbox_storage_kv_get': {
        const value = await invoke<any>('tool_kv_get', {
          namespace: args.namespace || 'default',
          key: args.key,
        })
        return success(JSON.stringify(value, null, 2))
      }

      case 'handbox_storage_kv_set': {
        await invoke<any>('tool_kv_set', {
          namespace: args.namespace || 'default',
          key: args.key,
          value: args.value,
          ttl: args.ttl || 0,
        })
        return success(`Key '${args.key}' saved successfully`)
      }

      // ── LLM 도구 ──
      case 'handbox_llm_invoke': {
        const result = await invoke<any>('invoke_bedrock', {
          request: {
            model_id: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
            prompt: args.prompt,
            system_prompt: args.system_prompt || '당신은 유용한 AI 어시스턴트입니다.',
            max_tokens: args.max_tokens || 4096,
            temperature: args.temperature || 0.7,
          },
        })
        return success(result.response)
      }

      case 'handbox_llm_embed': {
        const result = await invoke<any>('create_embedding', {
          texts: args.texts,
        })
        return success(JSON.stringify(result, null, 2))
      }

      default:
        return error(`Unknown tool: ${toolName}`)
    }
  } catch (err) {
    return error(`Tool execution failed: ${err}`)
  }
}

// ============================================================
// 헬퍼 함수
// ============================================================

function success(text: string): MCPToolResult {
  return {
    success: true,
    content: [{ type: 'text', text }],
  }
}

function error(message: string): MCPToolResult {
  return {
    success: false,
    content: [{ type: 'text', text: message }],
    isError: true,
  }
}

/**
 * MCP 도구 스키마를 MCP 프로토콜 형식으로 변환
 */
export function getToolsForMCPProtocol(): any[] {
  return HANDBOX_MCP_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
}

/**
 * 특정 카테고리의 도구만 필터링
 */
export function getToolsByCategory(prefix: string): MCPToolSchema[] {
  return HANDBOX_MCP_TOOLS.filter(tool => tool.name.startsWith(`handbox_${prefix}`))
}
