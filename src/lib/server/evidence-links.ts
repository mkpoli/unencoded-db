import type { SourceImageMeta } from './attribution'

export type DatePrecision = 'day' | 'month' | 'year' | 'month-only' | 'text'
export type DateParts = { date_year: number | null; date_month: number | null; date_day: number | null; date_precision: DatePrecision }

export function parseDate(value: string | null): DateParts {
  const text = (value ?? '').trim()
  const full = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/.exec(text)
  if (full) {
    const year = Number(full[1]), month = Number(full[2]), day = full[3] ? Number(full[3]) : null
    if (month >= 1 && month <= 12 && (day === null || (day >= 1 && day <= daysInMonth(year, month)))) {
      return { date_year: year, date_month: month, date_day: day, date_precision: day === null ? 'month' : 'day' }
    }
  }
  if (/^\d{4}$/.test(text)) return { date_year: Number(text), date_month: null, date_day: null, date_precision: 'year' }
  if (/^\d{1,2}$/.test(text)) {
    const month = Number(text)
    if (month >= 1 && month <= 12) return { date_year: null, date_month: month, date_day: null, date_precision: 'month-only' }
  }
  return { date_year: null, date_month: null, date_day: null, date_precision: 'text' }
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

export const evidenceFields = ['place', 'url', 'title', 'author', 'publisher', 'year', 'page', 'note'] as const
export type EvidenceFields = Record<typeof evidenceFields[number], string | null>
const limits = { place: 500, url: 1000, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }

export function readEvidenceFields(form: FormData): EvidenceFields | null {
  const row = {} as EvidenceFields
  for (const name of evidenceFields) {
    const value = form.get(name)
    if (value !== null && typeof value !== 'string') return null
    const text = (value ?? '').normalize('NFC').trim()
    if (text.length > limits[name]) return null
    row[name] = text || null
  }
  if (row.url && !/^https?:\/\//i.test(row.url)) return null
  return row.place ? row : null
}

export type StoredEvidence = EvidenceFields & DateParts & { id: number; source_id: number | null; has_image: number; created_at: string }

export async function listEvidence(db: D1Database, entryId: number): Promise<StoredEvidence[]> {
  const { results } = await db.prepare(`SELECT id, place, url, title, author, publisher, year, page, note, date_year, date_month, date_day, date_precision, (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image, created_at, (SELECT es.source_id FROM evidence_sources es WHERE es.evidence_id = evidence.id ORDER BY es.source_id LIMIT 1) AS source_id FROM evidence INDEXED BY evidence_entry_date WHERE entry_id = ? ORDER BY date_year, date_month, date_day, id`).bind(entryId).all<StoredEvidence>()
  return results
}

export async function addEvidence(db: D1Database, entryId: number, fields: EvidenceFields, image: SourceImageMeta | null, creatorId: string | null) {
  const now = new Date().toISOString()
  const date = parseDate(fields.year)
  const row = await db.prepare(`INSERT INTO evidence (entry_id, place, url, title, author, publisher, year, page, note, date_year, date_month, date_day, date_precision, image_key, image_type, image_size, created_at, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(entryId, ...evidenceFields.map(name => fields[name]), date.date_year, date.date_month, date.date_day, date.date_precision, image?.key ?? null, image?.type ?? null, image?.size ?? null, now, creatorId)
    .first<{ id: number }>()
  if (!row) throw new Error('Could not save evidence')
  const source = await sourceId(db, fields, now)
  await db.prepare('INSERT OR IGNORE INTO evidence_sources (evidence_id, source_id) VALUES (?, ?)').bind(row.id, source).run()
  if (image) {
    const media = await mediaId(db, image, now)
    await db.prepare('INSERT OR IGNORE INTO evidence_media (evidence_id, media_id) VALUES (?, ?)').bind(row.id, media).run()
  }
  return row
}

/** The evidence record a new entry was created from; it mirrors the entry's source columns. */
export async function primaryEvidenceId(db: D1Database, entryId: number): Promise<number | null> {
  const row = await db.prepare('SELECT id FROM evidence WHERE entry_id = ? ORDER BY id LIMIT 1').bind(entryId).first<{ id: number }>()
  return row?.id ?? null
}

/**
 * Change one evidence record. `image` is `undefined` to keep the current image,
 * `null` to remove it, or a new image to replace it.
 */
export async function updateEvidence(
  db: D1Database,
  entryId: number,
  evidenceId: number,
  fields: EvidenceFields,
  image: SourceImageMeta | null | undefined,
  guard?: { revision: number; generation: number },
) {
  const now = new Date().toISOString()
  const date = parseDate(fields.year)
  const columns = [...evidenceFields, 'date_year', 'date_month', 'date_day', 'date_precision']
  const values: (string | number | null)[] = [...evidenceFields.map(name => fields[name]), date.date_year, date.date_month, date.date_day, date.date_precision]
  if (image !== undefined) {
    columns.push('image_key', 'image_type', 'image_size')
    values.push(image?.key ?? null, image?.type ?? null, image?.size ?? null)
  }
  const guarded = guard
    ? ' AND EXISTS (SELECT 1 FROM entries en WHERE en.id = ? AND en.visible = 1 AND en.revision = ? AND en.edit_generation = ?)'
    : ''
  const bindings = guard ? [evidenceId, entryId, entryId, guard.revision, guard.generation] : [evidenceId, entryId]
  const row = await db.prepare(`UPDATE evidence SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ? AND entry_id = ?${guarded} RETURNING id`)
    .bind(...values, ...bindings).first<{ id: number }>()
  if (!row) return null
  await db.prepare('DELETE FROM evidence_sources WHERE evidence_id = ?').bind(evidenceId).run()
  const source = await sourceId(db, fields, now)
  await db.prepare('INSERT OR IGNORE INTO evidence_sources (evidence_id, source_id) VALUES (?, ?)').bind(evidenceId, source).run()
  if (image !== undefined) {
    await db.prepare('DELETE FROM evidence_media WHERE evidence_id = ?').bind(evidenceId).run()
    await db.prepare('DELETE FROM crops WHERE evidence_id = ?').bind(evidenceId).run()
    if (image) {
      const media = await mediaId(db, image, now)
      await db.prepare('INSERT OR IGNORE INTO evidence_media (evidence_id, media_id) VALUES (?, ?)').bind(evidenceId, media).run()
    }
  }
  return row
}

async function sourceId(db: D1Database, fields: EvidenceFields, now: string) {
  const existing = await db.prepare('SELECT id FROM sources WHERE kind = ? AND title IS ? AND author IS ? AND publisher IS ? AND year IS ? AND place IS ? AND url IS ? LIMIT 1')
    .bind('other', fields.title, fields.author, fields.publisher, fields.year, fields.place, fields.url).first<{ id: number }>()
  if (existing) return existing.id
  const created = await db.prepare('INSERT INTO sources (kind, title, author, publisher, year, place, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind('other', fields.title, fields.author, fields.publisher, fields.year, fields.place, fields.url, now).first<{ id: number }>()
  if (!created) throw new Error('Could not save source')
  return created.id
}

async function mediaId(db: D1Database, image: SourceImageMeta, now: string) {
  const existing = await db.prepare('SELECT id FROM media WHERE key = ? LIMIT 1').bind(image.key).first<{ id: number }>()
  if (existing) return existing.id
  const created = await db.prepare('INSERT INTO media (key, type, size, created_at) VALUES (?, ?, ?, ?) RETURNING id').bind(image.key, image.type, image.size, now).first<{ id: number }>()
  if (!created) throw new Error('Could not save media')
  return created.id
}

export type Crop = { id: number; evidence_id: number; x: number; y: number; w: number; h: number }

export async function listCrops(db: D1Database, entryId: number): Promise<Crop[]> {
  const { results } = await db.prepare('SELECT c.id, c.evidence_id, c.x, c.y, c.w, c.h FROM crops c JOIN evidence e ON e.id = c.evidence_id WHERE e.entry_id = ? ORDER BY c.id').bind(entryId).all<Crop>()
  return results
}

export async function addCrop(db: D1Database, evidenceId: number, box: Omit<Crop, 'id' | 'evidence_id'>) {
  return db.prepare('INSERT INTO crops (evidence_id, x, y, w, h, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(evidenceId, box.x, box.y, box.w, box.h, new Date().toISOString()).first<{ id: number }>()
}
