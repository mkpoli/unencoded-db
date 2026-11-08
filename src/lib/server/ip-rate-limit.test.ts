import { beforeEach, describe, expect, test } from 'bun:test'
import {
  canonicalClientNetwork,
  enforceReportRateLimit,
  isReportPath,
  isReportRequest,
  resetLocalReportRateLimit,
} from './ip-rate-limit'

const PLATFORM_CF = { colo: 'NRT' }

type LimiterCall = { key: string }

function limiter(outcome: (() => unknown) | unknown = { success: true }) {
  const calls: LimiterCall[] = []
  return {
    calls,
    binding: {
      limit: async (options: { key: string }) => {
        calls.push(options)
        return typeof outcome === 'function' ? (outcome as () => unknown)() : outcome
      },
    },
  }
}

type EventOptions = {
  host?: string
  address?: string | (() => string)
  cf?: boolean
  binding?: { limit(options: { key: string }): Promise<unknown> }
  local?: boolean
  platform?: boolean
}

function makeEvent(options: EventOptions = {}) {
  const env: Record<string, unknown> = {}
  if (options.local) env.LOCAL_RATE_LIMIT = 'true'
  if (options.binding) env.REPORT_RATE_LIMIT = options.binding
  const address = options.address ?? '192.0.2.1'
  return {
    url: new URL(`https://${options.host ?? 'example.test'}/entry/1/report`),
    getClientAddress: () => (typeof address === 'function' ? address() : address),
    platform: options.platform === false
      ? undefined
      : { cf: options.cf === false ? undefined : PLATFORM_CF, env },
  }
}

async function check(options: EventOptions = {}, now?: () => number) {
  return enforceReportRateLimit(makeEvent(options) as any, now ? { now } : {})
}

beforeEach(() => resetLocalReportRateLimit())

describe('client network keys', () => {
  test('returns an IPv4 address unchanged and groups an IPv6 address by /64', () => {
    expect(canonicalClientNetwork('192.0.2.1')).toBe('192.0.2.1')
    expect(canonicalClientNetwork('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(canonicalClientNetwork('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64')
    expect(canonicalClientNetwork('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64')
    expect(canonicalClientNetwork('2001:db8::1')).toBe('2001:db8::/64')
  })

  test('rejects IPv4-mapped IPv6 in either notation', () => {
    for (const address of ['::ffff:192.0.2.1', '::ffff:c000:201', '::FFFF:c000:201', '0:0:0:0:0:ffff:192.0.2.1']) {
      expect(canonicalClientNetwork(address)).toBeNull()
    }
  })

  test('rejects malformed addresses', () => {
    for (const address of [
      '',
      ' ',
      'example.test',
      '192.0.2',
      '192.0.2.1.5',
      '256.0.0.1',
      '192.00.2.1',
      '192.0.2.-1',
      '192.0.2.1 ',
      '::1%eth0',
      '[::1]',
      ':::',
      '1::2::3',
      '2001:db8::g',
      '2001:db8:1:2:3:4:5',
      '2001:db8:1:2:3:4:5:6:7',
      '2001:db8::192.0.2',
    ]) {
      expect(canonicalClientNetwork(address)).toBeNull()
    }
  })
})

describe('report rate limiting', () => {
  test('hashes the network key and never passes the raw address', async () => {
    const first = limiter()
    expect(await check({ binding: first.binding, address: '192.0.2.1' })).toBeNull()
    expect(first.calls).toHaveLength(1)
    const key = first.calls[0]!.key
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('192.0.2.1')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('192.0.2.1'))
    expect(key).toBe(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''))

    const same = limiter()
    await check({ binding: same.binding, address: '192.0.2.1' })
    expect(same.calls[0]!.key).toBe(key)

    const other = limiter()
    await check({ binding: other.binding, address: '192.0.2.2' })
    expect(other.calls[0]!.key).not.toBe(key)
  })

  test('groups IPv6 clients by /64 before hashing', async () => {
    const first = limiter()
    const second = limiter()
    await check({ binding: first.binding, address: '2001:db8:1:2::1' })
    await check({ binding: second.binding, address: '2001:db8:1:2:ffff::9' })
    expect(first.calls[0]!.key).toBe(second.calls[0]!.key)

    const third = limiter()
    await check({ binding: third.binding, address: '2001:db8:1:3::1' })
    expect(third.calls[0]!.key).not.toBe(first.calls[0]!.key)
  })

  test('allows five requests and returns 429 with retry-after on the sixth', async () => {
    let count = 0
    const stateful = limiter(() => ({ success: ++count <= 5 }))
    for (let index = 0; index < 5; index++) {
      expect(await check({ binding: stateful.binding })).toBeNull()
    }
    const rejected = await check({ binding: stateful.binding })
    expect(rejected?.status).toBe(429)
    expect(rejected?.headers.get('retry-after')).toBe('60')
    expect(await rejected?.text()).toBe('Too many reports. Try again in a minute.')
  })

  test('fails closed without platform metadata, a binding or a valid address', async () => {
    for (const options of [
      { platform: false },
      { cf: false, binding: limiter().binding },
      { binding: undefined },
      { binding: limiter().binding, address: 'not-an-address' },
      { binding: limiter().binding, address: '::ffff:192.0.2.1' },
      { binding: limiter().binding, address: () => { throw new Error('no address') } },
    ] as EventOptions[]) {
      const response = await check(options)
      expect(response?.status).toBe(503)
      expect(response?.headers.get('cache-control')).toBe('no-store')
      expect(await response?.text()).toBe('Reporting is temporarily unavailable.')
    }
  })

  test('fails closed when the limiter throws or returns a malformed result', async () => {
    const throwing = { limit: async () => { throw new Error('limiter down') } }
    const malformed: unknown[] = [null, undefined, {}, { success: 'yes' }, { success: 1 }, 'ok', []]
    for (const outcome of [throwing, ...malformed.map(value => ({ limit: async () => value }))]) {
      const response = await check({ binding: outcome as any })
      expect(response?.status).toBe(503)
    }
  })

  test('does not call the binding in local simulation mode', async () => {
    const binding = limiter()
    const response = await check({ local: true, host: 'localhost', address: '127.0.0.1', binding: binding.binding })
    expect(response).toBeNull()
    expect(binding.calls).toHaveLength(0)
  })
})

describe('local rate limit simulation', () => {
  test('allows only a loopback host with a loopback client address', async () => {
    for (const options of [
      { local: true, host: 'example.test', address: '127.0.0.1' },
      { local: true, host: 'localhost', address: '192.0.2.1' },
      { local: true, host: 'localhost', address: '::ffff:127.0.0.1' },
      { local: true, host: '127.0.0.1', address: () => { throw new Error('no address') } },
    ] as EventOptions[]) {
      expect((await check(options))?.status).toBe(503)
    }
  })

  test('does not enable without the exact flag', async () => {
    for (const flag of ['TRUE', '1', 'yes', ' true']) {
      const response = await enforceReportRateLimit({
        url: new URL('https://localhost/entry/1/report'),
        getClientAddress: () => '127.0.0.1',
        platform: { env: { LOCAL_RATE_LIMIT: flag } },
      } as any)
      expect(response?.status).toBe(503)
    }
  })

  test('shares one bucket across keys and accepts five per window', async () => {
    let now = 1_000_000
    const clock = () => now
    for (let index = 0; index < 5; index++) {
      expect(await check({ local: true, host: 'localhost', address: '127.0.0.1' }, clock)).toBeNull()
    }
    let rejected = await check({ local: true, host: 'localhost', address: '::1' }, clock)
    expect(rejected?.status).toBe(429)
    expect(rejected?.headers.get('retry-after')).toBe('60')

    now += 59_999
    expect((await check({ local: true, host: 'localhost', address: '127.0.0.1' }, clock))?.status).toBe(429)

    now += 1
    expect(await check({ local: true, host: 'localhost', address: '127.0.0.1' }, clock)).toBeNull()
  })

  test('reset clears the shared bucket', async () => {
    const now = () => 5_000_000
    for (let index = 0; index < 5; index++) {
      expect(await check({ local: true, host: 'localhost', address: '127.0.0.1' }, now)).toBeNull()
    }
    expect((await check({ local: true, host: 'localhost', address: '127.0.0.1' }, now))?.status).toBe(429)
    resetLocalReportRateLimit()
    expect(await check({ local: true, host: 'localhost', address: '127.0.0.1' }, now)).toBeNull()
  })
})

describe('report route matching', () => {
  function event(method: string, path: string, routeId: string | null = '/[locale]/entry/[id]/report') {
    return {
      request: new Request(`https://example.test${path}`, { method }),
      route: { id: routeId },
      url: new URL(`https://example.test${path}`),
    }
  }

  test('matches only POSTs resolved to the report route on a report path', () => {
    expect(isReportRequest(event('POST', '/en/entry/1/report') as any)).toBe(true)
    expect(isReportRequest(event('POST', '/ja/entry/%31/report') as any)).toBe(true)
    expect(isReportRequest(event('POST', '/zh-Hant/entry/1/report/') as any)).toBe(true)
    expect(isReportRequest(event('POST', '/en/entry/1/reportx') as any)).toBe(false)
    expect(isReportRequest(event('POST', '/en/entry/1/report', '/[locale]/entry/[id]') as any)).toBe(false)
    expect(isReportRequest(event('POST', '/en/entry/1/report', null) as any)).toBe(false)
    expect(isReportRequest(event('GET', '/en/entry/1/report') as any)).toBe(false)
  })

  test('keeps locale prefixes and decodes the pathname before matching', () => {
    expect(isReportPath('/en/entry/1/report')).toBe(true)
    expect(isReportPath('/zh-Hant/entry/%31/report')).toBe(true)
    expect(isReportPath('/ja/entry/1/%72eport')).toBe(true)
    expect(isReportPath('/en/entry/1/reportx')).toBe(false)
    expect(isReportPath('/moderate/1/report')).toBe(false)
    expect(isReportPath('/fr/entry/1/report')).toBe(false)
    // A malformed escape stays guarded when the raw path already looks like a report path.
    expect(isReportPath('/en/entry/%ZZ/report')).toBe(true)
  })
})
