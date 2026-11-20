import { error } from '@sveltejs/kit'
import { env, guardWrite } from '$lib/server/guard'
import { latestNotice, markRead, notificationsOf, type Notification } from '$lib/server/notifications'
import { positiveId } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const asked = event.url.searchParams.get('before')
  const before = asked === null ? null : positiveId(asked)
  if (asked !== null && !before) error(404)
  const person = event.locals.person
  if (!person) return { notifications: [] as Notification[], next: null as number | null, latest: 0 }
  const db = env(event).DB
  return { ...await notificationsOf(db, person.id, before), latest: await latestNotice(db, person.id) }
}

export const actions: Actions = {
  // Reading the page is what marks its notices read, so the page asks for it once it is shown.
  default: async (event) => {
    await guardWrite(event, 'EDITS')
    const person = event.locals.person
    const upto = positiveId(String((await event.request.formData()).get('upto') ?? ''))
    if (!upto) error(400)
    if (person) await markRead(env(event).DB, person.id, upto)
    return { read: true }
  },
}
