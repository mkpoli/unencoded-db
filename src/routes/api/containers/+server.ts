import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { containerSuggestions } from '$lib/server/containers'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => json(await containerSuggestions(env(event).DB, (event.url.searchParams.get('q') ?? '').slice(0, 300)))
