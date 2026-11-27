import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PUBLIC_SECTIONS } from '$lib/seo'
import { handle } from '../../hooks.server'
import { MCP_TOOLS } from '../mcp/_tools.server'
import { GET } from './+server'

const ORIGIN = 'https://rare.glyphatlas.org'

function runHandle(path: string, resolve: (event: any) => Response | Promise<Response>) {
  const request = new Request(`${ORIGIN}${path}`, { method: 'GET' })
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

test('GET /llms.txt is served without locale redirect, follows llms.txt structure, and respects robots.txt', async () => {
  const response = await runHandle('/llms.txt', event => GET(event))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
  expect(response.headers.get('cache-control')).toBe('public, max-age=3600')

  const text = await response.text()
  expect(text.startsWith('# ')).toBe(true)
  expect(text).toContain('CC BY-SA 4.0')
  expect(text).toContain('Images keep the rights of their sources.')
  expect(text).toContain(`${ORIGIN}/mcp`)
  expect(text).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`)
  expect(text).not.toContain('/api/')

  for (const section of PUBLIC_SECTIONS) {
    expect(text).toContain(`(${ORIGIN}/en${section})`)
  }

  for (const tool of MCP_TOOLS) {
    const match = new RegExp(`- \`${tool.name}\` \\((?:read|write)\\): (.+)`).exec(text)
    expect(match).not.toBeNull()
    expect(match![1]).not.toContain('mcp.tool.')
  }

  // Every H2 section in /llms.txt contains Markdown link list items (https://llmstxt.org/).
  const sections = text.split(/^## /m).slice(1)
  expect(sections.length).toBeGreaterThanOrEqual(3)
  for (const section of sections) {
    const lines = section.split('\n').slice(1).map(line => line.trim()).filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(line).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)]+\)/)
    }
  }
})

test('app.html advertises /llms.txt with a describedby link', () => {
  const html = readFileSync(new URL('../../app.html', import.meta.url), 'utf8')
  expect(html).toContain('<link rel="describedby" type="text/markdown" href="/llms.txt" />')
})
