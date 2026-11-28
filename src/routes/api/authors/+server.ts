import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { authorSuggestions } from '$lib/server/authors'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => json(await authorSuggestions(env(event).DB, (event.url.searchParams.get('q') ?? '').slice(0, 300)))
