export const MCP_SERVER_NAME = 'rare'
export const MCP_ENDPOINT_PATH = '/mcp'

export const MCP_CLIENT_IDS = ['claude-code', 'codex', 'gemini', 'cursor', 'vscode', 'claude', 'chatgpt', 'json'] as const
export type McpClientId = (typeof MCP_CLIENT_IDS)[number]

export const CODEX_LOGIN_COMMAND = `codex mcp login ${MCP_SERVER_NAME}`
export const GEMINI_AUTH_COMMAND = `/mcp auth ${MCP_SERVER_NAME}`
export const CLAUDE_CODE_AUTH_PATH = `/mcp → ${MCP_SERVER_NAME} → Authenticate`

export const CLAUDE_CONNECTOR_DOCS = 'https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities'
export const CHATGPT_MCP_DOCS = 'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt'

export const mcpEndpoint = (origin: string) => new URL(MCP_ENDPOINT_PATH, origin).href

export const claudeCodeCommand = (endpoint: string) =>
  `claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`

export const codexCommand = (endpoint: string) =>
  `codex mcp add ${MCP_SERVER_NAME} --url ${endpoint}`

export const geminiCommand = (endpoint: string) =>
  `gemini mcp add --scope user --transport http ${MCP_SERVER_NAME} ${endpoint}`

export function cursorInstallUrl(endpoint: string) {
  const encoded = btoa(JSON.stringify({ url: endpoint }))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(MCP_SERVER_NAME)}&config=${encodeURIComponent(encoded)}`
}

export function vscodeInstallUrl(endpoint: string) {
  const payload = JSON.stringify({ name: MCP_SERVER_NAME, type: 'http', url: endpoint })
  return `vscode:mcp/install?${encodeURIComponent(payload)}`
}

export const cursorConfig = (endpoint: string) =>
  JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url: endpoint } } }, null, 2)

export const vscodeConfig = (endpoint: string) =>
  JSON.stringify({ servers: { [MCP_SERVER_NAME]: { type: 'http', url: endpoint } } }, null, 2)

export const genericConfig = (endpoint: string) =>
  JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url: endpoint } } }, null, 2)
