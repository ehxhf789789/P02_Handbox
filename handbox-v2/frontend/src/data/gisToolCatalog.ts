/**
 * GIS Tool Catalog — Workflow nodes for geospatial data processing.
 *
 * Categories:
 * - GIS I/O: Read/write GeoJSON, Shapefile, GeoPackage
 * - GIS Transform: CRS transformation, geometry operations
 * - GIS Analysis: Spatial analysis, statistics
 * - GIS Visualization: Map rendering, charts
 */

import type { ToolDef, ToolCategory } from './toolCatalog'

// ========== GIS Input/Output Tools ==========

const gisIoTools: ToolDef[] = [
  {
    id: 'gis-geojson-read',
    label: 'GeoJSON Read',
    category: 'gis-io',
    description: 'Read GeoJSON file and parse features',
    icon: 'Map',
    inputs: [],
    outputs: [
      { name: 'features', type: 'geojson' },
      { name: 'featureCount', type: 'number' },
      { name: 'bounds', type: 'array' },
    ],
    configFields: [
      {
        name: 'file_path',
        type: 'file',
        label: 'GeoJSON File',
        default: '',
        fileFilters: [
          { name: 'GeoJSON', extensions: ['geojson', 'json'] },
        ],
      },
    ],
  },
  {
    id: 'gis-shapefile-read',
    label: 'Shapefile Read',
    category: 'gis-io',
    description: 'Read Shapefile (.shp) and extract features with attributes',
    icon: 'FileArchive',
    inputs: [],
    outputs: [
      { name: 'features', type: 'geojson' },
      { name: 'featureCount', type: 'number' },
      { name: 'fields', type: 'array' },
      { name: 'crs', type: 'string' },
    ],
    configFields: [
      {
        name: 'file_path',
        type: 'file',
        label: 'Shapefile (.shp)',
        default: '',
        fileFilters: [
          { name: 'Shapefile', extensions: ['shp'] },
        ],
      },
      {
        name: 'encoding',
        type: 'select',
        label: 'Attribute Encoding',
        default: 'utf-8',
        options: [
          { value: 'utf-8', label: 'UTF-8' },
          { value: 'euc-kr', label: 'EUC-KR (Korean)' },
          { value: 'cp949', label: 'CP949 (Korean)' },
          { value: 'latin-1', label: 'Latin-1' },
        ],
      },
    ],
  },
  {
    id: 'gis-geopackage-read',
    label: 'GeoPackage Read',
    category: 'gis-io',
    description: 'Read GeoPackage (.gpkg) layer',
    icon: 'Database',
    inputs: [],
    outputs: [
      { name: 'features', type: 'geojson' },
      { name: 'featureCount', type: 'number' },
      { name: 'layers', type: 'array' },
    ],
    configFields: [
      {
        name: 'file_path',
        type: 'file',
        label: 'GeoPackage File',
        default: '',
        fileFilters: [
          { name: 'GeoPackage', extensions: ['gpkg'] },
        ],
      },
      {
        name: 'layer_name',
        type: 'string',
        label: 'Layer Name (optional)',
        default: '',
      },
    ],
  },
  {
    id: 'gis-qgis-project-read',
    label: 'QGIS Project Read',
    category: 'gis-io',
    description: 'Read QGIS project file and extract layer information',
    icon: 'Map',
    inputs: [],
    outputs: [
      { name: 'project', type: 'json' },
      { name: 'layers', type: 'array' },
      { name: 'crs', type: 'string' },
      { name: 'extent', type: 'array' },
    ],
    configFields: [
      {
        name: 'file_path',
        type: 'file',
        label: 'QGIS Project',
        default: '',
        fileFilters: [
          { name: 'QGIS Project', extensions: ['qgs', 'qgz'] },
        ],
      },
    ],
  },
  {
    id: 'gis-geojson-write',
    label: 'GeoJSON Write',
    category: 'gis-io',
    description: 'Write GeoJSON to file',
    icon: 'Save',
    inputs: [
      { name: 'features', type: 'geojson' },
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
        default: 'output.geojson',
      },
      {
        name: 'precision',
        type: 'number',
        label: 'Coordinate Precision',
        default: 6,
      },
      {
        name: 'pretty',
        type: 'boolean',
        label: 'Pretty Print',
        default: true,
      },
    ],
  },
  {
    id: 'gis-shapefile-write',
    label: 'Shapefile Write',
    category: 'gis-io',
    description: 'Export features as Shapefile',
    icon: 'Download',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'path', type: 'string' },
      { name: 'success', type: 'boolean' },
    ],
    configFields: [
      {
        name: 'output_path',
        type: 'string',
        label: 'Output Path (without extension)',
        default: 'output',
      },
      {
        name: 'crs',
        type: 'select',
        label: 'Output CRS',
        default: 'EPSG:4326',
        options: [
          { value: 'EPSG:4326', label: 'WGS 84 (EPSG:4326)' },
          { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
          { value: 'EPSG:5186', label: 'Korea 2000 Central (EPSG:5186)' },
          { value: 'EPSG:5179', label: 'Korea 2000 Unified (EPSG:5179)' },
        ],
      },
    ],
  },
  {
    id: 'gis-csv-export',
    label: 'GIS to CSV',
    category: 'gis-io',
    description: 'Export features to CSV with optional WKT geometry',
    icon: 'Table',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'csv', type: 'string' },
      { name: 'rowCount', type: 'number' },
    ],
    configFields: [
      {
        name: 'include_geometry',
        type: 'boolean',
        label: 'Include Geometry',
        default: true,
      },
      {
        name: 'geometry_format',
        type: 'select',
        label: 'Geometry Format',
        default: 'wkt',
        options: [
          { value: 'wkt', label: 'WKT' },
          { value: 'geojson', label: 'GeoJSON' },
        ],
      },
    ],
  },
]

// ========== GIS Transform Tools ==========

const gisTransformTools: ToolDef[] = [
  {
    id: 'gis-reproject',
    label: 'Reproject',
    category: 'gis-transform',
    description: 'Transform coordinates to different CRS',
    icon: 'Globe',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'features', type: 'geojson' },
    ],
    configFields: [
      {
        name: 'from_crs',
        type: 'select',
        label: 'Source CRS',
        default: 'EPSG:4326',
        options: [
          { value: 'EPSG:4326', label: 'WGS 84 (EPSG:4326)' },
          { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
          { value: 'EPSG:5186', label: 'Korea 2000 Central (EPSG:5186)' },
          { value: 'EPSG:5179', label: 'Korea 2000 Unified (EPSG:5179)' },
          { value: 'EPSG:5174', label: 'Korea 1985 Modified (EPSG:5174)' },
        ],
      },
      {
        name: 'to_crs',
        type: 'select',
        label: 'Target CRS',
        default: 'EPSG:3857',
        options: [
          { value: 'EPSG:4326', label: 'WGS 84 (EPSG:4326)' },
          { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
          { value: 'EPSG:5186', label: 'Korea 2000 Central (EPSG:5186)' },
          { value: 'EPSG:5179', label: 'Korea 2000 Unified (EPSG:5179)' },
          { value: 'EPSG:5174', label: 'Korea 1985 Modified (EPSG:5174)' },
        ],
      },
    ],
  },
  {
    id: 'gis-buffer',
    label: 'Buffer',
    category: 'gis-transform',
    description: 'Create buffer zone around geometries',
    icon: 'Circle',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'buffered', type: 'geojson' },
    ],
    configFields: [
      {
        name: 'distance',
        type: 'number',
        label: 'Buffer Distance',
        default: 100,
      },
      {
        name: 'unit',
        type: 'select',
        label: 'Unit',
        default: 'meters',
        options: [
          { value: 'meters', label: 'Meters' },
          { value: 'kilometers', label: 'Kilometers' },
          { value: 'feet', label: 'Feet' },
          { value: 'miles', label: 'Miles' },
        ],
      },
      {
        name: 'segments',
        type: 'number',
        label: 'Segments (curve smoothness)',
        default: 8,
      },
    ],
  },
  {
    id: 'gis-simplify',
    label: 'Simplify',
    category: 'gis-transform',
    description: 'Simplify geometry using Douglas-Peucker algorithm',
    icon: 'Minimize2',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'simplified', type: 'geojson' },
    ],
    configFields: [
      {
        name: 'tolerance',
        type: 'number',
        label: 'Tolerance',
        default: 0.001,
      },
      {
        name: 'preserve_topology',
        type: 'boolean',
        label: 'Preserve Topology',
        default: true,
      },
    ],
  },
  {
    id: 'gis-centroid',
    label: 'Centroid',
    category: 'gis-transform',
    description: 'Calculate centroid of each geometry',
    icon: 'Target',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'centroids', type: 'geojson' },
    ],
    configFields: [],
  },
  {
    id: 'gis-convex-hull',
    label: 'Convex Hull',
    category: 'gis-transform',
    description: 'Create convex hull from features',
    icon: 'Hexagon',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'hull', type: 'geojson' },
    ],
    configFields: [],
  },
  {
    id: 'gis-dissolve',
    label: 'Dissolve',
    category: 'gis-transform',
    description: 'Merge features by attribute value',
    icon: 'Merge',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'dissolved', type: 'geojson' },
    ],
    configFields: [
      {
        name: 'group_field',
        type: 'string',
        label: 'Group By Field',
        default: '',
      },
    ],
  },
]

// ========== GIS Analysis Tools ==========

const gisAnalysisTools: ToolDef[] = [
  {
    id: 'gis-spatial-filter',
    label: 'Spatial Filter',
    category: 'gis-analysis',
    description: 'Filter features by spatial relationship',
    icon: 'Filter',
    inputs: [
      { name: 'features', type: 'geojson' },
      { name: 'filterGeometry', type: 'geojson' },
    ],
    outputs: [
      { name: 'filtered', type: 'geojson' },
      { name: 'count', type: 'number' },
    ],
    configFields: [
      {
        name: 'predicate',
        type: 'select',
        label: 'Spatial Predicate',
        default: 'intersects',
        options: [
          { value: 'intersects', label: 'Intersects' },
          { value: 'contains', label: 'Contains' },
          { value: 'within', label: 'Within' },
          { value: 'overlaps', label: 'Overlaps' },
          { value: 'touches', label: 'Touches' },
          { value: 'crosses', label: 'Crosses' },
          { value: 'disjoint', label: 'Disjoint' },
        ],
      },
    ],
  },
  {
    id: 'gis-union',
    label: 'Union',
    category: 'gis-analysis',
    description: 'Merge overlapping geometries',
    icon: 'Plus',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'union', type: 'geojson' },
    ],
    configFields: [],
  },
  {
    id: 'gis-intersection',
    label: 'Intersection',
    category: 'gis-analysis',
    description: 'Find intersection of two layers',
    icon: 'Intersect',
    inputs: [
      { name: 'layer1', type: 'geojson' },
      { name: 'layer2', type: 'geojson' },
    ],
    outputs: [
      { name: 'intersection', type: 'geojson' },
    ],
    configFields: [],
  },
  {
    id: 'gis-difference',
    label: 'Difference',
    category: 'gis-analysis',
    description: 'Subtract one layer from another',
    icon: 'Minus',
    inputs: [
      { name: 'layer1', type: 'geojson' },
      { name: 'layer2', type: 'geojson' },
    ],
    outputs: [
      { name: 'difference', type: 'geojson' },
    ],
    configFields: [],
  },
  {
    id: 'gis-area-calculate',
    label: 'Calculate Area',
    category: 'gis-analysis',
    description: 'Calculate area of polygons',
    icon: 'Square',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'features', type: 'geojson' },
      { name: 'totalArea', type: 'number' },
    ],
    configFields: [
      {
        name: 'unit',
        type: 'select',
        label: 'Area Unit',
        default: 'sqm',
        options: [
          { value: 'sqm', label: 'Square Meters' },
          { value: 'sqkm', label: 'Square Kilometers' },
          { value: 'ha', label: 'Hectares' },
          { value: 'acre', label: 'Acres' },
          { value: 'pyeong', label: 'Pyeong (평)' },
        ],
      },
      {
        name: 'field_name',
        type: 'string',
        label: 'Output Field Name',
        default: 'area',
      },
    ],
  },
  {
    id: 'gis-length-calculate',
    label: 'Calculate Length',
    category: 'gis-analysis',
    description: 'Calculate length of lines',
    icon: 'Ruler',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'features', type: 'geojson' },
      { name: 'totalLength', type: 'number' },
    ],
    configFields: [
      {
        name: 'unit',
        type: 'select',
        label: 'Length Unit',
        default: 'meters',
        options: [
          { value: 'meters', label: 'Meters' },
          { value: 'kilometers', label: 'Kilometers' },
          { value: 'feet', label: 'Feet' },
          { value: 'miles', label: 'Miles' },
        ],
      },
      {
        name: 'field_name',
        type: 'string',
        label: 'Output Field Name',
        default: 'length',
      },
    ],
  },
  {
    id: 'gis-bbox-calculate',
    label: 'Calculate Bounds',
    category: 'gis-analysis',
    description: 'Calculate bounding box of features',
    icon: 'Box',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'bbox', type: 'array' },
      { name: 'bboxPolygon', type: 'geojson' },
      { name: 'center', type: 'array' },
    ],
    configFields: [],
  },
  {
    id: 'gis-property-stats',
    label: 'Property Statistics',
    category: 'gis-analysis',
    description: 'Calculate statistics for a numeric property',
    icon: 'BarChart',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'stats', type: 'json' },
      { name: 'min', type: 'number' },
      { name: 'max', type: 'number' },
      { name: 'mean', type: 'number' },
      { name: 'sum', type: 'number' },
    ],
    configFields: [
      {
        name: 'property',
        type: 'string',
        label: 'Property Name',
        default: '',
      },
    ],
  },
  {
    id: 'gis-unique-values',
    label: 'Unique Values',
    category: 'gis-analysis',
    description: 'Get unique values from a property',
    icon: 'List',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'values', type: 'array' },
      { name: 'count', type: 'number' },
    ],
    configFields: [
      {
        name: 'property',
        type: 'string',
        label: 'Property Name',
        default: '',
      },
    ],
  },
  {
    id: 'gis-group-by',
    label: 'Group By Property',
    category: 'gis-analysis',
    description: 'Group features by property value',
    icon: 'Layers',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'groups', type: 'json' },
      { name: 'groupCount', type: 'number' },
    ],
    configFields: [
      {
        name: 'property',
        type: 'string',
        label: 'Group By Property',
        default: '',
      },
    ],
  },
  {
    id: 'gis-attribute-filter',
    label: 'Attribute Filter',
    category: 'gis-analysis',
    description: 'Filter features by attribute value',
    icon: 'Filter',
    inputs: [
      { name: 'features', type: 'geojson' },
    ],
    outputs: [
      { name: 'filtered', type: 'geojson' },
      { name: 'count', type: 'number' },
    ],
    configFields: [
      {
        name: 'property',
        type: 'string',
        label: 'Property Name',
        default: '',
      },
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        default: '==',
        options: [
          { value: '==', label: 'Equals' },
          { value: '!=', label: 'Not Equals' },
          { value: '>', label: 'Greater Than' },
          { value: '>=', label: 'Greater Than or Equal' },
          { value: '<', label: 'Less Than' },
          { value: '<=', label: 'Less Than or Equal' },
          { value: 'contains', label: 'Contains (text)' },
          { value: 'startsWith', label: 'Starts With (text)' },
        ],
      },
      {
        name: 'value',
        type: 'string',
        label: 'Value',
        default: '',
      },
    ],
  },
]

// ========== Category Definitions ==========

export const gisToolCategories: ToolCategory[] = [
  {
    id: 'gis-io',
    label: 'GIS Input/Output',
    icon: 'Map',
    color: '#10b981', // emerald
    tools: gisIoTools,
  },
  {
    id: 'gis-transform',
    label: 'GIS Transform',
    icon: 'Move',
    color: '#3b82f6', // blue
    tools: gisTransformTools,
  },
  {
    id: 'gis-analysis',
    label: 'GIS Analysis',
    icon: 'PieChart',
    color: '#f59e0b', // amber
    tools: gisAnalysisTools,
  },
]

/** Flat list of all GIS tools */
export const allGisTools = gisToolCategories.flatMap(cat => cat.tools)

/** Get GIS tool by ID */
export function getGisToolDef(toolId: string): ToolDef | undefined {
  return allGisTools.find(t => t.id === toolId)
}
