import { expect, test } from 'bun:test'
import { openTestDb } from './testdb'
import {
  addSighting,
  createEntry,
  editSighting,
  getEntry,
  mergeEntry,
  moveSighting,
  putBackSighting,
  removeSighting,
  setHidden,
  unmergeEntry,
  type Cite,
  type EntryFields,
  type SightingFields,
} from './entries'
import {
  sourceCitationsRefreshStatements,
  sourceGraph,
  sourceLineage,
  sourcePairSightings,
} from './source-graph'
import { newClaim } from '../claims'

const who = { actor: 'u1', ip: null }
const makeEntry = (ids = '⿰山東'): EntryFields => ({
  description: null,
  radical: null,
  strokes: null,
  claims: [newClaim('ids', ids)],
})

function makeSighting(overrides: Partial<SightingFields> = {}): SightingFields {
  return {
    place: 'p. 1',
    url: null,
    title: 'Book',
    author: null,
    publisher: null,
    report_date: null,
    container: null,
    source_kind: 'book',
    vias: [],
    cites: [],
    original_date: null,
    closeness: null,
    page: null,
    contexts: null,
    style: null,
    types: null,
    note: null,
    quotes: null,
    ...overrides,
  }
}

function makeCite(overrides: Partial<Cite> = {}): Cite {
  return {
    kind: 'quotes',
    sighting: null,
    url: null,
    title: null,
    author: null,
    publisher: null,
    report_date: null,
    container: null,
    source_kind: null,
    quote: null,
    note: null,
    ...overrides,
  }
}

async function setup() {
  const testDb = openTestDb()
  await testDb.db.prepare("INSERT INTO people(id, name, created_at) VALUES ('u1', 'Tester', '2026-01-01')").run()
  return testDb
}

test('source_citations tracks create, edit, hide, remove, restore, merge, unmerge, move, and orphan cleanup', async () => {
  const { db, raw } = await setup()
  // Entry 1: 字彙補 (1666) -> 康熙字典 (1716) -> 漢語大字典 (1990), plus unseen 龍龕手鑑 (997)
  const e1 = await createEntry(db, makeEntry('⿰山東'), makeSighting({ title: '字彙補', report_date: '1666', place: '字彙補 卷1' }), [], who)
  const sZihui1 = (await getEntry(db, e1))!.sightings[0]
  const sKangxi1 = await addSighting(db, e1, makeSighting({
    title: '康熙字典',
    report_date: '1716',
    place: '康熙字典 頁10',
    cites: [
      makeCite({ sighting: sZihui1.id, quote: '《字彙補》音東' }),
      makeCite({ title: '龍龕手鑑', report_date: '997', source_kind: 'book', quote: '《龍龕》未見' }),
    ],
  }), [], who)
  await addSighting(db, e1, makeSighting({
    title: '漢語大字典',
    report_date: '1990',
    place: '漢語大字典 頁200',
    cites: [makeCite({ sighting: sKangxi1!, kind: 'derived', note: 'Same gloss' })],
  }), [], who)

  // Entry 2: second character where 康熙字典 also quotes 字彙補 -> distinct record count becomes 2
  const e2 = await createEntry(db, makeEntry('⿰山西'), makeSighting({ title: '字彙補', report_date: '1666', place: '字彙補 卷2' }), [], who)
  const sZihui2 = (await getEntry(db, e2))!.sightings[0]
  const sKangxi2 = await addSighting(db, e2, makeSighting({
    title: '康熙字典',
    report_date: '1716',
    place: '康熙字典 頁11',
    cites: [makeCite({ sighting: sZihui2.id, quote: '《字彙補》音西' })],
  }), [], who)

  const srcId = (title: string) => (raw.query('SELECT id FROM sources WHERE title = ?').get(title) as { id: number }).id
  const idLongkan = srcId('龍龕手鑑')
  const idZihui = srcId('字彙補')
  const idKangxi = srcId('康熙字典')
  const idHanyu = srcId('漢語大字典')

  // Check lineage on 康熙字典
  const lineage = await sourceLineage(db, idKangxi)
  expect(lineage.cites.map(p => [p.id, p.shared, p.quotes])).toEqual([
    [idZihui, 2, 2],
    [idLongkan, 1, 1],
  ])
  expect(lineage.citedBy.map(p => [p.id, p.shared, p.derived])).toEqual([
    [idHanyu, 1, 1],
  ])
  expect(lineage.graph?.edges).toHaveLength(3)

  // Check pair sightings (康熙字典 -> 字彙補) + exact summary count
  const pair = (await sourcePairSightings(db, idKangxi, idZihui))!
  expect(pair.summary).toEqual({ records: 2, quotes: 2, edition: 0, derived: 0 })
  expect(pair.items).toHaveLength(2)
  expect(pair.items.map(i => i.quote)).toEqual(['《字彙補》音東', '《字彙補》音西'])
  expect(pair.hasMore).toBe(false)

  // Unseen pair (康熙字典 -> 龍龕手鑑)
  const unseenPair = (await sourcePairSightings(db, idKangxi, idLongkan))!
  expect(unseenPair.items).toHaveLength(1)
  expect(unseenPair.items[0].cited_sighting_id).toBeNull()

  // Merge e2 into e1 -> both sightings now belong to e1, so distinct record count drops from 2 to 1
  expect((await mergeEntry(db, e2, e1, who, 'dup')).ok).toBe(true)
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(1)

  // Unmerge e2 -> distinct record count returns to 2
  expect(await unmergeEntry(db, e2, who)).toBe(true)
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(2)

  // Remove cited sighting sZihui2 -> count drops to 1; putBack restores to 2
  const z2 = (await getEntry(db, e2))!.sightings.find(s => s.id === sZihui2.id)!
  expect(await removeSighting(db, e2, z2.id, z2.rev, who, 'remove')).toBe('done')
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(1)
  expect(await putBackSighting(db, e2, z2.id, who)).toBe('done')
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(2)

  // Move sighting sKangxi2 to a third entry e3 -> still 2 distinct entries (e1 and e3)
  const e3 = await createEntry(db, makeEntry('⿰山南'), makeSighting({ title: '說文解字', report_date: '100', place: '說文' }), [], who)
  const k2 = (await getEntry(db, e2))!.sightings.find(s => s.id === sKangxi2!)!
  expect(await moveSighting(db, e2, k2.id, k2.rev, e3, who, 'move')).toBe('done')
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(2)

  // Moderator-hide e3 -> drops back to 1
  expect(await setHidden(db, { entry: e3 }, true, who, 'hide')).toBe(true)
  expect((await sourceLineage(db, idKangxi)).cites.find(p => p.id === idZihui)?.shared).toBe(1)

  // Edit sKangxi1 to remove unseen stub 龍龕手鑑 -> orphan source deleted cleanly without FK violation
  const k1 = (await getEntry(db, e1))!.sightings.find(s => s.id === sKangxi1!)!
  const edited = await editSighting(db, k1.id, k1.rev, makeSighting({
    title: '康熙字典',
    report_date: '1716',
    place: '康熙字典 頁10',
    cites: [makeCite({ sighting: sZihui1.id, quote: '《字彙補》音東' })],
  }), null, who, 'drop unseen', e1)
  expect(edited.ok).toBe(true)
  expect(raw.query('SELECT id FROM sources WHERE id = ?').get(idLongkan)).toBeNull()
  expect((await sourceLineage(db, idKangxi)).cites.map(p => p.id)).toEqual([idZihui])

  // Change citing sighting's source from 康熙字典 -> 新康熙字典 while keeping cites: old edge drops, new edge appears
  const k1b = (await getEntry(db, e1))!.sightings.find(s => s.id === sKangxi1!)!
  const swapped = await editSighting(db, k1b.id, k1b.rev, makeSighting({
    title: '新康熙字典',
    report_date: '1717',
    place: '新康熙字典 頁10',
    cites: [makeCite({ sighting: sZihui1.id, quote: '《字彙補》音東' })],
  }), null, who, 'swap citing source', e1)
  expect(swapped.ok).toBe(true)
  const idNewKangxi = srcId('新康熙字典')
  expect((await sourceLineage(db, idKangxi)).cites).toEqual([])
  expect((await sourceLineage(db, idNewKangxi)).cites.map(p => [p.id, p.shared])).toEqual([[idZihui, 1]])
  // Downstream 漢語大字典 cited sKangxi1, so its cited source updated automatically to 新康熙字典 too
  expect((await sourceLineage(db, idNewKangxi)).citedBy.map(p => p.id)).toEqual([idHanyu])
  expect((await sourceLineage(db, idKangxi)).citedBy).toEqual([])
  expect(raw.query('PRAGMA foreign_key_check').all()).toEqual([])
})

test('sourceGraph walks 2 hops, sets truncated only when hop 3 exists, and passes EXPLAIN QUERY PLAN with index-drop proof', async () => {
  const { db, raw } = await setup()
  // Build a 4-work chain W1 -> W2 -> W3 -> W4 (3 edges)
  const e = await createEntry(db, makeEntry('⿰木甲'), makeSighting({ title: 'W1', report_date: '1500' }), [], who)
  const s1 = (await getEntry(db, e))!.sightings[0].id
  const s2 = (await addSighting(db, e, makeSighting({ title: 'W2', report_date: '1600', cites: [makeCite({ sighting: s1 })] }), [], who))!
  const s3 = (await addSighting(db, e, makeSighting({ title: 'W3', report_date: '1700', cites: [makeCite({ sighting: s2 })] }), [], who))!

  const idOf = (title: string) => (raw.query('SELECT id FROM sources WHERE title = ?').get(title) as { id: number }).id
  const w1 = idOf('W1')
  const w2 = idOf('W2')
  const w3 = idOf('W3')

  // 2-hop chain from W1 reaches W3 with truncated = false
  const exact = (await sourceGraph(db, w1))!
  expect(exact.graph.nodes.map(n => n.id).sort((a, b) => a - b)).toEqual([w1, w2, w3])
  expect(exact.graph.truncated).toBe(false)

  // Add hop 3 (W3 -> W4): now focal W1 stops at W3 and sets truncated = true!
  await addSighting(db, e, makeSighting({ title: 'W4', report_date: '1800', cites: [makeCite({ sighting: s3 })] }), [], who)
  const w4 = idOf('W4')

  const plans: { sql: string; detail: string }[] = []
  const traced = {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      return {
        bind(...values: unknown[]) {
          const bound = stmt.bind(...values)
          const explain = () => {
            const detail = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
            plans.push({ sql, detail })
          }
          return {
            sql,
            values,
            inner: bound,
            all: () => { explain(); return bound.all() },
            first: () => { explain(); return bound.first() },
            run: () => { explain(); return bound.run() },
          }
        },
        all: () => {
          const detail = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map(r => r.detail).join('\n')
          plans.push({ sql, detail })
          return stmt.all()
        },
        first: () => {
          const detail = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map(r => r.detail).join('\n')
          plans.push({ sql, detail })
          return stmt.first()
        },
      }
    },
    batch(stmts: { sql?: string; values?: unknown[]; inner?: unknown }[]) {
      for (const s of stmts) {
        if (s.sql) {
          const detail = (raw.query(`EXPLAIN QUERY PLAN ${s.sql}`).all(...((s.values ?? []) as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
          plans.push({ sql: s.sql, detail })
        }
      }
      return db.batch(stmts.map(s => s.inner ?? s) as never)
    },
  } as unknown as D1Database

  const deeper = (await sourceGraph(traced, w1))!
  expect(deeper.graph.truncated).toBe(true)
  expect(deeper.graph.nodes.map(n => n.id)).not.toContain(w4)

  // Also trace global graph, sourceLineage, sourcePairSightings, and refresh statements
  const globalRes = (await sourceGraph(traced, null))!
  expect(globalRes.graph.edges).toHaveLength(3)
  await sourceLineage(traced, w2)
  await sourcePairSightings(traced, w2, w1)
  const writePlans: { sql: string; detail: string }[] = []
  for (const stmt of sourceCitationsRefreshStatements(traced, e) as unknown as { sql: string; values: unknown[] }[]) {
    const detail = (raw.query(`EXPLAIN QUERY PLAN ${stmt.sql}`).all(...(stmt.values as never[])) as { detail: string }[]).map(r => r.detail).join('\n')
    writePlans.push({ sql: stmt.sql, detail })
  }

  expect(plans.length).toBeGreaterThan(0)
  for (const { sql, detail } of plans) {
    for (const line of detail.split('\n')) {
      expect(line, `temp sort in read query ${sql}`).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/)
      if (/\bSCAN\b/.test(line) && !/USING (?:COVERING )?INDEX|VIRTUAL TABLE/.test(line)) {
        throw new Error(`Unindexed table SCAN in read query:\n${sql}\nPlan:\n${detail}`)
      }
    }
  }
  // Pair query must read directly from source_citation_edges_by_pair (never scanning sightings_by_source).
  const pairPlan = plans.find(p => p.sql.includes('source_citation_edges_by_pair'))!
  expect(pairPlan.detail).toContain('source_citation_edges_by_pair')
  expect(pairPlan.detail).not.toContain('sightings_by_source')

  expect(writePlans).toHaveLength(5)
  for (const { sql, detail } of writePlans) {
    expect(detail).not.toContain('sightings_by_source')
    for (const line of detail.split('\n')) {
      if (/\bSCAN\b/.test(line) && !/USING (?:COVERING )?INDEX|VIRTUAL TABLE|CONSTANT ROW|affected\b|old_pairs\b|new_pairs\b|p\b|SUBQUERY/.test(line)) {
        throw new Error(`Unindexed table SCAN in write query:\n${sql}\nPlan:\n${detail}`)
      }
    }
  }

  // Index-drop proof: dropping any of our 4 serving indexes breaks pinned queries.
  for (const idx of ['source_citations_by_records', 'source_citations_by_citing', 'source_citations_by_cited', 'source_citation_edges_by_pair']) {
    const broken = await setup()
    broken.raw.exec(`DROP INDEX ${idx}`)
    if (idx === 'source_citations_by_records') {
      await expect(sourceGraph(broken.db, null)).rejects.toThrow()
    } else if (idx === 'source_citation_edges_by_pair') {
      await expect(sourcePairSightings(broken.db, 2, 1)).rejects.toThrow()
    } else {
      await expect(sourceLineage(broken.db, 1)).rejects.toThrow()
    }
  }
})
