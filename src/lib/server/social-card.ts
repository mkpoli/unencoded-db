import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { encode as encodePng } from 'fast-png'
import { Buffer } from 'node:buffer'
import { drawGlyph, type ComposerAssets, type Glyph } from '$lib/server/glyphs'
import { MAX_THUMB, sniff } from '$lib/server/image'

const NIGHT = '#101824', INK = '#f8efe2', MUTED = '#c6cbd6', ACCENT = '#b7aaff'
const PAPER = '#f0e6d5', PRINT = '#242638'
const FONT = 'Noto Sans CJK TC'
const FONT_STACK = `${FONT}, Noto Sans CJK KR`
const MARK = '<path d="M4 4h9v9H4zM19 4h9v9h-9zM4 19h9v9H4z"/><path d="M19 19h9v9h-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>'

let initialized: Promise<void> | undefined
let webpInitialized: Promise<void> | undefined
const assetsRead = new Map<string, Uint8Array>()
// Moderation is checked before consulting this cache. Short-lived entries also let newly drawn glyphs appear.
const cards = new Map<string, { png: Uint8Array<ArrayBuffer>; expires: number }>()
const CARD_CACHE_LIMIT = 8
const CACHEABLE_PNG_BYTES = 1024 * 1024
const MAX_EVIDENCE_PIXELS = 1_048_576
const ART_WIDTH = 380, ART_HEIGHT = 432

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
  const image = await decodeWebp(bytes)
  if (image.width * image.height > MAX_EVIDENCE_PIXELS) return null
  const scale = Math.min(1, ART_WIDTH / image.width, ART_HEIGHT / image.height)
  if (scale === 1) return encodePng(image)

  // Sample into the card's viewport before creating the intermediate PNG.
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y + 0.5) * image.height / height) * image.width
    for (let x = 0; x < width; x++) {
      const from = (row + Math.floor((x + 0.5) * image.width / width)) * 4
      const to = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel++) data[to + channel] = image.data[from + channel]
    }
  }
  return encodePng({ width, height, data })
}

async function cardAsset(assets: Fetcher, origin: string, path: string) {
  const found = assetsRead.get(path)
  if (found) return found
  const response = await assets.fetch(new URL(path, origin))
  if (!response.ok) throw new Error(`Social card asset unavailable: ${path}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  assetsRead.set(path, bytes)
  return bytes
}

function escapeXml(value: string) {
  return value.replace(/[\u0000-\u001f\ufffe\uffff]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function text(value: string, x: number, y: number, size: number, fill: string) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT_STACK}" font-size="${size}">${escapeXml(value)}</text>`
}

// Budget a full em for wide glyphs. The common Latin letters have narrower advances in this face.
function units(character: string) {
  if (character === ' ') return 0.4
  const letter = character.normalize('NFD')[0]
  if ('MWmwÆŒæœ'.includes(letter)) return 1
  if (/^[A-Z]$/.test(letter)) return 0.85
  return /^[a-z0-9.,:!+\-]$/.test(letter) ? 0.65 : 1
}

function lines(value: string, limit: number, count: number) {
  const words = value.normalize('NFC').trim().replace(/\s+/g, ' ').split(' ')
  const result: string[] = []
  let line = '', width = 0
  for (const word of words) {
    const length = [...word].reduce((sum, char) => sum + units(char), 0)
    if (line && width + units(' ') + length > limit) {
      result.push(line.trimEnd())
      line = ''
      width = 0
    }
    if (result.length === count) break
    const chunk = line ? ` ${word}` : word
    for (const char of chunk) {
      if (width + units(char) > limit) {
        result.push(line.trimEnd())
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

async function evidenceHref(bucket: Pick<R2Bucket, 'get'>, key: string) {
  const object = await bucket.get(key)
  if (!object) return ''
  if (object.size > MAX_THUMB) {
    await object.body.cancel()
    return ''
  }
  const bytes = await object.arrayBuffer()
  const image = sniff(new Uint8Array(bytes))
  if (!image?.width || !image.height || image.width * image.height > MAX_EVIDENCE_PIXELS) return ''
  const png = image.type === 'image/webp' ? await webpAsPng(bytes).catch(() => null) : null
  if (!png && image.type === 'image/webp') return ''
  const data = (png ? Buffer.from(png) : Buffer.from(bytes)).toString('base64')
  return `data:${png ? 'image/png' : image.type};base64,${data}`
}

function evidenceImage(href: string, inset = false) {
  if (!href) return ''
  const bounds = inset ? 'x="958" y="112" width="142" height="380"'
    : `x="719" y="83" width="${ART_WIDTH}" height="${ART_HEIGHT}"`
  return `<image ${bounds} href="${href}"/>`
}

export async function evidenceArtwork(bucket: Pick<R2Bucket, 'get'>, key: string) {
  return evidenceImage(await evidenceHref(bucket, key))
}

export async function recordArtwork(
  bucket: Pick<R2Bucket, 'get' | 'put'>, glyph: Glyph, cover: string | null,
  context: { assets: ComposerAssets; origin: string },
) {
  const [path, evidence] = await Promise.all([
    drawGlyph(bucket, glyph, context).catch(() => null),
    cover ? evidenceHref(bucket, cover) : '',
  ])
  if (!path) return evidenceImage(evidence)

  const bounds = evidence ? 'x="713" y="190" width="228" height="228"'
    : 'x="748" y="132" width="320" height="320"'
  const drawing = `<svg ${bounds} viewBox="0 0 1000 1000" color="${PRINT}" fill="${PRINT}">${path.startsWith('<') ? path : `<path d="${path}"/>`}</svg>`
  return evidence ? `${drawing}<path d="M949 130v344" stroke="#c9bdad"/>${evidenceImage(evidence, true)}` : drawing
}

type Card = { key: string; label: string; title: string; detail?: string | null; caption?: string; art?: () => Promise<string>; size?: number }

const pngResponse = (png: Uint8Array<ArrayBuffer>) => new Response(png, {
  headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
})

export async function renderCard(assets: Fetcher, origin: string, card: Card): Promise<Response> {
  const memo = cards.get(card.key)
  if (memo) {
    cards.delete(card.key)
    if (memo.expires > Date.now()) {
      cards.set(card.key, memo)
      return pngResponse(memo.png)
    }
  }

  await renderer()
  const art = await card.art?.()
  const files = ['social-card.otf']
  const content = `${card.label}${card.title}${card.detail ?? ''}${card.caption ?? ''}${art ?? ''}`
  if (/\p{Script=Hangul}/u.test(content)) files.push('social-card-hangul.otf')
  if (/[\u{20000}-\u{323af}]/u.test(content)) files.push('social-card-supplementary.otf')
  const [background, ...fontBuffers] = await Promise.all([
    cardAsset(assets, origin, '/social-card-backdrop.jpg'),
    ...files.map(file => cardAsset(assets, origin, `/fonts/${file}`)),
  ])
  const size = card.size ?? 60
  const title = lines(card.title, 565 / size, 3)
  const titleStart = title.length === 3 ? 237 : 263
  const heading = title.map((line, position) => text(line, 68, titleStart + position * (size + 4), size, INK)).join('')
  const detailStart = titleStart + (title.length - 1) * (size + 4) + 52
  const detail = card.detail ? lines(card.detail, 22, 2).map((line, position) => text(line, 68, detailStart + position * 33, 26, MUTED)).join('') : ''
  const caption = card.caption && lines(card.caption, ART_WIDTH / 21 - 0.5, 1)[0]
  const backdrop = Buffer.from(background).toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" color="${INK}" fill="${INK}">
    <defs><linearGradient id="scrim"><stop stop-color="${NIGHT}" stop-opacity=".97"/><stop offset=".73" stop-color="${NIGHT}" stop-opacity=".88"/><stop offset="1" stop-color="${NIGHT}" stop-opacity="0"/></linearGradient></defs>
    <rect width="1200" height="630" fill="${NIGHT}"/>
    <image width="1200" height="630" href="data:image/jpeg;base64,${backdrop}"/>
    <rect width="800" height="630" fill="url(#scrim)"/>
    <g transform="translate(64 48)">${MARK}</g>
    ${text('珍字集覽  ·  GLYPH ATLAS', 111, 71, 23, INK)}
    <path d="M68 125h62" stroke="${ACCENT}" stroke-width="3"/>
    ${text(lines(card.label, 23, 1)[0] ?? '', 68, 183, 26, ACCENT)}
    ${heading}
    ${detail}
    <path d="M68 533h510" stroke="${ACCENT}" stroke-opacity=".42"/>
    ${text('rare.glyphatlas.org', 68, 573, 22, MUTED)}
    ${art ? `<rect x="697" y="62" width="424" height="512" fill="#0b101b" opacity=".8" transform="translate(9 10)"/>
    <rect x="697" y="62" width="424" height="512" rx="2" fill="${PAPER}"/>
    ${art}${caption ? text(caption, 719, 552, 21, PRINT) : ''}` : ''}
  </svg>`
  const render = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: FONT } })
  try {
    const rendered = render.render()
    try {
      const png = rendered.asPng().slice()
      if (png.byteLength <= CACHEABLE_PNG_BYTES) {
        if (cards.size >= CARD_CACHE_LIMIT) {
          const oldest = cards.keys().next().value
          if (oldest !== undefined) cards.delete(oldest)
        }
        cards.set(card.key, { png, expires: Date.now() + 90_000 })
      }
      return pngResponse(png)
    } finally { rendered.free() }
  } finally { render.free() }
}
