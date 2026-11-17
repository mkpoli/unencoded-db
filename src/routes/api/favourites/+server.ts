import { json } from '@sveltejs/kit'
import { FavouriteError, favouriteIds, parseFavouriteInput, resolveLiveEntry, setFavourite } from '$lib/server/favourites'
import { env, guardWrite } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { RequestHandler } from './$types'

const PRIVATE = { 'cache-control': 'private, no-store' }

export const GET: RequestHandler = async (event) => {
  const person = event.locals.person
  if (!person) return json({ ids: [] }, { headers: PRIVATE })
  return json(await favouriteIds(env(event).DB, person.id), { headers: PRIVATE })
}

export const POST: RequestHandler = async (event) => {
  const origin = event.request.headers.get('origin')
  if (origin && origin !== event.url.origin) {
    return json({ error: 'forbidden', message: 'Use this site to save favourites.' }, { status: 403, headers: PRIVATE })
  }
  await guardWrite(event, 'EDITS')
  let input: unknown
  try {
    input = await event.request.json()
  } catch {
    return json({ error: 'invalid', message: 'Invalid JSON.' }, { status: 400, headers: PRIVATE })
  }
  try {
    const { entry, favourite } = parseFavouriteInput(input)
    const db = env(event).DB
    if (!favourite && !event.locals.person) return json({ entry, favourite: false }, { headers: PRIVATE })
    if (favourite && (await resolveLiveEntry(db, entry)) === null) {
      throw new FavouriteError(404, 'That record does not exist.')
    }
    const person = await writer(event, db)
    return json(await setFavourite(db, person.id, entry, favourite), { headers: PRIVATE })
  } catch (error) {
    if (error instanceof FavouriteError) {
      const code = error.status === 429 ? 'limit' : error.status === 404 ? 'missing' : 'invalid'
      return json({ error: code, message: error.message }, { status: error.status, headers: PRIVATE })
    }
    throw error
  }
}
