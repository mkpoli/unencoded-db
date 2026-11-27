// Shared MCP server identity and protocol metadata used by both /mcp initialize and /mcp/server-card.
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const

export const MCP_SERVER = {
  name: 'org.glyphatlas/rare-character-compendium',
  title: '珍字集覽 Rare Character Compendium',
  version: '1.0.0',
} as const

export const MCP_DESCRIPTION = 'Search rare Han-sphere characters and submit attested forms and evidence.'

export const MCP_REPOSITORY = {
  url: 'https://github.com/mkpoli/unencoded-db',
  source: 'github',
} as const
