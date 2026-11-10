import { expect, test } from 'bun:test'
import { openTestDb } from '$lib/server/testdb'
import { actions as create } from './[locale]/new/+page.server'
import { actions as detail } from './[locale]/entry/[id]/+page.server'

function formWithRows(count: number, character = '木', relationship = 'variant') {
  const form = new FormData()
  form.set('related_characters_present', '1')
  form.set('rev', '1')
  form.set('url', 'https://example.test/source')
  for (let i = 0; i < count; i++) {
    form.append('related_character', character)
    form.append('related_relationship', relationship)
    form.append('related_difference', `difference ${i}`)
    form.append('related_evidence', `source ${i}`)
  }
  return form
}

test('create and edit reject invalid comparisons without discarding draft text or writing', async () => {
  const { db, raw } = openTestDb()
  raw.exec("INSERT INTO people(id,name,created_at) VALUES('p','Person','2026'); INSERT INTO entries(id,script,created_by,created_at,updated_at) VALUES(1,'han','p','2026','2026')")
  const event = (form: FormData) => ({ request: { formData: async () => form }, url: new URL('https://example.test/en'), params: { locale: 'en', id: '1' }, locals: {}, platform: { env: { DB: db, MEDIA: {} } }, getClientAddress: () => '127.0.0.1' }) as any
  const mismatched = formWithRows(1); mismatched.append('related_evidence', 'extra source')
  const cases = [formWithRows(1, '   '), formWithRows(51), formWithRows(1, '𠀀'.repeat(41)), formWithRows(1, '木', 'invented'), mismatched]
  for (const form of cases) {
    for (const action of [create.default, detail.edit]) {
      const result = await action(event(form)) as any
      expect(result.status).toBe(400)
      expect(result.data.error).toBe('relatedCharacters')
      const draft = JSON.parse(result.data.values.related_characters)
      expect(draft[0].difference).toBe('difference 0')
      expect(draft[0].evidence).toBe('source 0')
      if (form === cases[0]) expect(draft[0].character).toBe('   ')
      if (form === cases[1]) expect(draft).toHaveLength(51)
      if (form === mismatched) expect(draft[1].evidence).toBe('extra source')
    }
  }
  expect(raw.query('SELECT count(*) AS n FROM entries').get()).toEqual({ n: 1 })
  expect(raw.query('SELECT rev FROM entries WHERE id=1').get()).toEqual({ rev: 1 })
  expect(raw.query('SELECT count(*) AS n FROM revisions').get()).toEqual({ n: 0 })
})
