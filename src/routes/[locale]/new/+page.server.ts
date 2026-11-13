import { fail, redirect } from '@sveltejs/kit'
import { mapSightings } from '$lib/claims'
import { ADD_SIGHTINGS_MAX } from '$lib/limits'
import { CITATION_FIELDS, VIA_FIELDS, type SightingFields, createEntry, getEntryRow, getSighting, readEntryFields, readSightingFields } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { writer } from '$lib/server/people'
import { positiveId, readImages, sightingForms, storeImages, type ReadImage } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

// `?sighting=` starts the form from a visible sighting: its citation, where it was found and its pictures,
// for another character seen in the same place.
export const load: PageServerLoad = async (event) => {
  const id = positiveId(event.url.searchParams.get('sighting'))
  if (!id) return { seed: null }
  const { DB } = env(event)
  const sighting = await getSighting(DB, id)
  const entry = sighting && !sighting.hidden_at ? await getEntryRow(DB, sighting.entry_id) : null
  if (!sighting || !entry || entry.hidden_at || entry.merged_into) return { seed: null }
  const values: Partial<SightingFields> = Object.fromEntries(([...CITATION_FIELDS, ...VIA_FIELDS, 'place', 'original_date', 'page'] as const).map(field => [field, sighting[field]]))
  return { seed: { values, pictures: sighting.media.map(picture => picture.image_key) } }
}

const filled = (form: FormData, fields: SightingFields) => Object.values(fields).some(Boolean) || form.getAll('image').some(file => file instanceof File && file.size > 0)

export const actions: Actions = {
  // A record and the sightings it starts with. Each sighting needs where it was found and a picture or a
  // link, and all of them are read and checked before a picture is stored or a row written; the record
  // and its sightings are then saved together by `createEntry`, which gives each claim the ids of the
  // sightings it names. A sighting left empty is passed over.
  //
  // The request has paid for one add in `guardWrite`. Every sighting after the first is charged to the
  // same allowance, as it would be when added to the record afterwards, so a long form never gets past
  // the rate limit. The pictures of all the sightings share one request body (`MAX_PICTURES_BODY`).
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const form = await event.request.formData()
    const { fields: read, error: claimError } = readEntryFields(form)
    const all = sightingForms(form).map(section => ({ form: section, fields: readSightingFields(section) }))
    const sections = all.filter(section => filled(section.form, section.fields))
    // A claim names the sightings behind it by their place on the page, from 1. A sighting left empty is
    // passed over, so each name becomes the place among the ones that are kept.
    const entry = { ...read, claims: mapSightings(read.claims, place => sections.indexOf(all[place - 1]) + 1 || null) }
    const sightings = sections.map(section => section.fields)
    // `sighting` numbers the one an error is about; 0 names none.
    const reject = (status: 400 | 429, error: string, sighting = 0) => fail(status, { error, sighting, values: { ...entry, sightings } })
    if (claimError) return reject(400, claimError)
    if (!sections.length) return reject(400, 'place', 1)
    if (sections.length > ADD_SIGHTINGS_MAX) return reject(400, 'sightingsMax')

    const pictures: ReadImage[][] = []
    for (const [index, section] of sections.entries()) {
      if (!section.fields.place) return reject(400, 'place', index + 1)
      const images = await readImages(section.form)
      if (images === 'invalid') return reject(400, 'image', index + 1)
      if (!images.length && !section.fields.url && !section.fields.via_url) return reject(400, 'evidence', index + 1)
      pictures.push(images)
    }
    if (!(await chargeWrites(event, 'ADDS', sections.length - 1))) return reject(429, 'slow')

    const { DB, MEDIA } = env(event)
    const drafts = []
    for (const [index, fields] of sightings.entries()) drafts.push({ fields, media: await storeImages(MEDIA, pictures[index]) })
    const person = await writer(event, DB)
    const id = await createEntry(DB, entry, drafts[0].fields, drafts[0].media, { actor: person.id, ip: await ipHash(event) }, drafts.slice(1))
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
