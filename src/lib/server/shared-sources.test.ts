import { describe, expect, test } from 'bun:test'
import { createTestDatabase, d1Binding } from '../../test-support'
import { addEvidence } from './evidence-links'

const fields = { place: 'Book', title: 'Source', author: 'Author', publisher: 'Publisher', year: '1900', page: '12', note: null, url: null }
const image = { key: 'images/source.png', type: 'image/png', size: 12 }

describe('shared sources', () => {
  test('reuses one source and one media for matching evidence', async () => {
    const db = createTestDatabase()
    try {
      db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'Book', '2026-01-01', 1)").run()
      db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('Tangut', 'Book', '2026-01-01', 1)").run()
      await addEvidence(d1Binding(db), 1, fields, image, null)
      await addEvidence(d1Binding(db), 2, fields, image, null)
      expect((db.query('SELECT count(*) AS n FROM sources').get() as { n: number }).n).toBe(1)
      expect((db.query('SELECT count(*) AS n FROM media').get() as { n: number }).n).toBe(1)
      expect((db.query('SELECT count(*) AS n FROM evidence_sources').get() as { n: number }).n).toBe(2)
      expect((db.query('SELECT count(*) AS n FROM evidence_media').get() as { n: number }).n).toBe(2)
    } finally { db.close() }
  })

  test('reuses a source by URL and keeps different URLs apart', async () => {
    const db = createTestDatabase()
    try {
      for (let i = 0; i < 3; i++) db.query("INSERT INTO entries (script, place, created_at, visible) VALUES ('Han', 'Book', '2026-01-01', 1)").run()
      await addEvidence(d1Binding(db), 1, { ...fields, url: 'https://example.org/a' }, image, null)
      await addEvidence(d1Binding(db), 2, { ...fields, url: 'https://example.org/a' }, image, null)
      await addEvidence(d1Binding(db), 3, { ...fields, url: 'https://example.org/b' }, image, null)
      expect((db.query('SELECT count(*) AS n FROM sources').get() as { n: number }).n).toBe(2)
    } finally { db.close() }
  })
})
