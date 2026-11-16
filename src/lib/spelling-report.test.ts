import { expect, test } from 'bun:test'
import { sendSpelling, spellingForm } from './spelling-report'
import { composerVersion } from './composer'
import { writeLimitFor } from './server/guard'

const report = { symptom: 'The right part is too wide.', contact: '', sequence: '⿰亻哥', link: 'https://rare.glyphatlas.org/ja/entry/12', style: 'serif', layout: null, locale: 'ja', record: 12, image: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }) } as const

test('the form carries what the intake reads', () => {
  const form = spellingForm(report)
  expect(form.get('symptom')).toBe(report.symptom)
  expect(form.get('sequence')).toBe('⿰亻哥')
  expect(form.get('link')).toBe(report.link)
  expect(form.get('document')).toBe('{}')
  expect(JSON.parse(form.get('context') as string)).toEqual({ site: 'rare', style: 'serif', layout: null, composerVersion: composerVersion('serif'), locale: 'ja', record: 12 })
  expect(form.has('contact')).toBe(false)
  expect((form.get('image') as File).type).toBe('image/png')
  expect(spellingForm({ ...report, contact: '@someone', image: null }).get('contact')).toBe('@someone')
  expect(spellingForm({ ...report, image: null }).has('image')).toBe(false)
})

test('an answer is the issue, or the intake’s sentence', async () => {
  const answer = (status: number, body: unknown) => (async () => Response.json(body, { status })) as unknown as typeof fetch
  expect(await sendSpelling(new FormData(), answer(201, { number: 3, url: 'https://github.com/mkpoli/han-compose/issues/3', duplicate: false }))).toEqual({ ok: true, url: 'https://github.com/mkpoli/han-compose/issues/3', number: 3 })
  expect(await sendSpelling(new FormData(), answer(429, { error: 'rate_limited', message: 'Too many reports have come from here.' }))).toEqual({ ok: false, message: 'Too many reports have come from here.' })
  expect(await sendSpelling(new FormData(), (async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch)).toEqual({ ok: false, message: null })
  expect(await sendSpelling(new FormData(), (async () => { throw new TypeError('offline') }) as unknown as typeof fetch)).toEqual({ ok: false, message: null })
})

test('a report post is a write the hook limits', () => {
  const event = (method: string) => ({ request: new Request('https://example.test/api/report', { method }), url: new URL('https://example.test/api/report'), route: { id: '/api/report' } }) as any
  expect(writeLimitFor(event('POST'))).toBe('EDITS')
})
