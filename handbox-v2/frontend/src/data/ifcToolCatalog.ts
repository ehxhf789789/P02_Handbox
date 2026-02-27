/**
 * IFC Tool Catalog — Workflow nodes for IFC 4x3 processing.
 *
 * Categories:
 * - IFC I/O: Read/write IFC files
 * - IFC Analysis: Structure extraction, property analysis
 * - IFC Transform: Filter, merge, modify
 * - IFC Export: Export summaries, reports
 */

import type { ToolDef, ToolCategory } from './toolCatalog'

// ========== IFC Input/Output Tools ==========

const ifcIoTools: ToolDef[] = [
  {
    id: 'ifc-read',
    label: 'IFC Read',
    category: 'ifc-io',
    description: 'Read and parse IFC file (supports IFC4x3)',
    icon: 'FileBox',
    inputs: [],
    outputs: [
      { name: 'model', type: 'ifc-model' },
      { name: 'statistics', type: 'json' },
      { name: 'schema', type: 'string' },
    ],
    configFields: [
      {
        name: 'file_path',
        type: 'file',
        label: 'IFC File',
        default: '',
        fileFilters: [
          { name: 'IFC Files', extensions: ['ifc', 'ifczip'] },
        ],
      },
    ],
  },
  {
    id: 'ifc-write',
    label: 'IFC Write',
    category: 'ifc-io',
    description: 'Write IFC model to file',
    icon: 'Save',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'path', type: 'string' },
      { name: 'success', type: 'boolean' },
    ],
    configFields: [
      {
        name: 'output_path',
        type: 'string',
        label: 'Output Path',
        default: 'output.ifc',
      },
      {
        name: 'schema',
        type: 'select',
        label: 'IFC Schema',
        default: 'IFC4X3',
        options: [
          { value: 'IFC4X3', label: 'IFC 4x3' },
          { value: 'IFC4', label: 'IFC 4' },
          { value: 'IFC2X3', label: 'IFC 2x3' },
        ],
      },
    ],
  },
  {
    id: 'ifc-validate',
    label: 'IFC Validate',
    category: 'ifc-io',
    description: 'Validate IFC file against schema',
    icon: 'CheckSquare',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'valid', type: 'boolean' },
      { name: 'errors', type: 'array' },
      { name: 'warnings', type: 'array' },
    ],
    configFields: [
      {
        name: 'strict_mode',
        type: 'boolean',
        label: 'Strict Validation',
        default: false,
      },
    ],
  },
]

// ========== IFC Analysis Tools ==========

const ifcAnalysisTools: ToolDef[] = [
  {
    id: 'ifc-extract-hierarchy',
    label: 'Extract Spatial Hierarchy',
    category: 'ifc-analysis',
    description: 'Extract spatial structure (Project > Site > Building > Storey > Space)',
    icon: 'GitBranch',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'hierarchy', type: 'json' },
      { name: 'treeData', type: 'array' },
    ],
    configFields: [
      {
        name: 'include_elements',
        type: 'boolean',
        label: 'Include Elements in Tree',
        default: true,
      },
      {
        name: 'max_depth',
        type: 'number',
        label: 'Max Depth',
        default: 10,
      },
    ],
  },
  {
    id: 'ifc-extract-elements',
    label: 'Extract Elements',
    category: 'ifc-analysis',
    description: 'Extract building elements by type',
    icon: 'Boxes',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'elements', type: 'array' },
      { name: 'count', type: 'number' },
      { name: 'summary', type: 'json' },
    ],
    configFields: [
      {
        name: 'element_types',
        type: 'string',
        label: 'Element Types (comma-separated, empty for all)',
        default: '',
      },
      {
        name: 'include_properties',
        type: 'boolean',
        label: 'Include Properties',
        default: true,
      },
    ],
  },
  {
    id: 'ifc-extract-properties',
    label: 'Extract Properties',
    category: 'ifc-analysis',
    description: 'Extract property sets and values for elements',
    icon: 'List',
    inputs: [
      { name: 'model', type: 'ifc-model' },
      { name: 'entityId', type: 'number' },
    ],
    outputs: [
      { name: 'propertySets', type: 'array' },
      { name: 'quantities', type: 'array' },
    ],
    configFields: [
      {
        name: 'pset_filter',
        type: 'string',
        label: 'Property Set Filter (regex)',
        default: '',
      },
    ],
  },
  {
    id: 'ifc-extract-quantities',
    label: 'Extract Quantities',
    category: 'ifc-analysis',
    description: 'Extract quantity take-off data',
    icon: 'Calculator',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'quantities', type: 'array' },
      { name: 'totalArea', type: 'number' },
      { name: 'totalVolume', type: 'number' },
    ],
    configFields: [
      {
        name: 'element_types',
        type: 'string',
        label: 'Element Types',
        default: '',
      },
      {
        name: 'unit_system',
        type: 'select',
        label: 'Unit System',
        default: 'metric',
        options: [
          { value: 'metric', label: 'Metric (m, m², m³)' },
          { value: 'imperial', label: 'Imperial (ft, ft², ft³)' },
        ],
      },
    ],
  },
  {
    id: 'ifc-extract-materials',
    label: 'Extract Materials',
    category: 'ifc-analysis',
    description: 'Extract material information',
    icon: 'Palette',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'materials', type: 'array' },
      { name: 'materialAssignments', type: 'array' },
    ],
    configFields: [],
  },
  {
    id: 'ifc-extract-relationships',
    label: 'Extract Relationships',
    category: 'ifc-analysis',
    description: 'Analyze relationships between entities',
    icon: 'Network',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'relationships', type: 'array' },
      { name: 'summary', type: 'json' },
      { name: 'graph', type: 'json' },
    ],
    configFields: [
      {
        name: 'relationship_types',
        type: 'string',
        label: 'Relationship Types (comma-separated)',
        default: '',
      },
    ],
  },
  {
    id: 'ifc-extract-classes',
    label: 'Extract Class Instances',
    category: 'ifc-analysis',
    description: 'Get all instances of a specific IFC class',
    icon: 'Layers',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'instances', type: 'array' },
      { name: 'count', type: 'number' },
    ],
    configFields: [
      {
        name: 'class_name',
        type: 'select',
        label: 'IFC Class',
        default: 'IfcWall',
        options: [
          { value: 'IfcWall', label: 'IfcWall' },
          { value: 'IfcSlab', label: 'IfcSlab' },
          { value: 'IfcBeam', label: 'IfcBeam' },
          { value: 'IfcColumn', label: 'IfcColumn' },
          { value: 'IfcDoor', label: 'IfcDoor' },
          { value: 'IfcWindow', label: 'IfcWindow' },
          { value: 'IfcStair', label: 'IfcStair' },
          { value: 'IfcRoof', label: 'IfcRoof' },
          { value: 'IfcSpace', label: 'IfcSpace' },
          { value: 'IfcBuildingStorey', label: 'IfcBuildingStorey' },
        ],
      },
      {
        name: 'include_subtypes',
        type: 'boolean',
        label: 'Include Subtypes',
        default: true,
      },
    ],
  },
  {
    id: 'ifc-search',
    label: 'Search Entities',
    category: 'ifc-analysis',
    description: 'Search IFC entities by criteria',
    icon: 'Search',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'results', type: 'array' },
      { name: 'count', type: 'number' },
    ],
    configFields: [
      {
        name: 'search_type',
        type: 'select',
        label: 'Search By',
        default: 'name',
        options: [
          { value: 'name', label: 'Name' },
          { value: 'globalId', label: 'Global ID' },
          { value: 'type', label: 'Entity Type' },
          { value: 'property', label: 'Property Value' },
        ],
      },
      {
        name: 'search_value',
        type: 'string',
        label: 'Search Value',
        default: '',
      },
      {
        name: 'case_sensitive',
        type: 'boolean',
        label: 'Case Sensitive',
        default: false,
      },
    ],
  },
  {
    id: 'ifc-statistics',
    label: 'Model Statistics',
    category: 'ifc-analysis',
    description: 'Get comprehensive model statistics',
    icon: 'BarChart2',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'statistics', type: 'json' },
      { name: 'entityCounts', type: 'array' },
      { name: 'totalEntities', type: 'number' },
    ],
    configFields: [],
  },
]

// ========== IFC Transform Tools ==========

const ifcTransformTools: ToolDef[] = [
  {
    id: 'ifc-filter-elements',
    label: 'Filter Elements',
    category: 'ifc-transform',
    description: 'Filter elements by type or property',
    icon: 'Filter',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'filteredModel', type: 'ifc-model' },
      { name: 'filteredElements', type: 'array' },
    ],
    configFields: [
      {
        name: 'filter_type',
        type: 'select',
        label: 'Filter Type',
        default: 'element_type',
        options: [
          { value: 'element_type', label: 'By Element Type' },
          { value: 'storey', label: 'By Storey' },
          { value: 'property', label: 'By Property Value' },
          { value: 'material', label: 'By Material' },
        ],
      },
      {
        name: 'filter_value',
        type: 'string',
        label: 'Filter Value',
        default: '',
      },
      {
        name: 'invert',
        type: 'boolean',
        label: 'Invert Selection',
        default: false,
      },
    ],
  },
  {
    id: 'ifc-merge',
    label: 'Merge Models',
    category: 'ifc-transform',
    description: 'Merge multiple IFC models',
    icon: 'GitMerge',
    inputs: [
      { name: 'model1', type: 'ifc-model' },
      { name: 'model2', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'mergedModel', type: 'ifc-model' },
    ],
    configFields: [
      {
        name: 'deduplicate',
        type: 'boolean',
        label: 'Remove Duplicates',
        default: true,
      },
    ],
  },
  {
    id: 'ifc-split-by-storey',
    label: 'Split by Storey',
    category: 'ifc-transform',
    description: 'Split model by building storey',
    icon: 'Layers',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'storeyModels', type: 'array' },
      { name: 'storeyNames', type: 'array' },
    ],
    configFields: [],
  },
  {
    id: 'ifc-add-property',
    label: 'Add Property',
    category: 'ifc-transform',
    description: 'Add custom property to elements',
    icon: 'Plus',
    inputs: [
      { name: 'model', type: 'ifc-model' },
      { name: 'elementIds', type: 'array' },
    ],
    outputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    configFields: [
      {
        name: 'pset_name',
        type: 'string',
        label: 'Property Set Name',
        default: 'Pset_Custom',
      },
      {
        name: 'property_name',
        type: 'string',
        label: 'Property Name',
        default: '',
      },
      {
        name: 'property_value',
        type: 'string',
        label: 'Property Value',
        default: '',
      },
      {
        name: 'property_type',
        type: 'select',
        label: 'Property Type',
        default: 'IfcLabel',
        options: [
          { value: 'IfcLabel', label: 'Text (Label)' },
          { value: 'IfcText', label: 'Text (Long)' },
          { value: 'IfcReal', label: 'Number (Real)' },
          { value: 'IfcInteger', label: 'Number (Integer)' },
          { value: 'IfcBoolean', label: 'Boolean' },
        ],
      },
    ],
  },
]

// ========== IFC Export Tools ==========

const ifcExportTools: ToolDef[] = [
  {
    id: 'ifc-export-json',
    label: 'Export to JSON',
    category: 'ifc-export',
    description: 'Export model summary as JSON',
    icon: 'Braces',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'json', type: 'string' },
    ],
    configFields: [
      {
        name: 'include_hierarchy',
        type: 'boolean',
        label: 'Include Hierarchy',
        default: true,
      },
      {
        name: 'include_properties',
        type: 'boolean',
        label: 'Include Properties',
        default: true,
      },
      {
        name: 'include_geometry',
        type: 'boolean',
        label: 'Include Geometry',
        default: false,
      },
    ],
  },
  {
    id: 'ifc-export-csv',
    label: 'Export to CSV',
    category: 'ifc-export',
    description: 'Export element list as CSV',
    icon: 'Table',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'csv', type: 'string' },
    ],
    configFields: [
      {
        name: 'columns',
        type: 'string',
        label: 'Columns (comma-separated)',
        default: 'id,globalId,type,name',
      },
      {
        name: 'element_types',
        type: 'string',
        label: 'Element Types (empty for all)',
        default: '',
      },
    ],
  },
  {
    id: 'ifc-export-excel',
    label: 'Export to Excel',
    category: 'ifc-export',
    description: 'Export quantities and properties to Excel',
    icon: 'Sheet',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'path', type: 'string' },
    ],
    configFields: [
      {
        name: 'output_path',
        type: 'string',
        label: 'Output Path',
        default: 'ifc_export.xlsx',
      },
      {
        name: 'sheets',
        type: 'string',
        label: 'Sheets (elements,quantities,materials)',
        default: 'elements,quantities',
      },
    ],
  },
  {
    id: 'ifc-export-report',
    label: 'Generate Report',
    category: 'ifc-export',
    description: 'Generate comprehensive model report',
    icon: 'FileText',
    inputs: [
      { name: 'model', type: 'ifc-model' },
    ],
    outputs: [
      { name: 'report', type: 'string' },
      { name: 'reportHtml', type: 'string' },
    ],
    configFields: [
      {
        name: 'format',
        type: 'select',
        label: 'Report Format',
        default: 'markdown',
        options: [
          { value: 'markdown', label: 'Markdown' },
          { value: 'html', label: 'HTML' },
          { value: 'text', label: 'Plain Text' },
        ],
      },
      {
        name: 'sections',
        type: 'string',
        label: 'Sections',
        default: 'overview,hierarchy,elements,quantities',
      },
    ],
  },
]

// ========== Category Definitions ==========

export const ifcToolCategories: ToolCategory[] = [
  {
    id: 'ifc-io',
    label: 'IFC Input/Output',
    icon: 'FileBox',
    color: '#f97316', // orange
    tools: ifcIoTools,
  },
  {
    id: 'ifc-analysis',
    label: 'IFC Analysis',
    icon: 'GitBranch',
    color: '#8b5cf6', // violet
    tools: ifcAnalysisTools,
  },
  {
    id: 'ifc-transform',
    label: 'IFC Transform',
    icon: 'Shuffle',
    color: '#06b6d4', // cyan
    tools: ifcTransformTools,
  },
  {
    id: 'ifc-export',
    label: 'IFC Export',
    icon: 'Download',
    color: '#ec4899', // pink
    tools: ifcExportTools,
  },
]

/** Flat list of all IFC tools */
export const allIfcTools = ifcToolCategories.flatMap(cat => cat.tools)

/** Get IFC tool by ID */
export function getIfcToolDef(toolId: string): ToolDef | undefined {
  return allIfcTools.find(t => t.id === toolId)
}
