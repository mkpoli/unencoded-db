import { json } from '@sveltejs/kit'
import { cleanIds, IDS_LENGTH_MAX } from '$lib/ids'
import { candidates } from '$lib/server/candidates'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

// Any site may ask which records could be the character it is describing. `leaves` are the parts the
// description expands to, which only a caller with the encoded characters' descriptions can know.
const OPEN = { headers: { 'access-control-allow-origin': '*' } }

export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('ids') ?? ''
  const leaves = event.url.searchParams.get('leaves') ?? ''
  if (raw.length > IDS_LENGTH_MAX || leaves.length > IDS_LENGTH_MAX) return json([], { status: 400, ...OPEN })
  const ids = cleanIds(raw)
  if ([...ids].length < 2) return json([], OPEN)
  return json(await candidates(env(event).DB, ids, [...new Set([...cleanIds(leaves)])]), OPEN)
}
