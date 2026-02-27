/**
 * FilePickerInput — file/folder selection component using Tauri dialog.
 * Supports single file, multiple files, and folder selection.
 */

import { open } from '@tauri-apps/plugin-dialog'
import { File, FolderOpen, X, Plus } from 'lucide-react'

export interface FileFilter {
  name: string
  extensions: string[]
}

interface FilePickerInputProps {
  type: 'file' | 'files' | 'folder'
  value: string | string[]
  onChange: (value: string | string[]) => void
  fileFilters?: FileFilter[]
  label?: string
  placeholder?: string
}

export function FilePickerInput({
  type,
  value,
  onChange,
  fileFilters,
  label,
  placeholder,
}: FilePickerInputProps) {
  const handleOpenDialog = async () => {
    try {
      if (type === 'folder') {
        const selected = await open({
          directory: true,
          multiple: false,
          title: label || 'Select Folder',
        })
        if (selected) {
          onChange(selected as string)
        }
      } else if (type === 'files') {
        const selected = await open({
          directory: false,
          multiple: true,
          title: label || 'Select Files',
          filters: fileFilters?.map((f) => ({
            name: f.name,
            extensions: f.extensions,
          })),
        })
        if (selected) {
          const newFiles = Array.isArray(selected) ? selected : [selected]
          const currentFiles = Array.isArray(value) ? value : []
          // Merge without duplicates
          const merged = [...new Set([...currentFiles, ...newFiles])]
          onChange(merged)
        }
      } else {
        // Single file
        const selected = await open({
          directory: false,
          multiple: false,
          title: label || 'Select File',
          filters: fileFilters?.map((f) => ({
            name: f.name,
            extensions: f.extensions,
          })),
        })
        if (selected) {
          onChange(selected as string)
        }
      }
    } catch (error) {
      console.error('File dialog error:', error)
    }
  }

  const handleRemoveFile = (index: number) => {
    if (Array.isArray(value)) {
      const newValue = value.filter((_, i) => i !== index)
      onChange(newValue)
    }
  }

  const handleClear = () => {
    onChange(type === 'files' ? [] : '')
  }

  const getFileName = (path: string) => {
    return path.split(/[\\/]/).pop() || path
  }

  const Icon = type === 'folder' ? FolderOpen : File

  // Single file or folder
  if (type !== 'files') {
    const pathValue = typeof value === 'string' ? value : ''
    return (
      <div className="space-y-1">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleOpenDialog}
            className="flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-md
                       bg-neutral-900 border border-neutral-800 text-neutral-200
                       hover:border-neutral-600 hover:bg-neutral-850 transition-colors
                       text-left"
          >
            <Icon size={14} className="text-neutral-500 shrink-0" />
            <span className="truncate flex-1">
              {pathValue ? getFileName(pathValue) : (placeholder || 'Click to select...')}
            </span>
          </button>
          {pathValue && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-md bg-neutral-900 border border-neutral-800
                         text-neutral-500 hover:text-red-400 hover:border-red-900/50
                         transition-colors"
              title="Clear"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {pathValue && (
          <p className="text-[10px] text-neutral-600 truncate px-1" title={pathValue}>
            {pathValue}
          </p>
        )}
      </div>
    )
  }

  // Multiple files
  const filesArray = Array.isArray(value) ? value : []
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleOpenDialog}
        className="w-full flex items-center justify-center gap-2 px-2.5 py-1.5 text-xs rounded-md
                   bg-neutral-900 border border-dashed border-neutral-700 text-neutral-400
                   hover:border-neutral-500 hover:text-neutral-300 transition-colors"
      >
        <Plus size={14} />
        Add Files
      </button>

      {filesArray.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {filesArray.map((filePath, index) => (
            <div
              key={filePath}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-900/50
                         border border-neutral-800 group"
            >
              <File size={12} className="text-neutral-500 shrink-0" />
              <span className="text-[10px] text-neutral-300 truncate flex-1" title={filePath}>
                {getFileName(filePath)}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="p-0.5 rounded text-neutral-600 hover:text-red-400
                           opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {filesArray.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-neutral-600">
            {filesArray.length} file{filesArray.length !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
