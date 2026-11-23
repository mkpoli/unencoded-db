import { mcpEndpoint } from '$lib/mcp-setup'
import { MCP_TOOLS } from '../../mcp/_tools.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ url }) => ({
  endpoint: mcpEndpoint(url.origin),
  tools: MCP_TOOLS,
})
