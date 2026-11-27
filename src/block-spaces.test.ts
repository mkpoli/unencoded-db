import { expect, test } from 'bun:test'
import { Glob } from 'bun'
import { readFileSync } from 'node:fs'
import { parse } from 'svelte/compiler'

// Svelte trims spaces at both ends of a block's contents, so `{#if a} · {a}{/if}` renders as `·a` glued to the text
// before it. A space that has to show sits in an expression: `{' · '}`.
type Node = { type?: string, data?: string, start?: number, nodes?: Node[], elseif?: boolean, [key: string]: unknown }
const BLOCKS = new Set(['IfBlock', 'EachBlock', 'KeyBlock', 'AwaitBlock', 'SnippetBlock'])
const PARTS = ['consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch']

function trimmed(file: string) {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  const at = (node: Node) => `${file}:${source.slice(0, node.start).split('\n').length}`
  const check = (fragment: Node | undefined) => {
    const nodes = fragment?.nodes
    if (!nodes?.length) return
    const first = nodes[0], last = nodes[nodes.length - 1]
    if (first.type === 'Text' && /^[ \t]+\S/.test(first.data ?? '')) found.push(at(first))
    if (last.type === 'Text' && /\S[ \t]+$/.test(last.data ?? '')) found.push(at(last))
  }
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    const block = node as Node
    if (block.type && BLOCKS.has(block.type)) for (const part of PARTS) {
      const fragment = block[part] as Node | undefined
      if (fragment && !(part === 'alternate' && fragment.nodes?.[0]?.elseif)) check(fragment)
    }
    for (const [key, value] of Object.entries(block)) if (key !== 'parent' && typeof value === 'object') walk(value)
  }
  walk(parse(source, { modern: true }).fragment)
  return found
}

test('no block starts or ends with a space that Svelte would drop', () => {
  const files = [...new Glob('src/**/*.svelte').scanSync('.')]
  expect(files.length).toBeGreaterThan(0)
  expect(files.flatMap(trimmed)).toEqual([])
})
