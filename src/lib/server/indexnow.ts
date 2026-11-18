import { LOCALES } from '$lib/i18n'
import { SITE_ORIGIN } from '$lib/seo'
import { env } from '$lib/server/guard'
import type { RequestEvent } from '@sveltejs/kit'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
export const URL_LIMIT = 10_000

type Changed = { entries?: readonly number[]; sources?: readonly number[] }

export function indexNowUrls({ entries = [], sources = [] }: Changed): string[] {
  const urls = new Set<string>()
  for (const [kind, ids] of [['entry', entries], ['source', sources]] as const)
    for (const id of ids) for (const locale of LOCALES) urls.add(`${SITE_ORIGIN}/${locale}/${kind}/${id}`)
  return [...urls].slice(0, URL_LIMIT)
}

async function citedSources(db: D1Database, entries: readonly number[]): Promise<number[]> {
  const sources = new Set<number>()
  for (let at = 0; at < entries.length; at += 50) {
    const batch = entries.slice(at, at + 50)
    const marks = batch.map(() => '?').join(', ')
    const { results } = await db.prepare(
      `SELECT source_id AS id FROM sightings WHERE entry_id IN (${marks}) AND source_id IS NOT NULL
       UNION SELECT v.source_id FROM sighting_vias v JOIN sightings s ON s.id = v.sighting_id WHERE s.entry_id IN (${marks}) AND v.source_id IS NOT NULL`,
    ).bind(...batch, ...batch).all<{ id: number }>()
    for (const row of results) sources.add(row.id)
  }
  return [...sources]
}

async function send(db: D1Database, key: string, changed: Changed) {
  try {
    const sources = [...(changed.sources ?? []), ...await citedSources(db, changed.entries ?? [])]
    const urlList = indexNowUrls({ entries: changed.entries, sources })
    if (!urlList.length) return
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE_ORIGIN).host, key, keyLocation: `${SITE_ORIGIN}/${key}.txt`, urlList }),
    })
    if (!response.ok) console.error('IndexNow refused the notification', response.status)
  } catch (cause) {
    console.error('IndexNow notification failed', cause)
  }
}

// The sources a sighting cited before a write, so the pages it leaves are recrawled too.
export const citedBy = (sighting: { source_id: number | null; vias: readonly { id: number }[] }) =>
  [sighting.source_id, ...sighting.vias.map(via => via.id)].filter((id): id is number => id !== null)

// Tells IndexNow the pages of these records, and of the sources they cite, changed. It runs after the
// response and does nothing without a configured key.
export function notifyIndexNow(event: Pick<RequestEvent, 'platform'>, changed: Changed) {
  const platform = event.platform
  const key = platform?.env?.INDEXNOW_KEY
  if (!platform || !key || !(changed.entries?.length || changed.sources?.length)) return
  platform.ctx.waitUntil(send(platform.env.DB, key, changed))
}
