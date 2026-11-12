import { json } from '@sveltejs/kit'
import { cleanIds } from '$lib/ids'
import { sameIds } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

// Any site may ask whether a description already has records here.
const OPEN = { headers: { 'access-control-allow-origin': '*' } }

export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('ids') ?? ''
  if (raw.length > 200) return json([], { status: 400, ...OPEN })
  const ids = cleanIds(raw)
  if ([...ids].length < 2) return json([], OPEN)
  return json(await sameIds(env(event).DB, ids), OPEN)
}
