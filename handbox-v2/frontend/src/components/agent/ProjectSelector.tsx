/**
 * ProjectSelector — dropdown for selecting/creating projects in AgentChatPanel header.
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, FolderOpen, Trash2, Globe } from 'lucide-react'
import { useProjectStore, type ProjectSummary } from '@/stores/projectStore'

export function ProjectSelector() {
  const { activeProject, projects, fetchProjects, createProject, deleteProject, setActiveProject } = useProjectStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const project = await createProject(newName.trim(), newDesc.trim() || undefined)
    if (project) {
      setActiveProject(project)
      setNewName('')
      setNewDesc('')
      setCreating(false)
      setOpen(false)
    }
  }

  const handleSelect = (project: ProjectSummary | null) => {
    setActiveProject(project)
    setOpen(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm('이 프로젝트를 삭제하시겠습니까? 프로젝트의 plan과 memory도 함께 삭제됩니다.')) {
      await deleteProject(id)
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs
                   bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors
                   border border-neutral-700 max-w-[180px]"
      >
        {activeProject ? (
          <>
            <FolderOpen size={12} className="text-violet-400 shrink-0" />
            <span className="truncate">{activeProject.name}</span>
          </>
        ) : (
          <>
            <Globe size={12} className="text-neutral-500 shrink-0" />
            <span className="text-neutral-500">프로젝트 없음</span>
          </>
        )}
        <ChevronDown size={12} className="shrink-0 text-neutral-500" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-neutral-900 border border-neutral-700
                        rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Global option */}
          <button
            onClick={() => handleSelect(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-800 transition-colors
                        ${!activeProject ? 'text-violet-400 bg-neutral-800/50' : 'text-neutral-400'}`}
          >
            <Globe size={12} />
            <span>전체 (글로벌)</span>
          </button>

          {/* Divider */}
          {projects.length > 0 && <div className="border-t border-neutral-800" />}

          {/* Project list */}
          <div className="max-h-48 overflow-y-auto">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-800 transition-colors group
                            ${activeProject?.id === p.id ? 'text-violet-400 bg-neutral-800/50' : 'text-neutral-300'}`}
              >
                <FolderOpen size={12} className="shrink-0" />
                <div className="flex-1 text-left min-w-0">
                  <div className="truncate">{p.name}</div>
                  {p.description && (
                    <div className="text-[10px] text-neutral-600 truncate">{p.description}</div>
                  )}
                </div>
                <button
                  onClick={(e) => handleDelete(e, p.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/30 text-neutral-600 hover:text-red-400 transition-all"
                >
                  <Trash2 size={10} />
                </button>
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-800" />

          {/* Create new project */}
          {creating ? (
            <div className="p-2 space-y-1.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="프로젝트 이름"
                className="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded
                           text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-violet-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewDesc('') }
                }}
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="설명 (선택사항)"
                className="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded
                           text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-violet-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); setNewDesc('') }
                }}
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 px-2 py-1 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  생성
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(''); setNewDesc('') }}
                  className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 rounded"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-400
                         hover:bg-neutral-800 transition-colors"
            >
              <Plus size={12} />
              <span>새 프로젝트</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
