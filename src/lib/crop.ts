import type { Box } from './picture'

export type Edge = 'left' | 'top' | 'right' | 'bottom'

// Coordinates refer to the prepared image, including its right and bottom boundaries.
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

type Point = { x: number; y: number }

export function boxFromPoints(start: Point, end: Point, width: number, height: number): Box {
  const x1 = clamp(Math.round(start.x * width), 0, width), x2 = clamp(Math.round(end.x * width), 0, width)
  const y1 = clamp(Math.round(start.y * height), 0, height), y2 = clamp(Math.round(end.y * height), 0, height)
  return [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)]
}

export function edges(box: Box | null, width: number, height: number) {
  const [x, y, w, h] = box ?? [0, 0, width, height]
  const minWidth = Math.min(4, width), minHeight = Math.min(4, height)
  const left = clamp(x, 0, width - minWidth), top = clamp(y, 0, height - minHeight)
  return { left, top, right: clamp(x + w, left + minWidth, width), bottom: clamp(y + h, top + minHeight, height) }
}

export function edgeBounds(edge: Edge, box: Box | null, width: number, height: number): [number, number] {
  const { left, top, right, bottom } = edges(box, width, height)
  const minWidth = Math.min(4, width), minHeight = Math.min(4, height)
  switch (edge) {
    case 'left': return [0, right - minWidth]
    case 'top': return [0, bottom - minHeight]
    case 'right': return [left + minWidth, width]
    case 'bottom': return [top + minHeight, height]
  }
}

export function normalizeBox(box: Box | null, width: number, height: number): Box | null {
  return box && box[0] === 0 && box[1] === 0 && box[2] === width && box[3] === height ? null : box
}

export function moveEdge(edge: Edge, value: number, box: Box | null, width: number, height: number): Box | null {
  const current = edges(box, width, height)
  const [min, max] = edgeBounds(edge, box, width, height)
  current[edge] = Math.max(min, Math.min(max, Math.round(value)))
  return normalizeBox([current.left, current.top, current.right - current.left, current.bottom - current.top], width, height)
}
