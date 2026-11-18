import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { encode as encodePng } from 'fast-png'
import { Buffer } from 'node:buffer'
import { GLYPH_STYLES } from '$lib/composer'
import { translate } from '$lib/i18n'
import { boxesOf, type Box } from '$lib/picture'
import type { CardPicture } from '$lib/server/entries'
import { drawGlyph, type ComposerAssets, type Glyph } from '$lib/server/glyphs'
import { MAX_THUMB, sniff } from '$lib/server/image'

const NIGHT = '#101824', INK = '#f8efe2', MUTED = '#c6cbd6', ACCENT = '#b7aaff'
const PAPER = '#f0e6d5'
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
// A marked picture is read whole to show the page around the mark.
const MAX_MARKED_BYTES = 3 * 1024 * 1024, MAX_MARKED_PIXELS = 4_194_304
const STYLE_BUDGET_MS = 5000
// The evidence lies on the backdrop's paper as a sheet, leaving the cloth and paper around it in view.
const PANEL_X = 776, PANEL_Y = 38, PANEL_WIDTH = 382, PANEL_HEIGHT = 554
const COLUMN_END = 700
const PLATE = 124, PLATE_GAP = 5, PLATE_Y = 390

async function renderer() {
  initialized ??= import('@resvg/resvg-wasm/index_bg.wasm').then(wasm => initWasm(wasm.default)).catch(error => {
    initialized = undefined
    throw error
  })
  await initialized
}

// Decodes a WebP and samples the region the panel shows, no larger than the panel needs.
async function webpRegion(bytes: ArrayBuffer, [left, top, width, height]: Box) {
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
  const scale = Math.min(1, Math.max(PANEL_WIDTH / width, PANEL_HEIGHT / height))
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))
  const data = new Uint8Array(outWidth * outHeight * 4)
  for (let y = 0; y < outHeight; y++) {
    const row = Math.min(image.height - 1, Math.floor(top + (y + 0.5) * height / outHeight)) * image.width
    for (let x = 0; x < outWidth; x++) {
      const from = (row + Math.min(image.width - 1, Math.floor(left + (x + 0.5) * width / outWidth))) * 4
      const to = (y * outWidth + x) * 4
      for (let channel = 0; channel < 4; channel++) data[to + channel] = image.data[from + channel]
    }
  }
  return { png: encodePng({ width: outWidth, height: outHeight, data }), width: outWidth, height: outHeight }
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

function text(value: string, x: number, y: number, size: number, fill: string, anchor = 'start') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${FONT_STACK}" font-size="${size}" text-anchor="${anchor}">${escapeXml(value)}</text>`
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

// The part of a picture the panel shows: the whole picture cut to the panel's shape, or, around a marked
// character, enough of the page to show it in its line.
export function panelView(width: number, height: number, focus: Box | null): Box {
  const aspect = PANEL_WIDTH / PANEL_HEIGHT
  let viewHeight = focus ? Math.max(focus[3] * 4, focus[2] * 4 / aspect) : height
  let viewWidth = viewHeight * aspect
  if (viewWidth > width) [viewWidth, viewHeight] = [width, width / aspect]
  if (viewHeight > height) [viewWidth, viewHeight] = [height * aspect, height]
  const [centerX, centerY] = focus ? [focus[0] + focus[2] / 2, focus[1] + focus[3] / 2] : [width / 2, height / 2]
  const clamp = (value: number, most: number) => Math.min(Math.max(0, value), Math.max(0, most))
  return [clamp(centerX - viewWidth / 2, width - viewWidth), clamp(centerY - viewHeight / 2, height - viewHeight), viewWidth, viewHeight]
}

async function evidenceFile(bucket: Pick<R2Bucket, 'get'>, key: string, maxBytes = MAX_THUMB, maxPixels = MAX_EVIDENCE_PIXELS) {
  const object = await bucket.get(key)
  if (!object) return null
  if (object.size > maxBytes) {
    await object.body.cancel()
    return null
  }
  const bytes = await object.arrayBuffer()
  const image = sniff(new Uint8Array(bytes))
  if (!image?.width || !image.height || image.width * image.height > maxPixels) return null
  return { bytes, image }
}

// The evidence fills the card's right side. A marked picture is read whole, so its mark keeps the page
// around it; its thumbnail, which holds only the mark, stands in when the picture is too large to read.
export async function evidencePanel(bucket: Pick<R2Bucket, 'get'>, picture: CardPicture) {
  const marked = boxesOf(picture.box)[0] ?? null
  const whole = marked ? await evidenceFile(bucket, picture.image_key, MAX_MARKED_BYTES, MAX_MARKED_PIXELS) : null
  const file = whole ?? await evidenceFile(bucket, picture.thumb_key)
  if (!file) return ''
  const { width, height, type } = file.image
  const ratio = whole ? width / (picture.image_w || width) : 1
  const focus = whole && marked ? marked.map(value => value * ratio) as Box : null
  let view = panelView(width, height, focus)
  let image = { href: `data:${type};base64,${Buffer.from(file.bytes).toString('base64')}`, width, height }
  if (type === 'image/webp') {
    const region = await webpRegion(file.bytes, view).catch(() => null)
    if (!region) return ''
    image = { href: `data:image/png;base64,${Buffer.from(region.png).toString('base64')}`, width: region.width, height: region.height }
    view = [0, 0, region.width, region.height]
  }
  return `<svg x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" viewBox="${view.join(' ')}" preserveAspectRatio="xMidYMid slice"><image width="${image.width}" height="${image.height}" href="${image.href}"/></svg>`
}

export type CardArt = { glyphs: { name: string; drawing: string }[]; evidence: string }

// The record drawn in every style the site offers, beside its cover.
export async function recordArtwork(
  bucket: Pick<R2Bucket, 'get' | 'put'>, glyph: Glyph, cover: CardPicture | null,
  context: { assets: ComposerAssets; origin: string; locale: string },
): Promise<CardArt> {
  const [evidence, ...drawings] = await Promise.all([
    cover ? evidencePanel(bucket, cover) : '',
    // A style still drawing after the budget is left off this card; its drawing is still stored for the next one.
    ...GLYPH_STYLES.map(style => Promise.race([
      drawGlyph(bucket, glyph, { ...context, style }).catch(() => null),
      new Promise<null>(resolve => setTimeout(resolve, STYLE_BUDGET_MS, null)),
    ])),
  ])
  const glyphs = GLYPH_STYLES.flatMap((style, index) => {
    const drawing = drawings[index]
    return drawing ? [{ name: translate(context.locale, `glyphStyle.${style}`), drawing }] : []
  })
  return { glyphs, evidence }
}

export async function evidenceArtwork(bucket: Pick<R2Bucket, 'get'>, picture: CardPicture): Promise<CardArt> {
  return { glyphs: [], evidence: await evidencePanel(bucket, picture) }
}

function plates(glyphs: CardArt['glyphs']) {
  return glyphs.map(({ name, drawing }, index) => {
    const x = 68 + index * (PLATE + PLATE_GAP)
    // A drawing names its masks after the description, which every style shares, so each plate gets its own ids.
    const markup = drawing.startsWith('<') ? drawing.replace(/(\bid="|url\(#|href="#)/g, `$1p${index}-`) : `<path d="${drawing}"/>`
    return `<svg x="${x}" y="${PLATE_Y}" width="${PLATE}" height="${PLATE}" viewBox="0 0 1000 1000" color="${INK}" fill="${INK}">${markup}</svg>
    ${text(name, x + PLATE / 2, PLATE_Y + PLATE + 30, 18, MUTED, 'middle')}`
  }).join('')
}

type Card = { key: string; label: string; title: string; detail?: string | null; caption?: string; art?: () => Promise<CardArt>; size?: number }

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
  const names = art?.glyphs.map(glyph => glyph.name).join('') ?? ''
  const content = `${card.label}${card.title}${card.detail ?? ''}${card.caption ?? ''}${names}`
  if (/\p{Script=Hangul}/u.test(content)) files.push('social-card-hangul.otf')
  if (/[\u{20000}-\u{323af}]/u.test(content)) files.push('social-card-supplementary.otf')
  const [background, ...fontBuffers] = await Promise.all([
    cardAsset(assets, origin, '/social-card-backdrop.jpg'),
    ...files.map(file => cardAsset(assets, origin, `/fonts/${file}`)),
  ])
  // Plates take the lower half of the text column, so the title moves up and keeps to two lines.
  const plated = Boolean(art?.glyphs.length)
  const size = card.size ?? 60
  const title = lines(card.title, 620 / size, plated ? 2 : 3)
  const labelY = plated ? 156 : 183
  const titleStart = plated ? Math.round(178 + size * 0.73) : title.length === 3 ? 237 : 263
  const heading = title.map((line, position) => text(line, 68, titleStart + position * (size + 4), size, INK)).join('')
  const detailStart = titleStart + (title.length - 1) * (size + 4) + 52
  const detailLines = plated && detailStart + 33 > PLATE_Y - 16 ? 1 : 2
  const detail = card.detail ? lines(card.detail, 24, detailLines).map((line, position) => text(line, 68, detailStart + position * 33, 26, MUTED)).join('') : ''
  const footY = plated ? 592 : 573
  const caption = card.caption ? lines(card.caption, 12, 1)[0] : ''
  const backdrop = Buffer.from(background).toString('base64')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" color="${INK}" fill="${INK}">
    <defs><filter id="shadow" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="6" dy="10" stdDeviation="10" flood-color="#05080e" flood-opacity=".7"/></filter><linearGradient id="scrim"><stop stop-color="${NIGHT}" stop-opacity=".97"/><stop offset=".73" stop-color="${NIGHT}" stop-opacity=".88"/><stop offset="1" stop-color="${NIGHT}" stop-opacity="0"/></linearGradient></defs>
    <rect width="1200" height="630" fill="${NIGHT}"/>
    <image width="1200" height="630" href="data:image/jpeg;base64,${backdrop}"/>
    <rect width="${plated ? 860 : 800}" height="630" fill="url(#scrim)"/>
    <g transform="translate(64 48)">${MARK}</g>
    ${text('珍字集覽  ·  GLYPH ATLAS', 111, 71, 23, INK)}
    <path d="M68 ${labelY - 58}h62" stroke="${ACCENT}" stroke-width="3"/>
    ${text(lines(card.label, 23, 1)[0] ?? '', 68, labelY, 26, ACCENT)}
    ${heading}
    ${detail}
    ${plated ? plates(art!.glyphs) : `<path d="M68 533h510" stroke="${ACCENT}" stroke-opacity=".42"/>`}
    ${text('rare.glyphatlas.org', 68, footY, 22, MUTED)}
    ${caption ? text(caption, COLUMN_END, footY, 22, MUTED, 'end') : ''}
    ${art?.evidence ? `<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_WIDTH}" height="${PANEL_HEIGHT}" fill="${PAPER}" filter="url(#shadow)"/>${art.evidence}` : ''}
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
