// The composer exports, one per style of glyph; each folder is versioned, so a new export gets a new name.
export const GLYPH_STYLES = ['sans', 'serif', 'fangsong', 'kaisho'] as const
export type GlyphStyle = (typeof GLYPH_STYLES)[number]
export const GLYPH_STYLE: GlyphStyle = 'sans'
// The style a reader draws in, kept in a cookie so the server draws tiles in it too.
export const GLYPH_STYLE_COOKIE = 'ug.glyph'

const VERSIONS: Record<GlyphStyle, string> = {
  sans: '0bd3ee83a5e2-sans-compose-layout-v4-f7+kin',
  serif: '8156f838798c-serif-compose-layout-v4-serif-f7+variants',
  fangsong: 'b53713c2da0e-fangsong-compose-layout-v4-fangsong-f7+kin',
  kaisho: 'b53713c2da0e-kaisho-compose-layout-v4-kaisho-f7+kin',
}
export const composerVersion = (style: GlyphStyle) => VERSIONS[style]
export const composerUrl = (style: GlyphStyle) => `https://ids-input-composer.mkpoli.workers.dev/${VERSIONS[style]}`
export const glyphStyleOf = (value: string | null | undefined): GlyphStyle => (GLYPH_STYLES as readonly string[]).includes(value ?? '') ? value as GlyphStyle : GLYPH_STYLE
