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

const decode = (value: string) => new Uint8Array(Buffer.from(value, 'base64'))

export const JPEG_BYTES = decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==')
export const PNG_BYTES = decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC')
export const WEBP_BYTES = decode('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=')

export function imageFile(bytes: Uint8Array, name = 'source.png', type = 'image/png'): File {
  return new File([bytes as unknown as BlobPart], name, { type })
}
