import type { SourceImageMeta } from './attribution'

export const evidenceFields = ['place', 'title', 'author', 'publisher', 'year', 'page', 'note'] as const
export type EvidenceFields = Record<typeof evidenceFields[number], string | null>
const limits = { place: 500, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }

export function readEvidenceFields(form: FormData): EvidenceFields | null {
  const row = {} as EvidenceFields
  for (const name of evidenceFields) {
    const value = form.get(name)
    if (value !== null && typeof value !== 'string') return null
    const text = (value ?? '').normalize('NFC').trim()
    if (text.length > limits[name]) return null
    row[name] = text || null
  }
  return row.place ? row : null
}

export type StoredEvidence = EvidenceFields & { id: number; has_image: number; created_at: string }

export async function listEvidence(db: D1Database, entryId: number): Promise<StoredEvidence[]> {
  const { results } = await db.prepare(`SELECT id, place, title, author, publisher, year, page, note, (image_key IS NOT NULL AND image_type IS NOT NULL) AS has_image, created_at FROM evidence WHERE entry_id = ? ORDER BY id`).bind(entryId).all<StoredEvidence>()
  return results
}

export async function addEvidence(db: D1Database, entryId: number, fields: EvidenceFields, image: SourceImageMeta | null, creatorId: string | null) {
  const now = new Date().toISOString()
  const row = await db.prepare(`INSERT INTO evidence (entry_id, place, title, author, publisher, year, page, note, image_key, image_type, image_size, created_at, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(entryId, ...evidenceFields.map(name => fields[name]), image?.key ?? null, image?.type ?? null, image?.size ?? null, now, creatorId)
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

async function sourceId(db: D1Database, fields: EvidenceFields, now: string) {
  const existing = await db.prepare('SELECT id FROM sources WHERE kind = ? AND title IS ? AND author IS ? AND publisher IS ? AND year IS ? AND place IS ? LIMIT 1')
    .bind('other', fields.title, fields.author, fields.publisher, fields.year, fields.place).first<{ id: number }>()
  if (existing) return existing.id
  const created = await db.prepare('INSERT INTO sources (kind, title, author, publisher, year, place, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind('other', fields.title, fields.author, fields.publisher, fields.year, fields.place, now).first<{ id: number }>()
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
