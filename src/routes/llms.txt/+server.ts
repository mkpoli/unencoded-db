import { translate } from '$lib/i18n'
import { MCP_TOOLS } from '../mcp/_tools.server'
import type { RequestHandler } from './$types'

// Machine-readable site index following the /llms.txt proposal (https://llmstxt.org/).
// Links stay within crawlable HTML and metadata routes so this file agrees with robots.txt
// and does not point crawlers at uncached whole-dataset exports.
export const GET: RequestHandler = ({ url: { origin } }) => {
  const tools = MCP_TOOLS.map(tool =>
    `- \`${tool.name}\` (${tool.write ? 'write' : 'read'}): ${translate('en', `mcp.tool.${tool.name}`)}`,
  ).join('\n')

  const body = `# 珍字集覽 · Rare Character Compendium

> ${translate('en', 'about.what')} ${translate('en', 'data.license')}

Connect over Streamable HTTP (JSON-RPC 2.0) at ${origin}/mcp. ${translate('en', 'mcp.authBody')}

Available MCP tools:

${tools}

## MCP Server

- [MCP endpoint](${origin}/mcp): Streamable HTTP (JSON-RPC 2.0) endpoint for searching and submitting records
- [Setup guide](${origin}/en/mcp): CLI commands, install links, and client configuration
- [OAuth protected resource metadata](${origin}/.well-known/oauth-protected-resource/mcp): OAuth 2.1 discovery (RFC 9728)
- [OAuth authorization server metadata](${origin}/.well-known/oauth-authorization-server): OAuth 2.1 endpoints (RFC 8414)

## Open Data

- [Open data](${origin}/en/data): Bulk JSON and CSV exports, image list, paged API, counts, and citation guidance

## Site

- [Browse records](${origin}/en): Search by IDS, character, reading, meaning, tag, or source
- [About](${origin}/en/about): Project scope and community links
- [PUA fonts](${origin}/en/fonts): Preview and download generated TTF/OTF fonts
- [Radicals](${origin}/en/radicals): Browse records by radical
- [Tags](${origin}/en/tags): Typed tag taxonomy
- [Sources](${origin}/en/sources): Cited works and digitized copies
- [Timeline](${origin}/en/chronology): Records ordered by earliest attestation
`

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
