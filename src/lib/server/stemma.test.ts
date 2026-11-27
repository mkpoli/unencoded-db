import { expect, test } from 'bun:test'
import { openTestDb } from './testdb'
import { addSighting, createEntry, entryStemma, getEntry, setHidden, type Cite, type EntryFields, type SightingFields } from './entries'
import { layoutStemma, witnessNodeId } from '../stemma'
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

test('entryStemma traverses multi-hop cross-record chains up to 4 hops, respects moderator hides, and uses indexes', async () => {
  const { db, raw } = setup()
  // Build a 6-node chain across 6 entries: e1 -> e2 -> e3 -> e4 -> e5 -> e6
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
  const e6 = await createEntry(db, makeEntry('⿰山六'), makeSighting({ title: 'Work 6', report_date: '2000', url: 'https://example.test/6', cites: [makeCite({ kind: 'quotes', sighting: s5 })] }), [], who)
  const s6 = (await getEntry(db, e6))!.sightings[0].id

  // Also add a moderator-hidden sighting citing s1 so we verify it is never surfaced.
  const sHidden = (await addSighting(db, e1, makeSighting({ title: 'Secret', report_date: '1550', url: 'https://example.test/hidden', cites: [makeCite({ kind: 'quotes', sighting: s1 })] }), [], who))!
  expect(await setHidden(db, { entry: e1, sighting: sHidden }, true, who, 'mod')).toBe(true)

  // Trace EXPLAIN QUERY PLAN during entryStemma(e1): reaches s1..s5 (4 hops), marks truncated because s6 is at hop 5.
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

  const result = (await entryStemma(traced, e1))!
  expect(result).not.toBeNull()
  const ids = result.graph.nodes.map(n => n.id)
  expect(ids).toContain(witnessNodeId(s1))
  expect(ids).toContain(witnessNodeId(s5))
  expect(ids).not.toContain(witnessNodeId(s6))
  expect(ids).not.toContain(witnessNodeId(sHidden))
  expect(result.graph.truncated).toBe(true)

  // Verify layout produces valid increasing columns across hops.
  const layout = layoutStemma(result.graph, 'full')
  expect(layout.cols).toBe(4) // s3 & s4 bundle into one edition cluster!
  expect(plans.length).toBeGreaterThanOrEqual(4)
  const joined = plans.join('\n---\n')
  expect(joined).not.toMatch(/SCAN (?:sighting_cites|sc|sightings|s|t|sources|entries|e)\b/)
  expect(joined).toContain('sighting_cites_by_cited')
})
