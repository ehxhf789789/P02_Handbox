/**
 * WorkflowStorage — Persistence layer for saved workflows
 *
 * Uses localStorage for web fallback, Tauri for native storage.
 */

import type { Node, Edge } from '@xyflow/react'
import type { NodeData } from '@/stores/workflowStore'
import type {
  SavedWorkflow,
  SavedWorkflowMeta,
  WorkflowVersion,
  WorkflowExport,
  ImportResult,
  WorkflowParameter,
  WorkflowStorageBackend,
} from '@/types/workflow'
import type { LLMProvider } from '@/types'
import { invoke } from '@tauri-apps/api/core'

const STORAGE_KEY = 'handbox_workflows'
const INDEX_KEY = 'handbox_workflow_index'

/** Local storage implementation */
class LocalStorageBackend implements WorkflowStorageBackend {
  private getIndex(): SavedWorkflowMeta[] {
    try {
      const data = localStorage.getItem(INDEX_KEY)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  private setIndex(workflows: SavedWorkflowMeta[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(workflows))
  }

  async list(): Promise<SavedWorkflowMeta[]> {
    return this.getIndex()
  }

  async get(id: string): Promise<SavedWorkflow | null> {
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}_${id}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  async save(workflow: SavedWorkflow): Promise<void> {
    // Update workflow data
    localStorage.setItem(
      `${STORAGE_KEY}_${workflow.meta.id}`,
      JSON.stringify(workflow)
    )

    // Update index
    const index = this.getIndex()
    const existingIdx = index.findIndex(w => w.id === workflow.meta.id)
    if (existingIdx >= 0) {
      index[existingIdx] = workflow.meta
    } else {
      index.unshift(workflow.meta)
    }
    this.setIndex(index)
  }

  async delete(id: string): Promise<void> {
    localStorage.removeItem(`${STORAGE_KEY}_${id}`)
    const index = this.getIndex().filter(w => w.id !== id)
    this.setIndex(index)
  }

  async export(id: string): Promise<WorkflowExport> {
    const workflow = await this.get(id)
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`)
    }

    return {
      formatVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      workflow,
    }
  }

  async import(data: WorkflowExport): Promise<ImportResult> {
    try {
      const workflow = data.workflow

      // Check for conflicts
      const existing = await this.get(workflow.meta.id)
      if (existing) {
        // Generate new ID to avoid conflict
        workflow.meta.id = crypto.randomUUID()
        workflow.meta.name = `${workflow.meta.name} (imported)`
      }

      await this.save(workflow)

      return {
        success: true,
        workflowId: workflow.meta.id,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      }
    }
  }
}

/** Tauri native storage implementation */
class TauriStorageBackend implements WorkflowStorageBackend {
  async list(): Promise<SavedWorkflowMeta[]> {
    try {
      return await invoke<SavedWorkflowMeta[]>('list_workflows')
    } catch (error) {
      console.warn('[WorkflowStorage] Tauri list failed, falling back:', error)
      return new LocalStorageBackend().list()
    }
  }

  async get(id: string): Promise<SavedWorkflow | null> {
    try {
      return await invoke<SavedWorkflow | null>('get_workflow', { id })
    } catch (error) {
      console.warn('[WorkflowStorage] Tauri get failed, falling back:', error)
      return new LocalStorageBackend().get(id)
    }
  }

  async save(workflow: SavedWorkflow): Promise<void> {
    try {
      await invoke('save_workflow', { workflow })
    } catch (error) {
      console.warn('[WorkflowStorage] Tauri save failed, falling back:', error)
      await new LocalStorageBackend().save(workflow)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await invoke('delete_workflow', { id })
    } catch (error) {
      console.warn('[WorkflowStorage] Tauri delete failed, falling back:', error)
      await new LocalStorageBackend().delete(id)
    }
  }

  async export(id: string): Promise<WorkflowExport> {
    const workflow = await this.get(id)
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`)
    }

    return {
      formatVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      workflow,
    }
  }

  async import(data: WorkflowExport): Promise<ImportResult> {
    try {
      const workflow = data.workflow
      const existing = await this.get(workflow.meta.id)

      if (existing) {
        workflow.meta.id = crypto.randomUUID()
        workflow.meta.name = `${workflow.meta.name} (imported)`
      }

      await this.save(workflow)

      return {
        success: true,
        workflowId: workflow.meta.id,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      }
    }
  }
}

/** Main storage service */
export class WorkflowStorage {
  private backend: WorkflowStorageBackend

  constructor() {
    // Try to use Tauri backend, fall back to localStorage
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      this.backend = new TauriStorageBackend()
    } else {
      this.backend = new LocalStorageBackend()
    }
  }

  /** List all saved workflows */
  async listWorkflows(): Promise<SavedWorkflowMeta[]> {
    return this.backend.list()
  }

  /** Get a specific workflow by ID */
  async getWorkflow(id: string): Promise<SavedWorkflow | null> {
    return this.backend.get(id)
  }

  /** Save a workflow (create or update) */
  async saveWorkflow(
    nodes: Node<NodeData>[],
    edges: Edge[],
    meta: Partial<SavedWorkflowMeta>,
    options?: {
      versionMessage?: string
      parameters?: WorkflowParameter[]
      modelOverrides?: Record<string, { provider: LLMProvider; modelId: string }>
    }
  ): Promise<SavedWorkflow> {
    const id = meta.id || crypto.randomUUID()
    const now = new Date().toISOString()

    // Check if workflow exists
    const existing = await this.backend.get(id)

    const version: WorkflowVersion = {
      version: existing ? existing.currentVersion + 1 : 1,
      timestamp: now,
      message: options?.versionMessage,
      nodes,
      edges,
      modelOverrides: options?.modelOverrides,
    }

    const workflow: SavedWorkflow = {
      meta: {
        id,
        name: meta.name || 'Untitled Workflow',
        description: meta.description || '',
        createdAt: existing?.meta.createdAt || now,
        updatedAt: now,
        version: version.version,
        tags: meta.tags || [],
        source: meta.source || 'editor',
        sourceTraceId: meta.sourceTraceId,
      },
      currentVersion: version.version,
      versions: existing
        ? [...existing.versions.slice(-9), version] // Keep last 10 versions
        : [version],
      parameters: options?.parameters,
    }

    await this.backend.save(workflow)
    return workflow
  }

  /** Delete a workflow */
  async deleteWorkflow(id: string): Promise<void> {
    await this.backend.delete(id)
  }

  /** Export workflow for sharing */
  async exportWorkflow(id: string): Promise<WorkflowExport> {
    return this.backend.export(id)
  }

  /** Import workflow from export data */
  async importWorkflow(data: WorkflowExport): Promise<ImportResult> {
    return this.backend.import(data)
  }

  /** Revert to a previous version */
  async revertToVersion(id: string, version: number): Promise<SavedWorkflow | null> {
    const workflow = await this.backend.get(id)
    if (!workflow) return null

    const targetVersion = workflow.versions.find(v => v.version === version)
    if (!targetVersion) return null

    // Create a new version with the old content
    const revertedWorkflow = await this.saveWorkflow(
      targetVersion.nodes,
      targetVersion.edges,
      workflow.meta,
      {
        versionMessage: `Reverted to version ${version}`,
        modelOverrides: targetVersion.modelOverrides,
      }
    )

    return revertedWorkflow
  }

  /** Get version history for a workflow */
  async getVersionHistory(id: string): Promise<WorkflowVersion[]> {
    const workflow = await this.backend.get(id)
    return workflow?.versions || []
  }

  /** Load workflow into editor format */
  async loadForEditor(
    id: string,
    version?: number
  ): Promise<{ nodes: Node<NodeData>[]; edges: Edge[] } | null> {
    const workflow = await this.backend.get(id)
    if (!workflow) return null

    const targetVersion = version
      ? workflow.versions.find(v => v.version === version)
      : workflow.versions[workflow.versions.length - 1]

    if (!targetVersion) return null

    return {
      nodes: targetVersion.nodes,
      edges: targetVersion.edges,
    }
  }
}

// Singleton instance
export const workflowStorage = new WorkflowStorage()
