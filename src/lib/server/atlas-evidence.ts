// Automatic import of reviewed Glyph Atlas crops as materialized sightings on Rare Character
// Compendium records. Runs non-blocking after record create/edit, on the Worker cron schedule,
// and via the backfill CLI (`scripts/sync-atlas-evidence.ts`).
import { isDescription } from 'ids-input'
import type { RequestEvent } from '@sveltejs/kit'
import { encodingsOf, valuesOf, type Claim } from '$lib/claims'
import { dateText } from '$lib/dates'
import { cleanIds, encodedCharacter } from '$lib/ids'
import { cleanSourceUrl } from '$lib/source-url'
import { CONTEXTS, SIGHTING_TYPES, storeChosen, STYLES, VIAS_MAX, type Context } from '$lib/scripts'
import { boundedBody } from './body-limit'
import { addSighting, getEntry, readBoxes, removeSighting, SIGHTINGS_MAX, SightingLimitError, type Sighting, type SightingFields, type StoredImage, type Via } from './entries'
import { MAX_IMAGE, MAX_THUMB, prepareImage, storeImage } from './image'
import { notifyIndexNow } from './indexnow'

/** Fixed 12-hex person id (matching `PERSON_ID`) used for automatically synced Glyph Atlas evidence. */
export const ATLAS_ACTOR_ID = '00000000a71a'
export const ATLAS_ACTOR_NAME = 'Glyph Atlas'
export const DEFAULT_ATLAS_ORIGIN = 'https://glyphatlas.org'

/** Default maximum number of Glyph Atlas sightings automatically added per RCC entry (1 per book). */
export const ATLAS_SIGHTINGS_MAX = 10
/** Default number of RCC entries visited per scheduled cron run. */
export const CRON_BATCH_SIZE = 10
/** Minimum interval before an already-synced entry is re-checked by the scheduled pass. */
export const CRON_RESYNC_MS = 24 * 60 * 60 * 1000
/** Lease duration for a pending `sighting_id IS NULL` reservation before an interrupted run expires. */
export const RESERVATION_TTL_MS = 5 * 60 * 1000
/** Soft wall-clock budget for post-response `waitUntil` syncs (Workers cap post-response work at 30s). */
export const WAIT_UNTIL_BUDGET_MS = 20_000

const LIST_LIMIT = 100
const MAX_LIST_PAGES = 5
const REQUEST_TIMEOUT_MS = 15_000
const REDIRECTS_MAX = 2
const BASE_BACKOFF_MS = 15 * 60 * 1000

export type AtlasSyncEnv = {
  DB: D1Database
  MEDIA: R2Bucket
  ATLAS?: Fetcher
  ATLAS_ORIGIN?: string
  ATLAS_RATE_LIMIT_PASS?: string
  WRITES_PAUSED?: string
  INDEXNOW_KEY?: string
}

export type LookupKey = { kind: 'ids' | 'unicode'; text: string; codePoint: string }

export type AtlasDateAxis = {
  text?: string | null
  label?: string | null
  start?: number | null
  end?: number | null
}

export type AtlasDating = {
  witness?: AtlasDateAxis | null
  composed?: AtlasDateAxis | null
}

export type AtlasSourceObject = {
  title?: string | null
  document_id?: string | null
  author?: string | null
  holder?: string | null
  publisher?: string | null
  shelfmark?: string | null
  page?: number | string | null
  record_url?: string | null
}

export type AtlasListingItem = {
  id: string
  origin?: string | null
  state?: string | null
  withheld?: boolean | null
  document?: string | null
  source?: string | AtlasSourceObject | null
  year?: number | null
  style?: string | null
  label?: string | null
  written_character?: string | null
  dating?: AtlasDating | null
  image?: string | null
}

export type AtlasBox = { x: number; y: number; w: number; h: number }

export type AtlasCropDetail = AtlasListingItem & {
  production?: string | null
  author?: string | null
  publisher?: string | null
  holder?: string | null
  shelfmark?: string | null
  page_number?: number | null
  licence?: string | null
  attribution?: string | null
  rights_url?: string | null
  record_url?: string | null
  honkoku_url?: string | null
  context_image?: string | null
  context_box?: AtlasBox | null
  crop_box?: AtlasBox | null
  context?: boolean | null
  proxyable?: boolean | null
}

/** Raised when Glyph Atlas is unreachable, rate-limiting or temporarily unavailable. */
export class AtlasTransientError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AtlasTransientError'
    this.status = status
  }
}

export type AtlasClient = {
  origin: string
  listCheckedCrops(codePoint: string, options?: { maxPages?: number }): Promise<AtlasListingItem[]>
  getCrop(cropId: string): Promise<AtlasCropDetail | null>
  fetchImage(pathOrUrl: string, limit: number): Promise<Uint8Array | null>
}

export type SyncEntryOptions = {
  client?: AtlasClient
  maxPerEntry?: number
  resyncAfterMs?: number
  revalidate?: boolean
  budgetMs?: number
  dryRun?: boolean
  now?: () => number
}

export type SyncEntryResult = {
  entryId: number
  status: 'synced' | 'skipped' | 'no_keys' | 'capped'
  added: number
  removed: number
  skipped: number
  sightingIds: number[]
  cropIds: string[]
}

export type SyncBatchOptions = SyncEntryOptions & {
  limit?: number
  force?: boolean
  entryId?: number
}

export type SyncBatchResult = {
  processed: number
  added: number
  removed: number
  errors: { entryId: number; message: string }[]
  results: SyncEntryResult[]
}

// ---------- Lookup keys ----------

/** Format a character or IDS sequence as Glyph Atlas's hyphen-separated `U+XXXX` code point slug. */
export function toCodePointSlug(text: string): string {
  return [...text].map(char => 'U+' + char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join('-')
}

/** Extract deduplicated Glyph Atlas lookup keys (IDS descriptions and Unicode code points) from an entry's claims. */
export function lookupKeysOf(claims: readonly Claim[]): LookupKey[] {
  const keys: LookupKey[] = []
  const seen = new Set<string>()
  const add = (kind: LookupKey['kind'], text: string) => {
    if (!text) return
    const codePoint = toCodePointSlug(text)
    if (seen.has(codePoint)) return
    seen.add(codePoint)
    keys.push({ kind, text, codePoint })
  }
  for (const raw of valuesOf(claims, 'ids')) {
    const cleaned = cleanIds(raw)
    if (cleaned && isDescription(cleaned)) add('ids', cleaned)
  }
  for (const encoding of encodingsOf(claims)) {
    if (encoding.charset !== 'unicode') continue
    const char = encodedCharacter(encoding.code)
    if (char) add('unicode', char)
  }
  return keys
}

export function queryKeyOf(keys: readonly LookupKey[]): string {
  return [...keys].map(key => key.codePoint).sort().join('|')
}

// ---------- Glyph Atlas client ----------

function normalizeOrigin(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_ATLAS_ORIGIN).trim().replace(/\/+$/, '')
  const url = new URL(value)
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Invalid Glyph Atlas origin: ${raw}`)
  return url.origin
}

/** Encode a crop id the same way Glyph Atlas's `citation.ts` (`idPath`) writes it in URLs. */
export const cropPathSegment = (id: string) => encodeURIComponent(id).replace(/%3A/gi, ':').replace(/%40/gi, '@')

export const cropPageUrl = (origin: string, cropId: string) => `${normalizeOrigin(origin)}/crop/${cropPathSegment(cropId)}`

export function createAtlasClient(options: {
  origin?: string
  service?: Fetcher
  pass?: string
  fetch?: typeof fetch
} = {}): AtlasClient {
  const origin = normalizeOrigin(options.origin)
  const fetchFn = options.fetch ?? globalThis.fetch
  const headersFor = (accept: string): HeadersInit => ({
    accept,
    ...(options.pass ? { 'x-rate-limit-pass': options.pass } : {}),
  })

  async function request(url: URL, accept: string): Promise<Response> {
    const init: RequestInit = { headers: headersFor(accept), redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    if (options.service) {
      try {
        return await options.service.fetch(new Request(url.href, init))
      } catch (cause) {
        // Local `wrangler dev` rejects when a declared service binding is not running alongside.
        if (cause instanceof Error && /local dev|not running/i.test(cause.message)) return await fetchFn(url, init)
        throw new AtlasTransientError(`Glyph Atlas service request failed: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    try {
      return await fetchFn(url, init)
    } catch (cause) {
      throw new AtlasTransientError(`Glyph Atlas request failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  async function requestJson(path: string): Promise<{ status: number; data: unknown } | null> {
    let url = new URL(path, origin)
    for (let hop = 0; ; hop++) {
      const response = await request(url, 'application/json')
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        void response.body?.cancel().catch(() => {})
        if (!location || hop >= REDIRECTS_MAX) throw new AtlasTransientError(`Glyph Atlas redirect failed (${response.status})`, response.status)
        const next = new URL(location, url)
        if (next.origin !== origin) throw new AtlasTransientError('Glyph Atlas redirected off-origin', response.status)
        url = next
        continue
      }
      if (response.status === 404) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      if (response.status === 429 || response.status >= 500) {
        void response.body?.cancel().catch(() => {})
        throw new AtlasTransientError(`Glyph Atlas returned ${response.status} for ${url.pathname}`, response.status)
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      try {
        return { status: response.status, data: await response.json() }
      } catch {
        throw new AtlasTransientError(`Invalid JSON from Glyph Atlas at ${url.pathname}`, response.status)
      }
    }
  }

  async function listEndpoint(basePath: string, maxPages: number): Promise<AtlasListingItem[]> {
    const collected: AtlasListingItem[] = []
    let cursor: string | null = null
    for (let page = 0; page < maxPages; page++) {
      const path = cursor ? `${basePath}&after=${encodeURIComponent(cursor)}` : basePath
      const res = await requestJson(path)
      if (!res?.data || typeof res.data !== 'object') break
      const payload = res.data as { items?: unknown; next?: unknown }
      if (!Array.isArray(payload.items) || !payload.items.length) break
      for (const item of payload.items as AtlasListingItem[]) {
        if (item && typeof item.id === 'string' && item.id.length > 0 && item.state === 'checked' && !item.withheld) {
          collected.push(item)
        }
      }
      const next = typeof payload.next === 'string' && payload.next ? payload.next : null
      if (!next || next === cursor) break
      cursor = next
    }
    return collected
  }

  return {
    origin,
    async listCheckedCrops(codePoint: string, opts?: { maxPages?: number }): Promise<AtlasListingItem[]> {
      const encoded = encodeURIComponent(codePoint)
      const maxPages = Math.max(1, Math.min(opts?.maxPages ?? MAX_LIST_PAGES, 10))
      const [occ, cand] = await Promise.all([
        listEndpoint(`/layers/occurrences?code_point=${encoded}&state=checked&order=year&limit=${LIST_LIMIT}&scope=character`, maxPages),
        listEndpoint(`/layers/candidates?code_point=${encoded}&order=year&limit=${LIST_LIMIT}&scope=character`, maxPages),
      ])
      return [...occ, ...cand]
    },
    async getCrop(cropId: string): Promise<AtlasCropDetail | null> {
      const found = await requestJson(`/atlas/characters/${cropPathSegment(cropId)}`)
      if (!found?.data || typeof found.data !== 'object') return null
      return found.data as AtlasCropDetail
    },
    async fetchImage(pathOrUrl: string, limit: number): Promise<Uint8Array | null> {
      let url: URL
      try { url = new URL(pathOrUrl, origin) } catch { return null }
      // Only fetch images hosted by Glyph Atlas's own media route to prevent arbitrary external fetches.
      if (url.origin !== origin || !url.pathname.startsWith('/atlas/media/')) return null
      const response = await request(url, 'image/webp, image/png, image/jpeg')
      if (response.status === 404 || response.status === 410) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      if (response.status === 429 || response.status >= 500) {
        void response.body?.cancel().catch(() => {})
        throw new AtlasTransientError(`Glyph Atlas image returned ${response.status} for ${url.pathname}`, response.status)
      }
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > limit) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      try {
        const body = await boundedBody(response.body, limit)
        return body ? new Uint8Array(await body.arrayBuffer()) : null
      } catch (cause) {
        throw new AtlasTransientError(`Glyph Atlas image stream failed: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    },
  }
}

// ---------- Candidate selection & deduplication ----------

const clean = (raw: unknown, max: number): string | null => {
  if (typeof raw !== 'string') return null
  const value = raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
  return value ? value.slice(0, max) : null
}

/** Stable identifier for the book a Glyph Atlas crop comes from, used for 1-crop-per-book deduplication. */
export function bookKeyOf(item: Pick<AtlasListingItem, 'id' | 'document' | 'source'>): string {
  if (typeof item.document === 'string' && item.document.trim()) return `doc:${item.document.trim()}`
  if (item.source && typeof item.source === 'object') {
    if (typeof item.source.document_id === 'string' && item.source.document_id.trim()) return `doc:${item.source.document_id.trim()}`
    if (typeof item.source.title === 'string' && item.source.title.trim()) return `title:${item.source.title.trim()}`
  }
  if (typeof item.source === 'string' && item.source.trim()) return `title:${item.source.trim()}`
  return `crop:${item.id}`
}

function itemYear(item: Pick<AtlasListingItem, 'year' | 'dating'>): number | null {
  if (typeof item.year === 'number' && Number.isFinite(item.year)) return item.year
  const axis = item.dating?.witness ?? item.dating?.composed
  const candidate = axis?.start ?? axis?.end
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

/** Choose up to `limit` reviewed, non-withheld crops, deduplicated by crop id and book, earliest-dated first. */
export function selectCandidates(
  items: readonly AtlasListingItem[],
  options: { existingCrops: ReadonlySet<string>; existingBooks: ReadonlySet<string>; limit: number },
): AtlasListingItem[] {
  if (options.limit <= 0) return []
  const byId = new Map<string, AtlasListingItem>()
  for (const item of items) {
    if (!item.id || item.state !== 'checked' || item.withheld) continue
    if (options.existingCrops.has(item.id)) continue
    const prior = byId.get(item.id)
    // Prefer local collected metadata if the same crop id appears twice.
    if (!prior || (prior.origin !== 'local' && item.origin === 'local')) byId.set(item.id, item)
  }
  const sorted = [...byId.values()].sort((a, b) => {
    const ya = itemYear(a), yb = itemYear(b)
    const aDated = ya !== null, bDated = yb !== null
    if (aDated !== bDated) return aDated ? -1 : 1
    if (aDated && bDated && ya !== yb) return ya - yb
    const aLocal = a.origin === 'local' ? 0 : 1
    const bLocal = b.origin === 'local' ? 0 : 1
    if (aLocal !== bLocal) return aLocal - bLocal
    return a.id.localeCompare(b.id)
  })
  const chosen: AtlasListingItem[] = []
  const seenBooks = new Set(options.existingBooks)
  for (const item of sorted) {
    const book = bookKeyOf(item)
    if (seenBooks.has(book)) continue
    seenBooks.add(book)
    chosen.push(item)
    if (chosen.length >= options.limit) break
  }
  return chosen
}

/** Recognise Glyph Atlas crop ids already cited manually in an entry's existing sightings. */
export function existingAtlasCropIds(sightings: readonly Pick<Sighting, 'url' | 'vias'>[], origin = DEFAULT_ATLAS_ORIGIN): Set<string> {
  const host = new URL(normalizeOrigin(origin)).host.toLowerCase()
  const ids = new Set<string>()
  const inspect = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return
    let parsed: URL
    try { parsed = new URL(rawUrl) } catch { return }
    if (parsed.host.toLowerCase() !== host) return
    const match = /^\/(?:[a-zA-Z-]+\/)?crop\/([^/?#]+)$/.exec(parsed.pathname)
    if (!match) return
    try { ids.add(decodeURIComponent(match[1])) } catch { ids.add(match[1]) }
  }
  for (const sighting of sightings) {
    inspect(sighting.url)
    for (const via of sighting.vias) inspect(via.url)
  }
  return ids
}

// ---------- Field & media mapping ----------

/** Whether a crop's image licence allows copying into RCC's CC BY-SA 4.0 media bucket. */
export function isOpenImageLicence(licence: string | null | undefined): boolean {
  if (!licence) return false
  const value = licence.trim().toLowerCase()
  if (!value || value === 'unknown' || value === 'restricted' || value === 'none stated') return false
  if (/(?:^|[-/\s])(nc|nd)(?:[-/\s]|$)/.test(value)) return false
  // Note: RS-NOC-CR ("No Copyright - Contractual Restrictions") is intentionally excluded.
  if (/^(?:cc0(?:-1\.0)?|pd|pdm(?:-1\.0)?|kogl-1|mit|apache-2\.0|unicode-3\.0|bespoke-free)$/.test(value)) return true
  if (/^cc-by(?:-(?:sa-)?\d+(?:\.\d+)?(?:-[a-z]{2})?)?$/.test(value)) return true
  if (/creativecommons\.org\/publicdomain\/(?:mark|zero)\//.test(value)) return true
  if (/creativecommons\.org\/licenses\/by(?:-sa)?\//.test(value)) return true
  return false
}

export function mapStyle(style: string | null | undefined): (typeof STYLES)[number] | null {
  switch (style?.trim().toLowerCase()) {
    case 'regular':
    case 'ming':
    case 'gothic': return 'regular'
    case 'running':
    case 'cursive': return 'semi_cursive'
    case 'seal': return 'seal'
    case 'clerical': return 'clerical'
    case 'mixed': return 'other'
    default: return null
  }
}

export function mapContexts(crop: Pick<AtlasCropDetail, 'production'>): string | null {
  const production = crop.production?.toLowerCase() ?? ''
  const chosen = new Set<Context>(production.includes('manuscript') || production.includes('hand') ? ['handwriting'] : ['running_text'])
  return storeChosen(CONTEXTS, chosen)
}

/** Project Glyph Atlas's `crop_box` inside `context_box` onto the actual `context_image` pixel dimensions. */
export function computeBox(crop: Pick<AtlasCropDetail, 'context_box' | 'crop_box'>, width: number, height: number): string | null {
  const c = crop.context_box, b = crop.crop_box
  if (!c || !b || !(c.w > 0) || !(c.h > 0) || !(b.w > 0) || !(b.h > 0)) return null
  const x = Math.round(((b.x - c.x) / c.w) * width)
  const y = Math.round(((b.y - c.y) / c.h) * height)
  const w = Math.round((b.w / c.w) * width)
  const h = Math.round((b.h / c.h) * height)
  return readBoxes(JSON.stringify([[x, y, w, h]]), width, height)
}

function cleanHttpUrl(raw: unknown): string | null {
  const value = clean(raw, 1000)
  return value && /^https?:\/\//i.test(value) ? cleanSourceUrl(value) : null
}

function datingText(crop: Pick<AtlasCropDetail, 'dating' | 'year'>): string | null {
  const witness = crop.dating?.witness
  const composed = crop.dating?.composed
  const raw = witness?.text ?? witness?.label ?? composed?.text ?? composed?.label ?? (typeof crop.year === 'number' && Number.isFinite(crop.year) ? String(crop.year) : null)
  return dateText(raw)
}

/** Map a Glyph Atlas crop detail record into RCC's `SightingFields` with original book citation and Glyph Atlas `via`. */
export function mapCropToSighting(crop: AtlasCropDetail, atlasOrigin = DEFAULT_ATLAS_ORIGIN): SightingFields {
  const sourceObj: AtlasSourceObject = crop.source && typeof crop.source === 'object' ? crop.source : {}
  const title = clean(typeof crop.source === 'string' ? crop.source : sourceObj.title, 300)
  const author = clean(crop.author ?? sourceObj.author, 300)
  const holder = clean(crop.holder ?? sourceObj.holder, 300)
  const publisher = clean(crop.publisher ?? sourceObj.publisher ?? holder, 300)
  const shelfmark = clean(crop.shelfmark ?? sourceObj.shelfmark, 200)
  const pageNum = typeof crop.page_number === 'number' && Number.isInteger(crop.page_number) && crop.page_number > 0
    ? String(crop.page_number)
    : clean(sourceObj.page != null ? String(sourceObj.page) : null, 80)
  const recordUrl = cleanHttpUrl(crop.record_url ?? sourceObj.record_url)
  const honkokuUrl = cleanHttpUrl(crop.honkoku_url)
  const directUrl = recordUrl ?? honkokuUrl
  const originalDate = datingText(crop)

  const placeParts = [title, pageNum ? `p. ${pageNum}` : null, holder].filter((part): part is string => Boolean(part))
  const place = (placeParts.join(', ') || 'Glyph Atlas').slice(0, 500)

  const vias: Via[] = []
  if (honkokuUrl && recordUrl && honkokuUrl !== recordUrl) {
    let container: string | null = null
    try {
      const host = new URL(honkokuUrl).hostname.toLowerCase()
      if (host === 'honkoku.org' || host.endsWith('.honkoku.org')) container = 'みんなで翻刻'
    } catch { /* ignore */ }
    vias.push({
      url: honkokuUrl,
      title,
      author: null,
      publisher: null,
      report_date: null,
      container,
      source_kind: null,
      quote: null,
    })
  }

  const label = clean(crop.written_character ?? crop.label, 80)
  vias.push({
    url: cleanSourceUrl(cropPageUrl(atlasOrigin, crop.id)),
    title: label ? `${label} — Glyph Atlas` : `Glyph Atlas (${crop.id})`,
    author: null,
    publisher: 'Glyph Atlas',
    report_date: null,
    container: 'Glyph Atlas',
    source_kind: null,
    quote: null,
  })

  const noteLines = [
    shelfmark && `Shelfmark: ${shelfmark}`,
    clean(crop.attribution, 300) && `Image: ${clean(crop.attribution, 300)}`,
    clean(crop.licence, 120) && crop.licence?.trim().toLowerCase() !== 'unknown' && `Licence: ${clean(crop.licence, 120)}`,
  ].filter((line): line is string => Boolean(line))

  return {
    place,
    url: directUrl,
    title,
    author,
    publisher,
    report_date: null,
    container: null,
    source_kind: null,
    vias: vias.slice(0, VIAS_MAX),
    original_date: originalDate,
    page: pageNum,
    contexts: mapContexts(crop),
    style: mapStyle(crop.style),
    types: storeChosen(SIGHTING_TYPES, new Set(['attestation'])),
    note: noteLines.length ? noteLines.join('\n').slice(0, 5000) : null,
    quotes: null,
  }
}

async function prepareCropMedia(client: AtlasClient, mediaBucket: R2Bucket, crop: AtlasCropDetail): Promise<StoredImage[]> {
  if (!isOpenImageLicence(crop.licence)) return []
  const wantContext = crop.context !== false && crop.proxyable !== false && Boolean(crop.context_image)
  const mainPath = wantContext ? crop.context_image! : crop.image
  if (!mainPath) return []
  const mainBytes = await client.fetchImage(mainPath, MAX_IMAGE)
  if (!mainBytes) return []
  const mainImage = await prepareImage(new File([mainBytes as BlobPart], 'atlas-evidence'), MAX_IMAGE)
  if (!mainImage) return []

  let thumbImage = mainImage
  let box: string | null = null
  if (wantContext) {
    box = computeBox(crop, mainImage.width, mainImage.height)
    if (crop.image && crop.image !== mainPath) {
      const thumbBytes = await client.fetchImage(crop.image, MAX_THUMB)
      if (thumbBytes) {
        const prepared = await prepareImage(new File([thumbBytes as BlobPart], 'atlas-thumb'), MAX_THUMB)
        if (prepared) thumbImage = prepared
      }
    }
  }

  await storeImage(mediaBucket, mainImage)
  if (thumbImage.key !== mainImage.key) await storeImage(mediaBucket, thumbImage)
  return [{
    image_key: mainImage.key,
    image_type: mainImage.type,
    image_w: mainImage.width,
    image_h: mainImage.height,
    thumb_key: thumbImage.key,
    box,
  }]
}

// ---------- Sync orchestration ----------

export async function ensureAtlasActor(db: D1Database, now = () => Date.now()): Promise<string> {
  await db.prepare('INSERT OR IGNORE INTO people(id, name, created_at) VALUES (?, ?, ?)')
    .bind(ATLAS_ACTOR_ID, ATLAS_ACTOR_NAME, new Date(now()).toISOString()).run()
  return ATLAS_ACTOR_ID
}

function backoffMs(failures: number): number {
  const power = Math.min(Math.max(failures - 1, 0), 7)
  return Math.min(BASE_BACKOFF_MS * (2 ** power), CRON_RESYNC_MS)
}

async function markSynced(db: D1Database, entryId: number, nowMs: number, resyncAfterMs: number, queryKey: string) {
  const at = new Date(nowMs).toISOString()
  const nextAt = new Date(nowMs + resyncAfterMs).toISOString()
  await db.prepare(
    `INSERT INTO atlas_sync_state(entry_id, next_sync_at, synced_at, query_key, failures)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(entry_id) DO UPDATE SET next_sync_at = excluded.next_sync_at, synced_at = excluded.synced_at, query_key = excluded.query_key, failures = 0`,
  ).bind(entryId, nextAt, at, queryKey).run()
}

async function markFailed(db: D1Database, entryId: number, nowMs: number) {
  const current = await db.prepare('SELECT failures FROM atlas_sync_state WHERE entry_id = ?').bind(entryId).first<{ failures: number }>()
  const failures = (current?.failures ?? 0) + 1
  const nextAt = new Date(nowMs + backoffMs(failures)).toISOString()
  await db.prepare(
    `INSERT INTO atlas_sync_state(entry_id, next_sync_at, synced_at, query_key, failures)
     VALUES (?, ?, NULL, '', ?)
     ON CONFLICT(entry_id) DO UPDATE SET next_sync_at = excluded.next_sync_at, failures = excluded.failures`,
  ).bind(entryId, nextAt, failures).run()
}

/** Sync reviewed Glyph Atlas crops onto a single RCC entry. Idempotent and safe under concurrent calls. */
export async function syncEntryFromAtlas(env: AtlasSyncEnv, entryId: number, options: SyncEntryOptions = {}): Promise<SyncEntryResult> {
  const now = options.now ?? Date.now
  const startedMs = now()
  const deadlineMs = options.budgetMs !== undefined ? startedMs + options.budgetMs : Infinity
  const overBudget = () => now() >= deadlineMs
  const resyncAfterMs = options.resyncAfterMs ?? CRON_RESYNC_MS
  const maxPerEntry = Math.max(1, Math.min(options.maxPerEntry ?? ATLAS_SIGHTINGS_MAX, SIGHTINGS_MAX))
  const found = await getEntry(env.DB, entryId)
  if (!found || found.entry.hidden_at || found.entry.merged_into) {
    return { entryId, status: 'skipped', added: 0, removed: 0, skipped: 0, sightingIds: [], cropIds: [] }
  }

  const keys = lookupKeysOf(found.claims)
  const queryKey = queryKeyOf(keys)
  const at = new Date(startedMs).toISOString()
  const staleLease = new Date(startedMs - RESERVATION_TTL_MS).toISOString()

  if (!keys.length) {
    if (!options.dryRun) await markSynced(env.DB, entryId, now(), resyncAfterMs, queryKey)
    return { entryId, status: 'no_keys', added: 0, removed: 0, skipped: 0, sightingIds: [], cropIds: [] }
  }

  const client = options.client ?? createAtlasClient({
    origin: env.ATLAS_ORIGIN,
    service: env.ATLAS,
    pass: env.ATLAS_RATE_LIMIT_PASS,
  })

  // Reclaim any expired pending reservations left behind by an interrupted worker before counting/selecting.
  if (!options.dryRun) {
    await env.DB.prepare('DELETE FROM atlas_sightings WHERE entry_id = ? AND sighting_id IS NULL AND synced_at < ?')
      .bind(entryId, staleLease).run()
  }

  // Read both direct rows on this entry and any rows attached to sightings that moved/merged here.
  const priorRows = (await env.DB.prepare(
    `SELECT a.crop_id, a.book_key, a.sighting_id, a.synced_at
     FROM atlas_sightings a
     WHERE (a.entry_id = ?1 OR a.sighting_id IN (SELECT id FROM sightings WHERE entry_id = ?1))
       AND (a.sighting_id IS NOT NULL OR a.synced_at >= ?2)`,
  ).bind(entryId, staleLease).all<{ crop_id: string; book_key: string; sighting_id: number | null; synced_at: string }>()).results

  // Revalidate previously imported live sightings so crops withdrawn, withheld, or unchecked upstream are removed.
  let removed = 0
  let hitBudget = false
  if (options.revalidate !== false && priorRows.length) {
    const liveById = new Map(found.sightings.filter(s => !s.hidden_at).map(s => [s.id, s]))
    for (const row of priorRows) {
      if (row.sighting_id === null) continue
      const live = liveById.get(row.sighting_id)
      if (!live) continue
      if (overBudget()) { hitBudget = true; break }
      const current = await client.getCrop(row.crop_id)
      if (!current || current.withheld || current.state !== 'checked') {
        if (!options.dryRun) {
          await ensureAtlasActor(env.DB, now)
          const outcome = await removeSighting(env.DB, entryId, live.id, live.rev, { actor: ATLAS_ACTOR_ID, ip: null }, 'Glyph Atlas crop no longer verified')
          if (outcome === 'done') removed++
        } else {
          removed++
        }
      }
    }
  }

  const existingCrops = new Set<string>([
    ...priorRows.map(row => row.crop_id),
    ...existingAtlasCropIds(found.sightings, client.origin),
  ])
  const existingBooks = new Set<string>(priorRows.map(row => row.book_key))
  const remaining = Math.min(maxPerEntry - priorRows.length, SIGHTINGS_MAX - found.sightings.length)
  if (remaining <= 0) {
    if (!options.dryRun && !hitBudget) await markSynced(env.DB, entryId, now(), resyncAfterMs, queryKey)
    return { entryId, status: 'capped', added: 0, removed, skipped: 0, sightingIds: [], cropIds: [] }
  }

  const listed: AtlasListingItem[] = []
  for (const key of keys) {
    if (overBudget()) { hitBudget = true; break }
    listed.push(...await client.listCheckedCrops(key.codePoint))
  }

  const chosen = selectCandidates(listed, { existingCrops, existingBooks, limit: remaining })
  const sightingIds: number[] = []
  const cropIds: string[] = []
  let skipped = 0

  if (chosen.length && !options.dryRun) await ensureAtlasActor(env.DB, now)

  for (const candidate of chosen) {
    if (overBudget()) { hitBudget = true; break }
    const detail = await client.getCrop(candidate.id)
    if (!detail || detail.state !== 'checked' || detail.withheld) {
      skipped++
      continue
    }
    const canonicalId = typeof detail.id === 'string' && detail.id ? detail.id : candidate.id
    if (existingCrops.has(canonicalId)) {
      skipped++
      continue
    }
    const bookKey = bookKeyOf(detail)
    if (existingBooks.has(bookKey)) {
      skipped++
      continue
    }
    const sightingFields = mapCropToSighting({ ...candidate, ...detail, id: canonicalId }, client.origin)

    if (options.dryRun) {
      existingCrops.add(canonicalId)
      existingBooks.add(bookKey)
      cropIds.push(canonicalId)
      continue
    }

    // Atomically enforce unique (entry, crop), unique (entry, book), and maxPerEntry cap in D1.
    const claimed = (await env.DB.prepare(
      `INSERT OR IGNORE INTO atlas_sightings(entry_id, crop_id, book_key, sighting_id, synced_at)
       SELECT ?1, ?2, ?3, NULL, ?4
       WHERE (SELECT COUNT(*) FROM atlas_sightings WHERE entry_id = ?1 AND (sighting_id IS NOT NULL OR synced_at >= ?5)) < ?6
       RETURNING crop_id`,
    ).bind(entryId, canonicalId, bookKey, at, staleLease, maxPerEntry).all<{ crop_id: string }>()).results
    if (!claimed.length) {
      skipped++
      continue
    }

    try {
      const media = await prepareCropMedia(client, env.MEDIA, { ...candidate, ...detail, id: canonicalId })
      const sightingId = await addSighting(env.DB, entryId, sightingFields, media, { actor: ATLAS_ACTOR_ID, ip: null })
      if (sightingId === null) {
        await env.DB.prepare('DELETE FROM atlas_sightings WHERE entry_id = ? AND crop_id = ? AND sighting_id IS NULL').bind(entryId, canonicalId).run()
        skipped++
        continue
      }
      await env.DB.prepare('UPDATE atlas_sightings SET sighting_id = ? WHERE entry_id = ? AND crop_id = ?').bind(sightingId, entryId, canonicalId).run()
      existingCrops.add(canonicalId)
      existingBooks.add(bookKey)
      sightingIds.push(sightingId)
      cropIds.push(canonicalId)
    } catch (cause) {
      await env.DB.prepare('DELETE FROM atlas_sightings WHERE entry_id = ? AND crop_id = ? AND sighting_id IS NULL').bind(entryId, canonicalId).run()
      if (cause instanceof SightingLimitError) break
      throw cause
    }
  }

  if (!options.dryRun && !hitBudget) {
    await markSynced(env.DB, entryId, now(), resyncAfterMs, queryKey)
  }

  return { entryId, status: 'synced', added: cropIds.length, removed, skipped, sightingIds, cropIds }
}

/**
 * Select the next bounded batch of visible, unmerged entries due for a Glyph Atlas sync.
 * Reads only a covering range of `atlas_sync_state_by_due` (never-synced rows first, then due rows).
 */
export async function nextEntriesToSync(db: D1Database, options: { limit: number; nowIso: string; force?: boolean }): Promise<number[]> {
  if (options.limit <= 0) return []
  const statement = options.force
    ? db.prepare('SELECT entry_id AS id FROM atlas_sync_state ORDER BY next_sync_at ASC, entry_id ASC LIMIT ?').bind(options.limit)
    : db.prepare('SELECT entry_id AS id FROM atlas_sync_state WHERE next_sync_at <= ? ORDER BY next_sync_at ASC, entry_id ASC LIMIT ?').bind(options.nowIso, options.limit)
  return (await statement.all<{ id: number }>()).results.map(row => row.id)
}

/** Sync a bounded batch of RCC entries (used by the periodic cron trigger and backfill endpoint/CLI). */
export async function syncAtlasBatch(env: AtlasSyncEnv, options: SyncBatchOptions = {}): Promise<SyncBatchResult> {
  if (env.WRITES_PAUSED === '1' && !options.dryRun) {
    return { processed: 0, added: 0, removed: 0, errors: [], results: [] }
  }
  const now = options.now ?? Date.now
  const limit = Math.max(1, Math.min(options.limit ?? CRON_BATCH_SIZE, 100))
  const nowIso = new Date(now()).toISOString()

  const entryIds = options.entryId !== undefined
    ? [options.entryId]
    : await nextEntriesToSync(env.DB, { limit, nowIso, force: options.force })

  const results: SyncEntryResult[] = []
  const errors: { entryId: number; message: string }[] = []
  let added = 0
  let removed = 0

  for (const id of entryIds) {
    try {
      const result = await syncEntryFromAtlas(env, id, options)
      results.push(result)
      added += result.added
      removed += result.removed
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      console.error('Glyph Atlas evidence sync failed', { entryId: id, message })
      if (!options.dryRun) await markFailed(env.DB, id, now()).catch(() => {})
      errors.push({ entryId: id, message })
    }
  }

  return { processed: results.length, added, removed, errors, results }
}

/** Check whether an entry's Glyph Atlas lookup keys changed since its last completed sync. */
export async function entryNeedsAtlasSync(db: D1Database, entryId: number, claims: readonly Claim[]): Promise<boolean> {
  const keys = lookupKeysOf(claims)
  if (!keys.length) return false
  const row = await db.prepare('SELECT synced_at, query_key FROM atlas_sync_state WHERE entry_id = ?').bind(entryId).first<{ synced_at: string | null; query_key: string }>()
  return !row || row.synced_at === null || row.query_key !== queryKeyOf(keys)
}

/**
 * Queue a non-blocking Glyph Atlas evidence sync after a record write, mirroring `notifyIndexNow`.
 * Does nothing unless `platform.ctx`, `DB`, `MEDIA`, and either `ATLAS` or `ATLAS_ORIGIN` are present.
 */
export function scheduleAtlasSync(
  event: Pick<RequestEvent, 'platform'>,
  entryIds: readonly number[],
  options: { onlyIfChanged?: boolean } = {},
) {
  const platform = event.platform
  const bindings = platform?.env
  if (!platform?.ctx || !bindings?.DB || !bindings?.MEDIA || bindings.WRITES_PAUSED === '1') return
  if (!bindings.ATLAS && !bindings.ATLAS_ORIGIN) return
  const unique = [...new Set(entryIds)].filter(id => Number.isInteger(id) && id > 0)
  if (!unique.length) return

  platform.ctx.waitUntil((async () => {
    const started = Date.now()
    const updated: number[] = []
    for (const id of unique) {
      const remainingMs = WAIT_UNTIL_BUDGET_MS - (Date.now() - started)
      if (remainingMs <= 1000) break
      try {
        if (options.onlyIfChanged) {
          const found = await getEntry(bindings.DB, id)
          if (!found || !(await entryNeedsAtlasSync(bindings.DB, id, found.claims))) continue
        }
        const result = await syncEntryFromAtlas(bindings, id, { budgetMs: remainingMs })
        if (result.added > 0 || result.removed > 0) updated.push(id)
      } catch (cause) {
        console.error('Background Glyph Atlas evidence sync failed', { entryId: id, cause })
        await markFailed(bindings.DB, id, Date.now()).catch(() => {})
      }
    }
    if (updated.length) notifyIndexNow({ platform }, { entries: updated })
  })())
}
