// Where a description's drawing is asked for. The style, the export and the composer are part of the
// address, so a drawing in one style, or from older code, is never taken for another.
import { composerDrawing, GLYPH_STYLE, type GlyphStyle } from './composer'
import { cleanLayout, layoutForStyle, layoutText } from './layout'

export function glyphAddress(ids: string, layout: string | null | undefined, style: GlyphStyle) {
  if (!ids) return ''
  const laidOut = layoutText(layoutForStyle(cleanLayout(layout, ids), style))
  return `/api/glyph?ids=${encodeURIComponent(ids)}&v=${encodeURIComponent(composerDrawing(style, Boolean(laidOut)))}${laidOut ? `&layout=${encodeURIComponent(laidOut)}` : ''}${style !== GLYPH_STYLE ? `&style=${style}` : ''}`
}
