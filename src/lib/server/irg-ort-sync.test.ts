import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { createEntry, getEntry, removeSighting, type EntryFields, type SightingFields } from './entries'
import { createPerson } from './people'
import { openTestDb } from './testdb'
import { IRG_ORT_ACTOR_ID, ortTargetsForClaims, parseOrtUrl, syncOrtEntry } from './irg-ort-sync'

const enc = (obj: unknown) => JSON.stringify(obj).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const baseSighting: SightingFields = {
  place: 'Seed source', url: null, title: null, author: null, publisher: null, report_date: null,
  container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null,
  contexts: null, style: null, types: null, quotes: null, note: null,
}

test('parseOrtUrl only accepts https hc.jsecs.org ORT id/find URLs', () => {
  expect(parseOrtUrl('https://hc.jsecs.org/irg/ws2024/app/index.php?id=1')).toEqual({
    ws: 'ws2024',
    url: 'https://hc.jsecs.org/irg/ws2024/app/index.php?id=00001',
    queryKey: 'ws2024:id:00001',
  })
  expect(parseOrtUrl('https://hc.jsecs.org/irg/ws2021/app/index.php?find=GZ-0381601')?.queryKey).toBe('ws2021:find:GZ-0381601')
  expect(parseOrtUrl('http://hc.jsecs.org/irg/ws2024/app/index.php?id=00001')).toBeNull()
  expect(parseOrtUrl('https://evil.example/irg/ws2024/app/index.php?id=00001')).toBeNull()
  expect(parseOrtUrl('https://hc.jsecs.org/irg/ws2024/app/index.php?id=0')).toBeNull()
})

test('ortTargetsForClaims resolves both irg-ws serial claims and encoded Unicode claims', () => {
  const claims = [
    newClaim('encoding', 'WS2024-00001', { charset: 'irg-ws' }),
    newClaim('encoding', 'U+323B5', { charset: 'unicode' }),
  ]
  expect(ortTargetsForClaims(claims, { '\u{323B5}': ['GZ-0381601'] })).toEqual([
    { ws: 'ws2024', url: 'https://hc.jsecs.org/irg/ws2024/app/index.php?id=00001', key: 'ws2024:id:00001' },
    { ws: 'ws2021', url: 'https://hc.jsecs.org/irg/ws2021/app/index.php?find=GZ-0381601', key: 'ws2021:find:GZ-0381601' },
  ])
})

test('syncOrtEntry imports bibliographic sightings without mirroring images, resumes partial multi-source runs, and keeps removed sightings omitted', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const fields: EntryFields = {
    description: null, radical: null, strokes: null,
    claims: [newClaim('ids', '⿰右百'), newClaim('encoding', 'U+323B5', { charset: 'unicode' })],
  }
  const entryId = await createEntry(db, fields, baseSighting, [], { actor: person.id, ip: null })

  const payload = {
    'GZ-0381601': {
      evidence: [{ source_reference: 'GZ-0381601', region: 'G', evidence_no: '0', path: '/gz-evidence/GZ-0381601.jpg', description: null }],
      info: { source_reference: 'GZ-0381601', region: 'GZ', data: { 'k) Ref. to Evidence doc': '《古壮字字典》 page 038 col 1 entry 6' } },
    },
    'UTC-03207': {
      evidence: [{ source_reference: 'UTC-03207', region: 'UTC', evidence_no: '0', path: '/utc-evidence/UTC-03207.png', description: null }],
      info: { source_reference: 'UTC-03207', region: 'UTC', data: { 'k) References for Evidence Images': 'Tianwenge Qinpu (天闻阁琴谱) vol1, fol2' } },
    },
  }
  const html = `<!doctype html><title>00010 | ⿰右百 | WS2021v7.0</title><ws-evidences data-evidence="${enc(payload)}"></ws-evidences>`
  const fetcher = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

  // Dry run reports both matched refs without writing.
  const dry = await syncOrtEntry(db, entryId, { unihanSources: { '\u{323B5}': ['GZ-0381601'] }, fetcher, dryRun: true })
  expect(dry).toEqual({ entryId, targets: 1, added: 2, skipped: 0, refs: ['GZ-0381601', 'UTC-03207'] })
  expect((await getEntry(db, entryId))!.sightings).toHaveLength(1)

  // Partial capped run imports the first source; second run imports the remaining source.
  const first = await syncOrtEntry(db, entryId, { unihanSources: { '\u{323B5}': ['GZ-0381601'] }, fetcher, maxPerEntry: 1 })
  expect(first).toEqual({ entryId, targets: 1, added: 1, skipped: 0, refs: ['GZ-0381601'] })
  const resumed = await syncOrtEntry(db, entryId, { unihanSources: { '\u{323B5}': ['GZ-0381601'] }, fetcher, maxPerEntry: 5 })
  expect(resumed).toEqual({ entryId, targets: 1, added: 1, skipped: 1, refs: ['UTC-03207'] })

  const after = (await getEntry(db, entryId))!
  expect(after.sightings).toHaveLength(3)
  const imported = after.sightings.filter(s => s.by_id === IRG_ORT_ACTOR_ID)
  expect(imported).toHaveLength(2)
  expect(imported[0].media).toEqual([])
  expect(imported[0].vias[0]?.url).toBe('https://hc.jsecs.org/irg/ws2021/app/index.php?id=00010')

  // Removing an imported sighting keeps it omitted on subsequent syncs.
  await removeSighting(db, entryId, imported[0].id, imported[0].rev, { actor: person.id, ip: null }, 'duplicate')
  const afterRemove = await syncOrtEntry(db, entryId, { unihanSources: { '\u{323B5}': ['GZ-0381601'] }, fetcher })
  expect(afterRemove.added).toBe(0)
})

test('syncOrtEntry skips non-200, redirect and non-HTML responses cleanly', async () => {
  const { db } = openTestDb()
  const person = await createPerson(db)
  const entryId = await createEntry(db, {
    description: null, radical: null, strokes: null,
    claims: [newClaim('ids', '㇀'), newClaim('encoding', 'WS2024-00001', { charset: 'irg-ws' })],
  }, baseSighting, [], { actor: person.id, ip: null })

  for (const response of [
    new Response('redirect', { status: 302, headers: { location: 'https://evil.example/' } }),
    new Response('not found', { status: 404 }),
    new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response('x', { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(10 * 1024 * 1024) } }),
  ]) {
    const res = await syncOrtEntry(db, entryId, { fetcher: async () => response })
    expect(res).toEqual({ entryId, targets: 1, added: 0, skipped: 1, refs: [] })
  }
})
