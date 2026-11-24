import { error } from '@sveltejs/kit'
import { env, guardWrite } from '$lib/server/guard'
import { latestNotice, markRead, notificationsOf } from '$lib/server/notifications'
import { revisionDates, revisionFields } from '$lib/server/revisions'
import { tagList } from '$lib/server/tags'
import { positiveId } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const asked = event.url.searchParams.get('before')
  const before = asked === null ? null : positiveId(asked)
  if (asked !== null && !before) error(404)
  const person = event.locals.person
  const db = env(event).DB
  const [found, latest, tags] = person ? await Promise.all([notificationsOf(db, person.id, before), latestNotice(db, person.id), tagList(db)]) : [{ notifications: [], next: null }, 0, []]
  // A notice of a change, or of thanks for one, carries what the record or the evidence held after it.
  const notifications = found.notifications.map(({ change, change_sighting, snapshot, redacted_at, ...notice }) => ({
    ...notice,
    ...revisionFields({ sighting_id: change_sighting, kind: change ?? '', snapshot: snapshot ?? '{}', redacted_at }),
    kind: notice.kind,
  }))
  return { notifications, next: found.next, latest, dates: await revisionDates(db, notifications), tags: tags.map(({ name, label, names, aliases, type }) => ({ name, label, names, aliases, type })) }
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
