// On-demand bibliographic sighting importer from IRG Working Set ORT pages (hc.jsecs.org).
// Imports work citations, page references, and IRG discussion notes with ORT in `vias` and scan
// links in `note`. Never mirrors ORT evidence images into R2 and never re-imports sightings that
// were already cited or removed by a contributor.
import { encodingsOf, type Claim } from '$lib/claims'
import { encodedCharacter } from '$lib/ids'
import { mapOrtSourceToSighting, parseOrtPage, type OrtWorkingSet } from '$lib/irg-ort'
import { irgLinks } from '$lib/irg-ws'
import { boundedBody } from './body-limit'
import { addSighting, getEntry, SIGHTINGS_MAX, SightingLimitError, type Sighting } from './entries'

/** Fixed 12-hex person id (matching `PERSON_ID`) for automated IRG Working Set bibliographic imports. */
export const IRG_ORT_ACTOR_ID = '000000001260'
export const IRG_ORT_ACTOR_NAME = 'IRG Working Set'
export const IRG_ORT_SIGHTINGS_MAX = 5

const ORT_HOST = 'hc.jsecs.org'
const ORT_PATH = /^\/irg\/(ws2015|ws2017|ws2021|ws2024)\/app\/index\.php$/
const WS_CODE = /^WS(2015|2017|2021|2024)-(\d{5})$/
const MAX_ORT_HTML = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const USER_AGENT = 'GlyphAtlasRare/1.0 (+https://rare.glyphatlas.org)'

export type OrtTarget = { ws: OrtWorkingSet; url: string; key: string }
export type OrtFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type OrtSyncResult = {
  entryId: number
  targets: number
  added: number
  skipped: number
  refs: string[]
}

export async function ensureIrgOrtActor(db: D1Database, now = () => Date.now()): Promise<string> {
  await db.prepare('INSERT OR IGNORE INTO people(id, name, created_at) VALUES (?, ?, ?)')
    .bind(IRG_ORT_ACTOR_ID, IRG_ORT_ACTOR_NAME, new Date(now()).toISOString()).run()
  return IRG_ORT_ACTOR_ID
}

/** Validates and extracts the working-set slug from an hc.jsecs.org ORT URL, or null. */
export function parseOrtUrl(rawUrl: string): { ws: OrtWorkingSet; url: string; queryKey: string } | null {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== ORT_HOST) return null
  const match = ORT_PATH.exec(parsed.pathname)
  if (!match) return null
  const ws = match[1] as OrtWorkingSet
  const id = parsed.searchParams.get('id')
  const find = parsed.searchParams.get('find')
  if (id && /^\d{1,5}$/.test(id) && Number(id) >= 1) {
    const padded = id.padStart(5, '0')
    return { ws, url: `https://${ORT_HOST}/irg/${ws}/app/index.php?id=${padded}`, queryKey: `${ws}:id:${padded}` }
  }
  if (find && /^[A-Za-z0-9_.-]{2,40}$/.test(find)) {
    return { ws, url: `https://${ORT_HOST}/irg/${ws}/app/index.php?find=${encodeURIComponent(find)}`, queryKey: `${ws}:find:${find}` }
  }
  return null
}

/**
 * Resolves the ORT pages relevant to a record from its `irg-ws` serial claims and its encoded
 * Unicode claims (via Unihan `kIRG_*Source` values).
 */
export function ortTargetsForClaims(claims: readonly Claim[], unihanSources: Record<string, readonly string[]> = {}): OrtTarget[] {
  const seen = new Set<string>()
  const targets: OrtTarget[] = []
  const push = (rawUrl: string) => {
    const parsed = parseOrtUrl(rawUrl)
    if (!parsed || seen.has(parsed.queryKey)) return
    seen.add(parsed.queryKey)
    targets.push({ ws: parsed.ws, url: parsed.url, key: parsed.queryKey })
  }

  for (const encoding of encodingsOf(claims)) {
    if (encoding.charset === 'irg-ws') {
      const m = WS_CODE.exec(encoding.code.trim())
      if (m && Number(m[2]) >= 1) {
        push(`https://${ORT_HOST}/irg/ws${m[1]}/app/index.php?id=${m[2]}`)
      }
    } else if (encoding.charset === 'unicode') {
      const char = encodedCharacter(encoding.code)
      if (!char) continue
      for (const link of irgLinks(char, unihanSources[char])) {
        if (link.name.startsWith('IRG WS')) push(link.href)
      }
    }
  }
  return targets
}

/**
 * Collects per-(working set, source ref) keys and manual ORT page keys already present in an entry's
 * sightings (including hidden/removed sightings so removed evidence is never re-imported).
 */
export function existingOrtKeys(sightings: readonly Pick<Sighting, 'url' | 'note' | 'vias'>[]): {
  refs: Set<string>
  manualPages: Set<string>
} {
  const refs = new Set<string>()
  const manualPages = new Set<string>()
  for (const sighting of sightings) {
    let hasStructuredRef = false
    if (sighting.note) {
      // Matches both scoped (`IRG source: ws2021 GZ-0381601`) and legacy (`IRG source: GZ-0381601`) notes.
      const scoped = /^IRG source:\s*(ws(?:2015|2017|2021|2024))\s+(\S+)/im.exec(sighting.note)
      if (scoped) {
        refs.add(`${scoped[1].toLowerCase()}:ref:${scoped[2].toUpperCase()}`)
        hasStructuredRef = true
      } else {
        const bare = /^IRG source:\s*(\S+)/im.exec(sighting.note)
        if (bare) {
          refs.add(`*:ref:${bare[1].toUpperCase()}`)
          hasStructuredRef = true
        }
      }
    }
    // Only treat a sighting's ORT URL as a whole-page manual citation when it did not come from a
    // per-source automated import, so a partially capped multi-source page can still import its
    // remaining sources on a later run.
    if (!hasStructuredRef) {
      const inspectUrl = (raw: string | null | undefined) => {
        if (!raw) return
        const parsed = parseOrtUrl(raw)
        if (parsed) manualPages.add(parsed.queryKey)
      }
      inspectUrl(sighting.url)
      for (const via of sighting.vias) inspectUrl(via.url)
    }
  }
  return { refs, manualPages }
}

async function fetchOrtHtml(url: string, fetcher: OrtFetch): Promise<string | null> {
  const parsed = parseOrtUrl(url)
  if (!parsed) return null
  let response: Response
  try {
    response = await fetcher(parsed.url, {
      headers: { accept: 'text/html', 'user-agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {})
    return null
  }
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType && !contentType.includes('text/html')) {
    await response.body.cancel().catch(() => {})
    return null
  }
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_ORT_HTML) {
    await response.body.cancel().catch(() => {})
    return null
  }
  try {
    const body = await boundedBody(response.body, MAX_ORT_HTML)
    return body ? await body.text() : null
  } catch {
    return null
  }
}

/**
 * Syncs bibliographic evidence citations from IRG Working Set ORT pages onto one record.
 * Existing sightings (including contributor-removed ones) are never duplicated or restored.
 */
export async function syncOrtEntry(
  db: D1Database,
  entryId: number,
  options: {
    unihanSources?: Record<string, readonly string[]>
    fetcher?: OrtFetch
    maxPerEntry?: number
    dryRun?: boolean
    now?: () => number
  } = {},
): Promise<OrtSyncResult> {
  const found = await getEntry(db, entryId)
  if (!found || found.entry.hidden_at || found.entry.merged_into) {
    return { entryId, targets: 0, added: 0, skipped: 0, refs: [] }
  }
  const targets = ortTargetsForClaims(found.claims, options.unihanSources)
  if (!targets.length) return { entryId, targets: 0, added: 0, skipped: 0, refs: [] }

  const existing = existingOrtKeys(found.sightings)
  const cap = Math.min(options.maxPerEntry ?? IRG_ORT_SIGHTINGS_MAX, Math.max(0, SIGHTINGS_MAX - found.sightings.length))
  if (cap <= 0) return { entryId, targets: targets.length, added: 0, skipped: targets.length, refs: [] }

  const fetcher: OrtFetch = options.fetcher ?? fetch
  let actor: string | null = null
  let added = 0
  let skipped = 0
  const refs: string[] = []

  for (const target of targets) {
    if (added >= cap) break
    if (existing.manualPages.has(target.key)) { skipped++; continue }
    const html = await fetchOrtHtml(target.url, fetcher)
    if (!html) { skipped++; continue }
    const record = parseOrtPage(html, target.ws, target.url)
    if (!record) { skipped++; continue }

    const serialKey = record.serial ? `${record.ws}:id:${record.serial}` : null
    if (serialKey && existing.manualPages.has(serialKey)) { skipped++; continue }

    for (const source of record.sources) {
      if (added >= cap) break
      const upperRef = source.sourceRef.toUpperCase()
      const scopedRefKey = `${record.ws}:ref:${upperRef}`
      if (existing.refs.has(scopedRefKey) || existing.refs.has(`*:ref:${upperRef}`)) {
        skipped++
        continue
      }

      if (!options.dryRun) {
        actor ??= await ensureIrgOrtActor(db, options.now)
        const fields = mapOrtSourceToSighting(record, source)
        try {
          await addSighting(db, entryId, fields, [], { actor, ip: null })
        } catch (err) {
          if (err instanceof SightingLimitError) {
            return { entryId, targets: targets.length, added, skipped, refs }
          }
          throw err
        }
      }
      existing.refs.add(scopedRefKey)
      added++
      refs.push(source.sourceRef)
    }
  }

  return { entryId, targets: targets.length, added, skipped, refs }
}
