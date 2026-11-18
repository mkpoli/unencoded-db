// The scale a picture is shown at, measured against the size that fits its frame, and the pan that
// keeps an edge in reach.
export const ZOOM_MAX = 8
export const ZOOM_STEP = 1.25

export type Pan = { x: number; y: number }
export type Size = { width: number; height: number }

export function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(1, value))
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
