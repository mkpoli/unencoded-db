import { expect, test } from 'bun:test'
import { SITE_ORIGIN } from '$lib/seo'
import { MCP_DESCRIPTION, MCP_SERVER } from '../mcp/_meta.server'
import { GET as getServerCard } from '../mcp/server-card/+server'
import { GET, OPTIONS } from './ai-catalog.json/+server'

const ORIGIN = 'https://example.test'

test('GET /.well-known/ai-catalog.json serves an AI Catalog v0.9 document pointing to /mcp/server-card', async () => {
  const response = await GET({ url: new URL(`${ORIGIN}/.well-known/ai-catalog.json`) } as any)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/ai-catalog+json')
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('cache-control')).toContain('public')

  const body = await response.json()
  expect(body).toEqual({
    specVersion: '0.9',
    resources: [
      {
        id: `urn:mcp:${new URL(SITE_ORIGIN).hostname}:rare-character-compendium`,
        type: 'mcp',
        name: MCP_SERVER.title,
        description: MCP_DESCRIPTION,
        url: `${ORIGIN}/mcp/server-card`,
      },
    ],
  })

  // The referenced Server Card URL resolves on the same origin.
  const cardResponse = await getServerCard({
    request: new Request(body.resources[0].url),
    url: new URL(body.resources[0].url),
  } as any)
  expect(cardResponse.status).toBe(200)
  expect(cardResponse.headers.get('content-type')).toBe('application/mcp-server-card+json')
})

test('OPTIONS /.well-known/ai-catalog.json answers CORS preflight', async () => {
  const response = await OPTIONS({} as any)
  expect(response.status).toBe(204)
  expect(response.headers.get('access-control-allow-origin')).toBe('*')
  expect(response.headers.get('access-control-allow-methods')).toBe('GET')
})
