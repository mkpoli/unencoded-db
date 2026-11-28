import { beforeEach, describe, expect, test } from 'bun:test'
import { ARCHIVES_MAX } from '$lib/source-archives'
import { ARCHIVER_ID, ARCHIVER_NAME, UNARCHIVED, archiveCited, archiveNow, archiveSources, isAlreadyArchived, isPublicWebUrl, offersArchiveNow, waybackArchive } from './archive'
import { citationHash, createEntry, setHidden, type EntryFields, type SightingFields } from './entries'
import { createPerson } from './people'
import { editSourceArchive, sourceArchiveChanges, sourceArchives } from './source-archives'
import { openTestDb } from './testdb'

const entry: EntryFields = { description: null, radical: null, strokes: null, claims: [] }
const seen = (over: Partial<SightingFields> = {}): SightingFields => ({ place: '甲', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null, ...over })
const snapshot = (url: string) => `https://web.archive.org/web/20260501120000/${url}`
// Answers the availability check with a snapshot of the asked address, and counts the calls.
const available = () => {
  const asked: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input))
    const url = decodeURIComponent(new URL(String(input)).searchParams.get('url') ?? '')
    return Response.json({ archived_snapshots: { closest: { available: true, url: snapshot(url) } } })
  }) as unknown as typeof globalThis.fetch
  return { asked, fetch }
}

describe('isAlreadyArchived', () => {
  test('detects known archive hosts and ignores ordinary sites', () => {
    for (const archived of [
      'https://web.archive.org/web/20260101000000/https://example.org',
      'https://archive.today/xyz',
      'https://archive.ph/xyz',
      'https://archive.is/xyz',
      'https://archive.md/xyz',
      'https://archive.vn/xyz',
      'https://perma.cc/ABCD-1234',
      'https://megalodon.jp/2026-0101-0000-00/example.org/',
      'https://www.web.archive.org/web/2026/https://example.org',
    ]) {
      expect(isAlreadyArchived(archived)).toBe(true)
    }
    for (const normal of ['https://x.com/user/status/1', 'https://archive.org/details/book', 'https://example.org/']) {
      expect(isAlreadyArchived(normal)).toBe(false)
    }
  })
})

describe('waybackArchive', () => {
  test('rejects non-http(s), already-archived and localhost/private-IP URLs without calling fetch', async () => {
    let calls = 0
    const mockFetch = (async () => { calls++; return new Response() }) as unknown as typeof fetch
    const rejected = [
      'ftp://example.org/file',
      'javascript:alert(1)',
      'https://web.archive.org/web/2026/https://example.org',
      'https://archive.ph/abc',
      'http://localhost/test',
      'http://sub.localhost/test',
      'http://127.0.0.1/test',
      'http://127.255.0.1/test',
      'http://10.0.0.1/test',
      'http://172.16.0.1/test',
      'http://172.31.255.255/test',
      'http://192.168.1.1/test',
      'http://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/',
      'http://[::1]/test',
      'http://[0:0:0:0:0:0:0:0]/test',
      'http://[0:0:0:0:0:0:0:1]/test',
      'http://[fe80::1]/test',
      'http://[fec0::1]/test',
      'http://[fc00::1]/test',
      'http://[2001:db8::1]/test',
      'http://[100::1]/test',
      'http://[::127.0.0.1]/test',
      'http://[::0:127.0.0.1]/test',
      'http://[::ffff:127.0.0.1]/test',
      'http://[::ffff:0:127.0.0.1]/test',
      'http://[64:ff9b::127.0.0.1]/test',
      'http://intranet/secret',
      'https://user:pass@example.org/post',
    ]
    for (const url of rejected) {
      expect(await waybackArchive(url, mockFetch)).toBeNull()
    }
    expect(calls).toBe(0)
    expect(isPublicWebUrl('https://example.org/post/1')).toBe(true)
    expect(isPublicWebUrl('https://[2606:4700:4700::1111]/post')).toBe(true)
  })

  test('returns existing snapshot from Wayback availability API normalized to https', async () => {
    const requested: string[] = []
    const mockFetch = (async (input: RequestInfo | URL) => {
      requested.push(String(input))
      return new Response(JSON.stringify({
        archived_snapshots: {
          closest: {
            available: true,
            url: 'http://web.archive.org/web/20260501120000/https://example.org/post/1',
          },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    expect(await waybackArchive('https://example.org/post/1', mockFetch)).toBe(
      'https://web.archive.org/web/20260501120000/https://example.org/post/1',
    )
    expect(requested).toEqual(['https://archive.org/wayback/available?url=https%3A%2F%2Fexample.org%2Fpost%2F1'])
  })

  test('submits to Save Page Now and reads Content-Location or Location header', async () => {
    for (const [header, value] of [
      ['content-location', '/web/20260502000000/https://example.org/post/2'],
      ['location', 'https://web.archive.org/web/20260502000001/https://example.org/post/2'],
    ] as const) {
      const calls: string[] = []
      const mockFetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        calls.push(url)
        if (url.startsWith('https://archive.org/wayback/available')) {
          return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 })
        }
        return new Response(null, { status: 302, headers: { [header]: value } })
      }) as unknown as typeof fetch

      const result = await waybackArchive('https://example.org/post/2', mockFetch)
      expect(result).toBe(value.startsWith('/') ? `https://web.archive.org${value}` : value)
      expect(calls).toHaveLength(2)
      expect(calls[1]).toBe('https://web.archive.org/save/https%3A%2F%2Fexample.org%2Fpost%2F2')
    }
  })

  test('returns null gracefully on network errors, 500s or non-wayback redirects', async () => {
    const failingFetch = (async () => { throw new Error('network down') }) as unknown as typeof fetch
    expect(await waybackArchive('https://example.org/post/3', failingFetch)).toBeNull()

    const errorFetch = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    expect(await waybackArchive('https://example.org/post/3', errorFetch)).toBeNull()

    const evilRedirect = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/wayback/available')) return new Response('{}', { status: 200 })
      return new Response(null, { status: 302, headers: { location: 'https://evil.example/phish' } })
    }) as unknown as typeof fetch
    expect(await waybackArchive('https://example.org/post/3', evilRedirect)).toBeNull()
  })
})

describe('archived copies of cited sources', () => {
  let db: D1Database, raw: ReturnType<typeof openTestDb>['raw'], who: { actor: string; ip: null }
  beforeEach(async () => {
    ({ db, raw } = openTestDb())
    who = { actor: (await createPerson(db)).id, ip: null }
  })
  const sourceOf = (url: string) => (raw.query('SELECT id FROM sources WHERE url = ?').get(url) as { id: number }).id
  const plan = (sql: string, values: unknown[]) => (raw.query(`EXPLAIN QUERY PLAN ${sql}`).all(...(values as never[])) as { detail: string }[]).map(row => row.detail).join('\n')
  const event = (tasks: Promise<unknown>[]) => ({ platform: { env: { DB: db }, ctx: { waitUntil: (task: Promise<unknown>) => { tasks.push(task) } } } as unknown as App.Platform })

  test('a newly cited page and its via are copied under the maintenance account', async () => {
    const work = 'https://example.org/book/1', post = 'https://example.org/post/2'
    const sighting = seen({ title: '乙', url: work, vias: [{ url: post, title: null, author: '丙', publisher: null, report_date: null, container: null, source_kind: null, quote: null }] })
    await createEntry(db, entry, sighting, [], who)
    const { asked, fetch } = available(), tasks: Promise<unknown>[] = []
    archiveCited(event(tasks), [sighting], fetch)
    expect(tasks).toHaveLength(1)
    await Promise.all(tasks)
    expect(asked).toHaveLength(2)
    for (const url of [work, post]) {
      expect(await sourceArchives(db, sourceOf(url))).toEqual([snapshot(url)])
      const { changes } = await sourceArchiveChanges(db, sourceOf(url), null)
      expect(changes.map(({ url, removed, actor, name }) => ({ url, removed, actor, name }))).toEqual([{ url: snapshot(url), removed: 0, actor: ARCHIVER_ID, name: ARCHIVER_NAME }])
    }
  })

  test('nothing is asked without waitUntil, or for an archive, a private address or a source that held a copy', async () => {
    const { asked, fetch } = available()
    archiveCited({ platform: undefined }, [seen({ url: 'https://example.org/a' })], fetch)
    const kept = seen({ title: '丁', url: 'https://example.org/kept' }), removed = seen({ title: '戊', url: 'https://example.org/removed' })
    const hidden = seen({ title: '己', url: 'https://example.org/hidden' })
    const archived = seen({ title: '庚', url: 'https://archive.ph/AbCd' }), local = seen({ title: '辛', url: 'http://169.254.169.254/latest/meta-data/' })
    for (const sighting of [kept, removed, archived, local]) await createEntry(db, entry, sighting, [], who)
    const gone = await createEntry(db, entry, hidden, [], who)
    await setHidden(db, { entry: gone }, true, who, null)
    expect(await editSourceArchive(db, sourceOf(kept.url!), 'https://archive.ph/kept', false, who.actor)).toBe('ok')
    expect(await editSourceArchive(db, sourceOf(removed.url!), 'https://archive.ph/removed', false, who.actor)).toBe('ok')
    expect(await editSourceArchive(db, sourceOf(removed.url!), 'https://archive.ph/removed', true, who.actor)).toBe('ok')
    const tasks: Promise<unknown>[] = []
    archiveCited(event(tasks), [archived, local], fetch)
    expect(tasks).toHaveLength(0)
    await archiveSources(event(tasks), db, [kept, removed, hidden], fetch)
    expect(asked).toHaveLength(0)
    expect(await sourceArchives(db, sourceOf(kept.url!))).toEqual(['https://archive.ph/kept'])
    expect(await sourceArchives(db, sourceOf(removed.url!))).toEqual([])
  })

  test('a copy added by hand while the archive answers wins, and no second copy joins it', async () => {
    const url = 'https://example.org/race', sighting = seen({ title: '壬', url })
    await createEntry(db, entry, sighting, [], who)
    const fetch = (async () => {
      await editSourceArchive(db, sourceOf(url), 'https://archive.ph/race', false, who.actor)
      return Response.json({ archived_snapshots: { closest: { available: true, url: snapshot(url) } } })
    }) as unknown as typeof globalThis.fetch
    await archiveSources({ platform: undefined }, db, [sighting], fetch)
    expect(await sourceArchives(db, sourceOf(url))).toEqual(['https://archive.ph/race'])
    expect(raw.query('SELECT count(*) AS n FROM source_archive_changes').get()).toEqual({ n: 1 })
  })

  test('a copy added and removed by hand while the archive answers is not put back', async () => {
    const url = 'https://example.org/undo', sighting = seen({ title: '寅', url })
    await createEntry(db, entry, sighting, [], who)
    const fetch = (async () => {
      await editSourceArchive(db, sourceOf(url), snapshot(url), false, who.actor)
      await editSourceArchive(db, sourceOf(url), snapshot(url), true, who.actor)
      return Response.json({ archived_snapshots: { closest: { available: true, url: snapshot(url) } } })
    }) as unknown as typeof globalThis.fetch
    await archiveSources({ platform: undefined }, db, [sighting], fetch)
    expect(await sourceArchives(db, sourceOf(url))).toEqual([])
    expect(raw.query('SELECT count(*) AS n FROM source_archive_changes').get()).toEqual({ n: 2 })
  })

  test('archive now adds a Wayback copy beside other copies, once, as the person who asked', async () => {
    const url = 'https://example.org/now'
    await createEntry(db, entry, seen({ title: '癸', url }), [], who)
    const id = sourceOf(url)
    expect(await editSourceArchive(db, id, 'https://archive.ph/now', false, who.actor)).toBe('ok')
    expect(offersArchiveNow(url, await sourceArchives(db, id))).toBe(true)
    expect(await archiveNow(db, id, who.actor, (async () => { throw new Error('down') }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'failed' })
    expect(await archiveNow(db, id, who.actor, available().fetch)).toEqual({ ok: true })
    expect(await sourceArchives(db, id)).toEqual(['https://archive.ph/now', snapshot(url)])
    expect((await sourceArchiveChanges(db, id, null)).changes[0]).toMatchObject({ url: snapshot(url), actor: who.actor })
    expect(offersArchiveNow(url, await sourceArchives(db, id))).toBe(false)
    const later = (async () => Response.json({ archived_snapshots: { closest: { available: true, url: `https://web.archive.org/web/20270101000000/${url}` } } })) as unknown as typeof fetch
    expect(await archiveNow(db, id, who.actor, later)).toEqual({ ok: false, error: 'duplicate' })
    // A copy written over plain http is a Wayback copy too, and nothing is asked once one is held.
    const { asked, fetch } = available()
    expect(offersArchiveNow(url, [`http://web.archive.org/web/2020/${url}`])).toBe(false)
    expect(await editSourceArchive(db, id, snapshot(url), true, who.actor)).toBe('ok')
    expect(await editSourceArchive(db, id, `http://web.archive.org/web/2020/${url}`, false, who.actor)).toBe('ok')
    expect(await archiveNow(db, id, who.actor, fetch)).toEqual({ ok: false, error: 'duplicate' })
    expect(asked).toHaveLength(0)
    expect(await archiveNow(db, 999, who.actor, later)).toEqual({ ok: false, error: 'missing' })
    expect(offersArchiveNow('https://archive.ph/x', [])).toBe(false)
    expect(offersArchiveNow(null, [])).toBe(false)
  })

  test(`archive now respects the ${ARCHIVES_MAX}-copy cap`, async () => {
    const url = 'https://example.org/full'
    await createEntry(db, entry, seen({ title: '子', url }), [], who)
    const id = sourceOf(url)
    for (let n = 0; n < ARCHIVES_MAX; n++) expect(await editSourceArchive(db, id, `https://archive.ph/${n}`, false, who.actor)).toBe('ok')
    expect(offersArchiveNow(url, await sourceArchives(db, id))).toBe(false)
    const { asked, fetch } = available()
    expect(await archiveNow(db, id, who.actor, fetch)).toEqual({ ok: false, error: 'full' })
    expect(asked).toHaveLength(0)
    expect(await sourceArchives(db, id)).toHaveLength(ARCHIVES_MAX)
  })

  test('the lookup and the guarded add are served by indexes', async () => {
    const url = 'https://example.org/plan'
    await createEntry(db, entry, seen({ title: '丑', url }), [], who)
    const id = sourceOf(url)
    const hashes = JSON.stringify([await citationHash(seen({ title: '丑', url }))])
    const lookup = plan(UNARCHIVED, [hashes])
    expect(lookup).not.toMatch(/SCAN (?!CONSTANT ROW|json_each)|TEMP B-TREE|AUTOMATIC/)
    expect(lookup).toMatch(/SEARCH c USING INDEX sqlite_autoindex_sources_1 \(hash=\?\)/)
    expect(lookup).toMatch(/SEARCH a USING PRIMARY KEY \(source_id=\?\)/)
    expect(lookup).toMatch(/SEARCH h USING COVERING INDEX source_archive_changes_by_source \(source_id=\?\)/)
    expect((await db.prepare(UNARCHIVED).bind(hashes).all()).results).toEqual([{ id, url }])
    const sent: { sql: string; values: unknown[] }[] = []
    const traced = { prepare(sql: string) {
      const statement = db.prepare(sql)
      return { bind(...values: unknown[]) { sent.push({ sql, values }); return statement.bind(...values) } }
    }, batch: (list: D1PreparedStatement[]) => db.batch(list) } as D1Database
    for (const guard of ['first', 'wayback', 'first'] as const) await editSourceArchive(traced, id, snapshot(url), false, who.actor, guard)
    expect(await sourceArchives(db, id)).toEqual([snapshot(url)])
    const guarded = sent.filter(statement => /source_archive/.test(statement.sql))
    expect(guarded.length).toBeGreaterThanOrEqual(5)
    for (const { sql, values } of guarded) expect(`${sql}: ${plan(sql, values)}`).not.toMatch(/SCAN (?!CONSTANT ROW)|TEMP B-TREE|AUTOMATIC/)
  })
})
