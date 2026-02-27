/**
 * Catalog Loader - Dynamically loads and integrates all tool catalogs.
 *
 * This module imports the individual domain catalogs (GIS, IFC, Fusion)
 * and populates the main toolCategories array with their tools.
 */

import { toolCategories, type ToolDef, type ConfigField } from './toolCatalog'
import { gisToolCategories, allGisTools } from './gisToolCatalog'
import { ifcToolCategories, allIfcTools } from './ifcToolCatalog'
import { fusionToolCatalog, fusionCategories as fusionCategoryNames } from './fusionToolCatalog'

// ============================================================================
// Type converters
// ============================================================================

/**
 * Convert a tool definition from the domain-specific format to the main catalog format.
 */
function convertToToolDef(
  tool: {
    id: string
    label?: string
    name?: string
    category: string
    description: string
    icon: string
    inputs: Array<{ name: string; type: string; required?: boolean; description?: string }>
    outputs: Array<{ name: string; type: string; description?: string }>
    configFields?: Array<{
      name: string
      label: string
      type: string
      default?: unknown
      defaultValue?: unknown
      options?: Array<{ value: string; label: string }>
      description?: string
      placeholder?: string
    }>
  },
  targetCategory: string
): ToolDef {
  return {
    id: tool.id,
    label: tool.label || tool.name || tool.id,
    category: targetCategory,
    description: tool.description,
    icon: tool.icon,
    inputs: tool.inputs.map(i => ({
      name: i.name,
      type: i.type,
      required: i.required,
      description: i.description,
    })),
    outputs: tool.outputs.map(o => ({
      name: o.name,
      type: o.type,
      description: o.description,
    })),
    configFields: (tool.configFields || []).map(cf => ({
      name: cf.name,
      label: cf.label,
      type: cf.type as ConfigField['type'],
      default: cf.default ?? cf.defaultValue,
      options: cf.options,
      description: cf.description,
      placeholder: cf.placeholder,
    })),
  }
}

// ============================================================================
// Loader functions
// ============================================================================

/**
 * Load GIS tools into the main catalog
 */
export function loadGisTools(): void {
  // Find the GIS categories in the main catalog
  const gisIo = toolCategories.find(c => c.id === 'gis-io')
  const gisTransform = toolCategories.find(c => c.id === 'gis-transform')
  const gisAnalysis = toolCategories.find(c => c.id === 'gis-analysis')

  // Load from gisToolCategories
  for (const gisCat of gisToolCategories) {
    let targetCat
    if (gisCat.id === 'gis-io') targetCat = gisIo
    else if (gisCat.id === 'gis-transform') targetCat = gisTransform
    else if (gisCat.id === 'gis-analysis') targetCat = gisAnalysis

    if (targetCat && targetCat.tools.length === 0) {
      targetCat.tools = gisCat.tools.map(t => convertToToolDef(t, targetCat!.id))
    }
  }
}

/**
 * Load IFC tools into the main catalog
 */
export function loadIfcTools(): void {
  const ifcIo = toolCategories.find(c => c.id === 'ifc-io')
  const ifcAnalysis = toolCategories.find(c => c.id === 'ifc-analysis')
  const ifcTransform = toolCategories.find(c => c.id === 'ifc-transform')
  const ifcExport = toolCategories.find(c => c.id === 'ifc-export')

  for (const ifcCat of ifcToolCategories) {
    let targetCat
    if (ifcCat.id === 'ifc-io') targetCat = ifcIo
    else if (ifcCat.id === 'ifc-analysis') targetCat = ifcAnalysis
    else if (ifcCat.id === 'ifc-transform') targetCat = ifcTransform
    else if (ifcCat.id === 'ifc-export') targetCat = ifcExport

    if (targetCat && targetCat.tools.length === 0) {
      targetCat.tools = ifcCat.tools.map(t => convertToToolDef(t, targetCat!.id))
    }
  }
}

/**
 * Load Fusion tools into the main catalog
 */
export function loadFusionTools(): void {
  const fusionIo = toolCategories.find(c => c.id === 'fusion-io')
  const fusionAlignment = toolCategories.find(c => c.id === 'fusion-alignment')
  const fusionLinking = toolCategories.find(c => c.id === 'fusion-linking')
  const fusionAnalysis = toolCategories.find(c => c.id === 'fusion-analysis')
  const fusionExport = toolCategories.find(c => c.id === 'fusion-export')

  // Map category names to target categories
  const categoryMap: Record<string, typeof fusionIo> = {
    'Fusion I/O': fusionIo,
    'Fusion Alignment': fusionAlignment,
    'Fusion Linking': fusionLinking,
    'Fusion Analysis': fusionAnalysis,
    'Fusion Export': fusionExport,
  }

  for (const tool of fusionToolCatalog) {
    const targetCat = categoryMap[tool.category]
    if (targetCat && !targetCat.tools.find(t => t.id === tool.id)) {
      targetCat.tools.push(convertToToolDef(tool as any, targetCat.id))
    }
  }
}

/**
 * Load all domain-specific tools into the main catalog.
 * Call this once at application startup.
 */
export function loadAllCatalogs(): void {
  loadGisTools()
  loadIfcTools()
  loadFusionTools()
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics about loaded tools
 */
export function getCatalogStats(): {
  totalCategories: number
  totalTools: number
  byCategory: Record<string, number>
} {
  const stats = {
    totalCategories: toolCategories.length,
    totalTools: 0,
    byCategory: {} as Record<string, number>,
  }

  for (const cat of toolCategories) {
    stats.byCategory[cat.id] = cat.tools.length
    stats.totalTools += cat.tools.length
  }

  return stats
}

// ============================================================================
// Direct access to domain catalogs
// ============================================================================

export {
  gisToolCategories,
  allGisTools,
  ifcToolCategories,
  allIfcTools,
  fusionToolCatalog,
  fusionCategoryNames,
}
