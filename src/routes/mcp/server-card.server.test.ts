import { expect, test } from 'bun:test'
import { handle } from '../../hooks.server'
import { MCP_PROTOCOL_VERSIONS, MCP_SERVER } from './_meta.server'
import { POST as postMcp } from './+server'
import { GET as getCard, OPTIONS as optionsCard } from './server-card/+server'

const ORIGIN = 'https://rare.glyphatlas.org'

function throughHook(path: string, method: string, resolve: (event: any) => Response | Promise<Response>, headers: Record<string, string> = {}, body?: string) {
  const request = new Request(`${ORIGIN}${path}`, { method, headers, body })
  const event = {
    request,
    url: new URL(request.url),
    route: { id: path },
    params: {},
    locals: {},
    cookies: { get: () => undefined },
    platform: undefined,
    getClientAddress: () => '127.0.0.1',
  }
  return handle({ event, resolve } as any)
}

test('GET /mcp/server-card matches runtime initialize metadata and supports ETag 304 and CORS', async () => {
  const response = await throughHook('/mcp/server-card', 'GET', event => getCard(event))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/mcp-server-card+json')
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('access-control-expose-headers')).toBe('ETag')
  expect(response.headers.get('cache-control')).toBe('public, max-age=3600')

  const etag = response.headers.get('etag')
  expect(etag).toMatch(/^"[0-9a-f]{16}"$/)

  const card = await response.json() as any
  expect(card.$schema).toBe('https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json')
  expect(card.name).toBe(MCP_SERVER.name)
  expect(card.version).toBe(MCP_SERVER.version)
  expect(card.title).toBe(MCP_SERVER.title)
  expect(card.description.length).toBeGreaterThan(0)
  expect(card.description.length).toBeLessThanOrEqual(100)
  expect(card.websiteUrl).toBe(`${ORIGIN}/en/mcp`)
  expect(card.repository).toEqual({ url: 'https://github.com/mkpoli/unencoded-db', source: 'github' })
  expect(card.remotes).toEqual([
    {
      type: 'streamable-http',
      url: `${ORIGIN}/mcp`,
      supportedProtocolVersions: [...MCP_PROTOCOL_VERSIONS],
    },
  ])

  // Verify every advertised protocol version against the local initialize handler.
  for (const protocolVersion of card.remotes[0].supportedProtocolVersions as string[]) {
    const initResponse = await throughHook(
      '/mcp',
      'POST',
      event => postMcp(event),
      { 'content-type': 'application/json' },
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    )
    const { result } = await initResponse.json() as any
    expect(result.protocolVersion).toBe(protocolVersion)
    expect(card.name).toBe(result.serverInfo.name)
    expect(card.version).toBe(result.serverInfo.version)
    expect(card.title).toBe(result.serverInfo.title)
  }

  // Conditional requests return 304 for matching strong or weak ETags, and 200 otherwise.
  for (const tag of [etag!, `W/${etag!}`, `"other", ${etag!}`, '*']) {
    const cached = await throughHook('/mcp/server-card', 'GET', event => getCard(event), { 'if-none-match': tag })
    expect(cached.status).toBe(304)
    expect(cached.headers.get('etag')).toBe(etag)
    expect(cached.headers.get('access-control-allow-origin')).toBe('*')
  }
  const miss = await throughHook('/mcp/server-card', 'GET', event => getCard(event), { 'if-none-match': '"0000000000000000"' })
  expect(miss.status).toBe(200)
  expect(miss.headers.get('etag')).toBe(etag)
  expect((await miss.json() as any).name).toBe(card.name)

  const preflight = await throughHook('/mcp/server-card', 'OPTIONS', event => optionsCard(event))
  expect(preflight.status).toBe(204)
  expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
})
