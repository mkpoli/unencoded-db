// The drawing of each description, composed with han-compose and kept beside the composer's own
// files. A page reads what is already drawn; a miss is drawn beside it, so a rare part never holds
// up the page. A drawing is one path, or SVG markup when a layout moves its parts.
import { documentView } from 'han-compose/document-view'
import { compose, sketch } from 'han-compose/loader'
import { onlyBundled } from 'han-compose/local'
import { exportSource, sourceFor, traitKey, traitsOf } from 'han-compose/source'
import { documentRenderer, scopesMarkup } from 'ids-input/document'
import { composerDrawing, composerUrl, composerVersion, GLYPH_STYLE, type GlyphStyle } from '$lib/composer'
import { composerData } from '$lib/composer-data'
import { cleanIds } from '$lib/ids'
import { cleanLayout, cleanMatrices, layoutForStyle, layoutText } from '$lib/layout'
import { layoutDocument } from '$lib/layout-document'
import { hashHex } from './image'

type Bucket = Pick<R2Bucket, 'get' | 'put'>
type Source = ReturnType<typeof sourceFor>
/** A description and, as its stored text, the layout it is drawn with. */
export type Glyph = { ids: string | null; layout?: string | null }

// Each style's export and drawings have their own folders, named by the export's version.
const folderOf = (style: GlyphStyle) => `composer/${composerVersion(style)}`
const drawingsOf = (style: GlyphStyle, name: string) => `glyphs/${composerDrawing(style, name.includes('\n'))}`
const IMMUTABLE = 'public, max-age=31536000, immutable'

const typeOf = (name: string) => /^[gp]\//.test(name) ? 'application/octet-stream' : 'application/json'

// The export's files pass through the bucket, so a shard fetched once stays here.
function reader(bucket: Bucket, style: GlyphStyle) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const name = url.pathname.split(`/${composerVersion(style)}/`)[1] ?? ''
    if (!name) throw new Error(`${url} is not a composer export file.`)
    const key = `${folderOf(style)}/${name}`
    const stored = await bucket.get(key)
    if (stored) return new Response(await stored.arrayBuffer(), { headers: { 'content-type': typeOf(name) } })
    const response = await fetch(url)
    if (response.status === 404 && /^[gp]\//.test(name)) return response
    if (!response.ok) throw new Error(`${name}: ${response.status}`)
    const bytes = await response.arrayBuffer()
    await bucket.put(key, bytes, { httpMetadata: { contentType: typeOf(name) } })
    return new Response(bytes, { headers: { 'content-type': typeOf(name) } })
  }
}

export type ComposerAssets = { fetch(input: RequestInfo | URL): Promise<Response> }
type Context = { assets?: ComposerAssets; origin?: string; style?: GlyphStyle }

// The outlines the export lacks are files of this build; the asset binding answers them by URL.
function bundled(context: Context) {
  return async (path: string, url?: string): Promise<Response> => {
    if (url && context.assets && context.origin) return context.assets.fetch(new URL(url, context.origin))
    return new Response(null, { status: 404 })
  }
}

// A source is chosen by style, what the description calls for, whether bundled outlines alone draw
// it, and whether its parts are drawn one by one; it reads the export through one bucket. A source
// built from bundled outlines alone has no export behind it, so it is never handed a description
// that needs one.
export function sourceKey(sequence: string, context: Context, separate = false) {
  const traits = traitsOf(sequence), style = context.style ?? GLYPH_STYLE
  const local = traits.empty || onlyBundled(sequence, separate, false, style)
  return `${style}:${local ? 'local' : 'remote'}:${traitKey(traits)}:${context.assets ? 1 : 0}:${separate ? 1 : 0}`
}

/** What tells one drawing from another: the description, and its layout when it has one. */
export function glyphName(glyph: Glyph, style: GlyphStyle = GLYPH_STYLE) {
  const ids = cleanIds(glyph.ids ?? '')
  const layout = ids ? layoutText(layoutForStyle(cleanLayout(glyph.layout, ids), style)) : ''
  return layout ? `${ids}\n${layout}` : ids
}

async function read(bucket: Bucket, name: string, style: GlyphStyle) {
  const stored = await bucket.get(`${drawingsOf(style, name)}/${await hashHex(name)}.txt`)
  return stored ? stored.text() : null
}

// The parts drawn one by one and moved as the layout says. Null for a description whose parts the
// composer cannot tell apart, which is then drawn as it stands; a drawing that failed is thrown, so
// that nothing is kept in its place.
async function adjusted(from: Source, ids: string, layout: string, name: string, style: GlyphStyle) {
  const document = layoutDocument(ids, cleanMatrices(layout, ids))
  if (!document) return null
  const drawn = await compose(from, ids, { separate: true, fontStyle: style })
  const leaves = await sketch(from, ids, { fontStyle: style })
  const view = documentView(document, drawn, leaves, { renderer: documentRenderer(style === 'sans' ? drawn.stroke : null) })
  if (!view.scopes || !view.complete) return null
  // What a part takes away and the emoji among the parts are drawn as the form's own plate draws them.
  const { defs, body } = scopesMarkup(view.scopes, { ink: 'currentColor', idPrefix: `g${(await hashHex(name)).slice(0, 12)}`, emoji: drawn.emoji, cut: drawn.cut, cutLeaf: drawn.parts?.find(part => part.cut)?.leaf ?? null })
  return defs + body
}

// A source retains promises for R2 and asset reads. Only drawings owned by this request
// can await those reads. Finished paths and composer files remain shared through R2.
function glyphDrawer(bucket: Bucket, context: Context) {
  const style = context.style ?? GLYPH_STYLE
  const sources = new Map<string, Source>()
  let exported: ReturnType<typeof exportSource> | undefined
  function source(ids: string, separate = false) {
    const key = sourceKey(ids, context, separate)
    let found = sources.get(key)
    if (!found) {
      exported ??= exportSource(composerUrl(style), { loaders: composerData, fetch: reader(bucket, style), read: bundled(context) })
      found = sourceFor(ids, { base: composerUrl(style), fontStyle: style, traits: traitsOf(ids), separate, exported, loaders: composerData, read: bundled(context) })
      sources.set(key, found)
    }
    return found
  }
  return async (glyph: Glyph) => {
    const name = glyphName(glyph, style)
    if (!name) return null
    try {
      const stored = await read(bucket, name, style)
      if (stored) return stored
      const [ids, layout] = name.split('\n')
      const drawn = (layout ? await adjusted(source(ids, true), ids, layout, name, style) : null) ?? (await compose(source(ids), ids, { fontStyle: style })).d
      if (!drawn) return null
      await bucket.put(`${drawingsOf(style, name)}/${await hashHex(name)}.txt`, drawn, { httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: IMMUTABLE } })
      return drawn
    } catch (error) {
      console.error(`glyph ${style} ${name}:`, error)
      throw error
    }
  }
}

export function drawGlyph(bucket: Bucket, glyph: Glyph, context: Context = {}) {
  return glyphDrawer(bucket, context)(glyph)
}

// The drawings a page already has, by `glyphName`. A glyph without one keeps its description until it is drawn.
export async function glyphPaths(bucket: Bucket | undefined, glyphs: Glyph[], style: GlyphStyle = GLYPH_STYLE) {
  const wanted = [...new Set(glyphs.map(glyph => glyphName(glyph, style)).filter(Boolean))]
  const paths: Record<string, string> = {}
  if (!bucket?.get) return paths
  await Promise.all(wanted.map(async name => {
    try {
      const path = await read(bucket, name, style)
      if (path) paths[name] = path
    } catch {
      // A cache that cannot be read leaves the description on the page.
    }
  }))
  return paths
}

// Draw the glyphs a page did not have, a few at a time, after its response.
export async function warmGlyphs(bucket: Bucket | undefined, glyphs: Glyph[], context: Context = {}) {
  if (!bucket?.get) return
  const draw = glyphDrawer(bucket, context)
  let next = 0
  const worker = async () => {
    while (next < glyphs.length) await draw(glyphs[next++]).catch(() => null)
  }
  await Promise.all(Array.from({ length: Math.min(2, glyphs.length) }, worker))
}

/** The drawings of a page's tiles, by record; the ones not drawn yet are drawn after the response. */
export async function tileGlyphs(platform: App.Platform | undefined, origin: string, tiles: (Glyph & { id: number })[], style: GlyphStyle = GLYPH_STYLE) {
  const bucket = platform?.env?.MEDIA
  const shown = tiles.filter(tile => tile.ids)
  const paths = await glyphPaths(bucket, shown, style)
  const missing = new Map(shown.map(tile => [glyphName(tile, style), tile]).filter(([name]) => !paths[name as string]) as [string, Glyph][])
  if (missing.size) platform?.ctx?.waitUntil(warmGlyphs(bucket, [...missing.values()], { assets: platform?.env?.ASSETS, origin, style }))
  return Object.fromEntries(shown.flatMap(tile => { const path = paths[glyphName(tile, style)]; return path ? [[tile.id, path]] : [] })) as Record<number, string>
}
