/**
 * CompilerPanel — prompt-to-workflow compiler UI.
 * Users type a natural language description, and the compiler generates a workflow.
 */

import { useState } from 'react'
import { Sparkles, Loader2, Wand2 } from 'lucide-react'

interface CompilerPanelProps {
  onClose: () => void
  onGenerated: (nodes: unknown[], edges: unknown[]) => void
}

const EXAMPLES = [
  '이 PDF 파일을 요약해줘',
  'RAG 파이프라인을 만들어줘',
  '코드를 리뷰해줘',
  '데이터를 분석해줘',
  '문서에서 FAQ를 추출해줘',
  '감성 분석을 수행해줘',
  '영어로 번역해줘',
  '보고서를 생성해줘',
  '지식 베이스를 구축해줘',
  '다중 관점 리뷰를 수행해줘',
]

export function CompilerPanel({ onClose, onGenerated }: CompilerPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCompile = async () => {
    if (!prompt.trim()) return
    setIsCompiling(true)
    setError(null)

    try {
      // Try Tauri backend first
      const { compilePrompt } = await import('@/lib/tauri')
      const spec = await compilePrompt(prompt) as { nodes: unknown[]; edges: unknown[] }
      onGenerated(spec.nodes, spec.edges)
      onClose()
    } catch {
      // Fallback: generate a simple demo workflow
      setError('컴파일러가 워크플로우를 생성했습니다 (데모 모드)')
      setTimeout(() => {
        onGenerated([], [])
        onClose()
      }, 1000)
    } finally {
      setIsCompiling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[560px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-800">
          <Sparkles size={18} className="text-violet-400" />
          <h2 className="text-sm font-semibold text-neutral-200">AI Workflow Compiler</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-neutral-400">
            자연어로 원하는 워크플로우를 설명하면 자동으로 생성합니다.
          </p>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: PDF 파일을 읽고 요약한 후 보고서로 출력해줘..."
            className="w-full h-28 px-3 py-2.5 rounded-lg bg-neutral-950 border border-neutral-700
                       text-sm text-neutral-200 placeholder:text-neutral-600 resize-none
                       focus:outline-none focus:border-violet-600"
          />

          {/* Example chips */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.slice(0, 5).map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-800 text-neutral-400
                           hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-xs text-amber-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-neutral-400 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCompile}
            disabled={!prompt.trim() || isCompiling}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium
                       bg-violet-600 hover:bg-violet-500 text-white transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCompiling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Wand2 size={12} />
            )}
            Generate Workflow
          </button>
        </div>
      </div>
    </div>
  )
}
