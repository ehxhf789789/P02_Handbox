/**
 * IfcViewer3D — 3D viewer for IFC models.
 *
 * Features:
 * - Display IFC geometry
 * - Camera controls (orbit, pan, zoom)
 * - Element highlighting
 * - Selection
 * - View modes (wireframe, solid, x-ray)
 *
 * Note: This is a canvas-based placeholder. For production,
 * integrate with web-ifc-viewer or IFC.js.
 */

import { useState, useRef, useEffect } from 'react'
import type { IfcModel, IfcEntity } from '@/types/ifc'
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Eye,
  Box,
  Grid3X3,
  Layers,
  Move,
  MousePointer,
  Sun,
  Moon,
} from 'lucide-react'

interface IfcViewer3DProps {
  model?: IfcModel
  selectedId?: number
  onSelect?: (entity: IfcEntity) => void
  highlightedIds?: number[]
  width?: number | string
  height?: number | string
  className?: string
}

type ViewMode = 'solid' | 'wireframe' | 'xray'
type Tool = 'orbit' | 'pan' | 'select'

interface CameraState {
  rotationX: number
  rotationY: number
  zoom: number
  panX: number
  panY: number
}

export function IfcViewer3D({
  model,
  selectedId,
  onSelect: _onSelect,
  highlightedIds = [],
  width = '100%',
  height = 400,
  className = '',
}: IfcViewer3DProps) {
  void _onSelect // reserved for future click-to-select functionality
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('solid')
  const [tool, setTool] = useState<Tool>('orbit')
  const [showGrid, setShowGrid] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [camera, setCamera] = useState<CameraState>({
    rotationX: -30,
    rotationY: 45,
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

  // Render the view
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
    ctx.fillStyle = darkMode ? '#1a1a2e' : '#f0f0f5'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const cx = rect.width / 2 + camera.panX
    const cy = rect.height / 2 + camera.panY

    // Draw grid
    if (showGrid) {
      drawGrid(ctx, cx, cy, rect.width, rect.height, camera)
    }

    // Draw elements
    if (model) {
      drawElements(ctx, model, cx, cy, camera, viewMode, selectedId, highlightedIds, darkMode)
    }

    // Draw axis indicator
    drawAxisIndicator(ctx, rect.width - 60, rect.height - 60, camera)
  }, [model, camera, viewMode, showGrid, selectedId, highlightedIds, darkMode])

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    if (tool === 'orbit') {
      setCamera(prev => ({
        ...prev,
        rotationX: prev.rotationX + dy * 0.5,
        rotationY: prev.rotationY + dx * 0.5,
      }))
    } else if (tool === 'pan') {
      setCamera(prev => ({
        ...prev,
        panX: prev.panX + dx,
        panY: prev.panY + dy,
      }))
    }

    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom * factor)),
    }))
  }

  const handleResetView = () => {
    setCamera({
      rotationX: -30,
      rotationY: 45,
      zoom: 1,
      panX: 0,
      panY: 0,
    })
  }

  const handleZoomIn = () => {
    setCamera(prev => ({ ...prev, zoom: Math.min(5, prev.zoom * 1.2) }))
  }

  const handleZoomOut = () => {
    setCamera(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom * 0.8) }))
  }

  return (
    <div className={`relative bg-neutral-900 rounded-lg overflow-hidden ${className}`} style={{ width, height }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: tool === 'orbit' ? 'grab' : tool === 'pan' ? 'move' : 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Toolbar */}
      <div className="absolute top-2 left-2 flex gap-1">
        {/* Tool selection */}
        <div className="flex bg-neutral-800 rounded overflow-hidden">
          <ToolButton
            icon={<RotateCcw size={14} />}
            active={tool === 'orbit'}
            onClick={() => setTool('orbit')}
            title="Orbit"
          />
          <ToolButton
            icon={<Move size={14} />}
            active={tool === 'pan'}
            onClick={() => setTool('pan')}
            title="Pan"
          />
          <ToolButton
            icon={<MousePointer size={14} />}
            active={tool === 'select'}
            onClick={() => setTool('select')}
            title="Select"
          />
        </div>

        {/* View mode */}
        <div className="flex bg-neutral-800 rounded overflow-hidden ml-2">
          <ToolButton
            icon={<Box size={14} />}
            active={viewMode === 'solid'}
            onClick={() => setViewMode('solid')}
            title="Solid"
          />
          <ToolButton
            icon={<Grid3X3 size={14} />}
            active={viewMode === 'wireframe'}
            onClick={() => setViewMode('wireframe')}
            title="Wireframe"
          />
          <ToolButton
            icon={<Eye size={14} />}
            active={viewMode === 'xray'}
            onClick={() => setViewMode('xray')}
            title="X-Ray"
          />
        </div>
      </div>

      {/* Right controls */}
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
          onClick={handleResetView}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
          title="Reset View"
        >
          <Maximize size={16} />
        </button>
        <div className="h-2" />
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`p-1.5 rounded ${showGrid ? 'bg-violet-600' : 'bg-neutral-800 hover:bg-neutral-700'} text-neutral-300`}
          title="Toggle Grid"
        >
          <Layers size={16} />
        </button>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300"
          title="Toggle Dark Mode"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* Info overlay */}
      <div className="absolute bottom-2 left-2 px-2 py-1 bg-neutral-800/80 rounded text-xs text-neutral-400">
        {model ? (
          <>
            {model.elements.length} elements · Zoom: {(camera.zoom * 100).toFixed(0)}%
          </>
        ) : (
          'No model loaded'
        )}
      </div>

      {/* No model placeholder */}
      {!model && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
          <div className="text-center">
            <Box size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">Load an IFC model to view</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolButton({
  icon,
  active,
  onClick,
  title,
}: {
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 ${active ? 'bg-violet-600' : 'hover:bg-neutral-700'}`}
      title={title}
    >
      {icon}
    </button>
  )
}

// ========== Drawing Functions ==========

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  _width: number,
  _height: number,
  camera: CameraState
) {
  const gridSize = 50 * camera.zoom
  const gridCount = 10

  ctx.strokeStyle = 'rgba(100, 100, 120, 0.2)'
  ctx.lineWidth = 1

  // Simple isometric grid - cosY and sinY used for 3D projection
  const _cosY = Math.cos((camera.rotationY * Math.PI) / 180)
  const _sinY = Math.sin((camera.rotationY * Math.PI) / 180)
  void _cosY; void _sinY // used in future 3D grid projection

  for (let i = -gridCount; i <= gridCount; i++) {
    // X lines
    const x1 = i * gridSize
    const y1 = -gridCount * gridSize
    const z1 = 0
    const x2 = i * gridSize
    const y2 = gridCount * gridSize
    const z2 = 0

    const [sx1, sy1] = project3D(x1, y1, z1, cx, cy, camera)
    const [sx2, sy2] = project3D(x2, y2, z2, cx, cy, camera)

    ctx.beginPath()
    ctx.moveTo(sx1, sy1)
    ctx.lineTo(sx2, sy2)
    ctx.stroke()

    // Y lines
    const [sx3, sy3] = project3D(y1, x1, z1, cx, cy, camera)
    const [sx4, sy4] = project3D(y2, x2, z2, cx, cy, camera)

    ctx.beginPath()
    ctx.moveTo(sx3, sy3)
    ctx.lineTo(sx4, sy4)
    ctx.stroke()
  }
}

function drawElements(
  ctx: CanvasRenderingContext2D,
  model: IfcModel,
  cx: number,
  cy: number,
  camera: CameraState,
  viewMode: ViewMode,
  selectedId?: number,
  highlightedIds: number[] = [],
  _darkMode: boolean = true
) {
  void _darkMode // reserved for dark/light mode color schemes
  // Group elements by type for color coding
  const typeColors: Record<string, string> = {
    IfcWall: '#64748b',
    IfcWallStandardCase: '#64748b',
    IfcSlab: '#78716c',
    IfcBeam: '#ca8a04',
    IfcColumn: '#059669',
    IfcDoor: '#7c3aed',
    IfcWindow: '#06b6d4',
    IfcStair: '#d946ef',
    IfcRoof: '#dc2626',
    IfcRailing: '#f97316',
    IfcCovering: '#84cc16',
  }

  // Sort elements by depth (back to front)
  const sortedElements = [...model.elements].sort((a, b) => {
    // Simple depth sort based on element index
    return a.id - b.id
  })

  for (const element of sortedElements) {
    const isSelected = element.id === selectedId
    const isHighlighted = highlightedIds.includes(element.id)

    // Get base color
    let color = typeColors[element.type] || '#6b7280'

    if (isSelected) {
      color = '#fbbf24' // Yellow for selected
    } else if (isHighlighted) {
      color = '#60a5fa' // Blue for highlighted
    }

    // Draw simple box representation
    // In real implementation, use actual geometry from IFC
    const size = 30 * camera.zoom
    const x = (element.id % 10 - 5) * size * 2
    const y = (Math.floor(element.id / 10) % 10 - 5) * size * 2
    const z = (Math.floor(element.id / 100) % 5) * size * 2

    drawBox(ctx, x, y, z, size, size, size * 2, cx, cy, camera, color, viewMode, isSelected)
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  cx: number,
  cy: number,
  camera: CameraState,
  color: string,
  viewMode: ViewMode,
  isSelected: boolean
) {
  // 8 corners of box
  const corners = [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
  ]

  // Project corners
  const projected = corners.map((corner) => {
    const [px, py, pz] = corner
    return project3D(px ?? 0, py ?? 0, pz ?? 0, cx, cy, camera)
  })

  // Face indices
  const faces = [
    [0, 1, 2, 3], // bottom
    [4, 5, 6, 7], // top
    [0, 1, 5, 4], // front
    [2, 3, 7, 6], // back
    [0, 3, 7, 4], // left
    [1, 2, 6, 5], // right
  ]

  const alpha = viewMode === 'xray' ? 0.3 : viewMode === 'wireframe' ? 0 : 0.8

  // Draw faces
  for (const face of faces) {
    ctx.beginPath()
    const firstPoint = projected[face[0]!]
    if (!firstPoint) continue
    ctx.moveTo(firstPoint[0], firstPoint[1])
    for (let i = 1; i < face.length; i++) {
      const point = projected[face[i]!]
      if (!point) continue
      ctx.lineTo(point[0], point[1])
    }
    ctx.closePath()

    if (alpha > 0) {
      ctx.fillStyle = hexToRgba(color, alpha)
      ctx.fill()
    }

    ctx.strokeStyle = isSelected ? '#fbbf24' : hexToRgba(color, 1)
    ctx.lineWidth = isSelected ? 2 : 1
    ctx.stroke()
  }
}

function drawAxisIndicator(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  camera: CameraState
) {
  const length = 30

  // X axis (red)
  const xEnd = project3D(length, 0, 0, cx, cy, { ...camera, zoom: 1, panX: 0, panY: 0 })
  const xOrigin = project3D(0, 0, 0, cx, cy, { ...camera, zoom: 1, panX: 0, panY: 0 })
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(xOrigin[0], xOrigin[1])
  ctx.lineTo(xEnd[0], xEnd[1])
  ctx.stroke()
  ctx.fillStyle = '#ef4444'
  ctx.font = '10px sans-serif'
  ctx.fillText('X', xEnd[0] + 4, xEnd[1])

  // Y axis (green)
  const yEnd = project3D(0, length, 0, cx, cy, { ...camera, zoom: 1, panX: 0, panY: 0 })
  ctx.strokeStyle = '#22c55e'
  ctx.beginPath()
  ctx.moveTo(xOrigin[0], xOrigin[1])
  ctx.lineTo(yEnd[0], yEnd[1])
  ctx.stroke()
  ctx.fillStyle = '#22c55e'
  ctx.fillText('Y', yEnd[0] + 4, yEnd[1])

  // Z axis (blue)
  const zEnd = project3D(0, 0, length, cx, cy, { ...camera, zoom: 1, panX: 0, panY: 0 })
  ctx.strokeStyle = '#3b82f6'
  ctx.beginPath()
  ctx.moveTo(xOrigin[0], xOrigin[1])
  ctx.lineTo(zEnd[0], zEnd[1])
  ctx.stroke()
  ctx.fillStyle = '#3b82f6'
  ctx.fillText('Z', zEnd[0] + 4, zEnd[1])
}

function project3D(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  camera: CameraState
): [number, number] {
  const zoom = camera.zoom
  const rotX = (camera.rotationX * Math.PI) / 180
  const rotY = (camera.rotationY * Math.PI) / 180

  // Rotate around Y axis
  const x1 = x * Math.cos(rotY) - y * Math.sin(rotY)
  const y1 = x * Math.sin(rotY) + y * Math.cos(rotY)
  const z1 = z

  // Rotate around X axis
  // y2 would be used for perspective projection
  const z2 = y1 * Math.sin(rotX) + z1 * Math.cos(rotX)

  // Simple orthographic projection
  const screenX = cx + x1 * zoom
  const screenY = cy - z2 * zoom // Invert Y for screen coordinates

  return [screenX, screenY]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default IfcViewer3D
