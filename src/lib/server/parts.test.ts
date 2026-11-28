import { describe, expect, test } from 'bun:test'
import { newClaim, readClaims, type Claim } from '$lib/claims'
import { analyze, composeValue, parseComposition, partKey, partRoleRowsOf } from '$lib/composition'
import { createEntry, editEntry, mergeEntry, setHidden, type EntryFields, type SightingFields } from './entries'
import { listParts, parsePartCursor, partCountsStatement, partEntries, partEntriesStatement, partFunctionCountsStatement, partFunctionSuggestionsStatement, partSuggestions, partSummary } from './parts'
import { openTestDb } from './testdb'
import { load as partPageLoad } from '../../routes/[locale]/part/[part]/+page.server'
import { load as partsIndexLoad } from '../../routes/[locale]/parts/+page.server'
import { GET as functionsApi } from '../../routes/api/parts/functions/+server'

const who = { actor: 'p1', ip: null }
const fields = (claims: Claim[] = []): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims })
const seen = (): SightingFields => ({ place: 'A lexicon', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null })

function open() {
  const opened = openTestDb()
  opened.raw.exec("INSERT INTO people(id, name, created_at) VALUES('p1', 'collector', '2026-11-28')")
  return opened
}

describe('part functions', () => {
  test('parseComposition, analyze, and readClaims round-trip functions and omit them when empty', () => {
    const raw = composeValue('⿰亻汝', ['⺅', '汝'], ['semantic', 'phonetic'], null, ['提示白讀或訓讀（福州方言字）', ''])
    const parsed = parseComposition(raw)
    expect(parsed).toEqual({
      ids: '⿰亻汝',
      parts: ['⺅', '汝'],
      roles: ['semantic', 'phonetic'],
      functions: ['提示白讀或訓讀（福州方言字）', ''],
      formation: null,
    })
    const analysis = analyze('⿰亻汝', parsed)
    expect(analysis?.tagged).toBe(true)
    expect(analysis?.formation).toBe('phonoSemantic')
    expect(analysis?.parts).toEqual([
      { part: '⺅', role: 'semantic', func: '提示白讀或訓讀（福州方言字）' },
      { part: '汝', role: 'phonetic', func: '' },
    ])
    // Radical equivalent `⺅` normalizes to `亻` in indexed rows.
    expect(partKey('⺅')).toBe('亻')
    expect(partRoleRowsOf('⿰亻汝', parsed)).toEqual([
      { part: '亻', role: 'semantic', func: '提示白讀或訓讀（福州方言字）' },
      { part: '汝', role: 'phonetic', func: '' },
    ])

    // Without functions, `readClaims` omits the `functions` property.
    const form = new FormData()
    form.set('ids', '⿰亻汝')
    form.set('composition', composeValue('⿰亻汝', ['亻', '汝'], ['semantic', 'phonetic'], null))
    const read = readClaims(form, [])
    expect(read.error).toBeNull()
    expect(read.claims.find(c => c.kind === 'composition')?.data).toEqual({
      parts: ['亻', '汝'],
      roles: ['semantic', 'phonetic'],
      formation: null,
    })
  })

  test('create, edit, hide, and merge keep entry_part_roles, part_function_counts, and part_counts in sync', async () => {
    const { db } = open()
    const id1 = await createEntry(db, fields([
      newClaim('ids', '⿰亻汝'),
      newClaim('composition', '⿰亻汝', {
        parts: ['⺅', '汝'],
        roles: ['semantic', 'phonetic'],
        functions: ['提示白讀或訓讀（福州方言字）', ''],
        formation: null,
      }),
    ]), seen(), [], who)
    const id2 = await createEntry(db, fields([
      newClaim('ids', '⿰亻米'),
      newClaim('composition', '⿰亻米', {
        parts: ['亻', '米'],
        roles: ['semantic', 'phonetic'],
        functions: ['度量衡「倍」字省略', ''],
        formation: null,
      }),
    ]), seen(), [], who)
    const id3 = await createEntry(db, fields([
      newClaim('ids', '⿰亻夷'),
      newClaim('composition', '⿰亻夷', {
        parts: ['亻', '夷'],
        roles: ['semantic', 'phonetic'],
        functions: ['表示民族名', ''],
        formation: null,
      }),
    ]), seen(), [], who)
    const id4 = await createEntry(db, fields([
      newClaim('ids', '⿰亻未'),
      newClaim('composition', '⿰亻未', {
        parts: ['亻', '未'],
        roles: ['semantic', 'phonetic'],
        formation: null,
      }),
    ]), seen(), [], who)

    expect(await partSummary(db, '亻')).toEqual({
      total: 4,
      slices: [
        { func: '', n: 1 },
        { func: '度量衡「倍」字省略', n: 1 },
        { func: '提示白讀或訓讀（福州方言字）', n: 1 },
        { func: '表示民族名', n: 1 },
      ],
    })

    // Suggestions exclude unlabeled rows and normalize radical code points.
    expect(await partSuggestions(db, '⺅')).toEqual({
      part: '亻',
      functions: [
        { func: '度量衡「倍」字省略', n: 1 },
        { func: '提示白讀或訓讀（福州方言字）', n: 1 },
        { func: '表示民族名', n: 1 },
      ],
    })

    // Filter by specific function and by unlabeled.
    expect((await partEntries(db, '亻', { func: '表示民族名' })).entries.map(item => item.tile.id)).toEqual([id3])
    expect((await partEntries(db, '亻', { func: '' })).entries.map(item => item.tile.id)).toEqual([id4])
    const page1 = await partEntries(db, '亻', { limit: 2 })
    expect(page1.entries.map(item => item.tile.id)).toEqual([id4, id3])
    expect(page1.more).toBe(String(id3))
    const page2 = await partEntries(db, '亻', { after: parsePartCursor(page1.more!), limit: 2 })
    expect(page2.entries.map(item => item.tile.id)).toEqual([id2, id1])
    expect(page2.more).toBeNull()

    // A single record tagging the same part twice with different roles/functions never loses rows across pages.
    const dupId = await createEntry(db, fields([
      newClaim('ids', '⿰木木'),
      newClaim('composition', '⿰木木', {
        parts: ['木', '木'],
        roles: ['semantic', 'phonetic'],
        functions: ['表植物', ''],
        formation: null,
      }),
    ]), seen(), [], who)
    const firstHalf = await partEntries(db, '木', { limit: 1 })
    expect(firstHalf.entries).toHaveLength(1)
    expect(firstHalf.more).not.toBeNull()
    const secondHalf = await partEntries(db, '木', { after: parsePartCursor(firstHalf.more!), limit: 1 })
    expect(secondHalf.entries).toHaveLength(1)
    expect(secondHalf.more).toBeNull()
    expect([...firstHalf.entries, ...secondHalf.entries].map(item => [item.tile.id, item.role, item.func])).toEqual([
      [dupId, 'semantic', '表植物'],
      [dupId, 'phonetic', ''],
    ])

    // Editing updates counts cleanly.
    await editEntry(db, id4, 1, fields([
      newClaim('ids', '⿰亻未'),
      newClaim('composition', '⿰亻未', {
        parts: ['亻', '未'],
        roles: ['semantic', 'phonetic'],
        functions: ['提示白讀或訓讀（福州方言字）', ''],
        formation: null,
      }),
    ]), who, null)
    expect(await partSummary(db, '亻')).toEqual({
      total: 4,
      slices: [
        { func: '提示白讀或訓讀（福州方言字）', n: 2 },
        { func: '度量衡「倍」字省略', n: 1 },
        { func: '表示民族名', n: 1 },
      ],
    })

    // Hiding removes an entry from counts; unhiding restores it.
    await setHidden(db, { entry: id2 }, true, who, null)
    expect((await partSummary(db, '亻')).total).toBe(3)
    expect((await partSummary(db, '亻')).slices.some(s => s.func === '度量衡「倍」字省略')).toBe(false)
    await setHidden(db, { entry: id2 }, false, who, null)
    expect((await partSummary(db, '亻')).total).toBe(4)

    // Merging removes the merged record from counts.
    await mergeEntry(db, id3, id1, who, null)
    expect((await partSummary(db, '亻')).total).toBe(3)
    expect((await partSummary(db, '亻')).slices.some(s => s.func === '表示民族名')).toBe(false)

    // `/parts` directory lists components ordered by count DESC.
    const parts = await listParts(db)
    expect(parts[0]).toEqual({ part: '亻', n: 3 })
  })

  test('routes redirect non-canonical parts, validate params, and serve suggestions API', async () => {
    const { db } = open()
    await createEntry(db, fields([
      newClaim('ids', '⿰亻米'),
      newClaim('composition', '⿰亻米', {
        parts: ['亻', '米'],
        roles: ['semantic', 'phonetic'],
        functions: ['度量衡「倍」字省略', ''],
        formation: null,
      }),
    ]), seen(), [], who)

    const makeEvent = (part: string, query = '') => ({
      params: { locale: 'zh-Hant', part },
      url: new URL(`https://example.test/zh-Hant/part/${encodeURIComponent(part)}${query}`),
      locals: { glyphStyle: 'sans' },
      platform: { env: { DB: db } },
    }) as any

    // Non-canonical `⺅` redirects 301 to `亻`.
    await expect(partPageLoad(makeEvent('⺅'))).rejects.toMatchObject({ status: 301, location: `/zh-Hant/part/${encodeURIComponent('亻')}` })
    // Invalid part or query params reject with 404.
    await expect(partPageLoad(makeEvent('⿰'))).rejects.toMatchObject({ status: 404 })
    await expect(partPageLoad(makeEvent('亻', '?after=bad'))).rejects.toMatchObject({ status: 404 })
    await expect(partPageLoad(makeEvent('亻', '?func=a&unlabeled=1'))).rejects.toMatchObject({ status: 404 })

    const loaded = await partPageLoad(makeEvent('亻')) as any
    expect(loaded.part).toBe('亻')
    expect(loaded.total).toBe(1)
    expect(loaded.entries).toHaveLength(1)

    const index = await partsIndexLoad({ platform: { env: { DB: db } } } as any) as any
    expect(index.parts[0]).toEqual({ part: '亻', n: 1 })

    const res = await functionsApi({ url: new URL('https://example.test/api/parts/functions?part=%E2%BA%85'), platform: { env: { DB: db } } } as any)
    expect(await res.json()).toEqual({ part: '亻', functions: [{ func: '度量衡「倍」字省略', n: 1 }] })
  })

  test('every part query uses an index with no temp B-tree, and dropping the guarded index breaks the plan', () => {
    const { db, raw } = open()
    const explain = (stmt: unknown) => {
      const { sql, values } = stmt as { sql: string; values: unknown[] }
      return (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[])
        .map(row => row.detail)
        .join('\n')
    }

    const statements = [
      partCountsStatement(db),
      partFunctionCountsStatement(db, '亻'),
      partFunctionSuggestionsStatement(db, '亻'),
      partEntriesStatement(db, '亻', null, null),
      partEntriesStatement(db, '亻', null, { id: 100, role: 'semantic', func: '表示民族名' }),
      partEntriesStatement(db, '亻', '度量衡「倍」字省略', null),
      partEntriesStatement(db, '亻', '度量衡「倍」字省略', { id: 100, role: 'semantic', func: '度量衡「倍」字省略' }),
      partEntriesStatement(db, '亻', '', { id: 100, role: '', func: '' }),
    ]
    for (const stmt of statements) {
      const plan = explain(stmt)
      expect(plan).not.toContain('USE TEMP B-TREE')
      expect(plan).toMatch(/USING (COVERING )?INDEX|PRIMARY KEY/)
    }

    // Prove the plan test actually detects a missing index on `part_function_counts`.
    const missing = open()
    missing.raw.exec('DROP INDEX part_function_counts_by_part_n')
    const { sql, values } = partFunctionCountsStatement(missing.db, '亻') as unknown as { sql: string; values: unknown[] }
    const degraded = (missing.raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[])
      .map(row => row.detail)
      .join('\n')
    expect(degraded).toContain('USE TEMP B-TREE FOR ORDER BY')
  })
})
