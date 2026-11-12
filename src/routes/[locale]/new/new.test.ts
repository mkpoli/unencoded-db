import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { setHidden } from '$lib/server/entries'
import { actions, load } from './+page.server'

function fixture() {
  const { db, raw } = openTestDb()
  const event = (form = new FormData(), query = '') => ({
    request: { formData: async () => form }, url: new URL(`https://example.test/en/new${query}`),
    params: { locale: 'en' }, locals: { person: null }, platform: { env: { DB: db } },
    cookies: { set() {} }, getClientAddress: () => '127.0.0.1',
  }) as any
  return { db, raw, event }
}

test('the form starts from a visible sighting', async () => {
  const { db, raw, event } = fixture()
  const form = new FormData()
  for (const [name, value] of Object.entries({ place: 'A dictionary', url: 'https://example.test/book', title: 'Book', page: '12', original_date: '1617', note: 'only this character' })) form.set(name, value)
  await expect(actions.default(event(form))).rejects.toMatchObject({ status: 303 })
  expect(await load(event(undefined, '?sighting=1'))).toEqual({ seed: { values: { url: 'https://example.test/book', title: 'Book', author: null, publisher: null, report_date: null, place: 'A dictionary', original_date: '1617', page: '12' }, pictures: [] } })
  expect(await load(event())).toEqual({ seed: null })
  expect(await load(event(undefined, '?sighting=9'))).toEqual({ seed: null })
  const moderator = (raw.query('SELECT id FROM people LIMIT 1').get() as { id: string }).id
  await setHidden(db, { entry: 1 }, true, { actor: moderator, ip: null }, null)
  expect(await load(event(undefined, '?sighting=1'))).toEqual({ seed: null })
})
