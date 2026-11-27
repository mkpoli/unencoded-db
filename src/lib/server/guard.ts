import { error, type RequestEvent } from '@sveltejs/kit'
import { hashHex } from './image'

const address = (event: RequestEvent) => { try { return event.getClientAddress() } catch { return 'local' } }

export function env(event: RequestEvent) {
  const found = event.platform?.env
  if (!found) error(500, 'No platform bindings')
  return found
}

type WriteLimit = 'ADDS' | 'EDITS'
const checked = new WeakMap<RequestEvent, Set<WriteLimit>>()

// Match the first named action exactly as SvelteKit does. Keep this in step with
// the guarded actions so their rate and ban checks run before reading the body.
export function writeLimitFor(event: RequestEvent): WriteLimit | null {
  if (event.request.method !== 'POST') return null
  let action = 'default'
  for (const [key] of event.url.searchParams) {
    if (key.startsWith('/')) { action = key.slice(1); break }
  }
  switch (event.route?.id) {
    case '/[locale]/new':
    case '/[locale]/batch': return action === 'default' ? 'ADDS' : null
    case '/[locale]/entry/[id]': return ['edit', 'comment', 'hideComment', 'unhideComment'].includes(action) ? 'EDITS' : null
    case '/[locale]/entry/[id]/sighting/[sighting]/split':
    case '/[locale]/entry/[id]/sighting/new': return action === 'default' ? 'ADDS' : null
    case '/[locale]/source/[id]': return ['addAlias', 'removeAlias', 'addArchive', 'removeArchive'].includes(action) ? 'EDITS' : null
    case '/api/tags': return action === 'default' ? 'EDITS' : null
    case '/oauth/register':
    case '/oauth/token':
    case '/oauth/revoke':
    case '/[locale]/oauth/authorize':
    case '/[locale]/me':
    case '/[locale]/notifications':
    case '/api/favourites':
    case '/api/report':
    case '/api/pdf-page':
    case '/[locale]/entry/[id]/report':
    case '/[locale]/entry/[id]/sighting/[sighting]/remove':
    case '/[locale]/entry/[id]/sighting/[sighting]/move':
    case '/[locale]/entry/[id]/sighting/[sighting]/edit': return action === 'default' ? 'EDITS' : null
    case '/[locale]/entry/[id]/duplicate': return action === 'merge' || action === 'apart' ? 'EDITS' : null
    case '/[locale]/entry/[id]/history': return ['restore', 'redact', 'thank', 'putBack', 'unmerge'].includes(action) ? 'EDITS' : null
    case '/[locale]/u/[id]': return action === 'merge' ? 'EDITS' : null
    case '/[locale]/moderate': return ['restoreEntry', 'restoreSighting', 'hide', 'unhide', 'resolve'].includes(action) ? 'EDITS' : null
    default: return null
  }
}

// The actions only a moderator takes. Keep this in step with the actions that guard themselves as moderation.
export function moderationAction(event: RequestEvent) {
  if (event.route?.id === '/[locale]/moderate') return true
  const route = event.route?.id
  if (route !== '/[locale]/entry/[id]' && route !== '/[locale]/u/[id]') return false
  for (const [key] of event.url.searchParams) if (key.startsWith('/')) return route === '/[locale]/u/[id]' ? key === '/merge' : key === '/hideComment' || key === '/unhideComment'
  return false
}

// Moderation writes remain available during a freeze, subject to authorization and limits.
export async function guardWrite(event: RequestEvent, limit: WriteLimit, moderation = false) {
  const bindings = env(event)
  if (moderation && (!event.locals.person?.moderator || event.locals.person.banned)) error(403)
  if (bindings.WRITES_PAUSED === '1' && !moderation) error(503, 'paused')
  if (event.locals.person?.banned) error(403, 'banned')
  if (checked.get(event)?.has(limit)) return
  const limiter = bindings[limit]
  if (limiter && !(await limiter.limit({ key: address(event) })).success) error(429, 'slow')
  const limits = checked.get(event) ?? new Set<WriteLimit>()
  limits.add(limit)
  checked.set(event, limits)
}

// Takes `extra` more of the limiter's allowance for a request that saves several records. The request itself
// has paid for one in `guardWrite`. A false answer means the allowance is spent: nothing should be written.
export async function chargeWrites(event: RequestEvent, limit: WriteLimit, extra: number) {
  const limiter = env(event)[limit]
  if (!limiter) return true
  for (let i = 0; i < extra; i++) if (!(await limiter.limit({ key: address(event) })).success) return false
  return true
}

// Kept with a write so that a moderator can see that two writes share an address, without keeping the address.
export async function ipHash(event: RequestEvent) {
  const salt = env(event).IP_SALT
  return salt ? (await hashHex(salt + address(event))).slice(0, 24) : null
}
