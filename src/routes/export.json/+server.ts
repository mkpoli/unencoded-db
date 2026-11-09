import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { publicEntryPredicate } from '$lib/server/visibility'
import { parseDate } from '$lib/server/evidence-links'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

type ExportRecord = {
  id: number
  script: string
  ids: string | null
  description: string | null
  place: string
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  created_at: string
  date_precision: string
}

function readInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback
  if (!/^(0|[1-9]\d*)$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null
}

export const GET: RequestHandler = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const after = readInteger(url.searchParams.get('after'), 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = readInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  if (after === null || limit === null) return json({ error: 'Invalid after or limit parameter' }, { status: 400, headers: { 'cache-control': 'no-store' } })

  const { results } = await platform.env.DB
    .prepare(`SELECT id, script, ids, description, place, title, author, publisher, year, page, note, created_at
              FROM entries INDEXED BY entries_visible_id WHERE ${publicEntryPredicate} AND id > ? ORDER BY id ASC LIMIT ?`)
    .bind(after, limit + 1)
    .all<ExportRecord>()
  const records = results.slice(0, limit).map(record => ({ ...record, date_precision: parseDate(record.year).date_precision }))
  const next = results.length > limit ? records[records.length - 1]!.id : null
  return json({ version: 1, records, next }, { headers: { 'cache-control': 'no-store' } })
}
