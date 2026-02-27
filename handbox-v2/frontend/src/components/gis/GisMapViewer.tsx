/**
 * GisMapViewer — Interactive map viewer for GIS data.
 *
 * Features:
 * - Display GeoJSON features
 * - Layer management
 * - Pan, zoom, rotate
 * - Feature selection and info popup
 * - Coordinate display
 * - Export view as image
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  GeoJsonFeatureCollection,
  GeoJsonFeature,
  GeoJsonGeometry,
  GeoJsonBBox,
  GeoJsonPosition,
  LayerStyle,
  MapViewState,
} from '@/types/gis'
import { gisService } from '@/services/GisService'
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Layers,
  Eye,
  EyeOff,
  X,
} from 'lucide-react'

interface GisMapViewerProps {
  data?: GeoJsonFeatureCollection | GeoJsonFeatureCollection[]
  layerNames?: string[]
  width?: number | string
  height?: number | string
  initialBounds?: GeoJsonBBox
  onFeatureClick?: (feature: GeoJsonFeature, layerIndex: number) => void
  onViewChange?: (view: MapViewState) => void
  className?: string
}

interface LayerState {
  data: GeoJsonFeatureCollection
  name: string
  visible: boolean
  style: LayerStyle
  opacity: number
}

interface MapState {
  center: [number, number]
  zoom: number
  bounds: GeoJsonBBox
}

const DEFAULT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

export function GisMapViewer({
  data,
  layerNames,
  width = '100%',
  height = 400,
  initialBounds,
  onFeatureClick,
  onViewChange: _onViewChange,
  className = '',
}: GisMapViewerProps) {
  void _onViewChange // reserved for future view state synchronization
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [layers, setLayers] = useState<LayerState[]>([])
  const [mapState, setMapState] = useState<MapState>({
    center: [127.0, 37.5], // Default to Korea
    zoom: 1,
    bounds: [-180, -90, 180, 90],
  })
  const [selectedFeature, setSelectedFeature] = useState<GeoJsonFeature | null>(null)
  const [hoveredFeature] = useState<GeoJsonFeature | null>(null)
  const [showLayers, setShowLayers] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number; lon: number; lat: number } | null>(null)

  // Initialize layers from data
  useEffect(() => {
    if (!data) {
      setLayers([])
      return
    }

    const dataArray = Array.isArray(data) ? data : [data]
    const newLayers: LayerState[] = dataArray.map((d, i) => ({
      data: d,
      name: layerNames?.[i] || `Layer ${i + 1}`,
      visible: true,
      style: {
        id: `layer-${i}`,
        name: layerNames?.[i] || `Layer ${i + 1}`,
        fill: {
          color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]!,
          opacity: 0.6,
        },
        stroke: {
          color: DEFAULT_COLORS[i % DEFAULT_COLORS.length]!,
          width: 2,
          opacity: 1,
        },
      },
      opacity: 1,
    }))

    setLayers(newLayers)

    // Calculate bounds from all layers
    const allBounds = dataArray.map(d => gisService.calculateBBox(d))
    if (allBounds.length > 0) {
      const combinedBounds: GeoJsonBBox = [
        Math.min(...allBounds.map(b => b[0])),
        Math.min(...allBounds.map(b => b[1])),
        Math.max(...allBounds.map(b => b[2])),
        Math.max(...allBounds.map(b => b[3])),
      ]

      setMapState(prev => ({
        ...prev,
        bounds: initialBounds || combinedBounds,
        center: [
          (combinedBounds[0] + combinedBounds[2]) / 2,
          (combinedBounds[1] + combinedBounds[3]) / 2,
        ],
      }))
    }
  }, [data, layerNames, initialBounds])

  // Render map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get actual size
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * window.devicePixelRatio
    canvas.height = rect.height * window.devicePixelRatio
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

    // Clear
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Draw grid
    drawGrid(ctx, rect.width, rect.height)

    // Draw layers
    for (const layer of layers) {
      if (!layer.visible) continue
      drawLayer(ctx, layer, rect.width, rect.height)
    }

    // Draw selected feature highlight
    if (selectedFeature?.geometry) {
      drawFeature(ctx, selectedFeature.geometry, rect.width, rect.height, {
        fill: { color: '#fbbf24', opacity: 0.4 },
        stroke: { color: '#fbbf24', width: 3, opacity: 1 },
      })
    }

    // Draw hovered feature highlight
    if (hoveredFeature?.geometry && hoveredFeature !== selectedFeature) {
      drawFeature(ctx, hoveredFeature.geometry, rect.width, rect.height, {
        stroke: { color: '#ffffff', width: 2, opacity: 0.8 },
      })
    }
  }, [layers, mapState, selectedFeature, hoveredFeature])

  // Coordinate transformation helpers
  const lonLatToPixel = useCallback(
    (lon: number, lat: number, width: number, height: number): [number, number] => {
      const [minLon, minLat, maxLon, maxLat] = mapState.bounds
      const x = ((lon - minLon) / (maxLon - minLon)) * width
      const y = ((maxLat - lat) / (maxLat - minLat)) * height
      return [x, y]
    },
    [mapState.bounds]
  )

  const pixelToLonLat = useCallback(
    (x: number, y: number, width: number, height: number): [number, number] => {
      const [minLon, minLat, maxLon, maxLat] = mapState.bounds
      const lon = (x / width) * (maxLon - minLon) + minLon
      const lat = maxLat - (y / height) * (maxLat - minLat)
      return [lon, lat]
    },
    [mapState.bounds]
  )

  // Draw grid lines
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 0.5

    const [minLon, minLat, maxLon, maxLat] = mapState.bounds
    const lonRange = maxLon - minLon
    const latRange = maxLat - minLat

    // Calculate grid interval
    const gridInterval = Math.pow(10, Math.floor(Math.log10(Math.max(lonRange, latRange))) - 1)

    // Vertical lines (longitude)
    for (let lon = Math.ceil(minLon / gridInterval) * gridInterval; lon <= maxLon; lon += gridInterval) {
      const [x] = lonLatToPixel(lon, minLat, width, height)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      // Label
      ctx.fillStyle = '#6b7280'
      ctx.font = '10px sans-serif'
      ctx.fillText(lon.toFixed(2), x + 2, height - 4)
    }

    // Horizontal lines (latitude)
    for (let lat = Math.ceil(minLat / gridInterval) * gridInterval; lat <= maxLat; lat += gridInterval) {
      const [, y] = lonLatToPixel(minLon, lat, width, height)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()

      // Label
      ctx.fillStyle = '#6b7280'
      ctx.font = '10px sans-serif'
      ctx.fillText(lat.toFixed(2), 4, y - 2)
    }
  }

  // Draw a single layer
  const drawLayer = (
    ctx: CanvasRenderingContext2D,
    layer: LayerState,
    width: number,
    height: number
  ) => {
    for (const feature of layer.data.features) {
      if (feature.geometry) {
        drawFeature(ctx, feature.geometry, width, height, layer.style, layer.opacity)
      }
    }
  }

  // Draw a single feature
  const drawFeature = (
    ctx: CanvasRenderingContext2D,
    geometry: GeoJsonGeometry,
    width: number,
    height: number,
    style: Partial<LayerStyle>,
    layerOpacity: number = 1
  ) => {
    switch (geometry.type) {
      case 'Point':
        drawPoint(ctx, geometry.coordinates, width, height, style, layerOpacity)
        break
      case 'MultiPoint':
        for (const coord of geometry.coordinates) {
          drawPoint(ctx, coord, width, height, style, layerOpacity)
        }
        break
      case 'LineString':
        drawLineString(ctx, geometry.coordinates, width, height, style, layerOpacity)
        break
      case 'MultiLineString':
        for (const line of geometry.coordinates) {
          drawLineString(ctx, line, width, height, style, layerOpacity)
        }
        break
      case 'Polygon':
        drawPolygon(ctx, geometry.coordinates, width, height, style, layerOpacity)
        break
      case 'MultiPolygon':
        for (const poly of geometry.coordinates) {
          drawPolygon(ctx, poly, width, height, style, layerOpacity)
        }
        break
      case 'GeometryCollection':
        for (const geom of geometry.geometries) {
          drawFeature(ctx, geom, width, height, style, layerOpacity)
        }
        break
    }
  }

  const drawPoint = (
    ctx: CanvasRenderingContext2D,
    coord: GeoJsonPosition,
    width: number,
    height: number,
    style: Partial<LayerStyle>,
    opacity: number
  ) => {
    const [x, y] = lonLatToPixel(coord[0], coord[1], width, height)
    const radius = 5

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)

    if (style.fill) {
      ctx.fillStyle = hexToRgba(style.fill.color, style.fill.opacity * opacity)
      ctx.fill()
    }
    if (style.stroke) {
      ctx.strokeStyle = hexToRgba(style.stroke.color, style.stroke.opacity * opacity)
      ctx.lineWidth = style.stroke.width
      ctx.stroke()
    }
  }

  const drawLineString = (
    ctx: CanvasRenderingContext2D,
    coords: GeoJsonPosition[],
    width: number,
    height: number,
    style: Partial<LayerStyle>,
    opacity: number
  ) => {
    if (coords.length < 2) return
    const firstCoord = coords[0]
    if (!firstCoord) return

    ctx.beginPath()
    const [startX, startY] = lonLatToPixel(firstCoord[0], firstCoord[1], width, height)
    ctx.moveTo(startX, startY)

    for (let i = 1; i < coords.length; i++) {
      const coord = coords[i]
      if (!coord) continue
      const [x, y] = lonLatToPixel(coord[0], coord[1], width, height)
      ctx.lineTo(x, y)
    }

    if (style.stroke) {
      ctx.strokeStyle = hexToRgba(style.stroke.color, style.stroke.opacity * opacity)
      ctx.lineWidth = style.stroke.width
      ctx.stroke()
    }
  }

  const drawPolygon = (
    ctx: CanvasRenderingContext2D,
    rings: GeoJsonPosition[][],
    width: number,
    height: number,
    style: Partial<LayerStyle>,
    opacity: number
  ) => {
    const exterior = rings[0]
    if (!exterior || exterior.length < 3) return
    const firstCoord = exterior[0]
    if (!firstCoord) return

    ctx.beginPath()

    // Exterior ring
    const [startX, startY] = lonLatToPixel(firstCoord[0], firstCoord[1], width, height)
    ctx.moveTo(startX, startY)

    for (let i = 1; i < exterior.length; i++) {
      const coord = exterior[i]
      if (!coord) continue
      const [x, y] = lonLatToPixel(coord[0], coord[1], width, height)
      ctx.lineTo(x, y)
    }
    ctx.closePath()

    // Holes (interior rings)
    for (let r = 1; r < rings.length; r++) {
      const hole = rings[r]
      if (!hole || hole.length < 3) continue
      const holeFirst = hole[0]
      if (!holeFirst) continue

      const [hx, hy] = lonLatToPixel(holeFirst[0], holeFirst[1], width, height)
      ctx.moveTo(hx, hy)

      for (let i = 1; i < hole.length; i++) {
        const coord = hole[i]
        if (!coord) continue
        const [x, y] = lonLatToPixel(coord[0], coord[1], width, height)
        ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    if (style.fill) {
      ctx.fillStyle = hexToRgba(style.fill.color, style.fill.opacity * opacity)
      ctx.fill('evenodd')
    }
    if (style.stroke) {
      ctx.strokeStyle = hexToRgba(style.stroke.color, style.stroke.opacity * opacity)
      ctx.lineWidth = style.stroke.width
      ctx.stroke()
    }
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const [lon, lat] = pixelToLonLat(x, y, rect.width, rect.height)

    setMousePos({ x, y, lon, lat })

    if (isDragging && dragStart) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y

      const [minLon, minLat, maxLon, maxLat] = mapState.bounds
      const lonRange = maxLon - minLon
      const latRange = maxLat - minLat

      const dLon = (-dx / rect.width) * lonRange
      const dLat = (dy / rect.height) * latRange

      setMapState(prev => ({
        ...prev,
        bounds: [
          prev.bounds[0] + dLon,
          prev.bounds[1] + dLat,
          prev.bounds[2] + dLon,
          prev.bounds[3] + dLat,
        ],
      }))

      setDragStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.2 : 0.8

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const [lon, lat] = pixelToLonLat(x, y, rect.width, rect.height)

    const [minLon, minLat, maxLon, maxLat] = mapState.bounds
    const newWidth = (maxLon - minLon) * factor
    const newHeight = (maxLat - minLat) * factor

    // Zoom centered on mouse position
    const lonRatio = (lon - minLon) / (maxLon - minLon)
    const latRatio = (lat - minLat) / (maxLat - minLat)

    setMapState(prev => ({
      ...prev,
      bounds: [
        lon - newWidth * lonRatio,
        lat - newHeight * latRatio,
        lon + newWidth * (1 - lonRatio),
        lat + newHeight * (1 - latRatio),
      ],
    }))
  }

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find clicked feature (simple point-in-bbox check for now)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i]
      if (!layer || !layer.visible) continue

      for (const feature of layer.data.features) {
        if (feature.geometry && isPointInFeature(x, y, feature.geometry, rect.width, rect.height)) {
          setSelectedFeature(feature)
          onFeatureClick?.(feature, i)
          return
        }
      }
    }

    setSelectedFeature(null)
  }

  const isPointInFeature = (
    px: number,
    py: number,
    geometry: GeoJsonGeometry,
    width: number,
    height: number
  ): boolean => {
    // Simple bbox check
    const bbox = gisService.calculateBBox({ type: 'Feature', geometry, properties: null })
    const [minX, minY] = lonLatToPixel(bbox[0], bbox[3], width, height)
    const [maxX, maxY] = lonLatToPixel(bbox[2], bbox[1], width, height)

    return px >= minX && px <= maxX && py >= minY && py <= maxY
  }

  // Zoom controls
  const handleZoomIn = () => {
    const factor = 0.8
    setMapState(prev => {
      const [minLon, minLat, maxLon, maxLat] = prev.bounds
      const lonCenter = (minLon + maxLon) / 2
      const latCenter = (minLat + maxLat) / 2
      const lonRange = (maxLon - minLon) * factor
      const latRange = (maxLat - minLat) * factor

      return {
        ...prev,
        bounds: [
          lonCenter - lonRange / 2,
          latCenter - latRange / 2,
          lonCenter + lonRange / 2,
          latCenter + latRange / 2,
        ],
      }
    })
  }

  const handleZoomOut = () => {
    const factor = 1.25
    setMapState(prev => {
      const [minLon, minLat, maxLon, maxLat] = prev.bounds
      const lonCenter = (minLon + maxLon) / 2
      const latCenter = (minLat + maxLat) / 2
      const lonRange = (maxLon - minLon) * factor
      const latRange = (maxLat - minLat) * factor

      return {
        ...prev,
        bounds: [
          lonCenter - lonRange / 2,
          latCenter - latRange / 2,
          lonCenter + lonRange / 2,
          latCenter + latRange / 2,
        ],
      }
    })
  }

  const handleFitExtent = () => {
    const allBounds = layers
      .filter(l => l.visible)
      .map(l => gisService.calculateBBox(l.data))

    if (allBounds.length > 0) {
      const combinedBounds: GeoJsonBBox = [
        Math.min(...allBounds.map(b => b[0])),
        Math.min(...allBounds.map(b => b[1])),
        Math.max(...allBounds.map(b => b[2])),
        Math.max(...allBounds.map(b => b[3])),
      ]

      // Add padding
      const padding = 0.1
      const lonRange = combinedBounds[2] - combinedBounds[0]
      const latRange = combinedBounds[3] - combinedBounds[1]

      setMapState(prev => ({
        ...prev,
        bounds: [
          combinedBounds[0] - lonRange * padding,
          combinedBounds[1] - latRange * padding,
          combinedBounds[2] + lonRange * padding,
          combinedBounds[3] + latRange * padding,
        ],
      }))
    }
  }

  const toggleLayerVisibility = (index: number) => {
    setLayers(prev =>
      prev.map((l, i) => (i === index ? { ...l, visible: !l.visible } : l))
    )
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-neutral-900 rounded-lg overflow-hidden ${className}`}
      style={{ width, height }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      {/* Controls */}
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={handleFitExtent}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
          title="Fit Extent"
        >
          <Maximize size={16} />
        </button>
        <button
          onClick={() => setShowLayers(!showLayers)}
          className={`p-1.5 rounded text-neutral-300 ${showLayers ? 'bg-violet-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          title="Layers"
        >
          <Layers size={16} />
        </button>
      </div>

      {/* Coordinate display */}
      {mousePos && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-neutral-800/80 rounded text-xs text-neutral-300 font-mono">
          {mousePos.lon.toFixed(6)}, {mousePos.lat.toFixed(6)}
        </div>
      )}

      {/* Layer panel */}
      {showLayers && layers.length > 0 && (
        <div className="absolute top-2 left-2 w-48 bg-neutral-800 rounded-lg shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
            <span className="text-xs font-medium text-neutral-300">Layers</span>
            <button onClick={() => setShowLayers(false)} className="text-neutral-400 hover:text-neutral-200">
              <X size={12} />
            </button>
          </div>
          <div className="p-2 space-y-1 max-h-48 overflow-auto">
            {layers.map((layer, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-700 rounded cursor-pointer"
                onClick={() => toggleLayerVisibility(i)}
              >
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: layer.style.fill?.color || layer.style.stroke?.color }}
                />
                <span className="flex-1 text-xs text-neutral-300 truncate">{layer.name}</span>
                {layer.visible ? (
                  <Eye size={12} className="text-neutral-400" />
                ) : (
                  <EyeOff size={12} className="text-neutral-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected feature info */}
      {selectedFeature && (
        <div className="absolute bottom-2 right-2 w-64 max-h-48 overflow-auto bg-neutral-800 rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-300">Feature Info</span>
            <button
              onClick={() => setSelectedFeature(null)}
              className="text-neutral-400 hover:text-neutral-200"
            >
              <X size={12} />
            </button>
          </div>
          <div className="space-y-1">
            {selectedFeature.properties &&
              Object.entries(selectedFeature.properties).slice(0, 10).map(([key, value]) => (
                <div key={key} className="flex text-xs">
                  <span className="w-20 text-neutral-500 truncate">{key}:</span>
                  <span className="flex-1 text-neutral-300 truncate">
                    {String(value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {layers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
          <div className="text-center">
            <Layers size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No data to display</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper: hex color to rgba
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default GisMapViewer
