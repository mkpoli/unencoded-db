import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { load } from './+page.server'

test('the data page counts visible records and evidence', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at, merged_into) VALUES
      (1, 'han', 'p', '2026', '2026', NULL, NULL),
      (2, 'han', 'p', '2026', '2026', '2026', NULL),
      (3, 'han', 'p', '2026', '2026', NULL, 1);
    INSERT INTO sightings(entry_id, first_entry, place, created_by, created_at, updated_at, hidden_at) VALUES
      (1, 1, 'a', 'p', '2026', '2026', NULL),
      (1, 1, 'b', 'p', '2026', '2026', NULL),
      (1, 1, 'hidden sighting', 'p', '2026', '2026', '2026'),
      (2, 2, 'hidden entry', 'p', '2026', '2026', NULL),
      (3, 3, 'merged entry', 'p', '2026', '2026', NULL);`)
  const result = await load({ platform: { env: { DB: db } }, params: { locale: 'ja' } } as any) as any
  expect(result.counts).toEqual({ records: 1, evidence: 2 })
  const [dataset] = result.structured
  expect(dataset).toMatchObject({ '@type': 'Dataset', url: 'https://rare.glyphatlas.org/ja/data', license: 'https://creativecommons.org/licenses/by-sa/4.0/', isAccessibleForFree: true })
  expect(dataset.description.length).toBeGreaterThanOrEqual(50)
  expect(dataset.distribution.map((download: { contentUrl: string }) => download.contentUrl)).toEqual(['json', 'csv', 'media'].map(format => `https://rare.glyphatlas.org/api/export?format=${format}`))
})
