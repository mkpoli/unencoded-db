import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { getVisibleSource } from '$lib/server/entries'
import { GET } from './[locale]/[kind]/[id]/card.png/+server'

test('card requests reject hidden or merged records and sources without visible evidence', async () => {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('p', 'Person', '2026');
    INSERT INTO entries(id, script, created_by, created_at, updated_at, hidden_at, merged_into) VALUES
      (1, 'han', 'p', '2026', '2026', null, null),
      (2, 'han', 'p', '2026', '2026', 'hidden', null),
      (3, 'han', 'p', '2026', '2026', null, 1);
    INSERT INTO sources(id, hash, title) VALUES (1, 'book', 'A book'), (2, 'thread', 'A thread');
    INSERT INTO sightings(id, entry_id, first_entry, source_id, place, created_by, created_at, updated_at, hidden_at) VALUES
      (1, 2, 2, 1, 'Book', 'p', '2026', '2026', null),
      (2, 1, 1, null, 'Via a thread', 'p', '2026', '2026', null);
    INSERT INTO sighting_vias(sighting_id, position, source_id) VALUES (2, 0, 2);`)
  const card = (kind: string, id: number) => Promise.resolve(GET({
    params: { locale: 'en', kind, id: String(id) }, platform: { env: { DB: db } },
  } as Parameters<typeof GET>[0]))

  await expect(card('entry', 2)).rejects.toMatchObject({ status: 404 })
  await expect(card('entry', 3)).rejects.toMatchObject({ status: 404 })
  await expect(card('source', 1)).rejects.toMatchObject({ status: 404 })
  expect(await getVisibleSource(db, 2)).toMatchObject({ title: 'A thread' })
})
