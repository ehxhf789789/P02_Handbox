/**
 * UnifiedViewer - Combined GIS Map + IFC 3D Viewer
 *
 * Provides synchronized viewing of terrain/GIS data alongside IFC models
 * with interactive linking and selection.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { FusionProject, GisIfcLink, GisSource, IfcSource } from '@/services/GisIfcFusionService'
import type { GeoJsonFeatureCollection, GeoJsonFeature, GeoJsonGeometry } from '@/types/gis'
import type { IfcModel, IfcEntity } from '@/types/ifc'

// Type alias for backward compatibility
type FeatureCollection = GeoJsonFeatureCollection

// ============================================================================
// Types
// ============================================================================

interface ViewerState {
  gisCenter: [number, number]
  gisZoom: number
  ifcRotation: { x: number; y: number }
  ifcZoom: number
  syncEnabled: boolean
}

interface SelectionState {
  gisFeatureId: string | null
  ifcEntityId: number | null
  linkedPair: GisIfcLink | null
}

interface UnifiedViewerProps {
  project: FusionProject
  onFeatureSelect?: (feature: GeoJsonFeature | null) => void
  onElementSelect?: (elementId: number | null) => void
  onLinkSelect?: (link: GisIfcLink | null) => void
  initialState?: Partial<ViewerState>
  className?: string
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * GIS Map Panel (2D)
 */
const GisMapPanel: React.FC<{
  sources: GisSource[]
  selectedFeatureId: string | null
  highlightedIds: Set<string>
  viewState: { center: [number, number]; zoom: number }
  onFeatureClick: (featureId: string) => void
  onViewChange: (center: [number, number], zoom: number) => void
}> = ({ sources, selectedFeatureId, highlightedIds, viewState, onFeatureClick, onViewChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Calculate bounds from all sources (for future use)
  const _bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const source of sources) {
      const fc = source.data as FeatureCollection
      if (!fc?.features) continue
      for (const feature of fc.features) {
        if (!feature.geometry) continue
        const coords = extractCoordinates(feature.geometry)
        for (const [x, y] of coords) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }

    return { minX, minY, maxX, maxY }
  }, [sources])
  void _bounds // suppress unused variable warning

  // Draw map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    // Grid
    ctx.strokeStyle = '#2a2a4e'
    ctx.lineWidth = 1
    const gridSize = 50
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Transform function
    const scale = viewState.zoom
    const transform = (lon: number, lat: number): [number, number] => {
      const x = (lon - viewState.center[0]) * scale + width / 2
      const y = height / 2 - (lat - viewState.center[1]) * scale
      return [x, y]
    }

    // Draw features
    for (const source of sources) {
      const fc = source.data as FeatureCollection

      for (const feature of fc.features) {
        const isSelected = feature.id === selectedFeatureId
        const isHighlighted = highlightedIds.has(String(feature.id))

        drawFeature(ctx, feature, transform, {
          selected: isSelected,
          highlighted: isHighlighted,
          layerType: source.type || 'geojson',
        })
      }
    }

    // Scale bar
    drawScaleBar(ctx, width, height, scale)
  }, [sources, selectedFeatureId, highlightedIds, viewState])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return

    const dx = (e.clientX - dragStart.x) / viewState.zoom
    const dy = (e.clientY - dragStart.y) / viewState.zoom

    onViewChange(
      [viewState.center[0] - dx * 0.0001, viewState.center[1] + dy * 0.0001],
      viewState.zoom
    )
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [isDragging, dragStart, viewState, onViewChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    onViewChange(viewState.center, viewState.zoom * zoomFactor)
  }, [viewState, onViewChange])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Hit test features
    for (const source of sources) {
      const fc = source.data as FeatureCollection
      for (const feature of fc.features) {
        if (hitTestFeature(feature, x, y, viewState, canvas.width, canvas.height)) {
          onFeatureClick(String(feature.id))
          return
        }
      }
    }

    onFeatureClick('')
  }, [sources, viewState, onFeatureClick])

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full h-full cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
        GIS View (2D)
      </div>
    </div>
  )
}

/**
 * IFC 3D Panel
 */
const Ifc3DPanel: React.FC<{
  sources: IfcSource[]
  selectedElementId: number | null
  highlightedIds: Set<number>
  viewState: { rotation: { x: number; y: number }; zoom: number }
  onElementClick: (elementId: number) => void
  onViewChange: (rotation: { x: number; y: number }, zoom: number) => void
}> = ({ sources, selectedElementId, highlightedIds, viewState, onElementClick: _onElementClick, onViewChange }) => {
  void _onElementClick // suppress unused warning - will be used for element selection
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Draw 3D representation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#1e3a5f')
    gradient.addColorStop(1, '#0d1b2a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // Grid floor
    drawGrid3D(ctx, width, height, viewState.rotation, viewState.zoom)

    // Draw IFC elements as 3D boxes
    for (const source of sources) {
      const model = source.model as IfcModel
      if (!model.entities) continue

      const elements = Object.values(model.entities).filter(
        e => e.type && ['IfcBuilding', 'IfcBuildingStorey', 'IfcWall', 'IfcSlab', 'IfcColumn', 'IfcBeam'].includes(e.type)
      )

      for (const element of elements) {
        const isSelected = element.GlobalId === selectedElementId
        const isHighlighted = highlightedIds.has(element.GlobalId || '')

        draw3DElement(ctx, element, width, height, viewState, {
          selected: isSelected,
          highlighted: isHighlighted,
        })
      }
    }

    // Axes
    drawAxes3D(ctx, width, height, viewState.rotation, viewState.zoom)
  }, [sources, selectedElementId, highlightedIds, viewState])

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    onViewChange(
      {
        x: viewState.rotation.x + dy * 0.5,
        y: viewState.rotation.y + dx * 0.5,
      },
      viewState.zoom
    )
    setDragStart({ x: e.clientX, y: e.clientY })
  }, [isDragging, dragStart, viewState, onViewChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    onViewChange(viewState.rotation, viewState.zoom * zoomFactor)
  }, [viewState, onViewChange])

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        className="w-full h-full cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
        IFC View (3D)
      </div>
    </div>
  )
}

/**
 * Link List Panel
 */
const LinkListPanel: React.FC<{
  links: GisIfcLink[]
  selectedLink: GisIfcLink | null
  onLinkSelect: (link: GisIfcLink) => void
}> = ({ links, selectedLink, onLinkSelect }) => {
  return (
    <div className="h-full overflow-auto bg-gray-900 p-2">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">
        Links ({links.length})
      </h3>
      <div className="space-y-1">
        {links.map(link => (
          <div
            key={link.id}
            className={`p-2 rounded cursor-pointer text-xs transition-colors ${
              selectedLink?.id === link.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => onLinkSelect(link)}
          >
            <div className="flex items-center gap-2">
              <span className="text-green-400">GIS:</span>
              <span className="truncate">{link.gisFeatureId}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-blue-400">IFC:</span>
              <span className="truncate">{link.ifcEntityId}</span>
            </div>
            <div className="flex justify-between mt-1 text-gray-500">
              <span>{link.linkType}</span>
              <span>{(link.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
        {links.length === 0 && (
          <div className="text-gray-500 text-xs text-center py-4">
            No links created yet
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Properties Panel
 */
const PropertiesPanel: React.FC<{
  gisFeature: GeoJsonFeature | null
  ifcElement: IfcEntity | null
  link: GisIfcLink | null
}> = ({ gisFeature, ifcElement, link }) => {
  return (
    <div className="h-full overflow-auto bg-gray-900 p-2">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">Properties</h3>

      {gisFeature && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-green-400 mb-1">GIS Feature</h4>
          <div className="bg-gray-800 rounded p-2 text-xs">
            <div className="text-gray-400">ID: {gisFeature.id}</div>
            <div className="text-gray-400">Type: {gisFeature.geometry?.type || 'N/A'}</div>
            {gisFeature.properties && Object.entries(gisFeature.properties).slice(0, 5).map(([key, value]) => (
              <div key={key} className="text-gray-300 truncate">
                {key}: {String(value)}
              </div>
            ))}
          </div>
        </div>
      )}

      {ifcElement && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-blue-400 mb-1">IFC Element</h4>
          <div className="bg-gray-800 rounded p-2 text-xs">
            <div className="text-gray-400">GlobalId: {String((ifcElement as unknown as Record<string, unknown>).GlobalId || ifcElement.id)}</div>
            <div className="text-gray-400">Type: {String(ifcElement.type)}</div>
            <div className="text-gray-300">Name: {String((ifcElement as unknown as Record<string, unknown>).Name || 'N/A')}</div>
          </div>
        </div>
      )}

      {link && (
        <div>
          <h4 className="text-xs font-semibold text-purple-400 mb-1">Link Info</h4>
          <div className="bg-gray-800 rounded p-2 text-xs">
            <div className="text-gray-300">Type: {link.linkType}</div>
            <div className="text-gray-300">Method: {link.method}</div>
            <div className="text-gray-300">Confidence: {(link.confidence * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}

      {!gisFeature && !ifcElement && !link && (
        <div className="text-gray-500 text-xs text-center py-4">
          Select a feature or element to view properties
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractCoordinates(geometry: GeoJsonGeometry | null): [number, number][] {
  const coords: [number, number][] = []
  if (!geometry) return coords

  function extract(c: unknown): void {
    if (Array.isArray(c)) {
      if (typeof c[0] === 'number' && typeof c[1] === 'number') {
        coords.push([c[0] as number, c[1] as number])
      } else {
        for (const item of c) {
          extract(item)
        }
      }
    }
  }

  if ('coordinates' in geometry) {
    extract((geometry as { coordinates: unknown }).coordinates)
  }

  return coords
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: GeoJsonFeature,
  transform: (lon: number, lat: number) => [number, number],
  options: { selected: boolean; highlighted: boolean; layerType: string }
): void {
  if (!feature.geometry) return
  const { selected, highlighted, layerType } = options

  // Style based on layer type and state
  let fillColor = 'rgba(100, 150, 200, 0.3)'
  let strokeColor = 'rgba(100, 150, 200, 0.8)'

  if (layerType === 'terrain') {
    fillColor = 'rgba(100, 180, 100, 0.3)'
    strokeColor = 'rgba(100, 180, 100, 0.8)'
  } else if (layerType === 'building') {
    fillColor = 'rgba(200, 150, 100, 0.3)'
    strokeColor = 'rgba(200, 150, 100, 0.8)'
  } else if (layerType === 'road') {
    fillColor = 'rgba(150, 150, 150, 0.3)'
    strokeColor = 'rgba(150, 150, 150, 0.8)'
  }

  if (selected) {
    fillColor = 'rgba(255, 200, 0, 0.5)'
    strokeColor = 'rgba(255, 200, 0, 1)'
  } else if (highlighted) {
    fillColor = 'rgba(0, 200, 255, 0.4)'
    strokeColor = 'rgba(0, 200, 255, 0.9)'
  }

  ctx.fillStyle = fillColor
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = selected ? 3 : highlighted ? 2 : 1

  const geometry = feature.geometry

  if (geometry.type === 'Point') {
    const [x, y] = transform(geometry.coordinates[0], geometry.coordinates[1])
    ctx.beginPath()
    ctx.arc(x, y, selected ? 8 : 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  } else if (geometry.type === 'LineString') {
    ctx.beginPath()
    const coords = geometry.coordinates
    for (let i = 0; i < coords.length; i++) {
      const coord = coords[i]
      if (!coord) continue
      const [x, y] = transform(coord[0], coord[1])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  } else if (geometry.type === 'Polygon') {
    ctx.beginPath()
    const rings = geometry.coordinates
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const coord = ring[i]
        if (!coord) continue
        const [x, y] = transform(coord[0], coord[1])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
    ctx.fill()
    ctx.stroke()
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      ctx.beginPath()
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const coord = ring[i]
          if (!coord) continue
          const [x, y] = transform(coord[0], coord[1])
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
      }
      ctx.fill()
      ctx.stroke()
    }
  }
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number
): void {
  const barWidth = 100
  const barHeight = 8
  const x = width - barWidth - 20
  const y = height - 30

  // Scale calculation (approximate)
  const metersPerPixel = 111000 / scale // rough degrees to meters
  const scaleDistance = Math.round(barWidth * metersPerPixel)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.fillRect(x, y, barWidth, barHeight)

  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, barWidth, barHeight)

  ctx.fillStyle = '#333'
  ctx.fillRect(x, y, barWidth / 2, barHeight)

  ctx.fillStyle = '#fff'
  ctx.font = '10px sans-serif'
  ctx.fillText(`${scaleDistance}m`, x + barWidth / 2 - 15, y - 4)
}

function hitTestFeature(
  feature: GeoJsonFeature,
  mouseX: number,
  mouseY: number,
  viewState: { center: [number, number]; zoom: number },
  canvasWidth: number,
  canvasHeight: number
): boolean {
  const transform = (lon: number, lat: number): [number, number] => {
    const x = (lon - viewState.center[0]) * viewState.zoom + canvasWidth / 2
    const y = canvasHeight / 2 - (lat - viewState.center[1]) * viewState.zoom
    return [x, y]
  }

  const coords = extractCoordinates(feature.geometry)

  for (const [lon, lat] of coords) {
    const [x, y] = transform(lon, lat)
    const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2)
    if (dist < 10) return true
  }

  return false
}

function drawGrid3D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rotation: { x: number; y: number },
  zoom: number
): void {
  const centerX = width / 2
  const centerY = height * 0.7
  const gridSize = 20
  const gridCount = 10

  ctx.strokeStyle = 'rgba(100, 100, 150, 0.3)'
  ctx.lineWidth = 1

  const cosY = Math.cos((rotation.y * Math.PI) / 180)
  const sinY = Math.sin((rotation.y * Math.PI) / 180)
  const cosX = Math.cos((rotation.x * Math.PI) / 180)

  for (let i = -gridCount; i <= gridCount; i++) {
    // Lines along X
    ctx.beginPath()
    const x1 = (-gridCount * gridSize * cosY + i * gridSize * sinY) * zoom / 100 + centerX
    const y1 = (-gridCount * gridSize * sinY * cosX - i * gridSize * cosY * cosX) * zoom / 100 + centerY
    const x2 = (gridCount * gridSize * cosY + i * gridSize * sinY) * zoom / 100 + centerX
    const y2 = (gridCount * gridSize * sinY * cosX - i * gridSize * cosY * cosX) * zoom / 100 + centerY
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    // Lines along Y
    ctx.beginPath()
    const x3 = (i * gridSize * cosY - gridCount * gridSize * sinY) * zoom / 100 + centerX
    const y3 = (i * gridSize * sinY * cosX + gridCount * gridSize * cosY * cosX) * zoom / 100 + centerY
    const x4 = (i * gridSize * cosY + gridCount * gridSize * sinY) * zoom / 100 + centerX
    const y4 = (i * gridSize * sinY * cosX - gridCount * gridSize * cosY * cosX) * zoom / 100 + centerY
    ctx.moveTo(x3, y3)
    ctx.lineTo(x4, y4)
    ctx.stroke()
  }
}

function drawAxes3D(
  ctx: CanvasRenderingContext2D,
  _width: number,
  height: number,
  rotation: { x: number; y: number },
  _zoom: number
): void {
  const originX = 60
  const originY = height - 60
  const axisLength = 40

  const cosY = Math.cos((rotation.y * Math.PI) / 180)
  const sinY = Math.sin((rotation.y * Math.PI) / 180)
  const cosX = Math.cos((rotation.x * Math.PI) / 180)
  const sinX = Math.sin((rotation.x * Math.PI) / 180)

  // X axis (red)
  ctx.strokeStyle = '#ff4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(originX, originY)
  ctx.lineTo(originX + axisLength * cosY, originY - axisLength * sinY * cosX)
  ctx.stroke()
  ctx.fillStyle = '#ff4444'
  ctx.fillText('X', originX + axisLength * cosY + 5, originY - axisLength * sinY * cosX)

  // Y axis (green)
  ctx.strokeStyle = '#44ff44'
  ctx.beginPath()
  ctx.moveTo(originX, originY)
  ctx.lineTo(originX - axisLength * sinY, originY - axisLength * cosY * cosX)
  ctx.stroke()
  ctx.fillStyle = '#44ff44'
  ctx.fillText('Y', originX - axisLength * sinY + 5, originY - axisLength * cosY * cosX)

  // Z axis (blue)
  ctx.strokeStyle = '#4444ff'
  ctx.beginPath()
  ctx.moveTo(originX, originY)
  ctx.lineTo(originX, originY - axisLength * sinX - axisLength)
  ctx.stroke()
  ctx.fillStyle = '#4444ff'
  ctx.fillText('Z', originX + 5, originY - axisLength * sinX - axisLength)
}

function draw3DElement(
  ctx: CanvasRenderingContext2D,
  element: Record<string, unknown>,
  width: number,
  height: number,
  viewState: { rotation: { x: number; y: number }; zoom: number },
  options: { selected: boolean; highlighted: boolean }
): void {
  const centerX = width / 2
  const centerY = height * 0.6
  const { rotation, zoom } = viewState
  const { selected, highlighted } = options

  // Simple box representation based on element type
  let boxSize = { w: 20, h: 30, d: 20 }
  let color = 'rgba(150, 150, 200, 0.6)'

  const type = String(element.type || '')
  if (type.includes('Wall')) {
    boxSize = { w: 40, h: 30, d: 5 }
    color = 'rgba(180, 160, 140, 0.6)'
  } else if (type.includes('Slab')) {
    boxSize = { w: 50, h: 3, d: 50 }
    color = 'rgba(140, 140, 140, 0.6)'
  } else if (type.includes('Column')) {
    boxSize = { w: 5, h: 40, d: 5 }
    color = 'rgba(160, 160, 180, 0.6)'
  } else if (type.includes('Building')) {
    boxSize = { w: 60, h: 50, d: 40 }
    color = 'rgba(100, 150, 200, 0.4)'
  }

  if (selected) {
    color = 'rgba(255, 200, 0, 0.7)'
  } else if (highlighted) {
    color = 'rgba(0, 200, 255, 0.6)'
  }

  // Simple isometric projection
  const cosY = Math.cos((rotation.y * Math.PI) / 180)
  const sinY = Math.sin((rotation.y * Math.PI) / 180)
  const cosX = Math.cos((rotation.x * Math.PI) / 180)

  const project = (x: number, y: number, z: number): [number, number] => {
    const px = (x * cosY - z * sinY) * zoom / 100 + centerX
    const py = centerY - (y + (x * sinY + z * cosY) * cosX * 0.5) * zoom / 100
    return [px, py]
  }

  // Random offset based on element ID to spread elements
  const hash = String(element.GlobalId || '').split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  const ox = ((hash % 100) - 50) * 2
  const oz = ((hash % 73) - 36) * 2

  const { w, h, d } = boxSize

  // Front face
  ctx.fillStyle = color
  ctx.strokeStyle = selected ? '#ffcc00' : highlighted ? '#00ccff' : '#666'
  ctx.lineWidth = selected ? 2 : 1

  ctx.beginPath()
  const [x1, y1] = project(ox - w / 2, 0, oz - d / 2)
  const [x2, y2] = project(ox + w / 2, 0, oz - d / 2)
  const [x3, y3] = project(ox + w / 2, h, oz - d / 2)
  const [x4, y4] = project(ox - w / 2, h, oz - d / 2)
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x4, y4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Top face
  ctx.beginPath()
  const [x5, y5] = project(ox - w / 2, h, oz + d / 2)
  const [x6, y6] = project(ox + w / 2, h, oz + d / 2)
  ctx.moveTo(x4, y4)
  ctx.lineTo(x3, y3)
  ctx.lineTo(x6, y6)
  ctx.lineTo(x5, y5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Side face
  ctx.beginPath()
  const [x7, y7] = project(ox + w / 2, 0, oz + d / 2)
  ctx.moveTo(x2, y2)
  ctx.lineTo(x7, y7)
  ctx.lineTo(x6, y6)
  ctx.lineTo(x3, y3)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

// ============================================================================
// Main Component
// ============================================================================

export const UnifiedViewer: React.FC<UnifiedViewerProps> = ({
  project,
  onFeatureSelect,
  onElementSelect,
  onLinkSelect,
  initialState,
  className = '',
}) => {
  const [viewerState, setViewerState] = useState<ViewerState>({
    gisCenter: initialState?.gisCenter || [127.0, 37.5],
    gisZoom: initialState?.gisZoom || 10000,
    ifcRotation: initialState?.ifcRotation || { x: 30, y: 45 },
    ifcZoom: initialState?.ifcZoom || 100,
    syncEnabled: initialState?.syncEnabled ?? true,
  })

  const [selection, setSelection] = useState<SelectionState>({
    gisFeatureId: null,
    ifcEntityId: null,
    linkedPair: null,
  })

  const [layout, setLayout] = useState<'split' | 'gis' | 'ifc'>('split')

  // Get sources from project
  const gisSources = project.gisSources || []
  const ifcSources = project.ifcSources || []
  const links = project.links || []

  // Find linked IDs - convert to proper types for comparison
  const linkedGisIds = useMemo(() => new Set(links.map(l => String(l.gisFeatureId))), [links])
  const linkedIfcIds = useMemo(() => new Set(links.map(l => l.ifcEntityId)), [links])

  // Handle GIS feature selection
  const handleGisFeatureClick = useCallback((featureId: string) => {
    if (!featureId) {
      setSelection(prev => ({ ...prev, gisFeatureId: null, linkedPair: null }))
      onFeatureSelect?.(null)
      return
    }

    setSelection(prev => ({ ...prev, gisFeatureId: featureId }))

    // Find linked IFC element
    const link = links.find(l => String(l.gisFeatureId) === featureId)
    if (link && viewerState.syncEnabled) {
      setSelection({
        gisFeatureId: featureId,
        ifcEntityId: link.ifcEntityId,
        linkedPair: link,
      })
    }

    // Find feature for callback
    for (const source of gisSources) {
      const fc = source.data as FeatureCollection | undefined
      if (!fc?.features) continue
      const feature = fc.features.find((f: GeoJsonFeature) => String(f.id) === featureId)
      if (feature) {
        onFeatureSelect?.(feature)
        break
      }
    }
  }, [links, gisSources, viewerState.syncEnabled, onFeatureSelect])

  // Handle IFC element selection
  const handleIfcElementClick = useCallback((entityId: number) => {
    if (!entityId) {
      setSelection(prev => ({ ...prev, ifcEntityId: null, linkedPair: null }))
      onElementSelect?.(null)
      return
    }

    setSelection(prev => ({ ...prev, ifcEntityId: entityId }))
    onElementSelect?.(entityId)

    // Find linked GIS feature
    const link = links.find(l => l.ifcEntityId === entityId)
    if (link && viewerState.syncEnabled) {
      setSelection({
        gisFeatureId: String(link.gisFeatureId),
        ifcEntityId: entityId,
        linkedPair: link,
      })
    }
  }, [links, viewerState.syncEnabled, onElementSelect])

  // Handle link selection
  const handleLinkSelect = useCallback((link: GisIfcLink) => {
    setSelection({
      gisFeatureId: String(link.gisFeatureId),
      ifcEntityId: link.ifcEntityId,
      linkedPair: link,
    })
    onLinkSelect?.(link)
  }, [onLinkSelect])

  // Get selected feature and element for properties panel
  const selectedFeature = useMemo(() => {
    if (!selection.gisFeatureId) return null
    for (const source of gisSources) {
      const fc = source.data as FeatureCollection | undefined
      if (!fc?.features) continue
      const feature = fc.features.find((f: GeoJsonFeature) => String(f.id) === selection.gisFeatureId)
      if (feature) return feature
    }
    return null
  }, [selection.gisFeatureId, gisSources])

  const selectedElement = useMemo((): IfcEntity | null => {
    if (!selection.ifcEntityId) return null
    for (const source of ifcSources) {
      const model = source.model as IfcModel | undefined
      if (!model?.entities) continue
      const entity = model.entities.get(selection.ifcEntityId)
      if (entity) return entity
    }
    return null
  }, [selection.ifcEntityId, ifcSources])

  return (
    <div className={`flex flex-col h-full bg-gray-950 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-gray-900 border-b border-gray-800">
        <div className="flex gap-1">
          <button
            className={`px-3 py-1 text-xs rounded ${layout === 'split' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setLayout('split')}
          >
            Split View
          </button>
          <button
            className={`px-3 py-1 text-xs rounded ${layout === 'gis' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setLayout('gis')}
          >
            GIS Only
          </button>
          <button
            className={`px-3 py-1 text-xs rounded ${layout === 'ifc' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            onClick={() => setLayout('ifc')}
          >
            IFC Only
          </button>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={viewerState.syncEnabled}
            onChange={e => setViewerState(prev => ({ ...prev, syncEnabled: e.target.checked }))}
            className="rounded"
          />
          Sync Selection
        </label>

        <div className="flex-1" />

        <div className="text-xs text-gray-500">
          GIS: {gisSources.length} sources | IFC: {ifcSources.length} models | Links: {links.length}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Viewer panels */}
        <div className="flex-1 flex">
          {(layout === 'split' || layout === 'gis') && (
            <div className={`${layout === 'split' ? 'w-1/2' : 'w-full'} border-r border-gray-800`}>
              <GisMapPanel
                sources={gisSources}
                selectedFeatureId={selection.gisFeatureId}
                highlightedIds={linkedGisIds}
                viewState={{ center: viewerState.gisCenter, zoom: viewerState.gisZoom }}
                onFeatureClick={handleGisFeatureClick}
                onViewChange={(center, zoom) => setViewerState(prev => ({ ...prev, gisCenter: center, gisZoom: zoom }))}
              />
            </div>
          )}

          {(layout === 'split' || layout === 'ifc') && (
            <div className={`${layout === 'split' ? 'w-1/2' : 'w-full'}`}>
              <Ifc3DPanel
                sources={ifcSources}
                selectedElementId={selection.ifcEntityId}
                highlightedIds={linkedIfcIds}
                viewState={{ rotation: viewerState.ifcRotation, zoom: viewerState.ifcZoom }}
                onElementClick={handleIfcElementClick}
                onViewChange={(rotation, zoom) => setViewerState(prev => ({ ...prev, ifcRotation: rotation, ifcZoom: zoom }))}
              />
            </div>
          )}
        </div>

        {/* Side panels */}
        <div className="w-64 flex flex-col border-l border-gray-800">
          <div className="flex-1 overflow-hidden">
            <LinkListPanel
              links={links}
              selectedLink={selection.linkedPair}
              onLinkSelect={handleLinkSelect}
            />
          </div>
          <div className="h-px bg-gray-800" />
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel
              gisFeature={selectedFeature}
              ifcElement={selectedElement}
              link={selection.linkedPair}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default UnifiedViewer
