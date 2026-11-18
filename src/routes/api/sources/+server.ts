import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { SOURCE_SUGGESTIONS, suggestSources, type NameCursor } from '$lib/server/source-aliases'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const params = event.url.searchParams, after = params.get('after'), id = Number(params.get('id'))
  if (after !== null && (!Number.isSafeInteger(id) || id <= 0)) return json({ rows: [], next: null }, { status: 400 })
  const cursor: NameCursor | null = after === null ? null : [after, id]
  const results = await suggestSources(env(event).DB, (params.get('q') ?? '').slice(0, 300), cursor)
  const rows = results.slice(0, SOURCE_SUGGESTIONS), last = rows.at(-1)
  const next = results.length > rows.length && last ? [last.lookup, last.id] : null
  return json({ rows, next })
}
