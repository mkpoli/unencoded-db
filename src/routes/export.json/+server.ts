import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { publicEntryPredicate } from '$lib/server/visibility'
import { parseDate } from '$lib/server/evidence-links'
import type { Comparison } from '$lib/server/related'

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
  comparisons: string
}

type ExportEvidence = {
  id: number
  place: string
  url: string | null
  title: string | null
  author: string | null
  publisher: string | null
  year: string | null
  page: string | null
  note: string | null
  date_precision: string
  has_image: number
}

function readInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback
  if (!/^(0|[1-9]\d*)$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null
}

function comparisons(value: string): Comparison[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export const GET: RequestHandler = async ({ platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const after = readInteger(url.searchParams.get('after'), 0, 0, Number.MAX_SAFE_INTEGER)
  const limit = readInteger(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  if (after === null || limit === null) return json({ error: 'Invalid after or limit parameter' }, { status: 400, headers: { 'cache-control': 'no-store' } })

  const { results } = await platform.env.DB
    .prepare(`SELECT id, script, ids, description, place, title, author, publisher, year, page, note, created_at, comparisons
              FROM entries INDEXED BY entries_visible_id WHERE ${publicEntryPredicate} AND id > ? ORDER BY id ASC LIMIT ?`)
    .bind(after, limit + 1)
    .all<ExportRecord>()
  const page = results.slice(0, limit)
  const evidence = new Map<number, ExportEvidence[]>()
  if (page.length) {
    const { results: rows } = await platform.env.DB.prepare(`SELECT id, entry_id, place, url, title, author, publisher, year, page, note, date_precision, (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image FROM evidence WHERE entry_id IN (${page.map(() => '?').join(', ')}) ORDER BY entry_id, date_year, date_month, date_day, id`).bind(...page.map(record => record.id)).all<ExportEvidence & { entry_id: number }>()
    for (const row of rows) {
      const { entry_id, ...item } = row
      const list = evidence.get(entry_id) ?? []
      list.push(item)
      evidence.set(entry_id, list)
    }
  }

  const records = page.map(({ comparisons: stored, ...record }) => {
    const rows = evidence.get(record.id) ?? [{
      id: 0, place: record.place, url: null, title: record.title, author: record.author, publisher: record.publisher,
      year: record.year, page: record.page, note: record.note,
      date_precision: parseDate(record.year).date_precision, has_image: 0,
    }]
    return {
      ...record,
      date_precision: rows[0].date_precision,
      comparisons: comparisons(stored),
      evidence: rows,
    }
  })
  const next = results.length > limit ? records[records.length - 1]!.id : null
  return json({ version: 2, records, next }, { headers: { 'cache-control': 'no-store' } })
}
