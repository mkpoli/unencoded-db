import { json } from '@sveltejs/kit'
import { customScripts } from '$lib/server/entries'
import { env } from '$lib/server/guard'
import type { RequestHandler } from './$types'

// The names records give scripts outside the list, offered by the script field of a form.
export const GET: RequestHandler = async (event) => json(await customScripts(env(event).DB))
