// The consent page of agent sign-in. A client sends the person's browser here; allowing it hands the
// client a code for whoever this browser is, a first-time visitor becoming a person as on a first save.
import { error, redirect } from '@sveltejs/kit'
import { grantCode, readAuthorize, redirectBack } from '$lib/server/agents'
import { env, guardWrite } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { Actions, PageServerLoad } from './$types'

async function asked(event: Parameters<PageServerLoad>[0] | Parameters<Actions['default']>[0]) {
  const request = await readAuthorize(env(event).DB, event)
  if ('client' in request) return request
  if (request.at === 'client') error(400, 'Unknown client')
  redirect(303, redirectBack(request.redirect, request.state, { error: request.error }))
}

export const load: PageServerLoad = async (event) => {
  const request = await asked(event)
  const back = new URL(request.redirect)
  return { client: request.client.name, to: back.protocol === 'http:' || back.protocol === 'https:' ? back.host : back.protocol, next: `${event.url.pathname}${event.url.search}` }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const request = await asked(event)
    if ((await event.request.formData()).get('decision') !== 'allow') redirect(303, redirectBack(request.redirect, request.state, { error: 'access_denied' }))
    const { DB } = env(event)
    const person = await writer(event, DB)
    redirect(303, redirectBack(request.redirect, request.state, { code: await grantCode(DB, request, person.id) }))
  },
}
