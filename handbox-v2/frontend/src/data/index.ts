/**
 * Data module exports
 *
 * Provides access to all tool catalogs and related utilities.
 */

// Main tool catalog
export {
  toolCategories,
  allTools,
  getToolDef,
  getCategoryColor,
  getAllCategories,
  getToolsByCategory,
  searchTools,
  gisCategories,
  ifcCategories,
  fusionCategories,
  type ConfigField,
  type ToolDef,
  type ToolCategory,
} from './toolCatalog'

// Catalog loader for initializing domain tools
export {
  loadAllCatalogs,
  loadGisTools,
  loadIfcTools,
  loadFusionTools,
  getCatalogStats,
  gisToolCategories,
  allGisTools,
  ifcToolCategories,
  allIfcTools,
  fusionToolCatalog,
} from './catalogLoader'

// Shared catalog types
export type {
  CatalogConfigField,
  CatalogToolDef,
  CatalogCategory,
} from './catalogTypes'
export { normalizeToolDef } from './catalogTypes'
