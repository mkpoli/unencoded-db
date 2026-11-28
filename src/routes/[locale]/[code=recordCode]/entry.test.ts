import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'svelte/compiler'
import { createEntry, type EntryFields, type SightingFields } from '$lib/server/entries'
import { createPerson } from '$lib/server/people'
import { openTestDb } from '$lib/server/testdb'
import { newClaim } from '$lib/claims'
import { recordCode } from '$lib/code'
import { actions, load } from './+page.server'

const fields: EntryFields = { script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', '⿺𡕤面')] }
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }

test('a description in ids_add is passed to the page when it is a whole one, and only one', async () => {
  const { db } = openTestDb()
  const id = await createEntry(db, fields, sighting, [], { actor: (await createPerson(db)).id, ip: null })
  const idsAdd = async (query: string) => ((await load({ params: { locale: 'en', code: recordCode(id) }, url: new URL(`https://example.test/en/${recordCode(id)}${query}`), locals: { person: null }, platform: { env: { DB: db } } } as any)) as any).idsAdd
  expect(await idsAdd('')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱ 𡗗夂面')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺⿱𡗗夂面')}&ids_add=${encodeURIComponent('⿰木木')}`)).toBe('⿺⿱𡗗夂面')
  expect(await idsAdd('?ids_add=face')).toBeNull()
  expect(await idsAdd(`?ids_add=${encodeURIComponent('⿺𡕤')}`)).toBeNull()
  expect(await idsAdd('?ids_add=')).toBeNull()
})

test('record load returns Unihan IRG sources for encoded Unicode claims via ASSETS', async () => {
  const { db } = openTestDb()
  const encodedFields: EntryFields = {
    ...fields,
    claims: [newClaim('ids', '⿷匚一'), newClaim('encoding', 'U+30002', { charset: 'unicode' })],
  }
  const id = await createEntry(db, encodedFields, sighting, [], { actor: (await createPerson(db)).id, ip: null })
  const assets = {
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      return new Response(readFileSync(`static${url.pathname}`, 'utf8'))
    },
  }
  const page = (await load({
    params: { locale: 'en', code: recordCode(id) },
    url: new URL(`https://example.test/en/${recordCode(id)}`),
    locals: { person: null },
    platform: { env: { DB: db, ASSETS: assets } },
  } as any)) as any
  expect(page.irgSources).toEqual({ '\u{30002}': ['UTC-00969'] })
})

test('a comment is saved under its writer and may name only the record\'s own evidence', async () => {
  const { db } = openTestDb()
  const author = await createPerson(db), reader = await createPerson(db)
  const id = await createEntry(db, fields, sighting, [], { actor: author.id, ip: null })
  const post = (values: Record<string, string>, person: unknown = reader) => {
    const body = new FormData()
    for (const [name, value] of Object.entries(values)) body.set(name, value)
    const request = new Request(`https://example.test/en/${recordCode(id)}?/comment`, { method: 'POST', body })
    return actions.comment({ request, params: { locale: 'en', code: recordCode(id) }, url: new URL(request.url), locals: { person }, platform: { env: { DB: db } }, getClientAddress: () => '127.0.0.1' } as any)
  }
  await expect(post({ body: 'Is this 觀?', about: '1' })).rejects.toMatchObject({ status: 303, location: `/en/${recordCode(id)}#comment-1` })
  await expect(post({ body: 'x', about: '99' })).rejects.toMatchObject({ status: 404 })
  expect(await post({ body: '  ' })).toMatchObject({ status: 400, data: { error: 'comment' } })
  await expect(post({ body: 'x' }, { ...reader, banned: true })).rejects.toMatchObject({ status: 403 })
  const page = (await load({ params: { locale: 'en', code: recordCode(id) }, url: new URL(`https://example.test/en/${recordCode(id)}?about=1`), locals: { person: null }, platform: { env: { DB: db } } } as any)) as any
  expect(page.about).toBe(1)
  expect(page.comments).toMatchObject([{ body: 'Is this 觀?', sighting_id: 1, by_id: reader.id }])
  const hide = (person: unknown) => {
    const body = new FormData(); body.set('comment', '1')
    const request = new Request(`https://example.test/en/${recordCode(id)}?/hideComment`, { method: 'POST', body })
    return actions.hideComment({ request, params: { locale: 'en', code: recordCode(id) }, url: new URL(request.url), locals: { person }, platform: { env: { DB: db } }, getClientAddress: () => '127.0.0.1' } as any)
  }
  await expect(hide(reader)).rejects.toMatchObject({ status: 403 })
  await expect(hide({ ...reader, moderator: true })).rejects.toMatchObject({ status: 303 })
})

test('picture loops and lightbox keys never rely on image_key alone', () => {
  const srcRoot = fileURLToPath(new URL('../../../..', import.meta.url))
  const svelteFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return svelteFiles(full)
    return entry.name.endsWith('.svelte') ? [full] : []
  })
  const visit = (node: unknown, onNode: (record: Record<string, unknown>) => void) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) visit(item, onNode); return }
    const record = node as Record<string, unknown>
    onNode(record)
    for (const value of Object.values(record)) visit(value, onNode)
  }
  const bareImageKey = /^[\w$]+\.image_key$/
  let checkedEach = 0
  let checkedKey = 0
  for (const file of svelteFiles(srcRoot)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('image_key')) continue
    const ast = parse(source, { modern: true })
    visit(ast.fragment, record => {
      if (record.type === 'EachBlock' && record.key) {
        const keyNode = record.key as { start: number; end: number }
        const key = source.slice(keyNode.start, keyNode.end).trim()
        expect(bareImageKey.test(key), `${file}: each key ${key}`).toBe(false)
        if (key.includes('image_key')) checkedEach++
      }
      if (record.type === 'KeyBlock' && record.expression) {
        const exprNode = record.expression as { start: number; end: number }
        const expr = source.slice(exprNode.start, exprNode.end).trim()
        expect(bareImageKey.test(expr), `${file}: key block ${expr}`).toBe(false)
        if (expr.includes('image_key')) checkedKey++
      }
    })
  }
  expect(checkedEach).toBeGreaterThanOrEqual(3)
  expect(checkedKey).toBeGreaterThanOrEqual(1)
})
