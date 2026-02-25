/**
 * PackManager — manage tool packs (install, view, configure).
 */

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Package, Download, Check, X, Loader2,
  RefreshCw, ExternalLink, ChevronRight,
} from 'lucide-react'

interface PackManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  tools?: string[]
  installed?: boolean
}

interface PackManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function PackManager({ isOpen, onClose }: PackManagerProps) {
  const [packs, setPacks] = useState<PackManifest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPack, setSelectedPack] = useState<PackManifest | null>(null)
  const [installStatus, setInstallStatus] = useState<Record<string, 'installing' | 'installed' | 'error'>>({})

  useEffect(() => {
    if (isOpen) {
      loadPacks()
    }
  }, [isOpen])

  const loadPacks = async () => {
    setIsLoading(true)
    try {
      const manifests = await invoke<PackManifest[]>('list_packs')
      // Mark all loaded packs as installed (since they're from local directory)
      const packsWithStatus = manifests.map(p => ({ ...p, installed: true }))

      // Add some example packs that could be installed
      const examplePacks: PackManifest[] = [
        {
          id: 'core-tools',
          name: 'Core Tools',
          version: '1.0.0',
          description: 'Essential I/O, text processing, and data manipulation tools',
          author: 'Handbox Team',
          tools: ['file-read', 'file-write', 'text-split', 'json-parse'],
          installed: true,
        },
        {
          id: 'ai-tools',
          name: 'AI & LLM Tools',
          version: '1.0.0',
          description: 'LLM chat, summarization, embedding, and AI-powered tools',
          author: 'Handbox Team',
          tools: ['llm-chat', 'llm-summarize', 'embedding'],
          installed: true,
        },
        {
          id: 'rag-tools',
          name: 'RAG Pipeline Tools',
          version: '1.0.0',
          description: 'Vector store, search, and retrieval-augmented generation tools',
          author: 'Handbox Team',
          tools: ['vector-store', 'vector-search', 'reranker'],
          installed: true,
        },
        {
          id: 'revit-mcp',
          name: 'Revit MCP',
          version: '0.1.0',
          description: 'Autodesk Revit integration via MCP protocol',
          author: 'Community',
          homepage: 'https://github.com/example/revit-mcp',
          tools: ['revit-export', 'revit-query', 'revit-modify'],
          installed: false,
        },
        {
          id: 'excel-tools',
          name: 'Excel Tools',
          version: '1.0.0',
          description: 'Advanced Excel reading, writing, and formula tools',
          author: 'Community',
          tools: ['excel-read', 'excel-write', 'excel-formula'],
          installed: false,
        },
      ]

      // Merge loaded packs with examples (avoid duplicates)
      const loadedIds = new Set(packsWithStatus.map(p => p.id))
      const mergedPacks = [
        ...packsWithStatus,
        ...examplePacks.filter(p => !loadedIds.has(p.id)),
      ]

      setPacks(mergedPacks)
    } catch (error) {
      console.error('Failed to load packs:', error)
      // Show example packs even if loading fails
      setPacks([
        {
          id: 'core-tools',
          name: 'Core Tools',
          version: '1.0.0',
          description: 'Essential I/O, text processing, and data manipulation tools',
          tools: ['file-read', 'file-write', 'text-split', 'json-parse'],
          installed: true,
        },
        {
          id: 'ai-tools',
          name: 'AI & LLM Tools',
          version: '1.0.0',
          description: 'LLM chat, summarization, embedding, and AI-powered tools',
          tools: ['llm-chat', 'llm-summarize', 'embedding'],
          installed: true,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleInstall = async (packId: string) => {
    setInstallStatus({ ...installStatus, [packId]: 'installing' })
    try {
      await invoke('install_pack', { packId, version: 'latest' })
      setInstallStatus({ ...installStatus, [packId]: 'installed' })
      // Reload packs
      await loadPacks()
    } catch (error) {
      console.error('Failed to install pack:', error)
      setInstallStatus({ ...installStatus, [packId]: 'error' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[700px] max-h-[80vh] bg-neutral-900 rounded-xl border border-neutral-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-violet-500" />
            <span className="text-sm font-semibold text-neutral-200">Pack Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadPacks}
              disabled={isLoading}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Pack List */}
          <div className="w-64 border-r border-neutral-800 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={20} className="animate-spin text-neutral-500" />
              </div>
            ) : packs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-neutral-600">
                No packs found
              </div>
            ) : (
              <div className="py-2">
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setSelectedPack(pack)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
                      selectedPack?.id === pack.id
                        ? 'bg-neutral-800'
                        : 'hover:bg-neutral-800/50'
                    }`}
                  >
                    <Package
                      size={14}
                      className={pack.installed ? 'text-emerald-500' : 'text-neutral-600'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-200 truncate">
                        {pack.name}
                      </div>
                      <div className="text-[10px] text-neutral-500">{pack.version}</div>
                    </div>
                    <ChevronRight size={12} className="text-neutral-600" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Pack Details */}
          <div className="flex-1 p-5 overflow-y-auto">
            {selectedPack ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-200">
                      {selectedPack.name}
                    </h3>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {selectedPack.id} @ {selectedPack.version}
                    </p>
                  </div>
                  {selectedPack.installed ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                      <Check size={10} />
                      Installed
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInstall(selectedPack.id)}
                      disabled={installStatus[selectedPack.id] === 'installing'}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium
                               bg-violet-600 hover:bg-violet-500 text-white transition-colors
                               disabled:opacity-50"
                    >
                      {installStatus[selectedPack.id] === 'installing' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      Install
                    </button>
                  )}
                </div>

                <p className="text-xs text-neutral-400">{selectedPack.description}</p>

                {selectedPack.author && (
                  <div className="text-xs text-neutral-500">
                    Author: <span className="text-neutral-400">{selectedPack.author}</span>
                  </div>
                )}

                {selectedPack.homepage && (
                  <a
                    href={selectedPack.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-400 hover:underline"
                  >
                    <ExternalLink size={10} />
                    View on GitHub
                  </a>
                )}

                {selectedPack.tools && selectedPack.tools.length > 0 && (
                  <div className="pt-3 border-t border-neutral-800">
                    <h4 className="text-xs font-medium text-neutral-400 mb-2">
                      Tools ({selectedPack.tools.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPack.tools.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-neutral-600">
                Select a pack to view details
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800 bg-neutral-900/50 shrink-0">
          <div className="text-[10px] text-neutral-600">
            {packs.filter(p => p.installed).length} packs installed
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200
                     rounded-md hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
