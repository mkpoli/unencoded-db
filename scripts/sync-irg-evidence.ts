// Backfills bibliographic evidence citations from IRG Working Set ORT pages (hc.jsecs.org) onto
// local RCC records with Extension G/H/J Unicode encodings or `irg-ws` serial claims.
//
//   bun scripts/sync-irg-evidence.ts --local [--entry <id>] [--after <id>] [--limit <n>] [--per-entry <n>] [--delay-ms <ms>] [--dry-run]
//
// Cites original works with ORT in `vias` and links evidence scans in `note`; never mirrors scans.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { parseUnihan, unihanBlock, type UnihanRow } from '../src/lib/character-tables'
import type { Claim } from '../src/lib/claims'
import { encodedCharacter } from '../src/lib/ids'
import { isIdeograph } from '../src/lib/ideographs'
import { IRG_ORT_SIGHTINGS_MAX, ortTargetsForClaims, syncOrtEntry } from '../src/lib/server/irg-ort-sync'

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`)
  console.error([
    'Usage:',
    '  bun scripts/sync-irg-evidence.ts --local [--entry <id>] [--after <id>] [--limit <n>] [--per-entry <n>] [--delay-ms <ms>] [--dry-run]',
  ].join('\n'))
  process.exit(1)
}

function positiveInt(raw: string | undefined, name: string): number {
  if (!raw || !/^[1-9]\d*$/.test(raw)) usage(`${name} must be a positive integer`)
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) usage(`${name} is out of range`)
  return n
}

function nonNegativeInt(raw: string | undefined, name: string): number {
  if (!raw || !/^\d+$/.test(raw)) usage(`${name} must be a non-negative integer`)
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) usage(`${name} is out of range`)
  return n
}

const args = process.argv.slice(2)
if (!args.length || args.includes('--help') || args.includes('-h')) usage()

let local = false
let entryId: number | undefined
let afterId = 0
let limit = 200
let maxPerEntry = IRG_ORT_SIGHTINGS_MAX
let dryRun = false
let delayMs = 250

for (let i = 0; i < args.length; i++) {
  const flag = args[i]
  if (flag === '--local') { local = true; continue }
  if (flag === '--entry') { entryId = positiveInt(args[++i], '--entry'); continue }
  if (flag === '--after') { afterId = nonNegativeInt(args[++i], '--after'); continue }
  if (flag === '--limit') { limit = positiveInt(args[++i], '--limit'); continue }
  if (flag === '--per-entry') { maxPerEntry = positiveInt(args[++i], '--per-entry'); continue }
  if (flag === '--delay-ms') { delayMs = nonNegativeInt(args[++i], '--delay-ms'); continue }
  if (flag === '--dry-run') { dryRun = true; continue }
  usage(`Unknown option: ${flag}`)
}
if (!local) usage('--local is required')

const unihanDir = join(import.meta.dir, '../static/unihan')
const unihanCache = new Map<string, Map<string, UnihanRow>>()

function localUnihanSources(chars: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const char of chars) {
    if ([...char].length !== 1 || !isIdeograph(char)) continue
    const block = unihanBlock(char)
    let rows = unihanCache.get(block)
    if (!rows) {
      const path = join(unihanDir, `${block}.tsv`)
      rows = existsSync(path) ? parseUnihan(readFileSync(path, 'utf8')) : new Map()
      unihanCache.set(block, rows)
    }
    const raw = rows.get(char)?.sources
    if (raw) out[char] = raw.split(' ').filter(Boolean)
  }
  return out
}

function parseEncodingClaim(value: string, rawData: string | null): Claim | null {
  if (!rawData) return null
  try {
    const data = JSON.parse(rawData)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return { key: '00000000', kind: 'encoding', value, data: data as Record<string, unknown>, sightings: [], under: [] }
  } catch {
    return null
  }
}

const proxy = await getPlatformProxy<App.Platform['env']>({
  configPath: join(import.meta.dir, '../wrangler.jsonc'),
  persist: true,
})

try {
  const db = proxy.env.DB
  const rows = entryId !== undefined
    ? [{ id: entryId }]
    : (await db.prepare(
      `SELECT DISTINCT e.id FROM entries e
       JOIN claims c ON c.entry_id = e.id
       WHERE e.hidden_at IS NULL AND e.merged_into IS NULL AND e.id > ? AND c.kind = 'encoding'
       ORDER BY e.id ASC LIMIT ?`,
    ).bind(afterId, limit).all<{ id: number }>()).results

  let processed = 0, added = 0, errors = 0
  for (const row of rows) {
    try {
      const claimRows = (await db.prepare(
        `SELECT value, data FROM claims WHERE entry_id = ? AND kind = 'encoding'`,
      ).bind(row.id).all<{ value: string; data: string | null }>()).results
      const claims = claimRows
        .map(c => parseEncodingClaim(c.value, c.data))
        .filter((c): c is Claim => c !== null)
      const unicodeChars = claims
        .filter(c => c.data?.charset === 'unicode')
        .map(c => encodedCharacter(c.value))
        .filter(Boolean)
      const unihanSources = localUnihanSources(unicodeChars)
      // Skip full getEntry() when the record has no IRG WS targets.
      if (!ortTargetsForClaims(claims, unihanSources).length) continue
      const result = await syncOrtEntry(db, row.id, { unihanSources, maxPerEntry, dryRun })
      processed++
      added += result.added
      if (result.added > 0) console.log(`  entry #${result.entryId}: +${result.added} (${result.refs.join(', ')})`)
      if (result.targets > 0 && delayMs > 0) await Bun.sleep(delayMs)
    } catch (err) {
      errors++
      console.error(`  entry #${row.id}: error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}${processed} record(s) checked, ${added} sighting(s) ${dryRun ? 'matched' : 'added'}, ${errors} error(s).`)
  if (errors > 0) process.exitCode = 1
} finally {
  await proxy.dispose()
}
