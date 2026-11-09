import { error } from '@sveltejs/kit'
import { publicEntryPredicate } from '$lib/server/visibility'
import type { PageServerLoad } from './$types'

const PAGE = 100

type Source = { id: number; kind: string; title: string | null; author: string | null; publisher: string | null; year: string | null; place: string | null }
type Row = {
  entry_id: number
  script: string
  ids: string | null
  description: string | null
  evidence_id: number
  place: string
  title: string | null
  year: string | null
  page: string | null
  note: string | null
  has_image: number
}

const positive = (value: string) => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null

export const load: PageServerLoad = async ({ params, platform, url }) => {
  if (!platform) error(500, 'Database unavailable')
  const id = positive(params.id)
  if (!id) error(404)
  const rawBefore = url.searchParams.get('before')
  const before = rawBefore === null ? null : positive(rawBefore)
  if (rawBefore !== null && before === null) error(404)

  const source = await platform.env.DB.prepare('SELECT id, kind, title, author, publisher, year, place FROM sources WHERE id = ?').bind(id).first<Source>()
  if (!source) error(404)

  const sql = `SELECT e.id AS entry_id, e.script, e.ids, e.description, ev.id AS evidence_id, ev.place, ev.title, ev.year, ev.page, ev.note,
                      (ev.image_key IS NOT NULL AND ev.image_type IS NOT NULL) AS has_image
               FROM evidence_sources es
               JOIN evidence ev ON ev.id = es.evidence_id
               JOIN entries e ON e.id = ev.entry_id
               WHERE es.source_id = ? AND ${publicEntryPredicate}${before === null ? '' : ' AND ev.id < ?'}
               ORDER BY ev.id DESC LIMIT ?`
  const statement = platform.env.DB.prepare(sql)
  const bound = before === null ? statement.bind(id, PAGE + 1) : statement.bind(id, before, PAGE + 1)
  const { results } = await bound.all<Row>()
  const rows = results.slice(0, PAGE)
  if (!rows.length) error(404)
  return { source, rows, next: results.length > PAGE ? rows[rows.length - 1]!.evidence_id : null }
}
