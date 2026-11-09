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
  return db.prepare(`INSERT INTO evidence (entry_id, place, title, author, publisher, year, page, note, image_key, image_type, image_size, created_at, creator_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(entryId, ...evidenceFields.map(name => fields[name]), image?.key ?? null, image?.type ?? null, image?.size ?? null, new Date().toISOString(), creatorId)
    .first<{ id: number }>()
}
