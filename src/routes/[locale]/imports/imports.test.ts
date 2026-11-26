import { expect, test } from 'bun:test'
import { newClaim, type Claim } from '$lib/claims'
import { counts, createEntry, editEntry, getEntry, list, mergeEntry, setHidden, unmergeEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import {
  adjustImportCounts,
  findOrCreateImport,
  getImport,
  getImportStatement,
  IMPORT_ENTRIES_PAGE,
  IMPORTS_PAGE,
  importEntriesStatement,
  listImportsStatement,
  recountImport,
  setEntryReviewed,
} from '$lib/server/imports'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { load as browseLoad } from '../+page.server'
import { actions as entryActions, load as entryLoad } from '../entry/[id]/+page.server'
import { load as indexLoad } from './+page.server'
import { actions as importActions, load as importLoad } from './[id]/+page.server'

const fields = (ids: string, script = 'han'): EntryFields => ({
  script, script_other: null, description: null, radical: null, strokes: null,
  claims: [newClaim('ids', ids)],
})
const seen: SightingFields = {
  place: 'Imported list', url: 'https://example.test/list', title: null, author: null, publisher: null,
  report_date: null, container: null, source_kind: null, vias: [], original_date: null, page: null,
  contexts: null, style: null, types: null, note: null, quotes: null,
}

async function fixture() {
  const { db, raw } = openTestDb()
  const person = await createPerson(db)
  const reviewer = await createPerson(db)
  const who = { actor: person.id, ip: null }
  const add = (ids: string, importId: number | null = null, script = 'han') =>
    createEntry(db, fields(ids, script), seen, [], who, [], importId)
  const openIndex = (query = '') =>
    indexLoad({ url: new URL(`https://example.test/en/imports${query}`), params: { locale: 'en' }, locals: {}, platform: { env: { DB: db } } } as never) as Promise<{ imports: { id: number; name: string; total: number; pending: number }[]; next: number | null }>
  const openImport = (id: number | string, query = '') =>
    importLoad({ url: new URL(`https://example.test/en/imports/${id}${query}`), params: { locale: 'en', id: String(id) }, locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } } as never) as Promise<{ batch: { id: number; name: string; total: number; pending: number }; view: 'pending' | 'all'; entries: { id: number; awaitingReview: boolean; reviewed_at: string | null }[]; next: number | null }>
  const openBrowse = (query = '') =>
    browseLoad({ url: new URL(`https://example.test/en${query}`), params: { locale: 'en' }, locals: { glyphStyle: 'sans' }, platform: { env: { DB: db } } } as never) as Promise<{ tiles: { id: number; awaitingReview: boolean }[]; counts: Record<string, number> }>
  return { db, raw, person, reviewer, who, add, openIndex, openImport, openBrowse }
}

test('bulk imported records are marked awaiting review, listed by import, and filterable in browse', async () => {
  const { db, who, add, openIndex, openImport, openBrowse } = await fixture()
  const batch = await findOrCreateImport(db, '2026-11-26 Unencoded List', who)
  const first = await add('⿰山東', batch.id)
  const second = await add('⿱木木', batch.id, 'nom')
  const regular = await add('⿰木木', null)

  const index = await openIndex()
  expect(index.imports).toMatchObject([{ id: batch.id, name: '2026-11-26 Unencoded List', total: 2, pending: 2 }])

  const detail = await openImport(batch.id)
  expect(detail.view).toBe('pending')
  expect(detail.batch).toMatchObject({ id: batch.id, name: '2026-11-26 Unencoded List', total: 2, pending: 2 })
  expect(detail.entries.map(entry => [entry.id, entry.awaitingReview])).toEqual([[second, true], [first, true]])

  // Browse ?filter=review returns only awaiting-review records, and tiles carry awaitingReview.
  const reviewBrowse = await openBrowse('?filter=review')
  expect(reviewBrowse.tiles.map(tile => [tile.id, tile.awaitingReview])).toEqual([[second, true], [first, true]])
  expect(reviewBrowse.counts['n:review']).toBe(2)

  const nomReview = await list(db, { script: 'nom', filter: 'review' })
  expect(nomReview?.tiles.map(tile => tile.id)).toEqual([second])

  const allBrowse = await openBrowse('')
  expect(allBrowse.tiles.find(tile => tile.id === regular)?.awaitingReview).toBe(false)
  expect(allBrowse.tiles.find(tile => tile.id === first)?.awaitingReview).toBe(true)

  const loaded = await entryLoad({ params: { locale: 'en', id: String(first) }, url: new URL(`https://example.test/en/entry/${first}`), locals: { person: null }, platform: { env: { DB: db } } } as never) as any
  expect(loaded.entry).toMatchObject({ id: first, import_id: batch.id, import_name: '2026-11-26 Unencoded List', reviewed_at: null })
})

test('marking a record as reviewed clears the mark and pending count while keeping the import name', async () => {
  const { db, reviewer, who, add, openImport, openBrowse } = await fixture()
  const batch = await findOrCreateImport(db, 'List A', who)
  const first = await add('⿰山東', batch.id)
  const second = await add('⿱木木', batch.id)

  // Review first via the record page action.
  const entryForm = new FormData()
  entryForm.set('reviewed', '1')
  await expect(entryActions.review({
    request: new Request(`https://example.test/en/entry/${first}?/review`, { method: 'POST', body: entryForm }),
    params: { locale: 'en', id: String(first) },
    url: new URL(`https://example.test/en/entry/${first}?/review`),
    locals: { person: reviewer },
    platform: { env: { DB: db } },
    cookies: { set() {} },
    getClientAddress: () => '127.0.0.1',
  } as never)).rejects.toMatchObject({ status: 303, location: `/en/entry/${first}` })

  // The record keeps its import name permanently, and reviewed_at is set.
  const record = (await getEntry(db, first))!.entry
  expect(record.import_id).toBe(batch.id)
  expect(record.import_name).toBe('List A')
  expect(record.reviewed_at).not.toBeNull()
  expect(record.reviewed_by_id).toBe(reviewer.id)

  // Pending list and ?filter=review now only include second; ?view=all still shows both.
  const pendingPage = await openImport(batch.id)
  expect(pendingPage.batch).toMatchObject({ total: 2, pending: 1 })
  expect(pendingPage.entries.map(entry => entry.id)).toEqual([second])

  const allPage = await openImport(batch.id, '?view=all')
  expect(allPage.view).toBe('all')
  expect(allPage.entries.map(entry => [entry.id, entry.awaitingReview])).toEqual([[second, true], [first, false]])

  expect((await openBrowse('?filter=review')).tiles.map(tile => tile.id)).toEqual([second])
  expect((await counts(db))['n:review']).toBe(1)

  // Review second directly from the import page action.
  const rowForm = new FormData()
  rowForm.set('entry', String(second))
  rowForm.set('reviewed', '1')
  rowForm.set('view', 'pending')
  await expect(importActions.review({
    request: new Request(`https://example.test/en/imports/${batch.id}?/review`, { method: 'POST', body: rowForm }),
    params: { locale: 'en', id: String(batch.id) },
    url: new URL(`https://example.test/en/imports/${batch.id}?/review`),
    locals: { person: reviewer },
    platform: { env: { DB: db } },
    cookies: { set() {} },
    getClientAddress: () => '127.0.0.1',
  } as never)).rejects.toMatchObject({ status: 303, location: `/en/imports/${batch.id}` })

  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 0 })
  expect((await openImport(batch.id)).entries).toEqual([])
  expect((await counts(db))['n:review']).toBeUndefined()

  // Unmarking reviewed restores it to pending and ?filter=review.
  const unmarkForm = new FormData()
  unmarkForm.set('entry', String(first))
  unmarkForm.set('reviewed', '0')
  unmarkForm.set('view', 'all')
  await expect(importActions.review({
    request: new Request(`https://example.test/en/imports/${batch.id}?/review`, { method: 'POST', body: unmarkForm }),
    params: { locale: 'en', id: String(batch.id) },
    url: new URL(`https://example.test/en/imports/${batch.id}?/review`),
    locals: { person: reviewer },
    platform: { env: { DB: db } },
    cookies: { set() {} },
    getClientAddress: () => '127.0.0.1',
  } as never)).rejects.toMatchObject({ status: 303, location: `/en/imports/${batch.id}?view=all` })

  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 1 })
  expect((await openBrowse('?filter=review')).tiles.map(tile => tile.id)).toEqual([first])

  // Reviewing an entry not from an import fails cleanly.
  const regular = await add('⿰水火', null)
  expect(await setEntryReviewed(db, regular, true, { actor: reviewer.id, ip: null })).toEqual({ ok: false, code: 'notImported' })
})

test('hiding, unhiding, merging and unmerging imported records keep import counts accurate', async () => {
  const { db, who, add } = await fixture()
  const batch = await findOrCreateImport(db, 'List B', who)
  const first = await add('⿰山東', batch.id)
  const second = await add('⿱木木', batch.id)
  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 2 })

  // Hiding a pending record reduces both total and pending; unhiding restores both.
  await setHidden(db, { entry: second }, true, who, 'spam')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 1 })
  expect((await counts(db))['n:review']).toBe(1)

  await setHidden(db, { entry: second }, false, who, 'restored')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 2 })
  expect((await counts(db))['n:review']).toBe(2)

  // Merging second into first reduces total and pending; unmerging restores them.
  expect((await mergeEntry(db, second, first, who, 'dup')).ok).toBe(true)
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 1 })
  expect((await counts(db))['n:review']).toBe(1)

  expect(await unmergeEntry(db, second, who)).toBe(true)
  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 2 })
  expect((await counts(db))['n:review']).toBe(2)
})

test('imports index and detail paginate by cursor and reject malformed parameters', async () => {
  const { db, who, add, openIndex, openImport } = await fixture()
  for (let i = 1; i <= IMPORTS_PAGE + 2; i++) await findOrCreateImport(db, `Import ${i}`, who)
  const firstImports = await openIndex()
  expect(firstImports.imports).toHaveLength(IMPORTS_PAGE)
  expect(firstImports.next).toBe(3)
  const secondImports = await openIndex(`?after=${firstImports.next}`)
  expect(secondImports.imports.map(item => item.id)).toEqual([2, 1])
  expect(secondImports.next).toBeNull()

  const batch = firstImports.imports[0]
  for (let i = 0; i < IMPORT_ENTRIES_PAGE + 2; i++) await add('⿰山東', batch.id)
  const firstPage = await openImport(batch.id)
  expect(firstPage.entries).toHaveLength(IMPORT_ENTRIES_PAGE)
  expect(firstPage.next).not.toBeNull()
  const secondPage = await openImport(batch.id, `?after=${firstPage.next}`)
  expect(secondPage.entries).toHaveLength(2)
  expect(secondPage.next).toBeNull()

  await expect(openIndex('?after=0')).rejects.toMatchObject({ status: 404 })
  await expect(openIndex('?after=abc')).rejects.toMatchObject({ status: 404 })
  await expect(openImport(9999)).rejects.toMatchObject({ status: 404 })
  await expect(openImport('abc')).rejects.toMatchObject({ status: 404 })
  await expect(openImport(batch.id, '?view=unknown')).rejects.toMatchObject({ status: 404 })
  await expect(openImport(batch.id, '?after=0')).rejects.toMatchObject({ status: 404 })
})

test('every imports query uses its index without temporary sorts or unindexed scans', async () => {
  const { db, raw, who, add } = await fixture()
  const batch = await findOrCreateImport(db, 'Indexed import', who)
  await add('⿰山東', batch.id)

  const statements = [
    listImportsStatement(db, null),
    listImportsStatement(db, 10),
    getImportStatement(db, batch.id),
    importEntriesStatement(db, batch.id, { pendingOnly: true, after: null }),
    importEntriesStatement(db, batch.id, { pendingOnly: true, after: 10 }),
    importEntriesStatement(db, batch.id, { pendingOnly: false, after: null }),
    importEntriesStatement(db, batch.id, { pendingOnly: false, after: 10 }),
    adjustImportCounts(db, batch.id, 0, -1),
    recountImport(db, batch.id),
  ]

  for (const statement of statements) {
    const { sql, values } = statement as unknown as { sql: string; values: unknown[] }
    const details = (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail)
    const plan = details.join('\n')
    expect(plan).not.toMatch(/TEMP B-TREE/)
    for (const detail of details) expect(detail).not.toMatch(/^SCAN (?!.*USING)/)
  }

  // Verify the partial indexes are actually used in the plans and required by the queries.
  const pendingPlan = (() => {
    const { sql, values } = importEntriesStatement(db, batch.id, { pendingOnly: true }) as unknown as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  })()
  expect(pendingPlan).toContain('entries_import_pending')
  const allPlan = (() => {
    const { sql, values } = importEntriesStatement(db, batch.id, { pendingOnly: false }) as unknown as { sql: string; values: unknown[] }
    return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  })()
  expect(allPlan).toContain('entries_by_import')

  for (const [index, pendingOnly] of [['entries_import_pending', true], ['entries_by_import', false]] as const) {
    const missing = await fixture()
    const b = await findOrCreateImport(missing.db, 'Drop check', missing.who)
    missing.raw.exec(`DROP INDEX ${index}`)
    expect(() => importEntriesStatement(missing.db, b.id, { pendingOnly })).toThrow(/no such index/)
  }
})

test('import review action refuses entries belonging to another import without mutating them', async () => {
  const { db, reviewer, who, add } = await fixture()
  const firstBatch = await findOrCreateImport(db, 'Import One', who)
  const secondBatch = await findOrCreateImport(db, 'Import Two', who)
  const entryId = await add('⿰山東', firstBatch.id)

  const form = new FormData()
  form.set('entry', String(entryId))
  form.set('reviewed', '1')
  await expect(importActions.review({
    request: new Request(`https://example.test/en/imports/${secondBatch.id}?/review`, { method: 'POST', body: form }),
    params: { locale: 'en', id: String(secondBatch.id) },
    url: new URL(`https://example.test/en/imports/${secondBatch.id}?/review`),
    locals: { person: reviewer },
    platform: { env: { DB: db } },
    cookies: { set() {} },
    getClientAddress: () => '127.0.0.1',
  } as never)).rejects.toMatchObject({ status: 404 })

  // The entry in Import One must remain unreviewed with pending count unchanged.
  expect((await getEntry(db, entryId))!.entry.reviewed_at).toBeNull()
  expect(await getImport(db, firstBatch.id)).toMatchObject({ total: 1, pending: 1 })
})

test('concurrent edit and review keep n:review tags and counts consistent', async () => {
  const { db, reviewer, who, add, openBrowse } = await fixture()
  const batch = await findOrCreateImport(db, 'Concurrent Import', who)
  const entryId = await add('⿰山東', batch.id)

  const [editResult, reviewResult] = await Promise.all([
    editEntry(db, entryId, 1, { ...fields('⿰山東'), description: 'Updated note' }, who, 'desc'),
    setEntryReviewed(db, entryId, true, { actor: reviewer.id, ip: null }),
  ])
  expect(editResult.ok).toBe(true)
  expect(reviewResult).toEqual({ ok: true, importId: batch.id })
  expect((await getEntry(db, entryId))!.entry).toMatchObject({ description: 'Updated note' })
  expect((await getEntry(db, entryId))!.entry.reviewed_at).not.toBeNull()
  expect((await openBrowse('?filter=review')).tiles).toEqual([])
  expect((await counts(db))['n:review']).toBeUndefined()
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 0 })
})

test('hiding a reviewed or already-merged imported record keeps total and pending accurate', async () => {
  const { db, reviewer, who, add } = await fixture()
  const batch = await findOrCreateImport(db, 'Counter Edge Cases', who)
  const first = await add('⿰山東', batch.id)
  const second = await add('⿱木木', batch.id)
  await setEntryReviewed(db, first, true, { actor: reviewer.id, ip: null })
  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 1 })

  // Hiding the reviewed record decrements total only, not pending.
  await setHidden(db, { entry: first }, true, who, 'hide reviewed')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 1 })
  await setHidden(db, { entry: first }, false, who, 'unhide reviewed')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 2, pending: 1 })

  // Merging second into first decrements total and pending; hiding the already-merged second does not decrement again.
  expect((await mergeEntry(db, second, first, who, 'dup')).ok).toBe(true)
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 0 })
  await setHidden(db, { entry: second }, true, who, 'hide merged')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 0 })
  await setHidden(db, { entry: second }, false, who, 'unhide merged')
  expect(await getImport(db, batch.id)).toMatchObject({ total: 1, pending: 0 })
})
