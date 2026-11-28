import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { encode as encodePng } from 'fast-png'
import { Buffer } from 'node:buffer'
import { composerRevision, GLYPH_STYLES } from '$lib/composer'
import { translate } from '$lib/i18n'
import { boxesOf, type Box } from '$lib/picture'
import type { CardPicture } from '$lib/server/entries'
import { drawGlyph, type ComposerAssets, type Glyph } from '$lib/server/glyphs'
import { hashHex, MAX_THUMB, sniff } from '$lib/server/image'

const NIGHT = '#101824', INK = '#f8efe2', MUTED = '#c6cbd6', ACCENT = '#b7aaff'
const PAPER = '#f0e6d5'
const FONT = 'Noto Sans CJK TC'
const FONT_STACK = `${FONT}, Noto Sans CJK KR`
const MARK = '<path d="M4 4h9v9H4zM19 4h9v9h-9zM4 19h9v9H4z"/><path d="M19 19h9v9h-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/>'

let initialized: Promise<void> | undefined
let webpInitialized: Promise<void> | undefined
const assetsRead = new Map<string, Uint8Array>()
const MAX_EVIDENCE_PIXELS = 1_048_576
// A marked picture is read whole to show the page around the mark.
const MAX_MARKED_BYTES = 3 * 1024 * 1024, MAX_MARKED_PIXELS = 4_194_304
const STYLE_BUDGET_MS = 5000
// The evidence lies on the backdrop's paper as a sheet, leaving the cloth and paper around it in view.
const PANEL_X = 776, PANEL_Y = 38, PANEL_WIDTH = 382, PANEL_HEIGHT = 554
const COLUMN_END = 700
const PLATE = 104, PLATE_GAP = 4, PLATE_Y = 390

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

// Approximate advances in this face, in ems. CJK, kana and Hangul take a full em; Latin letters are narrower.
function units(character: string) {
  if (character === ' ') return 0.26
  const letter = character.normalize('NFD')[0]
  if ('MWÆŒ'.includes(letter)) return 1
  if ('mwæœ'.includes(letter)) return 0.86
  if (/^[ijlt.,:;!'|]$/.test(letter)) return 0.3
  if (/^[frI()\-]$/.test(letter)) return 0.4
  if (/^[A-Z]$/.test(letter)) return 0.66
  return /^[a-z0-9+?"]$/.test(letter) ? 0.56 : 1
}
const widthOf = (value: string) => [...value].reduce((sum, char) => sum + units(char), 0)

// Han and kana break between words without spaces; other scripts break only at spaces.
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}　-〿＀-￯]/u
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' })
const GLUE = ' '
type Piece = { text: string; space: boolean }

// The places a line may break, keeping each phrase in `keep` whole.
function pieces(value: string, keep: readonly string[]) {
  let source = value
  for (const phrase of keep) if (phrase.includes(' ')) source = source.replaceAll(phrase, phrase.replaceAll(' ', GLUE))
  const result: Piece[] = []
  let space = false
  for (const { segment } of WORDS.segment(source)) {
    if (segment === ' ') {
      space = true
      continue
    }
    const last = result.at(-1)
    const joined = last && !space && (segment.startsWith(GLUE) || last.text.endsWith(GLUE)
      || !(WIDE.test(last.text.at(-1)!) || WIDE.test(segment[0])) || /^[\p{Pe}\p{Pf}\p{Po}]/u.test(segment))
    if (joined) last.text += segment
    else result.push({ text: segment, space })
    space = false
  }
  return result.map(piece => ({ text: piece.text.replaceAll(GLUE, ' '), space: piece.space }))
}

// Fills lines one character at a time and ends with an ellipsis when the text does not fit.
function clipped(value: string, limit: number, count: number) {
  const result: string[] = []
  let line = '', width = 0
  for (const char of value) {
    if (width + units(char) > limit) {
      result.push(line.trimEnd())
      if (result.length === count) break
      line = char === ' ' ? '' : char
      width = units(line)
      continue
    }
    line += char
    width += units(char)
  }
  if (result.length < count && line) result.push(line)
  if (result.join('').replaceAll(' ', '') !== value.replaceAll(' ', '')) result[result.length - 1] = `${[...result.at(-1)!].slice(0, -1).join('')}…`
  return result
}

// The fewest lines that hold the text, as even in length as the breaks allow.
export function lines(value: string, limit: number, count: number, keep: readonly string[] = []) {
  const text = value.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!text) return []
  let list = pieces(text, keep)
  if (list.some(piece => widthOf(piece.text) > limit)) list = pieces(text, [])
  const join = (from: number, to: number) => list.slice(from, to).map((piece, at) => at && piece.space ? ` ${piece.text}` : piece.text).join('')
  for (let total = 1; total <= Math.min(count, list.length); total++) {
    let best: { breaks: number[]; widest: number } | null = null
    const search = (from: number, left: number, breaks: number[], widest: number) => {
      if (best && widest >= best.widest) return
      if (left === 1) {
        const last = widthOf(join(from, list.length))
        if (last <= limit && (!best || Math.max(widest, last) < best.widest)) best = { breaks, widest: Math.max(widest, last) }
        return
      }
      for (let to = from + 1; to <= list.length - left + 1; to++) {
        const width = widthOf(join(from, to))
        if (width > limit) break
        search(to, left - 1, [...breaks, to], Math.max(widest, width))
      }
    }
    search(0, total, [], 0)
    const found = best as { breaks: number[] } | null
    if (found) return [0, ...found.breaks].map((from, at) => join(from, found.breaks[at] ?? list.length))
  }
  return clipped(text, limit, count)
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

// `late` is set when a style missed the time budget or failed to draw, so the card is served but not kept and
// the next request tries the style again.
export type CardArt = { glyphs: { name: string; drawing: string }[]; evidence: string; late?: boolean }
const LATE = Symbol('late')

// The record drawn in every style the site offers, beside its cover.
export async function recordArtwork(
  bucket: Pick<R2Bucket, 'get' | 'put'>, glyph: Glyph, cover: CardPicture | null,
  context: { assets: ComposerAssets; origin: string; locale: string },
): Promise<CardArt> {
  const [evidence, ...drawings] = await Promise.all([
    cover ? evidencePanel(bucket, cover) : '',
    // A style still drawing after the budget, or failing, is left off this card; a drawing that finishes is stored for the next one.
    ...GLYPH_STYLES.map(style => Promise.race([
      drawGlyph(bucket, glyph, { ...context, style }).catch(() => LATE),
      new Promise<typeof LATE>(resolve => setTimeout(resolve, STYLE_BUDGET_MS, LATE)),
    ])),
  ])
  const glyphs = GLYPH_STYLES.flatMap((style, index) => {
    const drawing = drawings[index]
    return typeof drawing === 'string' && drawing ? [{ name: translate(context.locale, `glyphStyle.${style}`), drawing }] : []
  })
  return { glyphs, evidence, late: drawings.includes(LATE) }
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

type Card = { key: string; label: string; title: string; keep?: readonly string[]; detail?: string | null; caption?: string; art?: () => Promise<CardArt>; size?: number }

// Bumped when the card's layout or backdrop changes, so cards drawn before it are not served again.
const CARD_DESIGN = 2
const CARD_MAX_AGE = 86400

// Browsers and crawlers keep a card for a day, but no shared cache may: a shared cache in front of the Worker
// would answer before the visibility check and keep showing a record after it is hidden. Only the Worker's
// own cache, read after that check, holds cards for everyone.
const PRIVATE = `private, max-age=${CARD_MAX_AGE}`, SHARED = `public, max-age=${CARD_MAX_AGE}`
const pngResponse = (body: BodyInit | null, scope: string) => new Response(body, {
  headers: { 'content-type': 'image/png', 'cache-control': scope },
})

// Cards are cached under an address made from what they show, never from the requested `?v=`, which only
// keeps crawlers from holding an older card. Routes check visibility before they call this, and their
// `key` holds only what is visible, so a hidden record or picture has no cached card to reach.
export async function renderCard(
  event: { url: URL; platform?: Readonly<App.Platform> },
  assets: Fetcher,
  card: Card,
): Promise<Response> {
  const origin = event.url.origin
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default
  const version = await hashHex(JSON.stringify([CARD_DESIGN, composerRevision, card.key, card.label, card.title, card.detail, card.caption, card.size]))
  const address = new Request(`${origin}${event.url.pathname}?v=${version.slice(0, 16)}`)
  const found = await cache?.match(address)
  if (found) return pngResponse(found.body, PRIVATE)
  const { png, late } = await draw(assets, origin, card)
  if (cache && !late) {
    const stored = cache.put(address, pngResponse(png.slice(), SHARED)).catch(cause => console.error('Could not cache social card', cause))
    if (event.platform?.ctx) event.platform.ctx.waitUntil(stored)
    else await stored
  }
  return pngResponse(png, PRIVATE)
}

async function draw(assets: Fetcher, origin: string, card: Card): Promise<{ png: Uint8Array<ArrayBuffer>; late: boolean }> {
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
  const title = lines(card.title, 620 / size, plated ? 2 : 3, card.keep)
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
      return { png, late: Boolean(art?.late) }
    } finally { rendered.free() }
  } finally { render.free() }
}
