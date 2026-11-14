// The drawing of each description, composed with han-compose and kept beside the composer's own
// files. A page reads what is already drawn; a miss is drawn beside it, so a rare part never holds
// up the page.
import { compose } from '@han-compose/composer/loader'
import { sourceFor, traitKey, traitsOf } from '@han-compose/composer/source'
import { COMPOSER_URL, COMPOSER_VERSION } from '$lib/composer'
import { composerData } from '$lib/composer-data'
import { cleanIds } from '$lib/ids'
import { hashHex } from './image'

type Bucket = Pick<R2Bucket, 'get' | 'put'>
type Source = ReturnType<typeof sourceFor>

const FOLDER = `composer/${COMPOSER_VERSION}`
const DRAWINGS = `glyphs/${COMPOSER_VERSION}`
const IMMUTABLE = 'public, max-age=31536000, immutable'

const sources = new WeakMap<Bucket, Map<string, Source>>()
const pending = new Map<string, Promise<string | null>>()

const typeOf = (name: string) => /^[gp]\//.test(name) ? 'application/octet-stream' : 'application/json'

// The export's files pass through the bucket, so a shard fetched once stays here.
function reader(bucket: Bucket) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const name = url.pathname.split(`/${COMPOSER_VERSION}/`)[1] ?? ''
    if (!name) throw new Error(`${url} is not a composer export file.`)
    const key = `${FOLDER}/${name}`
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
type Context = { assets?: ComposerAssets; origin?: string }

// The outlines the export lacks are files of this build; the asset binding answers them by URL.
function bundled(context: Context) {
  return async (path: string, url?: string): Promise<Response> => {
    if (url && context.assets && context.origin) return context.assets.fetch(new URL(url, context.origin))
    return new Response(null, { status: 404 })
  }
}

// A source is chosen by what the description calls for, and reads the export through one bucket.
function sourceOf(bucket: Bucket, sequence: string, context: Context) {
  let byTrait = sources.get(bucket)
  if (!byTrait) sources.set(bucket, byTrait = new Map())
  const traits = traitsOf(sequence)
  const key = `${traitKey(traits)}:${context.assets ? 1 : 0}`
  let source = byTrait.get(key)
  if (!source) {
    source = sourceFor(sequence, { base: COMPOSER_URL, traits, fetch: reader(bucket), loaders: composerData, read: bundled(context) })
    byTrait.set(key, source)
  }
  return source
}

async function read(bucket: Bucket, sequence: string) {
  const stored = await bucket.get(`${DRAWINGS}/${await hashHex(sequence)}.txt`)
  return stored ? stored.text() : null
}

export function drawGlyph(bucket: Bucket, sequence: string, context: Context = {}): Promise<string | null> {
  const ids = cleanIds(sequence)
  if (!ids) return Promise.resolve(null)
  let run = pending.get(ids)
  if (!run) {
    run = (async () => {
      const stored = await read(bucket, ids)
      if (stored) return stored
      const drawn = await compose(sourceOf(bucket, ids, context), ids)
      if (!drawn.d) return null
      await bucket.put(`${DRAWINGS}/${await hashHex(ids)}.txt`, drawn.d, { httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: IMMUTABLE } })
      return drawn.d
    })().catch(() => null).finally(() => pending.delete(ids))
    pending.set(ids, run)
  }
  return run
}

// The drawings a page already has. A sequence without one keeps its description until it is drawn.
export async function glyphPaths(bucket: Bucket | undefined, sequences: (string | null | undefined)[]) {
  const wanted = [...new Set(sequences.filter((sequence): sequence is string => Boolean(sequence)).map(cleanIds))]
  const paths: Record<string, string> = {}
  if (!bucket?.get) return paths
  await Promise.all(wanted.map(async sequence => {
    try {
      const path = await read(bucket, sequence)
      if (path) paths[sequence] = path
    } catch {
      // A cache that cannot be read leaves the description on the page.
    }
  }))
  return paths
}

// Draw the sequences a page did not have, a few at a time, after its response.
export async function warmGlyphs(bucket: Bucket | undefined, sequences: string[], context: Context = {}) {
  if (!bucket?.get) return
  let next = 0
  const worker = async () => {
    while (next < sequences.length) await drawGlyph(bucket, sequences[next++], context)
  }
  await Promise.all(Array.from({ length: Math.min(2, sequences.length) }, worker))
}
