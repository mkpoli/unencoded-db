import type { RequestEvent } from '@sveltejs/kit'

export const REPORT_ROUTE_ID = '/entry/[id]/report'
export const REPORT_RATE_LIMIT_MAX = 5
export const REPORT_RATE_LIMIT_PERIOD_SECONDS = 60

const LOCAL_RATE_LIMIT_PERIOD_MS = REPORT_RATE_LIMIT_PERIOD_SECONDS * 1000
const MAX_ADDRESS_LENGTH = 64

export type ReportRateLimitOptions = {
  now?: () => number
}

type ReportRateLimitEnv = {
  REPORT_RATE_LIMIT?: RateLimit
  LOCAL_RATE_LIMIT?: string
}

type ReportRateLimitPlatform = {
  cf?: unknown
  env?: ReportRateLimitEnv
}

type ReportRateLimitEvent = {
  getClientAddress(): string
  url: URL
  platform?: ReportRateLimitPlatform
}

type ReportRouteEvent = Pick<RequestEvent, 'request' | 'route' | 'url'>

const reportPath = /^\/entry\/[^/]+\/report\/?$/

/** The hook guards only POSTs that SvelteKit resolved to the report route and whose path is the report path. */
export function isReportRequest(event: ReportRouteEvent): boolean {
  if (event.request.method !== 'POST') return false
  if (event.route?.id !== REPORT_ROUTE_ID) return false
  return isReportPath(event.url.pathname)
}

export function isReportPath(pathname: string): boolean {
  if (reportPath.test(pathname)) return true
  try {
    return reportPath.test(decodeURIComponent(pathname))
  } catch {
    return false
  }
}

function parseIPv4(value: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  for (const part of parts) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(part)) return null
    if (Number(part) > 255) return null
  }
  return parts.join('.')
}

/** Rewrite a trailing dotted quad as two hexadecimal groups so the general IPv6 parser can read it. */
function expandEmbeddedIPv4(value: string): string | null {
  if (!value.includes('.')) return value
  const colon = value.lastIndexOf(':')
  if (colon < 0) return null
  const ipv4 = parseIPv4(value.slice(colon + 1))
  if (ipv4 === null) return null
  const [a, b, c, d] = ipv4.split('.').map(Number)
  const high = ((a! << 8) | b!).toString(16)
  const low = ((c! << 8) | d!).toString(16)
  return `${value.slice(0, colon + 1)}${high}:${low}`
}

function parseHexGroups(text: string): number[] | null {
  if (text === '') return []
  const groups: number[] = []
  for (const part of text.split(':')) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null
    groups.push(Number.parseInt(part, 16))
  }
  return groups
}

function parseIPv6(value: string): number[] | null {
  if (!value || value.includes('%') || value.includes('[') || value.includes(']')) return null
  const halves = value.split('::')
  if (halves.length > 2) return null

  const head = parseHexGroups(halves[0]!)
  if (!head) return null
  if (halves.length === 1) return head.length === 8 ? head : null

  const tail = parseHexGroups(halves[1]!)
  if (!tail) return null
  if (head.length + tail.length >= 8) return null
  return [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail]
}

function isIPv4Mapped(groups: number[]): boolean {
  return groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff
}

function formatIPv6(groups: number[]): string {
  let bestStart = -1
  let bestLength = 0
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index++
      continue
    }
    let end = index
    while (end < groups.length && groups[end] === 0) end++
    if (end - index > bestLength) {
      bestStart = index
      bestLength = end - index
    }
    index = end
  }
  if (bestLength < 2) return groups.map(group => group.toString(16)).join(':')
  const head = groups.slice(0, bestStart).map(group => group.toString(16)).join(':')
  const tail = groups.slice(bestStart + bestLength).map(group => group.toString(16)).join(':')
  return `${head}::${tail}`
}

/**
 * Return the rate limit network for a client address: the IPv4 address, or the
 * canonical IPv6 /64 prefix. IPv4-mapped IPv6, zone ids and malformed addresses
 * return null so callers fail closed.
 */
export function canonicalClientNetwork(address: string): string | null {
  if (typeof address !== 'string' || address.length === 0 || address.length > MAX_ADDRESS_LENGTH) return null

  if (address.includes(':')) {
    const expanded = expandEmbeddedIPv4(address)
    if (expanded === null) return null
    const groups = parseIPv6(expanded)
    if (!groups || isIPv4Mapped(groups)) return null
    return `${formatIPv6([...groups.slice(0, 4), 0, 0, 0, 0])}/64`
  }

  return parseIPv4(address)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function unavailable(): Response {
  return new Response('Reporting is temporarily unavailable.', {
    status: 503,
    headers: { 'cache-control': 'no-store' },
  })
}

function limited(): Response {
  return new Response('Too many reports. Try again in a minute.', {
    status: 429,
    headers: { 'retry-after': String(REPORT_RATE_LIMIT_PERIOD_SECONDS), 'cache-control': 'no-store' },
  })
}

let localWindowStart: number | null = null
let localWindowCount = 0

/** Clear the in-process development bucket. Intended for tests. */
export function resetLocalReportRateLimit(): void {
  localWindowStart = null
  localWindowCount = 0
}

function localAllowed(now: number): boolean {
  if (localWindowStart === null || now < localWindowStart || now - localWindowStart >= LOCAL_RATE_LIMIT_PERIOD_MS) {
    localWindowStart = now
    localWindowCount = 0
  }
  if (localWindowCount >= REPORT_RATE_LIMIT_MAX) return false
  localWindowCount++
  return true
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

function enforceLocalLimit(event: ReportRateLimitEvent, now: number): Response | null {
  if (!isLoopbackHost(event.url.hostname.toLowerCase())) return unavailable()
  let address: unknown
  try {
    address = event.getClientAddress()
  } catch {
    return unavailable()
  }
  if (address !== '127.0.0.1' && address !== '::1') return unavailable()
  return localAllowed(now) ? null : limited()
}

/**
 * Check the report rate limit without touching the request body. Returns a
 * response when the request must be rejected, or null when it may continue.
 */
export async function enforceReportRateLimit(
  event: ReportRateLimitEvent,
  options: ReportRateLimitOptions = {},
): Promise<Response | null> {
  const now = options.now ?? Date.now
  const platform = event.platform

  if (platform?.env?.LOCAL_RATE_LIMIT === 'true') return enforceLocalLimit(event, now())

  const binding = platform?.env?.REPORT_RATE_LIMIT
  if (!platform?.cf || !binding || typeof binding.limit !== 'function') return unavailable()

  let address: unknown
  try {
    address = event.getClientAddress()
  } catch {
    return unavailable()
  }
  if (typeof address !== 'string') return unavailable()

  const network = canonicalClientNetwork(address)
  if (network === null) return unavailable()

  let key: string
  try {
    key = await sha256Hex(network)
  } catch {
    return unavailable()
  }

  let outcome: unknown
  try {
    outcome = await binding.limit({ key })
  } catch {
    return unavailable()
  }
  if (typeof outcome !== 'object' || outcome === null) return unavailable()
  const success = (outcome as { success?: unknown }).success
  if (typeof success !== 'boolean') return unavailable()
  return success ? null : limited()
}
