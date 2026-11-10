// X and Twitter links carry share tracking in `a` and `s`. A post link also names its author and
// text, and often a picture that can stand as the evidence image, fetched through the FxTwitter API.

const POST_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com'])
const PHOTO_HOST = 'pbs.twimg.com'
const PHOTO_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
const API_ORIGIN = 'https://api.fxtwitter.com'
const HANDLE = /^[A-Za-z0-9_]{1,15}$/

// Matches MAX_IMAGE_BYTES in $lib/server/images, which is the final check on upload.
export const MAX_SOURCE_IMAGE = 8 * 1024 * 1024

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

/** What a post contributes to the evidence fields. */
export type PostInfo = { place: string; provider: string | null; providerUrl: string | null; title: string }

/** The citation fields an FxTwitter response supports: the post text and its author. */
export function postInfo(payload: unknown): PostInfo | null {
  if (!payload || typeof payload !== 'object') return null
  const tweet = (payload as { tweet?: unknown }).tweet
  if (!tweet || typeof tweet !== 'object') return null
  const record = tweet as { text?: unknown; raw_text?: unknown; author?: unknown }
  const author = record.author && typeof record.author === 'object' ? record.author as { screen_name?: unknown } : null
  const handle = typeof author?.screen_name === 'string' && HANDLE.test(author.screen_name) ? author.screen_name : null
  return {
    place: 'X',
    provider: handle ? `@${handle}` : null,
    providerUrl: handle ? `https://x.com/${handle}` : null,
    title: titleFrom(postText(record)),
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
  return [...line].slice(0, 300).join('')
}

type Photo = { url: string; width?: number; height?: number }

/** The first photo in an FxTwitter response, limited to the image host the API reports. */
export function firstPhoto(payload: unknown): Photo | null {
  if (!payload || typeof payload !== 'object') return null
  const media = (payload as { tweet?: { media?: { photos?: unknown; all?: unknown } } }).tweet?.media
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
  const response = await fetch(`${API_ORIGIN}/status/${encodeURIComponent(id)}`, {
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
