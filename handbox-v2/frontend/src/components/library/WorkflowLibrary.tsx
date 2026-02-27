/**
 * WorkflowLibrary — UI for managing saved workflows
 */

import { useState, useEffect } from 'react'
import { useWorkflowLibraryStore } from '@/stores/workflowLibraryStore'
import { useWorkflowStore, type NodeData } from '@/stores/workflowStore'
import { workflowStorage } from '@/services/WorkflowStorage'
import type { SavedWorkflowMeta, WorkflowVersion, WorkflowExport } from '@/types/workflow'
import {
  FolderOpen,
  Save,
  Trash2,
  Download,
  Upload,
  Search,
  X,
  Clock,
  Tag,
  RotateCcw,
  ChevronRight,
  FileJson,
} from 'lucide-react'
import type { Node } from '@xyflow/react'

interface WorkflowLibraryProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'open' | 'save'
}

export function WorkflowLibrary({ isOpen, onClose, mode = 'open' }: WorkflowLibraryProps) {
  const {
    isLoading,
    isSaving,
    error,
    searchQuery,
    loadWorkflowList,
    loadWorkflow,
    saveWorkflow,
    deleteWorkflow,
    exportWorkflow,
    importWorkflow,
    setSearchQuery,
    getFilteredWorkflows,
    clearError,
  } = useWorkflowLibraryStore()

  const { nodes, edges, clearAll } = useWorkflowStore()
  const addNode = useWorkflowStore(s => s.addNode)
  const addEdgeRaw = useWorkflowStore(s => s.addEdgeRaw)

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versionHistory, setVersionHistory] = useState<WorkflowVersion[]>([])

  // Save mode state
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadWorkflowList()
    }
  }, [isOpen, loadWorkflowList])

  const filteredWorkflows = getFilteredWorkflows()

  const handleOpen = async () => {
    if (!selectedWorkflowId) return

    const data = await workflowStorage.loadForEditor(selectedWorkflowId)
    if (data) {
      clearAll()
      data.nodes.forEach(node => addNode(node as Node<NodeData>))
      data.edges.forEach(edge => addEdgeRaw(edge))
      onClose()
    }
  }

  const handleSave = async () => {
    if (!saveName.trim()) return

    await saveWorkflow(
      nodes as Node<NodeData>[],
      edges,
      {
        name: saveName,
        description: saveDescription,
        tags: saveTags.split(',').map(t => t.trim()).filter(Boolean),
        source: 'editor',
      },
      {
        versionMessage: saveMessage || undefined,
      }
    )
    onClose()
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this workflow? This cannot be undone.')) {
      await deleteWorkflow(id)
      setSelectedWorkflowId(null)
    }
  }

  const handleExport = async (id: string) => {
    const data = await exportWorkflow(id)
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.workflow.meta.name.replace(/\s+/g, '_')}.handbox.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.handbox.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text) as WorkflowExport
        const result = await importWorkflow(data)
        if (!result.success) {
          alert(`Import failed: ${result.error}`)
        }
      } catch (err) {
        alert('Invalid workflow file')
      }
    }
    input.click()
  }

  const handleShowVersionHistory = async (id: string) => {
    const workflow = await loadWorkflow(id)
    if (workflow) {
      setVersionHistory(workflow.versions)
      setShowVersionHistory(true)
    }
  }

  const handleRevertVersion = async (version: number) => {
    if (!selectedWorkflowId) return
    if (confirm(`Revert to version ${version}?`)) {
      const { revertToVersion } = useWorkflowLibraryStore.getState()
      await revertToVersion(selectedWorkflowId, version)
      setShowVersionHistory(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl w-[700px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
          <div className="flex items-center gap-2">
            {mode === 'open' ? (
              <>
                <FolderOpen size={16} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-neutral-200">Open Workflow</h2>
              </>
            ) : (
              <>
                <Save size={16} className="text-emerald-400" />
                <h2 className="text-sm font-semibold text-neutral-200">Save Workflow</h2>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {mode === 'open' ? (
            <>
              {/* Workflow List */}
              <div className="w-1/2 border-r border-neutral-700 flex flex-col">
                {/* Search */}
                <div className="p-3 border-b border-neutral-800">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search workflows..."
                      className="w-full pl-8 pr-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded
                               text-xs text-neutral-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
                      Loading...
                    </div>
                  ) : filteredWorkflows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-sm">
                      <FileJson size={32} className="mb-2 opacity-50" />
                      No workflows found
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-800">
                      {filteredWorkflows.map(workflow => (
                        <WorkflowListItem
                          key={workflow.id}
                          workflow={workflow}
                          selected={selectedWorkflowId === workflow.id}
                          onClick={() => setSelectedWorkflowId(workflow.id)}
                          onDelete={() => handleDelete(workflow.id)}
                          onExport={() => handleExport(workflow.id)}
                          onVersionHistory={() => handleShowVersionHistory(workflow.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Import button */}
                <div className="p-3 border-t border-neutral-800">
                  <button
                    onClick={handleImport}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded
                             bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs"
                  >
                    <Upload size={14} />
                    Import from file...
                  </button>
                </div>
              </div>

              {/* Preview / Version History */}
              <div className="w-1/2 flex flex-col">
                {showVersionHistory ? (
                  <VersionHistoryPanel
                    versions={versionHistory}
                    onRevert={handleRevertVersion}
                    onClose={() => setShowVersionHistory(false)}
                  />
                ) : selectedWorkflowId ? (
                  <WorkflowPreview
                    workflowId={selectedWorkflowId}
                    onOpen={handleOpen}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
                    Select a workflow to preview
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Save Mode */
            <div className="flex-1 p-4 space-y-4">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Workflow Name *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Workflow"
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded
                           text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Description</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded
                           text-sm text-neutral-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="automation, llm, data"
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded
                           text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Version Message</label>
                <input
                  type="text"
                  value={saveMessage}
                  onChange={(e) => setSaveMessage(e.target.value)}
                  placeholder="Optional: describe this version"
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded
                           text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Stats */}
              <div className="p-3 bg-neutral-800/50 rounded">
                <div className="text-xs text-neutral-400 mb-2">Current Workflow</div>
                <div className="flex gap-4 text-sm">
                  <span className="text-neutral-200">{nodes.length} nodes</span>
                  <span className="text-neutral-200">{edges.length} edges</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-700">
          {error && (
            <div className="text-xs text-red-400 flex items-center gap-2">
              {error}
              <button onClick={clearError} className="hover:text-red-300">
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200"
            >
              Cancel
            </button>
            {mode === 'open' ? (
              <button
                onClick={handleOpen}
                disabled={!selectedWorkflowId || isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         bg-blue-600 hover:bg-blue-500 text-white rounded
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen size={12} />
                Open
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={!saveName.trim() || isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         bg-emerald-600 hover:bg-emerald-500 text-white rounded
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={12} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkflowListItem({
  workflow,
  selected,
  onClick,
  onDelete,
  onExport,
  onVersionHistory,
}: {
  workflow: SavedWorkflowMeta
  selected: boolean
  onClick: () => void
  onDelete: () => void
  onExport: () => void
  onVersionHistory: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`p-3 cursor-pointer transition-colors ${
        selected ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-neutral-800/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-neutral-200 truncate">{workflow.name}</div>
          {workflow.description && (
            <div className="text-xs text-neutral-500 truncate mt-0.5">{workflow.description}</div>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(workflow.updatedAt).toLocaleDateString()}
            </span>
            <span>v{workflow.version}</span>
            {workflow.source && (
              <span className="px-1.5 py-0.5 bg-neutral-800 rounded">
                {workflow.source}
              </span>
            )}
          </div>
          {workflow.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Tag size={10} className="text-neutral-600" />
              {workflow.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[10px] px-1 py-0.5 bg-neutral-800 rounded text-neutral-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={(e) => { e.stopPropagation(); onVersionHistory() }}
              className="p-1 text-neutral-500 hover:text-neutral-300"
              title="Version history"
            >
              <Clock size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onExport() }}
              className="p-1 text-neutral-500 hover:text-neutral-300"
              title="Export"
            >
              <Download size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="p-1 text-neutral-500 hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowPreview({
  workflowId,
  onOpen,
}: {
  workflowId: string
  onOpen: () => void
}) {
  const { activeWorkflow, loadWorkflow } = useWorkflowLibraryStore()

  useEffect(() => {
    loadWorkflow(workflowId)
  }, [workflowId, loadWorkflow])

  if (!activeWorkflow) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Loading preview...
      </div>
    )
  }

  const latestVersion = activeWorkflow.versions[activeWorkflow.versions.length - 1]

  return (
    <div className="flex-1 flex flex-col p-4">
      <h3 className="text-sm font-medium text-neutral-200 mb-1">{activeWorkflow.meta.name}</h3>
      {activeWorkflow.meta.description && (
        <p className="text-xs text-neutral-500 mb-3">{activeWorkflow.meta.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2 bg-neutral-800/50 rounded">
          <div className="text-lg font-bold text-neutral-200">{latestVersion?.nodes.length || 0}</div>
          <div className="text-[10px] text-neutral-500">Nodes</div>
        </div>
        <div className="p-2 bg-neutral-800/50 rounded">
          <div className="text-lg font-bold text-neutral-200">{latestVersion?.edges.length || 0}</div>
          <div className="text-[10px] text-neutral-500">Edges</div>
        </div>
      </div>

      {activeWorkflow.parameters && activeWorkflow.parameters.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-neutral-400 mb-1">Parameters</div>
          <div className="space-y-1">
            {activeWorkflow.parameters.map(param => (
              <div key={param.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-violet-400">{param.name}</span>
                <span className="text-neutral-600">{param.type}</span>
                {param.required && <span className="text-amber-400">*</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Node list preview */}
      <div className="flex-1 overflow-auto">
        <div className="text-xs text-neutral-400 mb-1">Nodes</div>
        <div className="space-y-1 max-h-40 overflow-auto">
          {latestVersion?.nodes.slice(0, 10).map(node => (
            <div
              key={node.id}
              className="flex items-center gap-2 p-1.5 bg-neutral-800/50 rounded text-xs"
            >
              <ChevronRight size={10} className="text-neutral-600" />
              <span className="text-neutral-200">{(node.data as NodeData)?.label || node.id}</span>
              <span className="text-neutral-600 font-mono">{(node.data as NodeData)?.toolRef}</span>
            </div>
          ))}
          {(latestVersion?.nodes.length || 0) > 10 && (
            <div className="text-[10px] text-neutral-600 pl-5">
              +{latestVersion!.nodes.length - 10} more
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={onOpen}
          className="w-full flex items-center justify-center gap-2 px-3 py-2
                   bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
        >
          <FolderOpen size={14} />
          Open in Editor
        </button>
      </div>
    </div>
  )
}

function VersionHistoryPanel({
  versions,
  onRevert,
  onClose,
}: {
  versions: WorkflowVersion[]
  onRevert: (version: number) => void
  onClose: () => void
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2 text-sm text-neutral-200">
          <Clock size={14} />
          Version History
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-2">
          {[...versions].reverse().map((version, idx) => (
            <div
              key={version.version}
              className={`p-3 rounded border ${
                idx === 0
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : 'bg-neutral-800/50 border-neutral-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-neutral-200">
                    Version {version.version}
                    {idx === 0 && (
                      <span className="ml-2 text-[10px] text-blue-400">(current)</span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {new Date(version.timestamp).toLocaleString()}
                  </div>
                  {version.message && (
                    <div className="text-xs text-neutral-400 mt-1">{version.message}</div>
                  )}
                </div>
                {idx !== 0 && (
                  <button
                    onClick={() => onRevert(version.version)}
                    className="flex items-center gap-1 px-2 py-1 text-xs
                             bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded"
                  >
                    <RotateCcw size={10} />
                    Revert
                  </button>
                )}
              </div>
              <div className="flex gap-3 mt-2 text-[10px] text-neutral-600">
                <span>{version.nodes.length} nodes</span>
                <span>{version.edges.length} edges</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default WorkflowLibrary
