// The composer exports, one per style of glyph; each folder is versioned, so a new export gets a new name.
import { gitHead } from 'han-compose/package.json'

export const GLYPH_STYLES = ['sans', 'serif', 'fangsong', 'regular', 'pen-writing'] as const
export type GlyphStyle = (typeof GLYPH_STYLES)[number]
export const GLYPH_STYLE: GlyphStyle = 'sans'
// The style a reader draws in, kept in a cookie so the server draws tiles in it too.
export const GLYPH_STYLE_COOKIE = 'ug.glyph'

const VERSIONS: Record<GlyphStyle, string> = {
  sans: '0bd3ee83a5e2-sans-compose-layout-v4-f7+kin',
  serif: 'b53713c2da0e-serif-compose-layout-v4-serif-f7+kin',
  regular: 'c14ee5e08798-regular-compose-layout-v4-regular-f7',
  fangsong: 'b53713c2da0e-fangsong-compose-layout-v4-fangsong-f7+kin',
  'pen-writing': 'b53713c2da0e-kaisho-compose-layout-v4-kaisho-f7+kin',
}
export const composerVersion = (style: GlyphStyle) => VERSIONS[style]
// The code draws the glyph too, so an engine of another han-compose commit gives its drawings a new
// address even when the export stays the same.
export const composerRevision = gitHead.slice(0, 12)
export const composerDrawing = (style: GlyphStyle, adjusted = false) => `${VERSIONS[style]}-${composerRevision}${style === 'sans' && adjusted ? '-width1' : ''}`
export const composerUrl = (style: GlyphStyle) => `https://ids-input-composer.mkpoli.workers.dev/${VERSIONS[style]}`
export const glyphStyleOf = (value: string | null | undefined): GlyphStyle => (GLYPH_STYLES as readonly string[]).includes(value ?? '') ? value as GlyphStyle : GLYPH_STYLE
