import { describe, expect, test } from 'bun:test'
import { FAVOURITES_HELD, FavouriteError, favouriteCountQuery, favouriteEntries, favouriteIds, favouriteIdsQuery, favouritePageQuery, setFavourite } from './favourites'
import { openTestDb } from './testdb'

function setup() {
  const { db, raw } = openTestDb()
  raw.exec(`INSERT INTO people(id, name, created_at) VALUES ('u1', 'One', '2026'), ('u2', 'Two', '2026'), ('u3', 'Three', '2026');
    INSERT INTO entries(id, script, ids, sightings, created_by, created_at, updated_at) VALUES
      (1, 'han', '⿰木木', 1, 'u1', '2026', '2026'),
      (2, 'han', '⿰火火', 2, 'u1', '2026', '2026'),
      (3, 'han', '⿰水水', 1, 'u1', '2026', '2026'),
      (4, 'han', '⿰土土', 1, 'u1', '2026', '2026');
    UPDATE entries SET merged_into = 2 WHERE id = 4;`)
  return { db, raw }
}

describe('favourites', () => {
  test('lists live starred records newest first, resolves merged ones and omits hidden ones', async () => {
    const { db, raw } = setup()
    const star = raw.prepare('INSERT INTO favourites(person, entry_id, at) VALUES(?, ?, ?)')
    star.run('u1', 1, 1000)
    star.run('u1', 4, 2000) // merged into 2
    star.run('u1', 3, 3000)
    star.run('u2', 2, 4000)

    expect((await favouriteIds(db, 'u1')).ids).toEqual([3, 2, 1])

    const pages = await Promise.all([
      favouriteEntries(db, 'u1', 0, 60),
      favouriteEntries(db, 'u1', 0, 2),
      favouriteEntries(db, 'u1', 2, 2),
    ])
    expect(pages.map(page => ({ ...page, tiles: page.tiles.map(tile => tile.id) }))).toEqual([
      { tiles: [3, 2, 1], total: 3, offset: 0, next: null },
      { tiles: [3, 2], total: 3, offset: 0, next: 2 },
      { tiles: [1], total: 3, offset: 2, next: null },
    ])
    expect(await favouriteEntries(db, 'u3', 0, 60)).toEqual({ tiles: [], total: 0, offset: 0, next: null })

    // Deduplicate if both target and merged source are starred, keeping newest order.
    star.run('u1', 2, 500)
    expect((await favouriteIds(db, 'u1')).ids).toEqual([3, 2, 1])
    expect((await favouriteEntries(db, 'u1', 0, 60)).tiles.map(tile => tile.id)).toEqual([3, 2, 1])

    // Hidden record disappears from reads and returns when unhidden.
    raw.exec("UPDATE entries SET hidden_at = '2026' WHERE id = 3")
    expect((await favouriteIds(db, 'u1')).ids).toEqual([2, 1])
    expect((await favouriteEntries(db, 'u1', 0, 60)).tiles.map(tile => tile.id)).toEqual([2, 1])
    raw.exec('UPDATE entries SET hidden_at = NULL WHERE id = 3')
    expect((await favouriteIds(db, 'u1')).ids).toEqual([3, 2, 1])
  })

  test('stars and unstars records, resolves merges and rejects invalid inputs', async () => {
    const { db, raw } = setup()
    expect(await setFavourite(db, 'u3', 1, true)).toEqual({ entry: 1, favourite: true })
    expect((await favouriteIds(db, 'u3')).ids).toEqual([1])

    // Starring a merged entry resolves to its target.
    expect(await setFavourite(db, 'u3', 4, true)).toEqual({ entry: 2, favourite: true })
    expect((await favouriteIds(db, 'u3')).ids).toEqual([2, 1])

    expect(await setFavourite(db, 'u3', 1, false)).toEqual({ entry: 1, favourite: false })
    expect((await favouriteIds(db, 'u3')).ids).toEqual([2])

    // Unstarring a target also removes a star stored against a record merged into it.
    raw.exec('DELETE FROM favourites WHERE person = "u3"; INSERT INTO favourites(person, entry_id, at) VALUES ("u3", 4, 100)')
    expect((await favouriteIds(db, 'u3')).ids).toEqual([2])
    expect(await setFavourite(db, 'u3', 2, false)).toEqual({ entry: 2, favourite: false })
    expect((await favouriteIds(db, 'u3')).ids).toEqual([])

    raw.exec("UPDATE entries SET hidden_at = '2026' WHERE id = 3")
    for (const bad of [0, -1, 1.5, '1', null]) {
      await expect(setFavourite(db, 'u3', bad, true)).rejects.toBeInstanceOf(FavouriteError)
    }
    await expect(setFavourite(db, 'u3', 1, 'yes')).rejects.toBeInstanceOf(FavouriteError)
    await expect(setFavourite(db, 'u3', 999, true)).rejects.toMatchObject({ status: 404 })
    await expect(setFavourite(db, 'u3', 3, true)).rejects.toMatchObject({ status: 404 })
    // Unstarring a hidden or missing record succeeds cleanly.
    expect(await setFavourite(db, 'u3', 3, false)).toEqual({ entry: 3, favourite: false })
  })

  test(`holds at most ${FAVOURITES_HELD} records per person`, async () => {
    const { db, raw } = setup()
    raw.prepare(`WITH RECURSIVE seq(x) AS (VALUES(10) UNION ALL SELECT x + 1 FROM seq WHERE x < ?)
      INSERT INTO entries(id, script, created_by, created_at, updated_at) SELECT x, 'han', 'u1', '2026', '2026' FROM seq`).run(10 + FAVOURITES_HELD)
    const star = raw.prepare('INSERT INTO favourites(person, entry_id, at) VALUES (?, ?, ?)')
    for (let i = 0; i < FAVOURITES_HELD; i++) star.run('u3', 10 + i, i)

    // Re-starring an existing entry still succeeds, while adding one beyond the cap fails with 429.
    expect(await setFavourite(db, 'u3', 10, true)).toEqual({ entry: 10, favourite: true })
    await expect(setFavourite(db, 'u3', 1, true)).rejects.toMatchObject({ status: 429 })
  })

  test('reads favourites by the person and time index without scans or temp B-trees', () => {
    const { raw } = setup()
    for (const [sql, values] of [
      [favouriteIdsQuery(), ['u1', 10]],
      [favouritePageQuery(), ['u1', 10, 0]],
      [favouriteCountQuery(), ['u1']],
    ] as const) {
      const details = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...values) as { detail: string }[]).map(row => row.detail)
      expect(details.some(detail => detail.includes('SCAN favourites'))).toBe(false)
      expect(details.some(detail => detail.includes('TEMP B-TREE'))).toBe(false)
    }
  })
})
