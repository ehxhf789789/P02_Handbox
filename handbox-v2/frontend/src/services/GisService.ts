/**
 * GisService — Geospatial data processing service.
 *
 * Features:
 * - Read GeoJSON, Shapefile, GeoPackage
 * - Coordinate transformation
 * - Spatial analysis
 * - Export to various formats
 * - QGIS integration
 */

import type {
  GeoJson,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  GeoJsonGeometry,
  GeoJsonPosition,
  GeoJsonBBox,
  GeoPackageLayer,
  SpatialPredicate,
  BufferOptions,
  GisExportOptions,
  QgisProjectInfo,
} from '@/types/gis'

type ProgressCallback = (progress: number, message: string) => void

/**
 * GIS Service Class
 */
export class GisService {
  // ========== File Reading ==========

  /**
   * Read GeoJSON file
   */
  async readGeoJson(filePath: string): Promise<GeoJsonFeatureCollection> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const content = await invoke<string>('read_file', { path: filePath })
      const geojson = JSON.parse(content)

      // Normalize to FeatureCollection
      if (geojson.type === 'FeatureCollection') {
        return geojson
      } else if (geojson.type === 'Feature') {
        return {
          type: 'FeatureCollection',
          features: [geojson],
        }
      } else {
        // Geometry only
        return {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: geojson,
              properties: {},
            },
          ],
        }
      }
    } catch (error) {
      throw new Error(`Failed to read GeoJSON: ${error}`)
    }
  }

  /**
   * Read Shapefile (.shp, .dbf, .prj)
   */
  async readShapefile(
    shpPath: string,
    onProgress?: ProgressCallback
  ): Promise<GeoJsonFeatureCollection> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      onProgress?.(0, 'Reading shapefile...')

      const result = await invoke<{
        features: GeoJsonFeature[]
        crs?: string
        bounds?: GeoJsonBBox
      }>('gis_read_shapefile', { path: shpPath })

      onProgress?.(100, 'Complete')

      return {
        type: 'FeatureCollection',
        features: result.features,
        bbox: result.bounds,
      }
    } catch (error) {
      throw new Error(`Failed to read Shapefile: ${error}`)
    }
  }

  /**
   * Read GeoPackage
   */
  async readGeoPackage(
    gpkgPath: string,
    layerName?: string,
    onProgress?: ProgressCallback
  ): Promise<GeoJsonFeatureCollection> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      onProgress?.(0, 'Reading GeoPackage...')

      const result = await invoke<{
        features: GeoJsonFeature[]
        crs?: string
        bounds?: GeoJsonBBox
      }>('gis_read_geopackage', { path: gpkgPath, layer: layerName })

      onProgress?.(100, 'Complete')

      return {
        type: 'FeatureCollection',
        features: result.features,
        bbox: result.bounds,
      }
    } catch (error) {
      throw new Error(`Failed to read GeoPackage: ${error}`)
    }
  }

  /**
   * Get GeoPackage layer info
   */
  async getGeoPackageLayers(gpkgPath: string): Promise<GeoPackageLayer[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoPackageLayer[]>('gis_list_geopackage_layers', { path: gpkgPath })
    } catch (error) {
      throw new Error(`Failed to list GeoPackage layers: ${error}`)
    }
  }

  /**
   * Read QGIS project (.qgs/.qgz)
   */
  async readQgisProject(projectPath: string): Promise<QgisProjectInfo> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<QgisProjectInfo>('gis_read_qgis_project', { path: projectPath })
    } catch (error) {
      throw new Error(`Failed to read QGIS project: ${error}`)
    }
  }

  // ========== Coordinate Transformation ==========

  /**
   * Transform coordinates between CRS
   */
  async transformCoordinates(
    coords: GeoJsonPosition[],
    fromCrs: string,
    toCrs: string
  ): Promise<GeoJsonPosition[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoJsonPosition[]>('gis_transform_coords', {
        coords,
        fromCrs,
        toCrs,
      })
    } catch (error) {
      // Fallback: if same CRS or error, return as-is
      console.warn(`Coordinate transformation failed: ${error}`)
      return coords
    }
  }

  /**
   * Reproject entire GeoJSON
   */
  async reproject(
    geojson: GeoJson,
    fromCrs: string,
    toCrs: string,
    onProgress?: ProgressCallback
  ): Promise<GeoJson> {
    if (fromCrs === toCrs) return geojson

    onProgress?.(0, 'Reprojecting...')

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<GeoJson>('gis_reproject', {
        geojson: JSON.stringify(geojson),
        fromCrs,
        toCrs,
      })

      onProgress?.(100, 'Complete')
      return result
    } catch (error) {
      throw new Error(`Reprojection failed: ${error}`)
    }
  }

  // ========== Spatial Analysis ==========

  /**
   * Calculate bounding box
   */
  calculateBBox(geojson: GeoJson): GeoJsonBBox {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    const processCoord = (coord: GeoJsonPosition) => {
      minX = Math.min(minX, coord[0])
      minY = Math.min(minY, coord[1])
      maxX = Math.max(maxX, coord[0])
      maxY = Math.max(maxY, coord[1])
    }

    const processGeometry = (geom: GeoJsonGeometry | null) => {
      if (!geom) return

      switch (geom.type) {
        case 'Point':
          processCoord(geom.coordinates)
          break
        case 'MultiPoint':
        case 'LineString':
          geom.coordinates.forEach(processCoord)
          break
        case 'MultiLineString':
        case 'Polygon':
          geom.coordinates.forEach(ring => ring.forEach(processCoord))
          break
        case 'MultiPolygon':
          geom.coordinates.forEach(poly =>
            poly.forEach(ring => ring.forEach(processCoord))
          )
          break
        case 'GeometryCollection':
          geom.geometries.forEach(processGeometry)
          break
      }
    }

    if (geojson.type === 'FeatureCollection') {
      geojson.features.forEach(f => processGeometry(f.geometry))
    } else if (geojson.type === 'Feature') {
      processGeometry(geojson.geometry)
    } else {
      processGeometry(geojson)
    }

    return [minX, minY, maxX, maxY]
  }

  /**
   * Calculate centroid
   */
  calculateCentroid(geojson: GeoJson): GeoJsonPosition {
    const bbox = this.calculateBBox(geojson)
    return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  }

  /**
   * Calculate area (in square meters, assumes EPSG:4326)
   */
  async calculateArea(geometry: GeoJsonGeometry): Promise<number> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<number>('gis_calculate_area', {
        geometry: JSON.stringify(geometry),
      })
    } catch (error) {
      // Simple polygon area calculation (approximate for geographic coords)
      if (geometry.type === 'Polygon') {
        const ring = geometry.coordinates[0]
        return ring ? this.polygonArea(ring) : 0
      } else if (geometry.type === 'MultiPolygon') {
        let total = 0
        for (const poly of geometry.coordinates) {
          const ring = poly[0]
          if (ring) total += this.polygonArea(ring)
        }
        return total
      }
      return 0
    }
  }

  /**
   * Calculate length (in meters, assumes EPSG:4326)
   */
  async calculateLength(geometry: GeoJsonGeometry): Promise<number> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<number>('gis_calculate_length', {
        geometry: JSON.stringify(geometry),
      })
    } catch (error) {
      // Simple haversine distance calculation
      if (geometry.type === 'LineString') {
        return this.lineLength(geometry.coordinates)
      } else if (geometry.type === 'MultiLineString') {
        let total = 0
        for (const line of geometry.coordinates) {
          total += this.lineLength(line)
        }
        return total
      }
      return 0
    }
  }

  /**
   * Buffer geometry
   */
  async buffer(
    geometry: GeoJsonGeometry,
    options: BufferOptions
  ): Promise<GeoJsonGeometry> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoJsonGeometry>('gis_buffer', {
        geometry: JSON.stringify(geometry),
        distance: options.distance,
        unit: options.unit,
        segments: options.segments ?? 8,
      })
    } catch (error) {
      throw new Error(`Buffer operation failed: ${error}`)
    }
  }

  /**
   * Spatial predicate test
   */
  async spatialPredicate(
    geom1: GeoJsonGeometry,
    geom2: GeoJsonGeometry,
    predicate: SpatialPredicate
  ): Promise<boolean> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<boolean>('gis_spatial_predicate', {
        geom1: JSON.stringify(geom1),
        geom2: JSON.stringify(geom2),
        predicate,
      })
    } catch (error) {
      throw new Error(`Spatial predicate failed: ${error}`)
    }
  }

  /**
   * Spatial filter - filter features by spatial relationship
   */
  async spatialFilter(
    features: GeoJsonFeatureCollection,
    filterGeometry: GeoJsonGeometry,
    predicate: SpatialPredicate
  ): Promise<GeoJsonFeatureCollection> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const filtered = await invoke<GeoJsonFeature[]>('gis_spatial_filter', {
        features: JSON.stringify(features),
        filterGeometry: JSON.stringify(filterGeometry),
        predicate,
      })

      return {
        type: 'FeatureCollection',
        features: filtered,
      }
    } catch (error) {
      throw new Error(`Spatial filter failed: ${error}`)
    }
  }

  /**
   * Union of geometries
   */
  async union(geometries: GeoJsonGeometry[]): Promise<GeoJsonGeometry> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoJsonGeometry>('gis_union', {
        geometries: geometries.map(g => JSON.stringify(g)),
      })
    } catch (error) {
      throw new Error(`Union operation failed: ${error}`)
    }
  }

  /**
   * Intersection of geometries
   */
  async intersection(
    geom1: GeoJsonGeometry,
    geom2: GeoJsonGeometry
  ): Promise<GeoJsonGeometry | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoJsonGeometry | null>('gis_intersection', {
        geom1: JSON.stringify(geom1),
        geom2: JSON.stringify(geom2),
      })
    } catch (error) {
      throw new Error(`Intersection operation failed: ${error}`)
    }
  }

  /**
   * Difference of geometries
   */
  async difference(
    geom1: GeoJsonGeometry,
    geom2: GeoJsonGeometry
  ): Promise<GeoJsonGeometry | null> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<GeoJsonGeometry | null>('gis_difference', {
        geom1: JSON.stringify(geom1),
        geom2: JSON.stringify(geom2),
      })
    } catch (error) {
      throw new Error(`Difference operation failed: ${error}`)
    }
  }

  // ========== Data Analysis ==========

  /**
   * Get unique values from a property
   */
  getUniqueValues(
    features: GeoJsonFeatureCollection,
    property: string
  ): unknown[] {
    const values = new Set<unknown>()
    for (const feature of features.features) {
      if (feature.properties && property in feature.properties) {
        values.add(feature.properties[property])
      }
    }
    return Array.from(values)
  }

  /**
   * Get statistics for a numeric property
   */
  getPropertyStats(
    features: GeoJsonFeatureCollection,
    property: string
  ): {
    min: number
    max: number
    mean: number
    sum: number
    count: number
    stdDev: number
  } {
    const values: number[] = []

    for (const feature of features.features) {
      if (feature.properties && property in feature.properties) {
        const val = feature.properties[property]
        if (typeof val === 'number' && !isNaN(val)) {
          values.push(val)
        }
      }
    }

    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, sum: 0, count: 0, stdDev: 0 }
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const sum = values.reduce((a, b) => a + b, 0)
    const mean = sum / values.length
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    return { min, max, mean, sum, count: values.length, stdDev }
  }

  /**
   * Group features by property value
   */
  groupByProperty(
    features: GeoJsonFeatureCollection,
    property: string
  ): Map<unknown, GeoJsonFeature[]> {
    const groups = new Map<unknown, GeoJsonFeature[]>()

    for (const feature of features.features) {
      const value = feature.properties?.[property]
      const group = groups.get(value) || []
      group.push(feature)
      groups.set(value, group)
    }

    return groups
  }

  /**
   * Filter features by property
   */
  filterByProperty(
    features: GeoJsonFeatureCollection,
    property: string,
    value: unknown
  ): GeoJsonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features.features.filter(
        f => f.properties?.[property] === value
      ),
    }
  }

  /**
   * Filter features by condition
   */
  filterByCondition(
    features: GeoJsonFeatureCollection,
    condition: (feature: GeoJsonFeature) => boolean
  ): GeoJsonFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features.features.filter(condition),
    }
  }

  // ========== Export ==========

  /**
   * Export to various formats
   */
  async export(
    geojson: GeoJsonFeatureCollection,
    outputPath: string,
    options: GisExportOptions
  ): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      await invoke('gis_export', {
        geojson: JSON.stringify(geojson),
        outputPath,
        format: options.format,
        crs: options.crs,
        precision: options.precision,
      })
    } catch (error) {
      throw new Error(`Export failed: ${error}`)
    }
  }

  /**
   * Convert to WKT string
   */
  toWkt(geometry: GeoJsonGeometry): string {
    switch (geometry.type) {
      case 'Point':
        return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`

      case 'MultiPoint':
        const points = geometry.coordinates
          .map(c => `(${c[0]} ${c[1]})`)
          .join(', ')
        return `MULTIPOINT(${points})`

      case 'LineString':
        const lineCoords = geometry.coordinates
          .map(c => `${c[0]} ${c[1]}`)
          .join(', ')
        return `LINESTRING(${lineCoords})`

      case 'MultiLineString':
        const lines = geometry.coordinates
          .map(line => `(${line.map(c => `${c[0]} ${c[1]}`).join(', ')})`)
          .join(', ')
        return `MULTILINESTRING(${lines})`

      case 'Polygon':
        const rings = geometry.coordinates
          .map(ring => `(${ring.map(c => `${c[0]} ${c[1]}`).join(', ')})`)
          .join(', ')
        return `POLYGON(${rings})`

      case 'MultiPolygon':
        const polys = geometry.coordinates
          .map(
            poly =>
              `(${poly.map(ring => `(${ring.map(c => `${c[0]} ${c[1]}`).join(', ')})`).join(', ')})`
          )
          .join(', ')
        return `MULTIPOLYGON(${polys})`

      case 'GeometryCollection':
        const geoms = geometry.geometries.map(g => this.toWkt(g)).join(', ')
        return `GEOMETRYCOLLECTION(${geoms})`

      default:
        throw new Error(`Unknown geometry type: ${(geometry as any).type}`)
    }
  }

  /**
   * Convert to CSV
   */
  toCsv(
    features: GeoJsonFeatureCollection,
    options: { includeGeometry?: boolean; geometryFormat?: 'wkt' | 'geojson' } = {}
  ): string {
    if (features.features.length === 0) return ''

    // Collect all property keys
    const propertyKeys = new Set<string>()
    for (const feature of features.features) {
      if (feature.properties) {
        Object.keys(feature.properties).forEach(k => propertyKeys.add(k))
      }
    }

    const headers = Array.from(propertyKeys)
    if (options.includeGeometry) {
      headers.push('geometry')
    }

    const rows = [headers.join(',')]

    for (const feature of features.features) {
      const values = headers.map(h => {
        if (h === 'geometry' && feature.geometry) {
          if (options.geometryFormat === 'wkt') {
            return `"${this.toWkt(feature.geometry)}"`
          } else {
            return `"${JSON.stringify(feature.geometry).replace(/"/g, '""')}"`
          }
        }

        const val = feature.properties?.[h]
        if (val === undefined || val === null) return ''
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`
        return String(val)
      })

      rows.push(values.join(','))
    }

    return rows.join('\n')
  }

  // ========== Helper Methods ==========

  private polygonArea(ring: GeoJsonPosition[]): number {
    // Shoelace formula with Earth radius approximation
    const EARTH_RADIUS = 6371000 // meters
    let area = 0

    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i]
      const p2 = ring[i + 1]
      if (!p1 || !p2) continue

      const lon1 = (p1[0] * Math.PI) / 180
      const lat1 = (p1[1] * Math.PI) / 180
      const lon2 = (p2[0] * Math.PI) / 180
      const lat2 = (p2[1] * Math.PI) / 180

      area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2))
    }

    return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2)
  }

  private lineLength(coords: GeoJsonPosition[]): number {
    let length = 0

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i]
      const p2 = coords[i + 1]
      if (!p1 || !p2) continue
      length += this.haversineDistance(p1, p2)
    }

    return length
  }

  private haversineDistance(p1: GeoJsonPosition, p2: GeoJsonPosition): number {
    const EARTH_RADIUS = 6371000 // meters

    const lat1 = (p1[1] * Math.PI) / 180
    const lat2 = (p2[1] * Math.PI) / 180
    const deltaLat = ((p2[1] - p1[1]) * Math.PI) / 180
    const deltaLon = ((p2[0] - p1[0]) * Math.PI) / 180

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return EARTH_RADIUS * c
  }
}

// Singleton instance
export const gisService = new GisService()
