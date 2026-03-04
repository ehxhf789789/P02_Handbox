import { memo, useState } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value === null) return <span className="text-neutral-500">{name && <Key name={name} />}null</span>
  if (typeof value === 'boolean') return <span className="text-orange-400">{name && <Key name={name} />}{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-400">{name && <Key name={name} />}{value}</span>
  if (typeof value === 'string') {
    const display = value.length > 80 ? value.slice(0, 80) + '...' : value
    return <span className="text-green-400">{name && <Key name={name} />}"{display}"</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{name && <Key name={name} />}[]</span>
    return (
      <div>
        <span className="cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
          {name && <Key name={name} />}
          <span className="text-neutral-500">{expanded ? '▼' : '▶'} [{value.length}]</span>
        </span>
        {expanded && (
          <div className="ml-3 border-l border-neutral-700 pl-2">
            {value.slice(0, 50).map((item, i) => (
              <div key={i}><JsonNode name={String(i)} value={item} depth={depth + 1} /></div>
            ))}
            {value.length > 50 && <div className="text-neutral-500">... {value.length - 50} more</div>}
          </div>
        )}
      </div>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span>{name && <Key name={name} />}{'{}'}</span>
    return (
      <div>
        <span className="cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
          {name && <Key name={name} />}
          <span className="text-neutral-500">{expanded ? '▼' : '▶'} {`{${entries.length}}`}</span>
        </span>
        {expanded && (
          <div className="ml-3 border-l border-neutral-700 pl-2">
            {entries.slice(0, 50).map(([k, v]) => (
              <div key={k}><JsonNode name={k} value={v} depth={depth + 1} /></div>
            ))}
            {entries.length > 50 && <div className="text-neutral-500">... {entries.length - 50} more</div>}
          </div>
        )}
      </div>
    )
  }

  return <span>{String(value)}</span>
}

function Key({ name }: { name: string }) {
  return <span className="text-purple-400">"{name}": </span>
}

export const JsonTreePreview = memo(function JsonTreePreview({ data, mode }: PreviewRendererProps) {
  const parsed = typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return data } })() : data

  return (
    <div className="text-[10px] leading-tight p-2 font-mono overflow-auto" style={{ maxHeight: mode === 'inline' ? 160 : undefined }}>
      <JsonNode value={parsed} depth={0} />
    </div>
  )
})
