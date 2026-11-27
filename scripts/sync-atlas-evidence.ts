// Backfill reviewed Glyph Atlas crops as materialized sightings on matching RCC records.
//
// Usage:
//   bun scripts/sync-atlas-evidence.ts --local [--entry <id>] [--limit <n>] [--per-entry <n>] [--atlas <origin>] [--force] [--dry-run]
//   bun scripts/sync-atlas-evidence.ts --remote https://rare.glyphatlas.org [--entry <id>] [--limit <n>] [--batch <n>] [--per-entry <n>] [--force] [--dry-run]
//
// In --remote mode, set ATLAS_SYNC_TOKEN in the environment (or pass --token <secret>).
import { join } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { ATLAS_SIGHTINGS_MAX, DEFAULT_ATLAS_ORIGIN, syncAtlasBatch, type SyncBatchResult } from '../src/lib/server/atlas-evidence'

function usage(): never {
  console.error([
    'Usage:',
    '  bun scripts/sync-atlas-evidence.ts --local [options]',
    '  bun scripts/sync-atlas-evidence.ts --remote <origin> [options]',
    '',
    'Options:',
    '  --entry <id>       Sync a single RCC record id',
    '  --limit <n>        Maximum total records to process (default: 500)',
    '  --batch <n>        Records per batch (default: 20, max: 100)',
    `  --per-entry <n>    Maximum Glyph Atlas sightings per record (default: ${ATLAS_SIGHTINGS_MAX})`,
    `  --atlas <origin>   Glyph Atlas origin in --local mode (default: ${DEFAULT_ATLAS_ORIGIN})`,
    '  --pass <secret>    Value for x-rate-limit-pass in --local mode (default: $ATLAS_RATE_LIMIT_PASS)',
    '  --token <secret>   Bearer token for --remote mode (default: $ATLAS_SYNC_TOKEN)',
    '  --force            Re-check records synced within the last 24 hours',
    '  --dry-run          Report matching crops without writing to D1 or R2',
  ].join('\n'))
  process.exit(1)
}

function positiveInt(raw: string | undefined, name: string): number {
  if (!raw || !/^[1-9]\d*$/.test(raw)) throw new Error(`${name} must be a positive integer`)
  const n = Number(raw)
  if (!Number.isSafeInteger(n)) throw new Error(`${name} is out of range`)
  return n
}

const args = process.argv.slice(2)
if (!args.length || args.includes('--help') || args.includes('-h')) usage()

let mode: 'local' | 'remote' | null = null
let remoteOrigin = ''
let entryId: number | undefined
let totalLimit = 500
let batchSize = 20
let maxPerEntry = ATLAS_SIGHTINGS_MAX
let atlasOrigin = process.env.ATLAS_ORIGIN || DEFAULT_ATLAS_ORIGIN
let pass = process.env.ATLAS_RATE_LIMIT_PASS
let token = process.env.ATLAS_SYNC_TOKEN
let force = false
let dryRun = false

for (let i = 0; i < args.length; i++) {
  const flag = args[i]
  if (flag === '--local') { mode = 'local'; continue }
  if (flag === '--remote') { mode = 'remote'; remoteOrigin = args[++i] ?? ''; continue }
  if (flag === '--entry') { entryId = positiveInt(args[++i], '--entry'); continue }
  if (flag === '--limit') { totalLimit = positiveInt(args[++i], '--limit'); continue }
  if (flag === '--batch') { batchSize = Math.min(100, positiveInt(args[++i], '--batch')); continue }
  if (flag === '--per-entry') { maxPerEntry = positiveInt(args[++i], '--per-entry'); continue }
  if (flag === '--atlas') { atlasOrigin = args[++i] ?? ''; continue }
  if (flag === '--pass') { pass = args[++i] ?? ''; continue }
  if (flag === '--token') { token = args[++i] ?? ''; continue }
  if (flag === '--force') { force = true; continue }
  if (flag === '--dry-run') { dryRun = true; continue }
  throw new Error(`Unknown option: ${flag}`)
}

if (!mode) usage()
if (mode === 'remote') {
  let parsed: URL
  try { parsed = new URL(remoteOrigin) } catch { throw new Error('--remote requires an https origin URL') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    throw new Error('--remote requires https:// (http:// is allowed only for loopback hosts)')
  }
  if (!token) throw new Error('--remote requires ATLAS_SYNC_TOKEN or --token')
}

function logBatch(batch: SyncBatchResult) {
  for (const item of batch.results) {
    if (item.added > 0) console.log(`  entry #${item.entryId}: +${item.added} (${item.cropIds.join(', ')})`)
  }
  for (const err of batch.errors) {
    console.error(`  entry #${err.entryId}: error: ${err.message}`)
  }
}

let totalProcessed = 0
let totalAdded = 0
let totalErrors = 0

if (mode === 'local') {
  const proxy = await getPlatformProxy<App.Platform['env']>({
    configPath: join(import.meta.dir, '../wrangler.jsonc'),
    persist: true,
  })
  try {
    const syncEnv = {
      DB: proxy.env.DB,
      MEDIA: proxy.env.MEDIA,
      ATLAS_ORIGIN: atlasOrigin,
      ATLAS_RATE_LIMIT_PASS: pass,
    }
    const target = entryId !== undefined ? 1 : totalLimit
    while (totalProcessed < target) {
      const limit = Math.min(batchSize, target - totalProcessed)
      const result = await syncAtlasBatch(syncEnv, { entryId, limit, maxPerEntry, force, dryRun })
      logBatch(result)
      totalProcessed += result.processed
      totalAdded += result.added
      totalErrors += result.errors.length
      if (entryId !== undefined || result.processed === 0 || (dryRun && !force) || (result.processed < limit && result.errors.length === 0)) break
      if (dryRun) break
    }
  } finally {
    await proxy.dispose()
  }
} else {
  const endpoint = new URL('/api/sync/atlas', remoteOrigin).href
  const target = entryId !== undefined ? 1 : totalLimit
  while (totalProcessed < target) {
    const limit = Math.min(batchSize, target - totalProcessed)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ entryId, limit, maxPerEntry, force, dryRun }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Sync endpoint returned ${response.status}: ${body.slice(0, 500)}`)
    }
    const result = await response.json() as SyncBatchResult
    logBatch(result)
    totalProcessed += result.processed
    totalAdded += result.added
    totalErrors += result.errors.length
    if (entryId !== undefined || result.processed === 0 || dryRun || (result.processed < limit && result.errors.length === 0)) break
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}${totalProcessed} record(s) checked, ${totalAdded} sighting(s) ${dryRun ? 'matched' : 'added'}, ${totalErrors} error(s).`)
if (totalErrors > 0) process.exitCode = 1
