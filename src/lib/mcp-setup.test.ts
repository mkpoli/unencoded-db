import { expect, test } from 'bun:test'
import { catalogues, LOCALES } from '$lib/i18n'
import { isPublicPage } from '$lib/seo'
import { getSocialPage, socialPageFor } from '$lib/social-pages'
import {
  claudeCodeCommand,
  codexCommand,
  cursorConfig,
  cursorInstallUrl,
  antigravityCommand,
  genericConfig,
  MCP_SERVER_NAME,
  mcpEndpoint,
  vscodeConfig,
  vscodeInstallUrl,
} from '$lib/mcp-setup'
import { load as mcpPageLoad } from '../routes/[locale]/mcp/+page.server'
import { MCP_TOOLS, toolList } from '../routes/mcp/_tools.server'

const ENDPOINT = 'https://rare.glyphatlas.org/mcp'

test('mcp setup helpers build valid commands, configs and install links', () => {
  expect(mcpEndpoint('https://rare.glyphatlas.org')).toBe(ENDPOINT)
  expect(mcpEndpoint('http://127.0.0.1:8798')).toBe('http://127.0.0.1:8798/mcp')

  expect(claudeCodeCommand(ENDPOINT)).toBe(`claude mcp add --scope user --transport http ${MCP_SERVER_NAME} ${ENDPOINT}`)
  expect(codexCommand(ENDPOINT)).toBe(`codex mcp add ${MCP_SERVER_NAME} --url ${ENDPOINT}`)
  expect(antigravityCommand(ENDPOINT)).toBe(`agy mcp add ${MCP_SERVER_NAME} ${ENDPOINT}`)

  const cursor = new URL(cursorInstallUrl(ENDPOINT))
  expect(`${cursor.protocol}//${cursor.host}${cursor.pathname}`).toBe('cursor://anysphere.cursor-deeplink/mcp/install')
  expect(cursor.searchParams.get('name')).toBe(MCP_SERVER_NAME)
  expect(JSON.parse(atob(cursor.searchParams.get('config')!))).toEqual({ url: ENDPOINT })

  const vscode = vscodeInstallUrl(ENDPOINT)
  expect(vscode.startsWith('vscode:mcp/install?')).toBe(true)
  expect(JSON.parse(decodeURIComponent(vscode.slice('vscode:mcp/install?'.length)))).toEqual({
    name: MCP_SERVER_NAME,
    type: 'http',
    url: ENDPOINT,
  })

  expect(JSON.parse(cursorConfig(ENDPOINT))).toEqual({ mcpServers: { [MCP_SERVER_NAME]: { url: ENDPOINT } } })
  expect(JSON.parse(vscodeConfig(ENDPOINT))).toEqual({ servers: { [MCP_SERVER_NAME]: { type: 'http', url: ENDPOINT } } })
  expect(JSON.parse(genericConfig(ENDPOINT))).toEqual({ mcpServers: { [MCP_SERVER_NAME]: { type: 'http', url: ENDPOINT } } })
})

test('every MCP tool exposed by the server has a localized description on the MCP page', () => {
  const serverTools = toolList([])
  expect(MCP_TOOLS.map(tool => tool.name)).toEqual(serverTools.map(tool => tool.name))
  for (const locale of LOCALES) {
    const catalogue = catalogues[locale]
    for (const tool of MCP_TOOLS) {
      expect(catalogue[`mcp.tool.${tool.name}`]?.trim().length).toBeGreaterThan(0)
    }
  }
})

test('the MCP page is public, has a social card, and loads the live endpoint and tools', () => {
  expect(isPublicPage('/mcp')).toBe(true)
  const cardName = socialPageFor('/[locale]/mcp', null)
  expect(cardName).toBe('mcp')
  expect(getSocialPage(cardName)).toMatchObject({ path: '/mcp', title: 'mcp.title', publicTitle: true })
  const loaded = mcpPageLoad({ url: new URL('https://rare.glyphatlas.org/en/mcp') } as Parameters<typeof mcpPageLoad>[0]) as { endpoint: string; tools: typeof MCP_TOOLS }
  expect(loaded.endpoint).toBe(ENDPOINT)
  expect(loaded.tools).toEqual(MCP_TOOLS)
})
