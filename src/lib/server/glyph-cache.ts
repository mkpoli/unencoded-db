// What the bucket answered for a drawing or a composer file, kept in the isolate and at the edge,
// so a page that shows the same glyphs again reads none of them from R2. Only settled values are
// kept: a promise belongs to the request that started its read, and each request awaits its own.
import { SITE_ORIGIN } from '$lib/seo'

/** Hands work to the request so it outlives the response, as `ctx.waitUntil` does. */
export type Later = (work: Promise<unknown>) => void
/** A composer shard the export does not hold. */
export const MISSING = Symbol('missing')
export type Missing = typeof MISSING

const IMMUTABLE = 'public, max-age=31536000, immutable'
/** How long a shard stays known as missing, the time the composer's own 404 is good for. */
export const MISSING_MS = 5 * 60_000
const MISSING_UNTIL = 'x-missing-until'

/** A store bounded by count and by weight, which lets go of what was read longest ago. */
export function lru<V>(limits: { entries: number; weight: number }, weigh: (value: V) => number) {
  const held = new Map<string, { value: V; weight: number; until: number }>()
  let total = 0
  const drop = (key: string) => {
    const entry = held.get(key)
    if (!entry) return
    held.delete(key)
    total -= entry.weight
  }
  return {
    get(key: string): V | undefined {
      const entry = held.get(key)
      if (!entry) return undefined
      if (entry.until <= Date.now()) {
        drop(key)
        return undefined
      }
      // A map lists its keys in the order they were set, so a key set again is the newest.
      held.delete(key)
      held.set(key, entry)
      return entry.value
    },
    set(key: string, value: V, until = Infinity) {
      drop(key)
      const weight = weigh(value)
      if (weight > limits.weight) return
      held.set(key, { value, weight, until })
      total += weight
      for (const oldest of held.keys()) {
        if (held.size <= limits.entries && total <= limits.weight) break
        drop(oldest)
      }
    },
    get size() { return held.size },
    get weight() { return total },
  }
}

type Edge = { match(address: string): Promise<Response | undefined>; put(address: string, response: Response): Promise<void> }
// Workers have `caches.default`; a test or a local build has none, and then only the isolate keeps.
const edge = (): Edge | null => (globalThis as unknown as { caches?: { default?: Edge } }).caches?.default ?? null
// The edge keeps by address, so each object has one made from its key in the bucket.
const addressOf = (key: string) => `${SITE_ORIGIN}/r2-kept/${key}`

async function found(key: string): Promise<Response | null> {
  try {
    const response = await edge()?.match(addressOf(key))
    return response?.ok ? response : null
  } catch {
    return null
  }
}

// The answer never waits for the edge to take a copy. A copy that fails is read from R2 next time.
function keep(key: string, body: string | Uint8Array | null, headers: Record<string, string>, later?: Later) {
  try {
    const stored = edge()?.put(addressOf(key), new Response(body as BodyInit | null, { headers }))?.catch(() => {})
    if (stored) later?.(stored)
  } catch {
    // An edge that refuses the copy leaves the isolate's own.
  }
}

// Drawings are a few kilobytes each. A composer's `identity.json` and `layout.json` are about 2 MB
// each, so the files of three styles fit beside their shards.
const DRAWINGS = { entries: 4096, weight: 8_000_000 }
const FILES = { entries: 1024, weight: 16_000_000 }

function kept() {
  const drawings = lru<string>(DRAWINGS, drawing => drawing.length)
  const files = lru<Uint8Array | Missing>(FILES, file => file === MISSING ? 1 : file.byteLength)
  return {
    /** A drawing kept under `key`, or null: the bucket is then asked, since it may have been drawn since. */
    async drawing(key: string): Promise<string | null> {
      const here = drawings.get(key)
      if (here) return here
      const drawing = await (await found(key))?.text().catch(() => '')
      if (!drawing) return null
      drawings.set(key, drawing)
      return drawing
    },
    /** Keeps a drawing the bucket holds. A drawing that is not there yet is never kept. */
    keepDrawing(key: string, drawing: string, later?: Later) {
      if (!drawing) return
      drawings.set(key, drawing)
      keep(key, drawing, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': IMMUTABLE }, later)
    },
    /** A composer file kept under `key`, `MISSING` for a shard lately found missing, or null. */
    async file(key: string): Promise<Uint8Array | Missing | null> {
      const here = files.get(key)
      if (here) return here
      const response = await found(key)
      if (!response) return null
      const until = response.headers.get(MISSING_UNTIL)
      if (until !== null) {
        if (!(Number(until) > Date.now())) return null
        files.set(key, MISSING, Number(until))
        return MISSING
      }
      const bytes = await response.arrayBuffer().then(buffer => new Uint8Array(buffer), () => null)
      if (!bytes) return null
      files.set(key, bytes)
      return bytes
    },
    keepFile(key: string, bytes: Uint8Array, type: string, later?: Later) {
      files.set(key, bytes)
      keep(key, bytes, { 'content-type': type, 'cache-control': IMMUTABLE }, later)
    },
    /** Remembers for five minutes that the export holds no such shard. */
    keepMissing(key: string, later?: Later) {
      const until = Date.now() + MISSING_MS
      files.set(key, MISSING, until)
      keep(key, null, { [MISSING_UNTIL]: String(until), 'cache-control': `public, max-age=${MISSING_MS / 1000}` }, later)
    },
  }
}

// One store per bucket: the binding is the same object for every request an isolate serves.
const stores = new WeakMap<object, ReturnType<typeof kept>>()
export function keptOf(bucket: object) {
  let store = stores.get(bucket)
  if (!store) stores.set(bucket, store = kept())
  return store
}
