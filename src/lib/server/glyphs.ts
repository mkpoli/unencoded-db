// The drawing of each description, composed with han-compose and kept beside the composer's own
// files. A page reads what is already drawn; a miss is drawn beside it, so a rare part never holds
// up the page. A drawing is one path, or SVG markup when a layout moves its parts.
import { compose, createSource, documentView, sketch } from 'ids-input/composer'
import { scopesMarkup } from 'ids-input/document'
import { COMPOSER_VERSION } from '$lib/composer'
import { cleanIds } from '$lib/ids'
import { cleanLayout, layoutText } from '$lib/layout'
import { layoutDocument } from '$lib/layout-document'
import { hashHex } from './image'

type Bucket = Pick<R2Bucket, 'get' | 'put'>
type Source = ReturnType<typeof createSource>
/** A description and, as its stored text, the layout it is drawn with. */
export type Glyph = { ids: string | null; layout?: string | null }

const UPSTREAM = `https://glyphatlas.org/atlas/composer/${COMPOSER_VERSION}`
const FOLDER = `composer/${COMPOSER_VERSION}`
const DRAWINGS = `glyphs/${COMPOSER_VERSION}`
const IMMUTABLE = 'public, max-age=31536000, immutable'

let source: Source | null = null
const pending = new Map<string, Promise<string | null>>()

// The composer reads the export through this bucket as well: a shard fetched once stays here.
function sourceFor(bucket: Bucket) {
  if (source) return source
  source = createSource(async name => {
    const key = `${FOLDER}/${name}`
    const stored = await bucket.get(key)
    if (stored) return stored.arrayBuffer()
    const response = await fetch(`${UPSTREAM}/${name}`)
    if (response.status === 404 && /^[gp]\//.test(name)) return null
    if (!response.ok) throw new Error(`${name}: ${response.status}`)
    const bytes = await response.arrayBuffer()
    await bucket.put(key, bytes, { httpMetadata: { contentType: /^[gp]\//.test(name) ? 'application/octet-stream' : 'application/json' } })
    return bytes
  })
  return source
}

/** What tells one drawing from another: the description, and its layout when it has one. */
export function glyphName(glyph: Glyph) {
  const ids = cleanIds(glyph.ids ?? '')
  const layout = ids ? layoutText(cleanLayout(glyph.layout, ids)) : ''
  return layout ? `${ids}\n${layout}` : ids
}

async function read(bucket: Bucket, name: string) {
  const stored = await bucket.get(`${DRAWINGS}/${await hashHex(name)}.txt`)
  return stored ? stored.text() : null
}

// The parts drawn one by one and moved as the layout says. Null for a description whose parts the
// composer cannot tell apart, which is then drawn as it stands; a drawing that failed is thrown, so
// that nothing is kept in its place.
async function adjusted(from: Source, ids: string, layout: string, name: string) {
  const document = layoutDocument(ids, cleanLayout(layout, ids))
  if (!document) return null
  const drawn = await compose(from, ids, { separate: true })
  const leaves = await sketch(from, ids)
  const view = documentView(document, drawn, leaves)
  if (!view.scopes || !view.complete) return null
  // What a part takes away and the emoji among the parts are drawn as the form's own plate draws them.
  const { defs, body } = scopesMarkup(view.scopes, { ink: 'currentColor', idPrefix: `g${(await hashHex(name)).slice(0, 12)}`, emoji: drawn.emoji, cut: drawn.cut, cutLeaf: drawn.parts?.find(part => part.cut)?.leaf ?? null })
  return defs + body
}

export function drawGlyph(bucket: Bucket, glyph: Glyph): Promise<string | null> {
  const name = glyphName(glyph)
  if (!name) return Promise.resolve(null)
  let run = pending.get(name)
  if (!run) {
    run = (async () => {
      const stored = await read(bucket, name)
      if (stored) return stored
      const [ids, layout] = name.split('\n')
      const drawn = (layout ? await adjusted(sourceFor(bucket), ids, layout, name) : null) ?? (await compose(sourceFor(bucket), ids)).d
      if (!drawn) return null
      await bucket.put(`${DRAWINGS}/${await hashHex(name)}.txt`, drawn, { httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: IMMUTABLE } })
      return drawn
    })().catch(() => null).finally(() => pending.delete(name))
    pending.set(name, run)
  }
  return run
}

// The drawings a page already has, by `glyphName`. A glyph without one keeps its description until it is drawn.
export async function glyphPaths(bucket: Bucket | undefined, glyphs: Glyph[]) {
  const wanted = [...new Set(glyphs.map(glyphName).filter(Boolean))]
  const paths: Record<string, string> = {}
  if (!bucket?.get) return paths
  await Promise.all(wanted.map(async name => {
    try {
      const path = await read(bucket, name)
      if (path) paths[name] = path
    } catch {
      // A cache that cannot be read leaves the description on the page.
    }
  }))
  return paths
}

// Draw the glyphs a page did not have, a few at a time, after its response.
export async function warmGlyphs(bucket: Bucket | undefined, glyphs: Glyph[]) {
  if (!bucket?.get) return
  let next = 0
  const worker = async () => {
    while (next < glyphs.length) await drawGlyph(bucket, glyphs[next++])
  }
  await Promise.all(Array.from({ length: Math.min(2, glyphs.length) }, worker))
}

/** The drawings of a page's tiles, by record; the ones not drawn yet are drawn after the response. */
export async function tileGlyphs(platform: App.Platform | undefined, tiles: (Glyph & { id: number })[]) {
  const bucket = platform?.env?.MEDIA
  const shown = tiles.filter(tile => tile.ids)
  const paths = await glyphPaths(bucket, shown)
  const missing = new Map(shown.map(tile => [glyphName(tile), tile]).filter(([name]) => !paths[name as string]) as [string, Glyph][])
  if (missing.size) platform?.ctx?.waitUntil(warmGlyphs(bucket, [...missing.values()]))
  return Object.fromEntries(shown.flatMap(tile => { const path = paths[glyphName(tile)]; return path ? [[tile.id, path]] : [] })) as Record<number, string>
}
