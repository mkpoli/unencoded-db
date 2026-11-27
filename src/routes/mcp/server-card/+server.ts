// SEP-2127 MCP Server Card (experimental extension).
// Spec revision: https://github.com/modelcontextprotocol/ext-server-card/blob/28db12c9b4a379489d46e49bf1bd4a991f05c9b7/docs/discovery.md
// Schema: https://github.com/modelcontextprotocol/ext-server-card/blob/28db12c9b4a379489d46e49bf1bd4a991f05c9b7/schema.json (#/$defs/ServerCard)
import { hashHex } from '$lib/server/image'
import { MCP_DESCRIPTION, MCP_PROTOCOL_VERSIONS, MCP_REPOSITORY, MCP_SERVER } from '../_meta.server'
import type { RequestHandler } from './$types'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'Content-Type, If-None-Match',
  'access-control-expose-headers': 'ETag',
} as const

const CACHE = 'public, max-age=3600'

function matchesEtag(header: string | null, etag: string) {
  if (!header) return false
  if (header.trim() === '*') return true
  return header.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag)
}

export const GET: RequestHandler = async ({ request, url: { origin } }) => {
  const card = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: MCP_SERVER.name,
    version: MCP_SERVER.version,
    title: MCP_SERVER.title,
    description: MCP_DESCRIPTION,
    websiteUrl: `${origin}/en/mcp`,
    repository: MCP_REPOSITORY,
    icons: [
      {
        src: `${origin}/favicon.svg`,
        mimeType: 'image/svg+xml',
        sizes: ['any'],
      },
    ],
    remotes: [
      {
        type: 'streamable-http',
        url: `${origin}/mcp`,
        supportedProtocolVersions: [...MCP_PROTOCOL_VERSIONS],
      },
    ],
  }

  const body = JSON.stringify(card)
  const etag = `"${(await hashHex(body)).slice(0, 16)}"`
  const headers = { ...CORS, 'cache-control': CACHE, etag }

  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers })
  }

  return new Response(body, {
    headers: {
      ...headers,
      'content-type': 'application/mcp-server-card+json',
    },
  })
}

export const OPTIONS: RequestHandler = () => new Response(null, { status: 204, headers: CORS })
