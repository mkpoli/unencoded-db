import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { SOURCE_TAG_SOURCES_MAX, sourceTagHints } from '$lib/server/source-tags'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => {
  const raw = event.url.searchParams.getAll('source')
  if (!raw.length) return json({ tags: [] })
  const ids: number[] = []
  for (const value of raw.slice(0, SOURCE_TAG_SOURCES_MAX)) {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) return json({ tags: [] }, { status: 400 })
    ids.push(id)
  }
  const excludeParam = event.url.searchParams.get('exclude')
  const exclude = excludeParam === null ? null : Number(excludeParam)
  if (exclude !== null && (!Number.isSafeInteger(exclude) || exclude <= 0)) return json({ tags: [] }, { status: 400 })
  return json({ tags: await sourceTagHints(env(event).DB, ids, exclude) })
}
