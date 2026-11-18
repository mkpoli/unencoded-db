import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { encode as encodePng } from 'fast-png'
import { Buffer } from 'node:buffer'
import { glyphName, glyphPaths } from '$lib/server/glyphs'
import { mediaVisible, type Entry } from '$lib/server/entries'
import { MAX_THUMB, sniff } from '$lib/server/image'

const PAPER = '#fafafa', INK = '#19191c', MUTED = '#67676f', ACCENT = '#6356e5'
const FONT = 'Noto Sans CJK TC'
const FONT_STACK = `${FONT}, Noto Sans CJK KR`
const MARK = '<path d="M4 4h9v9H4zM19 4h9v9h-9zM4 19h9v9H4z"/><path d="M19 19h9v9h-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>'
const BOOK = '<path d="M53 199V69c39-12 73-6 97 14 24-20 58-26 97-14v130c-39-12-73-6-97 14-24-20-58-26-97-14zM150 83v130" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>'

let initialized: Promise<void> | undefined
let webpInitialized: Promise<void> | undefined
const fonts = new Map<string, Uint8Array>()

async function renderer() {
  initialized ??= import('@resvg/resvg-wasm/index_bg.wasm').then(wasm => initWasm(wasm.default)).catch(error => {
    initialized = undefined
    throw error
  })
  await initialized
}

async function webpAsPng(bytes: ArrayBuffer) {
  webpInitialized ??= import('@jsquash/webp/codec/dec/webp_dec.wasm').then(({ default: module }) => initWebp({
    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
      const instance = new WebAssembly.Instance(module, imports)
      receive(instance)
      return instance.exports
    },
  })).catch(error => {
    webpInitialized = undefined
    throw error
  })
  await webpInitialized
  return encodePng(await decodeWebp(bytes))
}

async function cardFont(assets: Fetcher, origin: string, file: string) {
  const found = fonts.get(file)
  if (found) return found
  const response = await assets.fetch(new URL(`/fonts/${file}`, origin))
  if (!response.ok) throw new Error('Social card font unavailable')
  const font = new Uint8Array(await response.arrayBuffer())
  fonts.set(file, font)
  return font
}

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u001f\ufffe\uffff]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function text(value: string, x: number, y: number, size: number, fill: string) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT_STACK}" font-size="${size}">${escapeXml(value)}</text>`
}

// Latin letters occupy a little over half an em in the card face. Fullwidth scripts use one em.
function lines(value: string, limit: number, count: number) {
  const words = value.trim().replace(/\s+/g, ' ').split(' ')
  const result: string[] = []
  let line = '', width = 0
  const units = (char: string) => /^[\u0020-\u052f]$/u.test(char) ? 0.65 : 1
  for (const word of words) {
    const length = [...word].reduce((sum, char) => sum + units(char), 0)
    if (line && width + 0.65 + length > limit) {
      result.push(line)
      line = ''
      width = 0
    }
    if (result.length === count) break
    const chunk = line ? ` ${word}` : word
    for (const char of chunk) {
      if (width + units(char) > limit) {
        result.push(line)
        line = ''
        width = 0
        if (result.length === count) break
      }
      line += char
      width += units(char)
    }
    if (result.length === count) break
  }
  if (line) result.push(line)
  if (result.join(' ').replaceAll(' ', '') !== words.join('') && result.length) result[result.length - 1] = `${[...result.at(-1)!].slice(0, -1).join('')}…`
  return result
}

export async function recordArtwork(env: App.Platform['env'], entry: Entry) {
  const key = entry.cover_key
  if (key && await mediaVisible(env.DB, key)) {
    const object = await env.MEDIA.get(key)
    if (object && object.size <= MAX_THUMB) {
      const bytes = await object.arrayBuffer()
      const image = sniff(new Uint8Array(bytes))
      if (image?.width && image.height && image.width * image.height <= 4_000_000) {
        const png = image.type === 'image/webp' ? await webpAsPng(bytes).catch(() => null) : null
        if (png || image.type !== 'image/webp') {
          const data = (png ? Buffer.from(png) : Buffer.from(bytes)).toString('base64')
          return `<image x="737" y="154" width="334" height="322" href="data:${png ? 'image/png' : image.type};base64,${data}"/>`
        }
      }
    } else if (object) await object.body.cancel()
  }
  if (entry.ids) {
    const glyph = { ids: entry.ids, layout: entry.layout }
    const path = (await glyphPaths(env.MEDIA, [glyph]))[glyphName(glyph) ?? '']
    if (path) return `<svg x="769" y="180" width="270" height="270" viewBox="0 0 1000 1000">${path.startsWith('<') ? path : `<path d="${path}"/>`}</svg>`
    return lines(entry.ids, 8, 2).map((line, position) => text(line, 760, 310 + 44 * position, 36, INK)).join('')
  }
  return `<g transform="translate(807 218) scale(6)">${MARK}</g>`
}

type Card = { label: string; title: string; detail?: string | null; art?: string; source?: boolean }

export async function renderCard(assets: Fetcher, origin: string, card: Card): Promise<Response> {
  await renderer()
  const files = ['social-card.otf']
  if (/\p{Script=Hangul}/u.test(`${card.label}${card.title}${card.detail ?? ''}${card.art ?? ''}`)) files.push('social-card-hangul.otf')
  const fontBuffers = await Promise.all(files.map(file => cardFont(assets, origin, file)))
  const size = card.source ? 48 : 64
  const title = lines(card.title, card.source ? 12 : 9, 2)
  const detail = card.detail ? lines(card.detail, 20, 1)[0] : ''
  const heading = title.map((line, position) => text(line, 72, 302 + position * 67, size, INK)).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" color="${INK}" fill="${INK}">
    <rect width="1200" height="630" fill="${PAPER}"/>
    <path d="M72 74h1056M72 556h1056" stroke="#e3e3e7" stroke-width="2"/>
    <path d="M72 74h56" stroke="${ACCENT}" stroke-width="4"/>
    ${text(lines(card.label, 21, 1)[0] ?? '', 72, 224, 27, ACCENT)}
    ${heading}
    ${detail ? text(detail, 72, title.length > 1 ? 422 : 365, 29, MUTED) : ''}
    ${text('珍字集覽  ·  Rare Character Compendium', 72, 511, 23, MUTED)}
    <rect x="680" y="122" width="448" height="386" rx="20" fill="#f1f1f3" stroke="#e3e3e7" stroke-width="2"/>
    ${card.art || `<g transform="translate(754 166)">${BOOK}</g>`}
  </svg>`
  const render = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: FONT } })
  try {
    const png = render.render()
    try {
      return new Response(png.asPng().slice(), { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } })
    } finally { png.free() }
  } finally { render.free() }
}
