import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

const migrations = new URL('../migrations/', import.meta.url)

const migrationOrder = [
  '0001_init.sql',
  '0002_entry_visibility.sql',
  '0003_related_characters.sql',
  '0004_attribution.sql',
  '0005_oidc.sql',
  '0006_source_images.sql',
  '0007_revisions.sql',
  '0008_edit_generation.sql',
  '0009_revision_redaction.sql',
  '0010_moderation.sql',
  '0011_reports.sql',
  '0012_report_dismissals.sql',
  '0013_evidence.sql',
  '0014_genres.sql',
  '0015_date_precision.sql',
  '0016_collections.sql',
  '0017_shared_sources.sql',
  '0018_shared_image.sql',
  '0019_crops.sql',
  '0020_script_counts.sql',
  '0021_relation_evidence.sql',
  '0022_character_metadata.sql',
  '0023_character_tags.sql',
  '0024_senses.sql',
  '0025_strokes.sql',
  '0026_evidence_url.sql',
  '0027_ivd.sql',
  '0028_genre_taxonomy.sql',
  '0029_genre_groups.sql',
  '0030_evidence_provider.sql',
  '0031_atlas_profile.sql',
  '0032_entry_encodings.sql',
  '0033_reform_genres.sql',
  '0034_equivalent_character.sql',
] as const

export type Migration = typeof migrationOrder[number]

export function applyMigration(db: Database, name: Migration): void {
  db.exec(readFileSync(new URL(name, migrations), 'utf8'))
}

export function createTestDatabase(through: Migration = '0034_equivalent_character.sql'): Database {
  const db = new Database(':memory:')
  for (const name of migrationOrder) {
    applyMigration(db, name)
    if (name === through) break
  }
  return db
}

export function d1Binding(db: Database): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          return {
            first: async () => db.query(sql).get(...values),
            all: async () => ({ results: db.query(sql).all(...values) }),
            run: () => ({ results: db.query(sql).all(...values) }),
            execute: () => db.query(sql).all(...values),
          }
        },
      }
    },
    batch: async (statements: { execute: () => unknown[] }[]) => db.transaction(() => statements.map(statement => ({ results: statement.execute() })))(),
  } as unknown as D1Database
}

export type StoredObject = { bytes: Uint8Array; contentType: string | null }
export type PutCall = { key: string; bytes: Uint8Array; contentType: string | null }

export function fakeImages() {
  const objects = new Map<string, StoredObject>()
  const puts: PutCall[] = []
  const deletes: string[] = []
  const gets: string[] = []

  const bucket = {
    async put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      const bytes = value.slice()
      const contentType = options?.httpMetadata?.contentType ?? null
      objects.set(key, { bytes, contentType })
      puts.push({ key, bytes, contentType })
    },
    async get(key: string) {
      gets.push(key)
      const stored = objects.get(key)
      if (!stored) return null
      return {
        body: new Blob([stored.bytes as unknown as BlobPart]).stream(),
        size: stored.bytes.byteLength,
        httpMetadata: { contentType: stored.contentType },
      }
    },
    async delete(key: string) {
      deletes.push(key)
      objects.delete(key)
    },
  }

  return { bucket: bucket as unknown as R2Bucket, objects, puts, deletes, gets }
}

const decode = (value: string) => new Uint8Array(Buffer.from(value, 'base64'))

export const JPEG_BYTES = decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==')
export const PNG_BYTES = decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC')
export const WEBP_BYTES = decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=')

export function imageFile(bytes: Uint8Array, name = 'source.png', type = 'image/png'): File {
  return new File([bytes as unknown as BlobPart], name, { type })
}

export function insertEntry(db: Database, visible: 0 | 1 = 1, script = 'Han'): number {
  const result = db
    .query("INSERT INTO entries (script, place, created_at, visible) VALUES (?, 'book', '2026-01-01T00:00:00.000Z', ?)")
    .run(script, visible)
  return Number(result.lastInsertRowid)
}

export function entryVisible(db: Database, id: number): number {
  return (db.query('SELECT visible FROM entries WHERE id = ?').get(id) as { visible: number }).visible
}

export function moderationAuditRows(db: Database): { id: number; entry_id: number; action: string; moderator: string; created_at: string }[] {
  return db.query('SELECT id, entry_id, action, moderator, created_at FROM moderation_audit ORDER BY id').all() as never
}

export function insertReport(db: Database, entryId: number, reason = 'spam', note = '', createdAt = '2026-01-05T00:00:00.000Z'): number {
  const result = db
    .query('INSERT INTO entry_reports (entry_id, reason, note, created_at) VALUES (?, ?, ?, ?)')
    .run(entryId, reason, note, createdAt)
  return Number(result.lastInsertRowid)
}

export function reportRows(db: Database): { id: number; entry_id: number; reason: string; note: string; created_at: string; resolved_at: string | null }[] {
  return db.query('SELECT id, entry_id, reason, note, created_at, resolved_at FROM entry_reports ORDER BY id').all() as never
}

export function insertDismissal(db: Database, reportId: number, moderator = 'mod@example.com', dismissedAt = '2026-02-03T04:05:06.000Z'): void {
  db.query('INSERT INTO report_dismissals (report_id, moderator, dismissed_at) VALUES (?, ?, ?)').run(reportId, moderator, dismissedAt)
}

export function dismissalRows(db: Database): { report_id: number; moderator: string; dismissed_at: string }[] {
  return db.query('SELECT report_id, moderator, dismissed_at FROM report_dismissals ORDER BY report_id').all() as never
}
