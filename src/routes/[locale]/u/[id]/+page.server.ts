import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit'
import { personRecord, personScope } from '$lib/server/entries'
import { env, guardWrite } from '$lib/server/guard'
import { agentsOf, cleanAgentName, joinPerson, PERSON_ID } from '$lib/server/people'
import { tagList } from '$lib/server/tags'
import { feedCursor, feedPage } from '$lib/server/revisions'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
  const id = event.params.id
  if (!PERSON_ID.test(id)) error(404)
  const cursor = feedCursor(event.url)
  if (!cursor) error(404)
  const db = env(event).DB
  const person = await personRecord(db, id)
  if (!person) error(404)
  if (person.merged_into) redirect(302, `/${event.params.locale}/u/${person.merged_into}`)
  const [page, tags, agents] = await Promise.all([feedPage(db, personScope(id), cursor), tagList(db), agentsOf(db, id)])
  return {
    person: { id: person.id, name: person.name, created_at: person.created_at },
    agents,
    // Only a person who never signed in can join another.
    mergeable: moderating(event) && !person.atlas_sub && !person.banned_at,
    ...page,
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
    const rawInto = String(form.get('into') ?? '')
    const rawAgent = String(form.get('agent') ?? '').trim()
    const rawModel = String(form.get('model') ?? '').trim()
    const agent = rawAgent ? cleanAgentName(rawAgent) : null
    if (rawAgent && !agent) return fail(400, { merge: 'agent' as const, into: rawInto, agent: rawAgent, model: rawModel })
    const model = rawModel ? cleanAgentName(rawModel) : null
    if (rawModel && (!model || !agent)) return fail(400, { merge: 'model' as const, into: rawInto, agent: agent ?? '', model: rawModel })
    const into = named(form.get('into'))
    if (!into) return fail(400, { merge: 'missing' as const, into: rawInto, agent: agent ?? '', model: model ?? '' })
    const db = env(event).DB
    if (into === event.params.id) return fail(400, { merge: 'self' as const, into, agent: agent ?? '', model: model ?? '' })
    const confirmAgent = String(form.get('confirm_agent') ?? '')
    const confirmModel = String(form.get('confirm_model') ?? '')
    if (form.get('confirm') !== into || confirmAgent !== (agent ?? '') || confirmModel !== (model ?? '')) {
      const target = await db.prepare('SELECT id, name, changes, banned_at FROM people WHERE id = ? AND merged_into IS NULL').bind(into).first<{ id: string; name: string; changes: number; banned_at: string | null }>()
      if (!target) return fail(400, { merge: 'missing' as const, into, agent: agent ?? '', model: model ?? '' })
      if (target.banned_at) return fail(400, { merge: 'banned' as const, into, agent: agent ?? '', model: model ?? '' })
      return { target: { id: target.id, name: target.name, changes: target.changes }, into, agent: agent ?? '', model: model ?? '' }
    }
    const refused = await joinPerson(db, event.params.id, into, { agent, model })
    if (refused) return fail(400, { merge: refused, into, agent: agent ?? '', model: model ?? '' })
    redirect(303, `/${event.params.locale}/u/${into}`)
  },
}
