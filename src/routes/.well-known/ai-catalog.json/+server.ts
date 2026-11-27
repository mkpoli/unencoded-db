// AI Catalog v0.9 RC discovery document pointing clients to the MCP Server Card.
// Spec revision: https://github.com/Agent-Card/ai-catalog/blob/19208af2f8adbc0a6457e3ff36ce691a304fbd97/SPECIFICATION.md
import { SITE_ORIGIN } from '$lib/seo'
import { MCP_DESCRIPTION, MCP_SERVER } from '../../mcp/_meta.server'
import type { RequestHandler } from './$types'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'Content-Type',
} as const

const CATALOG_ID = `urn:mcp:${new URL(SITE_ORIGIN).hostname}:rare-character-compendium`

export const GET: RequestHandler = ({ url: { origin } }) => {
  const catalog = {
    specVersion: '0.9',
    resources: [
      {
        id: CATALOG_ID,
        type: 'mcp',
        name: MCP_SERVER.title,
        description: MCP_DESCRIPTION,
        url: `${origin}/mcp/server-card`,
      },
    ],
  }

  return new Response(JSON.stringify(catalog), {
    headers: {
      ...CORS,
      'cache-control': 'public, max-age=3600',
      'content-type': 'application/ai-catalog+json',
    },
  })
}

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: CORS })
