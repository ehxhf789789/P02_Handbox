/**
 * GIS Types — Complete type definitions for geospatial data processing.
 *
 * Supports:
 * - GeoJSON (RFC 7946)
 * - Shapefile components
 * - GeoPackage
 * - Well-Known Text (WKT)
 * - Coordinate Reference Systems (CRS)
 * - Spatial operations
 */

// ========== GeoJSON Types (RFC 7946) ==========

export type GeoJsonGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection'

export type GeoJsonType = GeoJsonGeometryType | 'Feature' | 'FeatureCollection'

/** Position: [longitude, latitude, elevation?] */
export type GeoJsonPosition = [number, number] | [number, number, number]

/** Bounding Box: [minLon, minLat, maxLon, maxLat] or with elevation */
export type GeoJsonBBox =
  | [number, number, number, number]
  | [number, number, number, number, number, number]

/** Base GeoJSON object */
export interface GeoJsonBase {
  type: GeoJsonType
  bbox?: GeoJsonBBox
}

/** Point geometry */
export interface GeoJsonPoint extends GeoJsonBase {
  type: 'Point'
  coordinates: GeoJsonPosition
}

/** MultiPoint geometry */
export interface GeoJsonMultiPoint extends GeoJsonBase {
  type: 'MultiPoint'
  coordinates: GeoJsonPosition[]
}

/** LineString geometry */
export interface GeoJsonLineString extends GeoJsonBase {
  type: 'LineString'
  coordinates: GeoJsonPosition[]
}

/** MultiLineString geometry */
export interface GeoJsonMultiLineString extends GeoJsonBase {
  type: 'MultiLineString'
  coordinates: GeoJsonPosition[][]
}

/** Polygon geometry (exterior ring + optional holes) */
export interface GeoJsonPolygon extends GeoJsonBase {
  type: 'Polygon'
  coordinates: GeoJsonPosition[][] // [exterior, ...holes]
}

/** MultiPolygon geometry */
export interface GeoJsonMultiPolygon extends GeoJsonBase {
  type: 'MultiPolygon'
  coordinates: GeoJsonPosition[][][]
}

/** GeometryCollection */
export interface GeoJsonGeometryCollection extends GeoJsonBase {
  type: 'GeometryCollection'
  geometries: GeoJsonGeometry[]
}

/** Union of all geometry types */
export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonMultiPoint
  | GeoJsonLineString
  | GeoJsonMultiLineString
  | GeoJsonPolygon
  | GeoJsonMultiPolygon
  | GeoJsonGeometryCollection

/** Feature with geometry and properties */
export interface GeoJsonFeature<
  G extends GeoJsonGeometry = GeoJsonGeometry,
  P = Record<string, unknown>,
> extends GeoJsonBase {
  type: 'Feature'
  id?: string | number
  geometry: G | null
  properties: P | null
}

/** FeatureCollection */
export interface GeoJsonFeatureCollection<
  G extends GeoJsonGeometry = GeoJsonGeometry,
  P = Record<string, unknown>,
> extends GeoJsonBase {
  type: 'FeatureCollection'
  features: GeoJsonFeature<G, P>[]
}

/** Any GeoJSON object */
export type GeoJson =
  | GeoJsonGeometry
  | GeoJsonFeature
  | GeoJsonFeatureCollection

// ========== Coordinate Reference System (CRS) ==========

/** Well-known CRS identifiers */
export type WellKnownCrs =
  | 'EPSG:4326' // WGS84 (lat/lon)
  | 'EPSG:3857' // Web Mercator
  | 'EPSG:4019' // GRS80
  | 'EPSG:5186' // Korea 2000 / Central Belt 2010
  | 'EPSG:5187' // Korea 2000 / East Belt 2010
  | 'EPSG:5188' // Korea 2000 / West Belt 2010
  | 'EPSG:5179' // Korea 2000 / Unified CS
  | 'EPSG:5174' // Korea 1985 / Modified Central Belt
  | 'EPSG:32652' // UTM Zone 52N

/** CRS definition */
export interface CrsDefinition {
  code: string // e.g., 'EPSG:4326'
  name: string
  proj4?: string // PROJ4 definition string
  wkt?: string // WKT definition
  bounds?: GeoJsonBBox // Valid bounds
  unit: 'degree' | 'meter' | 'foot'
  isGeographic: boolean // true for lat/lon, false for projected
}

/** Common CRS definitions */
export const COMMON_CRS: Record<string, CrsDefinition> = {
  'EPSG:4326': {
    code: 'EPSG:4326',
    name: 'WGS 84',
    proj4: '+proj=longlat +datum=WGS84 +no_defs',
    unit: 'degree',
    isGeographic: true,
    bounds: [-180, -90, 180, 90],
  },
  'EPSG:3857': {
    code: 'EPSG:3857',
    name: 'Web Mercator',
    proj4: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
    unit: 'meter',
    isGeographic: false,
    bounds: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
  },
  'EPSG:5186': {
    code: 'EPSG:5186',
    name: 'Korea 2000 / Central Belt 2010',
    proj4: '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    unit: 'meter',
    isGeographic: false,
  },
  'EPSG:5179': {
    code: 'EPSG:5179',
    name: 'Korea 2000 / Unified CS',
    proj4: '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs',
    unit: 'meter',
    isGeographic: false,
  },
}

// ========== Shapefile Types ==========

/** Shapefile geometry type codes */
export enum ShapeType {
  Null = 0,
  Point = 1,
  PolyLine = 3,
  Polygon = 5,
  MultiPoint = 8,
  PointZ = 11,
  PolyLineZ = 13,
  PolygonZ = 15,
  MultiPointZ = 18,
  PointM = 21,
  PolyLineM = 23,
  PolygonM = 25,
  MultiPointM = 28,
}

/** DBF field type */
export type DbfFieldType =
  | 'C' // Character
  | 'N' // Numeric
  | 'F' // Floating point
  | 'L' // Logical
  | 'D' // Date
  | 'M' // Memo

/** DBF field definition */
export interface DbfField {
  name: string
  type: DbfFieldType
  length: number
  decimalCount: number
}

/** Shapefile header */
export interface ShapefileHeader {
  fileCode: number // Always 9994
  fileLength: number // In 16-bit words
  version: number // Should be 1000
  shapeType: ShapeType
  bbox: {
    xMin: number
    yMin: number
    xMax: number
    yMax: number
    zMin?: number
    zMax?: number
    mMin?: number
    mMax?: number
  }
}

/** Shapefile record */
export interface ShapefileRecord {
  recordNumber: number
  contentLength: number
  shapeType: ShapeType
  geometry: GeoJsonGeometry | null
  attributes: Record<string, unknown>
}

/** Parsed shapefile */
export interface Shapefile {
  header: ShapefileHeader
  fields: DbfField[]
  records: ShapefileRecord[]
  prj?: string // .prj file content (WKT)
  crs?: CrsDefinition
}

// ========== GeoPackage Types ==========

/** GeoPackage table type */
export type GpkgTableType = 'features' | 'tiles' | 'attributes'

/** GeoPackage geometry column info */
export interface GpkgGeometryColumn {
  tableName: string
  columnName: string
  geometryTypeName: string
  srsId: number
  z: 0 | 1 | 2 // 0=prohibited, 1=mandatory, 2=optional
  m: 0 | 1 | 2
}

/** GeoPackage spatial reference system */
export interface GpkgSrs {
  srsId: number
  srsName: string
  organization: string
  organizationCoordsysId: number
  definition: string // WKT
  description?: string
}

/** GeoPackage contents entry */
export interface GpkgContents {
  tableName: string
  dataType: GpkgTableType
  identifier: string
  description?: string
  lastChange: string
  minX?: number
  minY?: number
  maxX?: number
  maxY?: number
  srsId?: number
}

/** GeoPackage metadata */
export interface GeoPackageMetadata {
  version: string
  applicationId: string
  contents: GpkgContents[]
  spatialRefSystems: GpkgSrs[]
  geometryColumns: GpkgGeometryColumn[]
}

/** GeoPackage layer */
export interface GeoPackageLayer {
  name: string
  type: GpkgTableType
  geometryType?: GeoJsonGeometryType
  featureCount: number
  srs?: GpkgSrs
  bounds?: GeoJsonBBox
  fields: {
    name: string
    type: string
    notNull: boolean
    primaryKey: boolean
  }[]
}

// ========== Spatial Operations ==========

/** Spatial predicate types */
export type SpatialPredicate =
  | 'intersects'
  | 'contains'
  | 'within'
  | 'overlaps'
  | 'touches'
  | 'crosses'
  | 'disjoint'
  | 'equals'

/** Buffer options */
export interface BufferOptions {
  distance: number
  unit: 'meters' | 'kilometers' | 'miles' | 'feet'
  segments?: number // Number of segments for curves
  endCapStyle?: 'round' | 'flat' | 'square'
  joinStyle?: 'round' | 'mitre' | 'bevel'
}

/** Spatial analysis result */
export interface SpatialAnalysisResult {
  type: string
  geometry?: GeoJsonGeometry
  area?: number
  length?: number
  centroid?: GeoJsonPoint
  properties?: Record<string, unknown>
}

// ========== Layer Styling ==========

/** Fill style */
export interface FillStyle {
  color: string
  opacity: number
  pattern?: 'solid' | 'hatch' | 'dots' | 'crosshatch'
}

/** Stroke style */
export interface StrokeStyle {
  color: string
  width: number
  opacity: number
  dashArray?: number[]
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
}

/** Symbol style for points */
export interface SymbolStyle {
  type: 'circle' | 'square' | 'triangle' | 'star' | 'icon'
  size: number
  color: string
  opacity: number
  iconUrl?: string
  iconSize?: [number, number]
}

/** Label style */
export interface LabelStyle {
  field: string
  fontFamily: string
  fontSize: number
  fontColor: string
  fontWeight?: 'normal' | 'bold'
  haloColor?: string
  haloWidth?: number
  placement?: 'point' | 'line'
  offset?: [number, number]
}

/** Layer style */
export interface LayerStyle {
  id: string
  name: string
  fill?: FillStyle
  stroke?: StrokeStyle
  symbol?: SymbolStyle
  label?: LabelStyle
  minZoom?: number
  maxZoom?: number
  filter?: unknown // CQL/OGC filter expression
}

// ========== GIS Layer ==========

/** GIS layer type */
export type GisLayerType = 'vector' | 'raster' | 'tile'

/** Vector layer */
export interface VectorLayer {
  id: string
  name: string
  type: 'vector'
  source: GeoJsonFeatureCollection | string // Data or URL
  sourceFormat: 'geojson' | 'shapefile' | 'geopackage' | 'wfs'
  geometryType: GeoJsonGeometryType
  crs: CrsDefinition
  bounds?: GeoJsonBBox
  featureCount: number
  fields: {
    name: string
    type: string
    values?: unknown[] // Unique values for categorical
    min?: number // For numeric
    max?: number
  }[]
  style?: LayerStyle
  visible: boolean
  opacity: number
  zIndex: number
}

/** Raster layer */
export interface RasterLayer {
  id: string
  name: string
  type: 'raster'
  source: string // URL or file path
  sourceFormat: 'geotiff' | 'png' | 'jpeg' | 'cog'
  crs: CrsDefinition
  bounds: GeoJsonBBox
  resolution: [number, number] // [x, y] in CRS units
  bands: {
    name: string
    min: number
    max: number
    noData?: number
  }[]
  visible: boolean
  opacity: number
  zIndex: number
}

/** Tile layer */
export interface TileLayer {
  id: string
  name: string
  type: 'tile'
  source: string // URL template with {x}, {y}, {z}
  sourceFormat: 'xyz' | 'tms' | 'wmts' | 'wms'
  crs: CrsDefinition
  bounds?: GeoJsonBBox
  minZoom: number
  maxZoom: number
  tileSize: number
  attribution?: string
  visible: boolean
  opacity: number
  zIndex: number
}

/** Any GIS layer */
export type GisLayer = VectorLayer | RasterLayer | TileLayer

// ========== Map View State ==========

/** Map view state */
export interface MapViewState {
  center: [number, number] // [lon, lat] or projected coords
  zoom: number
  bearing: number
  pitch: number
  bounds?: GeoJsonBBox
  crs: CrsDefinition
}

// ========== Export Formats ==========

/** Export format options */
export type GisExportFormat =
  | 'geojson'
  | 'shapefile'
  | 'geopackage'
  | 'kml'
  | 'gpx'
  | 'csv'
  | 'wkt'

/** Export options */
export interface GisExportOptions {
  format: GisExportFormat
  crs?: string // Target CRS
  includeProperties?: string[] // Property names to include
  excludeProperties?: string[] // Property names to exclude
  precision?: number // Coordinate precision
  encoding?: string // Text encoding
}

// ========== QGIS Integration ==========

/** QGIS project layer reference */
export interface QgisLayerRef {
  id: string
  name: string
  source: string
  provider: string // 'ogr', 'gdal', 'postgres', etc.
  geometryType: GeoJsonGeometryType
  crs: string
  visible: boolean
  expanded: boolean
}

/** QGIS project metadata */
export interface QgisProjectMetadata {
  title: string
  author?: string
  creation?: string
  abstract?: string
  keywords?: string[]
}

/** Simplified QGIS project info */
export interface QgisProjectInfo {
  version: string
  crs: string
  metadata: QgisProjectMetadata
  layers: QgisLayerRef[]
  extent?: GeoJsonBBox
}
