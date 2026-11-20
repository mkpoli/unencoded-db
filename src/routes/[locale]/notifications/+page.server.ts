import { error } from '@sveltejs/kit'
import { env, guardWrite } from '$lib/server/guard'
import { markRead, notificationsOf, type Notification } from '$lib/server/notifications'
import { positiveId } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const asked = event.url.searchParams.get('before')
  const before = asked === null ? null : positiveId(asked)
  if (asked !== null && !before) error(404)
  const person = event.locals.person
  if (!person) return { notifications: [] as Notification[], next: null as number | null }
  return notificationsOf(env(event).DB, person.id, before)
}

export const actions: Actions = {
  // Reading the page is what marks its notices read, so the page asks for it once it is shown.
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const person = event.locals.person
    if (person) await markRead(env(event).DB, person.id)
    return { read: true }
  },
}
