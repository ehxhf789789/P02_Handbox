/**
 * useTrace — hook for trace/evidence querying via Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core'

export interface TraceSpan {
  span_id: string
  execution_id: string
  node_id: string
  tool_ref: string
  input_json: unknown
  output_json: unknown | null
  config_json: unknown
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  status: string
  error: string | null
  cache_hit: boolean
}

export function useTrace() {
  const getTraces = async (executionId: string): Promise<TraceSpan[]> => {
    try {
      return await invoke<TraceSpan[]>('get_traces', { executionId })
    } catch {
      return []
    }
  }

  const getSpan = async (spanId: string): Promise<TraceSpan | null> => {
    try {
      return await invoke<TraceSpan>('get_span', { spanId })
    } catch {
      return null
    }
  }

  const exportTraces = async (executionId: string, format: string = 'json'): Promise<string | null> => {
    try {
      return await invoke<string>('export_traces', { executionId, format })
    } catch {
      return null
    }
  }

  return { getTraces, getSpan, exportTraces }
}
