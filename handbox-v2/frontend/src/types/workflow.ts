/**
 * Workflow types for save/load and version control
 */

import type { Node, Edge } from '@xyflow/react'
import type { NodeData } from '@/stores/workflowStore'
import type { LLMProvider } from './index'

/** Saved workflow metadata (for library/versioning, distinct from graph.ts WorkflowMeta) */
export interface SavedWorkflowMeta {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  version: number
  tags: string[]
  source?: 'editor' | 'trace' | 'import'
  sourceTraceId?: string
}

/** Workflow version entry */
export interface WorkflowVersion {
  version: number
  timestamp: string
  message?: string
  nodes: Node<NodeData>[]
  edges: Edge[]
  modelOverrides?: Record<string, {
    provider: LLMProvider
    modelId: string
  }>
}

/** Complete saved workflow */
export interface SavedWorkflow {
  meta: SavedWorkflowMeta
  currentVersion: number
  versions: WorkflowVersion[]
  parameters?: WorkflowParameter[]
}

/** Workflow parameter definition */
export interface WorkflowParameter {
  id: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'file' | 'json'
  description?: string
  defaultValue?: unknown
  required: boolean
  nodeBindings: Array<{
    nodeId: string
    configKey: string
  }>
}

/** Workflow library index */
export interface WorkflowLibraryIndex {
  workflows: SavedWorkflowMeta[]
  lastUpdated: string
  totalCount: number
}

/** Export format for sharing */
export interface WorkflowExport {
  formatVersion: '1.0.0'
  exportedAt: string
  workflow: SavedWorkflow
}

/** Import result */
export interface ImportResult {
  success: boolean
  workflowId?: string
  error?: string
  conflicts?: string[]
}

/** Storage backend interface */
export interface WorkflowStorageBackend {
  list(): Promise<SavedWorkflowMeta[]>
  get(id: string): Promise<SavedWorkflow | null>
  save(workflow: SavedWorkflow): Promise<void>
  delete(id: string): Promise<void>
  export(id: string): Promise<WorkflowExport>
  import(data: WorkflowExport): Promise<ImportResult>
}
