import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { ofPerson } from '$lib/server/entries'
import { env, guardWrite } from '$lib/server/guard'
import { joinPerson, PERSON_ID } from '$lib/server/people'
import { tagList } from '$lib/server/tags'
import { revisionDates, revisionFields } from '$lib/server/revisions'
import { positiveId } from '../../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = event.params.id
  if (!PERSON_ID.test(id)) error(404)
  const cursor = event.url.searchParams.get('before')
  const before = cursor === null ? null : positiveId(cursor)
  if (cursor !== null && before === null) error(404)
  const [found, tags] = await Promise.all([ofPerson(env(event).DB, id, before), tagList(env(event).DB)])
  if (!found) error(404)
  if (found.person.merged_into) redirect(302, `/${event.params.locale}/u/${found.person.merged_into}`)
  const revisions = found.rows.map(({ snapshot, sighting_rev, ...row }) => ({
    ...row,
    sightingRev: sighting_rev ?? null,
    ...revisionFields({ sighting_id: row.sighting_id, kind: row.kind, snapshot }),
  }))
  return {
    person: { id: found.person.id, name: found.person.name, created_at: found.person.created_at },
    // Only a person who never signed in can join another.
    mergeable: moderating(event) && !found.person.atlas_sub && !found.person.banned_at,
    rows: revisions,
    dates: await revisionDates(env(event).DB, revisions),
    next: found.next,
    tags: tags.map(({ name, label, type }) => ({ name, label, type })),
  }
}

const moderating = (event: RequestEvent) => Boolean(event.locals.person?.moderator && !event.locals.person.banned)

/** The person a field names, by their id or the address of their page. */
function named(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  let path = text
  try { path = new URL(text).pathname } catch { /* an id */ }
  const id = /(?:^|\/u\/)([^/]+)\/?$/.exec(path)?.[1]?.toLowerCase() ?? ''
  return PERSON_ID.test(id) ? id : null
}

export const actions: Actions = {
  // A moderator names who this person is, and is shown that person before joining them.
  merge: async event => {
    await guardWrite(event, 'EDITS', true)
    const form = await event.request.formData()
    const into = named(form.get('into'))
    if (!into) return fail(400, { merge: 'missing' as const, into: String(form.get('into') ?? '') })
    const db = env(event).DB
    if (into === event.params.id) return fail(400, { merge: 'self' as const, into })
    if (form.get('confirm') !== into) {
      const target = await db.prepare('SELECT id, name, changes, banned_at FROM people WHERE id = ? AND merged_into IS NULL').bind(into).first<{ id: string; name: string; changes: number; banned_at: string | null }>()
      if (!target) return fail(400, { merge: 'missing' as const, into })
      if (target.banned_at) return fail(400, { merge: 'banned' as const, into })
      return { target: { id: target.id, name: target.name, changes: target.changes }, into }
    }
    const refused = await joinPerson(db, event.params.id, into)
    if (refused) return fail(400, { merge: refused, into })
    redirect(303, `/${event.params.locale}/u/${into}`)
  },
}
