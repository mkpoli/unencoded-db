import { expect, test } from 'bun:test'
import { POST } from './report/+server'

function post(env: Record<string, unknown> | undefined, form = new FormData()) {
  const request = new Request('https://rare.glyphatlas.org/api/report', { method: 'POST', body: form, headers: { origin: 'https://rare.glyphatlas.org' } })
  return { request, url: new URL(request.url), platform: env && { env }, locals: { person: null }, getClientAddress: () => '127.0.0.1' } as any
}

test('forwards a report to the intake as it is', async () => {
  const seen: { url: string; method: string; origin: string | null; form: FormData }[] = []
  const REPORT = { fetch: async (request: Request) => { seen.push({ url: request.url, method: request.method, origin: request.headers.get('origin'), form: await request.formData() }); return Response.json({ number: 7, url: 'https://github.com/mkpoli/han-compose/issues/7', duplicate: false }, { status: 201 }) } }
  const form = new FormData(); form.set('symptom', 'The left part is too small.'); form.set('context', '{"site":"rare"}')
  const response = await POST(post({ REPORT }, form))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ number: 7, url: 'https://github.com/mkpoli/han-compose/issues/7', duplicate: false })
  expect(seen).toHaveLength(1)
  expect(seen[0].url).toBe('https://rare.glyphatlas.org/')
  expect(seen[0].method).toBe('POST')
  expect(seen[0].origin).toBe('https://rare.glyphatlas.org')
  expect(seen[0].form.get('symptom')).toBe('The left part is too small.')
  expect(seen[0].form.get('context')).toBe('{"site":"rare"}')
})

test('passes the intake its refusals on', async () => {
  const REPORT = { fetch: async () => Response.json({ error: 'rate_limited', message: 'Too many reports have come from here.' }, { status: 429 }) }
  const response = await POST(post({ REPORT }))
  expect(response.status).toBe(429)
  expect(await response.json()).toMatchObject({ error: 'rate_limited' })
})

test('answers 503 without the binding', async () => {
  const response = await POST(post({}))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ error: 'unavailable' })
  expect((await POST(post(undefined))).status).toBe(503)
})

test('spends the write allowance first and stops a reporter who has none', async () => {
  let forwarded = 0
  const REPORT = { fetch: async () => { forwarded++; return new Response('{}') } }
  await expect(POST(post({ REPORT, EDITS: { limit: async () => ({ success: false }) } }))).rejects.toMatchObject({ status: 429 })
  await expect(POST(post({ REPORT, WRITES_PAUSED: '1' }))).rejects.toMatchObject({ status: 503 })
  expect(forwarded).toBe(0)
})

test('answers 503 when the intake cannot be reached', async () => {
  const REPORT = { fetch: async () => { throw new Error('no such Worker') } }
  expect((await POST(post({ REPORT }))).status).toBe(503)
})
