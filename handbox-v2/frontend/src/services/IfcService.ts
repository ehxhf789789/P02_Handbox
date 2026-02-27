/**
 * IfcService — IFC file parsing and analysis service.
 *
 * Features:
 * - Parse IFC-STEP files
 * - Build spatial hierarchy
 * - Extract properties and quantities
 * - Analyze relationships
 * - Export summaries
 */

import type {
  IfcModel,
  IfcEntity,
  IfcRoot,
  IfcFileHeader,
  IfcProject,
  IfcSite,
  IfcBuilding,
  IfcBuildingStorey,
  IfcSpace,
  IfcBuildingElement,
  IfcRelationship,
  IfcRelAggregates,
  IfcRelContainedInSpatialStructure,
  IfcRelDefinesByProperties,
  IfcPropertySet,
  IfcPropertySingleValue,
  IfcMaterial,
  IfcProduct,
  SpatialHierarchyNode,
  ElementSummary,
  PropertySummary,
  RelationshipSummary,
} from '@/types/ifc'
import {
  IFC_ELEMENT_CLASSES,
  IFC_SPATIAL_CLASSES,
  IFC_RELATIONSHIP_CLASSES,
} from '@/types/ifc'

type ProgressCallback = (progress: number, message: string) => void

/**
 * IFC Service Class
 */
export class IfcService {
  // ========== Parsing ==========

  /**
   * Parse IFC file
   */
  async parseFile(filePath: string, onProgress?: ProgressCallback): Promise<IfcModel> {
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      onProgress?.(0, 'Reading IFC file...')

      const result = await invoke<{
        schema: string
        header: IfcFileHeader
        entities: Record<string, any>
      }>('ifc_parse_file', { path: filePath })

      onProgress?.(50, 'Building model...')

      const model = this.buildModel(result)

      onProgress?.(100, 'Complete')

      return model
    } catch (error) {
      throw new Error(`Failed to parse IFC file: ${error}`)
    }
  }

  /**
   * Parse IFC content string
   */
  async parseContent(content: string, onProgress?: ProgressCallback): Promise<IfcModel> {
    onProgress?.(0, 'Parsing IFC content...')

    // Simple STEP parser for frontend
    const lines = content.split('\n')
    const entities = new Map<number, IfcEntity>()
    const byType = new Map<string, number[]>()

    let inHeader = false
    let inData = false
    const header: IfcFileHeader = {}

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]
      if (!rawLine) continue
      const line = rawLine.trim()

      if (i % 1000 === 0) {
        onProgress?.((i / lines.length) * 80, `Parsing line ${i}...`)
      }

      if (line === 'HEADER;') {
        inHeader = true
        continue
      }
      if (line === 'ENDSEC;' && inHeader) {
        inHeader = false
        continue
      }
      if (line === 'DATA;') {
        inData = true
        continue
      }
      if (line === 'ENDSEC;' && inData) {
        inData = false
        continue
      }

      if (inHeader) {
        this.parseHeaderLine(line, header)
      }

      if (inData && line.startsWith('#')) {
        const entity = this.parseEntityLine(line)
        if (entity) {
          entities.set(entity.id, entity)

          const typeList = byType.get(entity.type) || []
          typeList.push(entity.id)
          byType.set(entity.type, typeList)
        }
      }
    }

    onProgress?.(80, 'Building model...')

    const model = this.buildModelFromEntities(
      header.fileSchema?.schemas[0] || 'IFC4X3',
      header,
      entities,
      byType
    )

    onProgress?.(100, 'Complete')

    return model
  }

  private parseHeaderLine(line: string, header: IfcFileHeader): void {
    if (line.startsWith('FILE_DESCRIPTION')) {
      // Parse file description
      const match = line.match(/FILE_DESCRIPTION\s*\(\s*\((.*?)\)\s*,\s*'(.*?)'\s*\)/)
      if (match && match[1] && match[2]) {
        header.fileDescription = {
          description: match[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')),
          implementationLevel: match[2],
        }
      }
    } else if (line.startsWith('FILE_NAME')) {
      // Parse file name
      const match = line.match(/FILE_NAME\s*\(\s*'(.*?)'\s*,\s*'(.*?)'/)
      if (match && match[1] && match[2]) {
        header.fileName = {
          name: match[1],
          timeStamp: match[2],
          author: [],
          organization: [],
          preprocessorVersion: '',
          originatingSystem: '',
          authorization: '',
        }
      }
    } else if (line.startsWith('FILE_SCHEMA')) {
      const match = line.match(/FILE_SCHEMA\s*\(\s*\(\s*'(.*?)'\s*\)\s*\)/)
      if (match && match[1]) {
        header.fileSchema = { schemas: [match[1]] }
      }
    }
  }

  private parseEntityLine(line: string): IfcEntity | null {
    // Pattern: #123=IFCWALL('guid',$,...)
    const match = line.match(/^#(\d+)\s*=\s*(\w+)\s*\((.*)\);?$/)
    if (!match || !match[1] || !match[2]) return null

    const id = parseInt(match[1])
    const type = match[2]
    const args = this.parseArgs(match[3] || '')

    const entity: IfcEntity = { id, type }

    // Parse common attributes based on type
    if (this.isRootType(type) && args.length >= 4) {
      const root = entity as IfcRoot
      const arg0 = args[0]
      const arg2 = args[2]
      const arg3 = args[3]
      root.globalId = arg0 ? this.parseString(arg0) ?? '' : ''
      // args[1] is ownerHistory reference
      root.name = arg2 ? this.parseString(arg2) : undefined
      root.description = arg3 ? this.parseString(arg3) : undefined
    }

    // Store raw args for later processing
    ;(entity as any)._args = args

    return entity
  }

  private parseArgs(argsStr: string): string[] {
    const args: string[] = []
    let current = ''
    let depth = 0
    let inString = false

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i]

      if (char === "'" && argsStr[i - 1] !== '\\') {
        inString = !inString
        current += char
      } else if (!inString && char === '(') {
        depth++
        current += char
      } else if (!inString && char === ')') {
        depth--
        current += char
      } else if (!inString && char === ',' && depth === 0) {
        args.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    if (current.trim()) {
      args.push(current.trim())
    }

    return args
  }

  private parseString(arg: string): string | undefined {
    if (arg === '$' || arg === '*') return undefined
    if (arg.startsWith("'") && arg.endsWith("'")) {
      return arg.slice(1, -1)
    }
    return arg
  }

  private parseRef(arg: string): number | undefined {
    if (arg.startsWith('#')) {
      return parseInt(arg.slice(1))
    }
    return undefined
  }

  private parseRefList(arg: string): number[] {
    if (!arg.startsWith('(') || !arg.endsWith(')')) return []
    const inner = arg.slice(1, -1)
    return inner.split(',').map(s => this.parseRef(s.trim())).filter((n): n is number => n !== undefined)
  }

  private isRootType(type: string): boolean {
    return type.startsWith('IFC') && (
      IFC_SPATIAL_CLASSES.includes(type as any) ||
      IFC_ELEMENT_CLASSES.includes(type as any) ||
      IFC_RELATIONSHIP_CLASSES.includes(type as any) ||
      type === 'IfcPropertySet' ||
      type === 'IfcElementQuantity'
    )
  }

  private buildModel(result: any): IfcModel {
    const entities = new Map<number, IfcEntity>()
    const byType = new Map<string, number[]>()

    for (const [idStr, entity] of Object.entries(result.entities)) {
      const id = parseInt(idStr)
      entities.set(id, entity as IfcEntity)

      const type = (entity as IfcEntity).type
      const typeList = byType.get(type) || []
      typeList.push(id)
      byType.set(type, typeList)
    }

    return this.buildModelFromEntities(result.schema, result.header, entities, byType)
  }

  private buildModelFromEntities(
    schema: string,
    header: IfcFileHeader,
    entities: Map<number, IfcEntity>,
    byType: Map<string, number[]>
  ): IfcModel {
    // Extract key entities
    const projectIds = byType.get('IfcProject') || []
    const firstProjectId = projectIds[0]
    const project = firstProjectId !== undefined ? entities.get(firstProjectId) as IfcProject : undefined

    const sites = (byType.get('IfcSite') || []).map(id => entities.get(id) as IfcSite)
    const buildings = (byType.get('IfcBuilding') || []).map(id => entities.get(id) as IfcBuilding)
    const storeys = (byType.get('IfcBuildingStorey') || []).map(id => entities.get(id) as IfcBuildingStorey)
    const spaces = (byType.get('IfcSpace') || []).map(id => entities.get(id) as IfcSpace)

    // Collect all building elements
    const elements: IfcBuildingElement[] = []
    for (const elementType of IFC_ELEMENT_CLASSES) {
      const ids = byType.get(elementType) || []
      for (const id of ids) {
        elements.push(entities.get(id) as IfcBuildingElement)
      }
    }

    // Collect relationships
    const relationships: IfcRelationship[] = []
    for (const relType of IFC_RELATIONSHIP_CLASSES) {
      const ids = byType.get(relType) || []
      for (const id of ids) {
        relationships.push(entities.get(id) as IfcRelationship)
      }
    }

    // Collect property sets
    const propertySets = (byType.get('IfcPropertySet') || []).map(id => entities.get(id) as IfcPropertySet)

    // Collect materials
    const materials = (byType.get('IfcMaterial') || []).map(id => entities.get(id) as IfcMaterial)

    return {
      schema,
      header,
      entities,
      byType,
      project,
      sites,
      buildings,
      storeys,
      spaces,
      elements,
      relationships,
      propertySets,
      materials,
    }
  }

  // ========== Analysis ==========

  /**
   * Build spatial hierarchy tree
   */
  buildSpatialHierarchy(model: IfcModel): SpatialHierarchyNode | null {
    if (!model.project) return null

    const aggregates = model.relationships.filter(
      (r): r is IfcRelAggregates => r.type === 'IfcRelAggregates'
    )

    const containments = model.relationships.filter(
      (r): r is IfcRelContainedInSpatialStructure => r.type === 'IfcRelContainedInSpatialStructure'
    )

    // Build parent-children map from aggregates
    const childrenMap = new Map<number, number[]>()
    for (const rel of aggregates) {
      const args = (rel as any)._args
      if (args && args.length >= 6) {
        const relatingId = this.parseRef(args[4])
        const relatedIds = this.parseRefList(args[5])
        if (relatingId !== undefined) {
          childrenMap.set(relatingId, relatedIds)
        }
      }
    }

    // Build contained elements map
    const elementsMap = new Map<number, number[]>()
    for (const rel of containments) {
      const args = (rel as any)._args
      if (args && args.length >= 6) {
        const structureId = this.parseRef(args[5])
        const elementIds = this.parseRefList(args[4])
        if (structureId !== undefined) {
          elementsMap.set(structureId, elementIds)
        }
      }
    }

    const buildNode = (entityId: number): SpatialHierarchyNode | null => {
      const entity = model.entities.get(entityId)
      if (!entity) return null

      const childIds = childrenMap.get(entityId) || []
      const children = childIds
        .map(id => buildNode(id))
        .filter((n): n is SpatialHierarchyNode => n !== null)

      const elementIds = elementsMap.get(entityId) || []
      const elements = elementIds
        .map(id => model.entities.get(id))
        .filter((e): e is IfcProduct => e !== undefined)

      return {
        entity: entity as any,
        children,
        elements,
      }
    }

    return buildNode(model.project.id)
  }

  /**
   * Get element summary by type
   */
  getElementSummary(model: IfcModel): ElementSummary[] {
    const summaryMap = new Map<string, ElementSummary>()

    for (const element of model.elements) {
      let summary = summaryMap.get(element.type)
      if (!summary) {
        summary = { type: element.type, count: 0, items: [] }
        summaryMap.set(element.type, summary)
      }

      summary.count++
      summary.items.push({
        id: element.id,
        globalId: (element as any).globalId || '',
        name: (element as any).name,
        predefinedType: (element as any).predefinedType,
      })
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.count - a.count)
  }

  /**
   * Get properties for an entity
   */
  getEntityProperties(model: IfcModel, entityId: number): PropertySummary[] {
    const defByProps = model.relationships.filter(
      (r): r is IfcRelDefinesByProperties => r.type === 'IfcRelDefinesByProperties'
    )

    const summaries: PropertySummary[] = []

    for (const rel of defByProps) {
      const args = (rel as any)._args
      if (!args || args.length < 6) continue

      const relatedIds = this.parseRefList(args[4])
      if (!relatedIds.includes(entityId)) continue

      const psetId = this.parseRef(args[5])
      if (psetId === undefined) continue

      const pset = model.entities.get(psetId) as IfcPropertySet
      if (!pset) continue

      const properties: PropertySummary['properties'] = []
      const propIds = (pset as any)._args ? this.parseRefList((pset as any)._args[4]) : []

      for (const propId of propIds) {
        const prop = model.entities.get(propId) as IfcPropertySingleValue
        if (!prop) continue

        const propArgs = (prop as any)._args
        if (!propArgs) continue

        properties.push({
          name: this.parseString(propArgs[0]) || 'Unknown',
          value: this.parsePropertyValue(propArgs[2]),
          type: prop.type,
        })
      }

      summaries.push({
        psetName: pset.name || 'Unknown',
        properties,
      })
    }

    return summaries
  }

  private parsePropertyValue(valueArg: string): unknown {
    if (!valueArg || valueArg === '$') return null

    // Try to parse typed value like IFCLABEL('value')
    const match = valueArg.match(/^(\w+)\((.*)\)$/)
    if (match && match[1] && match[2] !== undefined) {
      const type = match[1]
      const inner = match[2]

      if (type.includes('REAL') || type.includes('LENGTH') || type.includes('AREA') || type.includes('VOLUME')) {
        return parseFloat(inner)
      }
      if (type.includes('INTEGER') || type.includes('COUNT')) {
        return parseInt(inner)
      }
      if (type.includes('BOOLEAN') || type.includes('LOGICAL')) {
        return inner === '.T.'
      }
      return this.parseString(inner)
    }

    return valueArg
  }

  /**
   * Get relationship summary
   */
  getRelationshipSummary(model: IfcModel): RelationshipSummary[] {
    const summaryMap = new Map<string, RelationshipSummary>()

    for (const rel of model.relationships) {
      let summary = summaryMap.get(rel.type)
      if (!summary) {
        summary = { type: rel.type, count: 0, connections: [] }
        summaryMap.set(rel.type, summary)
      }

      summary.count++

      // Extract connection info based on relationship type
      const args = (rel as any)._args
      if (args) {
        if (rel.type === 'IfcRelAggregates' && args.length >= 6) {
          const relatingId = this.parseRef(args[4])
          const relatedIds = this.parseRefList(args[5])

          if (relatingId) {
            const relatingEntity = model.entities.get(relatingId)
            for (const relatedId of relatedIds.slice(0, 5)) {
              const relatedEntity = model.entities.get(relatedId)
              if (relatingEntity && relatedEntity) {
                summary.connections.push({
                  from: {
                    id: relatingId,
                    type: relatingEntity.type,
                    name: (relatingEntity as any).name,
                  },
                  to: {
                    id: relatedId,
                    type: relatedEntity.type,
                    name: (relatedEntity as any).name,
                  },
                })
              }
            }
          }
        }
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.count - a.count)
  }

  /**
   * Search entities by criteria
   */
  searchEntities(
    model: IfcModel,
    criteria: {
      type?: string
      name?: string
      globalId?: string
      propertyName?: string
      propertyValue?: unknown
    }
  ): IfcEntity[] {
    let results = Array.from(model.entities.values())

    if (criteria.type) {
      results = results.filter(e => e.type === criteria.type || e.type.includes(criteria.type!))
    }

    if (criteria.name) {
      const searchName = criteria.name.toLowerCase()
      results = results.filter(e => (e as any).name?.toLowerCase().includes(searchName))
    }

    if (criteria.globalId) {
      results = results.filter(e => (e as any).globalId === criteria.globalId)
    }

    // Property search would require relationship traversal
    // Simplified for now

    return results
  }

  /**
   * Get model statistics
   */
  getModelStatistics(model: IfcModel): {
    totalEntities: number
    totalElements: number
    totalRelationships: number
    totalPropertySets: number
    entityTypes: { type: string; count: number }[]
    schema: string
  } {
    const entityTypes = Array.from(model.byType.entries())
      .map(([type, ids]) => ({ type, count: ids.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)

    return {
      totalEntities: model.entities.size,
      totalElements: model.elements.length,
      totalRelationships: model.relationships.length,
      totalPropertySets: model.propertySets.length,
      entityTypes,
      schema: model.schema,
    }
  }

  // ========== Export ==========

  /**
   * Export model summary as JSON
   */
  exportSummaryJson(model: IfcModel): string {
    const summary = {
      schema: model.schema,
      statistics: this.getModelStatistics(model),
      elementSummary: this.getElementSummary(model),
      relationshipSummary: this.getRelationshipSummary(model),
    }

    return JSON.stringify(summary, null, 2)
  }

  /**
   * Export element list as CSV
   */
  exportElementsCsv(model: IfcModel): string {
    const headers = ['ID', 'GlobalId', 'Type', 'Name', 'Description']
    const rows = [headers.join(',')]

    for (const element of model.elements) {
      const row = [
        element.id.toString(),
        `"${(element as any).globalId || ''}"`,
        element.type,
        `"${(element as any).name || ''}"`,
        `"${(element as any).description || ''}"`,
      ]
      rows.push(row.join(','))
    }

    return rows.join('\n')
  }
}

// Singleton instance
export const ifcService = new IfcService()
