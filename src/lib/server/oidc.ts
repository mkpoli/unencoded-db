import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'

export type OidcConfig = { issuer: string; clientId: string; clientSecret: string }
type Metadata = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }

// One deadline covers connection, headers and the entire streamed body.
export async function fetchJson(url: string, init: RequestInit = {}, maxBytes = 131_072, timeoutMs = 5_000): Promise<unknown> {
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let finished = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const work = async () => {
    // Workers fetch supports only 'follow' and 'manual'; a 3xx answer must fail closed.
    const response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal })
    if (controller.signal.aborted || !response.ok || !response.body) throw new Error('Provider request failed')
    const declared = response.headers.get('content-length')
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new Error('Provider response too large')
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const part = await reader.read()
      if (part.done) { finished = true; break }
      length += part.value.byteLength
      if (length > maxBytes) throw new Error('Provider response too large')
      chunks.push(part.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  }
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Provider request timed out')) }, timeoutMs) }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    controller.abort()
    if (reader && !finished) void reader.cancel().catch(() => {})
  }
}

/** The configured issuer and every endpoint are pinned to one HTTPS origin. */
export function validateIssuer(issuer: string) {
  const url = new URL(issuer)
  if (url.protocol !== 'https:' || (url.href !== issuer && url.href !== `${issuer}/`) || url.username || url.password || url.search || url.hash || issuer.endsWith('/')) {
    throw new Error('Invalid issuer')
  }
  return issuer
}

export async function discover(issuer: string): Promise<Metadata> {
  validateIssuer(issuer)
  const data = await fetchJson(`${issuer}/.well-known/openid-configuration`)
  if (!data || typeof data !== 'object') throw new Error('Invalid discovery document')
  const record = data as Record<string, unknown>
  if (record.issuer !== issuer) throw new Error('Issuer mismatch')
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (typeof record[key] !== 'string') throw new Error('Invalid endpoint')
    const url = new URL(record[key])
    if (url.protocol !== 'https:' || url.origin !== new URL(issuer).origin || url.username || url.password || url.hash) throw new Error('Invalid endpoint')
  }
  const authorization = new URL(record.authorization_endpoint as string)
  for (const key of ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method']) {
    if (authorization.searchParams.has(key)) throw new Error('Authorization parameter collision')
  }
  return record as Metadata
}

export async function verifyIdentity(token: string, jwksUri: string, config: OidcConfig, nonce: string) {
  const keys = createLocalJWKSet(await fetchJson(jwksUri) as JSONWebKeySet)
  const { payload } = await jwtVerify(token, keys, {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: ['RS256'],
    requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce'],
    clockTolerance: 60,
  })
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
      typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) || payload.iat > now + 60 || payload.iat < now - 600 ||
      payload.nonce !== nonce ||
      !(typeof payload.aud === 'string' || (Array.isArray(payload.aud) && payload.aud.length > 0 && payload.aud.every(value => typeof value === 'string'))) ||
      (payload.azp !== undefined && payload.azp !== config.clientId) ||
      (Array.isArray(payload.aud) && (payload.aud.length !== 1 || payload.aud[0] !== config.clientId))) {
    throw new Error('Invalid identity')
  }
  return { issuer: config.issuer, subject: payload.sub }
}
