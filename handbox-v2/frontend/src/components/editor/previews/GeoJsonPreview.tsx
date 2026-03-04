import { memo, useEffect, useRef } from 'react'
import type { PreviewRendererProps } from '@/types/preview'

export const GeoJsonPreview = memo(function GeoJsonPreview({ data, mode }: PreviewRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const w = mode === 'inline' ? 260 : 500
  const h = mode === 'inline' ? 130 : 350

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, w, h)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geojson: any = typeof data === 'string' ? (() => { try { return JSON.parse(data) } catch { return null } })() : data
    if (!geojson) return

    const features = geojson.features ?? (geojson.type === 'Feature' ? [geojson] : [])
    if (features.length === 0) return

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const f of features) {
      visitCoords(f.geometry, (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      })
    }

    const pad = 15
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const scale = Math.min((w - pad * 2) / rangeX, (h - pad * 2) / rangeY)
    const tx = (x: number) => pad + (x - minX) * scale
    const ty = (y: number) => h - pad - (y - minY) * scale

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
    for (let fi = 0; fi < features.length; fi++) {
      const f = features[fi]
      const color = colors[fi % colors.length]!
      ctx.strokeStyle = color
      ctx.fillStyle = color + '30'
      ctx.lineWidth = 1.5
      drawGeometry(ctx, f.geometry, tx, ty)
    }
  }, [data, w, h])

  return <canvas ref={canvasRef} width={w} height={h} style={{ width: w, height: h }} className="rounded" />
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visitCoords(geom: any, fn: (x: number, y: number) => void) {
  if (!geom || !geom.coordinates) return
  const coords = geom.coordinates
  const t = geom.type as string
  if (t === 'Point') { fn(coords[0], coords[1]) }
  else if (t === 'MultiPoint' || t === 'LineString') { for (const c of coords) fn(c[0], c[1]) }
  else if (t === 'MultiLineString' || t === 'Polygon') { for (const ring of coords) for (const c of ring) fn(c[0], c[1]) }
  else if (t === 'MultiPolygon') { for (const poly of coords) for (const ring of poly) for (const c of ring) fn(c[0], c[1]) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawGeometry(ctx: CanvasRenderingContext2D, geom: any, tx: (x: number) => number, ty: (y: number) => number) {
  if (!geom || !geom.coordinates) return
  const coords = geom.coordinates
  const t = geom.type as string
  if (t === 'Point') {
    ctx.beginPath(); ctx.arc(tx(coords[0]), ty(coords[1]), 3, 0, Math.PI * 2); ctx.fill()
  } else if (t === 'LineString') {
    ctx.beginPath()
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i]
      if (i === 0) ctx.moveTo(tx(c[0]), ty(c[1]))
      else ctx.lineTo(tx(c[0]), ty(c[1]))
    }
    ctx.stroke()
  } else if (t === 'Polygon') {
    for (const ring of coords) {
      ctx.beginPath()
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i]
        if (i === 0) ctx.moveTo(tx(c[0]), ty(c[1]))
        else ctx.lineTo(tx(c[0]), ty(c[1]))
      }
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
  } else if (t === 'MultiPolygon') {
    for (const poly of coords) for (const ring of poly) {
      ctx.beginPath()
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i]
        if (i === 0) ctx.moveTo(tx(c[0]), ty(c[1]))
        else ctx.lineTo(tx(c[0]), ty(c[1]))
      }
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
  } else if (t === 'MultiLineString') {
    for (const line of coords) {
      ctx.beginPath()
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (i === 0) ctx.moveTo(tx(c[0]), ty(c[1]))
        else ctx.lineTo(tx(c[0]), ty(c[1]))
      }
      ctx.stroke()
    }
  } else if (t === 'MultiPoint') {
    for (const c of coords) { ctx.beginPath(); ctx.arc(tx(c[0]), ty(c[1]), 3, 0, Math.PI * 2); ctx.fill() }
  }
}
