/**
 * Shared types for tool catalogs.
 * This file is imported by all catalog files to avoid circular dependencies.
 */

export interface CatalogConfigField {
  name: string
  type: 'string' | 'number' | 'select' | 'boolean' | 'file' | 'files' | 'folder' | 'multiselect'
  label: string
  default?: unknown
  defaultValue?: unknown
  options?: { value: string; label: string }[]
  description?: string
  placeholder?: string
  required?: boolean
  // File picker options
  fileFilters?: { name: string; extensions: string[] }[]
  multiple?: boolean
}

export interface CatalogToolDef {
  id: string
  label?: string
  name?: string
  category: string
  description: string
  icon: string
  inputs: { name: string; type: string; required?: boolean; description?: string }[]
  outputs: { name: string; type: string; description?: string }[]
  configFields: CatalogConfigField[]
}

export interface CatalogCategory {
  id: string
  label: string
  icon: string
  color: string
  tools: CatalogToolDef[]
}

/**
 * Utility to normalize a tool definition (handle label/name variations)
 */
export function normalizeToolDef(tool: CatalogToolDef): CatalogToolDef {
  return {
    ...tool,
    label: tool.label || tool.name || tool.id,
    name: tool.name || tool.label || tool.id,
  }
}
