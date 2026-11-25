import { expect, test } from 'bun:test'
import { getEntry } from '$lib/server/entries'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../../../new/+page.server'
import { actions as historyActions, load as historyLoad } from '../history/+page.server'
import { actions, load } from './+page.server'

async function fixture() {
  const { db, raw } = openTestDb()
  const event = (form = new FormData(), query = '', id = '1', page = 'duplicate') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/entry/${id}/${page}${query}`),
    params: { locale: 'en', id }, locals: { person: null }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  // The same form saved twice, and a record of another form.
  for (const ids of ['⿱赤相', '⿱赤相', '⿰木木']) {
    const create = new FormData(); create.set('url', 'https://example.test/source'); create.set('ids', ids)
    await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  }
  return { db, raw, event }
}
const of = (value: string, summary = '') => { const form = new FormData(); form.set('of', value); form.set('summary', summary); return form }

test('the page offers the records of the same description and compares the one that is named', async () => {
  const { event } = await fixture()
  const open = await load(event(undefined, '', '2')) as any
  expect(open.alike.map((tile: { id: number }) => tile.id)).toEqual([1])
  expect(open.pair).toBeNull()
  for (const named of ['1', 'R%2B0001', encodeURIComponent('https://rare.glyphatlas.org/zh-Hant/entry/1')]) {
    const compared = await load(event(undefined, `?of=${named}`, '2')) as any
    expect(compared.pair.map((tile: { id: number }) => tile.id)).toEqual([1, 2])
  }
  for (const named of ['2', '99', 'nothing']) expect(await load(event(undefined, `?of=${named}`, '2'))).toMatchObject({ pair: null, unknown: true })
})

test('the later record joins the earlier one from either page, and the history undoes it', async () => {
  const { raw, event } = await fixture()
  await expect(actions.merge(event(of('2', 'saved twice'), '', '1'))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  expect(raw.query('SELECT id, merged_into FROM entries ORDER BY id').all()).toEqual([{ id: 1, merged_into: null }, { id: 2, merged_into: 1 }, { id: 3, merged_into: null }])
  expect(raw.query("SELECT entry_id, summary FROM revisions WHERE kind = 'merge' ORDER BY entry_id").all()).toEqual([{ entry_id: 1, summary: 'saved twice' }, { entry_id: 2, summary: 'saved twice' }])
  await expect(load(event(undefined, '', '2'))).rejects.toMatchObject({ status: 302, location: '/en/entry/1' })
  const listed = await historyLoad(event(undefined, '', '1', 'history')) as any
  expect(listed.duplicates).toEqual([2])
  expect(listed.rows[0]).toMatchObject({ kind: 'merge', merge: { from: 2 } })
  const undo = new FormData(); undo.set('from', '2')
  await expect(historyActions.unmerge(event(undo, '', '1', 'history'))).rejects.toMatchObject({ status: 303 })
  expect(raw.query('SELECT merged_into FROM entries WHERE id = 2').get()).toEqual({ merged_into: null })
  expect((await historyActions.unmerge(event(undo, '', '1', 'history')) as any).status).toBe(409)
  await expect(actions.merge(event(of('1'), '', '3'))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  // A hidden record's history is closed, and so is its undo.
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  const again = new FormData(); again.set('from', '3')
  expect((await historyActions.unmerge(event(again, '', '1', 'history')) as any).status).toBe(409)
  expect(raw.query('SELECT merged_into FROM entries WHERE id = 3').get()).toEqual({ merged_into: 1 })
})

test('a record is not a duplicate of itself, of nothing, or of a record that is gone', async () => {
  const { raw, event } = await fixture()
  expect(await actions.merge(event(of('1')))).toMatchObject({ status: 400, data: { error: 'self' } })
  expect(await actions.merge(event(of('')))).toMatchObject({ status: 400, data: { error: 'missing' } })
  expect(await actions.merge(event(of('99')))).toMatchObject({ status: 404, data: { error: 'missing' } })
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 2")
  expect(await actions.merge(event(of('2')))).toMatchObject({ status: 404, data: { error: 'missing' } })
  expect(raw.query('SELECT count(*) AS n FROM entries WHERE merged_into IS NOT NULL').get()).toEqual({ n: 0 })
})

const apart = (value: string, relationship: string, difference = '') => { const form = new FormData(); form.set('of', value); form.set('relationship', relationship); form.set('difference', difference); return form }

test('the later record is kept apart from either page, by a relation that names the earlier one', async () => {
  const { db, raw, event } = await fixture()
  await expect(actions.apart(event(apart('2', 'glyph', 'a stroke added'), '', '1'))).rejects.toMatchObject({ status: 303, location: '/en/entry/2' })
  const stated = async (id: number) => (await getEntry(db, id))!.claims.filter(claim => claim.kind === 'relation').map(claim => [claim.value, claim.data])
  expect(await stated(2)).toEqual([['R+0001', { relationship: 'glyph', difference: 'a stroke added' }]])
  expect(await stated(1)).toEqual([])
  expect(raw.query("SELECT entry_id, kind, rev FROM revisions WHERE kind = 'edit'").all()).toEqual([{ entry_id: 2, kind: 'edit', rev: 2 }])
  // Said again, it changes nothing; another relation is another statement.
  await expect(actions.apart(event(apart('1', 'glyph', 'a stroke added'), '', '2'))).rejects.toMatchObject({ status: 303, location: '/en/entry/2' })
  expect(await stated(2)).toHaveLength(1)
  await expect(actions.apart(event(apart('1', 'uncertain'), '', '2'))).rejects.toMatchObject({ status: 303 })
  expect(await stated(2)).toHaveLength(2)
  // A relation that holds under one meaning does not say it of the record.
  raw.exec(`INSERT INTO claims(entry_id, position, key, kind, value, data, under) VALUES (2, 10, 'mean0001', 'meaning', 'a fish', NULL, '[]'), (2, 11, 'rela0001', 'relation', 'R+0001', '{"relationship":"similar"}', '["mean0001"]')`)
  await expect(actions.apart(event(apart('1', 'similar'), '', '2'))).rejects.toMatchObject({ status: 303 })
  expect(await stated(2)).toHaveLength(4)
  // Its other claims are as they were.
  expect((await getEntry(db, 2))!.claims.filter(claim => claim.kind === 'ids').map(claim => claim.value)).toEqual(['⿱赤相'])
})

test('a record is kept apart from another live record only, by a relation the site has', async () => {
  const { raw, event } = await fixture()
  expect(await actions.apart(event(apart('1', 'glyph')))).toMatchObject({ status: 400, data: { error: 'self' } })
  expect(await actions.apart(event(apart('', 'glyph')))).toMatchObject({ status: 400, data: { error: 'missing' } })
  expect(await actions.apart(event(apart('99', 'glyph')))).toMatchObject({ status: 404, data: { error: 'missing' } })
  for (const kind of ['', 'twin']) expect(await actions.apart(event(apart('2', kind)))).toMatchObject({ status: 400, data: { error: 'relatedCharacters' } })
  expect(await actions.apart(event(apart('2', 'glyph', 'x'.repeat(5001))))).toMatchObject({ status: 400, data: { error: 'relatedCharacters' } })
  await expect(actions.merge(event(of('2'), '', '1'))).rejects.toMatchObject({ status: 303 })
  expect(await actions.apart(event(apart('2', 'glyph'), '', '3'))).toMatchObject({ status: 400, data: { error: 'merged' } })
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  expect(await actions.apart(event(apart('1', 'glyph'), '', '3'))).toMatchObject({ status: 404, data: { error: 'missing' } })
  expect(raw.query("SELECT count(*) AS n FROM claims WHERE kind = 'relation'").get()).toEqual({ n: 0 })
})
