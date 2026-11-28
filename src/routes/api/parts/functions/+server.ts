import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { partSuggestions } from '$lib/server/parts'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async (event) => {
  const raw = event.url.searchParams.get('part') ?? ''
  const result = await partSuggestions(env(event).DB, raw)
  return json(result, { headers: { 'cache-control': 'no-store' } })
}
