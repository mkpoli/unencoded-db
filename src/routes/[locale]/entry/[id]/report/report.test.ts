import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { actions as createActions } from '../../../new/+page.server'
import { actions, load } from './+page.server'

async function fixture() {
  const { db, raw } = openTestDb()
  const event = (form = new FormData(), query = '', id = '1') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/entry/${id}/report${query}`),
    params: { locale: 'en', id }, locals: { person: null }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  const create = new FormData(); create.set('url', 'https://example.test/source')
  await expect(createActions.default(event(create))).rejects.toMatchObject({ status: 303 })
  return { db, raw, event }
}

test('reports visible entries and sightings with a writer', async () => {
  const { raw, event } = await fixture()
  const form = new FormData(); form.set('reason', '  private details  ')
  expect(await actions.default(event(form))).toEqual({ sent: true })
  expect(await actions.default(event(form, '?sighting=1&next=https://evil.test'))).toEqual({ sent: true })
  const rows = raw.query('SELECT entry_id, sighting_id, reason, reporter FROM reports ORDER BY id').all() as any[]
  expect(rows.map(({ entry_id, sighting_id, reason }) => ({ entry_id, sighting_id, reason }))).toEqual([
    { entry_id: 1, sighting_id: null, reason: 'private details' },
    { entry_id: 1, sighting_id: 1, reason: 'private details' },
  ])
  expect(rows.every(row => row.reporter)).toBe(true)
})

test('rejects empty, oversized and non-text reasons without creating writers', async () => {
  const { raw, event } = await fixture()
  const before = (raw.query('SELECT count(*) AS n FROM people').get() as any).n
  for (const value of ['   ', 'x'.repeat(2001), new File(['x'], 'reason.txt')]) {
    const form = new FormData(); form.set('reason', value)
    expect((await actions.default(event(form)) as any).status).toBe(400)
  }
  expect((raw.query('SELECT count(*) AS n FROM people').get() as any).n).toBe(before)
  expect((raw.query('SELECT count(*) AS n FROM reports').get() as any).n).toBe(0)
})

test('rejects hidden, merged, missing and unrelated targets on load and write', async () => {
  const { raw, event } = await fixture()
  const form = new FormData(); form.set('reason', 'spam')
  for (const query of ['?sighting=2', '?sighting=0', '?sighting=1&sighting=1']) {
    await expect(load(event(form, query))).rejects.toMatchObject({ status: 404 })
    await expect(actions.default(event(form, query))).rejects.toMatchObject({ status: 404 })
  }
  raw.exec("UPDATE sightings SET hidden_at = 'now' WHERE id = 1")
  await expect(load(event(form, '?sighting=1'))).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event(form, '?sighting=1'))).rejects.toMatchObject({ status: 404 })
  raw.exec("UPDATE entries SET hidden_at = 'now' WHERE id = 1")
  await expect(load(event(form))).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 404 })
  raw.exec('UPDATE entries SET hidden_at = NULL, merged_into = 2 WHERE id = 1')
  await expect(load(event(form))).rejects.toMatchObject({ status: 404 })
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 404 })
  await expect(load(event(form, '', '999'))).rejects.toMatchObject({ status: 404 })
})

test('write guard rejects paused and rate-limited requests', async () => {
  const { raw, event } = await fixture()
  const form = new FormData(); form.set('reason', 'spam')
  const paused = event(form); paused.platform.env.WRITES_PAUSED = '1'
  await expect(actions.default(paused)).rejects.toMatchObject({ status: 503 })
  const limited = event(form); limited.platform.env.EDITS = { limit: async () => ({ success: false }) }
  await expect(actions.default(limited)).rejects.toMatchObject({ status: 429 })
  expect((raw.query('SELECT count(*) AS n FROM reports').get() as any).n).toBe(0)
})
