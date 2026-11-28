import { expect, test } from 'bun:test'
import { openTestDb } from './testdb'
import { addSighting, createEntry, entryStemma, getEntry, mergeEntry, removeSighting, setHidden, type Cite, type EntryFields, type SightingFields } from './entries'
import { buildEntryStemma, layoutStemma, removedNodeId, witnessNodeId } from '../stemma'
import { newClaim } from '../claims'

const who = { actor: 'u1', ip: null }
const makeEntry = (ids = '⿰山東'): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', ids)] })

function makeSighting(overrides: Partial<SightingFields> = {}): SightingFields {
  return {
    place: 'Book p. 1',
    url: 'https://example.test/book',
    title: 'Book',
    author: null,
    publisher: null,
    report_date: null,
    container: null,
    source_kind: null,
    vias: [],
    cites: [],
    original_date: null,
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

function setup() {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id, name, created_at) VALUES ('u1', 'Tester', '2026-01-01T00:00:00.000Z')")
  return { db, raw }
}

test('entryStemma walks 4 hops cleanly, sets truncated only when hop 5 exists, and uses indexes with no temp sorts', async () => {
  const { db, raw } = setup()
  // Build a 5-node chain (exact 4-hop reach from e1: s1 -> s2 -> s3 -> s4 -> s5).
  const e1 = await createEntry(db, makeEntry('⿰山一'), makeSighting({ title: 'Work 1', report_date: '1500', url: 'https://example.test/1' }), [], who)
  const s1 = (await getEntry(db, e1))!.sightings[0].id
  const e2 = await createEntry(db, makeEntry('⿰山二'), makeSighting({ title: 'Work 2', report_date: '1600', url: 'https://example.test/2', cites: [makeCite({ kind: 'quotes', sighting: s1 })] }), [], who)
  const s2 = (await getEntry(db, e2))!.sightings[0].id
  const e3 = await createEntry(db, makeEntry('⿰山三'), makeSighting({ title: 'Work 3', report_date: '1700', url: 'https://example.test/3', cites: [makeCite({ kind: 'quotes', sighting: s2 })] }), [], who)
  const s3 = (await getEntry(db, e3))!.sightings[0].id
  const e4 = await createEntry(db, makeEntry('⿰山四'), makeSighting({ title: 'Work 4', report_date: '1800', url: 'https://example.test/4', cites: [makeCite({ kind: 'edition', sighting: s3 })] }), [], who)
  const s4 = (await getEntry(db, e4))!.sightings[0].id
  const e5 = await createEntry(db, makeEntry('⿰山五'), makeSighting({ title: 'Work 5', report_date: '1900', url: 'https://example.test/5', cites: [makeCite({ kind: 'derived', sighting: s4, note: 're-cut' })] }), [], who)
  const s5 = (await getEntry(db, e5))!.sightings[0].id

  // Chain terminates at hop 4 -> NOT truncated!
  const exact = (await entryStemma(db, e1))!
  expect(exact.graph.nodes.map(n => n.id)).toContain(witnessNodeId(s5))
  expect(exact.graph.truncated).toBe(false)

  // Start from middle entry e3 -> walks both outbound (s2, s1) and inbound (s4, s5) cleanly!
  const mid = (await entryStemma(db, e3))!
  expect(mid.graph.nodes.map(n => n.id)).toEqual(expect.arrayContaining([witnessNodeId(s1), witnessNodeId(s2), witnessNodeId(s3), witnessNodeId(s4), witnessNodeId(s5)]))
  expect(mid.graph.truncated).toBe(false)

  // Add hop-5 node s6 -> now entryStemma(e1) stops at s5 and sets truncated = true!
  const e6 = await createEntry(db, makeEntry('⿰山六'), makeSighting({ title: 'Work 6', report_date: '2000', url: 'https://example.test/6', cites: [makeCite({ kind: 'quotes', sighting: s5 })] }), [], who)
  const s6 = (await getEntry(db, e6))!.sightings[0].id

  const plans: string[] = []
  const traced = {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      const wrap = (values: unknown[]) => ({
        sql,
        values,
        bind: (...more: unknown[]) => wrap(more),
        all: () => stmt.bind(...values).all(),
        first: () => stmt.bind(...values).first(),
        run: () => stmt.bind(...values).run(),
        sync: () => (stmt.bind(...values) as unknown as { sync(): unknown[] }).sync(),
      })
      return wrap([])
    },
    async batch(statements: { sql?: string; values?: unknown[]; sync(): unknown[] }[]) {
      for (const s of statements) {
        if (s.sql && s.sql.includes('sighting_cites')) {
          plans.push((raw.query(`EXPLAIN QUERY PLAN ${s.sql}`).all(...((s.values ?? []) as never[])) as { detail: string }[]).map(r => r.detail).join('\n'))
        }
      }
      return db.batch(statements as never)
    },
  } as unknown as D1Database

  const deeper = (await entryStemma(traced, e1))!
  const ids = deeper.graph.nodes.map(n => n.id)
  expect(ids).toContain(witnessNodeId(s1))
  expect(ids).toContain(witnessNodeId(s5))
  expect(ids).not.toContain(witnessNodeId(s6))
  expect(deeper.graph.truncated).toBe(true)

  const layout = layoutStemma(deeper.graph, 'full')
  expect(layout.cols).toBe(4) // s3 & s4 bundle into one edition cluster.
  const joined = plans.join('\n---\n')
  expect(joined).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/)
  expect(joined).not.toMatch(/SCAN (?:sighting_cites|sc|sightings|s|t|sources|entries|e)\b/)
  expect(joined).toContain('sighting_cites_by_cited')

  // Index-drop proof: dropping sighting_cites_by_cited makes the pinned walk fail.
  const broken = setup()
  const b1 = await createEntry(broken.db, makeEntry('⿰山一'), makeSighting({ title: 'W1', url: 'https://example.test/b1' }), [], who)
  const bs1 = (await getEntry(broken.db, b1))!.sightings[0].id
  await createEntry(broken.db, makeEntry('⿰山二'), makeSighting({ title: 'W2', url: 'https://example.test/b2', cites: [makeCite({ kind: 'quotes', sighting: bs1 })] }), [], who)
  broken.raw.exec('DROP INDEX sighting_cites_by_cited')
  await expect(entryStemma(broken.db, b1)).rejects.toThrow()
})

test('entryStemma respects moderator hides, removed/unseen stubs, merged fast-return, and strip-vs-full year parity', async () => {
  const { db } = setup()
  const eHidden = await createEntry(db, makeEntry('⿰山甲'), makeSighting({ title: 'ModHidden', report_date: '1500', url: 'https://example.test/mh' }), [], who)
  const sHiddenTarget = (await getEntry(db, eHidden))!.sightings[0].id
  const eMain = await createEntry(db, makeEntry('⿰山乙'), makeSighting({ title: 'RemovedWitness', report_date: '1600', url: 'https://example.test/rw' }), [], who)
  const sRemoved = (await getEntry(db, eMain))!.sightings[0].id
  // Deliberately give original_date (1750) > report_date (1716) to verify strip & full stemma both use min(original, report) = 1716.
  const sMain = (await addSighting(db, eMain, makeSighting({
    title: 'MainBook',
    original_date: '1750',
    report_date: '1716',
    url: 'https://example.test/main',
    cites: [
      makeCite({ kind: 'quotes', sighting: sHiddenTarget }),
      makeCite({ kind: 'quotes', sighting: sRemoved }),
      makeCite({ kind: 'quotes', title: '龍龕手鑑', report_date: '997' }),
    ],
  }), [], who))!

  expect(await setHidden(db, { entry: eHidden, sighting: sHiddenTarget }, true, who, 'mod')).toBe(true)
  expect(await removeSighting(db, eMain, sRemoved, 1, who, 'dup')).toBe('done')

  const full = (await entryStemma(db, eMain))!
  const strip = buildEntryStemma(eMain, (await getEntry(db, eMain))!.sightings, full.dates)!

  // Moderator-hidden target is suppressed; removed & unseen stubs appear.
  expect(full.graph.nodes.some(n => n.sightingId === sHiddenTarget)).toBe(false)
  expect(full.graph.nodes.some(n => n.id === removedNodeId(sRemoved) && n.kind === 'removed')).toBe(true)
  expect(full.graph.nodes.some(n => n.kind === 'unseen' && n.title === '龍龕手鑑')).toBe(true)

  // Strip and full stemma compute identical years for MainBook.
  const fullMain = full.graph.nodes.find(n => n.id === witnessNodeId(sMain))!
  const stripMain = strip.nodes.find(n => n.id === witnessNodeId(sMain))!
  expect(fullMain.year).toBe(1716)
  expect(stripMain.year).toBe(1716)

  // Merged entry returns immediately without walking.
  const eDup = await createEntry(db, makeEntry('⿰山丙'), makeSighting({ title: 'Dup', url: 'https://example.test/dup' }), [], who)
  expect((await mergeEntry(db, eDup, eMain, who, null)).ok).toBe(true)
  const merged = (await entryStemma(db, eDup))!
  expect(merged.entry.merged_into).toBe(eMain)
  expect(merged.graph.nodes).toEqual([])

  // Hidden entry returns null.
  expect(await setHidden(db, { entry: eMain }, true, who, 'mod')).toBe(true)
  expect(await entryStemma(db, eMain)).toBeNull()
})
