/**
 * InlineNodeEditor — Quick edit overlay for nodes in the canvas.
 *
 * Appears on double-click for fast editing of:
 * - Node label
 * - LLM prompts
 * - Key configuration values
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type { NodeData } from '@/stores/workflowStore'
import { allTools } from '@/data/toolCatalog'
import { X, Save, RotateCcw, Sparkles } from 'lucide-react'
import type { Node } from '@xyflow/react'

interface InlineNodeEditorProps {
  node: Node<NodeData>
  position: { x: number; y: number }
  onClose: () => void
  onSave: (nodeId: string, updates: Partial<NodeData>) => void
}

export function InlineNodeEditor({
  node,
  position,
  onClose,
  onSave,
}: InlineNodeEditorProps) {
  const nodeData = node.data as NodeData
  const toolDef = allTools.find(t => t.id === nodeData.toolRef)
  const isLLMNode = nodeData.category === 'ai' || nodeData.toolRef.includes('llm')

  const [label, setLabel] = useState(nodeData.label)
  const [config, setConfig] = useState<Record<string, unknown>>(nodeData.config || {})
  const [hasChanges, setHasChanges] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)

  // Focus label input on mount
  useEffect(() => {
    labelInputRef.current?.focus()
    labelInputRef.current?.select()
  }, [])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as HTMLElement)) {
        if (hasChanges) {
          handleSave()
        } else {
          onClose()
        }
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [hasChanges, onClose])

  const handleSave = useCallback(() => {
    const updates: Partial<NodeData> = {}

    if (label !== nodeData.label) {
      updates.label = label
    }

    if (JSON.stringify(config) !== JSON.stringify(nodeData.config)) {
      updates.config = config
    }

    if (Object.keys(updates).length > 0) {
      onSave(node.id, updates)
    }

    onClose()
  }, [label, config, nodeData, node.id, onSave, onClose])

  const handleReset = () => {
    setLabel(nodeData.label)
    setConfig(nodeData.config || {})
    setHasChanges(false)
  }

  const updateConfig = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  // Get quick-edit fields based on tool type
  const getQuickEditFields = (): Array<{
    key: string
    label: string
    type: string
    min?: number
    max?: number
    step?: number
  }> => {
    if (isLLMNode) {
      return [
        { key: 'prompt', label: 'Prompt', type: 'textarea' },
        { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
        { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1 },
      ]
    }

    // Default config fields from tool definition
    return toolDef?.configFields?.slice(0, 3).map(field => ({
      key: field.name,
      label: field.label,
      type: field.type === 'number' ? 'number' : field.type === 'boolean' ? 'checkbox' : 'text',
    })) || []
  }

  const quickFields = getQuickEditFields()

  return (
    <div
      ref={editorRef}
      className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 320,
        maxWidth: 480,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" />
          <span className="text-xs font-semibold text-neutral-200">Quick Edit</span>
        </div>
        <div className="flex items-center gap-1">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="p-1 text-neutral-500 hover:text-neutral-300"
              title="Reset changes"
            >
              <RotateCcw size={12} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-300"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Label */}
        <div>
          <label className="block text-[10px] text-neutral-500 mb-1">Node Label</label>
          <input
            ref={labelInputRef}
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              setHasChanges(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSave()
              }
            }}
            className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded
                     text-sm text-neutral-200 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Quick edit fields */}
        {quickFields.map(field => (
          <div key={field.key}>
            <label className="block text-[10px] text-neutral-500 mb-1">{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea
                value={(config[field.key] as string) || ''}
                onChange={(e) => updateConfig(field.key, e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded
                         text-xs text-neutral-200 focus:outline-none focus:border-violet-500
                         resize-none font-mono"
                placeholder={`Enter ${field.label.toLowerCase()}...`}
              />
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={(config[field.key] as number) || 0}
                onChange={(e) => updateConfig(field.key, parseFloat(e.target.value))}
                min={(field as { min?: number }).min}
                max={(field as { max?: number }).max}
                step={(field as { step?: number }).step}
                className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded
                         text-sm text-neutral-200 focus:outline-none focus:border-violet-500"
              />
            ) : field.type === 'checkbox' ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(config[field.key])}
                  onChange={(e) => updateConfig(field.key, e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-600 bg-neutral-800
                           text-violet-500 focus:ring-violet-500"
                />
                <span className="text-xs text-neutral-300">Enabled</span>
              </label>
            ) : (
              <input
                type="text"
                value={(config[field.key] as string) || ''}
                onChange={(e) => updateConfig(field.key, e.target.value)}
                className="w-full px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded
                         text-sm text-neutral-200 focus:outline-none focus:border-violet-500"
              />
            )}
          </div>
        ))}

        {/* Tool reference (read-only) */}
        <div className="pt-2 border-t border-neutral-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-neutral-600">Tool: {nodeData.toolRef}</span>
            <span className="text-neutral-600">ID: {node.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-neutral-800">
        <button
          onClick={onClose}
          className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className="flex items-center gap-1 px-3 py-1 text-xs font-medium rounded
                   bg-violet-600 hover:bg-violet-500 text-white
                   disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={10} />
          Save
        </button>
      </div>
    </div>
  )
}

export default InlineNodeEditor
