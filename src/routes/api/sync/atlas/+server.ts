import { error, json } from '@sveltejs/kit'
import { CRON_BATCH_SIZE, ATLAS_SIGHTINGS_MAX, syncAtlasBatch } from '$lib/server/atlas-evidence'
import { env } from '$lib/server/guard'
import { notifyIndexNow } from '$lib/server/indexnow'
import { SIGHTINGS_MAX } from '$lib/server/entries'
import type { RequestHandler } from './$types'

function extractBearer(request: Request): string | null {
  const match = /^Bearer +(\S+)$/i.exec(request.headers.get('authorization')?.trim() ?? '')
  return match ? match[1] : null
}

function sameSecret(sent: string | null, expected: string | undefined): boolean {
  if (!sent || !expected || sent.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function positiveInt(value: unknown, max: number): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) return undefined
  return value
}

export const POST: RequestHandler = async (event) => {
  const bindings = env(event)
  if (!bindings.ATLAS_SYNC_TOKEN) error(404)
  if (!sameSecret(extractBearer(event.request), bindings.ATLAS_SYNC_TOKEN)) {
    return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  if (bindings.WRITES_PAUSED === '1') {
    return json({ error: 'paused' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }

  let body: Record<string, unknown> = {}
  const text = (await event.request.text()).trim()
  if (text) {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { return json({ error: 'invalid_json' }, { status: 400 }) }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_body' }, { status: 400 })
    body = parsed as Record<string, unknown>
  }

  const entryId = body.entryId === undefined ? undefined : positiveInt(body.entryId, Number.MAX_SAFE_INTEGER)
  if (body.entryId !== undefined && entryId === undefined) return json({ error: 'invalid_entryId' }, { status: 400 })
  const limit = body.limit === undefined ? CRON_BATCH_SIZE : positiveInt(body.limit, 100)
  if (limit === undefined) return json({ error: 'invalid_limit' }, { status: 400 })
  const maxPerEntry = body.maxPerEntry === undefined ? ATLAS_SIGHTINGS_MAX : positiveInt(body.maxPerEntry, SIGHTINGS_MAX)
  if (maxPerEntry === undefined) return json({ error: 'invalid_maxPerEntry' }, { status: 400 })

  const result = await syncAtlasBatch(bindings, {
    entryId,
    limit,
    maxPerEntry,
    force: body.force === true,
    dryRun: body.dryRun === true,
  })

  if (!body.dryRun) {
    const changed = result.results.filter(item => item.added > 0 || item.removed > 0).map(item => item.entryId)
    if (changed.length) notifyIndexNow(event, { entries: changed })
  }

  return json(result, { headers: { 'cache-control': 'no-store' } })
}
