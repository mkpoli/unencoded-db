// Server-side Unihan block reader for static/unihan/<block>.tsv.
// Uses Cloudflare's ASSETS binding in production/wrangler and falls back to SvelteKit's event.fetch
// in local Vite dev. Parsed blocks stay in a small bounded isolate cache; misses are never cached.
import { parseUnihan, unihanBlock, type UnihanRow } from '$lib/character-tables'
import { isIdeograph } from '$lib/ideographs'

export type UnihanAssets = { fetch(input: RequestInfo | URL): Promise<Response> }
export type UnihanContext = { assets?: UnihanAssets; fetch?: typeof fetch; origin?: string }

const BLOCK_CACHE_MAX = 32
const cache = new Map<string, Map<string, UnihanRow>>()

function remember(block: string, rows: Map<string, UnihanRow>) {
  cache.delete(block)
  cache.set(block, rows)
  if (cache.size > BLOCK_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

async function readBlock(block: string, context: UnihanContext): Promise<Map<string, UnihanRow> | null> {
  const cached = cache.get(block)
  if (cached) {
    // Refresh recency for LRU eviction.
    remember(block, cached)
    return cached
  }
  const path = `/unihan/${block}.tsv`
  let response: Response
  try {
    if (context.assets && context.origin) response = await context.assets.fetch(new URL(path, context.origin))
    else if (context.fetch) response = await context.fetch(path)
    else return null
  } catch {
    return null
  }
  if (!response.ok) return null
  const rows = parseUnihan(await response.text())
  remember(block, rows)
  return rows
}

/**
 * Looks up Unihan `kIRG_*Source` values for the given encoded characters. Non-ideographs and
 * characters with no Unihan sources are omitted; unreadable assets fail open with an empty map.
 */
export async function irgSourcesFor(chars: readonly string[], context: UnihanContext): Promise<Record<string, string[]>> {
  const ideographs = [...new Set(chars.filter(char => [...char].length === 1 && isIdeograph(char)))]
  if (!ideographs.length) return {}
  const blocks = [...new Set(ideographs.map(unihanBlock))]
  const loaded = new Map<string, Map<string, UnihanRow>>()
  await Promise.all(blocks.map(async block => {
    const rows = await readBlock(block, context)
    if (rows) loaded.set(block, rows)
  }))
  const result: Record<string, string[]> = {}
  for (const char of ideographs) {
    const raw = loaded.get(unihanBlock(char))?.get(char)?.sources
    if (!raw) continue
    const list = raw.split(' ').filter(Boolean)
    if (list.length) result[char] = list
  }
  return result
}

/** Clears the in-isolate block cache (for tests). */
export function clearUnihanCache() {
  cache.clear()
}
