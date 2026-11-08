import { describe, expect, test } from 'bun:test'
import { handle } from './hooks.server'

type HookOptions = {
  method?: string
  path?: string
  routeId?: string | null
  env?: Record<string, unknown>
  cf?: boolean
  address?: string
  body?: string
}

function makeEvent(options: HookOptions = {}) {
  const method = options.method ?? 'POST'
  const path = options.path ?? '/en/entry/1/report'
  const url = new URL(`https://example.test${path}`)
  const body = options.body !== undefined ? options.body : method === 'POST' ? 'reason=spam' : undefined
  const request = new Request(url, { method, body })
  const env = options.env ?? {}
  return {
    request,
    url,
    route: { id: options.routeId === undefined ? '/[locale]/entry/[id]/report' : options.routeId },
    locals: { moderator: null },
    getClientAddress: () => options.address ?? '192.0.2.1',
    platform: options.cf === false ? { env } : { cf: { colo: 'NRT' }, env },
  } as any
}

async function run(event: any) {
  const resolveCalls = { count: 0 }
  const response = await handle({
    event,
    resolve: async () => {
      resolveCalls.count++
      return new Response('resolved', { status: 200 })
    },
  } as any) as Response
  return { response, resolveCalls }
}

describe('report rate limit hook', () => {
  test('returns 429 before reading the body or resolving', async () => {
    let bodyUsedAtLimit = false
    let calls = 0
    const event = makeEvent({
      env: {
        REPORT_RATE_LIMIT: {
          limit: async () => {
            bodyUsedAtLimit = event.request.bodyUsed
            calls++
            return { success: false }
          },
        },
      },
    })

    const { response, resolveCalls } = await run(event)
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(calls).toBe(1)
    expect(bodyUsedAtLimit).toBe(false)
    expect(event.request.bodyUsed).toBe(false)
    expect(resolveCalls.count).toBe(0)
  })

  test('returns 503 before reading the body or resolving when the platform metadata is missing', async () => {
    const event = makeEvent({ cf: false, env: {} })
    const { response, resolveCalls } = await run(event)
    expect(response.status).toBe(503)
    expect(event.request.bodyUsed).toBe(false)
    expect(resolveCalls.count).toBe(0)
  })

  test('lets an allowed report reach the body limit and resolve', async () => {
    let bodyUsedAtLimit = false
    const event = makeEvent({
      env: {
        REPORT_RATE_LIMIT: {
          limit: async () => {
            bodyUsedAtLimit = event.request.bodyUsed
            return { success: true }
          },
        },
      },
    })
    const { response, resolveCalls } = await run(event)
    expect(response.status).toBe(200)
    expect(bodyUsedAtLimit).toBe(false)
    expect(resolveCalls.count).toBe(1)
  })

  test('does not rate limit other POST or GET paths', async () => {
    let calls = 0
    const binding = {
      limit: async () => {
        calls++
        return { success: false }
      },
    }

    const otherPost = makeEvent({ path: '/en/entry/1', routeId: '/[locale]/entry/[id]', env: { REPORT_RATE_LIMIT: binding } })
    expect((await run(otherPost)).response.status).toBe(200)

    const reportGet = makeEvent({ method: 'GET', env: { REPORT_RATE_LIMIT: binding } })
    expect((await run(reportGet)).response.status).toBe(200)

    expect(calls).toBe(0)
  })

  test('keeps the existing moderation guard ahead of the report limiter', async () => {
    const event = makeEvent({ path: '/en/moderate/1/hide', routeId: '/[locale]/moderate/[id]/hide', env: {} })
    const { response, resolveCalls } = await run(event)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
    expect(resolveCalls.count).toBe(0)
  })
})
