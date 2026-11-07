import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'

const migrations = new URL('../migrations/', import.meta.url)

export type Migration = '0001_init.sql' | '0002_entry_visibility.sql' | '0003_source_images.sql'

export function applyMigration(db: Database, name: Migration): void {
  db.exec(readFileSync(new URL(name, migrations), 'utf8'))
}

export function createTestDatabase(): Database {
  const db = new Database(':memory:')
  applyMigration(db, '0001_init.sql')
  applyMigration(db, '0002_entry_visibility.sql')
  applyMigration(db, '0003_source_images.sql')
  return db
}

export function d1Binding(db: Database) {
  return {
    prepare(sql: string) {
      return {
        bind(...values: (string | number | null)[]) {
          return {
            first: async () => db.query(sql).get(...values),
            all: async () => ({ results: db.query(sql).all(...values) }),
          }
        },
      }
    },
  }
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

export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

export function imageFile(bytes: Uint8Array, name = 'source.png', type = 'image/png'): File {
  return new File([bytes as unknown as BlobPart], name, { type })
}
