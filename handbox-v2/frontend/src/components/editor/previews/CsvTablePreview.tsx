import { memo, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from '@tanstack/react-table'
import type { PreviewRendererProps } from '@/types/preview'

export const CsvTablePreview = memo(function CsvTablePreview({ data, mode }: PreviewRendererProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const { columns, rows } = useMemo(() => {
    const obj = data as Record<string, unknown>
    const rawRows = (obj?.['rows'] ?? obj?.['data'] ?? []) as Record<string, unknown>[]
    const colNames = (obj?.['columns'] ?? (rawRows[0] ? Object.keys(rawRows[0]) : [])) as string[]
    const maxRows = mode === 'inline' ? 8 : rawRows.length

    const cols: ColumnDef<Record<string, unknown>>[] = colNames.map(name => ({
      accessorKey: name,
      header: name,
      cell: info => {
        const val = info.getValue()
        return val === null || val === undefined ? '' : String(val)
      },
    }))

    return { columns: cols, rows: rawRows.slice(0, maxRows) }
  }, [data, mode])

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (rows.length === 0) {
    return <div className="p-2 text-[10px] text-neutral-500">No data</div>
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: mode === 'inline' ? 160 : undefined }}>
      <table className="w-full text-[9px] border-collapse">
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => (
                <th
                  key={header.id}
                  className="px-1 py-0.5 text-left text-neutral-400 border-b border-neutral-700 cursor-pointer select-none bg-neutral-800/50 sticky top-0"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className="hover:bg-neutral-800/30">
              {row.getVisibleCells().map(cell => (
                <td key={cell.id} className="px-1 py-0.5 text-neutral-300 border-b border-neutral-800 truncate max-w-[120px]">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {mode === 'inline' && (data as Record<string, unknown>)?.['row_count'] != null && (
        <div className="text-[9px] text-neutral-500 p-1">
          Showing {rows.length} of {String((data as Record<string, unknown>)['row_count'])} rows
        </div>
      )}
    </div>
  )
})
