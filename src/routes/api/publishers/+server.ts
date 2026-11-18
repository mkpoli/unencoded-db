import { json } from '@sveltejs/kit'
import { env } from '$lib/server/guard'
import { publisherDirectory } from '$lib/server/publishers'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async event => json(await publisherDirectory(env(event).DB, (event.url.searchParams.get('q') ?? '').slice(0, 300)))
