import { expect, test } from 'bun:test'
import { openTestDb } from './testdb'
import {
  addSighting,
  citeRows,
  CiteValidationError,
  createEntry,
  editSighting,
  exportPage,
  getEntry,
  getSighting,
  getVisibleSource,
  history,
  linkSightings,
  mergeEntry,
  moveSighting,
  preserveHiddenCites,
  putBackSighting,
  rawCitesOfSighting,
  removeSighting,
  restoreSighting,
  setHidden,
  sourcePage,
  unmergeEntry,
  type Cite,
  type EntryFields,
  type SightingFields,
} from './entries'
import { sightingSnapshot } from './revisions'
import { csvHeader, csvRows } from './export'
import { newClaim } from '../claims'

const who = { actor: 'u1', ip: null }

function makeEntry(ids = '⿰山東'): EntryFields {
  return { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', ids)] }
}

function makeSighting(overrides: Partial<SightingFields> = {}): SightingFields {
  return {
    place: 'Book p. 1',
    url: 'https://example.test/book',
    title: '字彙補',
    author: '吳任臣',
    publisher: null,
    report_date: '1666',
    container: null,
    source_kind: null,
    vias: [],
    cites: [],
    original_date: null,
    page: '1',
    contexts: null,
    style: null,
    types: null,
    note: null,
    quotes: null,
    closeness: null,
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

test('cross-record cites, inbound cited_by, unseen stubs, and snapshot restore', async () => {
  const { db } = setup()
  const entryA = await createEntry(db, makeEntry('⿰山東'), makeSighting({ title: '字彙補', report_date: '1666', url: 'https://example.test/zihui' }), [], who)
  const sA = (await getEntry(db, entryA))!.sightings[0].id

  const entryB = await createEntry(db, makeEntry('⿰山東'), makeSighting({
    place: 'Kangxi p. 10',
    title: '康熙字典',
    report_date: '1716',
    url: 'https://example.test/kangxi',
    cites: [
      makeCite({ kind: 'quotes', sighting: sA, title: '字彙補', quote: '《字彙補》音東' }),
      makeCite({ kind: 'quotes', title: '龍龕手鑑', report_date: '997', quote: '見《龍龕》' }),
    ],
  }), [], who)

  const gotA = (await getEntry(db, entryA))!
  const gotB = (await getEntry(db, entryB))!
  const sB = gotB.sightings[0]

  expect(sB.cites).toHaveLength(2)
  expect(sB.cites[0]).toMatchObject({ kind: 'quotes', status: 'witness', sighting: sA, title: '字彙補', quote: '《字彙補》音東' })
  expect(sB.cites[0].target).toMatchObject({ id: sA, entry_id: entryA, title: '字彙補', report_date: '1666' })
  expect(sB.cites[1]).toMatchObject({ kind: 'quotes', status: 'unseen', sighting: null, title: '龍龕手鑑', report_date: '997', quote: '見《龍龕》' })
  expect(sB.cites[1].source_id).toBeNumber()

  // Cross-record inbound cite appears on entry A's sighting.
  expect(gotA.sightings[0].cited_by).toHaveLength(1)
  expect(gotA.sightings[0].cited_by[0]).toMatchObject({ kind: 'quotes', sighting_id: sB.id, entry_id: entryB, title: '康熙字典', quote: '《字彙補》音東' })

  // Snapshot round-trip & restore preserves cites.
  const rev1 = (await history(db, entryB)).find(row => row.sighting_id === sB.id)!
  const parsed = sightingSnapshot(rev1.snapshot)!
  expect(parsed.cites).toHaveLength(2)
  expect(parsed.cites![0]).toMatchObject({ kind: 'quotes', sighting: sA, title: '字彙補' })

  // Edit away cites, then restore rev 1.
  const cleared = await editSighting(db, sB.id, sB.rev, makeSighting({ place: 'Kangxi p. 10', title: '康熙字典', report_date: '1716', url: 'https://example.test/kangxi', cites: [] }), null, who, 'clear', entryB)
  expect(cleared.ok).toBe(true)
  expect((await getSighting(db, sB.id))!.cites).toEqual([])
  const restored = await restoreSighting(db, entryB, sB.id, (cleared as { ok: true; rev: number }).rev, parsed, who, 1, rev1.id)
  expect(restored.ok).toBe(true)
  expect((await getSighting(db, sB.id))!.cites).toHaveLength(2)
})

test('validation rejects derived without note, self-link, missing target, createEntry invalid cites, and transitive cycles', async () => {
  const { db } = setup()
  await expect(createEntry(db, makeEntry(), makeSighting({ cites: [makeCite({ kind: 'quotes', sighting: 99999 })] }), [], who)).rejects.toBeInstanceOf(CiteValidationError)
  await expect(createEntry(db, makeEntry(), makeSighting({ cites: [makeCite({ kind: 'derived', title: 'X', note: null })] }), [], who)).rejects.toBeInstanceOf(CiteValidationError)

  const entry = await createEntry(db, makeEntry(), makeSighting({ title: 'Book A', url: 'https://example.test/a' }), [], who)
  const s1 = (await getEntry(db, entry))!.sightings[0].id
  const s2 = (await addSighting(db, entry, makeSighting({ title: 'Book B', url: 'https://example.test/b', cites: [makeCite({ kind: 'quotes', sighting: s1 })] }), [], who))!
  const s3 = (await addSighting(db, entry, makeSighting({ title: 'Book C', url: 'https://example.test/c', cites: [makeCite({ kind: 'quotes', sighting: s2 })] }), [], who))!

  await expect(addSighting(db, entry, makeSighting({ url: 'https://example.test/d', cites: [makeCite({ kind: 'derived', sighting: s1, note: null })] }), [], who)).rejects.toBeInstanceOf(CiteValidationError)
  await expect(addSighting(db, entry, makeSighting({ url: 'https://example.test/e', cites: [makeCite({ kind: 'quotes', sighting: 99999 })] }), [], who)).rejects.toBeInstanceOf(CiteValidationError)

  const selfRes = await editSighting(db, s1, 1, makeSighting({ title: 'Book A', url: 'https://example.test/a', cites: [makeCite({ kind: 'quotes', sighting: s1 })] }), null, who, null, entry)
  expect(selfRes).toEqual({ ok: false, code: 'citeSelf' })

  const twoCycle = await editSighting(db, s1, 1, makeSighting({ title: 'Book A', url: 'https://example.test/a', cites: [makeCite({ kind: 'quotes', sighting: s2 })] }), null, who, null, entry)
  expect(twoCycle).toEqual({ ok: false, code: 'citeCycle' })

  // Transitive 3-cycle (s1 -> s3 -> s2 -> s1) is also rejected.
  const threeCycle = await editSighting(db, s1, 1, makeSighting({ title: 'Book A', url: 'https://example.test/a', cites: [makeCite({ kind: 'derived', sighting: s3, note: 'mutual web link' })] }), null, who, null, entry)
  expect(threeCycle).toEqual({ ok: false, code: 'citeCycle' })
})

test('visibility fallback preserves hidden cites across edits and linkSightings without mutating removed targets', async () => {
  const { db, raw } = setup()
  const entry = await createEntry(db, makeEntry(), makeSighting({ title: 'Anchor', url: 'https://example.test/anchor' }), [], who)
  const sNamed = (await addSighting(db, entry, makeSighting({ title: '玉篇 宋本', url: 'https://example.test/yupian' }), [], who))!
  const sRemoved = (await addSighting(db, entry, makeSighting({ title: '集韻', url: 'https://example.test/jiyun' }), [], who))!
  const sModHidden = (await addSighting(db, entry, makeSighting({ title: 'Secret', url: 'https://example.test/secret' }), [], who))!
  const sExtra = (await addSighting(db, entry, makeSighting({ title: '類篇', url: 'https://example.test/leipian' }), [], who))!
  const sCiter = (await addSighting(db, entry, makeSighting({
    title: '康熙字典',
    url: 'https://example.test/kx',
    cites: [
      makeCite({ kind: 'quotes', sighting: sNamed, title: '玉篇' }),
      makeCite({ kind: 'quotes', sighting: sRemoved }),
      makeCite({ kind: 'quotes', sighting: sModHidden }),
    ],
  }), [], who))!

  // Remove sNamed (with own named source) and sRemoved (without own named source); moderator-hide sModHidden.
  expect(await removeSighting(db, entry, sNamed, 1, who, 'dup')).toBe('done')
  expect(await removeSighting(db, entry, sRemoved, 1, who, 'dup')).toBe('done')
  expect(await setHidden(db, { entry, sighting: sModHidden }, true, who, 'mod')).toBe(true)

  const read = (await getSighting(db, sCiter))!
  // Removed cite keeps its own citation fields null (target holds the witness title for display).
  expect(read.cites.map(c => ({ status: c.status, title: c.title, targetTitle: c.target?.title ?? null, sourceId: c.source_id }))).toEqual([
    { status: 'unseen', title: '玉篇', targetTitle: null, sourceId: expect.any(Number) },
    { status: 'removed', title: null, targetTitle: '集韻', sourceId: null },
  ])
  // The moderator-hidden row stays in DB even though suppressed on read & export.
  expect((raw.query('SELECT count(*) AS n FROM sighting_cites WHERE sighting_id = ?').get(sCiter) as { n: number }).n).toBe(3)

  // Editing an unrelated field using preserveHiddenCites keeps the suppressed edge, the hidden cited_id, and the removed row intact.
  const rawBefore = await rawCitesOfSighting(db, sCiter)
  const merged = preserveHiddenCites(read.cites, rawBefore, read.cites)
  const edited = await editSighting(db, sCiter, read.rev, makeSighting({ title: '康熙字典', url: 'https://example.test/kx', page: 'p. 99', cites: merged }), null, who, 'page fix', entry)
  expect(edited.ok).toBe(true)
  const rawAfter = await rawCitesOfSighting(db, sCiter)
  expect(rawAfter.map(c => ({ sighting: c.sighting, title: c.title }))).toEqual([
    { sighting: sNamed, title: '玉篇' },
    { sighting: sRemoved, title: null },
    { sighting: sModHidden, title: null },
  ])

  // linkSightings succeeds on a sighting that already holds a cite to a moderator-hidden witness.
  const linked = await linkSightings(db, sCiter, makeCite({ kind: 'quotes', sighting: sExtra }), who, 'add leipian')
  expect(linked.ok).toBe(true)
  expect((await rawCitesOfSighting(db, sCiter)).map(c => c.sighting)).toEqual([sNamed, sRemoved, sModHidden, sExtra])

  const exported = await exportPage(db, 0, 10)
  const exportedCiter = exported.entries[0].evidence.find(s => s.id === sCiter)!
  expect(exportedCiter.cites.map(c => ({ status: c.status, title: c.title }))).toEqual([
    { status: 'unseen', title: '玉篇' },
    { status: 'removed', title: '集韻' },
    { status: 'witness', title: '類篇' },
  ])
  expect(csvHeader()).toContain('"cites"')
  expect(csvRows(exported.entries)).toContain('玉篇')
  expect(csvRows(exported.entries)).not.toContain('Secret')

  // Put sRemoved back -> returns to witness status.
  expect(await putBackSighting(db, entry, sRemoved, who)).toBe('done')
  const afterPutBack = (await getSighting(db, sCiter))!
  expect(afterPutBack.cites.find(c => c.sighting === sRemoved)?.status).toBe('witness')
})

test('citeRows parses pasted #sighting-N URLs and indexed no-script cite_kind_i radios', () => {
  const form = new FormData()
  form.append('cite_kind', 'quotes')
  form.append('cite_kind_0', 'edition')
  form.append('cite_sighting', 'https://rare.glyphatlas.org/en/entry/12#sighting-42')
  const rows = citeRows(form)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ kind: 'edition', sighting: 42 })
})

test('linkSightings upgrades an unseen stub, preserves visibility across hide/unhide/merge/move, and exposes sourcePage.namedIn', async () => {
  const { db, raw } = setup()
  const entry = await createEntry(db, makeEntry(), makeSighting({
    title: '康熙字典',
    url: 'https://example.test/kx',
    cites: [makeCite({ kind: 'quotes', title: '龍龕手鑑', report_date: '997', quote: '見《龍龕》' })],
  }), [], who)
  const citerId = (await getEntry(db, entry))!.sightings[0].id
  const stubSourceId = (await getSighting(db, citerId))!.cites[0].source_id!

  // Source is visible through namedIn even with 0 direct/via sightings.
  expect((raw.query('SELECT records FROM sources WHERE id = ?').get(stubSourceId) as { records: number })).toEqual({ records: 0 })
  expect(await getVisibleSource(db, stubSourceId)).not.toBeNull()
  const pageBefore = (await sourcePage(db, stubSourceId))!
  expect(pageBefore.sightings).toEqual([])
  expect(pageBefore.namedIn).toHaveLength(1)
  expect(pageBefore.namedIn[0]).toMatchObject({ sighting_id: citerId, position: 0, entry_id: entry, quote: '見《龍龕》' })

  // Add the missing witness (same citation as stub: title + report_date, author null) and upgrade the stub via linkSightings.
  const witnessId = (await addSighting(db, entry, makeSighting({ title: '龍龕手鑑', author: null, report_date: '997', url: null, place: 'Longkan scan' }), [{ image_key: 'a.png', image_type: 'image/png', image_w: 10, image_h: 10, thumb_key: 'a-t.png', box: null }], who))!
  const linked = await linkSightings(db, citerId, makeCite({ kind: 'quotes', sighting: witnessId }), who, 'linked witness')
  expect(linked.ok).toBe(true)

  // Stub upgraded in place: source_id preserved, cited_id set, namedIn drops to 0.
  const afterLink = (await getSighting(db, citerId))!
  expect(afterLink.cites).toHaveLength(1)
  expect(afterLink.cites[0]).toMatchObject({ status: 'witness', sighting: witnessId, source_id: stubSourceId, quote: '見《龍龕》' })
  expect((await sourcePage(db, stubSourceId))!.namedIn).toEqual([])

  // Hiding the cited witness surfaces the naming source in sourcePage.namedIn again.
  expect(await removeSighting(db, entry, witnessId, 1, who, 'bad scan')).toBe('done')
  expect((await sourcePage(db, stubSourceId))!.namedIn).toHaveLength(1)
  expect(await putBackSighting(db, entry, witnessId, who)).toBe('done')
  expect((await sourcePage(db, stubSourceId))!.namedIn).toEqual([])

  // Merge and move leave edges untouched and keep targets accurate.
  const entry2 = await createEntry(db, makeEntry('⿱山東'), makeSighting({ title: 'Other', url: 'https://example.test/other' }), [], who)
  expect((await mergeEntry(db, entry2, entry, who, null)).ok).toBe(true)
  expect((await getSighting(db, citerId))!.cites[0].sighting).toBe(witnessId)
  expect(await unmergeEntry(db, entry2, who)).toBe(true)
  expect(await moveSighting(db, entry, witnessId, 1, entry2, who, null)).toBe('done')
  expect((await getSighting(db, citerId))!.cites[0].target?.entry_id).toBe(entry2)
})

test('EXPLAIN QUERY PLAN verifies all new cite reads use indexes with no temp sorts', async () => {
  const { db, raw } = setup()
  const entry = await createEntry(db, makeEntry(), makeSighting({
    title: '康熙字典',
    url: 'https://example.test/kx',
    cites: [makeCite({ kind: 'quotes', title: '龍龕手鑑', report_date: '997' })],
  }), [], who)
  const citerId = (await getEntry(db, entry))!.sightings[0].id
  const stubSourceId = (await getSighting(db, citerId))!.cites[0].source_id!

  const plans: { sql: string; detail: string[] }[] = []
  const traced = {
    prepare(sql: string) {
      const stmt = db.prepare(sql)
      const wrap = (values: unknown[]) => ({
        sql,
        values,
        bind: (...more: unknown[]) => wrap(more),
        all: () => { plans.push({ sql, detail: (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(r => r.detail) }); return stmt.bind(...values).all() },
        first: () => { plans.push({ sql, detail: (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(r => r.detail) }); return stmt.bind(...values).first() },
        run: () => stmt.bind(...values).run(),
        sync: () => (stmt.bind(...values) as unknown as { sync(): unknown[] }).sync(),
      })
      return wrap([])
    },
    async batch(statements: { sql?: string; values?: unknown[]; sync(): unknown[] }[]) {
      for (const s of statements) {
        if (s.sql) plans.push({ sql: s.sql, detail: (raw.query(`EXPLAIN QUERY PLAN ${s.sql}`).all(...((s.values ?? []) as never[])) as { detail: string }[]).map(r => r.detail) })
      }
      return db.batch(statements as never)
    },
  } as unknown as D1Database

  await getEntry(traced, entry)
  await sourcePage(traced, stubSourceId)
  await exportPage(traced, 0, 10)
  const citeReadPlans = plans.filter(p => p.sql.includes('sighting_cites'))
  expect(citeReadPlans.length).toBeGreaterThanOrEqual(4)
  const readPlans = citeReadPlans.map(p => p.detail.join('\n')).join('\n---\n')
  expect(readPlans).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/)
  expect(readPlans).not.toMatch(/SCAN (?:sighting_cites|sc|sightings|s|t|sources|entries|e)\b/)
  expect(readPlans).toContain('sighting_cites_by_cited')
  expect(readPlans).toContain('sighting_cites_by_source')

  // Prove the index pins are load-bearing: dropping either index makes the pinned queries fail.
  for (const idx of ['sighting_cites_by_cited', 'sighting_cites_by_source']) {
    const broken = setup()
    const eid = await createEntry(broken.db, makeEntry(), makeSighting({ cites: [makeCite({ kind: 'quotes', title: '龍龕手鑑' })] }), [], who)
    const sid = (await getEntry(broken.db, eid))!.sightings[0].cites[0].source_id!
    broken.raw.exec(`DROP INDEX ${idx}`)
    if (idx === 'sighting_cites_by_cited') await expect(getEntry(broken.db, eid)).rejects.toThrow()
    else await expect(sourcePage(broken.db, sid)).rejects.toThrow()
  }
})
