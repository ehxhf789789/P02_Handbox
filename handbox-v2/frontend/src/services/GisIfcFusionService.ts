/**
 * GisIfcFusionService — Integration service for GIS and IFC data.
 *
 * Features:
 * - Coordinate system alignment between GIS and IFC
 * - Spatial context linking
 * - Combined analysis
 * - Export to various formats
 * - Unified visualization data preparation
 */

import type {
  GeoJsonFeatureCollection,
  GeoJsonFeature,
  GeoJsonGeometry,
  GeoJsonPosition,
  GeoJsonBBox,
} from '@/types/gis'
import type {
  IfcModel,
  IfcBuildingElement,
  IfcEntity,
} from '@/types/ifc'
import { gisService } from './GisService'
import { ifcService } from './IfcService'

// ========== Types ==========

/** Unified coordinate system for fusion */
export interface FusionCoordinateSystem {
  epsgCode: string
  origin: [number, number, number] // [x, y, z] or [lon, lat, elev]
  rotation: number // degrees from north
  scale: number
}

/** GIS-IFC link record */
export interface GisIfcLink {
  id: string
  gisFeatureId: string | number
  ifcEntityId: number
  linkType: 'site' | 'building' | 'element' | 'alignment' | 'custom'
  confidence: number // 0-1
  method: 'manual' | 'name' | 'location' | 'attribute'
  metadata?: Record<string, unknown>
}

/** Fusion project */
export interface FusionProject {
  id: string
  name: string
  description?: string
  crs: FusionCoordinateSystem
  gisSources: GisSource[]
  ifcSources: IfcSource[]
  links: GisIfcLink[]
  createdAt: string
  updatedAt: string
}

/** GIS source in fusion project */
export interface GisSource {
  id: string
  name: string
  type: 'geojson' | 'shapefile' | 'geopackage'
  path?: string
  data?: GeoJsonFeatureCollection
  originalCrs?: string
  featureCount: number
}

/** IFC source in fusion project */
export interface IfcSource {
  id: string
  name: string
  path?: string
  model?: IfcModel
  siteLocation?: {
    latitude: number
    longitude: number
    elevation: number
  }
  elementCount: number
}

/** Fusion analysis result */
export interface FusionAnalysisResult {
  type: string
  gisFeatures?: GeoJsonFeature[]
  ifcElements?: IfcEntity[]
  metrics?: Record<string, number>
  report?: string
}

/** Export options for fusion data */
export interface FusionExportOptions {
  format: 'geojson' | 'ifc' | 'gltf' | 'cityjson' | 'csv'
  includeGis: boolean
  includeIfc: boolean
  crs?: string
  includeLinks?: boolean
}

// ========== Fusion Service ==========

export class GisIfcFusionService {
  private projects: Map<string, FusionProject> = new Map()

  // ========== Project Management ==========

  /**
   * Create a new fusion project
   */
  createProject(
    name: string,
    crs?: Partial<FusionCoordinateSystem>
  ): FusionProject {
    const project: FusionProject = {
      id: crypto.randomUUID(),
      name,
      crs: {
        epsgCode: crs?.epsgCode || 'EPSG:4326',
        origin: crs?.origin || [0, 0, 0],
        rotation: crs?.rotation || 0,
        scale: crs?.scale || 1,
      },
      gisSources: [],
      ifcSources: [],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.projects.set(project.id, project)
    return project
  }

  /**
   * Get project by ID
   */
  getProject(projectId: string): FusionProject | undefined {
    return this.projects.get(projectId)
  }

  /**
   * Add GIS source to project
   */
  addGisSource(
    projectId: string,
    name: string,
    data: GeoJsonFeatureCollection,
    originalCrs?: string
  ): GisSource | null {
    const project = this.projects.get(projectId)
    if (!project) return null

    const source: GisSource = {
      id: crypto.randomUUID(),
      name,
      type: 'geojson',
      data,
      originalCrs,
      featureCount: data.features.length,
    }

    project.gisSources.push(source)
    project.updatedAt = new Date().toISOString()

    return source
  }

  /**
   * Add IFC source to project
   */
  addIfcSource(
    projectId: string,
    name: string,
    model: IfcModel
  ): IfcSource | null {
    const project = this.projects.get(projectId)
    if (!project) return null

    // Extract site location if available
    let siteLocation: IfcSource['siteLocation'] | undefined
    if (model.sites.length > 0) {
      const site = model.sites[0]
      if (site && site.refLatitude && site.refLongitude) {
        siteLocation = {
          latitude: this.dmsToDecimal(site.refLatitude),
          longitude: this.dmsToDecimal(site.refLongitude),
          elevation: site.refElevation || 0,
        }
      }
    }

    const source: IfcSource = {
      id: crypto.randomUUID(),
      name,
      model,
      siteLocation,
      elementCount: model.elements.length,
    }

    project.ifcSources.push(source)
    project.updatedAt = new Date().toISOString()

    return source
  }

  // ========== Coordinate Alignment ==========

  /**
   * Align IFC model to GIS coordinate system
   */
  alignIfcToGis(
    ifcModel: IfcModel,
    gisData: GeoJsonFeatureCollection,
    options: {
      matchBy?: 'site' | 'building' | 'manual'
      referencePoint?: GeoJsonPosition
    } = {}
  ): {
    transform: { translate: [number, number, number]; rotate: number; scale: number }
    alignedBounds: GeoJsonBBox
  } {
    // Get IFC site location
    let ifcOrigin: [number, number, number] = [0, 0, 0]
    if (ifcModel.sites.length > 0) {
      const site = ifcModel.sites[0]
      if (site && site.refLatitude && site.refLongitude) {
        ifcOrigin = [
          this.dmsToDecimal(site.refLongitude),
          this.dmsToDecimal(site.refLatitude),
          site.refElevation || 0,
        ]
      }
    }

    // Get GIS reference point
    let gisReference: GeoJsonPosition = options.referencePoint || [0, 0]
    if (!options.referencePoint) {
      const bbox = gisService.calculateBBox(gisData)
      gisReference = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
    }

    // Calculate transform
    const translate: [number, number, number] = [
      gisReference[0] - ifcOrigin[0],
      gisReference[1] - ifcOrigin[1],
      (gisReference[2] || 0) - ifcOrigin[2],
    ]

    // Calculate aligned bounds
    // This is simplified - real implementation would transform all geometry
    const gisBbox = gisService.calculateBBox(gisData)
    const alignedBounds: GeoJsonBBox = [
      gisBbox[0],
      gisBbox[1],
      gisBbox[2],
      gisBbox[3],
    ]

    return {
      transform: {
        translate,
        rotate: 0, // Would need true north calculation
        scale: 1,
      },
      alignedBounds,
    }
  }

  /**
   * Convert IFC elements to GeoJSON features
   */
  ifcToGeoJson(
    ifcModel: IfcModel,
    options: {
      elementTypes?: string[]
      includeProperties?: boolean
      crs?: string
    } = {}
  ): GeoJsonFeatureCollection {
    const features: GeoJsonFeature[] = []

    // Filter elements
    let elements = ifcModel.elements
    if (options.elementTypes && options.elementTypes.length > 0) {
      elements = elements.filter(e => options.elementTypes!.includes(e.type))
    }

    // Get site location for geo-referencing
    let siteOrigin: GeoJsonPosition = [0, 0]
    if (ifcModel.sites.length > 0) {
      const site = ifcModel.sites[0]
      if (site && site.refLatitude && site.refLongitude) {
        siteOrigin = [
          this.dmsToDecimal(site.refLongitude),
          this.dmsToDecimal(site.refLatitude),
        ]
      }
    }

    for (const element of elements) {
      // Create point feature for element (simplified)
      // Real implementation would extract actual geometry
      const feature: GeoJsonFeature = {
        type: 'Feature',
        id: element.id,
        geometry: {
          type: 'Point',
          coordinates: siteOrigin, // Simplified - would use actual position
        },
        properties: {
          ifcId: element.id,
          globalId: (element as any).globalId,
          type: element.type,
          name: (element as any).name,
        },
      }

      // Add properties if requested
      if (options.includeProperties) {
        const props = ifcService.getEntityProperties(ifcModel, element.id)
        for (const pset of props) {
          for (const prop of pset.properties) {
            feature.properties![`${pset.psetName}.${prop.name}`] = prop.value
          }
        }
      }

      features.push(feature)
    }

    return {
      type: 'FeatureCollection',
      features,
    }
  }

  // ========== Link Management ==========

  /**
   * Auto-link GIS features to IFC elements
   */
  autoLink(
    projectId: string,
    method: 'name' | 'location' | 'attribute',
    options: {
      threshold?: number
      attributeName?: string
    } = {}
  ): GisIfcLink[] {
    const project = this.projects.get(projectId)
    if (!project) return []

    const newLinks: GisIfcLink[] = []

    for (const gisSource of project.gisSources) {
      if (!gisSource.data) continue

      for (const ifcSource of project.ifcSources) {
        if (!ifcSource.model) continue

        // Match based on method
        for (const feature of gisSource.data.features) {
          for (const element of ifcSource.model.elements) {
            const link = this.matchFeatureToElement(feature, element, method, options)
            if (link) {
              newLinks.push(link)
            }
          }
        }
      }
    }

    project.links.push(...newLinks)
    project.updatedAt = new Date().toISOString()

    return newLinks
  }

  /**
   * Create manual link
   */
  createManualLink(
    projectId: string,
    gisFeatureId: string | number,
    ifcEntityId: number,
    linkType: GisIfcLink['linkType'] = 'custom'
  ): GisIfcLink | null {
    const project = this.projects.get(projectId)
    if (!project) return null

    const link: GisIfcLink = {
      id: crypto.randomUUID(),
      gisFeatureId,
      ifcEntityId,
      linkType,
      confidence: 1,
      method: 'manual',
    }

    project.links.push(link)
    project.updatedAt = new Date().toISOString()

    return link
  }

  private matchFeatureToElement(
    feature: GeoJsonFeature,
    element: IfcBuildingElement,
    method: 'name' | 'location' | 'attribute',
    options: { threshold?: number; attributeName?: string }
  ): GisIfcLink | null {
    const threshold = options.threshold || 0.8

    if (method === 'name') {
      const gisName = String(feature.properties?.name || '').toLowerCase()
      const ifcName = String((element as any).name || '').toLowerCase()

      if (gisName && ifcName) {
        const similarity = this.stringSimilarity(gisName, ifcName)
        if (similarity >= threshold) {
          return {
            id: crypto.randomUUID(),
            gisFeatureId: feature.id || '',
            ifcEntityId: element.id,
            linkType: 'element',
            confidence: similarity,
            method: 'name',
          }
        }
      }
    }

    // Add more matching methods as needed

    return null
  }

  private stringSimilarity(a: string, b: string): number {
    // Simple Jaccard similarity
    const setA = new Set(a.split(/\s+/))
    const setB = new Set(b.split(/\s+/))
    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])
    return intersection.size / union.size
  }

  // ========== Analysis ==========

  /**
   * Spatial analysis: find IFC elements within GIS boundary
   */
  findElementsWithinBoundary(
    ifcModel: IfcModel,
    _boundary: GeoJsonGeometry
  ): IfcEntity[] {
    // This is a simplified implementation
    // Real implementation would use actual IFC geometry and spatial queries
    return ifcModel.elements.filter(_element => {
      // For now, return all elements (needs proper spatial intersection)
      return true
    })
  }

  /**
   * Generate combined statistics
   */
  getCombinedStatistics(projectId: string): {
    gis: { featureCount: number; geometryTypes: Record<string, number> }
    ifc: { elementCount: number; elementTypes: Record<string, number> }
    links: { total: number; byType: Record<string, number> }
  } {
    const project = this.projects.get(projectId)
    if (!project) {
      return {
        gis: { featureCount: 0, geometryTypes: {} },
        ifc: { elementCount: 0, elementTypes: {} },
        links: { total: 0, byType: {} },
      }
    }

    // GIS stats
    let featureCount = 0
    const geometryTypes: Record<string, number> = {}
    for (const source of project.gisSources) {
      if (source.data) {
        featureCount += source.data.features.length
        for (const feature of source.data.features) {
          if (feature.geometry) {
            geometryTypes[feature.geometry.type] = (geometryTypes[feature.geometry.type] || 0) + 1
          }
        }
      }
    }

    // IFC stats
    let elementCount = 0
    const elementTypes: Record<string, number> = {}
    for (const source of project.ifcSources) {
      if (source.model) {
        elementCount += source.model.elements.length
        for (const element of source.model.elements) {
          elementTypes[element.type] = (elementTypes[element.type] || 0) + 1
        }
      }
    }

    // Link stats
    const linksByType: Record<string, number> = {}
    for (const link of project.links) {
      linksByType[link.linkType] = (linksByType[link.linkType] || 0) + 1
    }

    return {
      gis: { featureCount, geometryTypes },
      ifc: { elementCount, elementTypes },
      links: { total: project.links.length, byType: linksByType },
    }
  }

  // ========== Export ==========

  /**
   * Export fusion project data
   */
  async export(
    projectId: string,
    options: FusionExportOptions
  ): Promise<string> {
    const project = this.projects.get(projectId)
    if (!project) throw new Error('Project not found')

    switch (options.format) {
      case 'geojson':
        return this.exportToGeoJson(project, options)
      case 'csv':
        return this.exportToCsv(project, options)
      case 'cityjson':
        return this.exportToCityJson(project, options)
      default:
        throw new Error(`Unsupported format: ${options.format}`)
    }
  }

  private exportToGeoJson(project: FusionProject, options: FusionExportOptions): string {
    const features: GeoJsonFeature[] = []

    // Add GIS features
    if (options.includeGis) {
      for (const source of project.gisSources) {
        if (source.data) {
          features.push(...source.data.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              _source: 'gis',
              _sourceName: source.name,
            },
          })))
        }
      }
    }

    // Add IFC elements as features
    if (options.includeIfc) {
      for (const source of project.ifcSources) {
        if (source.model) {
          const ifcFeatures = this.ifcToGeoJson(source.model, { includeProperties: true })
          features.push(...ifcFeatures.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              _source: 'ifc',
              _sourceName: source.name,
            },
          })))
        }
      }
    }

    // Add link information
    if (options.includeLinks) {
      for (const feature of features) {
        const links = project.links.filter(l =>
          l.gisFeatureId === feature.id || l.ifcEntityId === (feature.properties?.ifcId as number)
        )
        if (links.length > 0) {
          feature.properties = feature.properties || {}
          feature.properties._links = links.map(l => ({
            id: l.id,
            type: l.linkType,
            confidence: l.confidence,
          }))
        }
      }
    }

    return JSON.stringify({
      type: 'FeatureCollection',
      features,
    }, null, 2)
  }

  private exportToCsv(project: FusionProject, options: FusionExportOptions): string {
    const rows: string[][] = []
    const headers = ['source', 'sourceName', 'id', 'type', 'name']
    rows.push(headers)

    if (options.includeGis) {
      for (const source of project.gisSources) {
        if (source.data) {
          for (const feature of source.data.features) {
            rows.push([
              'gis',
              source.name,
              String(feature.id || ''),
              feature.geometry?.type || '',
              String(feature.properties?.name || ''),
            ])
          }
        }
      }
    }

    if (options.includeIfc) {
      for (const source of project.ifcSources) {
        if (source.model) {
          for (const element of source.model.elements) {
            rows.push([
              'ifc',
              source.name,
              String(element.id),
              element.type,
              String((element as any).name || ''),
            ])
          }
        }
      }
    }

    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  }

  private exportToCityJson(project: FusionProject, options: FusionExportOptions): string {
    // CityJSON format (simplified)
    const cityJson = {
      type: 'CityJSON',
      version: '2.0',
      transform: {
        scale: [0.001, 0.001, 0.001],
        translate: project.crs.origin,
      },
      CityObjects: {} as Record<string, any>,
      vertices: [] as number[][],
    }

    // Add IFC buildings as CityObjects
    if (options.includeIfc) {
      for (const source of project.ifcSources) {
        if (source.model) {
          for (const building of source.model.buildings) {
            cityJson.CityObjects[(building as any).globalId || `building_${building.id}`] = {
              type: 'Building',
              attributes: {
                name: (building as any).name,
                ifcId: building.id,
              },
              geometry: [], // Would include actual geometry
            }
          }
        }
      }
    }

    return JSON.stringify(cityJson, null, 2)
  }

  // ========== Helpers ==========

  private dmsToDecimal(dms: [number, number, number, number?]): number {
    const [degrees, minutes, seconds, millionths = 0] = dms
    return degrees + minutes / 60 + (seconds + millionths / 1000000) / 3600
  }
}

// Singleton instance
export const gisIfcFusionService = new GisIfcFusionService()
