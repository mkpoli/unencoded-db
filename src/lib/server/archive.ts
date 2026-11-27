import type { RequestEvent } from '@sveltejs/kit'
import { ARCHIVES_MAX, archiveUrl } from '$lib/source-archives'
import { citationHash, tidyVias, type Citation, type SightingFields } from './entries'
import { notifyIndexNow } from './indexnow'
import { editSourceArchive, sourceArchives } from './source-archives'

// A cited web page is copied to the Wayback Machine after the write that cites it, and the copy joins the
// source's archived copies under the catalogue's maintenance account.

/** Fixed 12-hex person id (matching `PERSON_ID`) of the catalogue's own maintenance, which adds copies. */
export const ARCHIVER_ID = '00000000a4c1'
export const ARCHIVER_NAME = 'Catalogue maintenance'
const WAYBACK = 'https://web.archive.org/'

const ARCHIVE_HOSTS = new Set([
  'web.archive.org',
  'archive.today',
  'archive.ph',
  'archive.is',
  'archive.md',
  'archive.vn',
  'perma.cc',
  'megalodon.jp',
])

const AVAILABLE_TIMEOUT_MS = 5_000
const SAVE_TIMEOUT_MS = 10_000
// Copies asked for after one write. They run side by side, so the work stays inside `waitUntil`'s 30 s.
const MAX_BACKGROUND_ARCHIVE = 5
// Citations one write may name: a batch shares one, a record with several sightings and vias names more.
const MAX_CITED = 50

/** Whether the address already points to a known web archive service. */
export function isAlreadyArchived(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  for (const archive of ARCHIVE_HOSTS) {
    if (host === archive || host.endsWith(`.${archive}`)) return true
  }
  return false
}

function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

function parseIpv6(raw: string): number[] | null {
  let ip = raw.toLowerCase()
  const zone = ip.indexOf('%')
  if (zone !== -1) ip = ip.slice(0, zone)

  // Convert an embedded dotted-quad IPv4 suffix (e.g. ::ffff:127.0.0.1 or ::127.0.0.1) to two 16-bit groups.
  let tail: number[] = []
  const lastColon = ip.lastIndexOf(':')
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.slice(lastColon + 1))
    if (!ipv4) return null
    const octets = ipv4.slice(1).map(Number)
    if (octets.some(o => o > 255)) return null
    tail = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]]
    ip = ip.slice(0, lastColon)
    if (ip === ':') ip = '::'
  }

  const sides = ip.split('::')
  if (sides.length > 2) return null
  const parsePart = (part: string): number[] | null => {
    if (!part) return []
    const items = part.split(':')
    const out: number[] = []
    for (const item of items) {
      if (!/^[0-9a-f]{1,4}$/.test(item)) return null
      out.push(Number.parseInt(item, 16))
    }
    return out
  }

  const left = parsePart(sides[0])
  const right = sides.length === 2 ? parsePart(sides[1]) : []
  if (!left || !right) return null
  const rightAll = [...right, ...tail]

  if (sides.length === 1) {
    const all = [...left, ...tail]
    return all.length === 8 ? all : null
  }
  const missing = 8 - (left.length + rightAll.length)
  if (missing < 1) return null
  return [...left, ...new Array<number>(missing).fill(0), ...rightAll]
}

function isPrivateIpv6(ip: string): boolean {
  const h = parseIpv6(ip)
  if (!h) return true
  const allZeroPrefix = (n: number) => h.slice(0, n).every(x => x === 0)

  // Unspecified (::), loopback (::1), and deprecated IPv4-compatible (::/96).
  if (allZeroPrefix(6)) return true
  // IPv4-mapped (::ffff:0:0/96) and IPv4-translated (::ffff:0:0:0/96).
  if (allZeroPrefix(5) && h[5] === 0xffff) return isPrivateIpv4((h[6] >> 8) & 0xff, h[6] & 0xff, (h[7] >> 8) & 0xff)
  if (allZeroPrefix(4) && h[4] === 0xffff && h[5] === 0) return isPrivateIpv4((h[6] >> 8) & 0xff, h[6] & 0xff, (h[7] >> 8) & 0xff)
  // NAT64 well-known (64:ff9b::/96) and local-use (64:ff9b:1::/48).
  if (h[0] === 0x0064 && h[1] === 0xff9b && ((h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) || h[2] === 0x0001)) return true
  // Discard-only (100::/64).
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true
  // Unique local (fc00::/7), link-local (fe80::/10), site-local (fec0::/10), multicast (ff00::/8).
  if ((h[0] & 0xfe00) === 0xfc00) return true
  if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true
  if ((h[0] & 0xff00) === 0xff00) return true
  // Documentation (2001:db8::/32), Teredo (2001::/32), benchmarking (2001:2::/48).
  if (h[0] === 0x2001 && (h[1] === 0x0db8 || h[1] === 0x0000 || (h[1] === 0x0002 && h[2] === 0x0000))) return true
  // 6to4 (2002::/16) embedding a private IPv4 address.
  if (h[0] === 0x2002 && isPrivateIpv4((h[1] >> 8) & 0xff, h[1] & 0xff, (h[2] >> 8) & 0xff)) return true
  return false
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost.localdomain') return true

  // IPv6 literal (WHATWG URL wraps IPv6 hostnames in brackets).
  if (host.startsWith('[') && host.endsWith(']')) return isPrivateIpv6(host.slice(1, -1))

  // IPv4 literal (WHATWG URL normalizes octal/hex/integer IPv4 forms to dotted quad).
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number)
    if (octets.some(octet => octet > 255)) return true
    return isPrivateIpv4(octets[0], octets[1], octets[2])
  }

  // Reject single-label hostnames (e.g. intranet, metadata).
  if (!host.includes('.')) return true
  return false
}

/** Whether a URL is a public http(s) address safe to submit to an external archiver. */
export function isPublicWebUrl(raw: string): boolean {
  const cleaned = archiveUrl(raw)
  return cleaned !== null && !isPrivateHost(new URL(cleaned).hostname)
}

const isWayback = (copy: string) => { try { return new URL(copy).hostname === 'web.archive.org' } catch { return false } }

/** Whether the Wayback Machine may be asked to copy this address. */
export const archivable = (url: string | null): url is string => Boolean(url) && isPublicWebUrl(url!) && !isAlreadyArchived(url!)

function normalizeWaybackUrl(candidate: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(candidate, WAYBACK)
  } catch {
    return null
  }
  if (parsed.hostname.toLowerCase() !== 'web.archive.org') return null
  if (parsed.protocol === 'http:') parsed.protocol = 'https:'
  if (parsed.protocol !== 'https:' || !parsed.pathname.startsWith('/web/')) return null
  return archiveUrl(parsed.toString())
}

/**
 * Looks up an existing Wayback Machine snapshot for a public URL, or asks Save Page Now to capture one.
 * Returns the archived `https://web.archive.org/web/...` address, or `null` if rejected or unavailable.
 */
export async function waybackArchive(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const cleaned = archiveUrl(url)
  if (!cleaned || !archivable(cleaned)) return null

  try {
    const availableRes = await fetchImpl(`https://archive.org/wayback/available?url=${encodeURIComponent(cleaned)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(AVAILABLE_TIMEOUT_MS),
    })
    if (availableRes.ok) {
      const payload = await availableRes.json() as { archived_snapshots?: { closest?: { available?: unknown; url?: unknown } } }
      const closest = payload?.archived_snapshots?.closest
      if (closest?.available && typeof closest.url === 'string') {
        const snapshot = normalizeWaybackUrl(closest.url)
        if (snapshot) return snapshot
      }
    } else {
      void availableRes.body?.cancel?.().catch(() => {})
    }
  } catch {
    // Fall through to Save Page Now if the availability check fails.
  }

  try {
    const saveRes = await fetchImpl(`https://web.archive.org/save/${encodeURIComponent(cleaned)}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
    })
    void saveRes.body?.cancel?.().catch(() => {})
    if (saveRes.status < 200 || saveRes.status >= 400) return null
    const header = saveRes.headers.get('content-location') || saveRes.headers.get('location')
    if (header) return normalizeWaybackUrl(header)
    if (saveRes.ok && saveRes.url) return normalizeWaybackUrl(saveRes.url)
  } catch {
    return null
  }
  return null
}

const ensureArchiver = (db: D1Database) => db.prepare('INSERT OR IGNORE INTO people(id, name, created_at) VALUES (?, ?, ?)')
  .bind(ARCHIVER_ID, ARCHIVER_NAME, new Date().toISOString()).run()

// The live sources among these that never held a copy. `sqlite_autoindex_sources_1` finds each by its hash,
// the archive primary key and `source_archive_changes_by_source` check its copies and their history.
export const UNARCHIVED = `SELECT c.id, c.url FROM sources c WHERE c.hash IN (SELECT value FROM json_each(?1)) AND c.records > 0
  AND NOT EXISTS (SELECT 1 FROM source_archives a WHERE a.source_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM source_archive_changes h WHERE h.source_id = c.id)`

/**
 * After a write, copies the web pages its sightings cite to the Wayback Machine and lists each copy on its
 * source, in the background via `waitUntil`. A source that holds or once held a copy is left as it is.
 * No-ops without a `waitUntil` execution context, as in tests.
 */
export function archiveCited(event: Pick<RequestEvent, 'platform'>, sightings: readonly SightingFields[], fetchImpl: typeof fetch = fetch): void {
  const platform = event.platform
  const db = platform?.env?.DB
  if (!platform?.ctx || !db) return
  const cited: Citation[] = sightings.flatMap(sighting => [sighting, ...tidyVias(sighting.vias)]).filter(citation => archivable(citation.url))
  if (!cited.length) return
  platform.ctx.waitUntil(archiveSources(event, db, cited, fetchImpl))
}

export async function archiveSources(event: Pick<RequestEvent, 'platform'>, db: D1Database, cited: readonly Citation[], fetchImpl: typeof fetch = fetch) {
  try {
    const hashes = [...new Set(await Promise.all(cited.slice(0, MAX_CITED).map(citationHash)))].filter(hash => hash !== null)
    const { results } = await db.prepare(UNARCHIVED).bind(JSON.stringify(hashes)).all<{ id: number; url: string | null }>()
    const added: number[] = []
    let actor: Promise<unknown> | null = null
    await Promise.allSettled(results.filter(source => archivable(source.url)).slice(0, MAX_BACKGROUND_ARCHIVE).map(async source => {
      const copy = await waybackArchive(source.url!, fetchImpl)
      if (!copy) return
      await (actor ??= ensureArchiver(db))
      // A copy added or removed by hand meanwhile wins: the add is refused once the source has any copy history.
      if (await editSourceArchive(db, source.id, copy, false, ARCHIVER_ID, 'first') === 'ok') added.push(source.id)
    }))
    notifyIndexNow(event, { sources: added })
  } catch (cause) {
    console.error('Could not archive cited sources', cause)
  }
}

export type ArchiveNow = { ok: true } | { ok: false; error: 'invalid' | 'failed' | 'duplicate' | 'full' | 'missing' }

/** Copies a source's web page to the Wayback Machine now, unless the source already holds a copy there. */
export async function archiveNow(db: D1Database, id: number, actor: string, fetchImpl: typeof fetch = fetch): Promise<ArchiveNow> {
  const source = await db.prepare('SELECT url FROM sources WHERE id = ? AND records > 0').bind(id).first<{ url: string | null }>()
  if (!source) return { ok: false, error: 'missing' }
  if (!archivable(source.url)) return { ok: false, error: 'invalid' }
  // Refuse before asking the archive; the add below checks again in case a copy arrives meanwhile.
  const held = await sourceArchives(db, id)
  if (held.some(isWayback)) return { ok: false, error: 'duplicate' }
  if (held.length >= ARCHIVES_MAX) return { ok: false, error: 'full' }
  const copy = await waybackArchive(source.url, fetchImpl)
  if (!copy) return { ok: false, error: 'failed' }
  const result = await editSourceArchive(db, id, copy, false, actor, 'wayback')
  return result === 'ok' ? { ok: true } : { ok: false, error: result }
}

/** Whether the source page offers to copy the source now: a public page with room and no Wayback copy. */
export const offersArchiveNow = (url: string | null, archives: readonly string[]) =>
  archivable(url) && archives.length < ARCHIVES_MAX && !archives.some(isWayback)
