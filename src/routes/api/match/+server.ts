import { json } from '@sveltejs/kit'
import { cleanIds } from '$lib/ids'
import { claimedBy, sameIds } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

// Any site may ask whether a description already has records here, or, with `code`, a Unicode code.
const OPEN = { headers: { 'access-control-allow-origin': '*' } }

export const GET: RequestHandler = async (event) => {
  const code = event.url.searchParams.get('code')
  if (code !== null) return /^U\+[0-9A-F]{4,6}$/.test(code) ? json(await claimedBy(env(event).DB, 'encoding', code), OPEN) : json([], { status: 400, ...OPEN })
  const raw = event.url.searchParams.get('ids') ?? ''
  if (raw.length > 200) return json([], { status: 400, ...OPEN })
  const ids = cleanIds(raw)
  if ([...ids].length < 2) return json([], OPEN)
  return json(await sameIds(env(event).DB, ids), OPEN)
}
