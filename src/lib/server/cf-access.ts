import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type LocalJWKSet,
} from 'jose'

export type AccessEnv = {
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  MODERATOR_EMAILS?: string
}

export type ModeratorConfig = {
  teamDomain: string
  audience: string
  emails: string[]
  issuer: string
  certsUrl: string
}

export type VerifyOptions = {
  fetch?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

const MAX_TEAM_DOMAIN_LENGTH = 253
const MAX_ALLOWLIST_ENTRIES = 20
const MAX_EMAIL_LENGTH = 320
const JWKS_TTL_MS = 10 * 60 * 1000
const JWKS_FAILURE_TTL_MS = 30 * 1000
const MAX_JWKS_ENTRIES = 8
const MAX_JWKS_BYTES = 128 * 1024
const DEFAULT_TIMEOUT_MS = 5000
const CLOCK_TOLERANCE_SECONDS = 60

const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const emailLocal = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/

function isHostname(value: string): boolean {
  if (value.length < 4 || value.length > MAX_TEAM_DOMAIN_LENGTH) return false
  if (value !== value.toLowerCase()) return false
  const labels = value.split('.')
  if (labels.length < 2) return false
  if (!labels.every(label => hostnameLabel.test(label))) return false
  // A hostname ends in a name, not an address literal.
  return /[a-z]/.test(labels[labels.length - 1]!)
}

function isPlausibleEmail(value: string): boolean {
  if (value.length < 3 || value.length > MAX_EMAIL_LENGTH) return false
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@')) return false
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (!local || local.length > 64 || !emailLocal.test(local)) return false
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  return isHostname(domain)
}

export function readModeratorConfig(env: AccessEnv | null | undefined): ModeratorConfig | null {
  if (!env) return null
  const teamDomain = typeof env.ACCESS_TEAM_DOMAIN === 'string' ? env.ACCESS_TEAM_DOMAIN.trim() : ''
  const audience = typeof env.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : ''
  const allowlist = typeof env.MODERATOR_EMAILS === 'string' ? env.MODERATOR_EMAILS : ''
  if (!isHostname(teamDomain) || !audience || !allowlist) return null

  const parts = allowlist.split(',')
  if (parts.length > MAX_ALLOWLIST_ENTRIES) return null
  const emails: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const email = part.trim().toLowerCase()
    if (!isPlausibleEmail(email)) return null
    if (!seen.has(email)) {
      seen.add(email)
      emails.push(email)
    }
  }
  if (emails.length === 0) return null

  return {
    teamDomain,
    audience,
    emails,
    issuer: `https://${teamDomain}`,
    certsUrl: `https://${teamDomain}/cdn-cgi/access/certs`,
  }
}

type CachedJwks = { jwks: LocalJWKSet; expiresAt: number }

const jwksCache = new Map<string, CachedJwks>()
const jwksFailures = new Map<string, number>()

export function clearJwksCache(): void {
  jwksCache.clear()
  jwksFailures.clear()
}

function boundCache<T>(cache: Map<string, T>): void {
  while (cache.size > MAX_JWKS_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function readKeySet(value: unknown): JSONWebKeySet | null {
  if (typeof value !== 'object' || value === null) return null
  const keys = (value as { keys?: unknown }).keys
  if (!Array.isArray(keys)) return null
  const rsaKeys = keys.filter(key => {
    if (typeof key !== 'object' || key === null) return false
    const candidate = key as { kty?: unknown; use?: unknown; key_ops?: unknown }
    if (candidate.kty !== 'RSA') return false
    if (candidate.use !== undefined && candidate.use !== 'sig') return false
    if (candidate.key_ops !== undefined && !(Array.isArray(candidate.key_ops) && candidate.key_ops.includes('verify'))) return false
    return true
  })
  if (rsaKeys.length === 0) return null
  return { keys: rsaKeys } as JSONWebKeySet
}

async function readCappedBody(response: Response, limit: number): Promise<string | null> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) return null
  if (!response.body) {
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength > limit ? null : text
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        void reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function fetchJwks(config: ModeratorConfig, options: VerifyOptions): Promise<LocalJWKSet | null> {
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(config.certsUrl, {
      redirect: 'error',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      return null
    }
    const text = await readCappedBody(response, MAX_JWKS_BYTES)
    if (text === null) return null
    const keySet = readKeySet(JSON.parse(text))
    return keySet ? createLocalJWKSet(keySet) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getJwks(config: ModeratorConfig, options: VerifyOptions): Promise<LocalJWKSet | null> {
  const now = options.now ?? Date.now
  const cached = jwksCache.get(config.certsUrl)
  if (cached && cached.expiresAt > now()) return cached.jwks
  if (cached) jwksCache.delete(config.certsUrl)
  const failedUntil = jwksFailures.get(config.certsUrl)
  if (failedUntil !== undefined && failedUntil > now()) return null

  const jwks = await fetchJwks(config, options)
  if (!jwks) {
    // Bound retries while the team's key endpoint is unavailable.
    jwksFailures.set(config.certsUrl, now() + JWKS_FAILURE_TTL_MS)
    boundCache(jwksFailures)
    return null
  }
  jwksFailures.delete(config.certsUrl)

  jwksCache.delete(config.certsUrl)
  jwksCache.set(config.certsUrl, { jwks, expiresAt: now() + JWKS_TTL_MS })
  boundCache(jwksCache)
  return jwks
}

function audienceMatches(value: JWTPayload['aud'], expected: string): boolean {
  if (typeof value === 'string') return value === expected
  if (Array.isArray(value)) return value.includes(expected)
  return false
}

export async function verifyModeratorAssertion(token: string, config: ModeratorConfig, options: VerifyOptions = {}): Promise<string | null> {
  if (!token) return null

  let protectedHeader
  try {
    protectedHeader = decodeProtectedHeader(token)
  } catch {
    return null
  }
  if (protectedHeader.alg !== 'RS256') return null
  if (protectedHeader.kid !== undefined && typeof protectedHeader.kid !== 'string') return null

  const jwks = await getJwks(config, options)
  if (!jwks) return null

  const now = options.now ?? Date.now
  let payload: JWTPayload
  try {
    const result = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'email'],
      currentDate: new Date(now()),
    })
    payload = result.payload
  } catch {
    return null
  }

  if (payload.iss !== config.issuer) return null
  if (!audienceMatches(payload.aud, config.audience)) return null
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return null

  const nowSeconds = Math.floor(now() / 1000)
  if (payload.iat > nowSeconds + CLOCK_TOLERANCE_SECONDS) return null
  if (payload.exp < nowSeconds - CLOCK_TOLERANCE_SECONDS) return null

  const email = payload.email
  if (typeof email !== 'string' || email.length < 3 || email.length > MAX_EMAIL_LENGTH) return null
  if (!config.emails.includes(email.toLowerCase())) return null
  return email
}

export async function authenticateModerator(request: Request, env: AccessEnv | null | undefined, options: VerifyOptions = {}): Promise<string | null> {
  const config = readModeratorConfig(env)
  if (!config) return null
  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return null
  return verifyModeratorAssertion(token, config, options)
}
