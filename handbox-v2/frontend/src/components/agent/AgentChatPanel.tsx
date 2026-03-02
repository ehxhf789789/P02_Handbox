/**
 * AgentChatPanel — Claude Code-level conversational AI agent interface.
 *
 * Features:
 * - Chat-based interaction with ReAct agent loop
 * - Token-level LLM streaming display
 * - Plan mode (auto / plan / execute)
 * - Permission warnings for dangerous commands
 * - Tool usage visualization (file reads, edits, searches, etc.)
 * - Conversation history with persistence
 * - Step-by-step progress tracking
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send,
  Bot,
  User,
  Terminal,
  FileText,
  Search,
  Globe,
  GitBranch,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Sparkles,
  Trash2,
  StopCircle,
  Brain,
  Wrench,
  X,
  AlertTriangle,
  Map,
  Zap,
  Settings2,
  Copy,
  Check,
  Repeat,
  History,
  MessageCircle,
  Plus,
} from 'lucide-react'
import { safeInvoke, safeListen } from '@/utils/tauri'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectSelector } from './ProjectSelector'

// ============================================================
// Types
// ============================================================

interface AgentStep {
  iteration: number
  thought: string
  action?: { tool: string; args: Record<string, unknown> }
  observation?: string
  timestamp: string
  duration_ms?: number
}

interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  steps?: AgentStep[]
  timestamp: Date
  status?: 'pending' | 'streaming' | 'completed' | 'error'
  usage?: { total_input_tokens: number; total_output_tokens: number; tool_calls: number }
  streamingText?: string
  warnings?: string[]
  mode?: 'auto' | 'plan' | 'execute'
}

interface StreamEvent {
  type: 'start' | 'thinking' | 'tool_call' | 'observation' | 'error' | 'warning' | 'plan'
  conversation_id: string
  iteration?: number
  max_iterations?: number
  tool?: string
  args?: Record<string, unknown>
  thought?: string
  result?: string
  task?: string
  message?: string
}

interface LLMStreamEvent {
  stream_id: string
  type: 'text' | 'done'
  text?: string
  usage?: { input_tokens: number; output_tokens: number }
}

type AgentMode = 'auto' | 'plan' | 'execute'

// ============================================================
// Tool Icon Mapping
// ============================================================

const toolIcons: Record<string, typeof Terminal> = {
  bash_execute: Terminal,
  file_read: FileText,
  file_write: FileText,
  file_edit: FileText,
  file_edit_lines: FileText,
  grep_search: Search,
  glob_search: Search,
  project_tree: FileText,
  web_search: Globe,
  web_fetch: Globe,
  git_status: GitBranch,
  git_diff: GitBranch,
  git_log: GitBranch,
  git_commit: GitBranch,
  memory_read: Brain,
  memory_write: Brain,
  sub_agent: Bot,
  parallel: Zap,
  workflow_create: Sparkles,
  workflow_add_node: Sparkles,
  workflow_remove_node: Sparkles,
  workflow_connect: Sparkles,
}

const toolColors: Record<string, string> = {
  bash_execute: '#f97316',
  file_read: '#3b82f6',
  file_write: '#10b981',
  file_edit: '#eab308',
  file_edit_lines: '#eab308',
  grep_search: '#8b5cf6',
  glob_search: '#8b5cf6',
  project_tree: '#06b6d4',
  web_search: '#ec4899',
  web_fetch: '#ec4899',
  git_status: '#f59e0b',
  git_diff: '#f59e0b',
  git_log: '#f59e0b',
  git_commit: '#f59e0b',
  memory_read: '#6366f1',
  memory_write: '#6366f1',
  sub_agent: '#a855f7',
  parallel: '#14b8a6',
  workflow_create: '#f59e0b',
  workflow_add_node: '#f59e0b',
  workflow_remove_node: '#f59e0b',
  workflow_connect: '#f59e0b',
}

// ============================================================
// Markdown-like text renderer
// ============================================================

// Syntax highlighting with PrismJS
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css'
// Load common languages
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-toml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'

const langAliases: Record<string, string> = {
  ts: 'typescript', js: 'javascript', py: 'python', rs: 'rust',
  sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml',
  jsonc: 'json', md: 'markdown',
}

function highlightCode(code: string, lang?: string): string {
  if (!lang) return escapeHtml(code)
  const resolved = langAliases[lang] || lang
  const grammar = Prism.languages[resolved]
  if (!grammar) return escapeHtml(code)
  return Prism.highlight(code, grammar, resolved)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function CodeBlockWithCopy({ code, lang, blockKey }: { code: string; lang?: string; blockKey: string }) {
  const highlighted = highlightCode(code, lang)
  return (
    <div key={blockKey} className="relative group/code my-1">
      {lang && (
        <div className="text-[9px] text-neutral-500 px-2 pt-1 bg-neutral-900 rounded-t border border-b-0 border-neutral-800 font-mono">
          {lang}
        </div>
      )}
      <pre className={`text-[11px] bg-neutral-900 ${lang ? 'rounded-b border-t-0' : 'rounded'} p-2 overflow-x-auto border border-neutral-800 font-mono`}>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      <div className="absolute top-1 right-1 opacity-0 group-hover/code:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  )
}

/**
 * Safe inline markdown renderer — escapes HTML first, then applies formatting.
 * Prevents XSS by never passing raw user text to dangerouslySetInnerHTML.
 */
function renderInlineMarkdown(line: string): React.ReactNode[] {
  // Parse inline elements without using dangerouslySetInnerHTML
  const nodes: React.ReactNode[] = []
  // Regex to match **bold** or `code` segments
  const inlineRe = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIdx = 0
  let match: RegExpExecArray | null

  while ((match = inlineRe.exec(line)) !== null) {
    // Text before this match
    if (match.index > lastIdx) {
      nodes.push(line.slice(lastIdx, match.index))
    }
    if (match[2]) {
      // **bold**
      nodes.push(<b key={`b-${match.index}`}>{match[2]}</b>)
    } else if (match[3]) {
      // `code`
      nodes.push(
        <code key={`c-${match.index}`} className="text-[11px] bg-neutral-800 px-1 rounded font-mono text-amber-300">
          {match[3]}
        </code>
      )
    }
    lastIdx = match.index + match[0].length
  }
  // Remaining text
  if (lastIdx < line.length) {
    nodes.push(line.slice(lastIdx))
  }
  return nodes.length > 0 ? nodes : [line]
}

/** Parse a pipe-delimited markdown table row into cell strings. */
function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(c => c.trim())
}

/** Check if a line is a table separator row like |---|---|---| */
function isTableSeparator(line: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+\s*$/.test(line)
}

/** Render a markdown table from collected rows. */
function MarkdownTable({ rows, startKey }: { rows: string[]; startKey: number }) {
  if (rows.length < 2 || !rows[0] || !rows[1]) return null
  const headers = parseTableRow(rows[0])
  // rows[1] is the separator — detect alignment
  const separators = parseTableRow(rows[1])
  const aligns: ('left' | 'center' | 'right')[] = separators.map(s => {
    const trimmed = s.trim()
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center'
    if (trimmed.endsWith(':')) return 'right'
    return 'left'
  })
  const bodyRows = rows.slice(2).map(r => parseTableRow(r))

  return (
    <div key={`table-${startKey}`} className="my-1 overflow-x-auto">
      <table className="text-[11px] border-collapse w-full">
        <thead>
          <tr className="border-b border-neutral-700">
            {headers.map((h, ci) => (
              <th
                key={ci}
                className="px-2 py-1 text-left font-semibold text-neutral-300 bg-neutral-900/50"
                style={{ textAlign: aligns[ci] || 'left' }}
              >
                {renderInlineMarkdown(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri} className="border-b border-neutral-800/50 hover:bg-neutral-900/30">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-2 py-1 text-neutral-400"
                  style={{ textAlign: aligns[ci] || 'left' }}
                >
                  {renderInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RenderText({ text }: { text: string }) {
  // Safe markdown: **bold**, `code`, ```code blocks```, headers, lists, tables
  const parts: React.ReactNode[] = []
  const lines = text.split('\n')
  let inCodeBlock = false
  let codeBlockLines: string[] = []
  let codeBlockLang: string | undefined = undefined
  // Table accumulator
  let tableLines: string[] = []
  let tableStartIdx = -1

  const flushTable = () => {
    if (tableLines.length >= 2) {
      parts.push(<MarkdownTable key={`tbl-${tableStartIdx}`} rows={tableLines} startKey={tableStartIdx} />)
    }
    tableLines = []
    tableStartIdx = -1
  }

  lines.forEach((line, i) => {
    // Code block handling
    if (line.startsWith('```')) {
      flushTable()
      if (inCodeBlock) {
        const code = codeBlockLines.join('\n')
        parts.push(
          <CodeBlockWithCopy key={`code-${i}`} code={code} lang={codeBlockLang} blockKey={`code-${i}`} />
        )
        codeBlockLines = []
        codeBlockLang = undefined
        inCodeBlock = false
      } else {
        inCodeBlock = true
        const lang = line.slice(3).trim()
        codeBlockLang = lang || undefined
      }
      return
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      return
    }

    // Table detection: lines starting and ending with |
    const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|')
    if (isTableLine) {
      if (tableLines.length === 0) tableStartIdx = i
      // Second line must be separator to confirm table
      if (tableLines.length === 1 && !isTableSeparator(line)) {
        // Not a table — flush first line as normal text
        const prevLine = tableLines[0] ?? ''
        tableLines = []
        tableStartIdx = -1
        parts.push(
          <span key={i - 1}>
            {renderInlineMarkdown(prevLine)}
            {'\n'}
          </span>
        )
        // Fall through to render current line normally
      } else {
        tableLines.push(line)
        return
      }
    } else if (tableLines.length > 0) {
      flushTable()
    }

    // All inline rendering uses React elements (no dangerouslySetInnerHTML)
    if (line.startsWith('# ')) {
      parts.push(
        <h3 key={i} className="text-sm font-bold text-neutral-100 mt-2 mb-1">
          {renderInlineMarkdown(line.slice(2))}
        </h3>
      )
    } else if (line.startsWith('## ')) {
      parts.push(
        <h4 key={i} className="text-xs font-bold text-neutral-200 mt-1.5 mb-0.5">
          {renderInlineMarkdown(line.slice(3))}
        </h4>
      )
    } else if (line.startsWith('### ')) {
      parts.push(
        <h5 key={i} className="text-xs font-semibold text-neutral-300 mt-1 mb-0.5">
          {renderInlineMarkdown(line.slice(4))}
        </h5>
      )
    } else if (line.match(/^(\s*)([-*])\s/)) {
      const indent = line.match(/^(\s*)/)?.[1]?.length || 0
      const bulletContent = line.replace(/^\s*[-*]\s/, '')
      parts.push(
        <div key={i} className="flex gap-1.5" style={{ marginLeft: `${8 + indent * 8}px` }}>
          <span className="text-neutral-600 shrink-0">-</span>
          <span>{renderInlineMarkdown(bulletContent)}</span>
        </div>
      )
    } else if (line.match(/^\d+\.\s/)) {
      const numMatch = line.match(/^(\d+\.)\s(.*)$/)
      if (numMatch) {
        parts.push(
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-neutral-500 shrink-0">{numMatch[1]}</span>
            <span>{renderInlineMarkdown(numMatch[2] ?? '')}</span>
          </div>
        )
      } else {
        parts.push(<div key={i} className="ml-2">{renderInlineMarkdown(line)}</div>)
      }
    } else if (line.startsWith('> ')) {
      parts.push(
        <div key={i} className="ml-2 pl-2 border-l-2 border-neutral-700 text-neutral-400 italic">
          {renderInlineMarkdown(line.slice(2))}
        </div>
      )
    } else if (line.trim() === '') {
      parts.push(<div key={i} className="h-1" />)
    } else {
      parts.push(
        <span key={i}>
          {renderInlineMarkdown(line)}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      )
    }
  })

  // Flush any remaining table or code block
  flushTable()
  if (inCodeBlock && codeBlockLines.length > 0) {
    const code = codeBlockLines.join('\n')
    parts.push(
      <CodeBlockWithCopy key="code-final" code={code} lang={codeBlockLang} blockKey="code-final" />
    )
  }

  return <div className="space-y-0">{parts}</div>
}

// ============================================================
// Copy Button
// ============================================================

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for non-HTTPS or restricted contexts
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} className="p-0.5 rounded hover:bg-neutral-700 text-neutral-600 hover:text-neutral-400" title="Copy">
      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
    </button>
  )
}

// ============================================================
// Step Renderer
// ============================================================

function AgentStepView({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = step.action ? (toolIcons[step.action.tool] || Wrench) : Brain
  const color = step.action ? (toolColors[step.action.tool] || '#9ca3af') : '#a78bfa'

  return (
    <div className="ml-4 border-l-2 border-neutral-700 pl-3 py-1.5">
      {/* Thought */}
      {step.thought && (
        <div className="flex items-start gap-1.5 mb-1">
          <Brain size={12} className="mt-0.5 text-violet-400 shrink-0" />
          <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {step.thought.length > 200 && !expanded
              ? step.thought.slice(0, 200) + '...'
              : step.thought}
            {step.thought.length > 200 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-1 text-violet-400 hover:text-violet-300"
              >
                {expanded ? '접기' : '더보기'}
              </button>
            )}
          </p>
        </div>
      )}

      {/* Tool Call */}
      {step.action && step.action.tool !== 'finish' && (
        <div className="mt-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs group"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Icon size={12} style={{ color }} />
            <span className="font-mono text-neutral-400 group-hover:text-neutral-200">
              {step.action.tool}
            </span>
            {step.duration_ms !== undefined && (
              <span className="text-neutral-700 text-[10px]">
                {step.duration_ms < 1000 ? `${step.duration_ms}ms` : `${(step.duration_ms / 1000).toFixed(1)}s`}
              </span>
            )}
            {step.action.args && (
              <span className="text-neutral-600 truncate max-w-[300px]">
                {JSON.stringify(step.action.args).slice(0, 60)}
              </span>
            )}
          </button>

          {expanded && (
            <div className="mt-1 ml-4 space-y-1">
              <div className="flex items-center gap-1">
                <pre className="flex-1 text-[10px] text-neutral-500 bg-neutral-900 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
                  {JSON.stringify(step.action.args, null, 2)}
                </pre>
                <CopyButton text={JSON.stringify(step.action.args, null, 2)} />
              </div>
              {step.observation && (
                <div className="flex items-start gap-1">
                  <pre className="flex-1 text-[10px] text-neutral-400 bg-neutral-950 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto border border-neutral-800">
                    {step.observation.slice(0, 3000)}
                    {step.observation.length > 3000 && '\n... (truncated)'}
                  </pre>
                  <CopyButton text={step.observation} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Warning Banner
// ============================================================

function WarningBanner({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="mx-4 mt-1 mb-1 px-3 py-1.5 rounded bg-amber-950/30 border border-amber-700/40">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <AlertTriangle size={11} className="mt-0.5 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-400">{w}</p>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Streaming Indicator
// ============================================================

/**
 * Extract only the "thinking" portion from streaming text,
 * stripping JSON action blocks that confuse users.
 */
function extractThinkingFromStream(text: string): string {
  if (!text) return ''
  // Performance guard: only apply regex to last 2000 chars for very long streams
  const workText = text.length > 2000 ? text.slice(-2000) : text
  // Remove ```json ... ``` blocks
  let cleaned = workText.replace(/```(?:json)?\s*\{[\s\S]*?```/g, '')
  // Remove trailing partial JSON that looks like an action block
  const jsonStart = cleaned.lastIndexOf('{"action"')
  if (jsonStart >= 0) {
    cleaned = cleaned.slice(0, jsonStart)
  }
  // Remove trailing ``` that might be the start of a code fence
  const fenceStart = cleaned.lastIndexOf('```')
  if (fenceStart >= 0 && cleaned.slice(fenceStart).indexOf('\n') === -1) {
    // Trailing incomplete fence
    cleaned = cleaned.slice(0, fenceStart)
  }
  return cleaned.trim()
}

function StreamingIndicator({ event, streamingText }: { event: StreamEvent | null; streamingText: string }) {
  if (!event && !streamingText) return null

  // Clean streaming text to show only thinking, not raw JSON
  const displayText = extractThinkingFromStream(streamingText)

  return (
    <div className="px-4 py-2 bg-neutral-900/50 border-t border-neutral-800 space-y-1">
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-violet-400" />
        {event?.type === 'thinking' && (
          <span className="text-xs text-neutral-400">
            Step {event.iteration}/{event.max_iterations} — 사고 중...
          </span>
        )}
        {event?.type === 'tool_call' && (
          <span className="text-xs text-neutral-400">
            Step {event.iteration} — <span className="text-amber-400 font-mono">{event.tool}</span> 실행 중...
          </span>
        )}
        {event?.type === 'observation' && (
          <span className="text-xs text-neutral-400">
            Step {event.iteration} — 결과 분석 중...
          </span>
        )}
        {event?.type === 'plan' && (
          <span className="text-xs text-neutral-400">
            <Map size={10} className="inline mr-1" /> 계획 수립 중...
          </span>
        )}
        {!event && displayText && (
          <span className="text-xs text-neutral-400">응답 생성 중...</span>
        )}
      </div>
      {/* Live streaming text preview — only shows thinking, not JSON blocks */}
      {displayText && (
        <div className="text-[11px] text-neutral-500 max-h-16 overflow-hidden leading-relaxed">
          {displayText.slice(-300)}
          <span className="animate-pulse text-violet-400">▊</span>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Message Renderer
// ============================================================

function MessageView({ message, onRetry }: { message: AgentMessage; onRetry?: () => void }) {
  const isUser = message.role === 'user'
  const isError = message.status === 'error'

  return (
    <div className={`px-4 py-3 ${isUser ? 'bg-neutral-900/30' : isError ? 'bg-red-950/10' : 'bg-transparent'}`}>
      {/* Warnings */}
      {message.warnings && message.warnings.length > 0 && (
        <WarningBanner warnings={message.warnings} />
      )}

      <div className="flex items-start gap-3 max-w-3xl mx-auto">
        {/* Avatar */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? 'bg-blue-600' : isError ? 'bg-red-600' : 'bg-violet-600'
        }`}>
          {isUser ? <User size={14} /> : <Bot size={14} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-neutral-300">
              {isUser ? 'You' : 'Handbox Agent'}
            </span>
            {message.mode && !isUser && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                message.mode === 'plan' ? 'bg-blue-900/50 text-blue-400' :
                message.mode === 'execute' ? 'bg-green-900/50 text-green-400' :
                'bg-neutral-800 text-neutral-500'
              }`}>
                {message.mode}
              </span>
            )}
            <span className="text-[10px] text-neutral-600">
              {message.timestamp.toLocaleTimeString()}
            </span>
            {message.status === 'streaming' && (
              <Loader2 size={10} className="animate-spin text-violet-400" />
            )}
            {message.status === 'completed' && (
              <CheckCircle size={10} className="text-green-500" />
            )}
            {message.status === 'error' && (
              <XCircle size={10} className="text-red-500" />
            )}
          </div>

          {/* Text content */}
          <div className="text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
            {message.content ? (
              isError ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 px-3 py-2 rounded bg-red-950/30 border border-red-800/40">
                    <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-400 break-all">
                      {message.content}
                    </div>
                  </div>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors"
                    >
                      <Repeat size={12} />
                      재시도
                    </button>
                  )}
                </div>
              ) : (
                <RenderText text={message.content} />
              )
            ) : message.streamingText ? (
              <span className="text-neutral-400">
                {message.streamingText}
                <span className="animate-pulse text-violet-400">▊</span>
              </span>
            ) : message.status === 'streaming' ? (
              <span className="text-neutral-600 italic">처리 중...</span>
            ) : null}
          </div>

          {/* Agent steps */}
          {message.steps && message.steps.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {message.steps.map((step, i) => (
                <AgentStepView key={i} step={step} />
              ))}
            </div>
          )}

          {/* Usage */}
          {message.usage && message.status === 'completed' && (
            <div className="mt-2 flex items-center gap-3 text-[10px] text-neutral-600">
              <span>{message.usage.tool_calls} tool calls</span>
              <span>{(message.usage.total_input_tokens + message.usage.total_output_tokens).toLocaleString()} tokens</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Mode Selector
// ============================================================

function ModeSelector({ mode, onChange }: { mode: AgentMode; onChange: (m: AgentMode) => void }) {
  const modes: { value: AgentMode; label: string; icon: typeof Zap; desc: string }[] = [
    { value: 'auto', label: 'Auto', icon: Zap, desc: '자동 판단' },
    { value: 'plan', label: 'Plan', icon: Map, desc: '계획 먼저' },
    { value: 'execute', label: 'Execute', icon: Terminal, desc: '바로 실행' },
  ]

  return (
    <div className="flex items-center gap-0.5 bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
      {modes.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          title={m.desc}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            mode === m.value
              ? 'bg-neutral-700 text-neutral-200'
              : 'text-neutral-600 hover:text-neutral-400'
          }`}
        >
          <m.icon size={10} />
          {m.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

interface AgentChatPanelProps {
  onClose: () => void
}

export function AgentChatPanel({ onClose }: AgentChatPanelProps) {
  const activeProject = useProjectStore(s => s.activeProject)
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [streamEvent, setStreamEvent] = useState<StreamEvent | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try { return localStorage.getItem('handbox_agent_conv_id') } catch { return null }
  })
  const [workingDir, setWorkingDir] = useState('')
  const [mode, setMode] = useState<AgentMode>('auto')
  const [showSettings, setShowSettings] = useState(false)
  const [maxIterations, setMaxIterations] = useState(25)
  const [permissionRequest, setPermissionRequest] = useState<{
    request_id: string; command: string; warning: string
  } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historyList, setHistoryList] = useState<{
    id: string; title: string; updated_at: string; message_count: number
  }[]>([])
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Persist conversationId to localStorage
  useEffect(() => {
    try {
      if (conversationId) {
        localStorage.setItem('handbox_agent_conv_id', conversationId)
      } else {
        localStorage.removeItem('handbox_agent_conv_id')
      }
    } catch { /* ignore */ }
  }, [conversationId])

  // Auto-restore last conversation on mount
  useEffect(() => {
    const restore = async () => {
      if (conversationId && messages.length === 0) {
        const result = await safeInvoke<{
          conversation_id: string
          messages: { role: string; content: string }[]
        }>('agent_get_conversation', { conversationId })
        if (result?.messages && result.messages.length > 0) {
          const loaded: AgentMessage[] = result.messages.map((m, i) => ({
            id: `restored-${i}`,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: new Date(),
            status: 'completed' as const,
          }))
          setMessages(loaded)
        }
      }
    }
    restore()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamEvent, streamingText])

  // Get working directory on mount — cross-platform: use 'pwd' which works on both
  // Windows (Git Bash/cmd with pwd fallback) and Unix
  useEffect(() => {
    const detectWorkingDir = async () => {
      // Try platform-appropriate commands
      const commands = navigator.platform.includes('Win')
        ? ['echo %CD%', 'cd']
        : ['pwd']
      for (const cmd of commands) {
        try {
          const result = await safeInvoke<{ stdout?: string; text?: string }>('tool_bash_execute', {
            command: cmd,
          })
          if (result) {
            const dir = (result.stdout || result.text || '').trim()
            // Validate: skip if it's literally the unexpanded variable or empty
            if (dir && dir !== '%CD%' && dir.length > 1) {
              setWorkingDir(dir)
              return
            }
          }
        } catch { /* try next command */ }
      }
    }
    detectWorkingDir()
  }, [])

  // Listen for events — use cancelled flag to handle React StrictMode double-mount
  useEffect(() => {
    let cancelled = false
    const unlisteners: (() => void)[] = []

    const setup = async () => {
      // Agent stream events (thinking, tool_call, etc.)
      const u1 = await safeListen<StreamEvent>('agent-stream', (event) => {
        if (cancelled) return
        const payload = event.payload

        if (payload.type === 'warning') {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.status === 'streaming') {
              return [...prev.slice(0, -1), {
                ...last,
                warnings: [...(last.warnings || []), payload.message || ''],
              }]
            }
            return prev
          })
        } else if (payload.type === 'error') {
          // Streaming error — show as warning (backend may retry automatically)
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.status === 'streaming') {
              return [...prev.slice(0, -1), {
                ...last,
                warnings: [...(last.warnings || []), `Stream error: ${payload.message || 'Unknown error'} (retrying...)`],
              }]
            }
            return prev
          })
        } else {
          setStreamEvent(payload)
        }
      })
      if (cancelled) { u1(); return }
      unlisteners.push(u1)

      // Agent step completed
      const u2 = await safeListen<{ conversation_id: string; step: AgentStep }>('agent-step', (event) => {
        if (cancelled) return
        const { step } = event.payload
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.status === 'streaming') {
            // Deduplicate: skip if step with same iteration already exists
            if (last.steps?.some(s => s.iteration === step.iteration && s.action?.tool === step.action?.tool)) {
              return prev
            }
            const updated = { ...last, steps: [...(last.steps || []), step] }
            return [...prev.slice(0, -1), updated]
          }
          return prev
        })
        setStreamingText('')
      })
      if (cancelled) { u2(); return }
      unlisteners.push(u2)

      // Agent completed
      const u3 = await safeListen<{
        conversation_id: string
        final_answer: string
        total_iterations: number
        usage: { total_input_tokens: number; total_output_tokens: number; tool_calls: number }
      }>('agent-complete', (event) => {
        if (cancelled) return
        const { final_answer, usage } = event.payload
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), {
              ...last,
              content: final_answer,
              status: 'completed' as const,
              usage,
              streamingText: undefined,
            }]
          }
          return prev
        })
        setIsRunning(false)
        setStreamEvent(null)
        setStreamingText('')
      })
      if (cancelled) { u3(); return }
      unlisteners.push(u3)

      // Token-level LLM streaming
      const u4 = await safeListen<LLMStreamEvent>('llm-stream', (event) => {
        if (cancelled) return
        const payload = event.payload
        if (payload.type === 'text' && payload.text) {
          setStreamingText(prev => prev + payload.text)
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.status === 'streaming') {
              return [...prev.slice(0, -1), {
                ...last,
                streamingText: (last.streamingText || '') + payload.text,
              }]
            }
            return prev
          })
        }
      })
      if (cancelled) { u4(); return }
      unlisteners.push(u4)

      // Permission request from agent (dangerous command approval)
      const u5 = await safeListen<{
        request_id: string; conversation_id: string; command: string; warning: string
      }>('agent-permission-request', (event) => {
        if (cancelled) return
        setPermissionRequest({
          request_id: event.payload.request_id,
          command: event.payload.command,
          warning: event.payload.warning,
        })
      })
      if (cancelled) { u5(); return }
      unlisteners.push(u5)
    }

    setup()
    return () => {
      cancelled = true
      unlisteners.forEach(fn => fn())
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isRunning) return
    let task = input.trim()
    setInput('')
    setStreamingText('')

    // Inject canvas context for workflow-related queries
    const wfKeywords = ['workflow', 'canvas', 'node', '워크플로우', '노드', '연결', '파이프라인', 'pipeline']
    if (wfKeywords.some(kw => task.toLowerCase().includes(kw))) {
      const { nodes, edges } = useWorkflowStore.getState()
      if (nodes.length > 0 || edges.length > 0) {
        const nodesSummary = nodes.map(n => `${n.id}(${n.data.toolRef})`).join(', ')
        task += `\n\n[Current Canvas: ${nodes.length} nodes (${nodesSummary}), ${edges.length} edges]`
      } else {
        task += '\n\n[Current Canvas: empty — no nodes or edges]'
      }
    }

    // Add user message (show original input, not augmented)
    const userMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    // Add placeholder assistant message
    const assistantMsg: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      steps: [],
      timestamp: new Date(),
      status: 'streaming',
      mode,
    }
    setMessages(prev => [...prev, assistantMsg])
    setIsRunning(true)

    try {
      const result = await safeInvoke<{
        conversation_id: string
        final_answer: string
        steps: AgentStep[]
        usage: { total_input_tokens: number; total_output_tokens: number; tool_calls: number }
      }>('agent_run_loop', {
        request: {
          task,
          conversation_id: conversationId,
          working_dir: workingDir || undefined,
          max_iterations: maxIterations,
          mode: mode === 'auto' ? undefined : mode,
          project_id: activeProject?.id || undefined,
        },
      })

      if (result) {
        setConversationId(result.conversation_id)
        // Final update — only if not already completed by agent-complete event
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && last.status !== 'completed') {
            // Use event-accumulated steps if available, otherwise use result steps
            const mergedSteps = (last.steps && last.steps.length > 0)
              ? last.steps
              : result.steps
            return [...prev.slice(0, -1), {
              ...last,
              content: result.final_answer,
              steps: mergedSteps,
              status: 'completed' as const,
              usage: result.usage,
              streamingText: undefined,
            }]
          }
          // Already completed by event — just ensure conversation_id is set
          return prev
        })
      }
    } catch (e) {
      setLastFailedInput(input.trim())
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          return [...prev.slice(0, -1), {
            ...last,
            content: `${e instanceof Error ? e.message : String(e)}`,
            status: 'error' as const,
            streamingText: undefined,
          }]
        }
        return prev
      })
    } finally {
      setIsRunning(false)
      setStreamEvent(null)
      setStreamingText('')
    }
  }, [input, isRunning, conversationId, workingDir, mode, maxIterations])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const clearConversation = useCallback(async () => {
    if (conversationId) {
      await safeInvoke('agent_clear_conversation', { conversationId })
    }
    setMessages([])
    setConversationId(null)
    setStreamingText('')
    setLastFailedInput(null)
    try { localStorage.removeItem('handbox_agent_conv_id') } catch { /* ignore */ }
  }, [conversationId])

  // Fetch conversation history list (filtered by active project)
  const fetchHistory = useCallback(async () => {
    const projectFilter = activeProject?.id || undefined
    const result = await safeInvoke<{
      conversations: { id: string; title: string; updated_at: string; message_count: number }[]
    }>('agent_list_conversations', { projectId: projectFilter })
    if (result?.conversations) {
      setHistoryList(result.conversations)
    }
  }, [activeProject])

  // Reset conversation when project changes
  const prevProjectRef = useRef(activeProject?.id)
  useEffect(() => {
    if (prevProjectRef.current !== activeProject?.id) {
      prevProjectRef.current = activeProject?.id
      // Reset to new conversation for the new project
      setMessages([])
      setConversationId(null)
      setStreamingText('')
      try { localStorage.removeItem('handbox_agent_conv_id') } catch { /* ignore */ }
      // Refresh history if panel is open
      if (showHistory) fetchHistory()
    }
  }, [activeProject, showHistory, fetchHistory])

  // Load a previous conversation
  const loadConversation = useCallback(async (convId: string) => {
    const result = await safeInvoke<{
      conversation_id: string
      messages: { role: string; content: string }[]
    }>('agent_get_conversation', { conversationId: convId })

    if (result?.messages) {
      const loaded: AgentMessage[] = result.messages.map((m, i) => ({
        id: `loaded-${i}`,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: new Date(),
        status: 'completed' as const,
      }))
      setMessages(loaded)
      setConversationId(convId)
      setShowHistory(false)
    }
  }, [])

  // Retry last failed message — removes error + user message, then auto-resubmits
  const handleRetry = useCallback(() => {
    if (!lastFailedInput) return
    const retryText = lastFailedInput
    // Remove the error message pair
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last && last.status === 'error') {
        return prev.slice(0, -2) // Remove both the error response and the user message
      }
      return prev
    })
    setLastFailedInput(null)
    // Auto-resubmit after state update
    setTimeout(() => {
      setInput(retryText)
      // Trigger submit on next tick after input is set
      setTimeout(() => {
        const form = document.querySelector('[data-agent-submit]') as HTMLButtonElement | null
        form?.click()
      }, 50)
    }, 50)
  }, [lastFailedInput])

  const respondPermission = useCallback(async (approved: boolean) => {
    if (!permissionRequest) return
    // Emit response back to Rust via Tauri event
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit('agent-permission-response', {
        request_id: permissionRequest.request_id,
        approved,
      })
    } catch {
      // Fallback: not in Tauri environment
    }
    setPermissionRequest(null)
  }, [permissionRequest])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-950 border border-neutral-700 rounded-xl shadow-2xl w-[800px] max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-h-[700px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-neutral-200">AI Agent</h2>
            <ProjectSelector />
            <ModeSelector mode={mode} onChange={setMode} />
            {workingDir && (
              <span className="text-[10px] text-neutral-600 font-mono truncate max-w-[200px]">
                {workingDir}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchHistory() }}
              className={`p-1.5 rounded hover:bg-neutral-800 ${showHistory ? 'text-violet-400' : 'text-neutral-500 hover:text-neutral-300'}`}
              title="대화 기록"
            >
              <History size={14} />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded hover:bg-neutral-800 ${showSettings ? 'text-violet-400' : 'text-neutral-500 hover:text-neutral-300'}`}
              title="설정"
            >
              <Settings2 size={14} />
            </button>
            <button
              onClick={clearConversation}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
              title="대화 초기화"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Settings panel (collapsible) */}
        {showSettings && (
          <div className="px-4 py-2 border-b border-neutral-800 bg-neutral-900/30 flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2 text-neutral-400">
              Max iterations:
              <input
                type="number"
                min={1}
                max={50}
                value={maxIterations}
                onChange={(e) => setMaxIterations(Math.min(50, Math.max(1, parseInt(e.target.value) || 25)))}
                className="w-14 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 text-center"
              />
            </label>
            <label className="flex items-center gap-2 text-neutral-400">
              Working dir:
              <input
                type="text"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                className="flex-1 px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-200 font-mono text-[10px] min-w-[200px]"
              />
            </label>
          </div>
        )}

        {/* Conversation History Sidebar */}
        {showHistory && (
          <div className="border-b border-neutral-800 bg-neutral-900/50 max-h-60 overflow-y-auto">
            <div className="px-3 py-2 flex items-center justify-between sticky top-0 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800/50">
              <span className="text-xs font-medium text-neutral-400">Past Conversations</span>
              <button
                onClick={() => { clearConversation(); setShowHistory(false) }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-violet-600/20 text-violet-400 hover:bg-violet-600/30"
              >
                <Plus size={10} />
                New
              </button>
            </div>
            {historyList.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-neutral-600">
                저장된 대화가 없습니다
              </div>
            ) : (
              <div className="py-1">
                {historyList.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full px-3 py-2 text-left hover:bg-neutral-800/50 transition-colors flex items-start gap-2 ${
                      conv.id === conversationId ? 'bg-violet-900/20 border-l-2 border-violet-500' : ''
                    }`}
                  >
                    <MessageCircle size={12} className="text-neutral-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-300 truncate">{conv.title}</p>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-600 mt-0.5">
                        <span>{conv.message_count} messages</span>
                        <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-4">
              <Bot size={40} className="text-violet-500/30" />
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-neutral-400">Handbox AI Agent</p>
                <p className="text-xs text-neutral-600 max-w-sm">
                  코드 작성, 파일 편집, 웹 검색, Git 작업 등<br />
                  Claude Code 수준의 AI 에이전트입니다.
                </p>
                <div className="flex items-center gap-2 justify-center mt-1">
                  <span className="text-[10px] text-neutral-700">Mode:</span>
                  <span className="text-[10px] text-violet-400 font-medium">{mode}</span>
                  <span className="text-[10px] text-neutral-700">|</span>
                  <span className="text-[10px] text-neutral-700">16 tools</span>
                  <span className="text-[10px] text-neutral-700">|</span>
                  <span className="text-[10px] text-neutral-700">Streaming</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 max-w-md justify-center mt-2">
                {[
                  '프로젝트 구조를 분석해줘',
                  'TODO가 있는 코드를 찾아줘',
                  '이 프로젝트의 아키텍처를 설명해줘',
                  'package.json 의존성을 확인해줘',
                ].map(example => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="px-3 py-1.5 rounded-full text-[11px] bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border border-neutral-800 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <MessageView
                  key={msg.id}
                  message={msg}
                  onRetry={msg.status === 'error' && lastFailedInput ? handleRetry : undefined}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Streaming indicator */}
        <StreamingIndicator
          event={isRunning ? streamEvent : null}
          streamingText={isRunning ? streamingText : ''}
        />

        {/* Input */}
        <div className="border-t border-neutral-800 p-3 bg-neutral-900/30">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                // Auto-resize textarea
                const el = e.target
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 128) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'plan' ? '계획을 세울 작업을 설명하세요...' :
                mode === 'execute' ? '실행할 작업을 지시하세요...' :
                '에이전트에게 작업을 요청하세요...'
              }
              rows={1}
              className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-violet-600 max-h-32 overflow-y-auto"
              style={{ minHeight: '38px' }}
              disabled={isRunning}
            />
            {isRunning ? (
              <button
                onClick={() => {
                  safeInvoke('agent_cancel_loop', {
                    conversationId: conversationId || undefined,
                  }).catch(() => {})
                }}
                className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white shrink-0"
                title="중지"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                data-agent-submit
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={18} />
              </button>
            )}
          </div>
          <p className="text-center text-[10px] text-neutral-700 mt-1.5">
            Enter로 전송 · Shift+Enter로 줄바꿈 · Ctrl+Shift+A로 토글
          </p>
        </div>
      </div>

      {/* Permission approval dialog */}
      {permissionRequest && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 rounded-xl">
          <div className="bg-neutral-900 border border-amber-700 rounded-lg p-4 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="text-sm font-bold text-amber-400">Permission Required</h3>
            </div>
            <p className="text-xs text-neutral-300 mb-2">{permissionRequest.warning}</p>
            <pre className="text-[11px] font-mono bg-neutral-950 rounded p-2 mb-3 text-red-400 overflow-x-auto border border-neutral-800">
              {permissionRequest.command}
            </pre>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => respondPermission(false)}
                className="px-3 py-1.5 rounded text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
              >
                Deny
              </button>
              <button
                onClick={() => respondPermission(true)}
                className="px-3 py-1.5 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
