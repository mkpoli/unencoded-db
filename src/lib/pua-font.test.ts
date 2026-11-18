import { expect, spyOn, test } from 'bun:test'
import { parse } from 'opentype.js'
import { fontFiles } from './font-files'
import { missingOutline, outline } from './pua-font'
import { privateCode } from './private-code'

test('stable private-use assignments cross planes without using noncharacters', () => {
  expect([1, 6400, 6401, 71934, 71935, 137468].map(privateCode)).toEqual([0xe000, 0xf8ff, 0xf0000, 0xffffd, 0x100000, 0x10fffd])
  expect(() => privateCode(137469)).toThrow()
})

test('both font formats retain the face name, outline and supplementary-plane mapping', () => {
  const path = outline('m100 100h100v100q25 25 50 0t50 0z')
  const files = fontFiles('Kai', [{ id: 6401, path }], new Date('2026-11-19'))
  for (const [name, bytes] of Object.entries(files)) {
    expect(Array.from(bytes.slice(0, 4))).toEqual(name.endsWith('.ttf') ? [0, 1, 0, 0] : [79, 84, 84, 79])
    const font = parse(bytes.buffer as ArrayBuffer)
    expect(font.names.fontFamily.en).toBe('Rare Character Compendium PUA Kai')
    expect(font.names.postScriptName.en).toBe('RareCharacterCompendiumPUAKai-Regular')
    expect(font.tables.os2).toMatchObject({ usFirstCharIndex: 0xffff, usLastCharIndex: 0xffff,
      ulUnicodeRange1: 0, ulUnicodeRange2: 1 << 25, ulUnicodeRange3: 1 << 26 })
    const glyph = font.charToGlyph(String.fromCodePoint(0xf0000))
    expect(glyph.index).toBe(1)
    expect(glyph.path.commands.length).toBeGreaterThan(4)
  }
})

test('browser preview embeds only the selected records with the downloadable face name and outlines', async () => {
  const { previewFont } = await import('./font-preview')
  const rows = [1, 6401].map(id => ({ id, ids: null, layout: null, cover_key: null, marked_sighting: null }))
  const face = { style: 'serif', version: 'test', source: '' } as const
  const controller = new AbortController()
  const preview = parse((await previewFont(rows, face, controller.signal)).buffer!)
  const archiveFont = fontFiles('Serif', rows.map(({ id }) => ({ id, path: missingOutline() })), new Date())
  const exported = parse(Object.values(archiveFont)[0].buffer as ArrayBuffer)
  expect(preview.names.fontFamily.en).toBe(exported.names.fontFamily.en)
  expect(preview.charToGlyphIndex(String.fromCodePoint(privateCode(2)))).toBe(0)
  for (const { id } of rows) {
    const char = String.fromCodePoint(privateCode(id))
    expect(preview.charToGlyphIndex(char)).toBeGreaterThan(0)
    expect(preview.charToGlyph(char).path.commands).toEqual(exported.charToGlyph(char).path.commands)
  }
  controller.abort()
  await expect(previewFont(rows, face, controller.signal)).rejects.toThrow()
})

test('a failed glyph leaves the rest visible and only that glyph is requested on retry', async () => {
  const { previewFont } = await import('./font-preview')
  const rows = ['木', '水'].map((ids, i) => ({ id: i + 1, ids, layout: null, cover_key: null, marked_sighting: null }))
  const face = { style: 'sans', version: 'test', source: '' } as const
  const paths = new Map()
  const signal = new AbortController().signal
  const fetcher = spyOn(globalThis, 'fetch')
  const calls: string[] = []
  let recovered = false
  const respond = async (input: Parameters<typeof fetch>[0]) => {
    const ids = new URL(String(input), 'https://example.test').searchParams.get('ids')!
    calls.push(ids)
    return ids === '水' && !recovered ? new Response(null, { status: 500 }) : Response.json({ d: 'M0 0H10V10Z' })
  }
  fetcher.mockImplementation(Object.assign(respond, { preconnect: fetch.preconnect }))
  try {
    const unavailable = await previewFont(rows.slice(1), face, signal, paths)
    expect(unavailable).toEqual({ buffer: null, failed: [2] })
    calls.length = 0
    const partial = await previewFont(rows, face, signal, paths)
    expect(partial.failed).toEqual([2])
    expect(parse(partial.buffer!).charToGlyphIndex(String.fromCodePoint(privateCode(1)))).toBeGreaterThan(0)
    expect(calls.filter(ids => ids === '水')).toHaveLength(2)
    recovered = true
    calls.length = 0
    const complete = await previewFont(rows, face, signal, paths)
    expect(calls).toEqual(['水'])
    expect(complete.failed).toEqual([])
    expect(complete.buffer).toBeInstanceOf(ArrayBuffer)
  } finally {
    fetcher.mockRestore()
  }
})
