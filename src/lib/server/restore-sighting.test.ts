import { expect, test } from 'bun:test'
import { createEntry, editSighting, getEntry, history, list, restoreSighting, type EntryFields, type SightingFields, type StoredImage } from './entries'
import { createPerson } from './people'
import { openTestDb } from './testdb'

const entry: EntryFields = { script: 'han', script_other: null, description: null, status: 'unchecked', radical: null, strokes: null, claims: [] }
const seen = (place: string): SightingFields => ({ place, url: null, title: null, author: null, publisher: null, report_date: null, via_url: null, via_title: null, via_author: null, via_publisher: null, via_report_date: null, original_date: null, page: null, context: null, style: null, types: null, note: null })
const image: StoredImage = { image_key: 'current.webp', image_type: 'image/webp', image_w: 100, image_h: 80, thumb_key: 'thumb.webp', box: '[1,2,10,10]' }

async function fixture() {
  const { db, raw } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const id = await createEntry(db, entry, seen('original'), [], who)
  const sighting = (await getEntry(db, id))!.sightings[0].id
  return { db, raw, who, id, sighting }
}

test('restores fields while keeping the current image and indexing the restored state', async () => {
  const { db, who, id, sighting } = await fixture()
  await editSighting(db, sighting, 1, seen('changed'), [image], who, null, id)
  expect(await restoreSighting(db, id, sighting, 2, seen('original'), who, 1)).toEqual({ ok: true, rev: 3 })
  expect((await getEntry(db, id))!.sightings[0]).toMatchObject({ ...seen('original'), media: [image], rev: 3 })
  const row = (await history(db, id))[0]
  expect(row).toMatchObject({ kind: 'sighting_edit', rev: 3, summary: 'r1', sighting_id: sighting })
  expect(JSON.parse(row.snapshot)).toMatchObject({ ...seen('original'), media: [image] })
  expect((await list(db, { query: 'original' }))!.tiles.map(tile => tile.id)).toEqual([id])
  expect((await list(db, { query: 'changed' }))!.tiles).toEqual([])
})

test('rejects stale, hidden and unrelated sightings', async () => {
  const { db, raw, who, id, sighting } = await fixture()
  expect(await restoreSighting(db, id, sighting, 0, seen('x'), who, 1)).toEqual({ ok: false, code: 'conflict' })
  expect(await restoreSighting(db, id + 1, sighting, 1, seen('x'), who, 1)).toEqual({ ok: false, code: 'missing' })
  raw.run("UPDATE sightings SET hidden_at = 'now' WHERE id = ?", [sighting])
  expect(await restoreSighting(db, id, sighting, 1, seen('x'), who, 1)).toEqual({ ok: false, code: 'missing' })
  expect((await history(db, id))).toHaveLength(2)
})

test('visibility and ownership changes immediately before the batch prevent restoration', async () => {
  for (const change of ['sighting hidden', 'entry hidden', 'entry merged', 'moved'] as const) {
    const { db, raw, who, id, sighting } = await fixture()
    const other = await createEntry(db, entry, seen('other'), [], who)
    const batch = db.batch.bind(db)
    let injected = false
    db.batch = (async (statements: D1PreparedStatement[]) => {
      if (!injected) {
        injected = true
        if (change === 'sighting hidden') raw.run("UPDATE sightings SET hidden_at = 'now' WHERE id = ?", [sighting])
        if (change === 'entry hidden') raw.run("UPDATE entries SET hidden_at = 'now' WHERE id = ?", [id])
        if (change === 'entry merged') raw.run('UPDATE entries SET merged_into = ? WHERE id = ?', [other, id])
        if (change === 'moved') raw.run('UPDATE sightings SET entry_id = ? WHERE id = ?', [other, sighting])
      }
      return batch(statements)
    }) as typeof db.batch
    expect(await restoreSighting(db, id, sighting, 1, seen('restored'), who, 1)).toEqual({ ok: false, code: change === 'entry merged' ? 'merged' : 'missing' })
    expect(raw.query('SELECT rev, place FROM sightings WHERE id = ?').get(sighting)).toEqual({ rev: 1, place: 'original' })
    expect((await history(db, id))).toHaveLength(2)
  }
})

test('concurrent restores from the same revision have one winner', async () => {
  const { db, who, id, sighting } = await fixture()
  const results = await Promise.all(['one', 'two'].map(place => restoreSighting(db, id, sighting, 1, seen(place), who, 1)))
  expect(results.filter(result => result.ok)).toHaveLength(1)
  expect(results.filter(result => !result.ok)).toEqual([{ ok: false, code: 'conflict' }])
})

test('rolls back the sighting and journal if reindexing fails', async () => {
  const { db, raw, who, id, sighting } = await fixture()
  raw.exec("CREATE TRIGGER fail_restore_index BEFORE DELETE ON entry_tags BEGIN SELECT RAISE(ABORT, 'index failure'); END")
  await expect(restoreSighting(db, id, sighting, 1, seen('restored'), who, 1)).rejects.toThrow('index failure')
  expect((await getEntry(db, id))!.sightings[0]).toMatchObject({ place: 'original', rev: 1 })
  expect((await history(db, id))).toHaveLength(2)
})
