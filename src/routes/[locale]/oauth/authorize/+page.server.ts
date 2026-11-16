// The consent page of agent sign-in. A client sends the person's browser here; allowing it hands the
// client a code for whoever this browser is, a first-time visitor becoming a person as on a first save.
// The browser leaves for the client's address only when the person presses a button.
import { error, redirect } from '@sveltejs/kit'
import { grantCode, readAuthorize, redirectBack, webAddress } from '$lib/server/agents'
import { env, guardWrite } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import type { Actions, PageServerLoad } from './$types'

async function asked(event: Parameters<PageServerLoad>[0] | Parameters<Actions['default']>[0]) {
  const request = await readAuthorize(env(event).DB, event)
  if (typeof request === 'string') error(400, request)
  return request
}

export const load: PageServerLoad = async (event) => {
  const request = await asked(event)
  const back = new URL(request.redirect)
  return { client: request.client.name, to: webAddress(request.redirect) ? back.host : back.protocol, next: `${event.url.pathname}${event.url.search}` }
}

export const actions: Actions = {
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const request = await asked(event)
    if ((await event.request.formData()).get('decision') !== 'allow') {
      // Declining opens no app: only a web address is told, and any other client is left to give up waiting.
      redirect(303, webAddress(request.redirect) ? redirectBack(request.redirect, request.state, { error: 'access_denied' }) : `/${event.params.locale}`)
    }
    const { DB } = env(event)
    const person = await writer(event, DB)
    redirect(303, redirectBack(request.redirect, request.state, { code: await grantCode(DB, request, person.id) }))
  },
}
