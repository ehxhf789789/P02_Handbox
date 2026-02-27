/**
 * GIS + IFC Fusion Tool Catalog
 *
 * Workflow nodes for terrain-building integration, coordinate alignment,
 * combined analysis, and multi-format export.
 */

import type { ToolDefinition } from '@/types'

// ============================================================================
// Fusion I/O Nodes
// ============================================================================

const fusionProjectCreate: ToolDefinition = {
  id: 'fusion-project-create',
  name: 'Create Fusion Project',
  description: 'Create a new GIS-IFC fusion project with coordinate system settings',
  category: 'Fusion I/O',
  icon: 'folder-plus',
  inputs: [
    { name: 'name', type: 'string', required: true, description: 'Project name' },
    { name: 'description', type: 'string', required: false, description: 'Project description' },
  ],
  outputs: [
    { name: 'project', type: 'object', description: 'Fusion project object' },
  ],
  configFields: [
    {
      name: 'targetCrs',
      label: 'Target CRS',
      type: 'select',
      options: [
        { value: 'EPSG:4326', label: 'WGS 84 (EPSG:4326)' },
        { value: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
        { value: 'EPSG:5186', label: 'Korea 2000 / Central Belt (EPSG:5186)' },
        { value: 'EPSG:5179', label: 'Korea 2000 / Unified CS (EPSG:5179)' },
        { value: 'EPSG:5174', label: 'Korean 1985 / Central Belt (EPSG:5174)' },
      ],
      defaultValue: 'EPSG:5186',
    },
    {
      name: 'unitsPerMeter',
      label: 'IFC Units per Meter',
      type: 'number',
      defaultValue: 1000,
      description: 'Conversion factor (1000 for mm, 1 for m)',
    },
  ],
}

const fusionAddGisSource: ToolDefinition = {
  id: 'fusion-add-gis',
  name: 'Add GIS Source',
  description: 'Add GIS data source (GeoJSON, Shapefile, GeoPackage) to fusion project',
  category: 'Fusion I/O',
  icon: 'map-pin',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'gisData', type: 'object', required: true, description: 'GIS data (FeatureCollection)' },
    { name: 'sourceName', type: 'string', required: true, description: 'Source identifier' },
  ],
  outputs: [
    { name: 'project', type: 'object', description: 'Updated fusion project' },
    { name: 'sourceId', type: 'string', description: 'Added source ID' },
  ],
  configFields: [
    {
      name: 'layerType',
      label: 'Layer Type',
      type: 'select',
      options: [
        { value: 'terrain', label: 'Terrain/Elevation' },
        { value: 'parcel', label: 'Land Parcels' },
        { value: 'road', label: 'Roads' },
        { value: 'building', label: 'Building Footprints' },
        { value: 'utility', label: 'Utilities' },
        { value: 'boundary', label: 'Boundaries' },
        { value: 'other', label: 'Other' },
      ],
      defaultValue: 'terrain',
    },
    {
      name: 'sourceCrs',
      label: 'Source CRS (if different)',
      type: 'string',
      placeholder: 'Auto-detect from data',
    },
  ],
}

const fusionAddIfcSource: ToolDefinition = {
  id: 'fusion-add-ifc',
  name: 'Add IFC Source',
  description: 'Add IFC model to fusion project with coordinate alignment',
  category: 'Fusion I/O',
  icon: 'cube',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'ifcModel', type: 'object', required: true, description: 'Parsed IFC model' },
    { name: 'sourceName', type: 'string', required: true, description: 'Source identifier' },
  ],
  outputs: [
    { name: 'project', type: 'object', description: 'Updated fusion project' },
    { name: 'sourceId', type: 'string', description: 'Added source ID' },
  ],
  configFields: [
    {
      name: 'originLon',
      label: 'Origin Longitude',
      type: 'number',
      description: 'Geo-reference origin longitude',
    },
    {
      name: 'originLat',
      label: 'Origin Latitude',
      type: 'number',
      description: 'Geo-reference origin latitude',
    },
    {
      name: 'trueNorthAngle',
      label: 'True North Angle (degrees)',
      type: 'number',
      defaultValue: 0,
      description: 'Rotation from project north to true north',
    },
  ],
}

// ============================================================================
// Coordinate Alignment Nodes
// ============================================================================

const fusionAlignCoordinates: ToolDefinition = {
  id: 'fusion-align-coordinates',
  name: 'Align IFC to GIS',
  description: 'Transform IFC coordinates to match GIS coordinate reference system',
  category: 'Fusion Alignment',
  icon: 'crosshair',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source to align' },
  ],
  outputs: [
    { name: 'project', type: 'object', description: 'Project with aligned IFC' },
    { name: 'transformMatrix', type: 'object', description: 'Applied transformation matrix' },
  ],
  configFields: [
    {
      name: 'method',
      label: 'Alignment Method',
      type: 'select',
      options: [
        { value: 'origin', label: 'Origin Point' },
        { value: 'survey', label: 'Survey Points (3+ points)' },
        { value: 'boundary', label: 'Match to Boundary' },
        { value: 'manual', label: 'Manual Transform' },
      ],
      defaultValue: 'origin',
    },
    {
      name: 'referenceGisId',
      label: 'Reference GIS Source',
      type: 'string',
      description: 'GIS source ID for boundary/survey alignment',
    },
  ],
}

const fusionIfcToGeoJson: ToolDefinition = {
  id: 'fusion-ifc-to-geojson',
  name: 'IFC to GeoJSON',
  description: 'Convert IFC elements to GeoJSON features with properties',
  category: 'Fusion Alignment',
  icon: 'repeat',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source to convert' },
  ],
  outputs: [
    { name: 'geoJson', type: 'object', description: 'GeoJSON FeatureCollection' },
    { name: 'conversionStats', type: 'object', description: 'Conversion statistics' },
  ],
  configFields: [
    {
      name: 'elementTypes',
      label: 'Element Types to Convert',
      type: 'multiselect',
      options: [
        { value: 'IfcBuilding', label: 'Buildings' },
        { value: 'IfcBuildingStorey', label: 'Storeys' },
        { value: 'IfcWall', label: 'Walls' },
        { value: 'IfcSlab', label: 'Slabs' },
        { value: 'IfcColumn', label: 'Columns' },
        { value: 'IfcBeam', label: 'Beams' },
        { value: 'IfcRoof', label: 'Roofs' },
        { value: 'IfcSite', label: 'Sites' },
      ],
      defaultValue: ['IfcBuilding', 'IfcSite'],
    },
    {
      name: 'geometryType',
      label: 'Output Geometry Type',
      type: 'select',
      options: [
        { value: 'footprint', label: 'Footprint (2D Polygon)' },
        { value: 'bbox', label: 'Bounding Box' },
        { value: 'centroid', label: 'Centroid (Point)' },
        { value: 'full3d', label: 'Full 3D (MultiPolygon Z)' },
      ],
      defaultValue: 'footprint',
    },
    {
      name: 'includeProperties',
      label: 'Include IFC Properties',
      type: 'boolean',
      defaultValue: true,
    },
  ],
}

const fusionSetOrigin: ToolDefinition = {
  id: 'fusion-set-origin',
  name: 'Set Geo-Reference Origin',
  description: 'Define the geographic origin point for IFC model placement',
  category: 'Fusion Alignment',
  icon: 'target',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source' },
  ],
  outputs: [
    { name: 'project', type: 'object', description: 'Updated project' },
  ],
  configFields: [
    {
      name: 'longitude',
      label: 'Longitude',
      type: 'number',
      required: true,
    },
    {
      name: 'latitude',
      label: 'Latitude',
      type: 'number',
      required: true,
    },
    {
      name: 'elevation',
      label: 'Elevation (m)',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'rotation',
      label: 'Rotation (degrees)',
      type: 'number',
      defaultValue: 0,
      description: 'Counter-clockwise from East',
    },
  ],
}

// ============================================================================
// Linking Nodes
// ============================================================================

const fusionAutoLink: ToolDefinition = {
  id: 'fusion-auto-link',
  name: 'Auto-Link Features',
  description: 'Automatically link GIS features to IFC elements by name, location, or attributes',
  category: 'Fusion Linking',
  icon: 'link',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'gisSourceId', type: 'string', required: true, description: 'GIS source' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source' },
  ],
  outputs: [
    { name: 'links', type: 'array', description: 'Created links' },
    { name: 'linkCount', type: 'number', description: 'Number of links created' },
    { name: 'unmatchedGis', type: 'array', description: 'Unmatched GIS features' },
    { name: 'unmatchedIfc', type: 'array', description: 'Unmatched IFC elements' },
  ],
  configFields: [
    {
      name: 'strategy',
      label: 'Linking Strategy',
      type: 'select',
      options: [
        { value: 'name', label: 'By Name Match' },
        { value: 'location', label: 'By Spatial Location' },
        { value: 'attribute', label: 'By Attribute Match' },
        { value: 'combined', label: 'Combined (Name + Location)' },
      ],
      defaultValue: 'combined',
    },
    {
      name: 'gisNameField',
      label: 'GIS Name Field',
      type: 'string',
      defaultValue: 'name',
    },
    {
      name: 'ifcNameField',
      label: 'IFC Name Field',
      type: 'select',
      options: [
        { value: 'Name', label: 'Name' },
        { value: 'GlobalId', label: 'GlobalId' },
        { value: 'Tag', label: 'Tag' },
        { value: 'Description', label: 'Description' },
      ],
      defaultValue: 'Name',
    },
    {
      name: 'tolerance',
      label: 'Location Tolerance (m)',
      type: 'number',
      defaultValue: 5,
    },
    {
      name: 'matchThreshold',
      label: 'Name Match Threshold',
      type: 'number',
      defaultValue: 0.8,
      description: 'Fuzzy match threshold (0-1)',
    },
  ],
}

const fusionManualLink: ToolDefinition = {
  id: 'fusion-manual-link',
  name: 'Manual Link',
  description: 'Manually create a link between a GIS feature and IFC element',
  category: 'Fusion Linking',
  icon: 'link-2',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'gisFeatureId', type: 'string', required: true, description: 'GIS feature ID' },
    { name: 'ifcElementId', type: 'string', required: true, description: 'IFC element GlobalId' },
  ],
  outputs: [
    { name: 'link', type: 'object', description: 'Created link' },
  ],
  configFields: [
    {
      name: 'linkType',
      label: 'Link Type',
      type: 'select',
      options: [
        { value: 'contains', label: 'GIS Contains IFC' },
        { value: 'intersects', label: 'Intersects' },
        { value: 'adjacent', label: 'Adjacent' },
        { value: 'reference', label: 'Reference Only' },
      ],
      defaultValue: 'contains',
    },
    {
      name: 'confidence',
      label: 'Confidence',
      type: 'number',
      defaultValue: 1.0,
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'string',
    },
  ],
}

const fusionValidateLinks: ToolDefinition = {
  id: 'fusion-validate-links',
  name: 'Validate Links',
  description: 'Validate existing links for spatial consistency and completeness',
  category: 'Fusion Linking',
  icon: 'check-circle',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'validLinks', type: 'array', description: 'Valid links' },
    { name: 'invalidLinks', type: 'array', description: 'Invalid links with reasons' },
    { name: 'validationReport', type: 'object', description: 'Detailed validation report' },
  ],
  configFields: [
    {
      name: 'checkSpatial',
      label: 'Check Spatial Consistency',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'checkAttributes',
      label: 'Check Attribute Consistency',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'spatialTolerance',
      label: 'Spatial Tolerance (m)',
      type: 'number',
      defaultValue: 10,
    },
  ],
}

// ============================================================================
// Analysis Nodes
// ============================================================================

const fusionSpatialQuery: ToolDefinition = {
  id: 'fusion-spatial-query',
  name: 'Spatial Query',
  description: 'Find IFC elements within GIS boundary or near GIS features',
  category: 'Fusion Analysis',
  icon: 'search',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'gisFeature', type: 'object', required: true, description: 'GIS feature for query' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source to query' },
  ],
  outputs: [
    { name: 'elements', type: 'array', description: 'Matching IFC elements' },
    { name: 'count', type: 'number', description: 'Number of matches' },
  ],
  configFields: [
    {
      name: 'queryType',
      label: 'Query Type',
      type: 'select',
      options: [
        { value: 'within', label: 'Within Boundary' },
        { value: 'intersects', label: 'Intersects' },
        { value: 'nearDistance', label: 'Within Distance' },
      ],
      defaultValue: 'within',
    },
    {
      name: 'distance',
      label: 'Distance (m)',
      type: 'number',
      defaultValue: 0,
      description: 'For "Within Distance" query',
    },
    {
      name: 'elementFilter',
      label: 'Element Type Filter',
      type: 'multiselect',
      options: [
        { value: 'all', label: 'All Elements' },
        { value: 'IfcBuilding', label: 'Buildings' },
        { value: 'IfcWall', label: 'Walls' },
        { value: 'IfcSlab', label: 'Slabs' },
        { value: 'IfcColumn', label: 'Columns' },
      ],
      defaultValue: ['all'],
    },
  ],
}

const fusionCombinedStatistics: ToolDefinition = {
  id: 'fusion-combined-stats',
  name: 'Combined Statistics',
  description: 'Calculate combined statistics from linked GIS and IFC data',
  category: 'Fusion Analysis',
  icon: 'bar-chart-2',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'statistics', type: 'object', description: 'Combined statistics' },
    { name: 'gisStats', type: 'object', description: 'GIS-specific statistics' },
    { name: 'ifcStats', type: 'object', description: 'IFC-specific statistics' },
    { name: 'linkStats', type: 'object', description: 'Link statistics' },
  ],
  configFields: [
    {
      name: 'includeAreas',
      label: 'Include Area Calculations',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'includeVolumes',
      label: 'Include Volume Calculations',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'groupBy',
      label: 'Group By',
      type: 'select',
      options: [
        { value: 'none', label: 'No Grouping' },
        { value: 'elementType', label: 'IFC Element Type' },
        { value: 'storey', label: 'Building Storey' },
        { value: 'gisLayer', label: 'GIS Layer' },
      ],
      defaultValue: 'none',
    },
  ],
}

const fusionCompareVersions: ToolDefinition = {
  id: 'fusion-compare-versions',
  name: 'Compare Versions',
  description: 'Compare different versions of GIS or IFC data to detect changes',
  category: 'Fusion Analysis',
  icon: 'git-compare',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'sourceId1', type: 'string', required: true, description: 'First source ID' },
    { name: 'sourceId2', type: 'string', required: true, description: 'Second source ID' },
  ],
  outputs: [
    { name: 'added', type: 'array', description: 'Added elements' },
    { name: 'removed', type: 'array', description: 'Removed elements' },
    { name: 'modified', type: 'array', description: 'Modified elements' },
    { name: 'unchanged', type: 'number', description: 'Unchanged count' },
    { name: 'changeReport', type: 'object', description: 'Detailed change report' },
  ],
  configFields: [
    {
      name: 'compareBy',
      label: 'Compare By',
      type: 'select',
      options: [
        { value: 'id', label: 'ID/GlobalId' },
        { value: 'geometry', label: 'Geometry' },
        { value: 'properties', label: 'Properties' },
        { value: 'all', label: 'All Attributes' },
      ],
      defaultValue: 'all',
    },
    {
      name: 'geometryTolerance',
      label: 'Geometry Tolerance',
      type: 'number',
      defaultValue: 0.001,
    },
  ],
}

const fusionTerrainAnalysis: ToolDefinition = {
  id: 'fusion-terrain-analysis',
  name: 'Terrain Analysis',
  description: 'Analyze terrain interaction with IFC elements (elevation, slope, cut/fill)',
  category: 'Fusion Analysis',
  icon: 'mountain',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
    { name: 'terrainGisId', type: 'string', required: true, description: 'Terrain GIS source' },
    { name: 'ifcSourceId', type: 'string', required: true, description: 'IFC source' },
  ],
  outputs: [
    { name: 'elevationData', type: 'array', description: 'Element elevations' },
    { name: 'slopeAnalysis', type: 'object', description: 'Slope analysis results' },
    { name: 'cutFillVolumes', type: 'object', description: 'Cut/fill volume estimates' },
  ],
  configFields: [
    {
      name: 'analysisTypes',
      label: 'Analysis Types',
      type: 'multiselect',
      options: [
        { value: 'elevation', label: 'Elevation Profile' },
        { value: 'slope', label: 'Slope Analysis' },
        { value: 'cutfill', label: 'Cut/Fill Calculation' },
        { value: 'viewshed', label: 'Viewshed' },
      ],
      defaultValue: ['elevation', 'slope'],
    },
    {
      name: 'sampleInterval',
      label: 'Sample Interval (m)',
      type: 'number',
      defaultValue: 1,
    },
  ],
}

// ============================================================================
// Export Nodes
// ============================================================================

const fusionExportGeoJson: ToolDefinition = {
  id: 'fusion-export-geojson',
  name: 'Export Combined GeoJSON',
  description: 'Export fusion project as combined GeoJSON with IFC properties',
  category: 'Fusion Export',
  icon: 'download',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'geoJson', type: 'object', description: 'Combined GeoJSON' },
    { name: 'featureCount', type: 'number', description: 'Total features' },
  ],
  configFields: [
    {
      name: 'includeIfcAsFeatures',
      label: 'Include IFC as Features',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'preserveLinks',
      label: 'Preserve Link References',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'flattenProperties',
      label: 'Flatten Properties',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'outputCrs',
      label: 'Output CRS',
      type: 'string',
      defaultValue: 'EPSG:4326',
    },
  ],
}

const fusionExportCityJson: ToolDefinition = {
  id: 'fusion-export-cityjson',
  name: 'Export CityJSON',
  description: 'Export fusion project as CityJSON for 3D city modeling',
  category: 'Fusion Export',
  icon: 'box',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'cityJson', type: 'object', description: 'CityJSON data' },
    { name: 'objectCount', type: 'number', description: 'City objects count' },
  ],
  configFields: [
    {
      name: 'version',
      label: 'CityJSON Version',
      type: 'select',
      options: [
        { value: '1.1', label: 'CityJSON 1.1' },
        { value: '2.0', label: 'CityJSON 2.0' },
      ],
      defaultValue: '1.1',
    },
    {
      name: 'lod',
      label: 'Level of Detail',
      type: 'select',
      options: [
        { value: '0', label: 'LOD0 (Footprint)' },
        { value: '1', label: 'LOD1 (Block)' },
        { value: '2', label: 'LOD2 (Roof Shape)' },
        { value: '3', label: 'LOD3 (Detailed)' },
      ],
      defaultValue: '1',
    },
    {
      name: 'includeTextures',
      label: 'Include Textures',
      type: 'boolean',
      defaultValue: false,
    },
  ],
}

const fusionExportCsv: ToolDefinition = {
  id: 'fusion-export-csv',
  name: 'Export Linked Data CSV',
  description: 'Export linked GIS-IFC data as CSV for analysis',
  category: 'Fusion Export',
  icon: 'file-text',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'csv', type: 'string', description: 'CSV content' },
    { name: 'rowCount', type: 'number', description: 'Number of rows' },
  ],
  configFields: [
    {
      name: 'includeGeometry',
      label: 'Include Geometry (WKT)',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'gisFields',
      label: 'GIS Fields',
      type: 'string',
      placeholder: 'field1,field2 (empty for all)',
    },
    {
      name: 'ifcFields',
      label: 'IFC Fields',
      type: 'string',
      placeholder: 'GlobalId,Name,Type (empty for all)',
    },
    {
      name: 'separator',
      label: 'Separator',
      type: 'select',
      options: [
        { value: ',', label: 'Comma (,)' },
        { value: ';', label: 'Semicolon (;)' },
        { value: '\t', label: 'Tab' },
      ],
      defaultValue: ',',
    },
  ],
}

const fusionExportReport: ToolDefinition = {
  id: 'fusion-export-report',
  name: 'Generate Fusion Report',
  description: 'Generate comprehensive report of fusion project',
  category: 'Fusion Export',
  icon: 'file-plus',
  inputs: [
    { name: 'project', type: 'object', required: true, description: 'Fusion project' },
  ],
  outputs: [
    { name: 'report', type: 'object', description: 'Structured report' },
    { name: 'summary', type: 'string', description: 'Text summary' },
  ],
  configFields: [
    {
      name: 'sections',
      label: 'Report Sections',
      type: 'multiselect',
      options: [
        { value: 'overview', label: 'Project Overview' },
        { value: 'sources', label: 'Data Sources' },
        { value: 'links', label: 'Link Summary' },
        { value: 'statistics', label: 'Statistics' },
        { value: 'validation', label: 'Validation Results' },
        { value: 'recommendations', label: 'Recommendations' },
      ],
      defaultValue: ['overview', 'sources', 'links', 'statistics'],
    },
    {
      name: 'format',
      label: 'Output Format',
      type: 'select',
      options: [
        { value: 'json', label: 'JSON' },
        { value: 'markdown', label: 'Markdown' },
        { value: 'html', label: 'HTML' },
      ],
      defaultValue: 'json',
    },
    {
      name: 'language',
      label: 'Language',
      type: 'select',
      options: [
        { value: 'en', label: 'English' },
        { value: 'ko', label: '한국어' },
      ],
      defaultValue: 'ko',
    },
  ],
}

// ============================================================================
// Export all tools
// ============================================================================

export const fusionToolCatalog: ToolDefinition[] = [
  // I/O
  fusionProjectCreate,
  fusionAddGisSource,
  fusionAddIfcSource,
  // Alignment
  fusionAlignCoordinates,
  fusionIfcToGeoJson,
  fusionSetOrigin,
  // Linking
  fusionAutoLink,
  fusionManualLink,
  fusionValidateLinks,
  // Analysis
  fusionSpatialQuery,
  fusionCombinedStatistics,
  fusionCompareVersions,
  fusionTerrainAnalysis,
  // Export
  fusionExportGeoJson,
  fusionExportCityJson,
  fusionExportCsv,
  fusionExportReport,
]

export const fusionCategories = [
  'Fusion I/O',
  'Fusion Alignment',
  'Fusion Linking',
  'Fusion Analysis',
  'Fusion Export',
]

export default fusionToolCatalog
