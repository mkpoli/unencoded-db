import { MAX_IMAGE_BYTES } from '$lib/limits'

// X and Twitter links carry share tracking in `a` and `s`. A post link also names its author and
// text, often a picture that can stand as the evidence image, and sometimes the book the picture is
// from, all read through the FxTwitter API's thread endpoint.

const POST_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com'])
const PHOTO_HOST = 'pbs.twimg.com'
const PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const API_ORIGIN = 'https://api.fxtwitter.com'
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

export const MAX_SOURCE_IMAGE = MAX_IMAGE_BYTES

/** The numeric id of an X or Twitter post link, or null for another link. */
export function postId(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!POST_HOSTS.has(url.hostname.toLowerCase().replace(/^www\./, ''))) return null
  const match = /^\/(?:[A-Za-z0-9_]{1,15}\/)?(?:i\/web\/)?status(?:es)?\/(\d{1,20})(?:\/(?:photo|video)\/\d+)?\/?$/.exec(url.pathname)
  return match?.[1] ?? null
}

/** A link with the share-tracking parameters removed; other links come back trimmed and unchanged. */
export function cleanSourceUrl(value: string): string {
  const text = value.trim()
  if (!postId(text)) return text
  const url = new URL(text)
  url.searchParams.delete('a')
  url.searchParams.delete('s')
  return url.toString()
}

/** A work a post names, with the volume or part when the post gives one. */
export type Work = { title: string; page: string | null }
/** What a post contributes to the evidence fields. `work` is the book its author says the picture is from. */
export type PostInfo = { place: string; author: string | null; title: string; url: string | null; date: string | null; work: Work | null }

const NUMBER = '[0-9０-９〇一二三四五六七八九十百廿卅]+'
const VOLUME = `(?:(?:巻|卷|第)[\\s　]*${NUMBER}[\\s　]*(?:巻|卷|冊|册)?|${NUMBER}[\\s　]*(?:巻|卷|冊|册))`
const QUOTED = new RegExp(`[『《]([^『』《》\\n]{1,60})[』》][\\s　]*(${VOLUME})?`, 'u')
const LINE = new RegExp(`^([\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー・]{2,30}?)[\\s　]*(${VOLUME})$`, 'u')

/**
 * The work a post's text names: a title in 『 』 or 《 》, or a line that is only a title and a volume, such as
 * `和名類聚抄 20巻`. Earlier texts win, so the post itself is read before its author's replies.
 */
export function workMention(texts: readonly string[]): Work | null {
  const tidy = (volume: string | undefined) => volume ? volume.replace(/[\s　]+/g, '') : null
  for (const text of texts) {
    const quoted = QUOTED.exec(text)
    if (quoted) return { title: quoted[1].trim(), page: tidy(quoted[2]) }
  }
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const found = LINE.exec(line.trim())
      if (found && /\p{Script=Han}/u.test(found[1])) return { title: found[1], page: tidy(found[2]) }
    }
  }
  return null
}

type Post = { id?: unknown; text?: unknown; raw_text?: unknown; author?: unknown; url?: unknown; created_timestamp?: unknown }
const handleOf = (post: Post) => {
  const author = post.author && typeof post.author === 'object' ? post.author as { screen_name?: unknown } : null
  return typeof author?.screen_name === 'string' && HANDLE.test(author.screen_name) ? author.screen_name : null
}

/** The citation fields an FxTwitter thread response supports: the post, its author, and the work the author names. */
export function postInfo(payload: unknown): PostInfo | null {
  if (!payload || typeof payload !== 'object') return null
  const { status, thread } = payload as { status?: unknown; thread?: unknown }
  if (!status || typeof status !== 'object') return null
  const post = status as Post
  const handle = handleOf(post)
  // The thread holds the author's own posts around this one; anyone else's reply is not read.
  const own = (Array.isArray(thread) ? thread : []).filter((item): item is Post => Boolean(item) && typeof item === 'object' && (item as Post).id !== post.id && handle !== null && handleOf(item as Post) === handle)
  const stamp = typeof post.created_timestamp === 'number' ? new Date(post.created_timestamp * 1000) : null
  return {
    place: 'X',
    author: handle ? `@${handle}` : null,
    title: titleFrom(postText(post)),
    url: handle && typeof post.id === 'string' && /^\d{1,20}$/.test(post.id) ? `https://x.com/${handle}/status/${post.id}` : null,
    date: stamp && !Number.isNaN(stamp.getTime()) ? stamp.toISOString().slice(0, 10) : null,
    work: workMention([postText(post), ...own.map(postText)]),
  }
}

function postText(tweet: { text?: unknown; raw_text?: unknown }): string {
  const raw = tweet.raw_text
  if (raw && typeof raw === 'object') {
    const { text, display_text_range: range } = raw as { text?: unknown; display_text_range?: unknown }
    if (typeof text === 'string' && Array.isArray(range) && range.length === 2) {
      const [start, end] = range
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= text.length) return text.slice(start, end)
    }
  }
  return typeof tweet.text === 'string' ? tweet.text : ''
}

// A single line for the title field, without the t.co link the API appends for media.
function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').replace(/\s*https:\/\/t\.co\/\w+\s*$/, '').trim()
  const cut = line.slice(0, 300)
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut
}

type Photo = { url: string; width?: number; height?: number }

/** The first photo in an FxTwitter response, limited to the image host the API reports. */
export function firstPhoto(payload: unknown): Photo | null {
  if (!payload || typeof payload !== 'object') return null
  const media = (payload as { status?: { media?: { photos?: unknown; all?: unknown } } }).status?.media
  if (!media) return null
  const candidates = Array.isArray(media.photos) && media.photos.length ? media.photos : Array.isArray(media.all) ? media.all : []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const item = candidate as { type?: unknown; url?: unknown; width?: unknown; height?: unknown }
    if (item.type !== 'photo' || typeof item.url !== 'string') continue
    let url: URL
    try {
      url = new URL(item.url)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' || url.hostname !== PHOTO_HOST) continue
    return {
      url: url.toString(),
      width: typeof item.width === 'number' ? item.width : undefined,
      height: typeof item.height === 'number' ? item.height : undefined,
    }
  }
  return null
}

export type PostLookup = { info: PostInfo; photo: File | null }

/**
 * A post's citation fields and, when it has one, its first photo as a file ready for the image
 * field. Answers null when the API cannot read the post.
 */
export async function fetchPost(id: string, signal?: AbortSignal): Promise<PostLookup | null> {
  const response = await fetch(`${API_ORIGIN}/2/thread/${encodeURIComponent(id)}`, {
    signal,
    headers: { accept: 'application/json' },
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) return null
  const payload = await response.json()
  const info = postInfo(payload)
  if (!info) return null
  const photo = firstPhoto(payload)
  const image = photo ? await downloadPhoto(photo.url, signal) : null
  return { info, photo: image ? photoFile(image, id) : null }
}

function photoFile(image: Blob, id: string): File {
  const type = image.type === 'image/png' ? 'image/png' : image.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
  return new File([image], `post-${id}.${extension}`, { type })
}

async function downloadPhoto(url: string, signal?: AbortSignal): Promise<Blob | null> {
  for (const candidate of [url, largeVersion(url)]) {
    if (!candidate) continue
    const response = await fetch(candidate, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!response.ok) continue
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!PHOTO_TYPES.has(type)) continue
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_SOURCE_IMAGE) continue
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_SOURCE_IMAGE) continue
    return new Blob([bytes], { type: type === 'image/jpg' ? 'image/jpeg' : type })
  }
  return null
}

// A picture too large at full size usually comes in under the limit at the API's large size.
function largeVersion(value: string): string | null {
  const url = new URL(value)
  if (url.searchParams.get('name') !== 'orig') return null
  url.searchParams.set('name', 'large')
  return url.toString()
}
