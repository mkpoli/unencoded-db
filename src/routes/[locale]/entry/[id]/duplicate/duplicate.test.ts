import { expect, test } from 'bun:test'
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
  await expect(actions.default(event(of('2', 'saved twice'), '', '1'))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
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
  await expect(actions.default(event(of('1'), '', '3'))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
  // A hidden record's history is closed, and so is its undo.
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  const again = new FormData(); again.set('from', '3')
  expect((await historyActions.unmerge(event(again, '', '1', 'history')) as any).status).toBe(409)
  expect(raw.query('SELECT merged_into FROM entries WHERE id = 3').get()).toEqual({ merged_into: 1 })
})

test('a record is not a duplicate of itself, of nothing, or of a record that is gone', async () => {
  const { raw, event } = await fixture()
  expect(await actions.default(event(of('1')))).toMatchObject({ status: 400, data: { error: 'self' } })
  expect(await actions.default(event(of('')))).toMatchObject({ status: 400, data: { error: 'missing' } })
  expect(await actions.default(event(of('99')))).toMatchObject({ status: 404, data: { error: 'missing' } })
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 2")
  expect(await actions.default(event(of('2')))).toMatchObject({ status: 404, data: { error: 'missing' } })
  expect(raw.query('SELECT count(*) AS n FROM entries WHERE merged_into IS NOT NULL').get()).toEqual({ n: 0 })
})
