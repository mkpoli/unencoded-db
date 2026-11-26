// The scale a picture is shown at, measured against the size that fits its frame, and the pan that
// keeps an edge in reach.
import type { Box } from './picture'

export const ZOOM_MAX = 8
export const ZOOM_CEILING = 32
export const ZOOM_STEP = 1.25

export type Pan = { x: number; y: number }
export type Size = { width: number; height: number }

export function clampZoom(value: number, max = ZOOM_MAX) {
  const ceiling = Math.max(1, max)
  return Math.min(ceiling, Math.max(1, value))
}

/** Largest zoom allowed for a picture, scaled so wide or tall scans still reach crisp detail. */
export function maxZoomFor(natural: Size, fitted: Size, floor = ZOOM_MAX) {
  if (natural.width <= 0 || natural.height <= 0 || fitted.width <= 0 || fitted.height <= 0) return floor
  const native = Math.max(natural.width / fitted.width, natural.height / fitted.height)
  return Math.min(ZOOM_CEILING, Math.max(floor, Math.ceil(native * 4)))
}

/** The pan that keeps the picture's edges at or inside the frame's. */
export function confinePan(pan: Pan, zoom: number, picture: Size, frame: Size): Pan {
  const x = Math.max(0, (picture.width * zoom - frame.width) / 2)
  const y = Math.max(0, (picture.height * zoom - frame.height) / 2)
  return { x: Math.min(x, Math.max(-x, pan.x)) || 0, y: Math.min(y, Math.max(-y, pan.y)) || 0 }
}

/** The pan that keeps the point under `at` still while the picture grows from `from` to `to`. */
export function aroundPoint(pan: Pan, at: Pan, from: number, to: number): Pan {
  if (!from) return pan
  const ratio = to / from
  return { x: at.x - (at.x - pan.x) * ratio, y: at.y - (at.y - pan.y) * ratio }
}

/** Zoom and pan that centre a marked character box in the frame with room around it. */
export function focusBox(box: Box, natural: Size, fitted: Size, frame: Size, max = ZOOM_MAX): { zoom: number; pan: Pan } {
  if (natural.width <= 0 || natural.height <= 0 || fitted.width <= 0 || fitted.height <= 0 || frame.width <= 0 || frame.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }
  const cx = (box[0] + box[2] / 2) / natural.width
  const cy = (box[1] + box[3] / 2) / natural.height
  const boxWidth = (box[2] / natural.width) * fitted.width
  const boxHeight = (box[3] / natural.height) * fitted.height
  const target = (Math.min(frame.width, frame.height) * 0.25) / Math.max(1, boxWidth, boxHeight)
  const whole = 0.9 * Math.min(frame.width / Math.max(1, boxWidth), frame.height / Math.max(1, boxHeight))
  const zoom = clampZoom(Math.min(whole, Math.max(2, target)), max)
  const dx = (cx - 0.5) * fitted.width
  const dy = (cy - 0.5) * fitted.height
  return { zoom, pan: confinePan({ x: -dx * zoom, y: -dy * zoom }, zoom, fitted, frame) }
}
