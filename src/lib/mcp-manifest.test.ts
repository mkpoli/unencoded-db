import { expect, test } from 'bun:test'
import { mcpEndpoint } from '$lib/mcp-setup'
import { SITE_ORIGIN } from '$lib/seo'
import manifest from '../../server.json'
import { POST as postMcp } from '../routes/mcp/+server'

test('server.json matches the local initialize handler and public site URLs', async () => {
  expect(manifest.$schema).toBe('https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json')
  expect(manifest.name).toMatch(/^org\.glyphatlas\/[a-zA-Z0-9._-]+$/)
  expect(manifest.description.length).toBeGreaterThan(0)
  expect(manifest.description.length).toBeLessThanOrEqual(100)
  expect(manifest.title.length).toBeLessThanOrEqual(100)
  expect(manifest.websiteUrl).toBe(`${SITE_ORIGIN}/en/mcp`)
  expect(manifest.icons[0].src).toBe(`${SITE_ORIGIN}/favicon.svg`)
  expect(manifest.remotes).toEqual([{ type: 'streamable-http', url: mcpEndpoint(SITE_ORIGIN) }])

  const request = new Request(`${SITE_ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    }),
  })
  const response = await postMcp({ request, url: new URL(request.url), locals: {} } as any)
  const { result } = await response.json() as any
  expect(manifest.version).toBe(result.serverInfo.version)
  expect(manifest.title).toBe(result.serverInfo.title)
})
