// The drawing of each description, composed with han-compose and kept beside the composer's own
// files. A page reads what is already drawn; a miss is drawn beside it, so a rare part never holds
// up the page.
import { compose, createSource } from 'ids-input/composer'
import { COMPOSER_VERSION } from '$lib/composer'
import { cleanIds } from '$lib/ids'

type Bucket = Pick<R2Bucket, 'get' | 'put'>
type Source = ReturnType<typeof createSource>

const UPSTREAM = `https://glyphatlas.org/atlas/composer/${COMPOSER_VERSION}`
const FOLDER = `composer/${COMPOSER_VERSION}`
const DRAWINGS = `glyphs/${COMPOSER_VERSION}`
const IMMUTABLE = 'public, max-age=31536000, immutable'

let source: Source | null = null
const pending = new Map<string, Promise<string | null>>()

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hash(text: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
}

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

async function read(bucket: Bucket, sequence: string) {
  const stored = await bucket.get(`${DRAWINGS}/${await hash(sequence)}.txt`)
  return stored ? stored.text() : null
}

export function drawGlyph(bucket: Bucket, sequence: string): Promise<string | null> {
  const ids = cleanIds(sequence)
  if (!ids) return Promise.resolve(null)
  let run = pending.get(ids)
  if (!run) {
    run = (async () => {
      const stored = await read(bucket, ids)
      if (stored) return stored
      const drawn = await compose(sourceFor(bucket), ids)
      if (!drawn.d) return null
      await bucket.put(`${DRAWINGS}/${await hash(ids)}.txt`, drawn.d, { httpMetadata: { contentType: 'text/plain; charset=utf-8', cacheControl: IMMUTABLE } })
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
export async function warmGlyphs(bucket: Bucket | undefined, sequences: string[]) {
  if (!bucket?.get) return
  let next = 0
  const worker = async () => {
    while (next < sequences.length) await drawGlyph(bucket, sequences[next++])
  }
  await Promise.all(Array.from({ length: Math.min(2, sequences.length) }, worker))
}
