import { createTag, taxonomy } from '$lib/server/tags'
import { fail, redirect } from '@sveltejs/kit'
import { mapSightings, newClaim } from '$lib/claims'
import { readNewTag } from '$lib/tags'
import { ADD_SIGHTINGS_MAX } from '$lib/limits'
import { citesEvidence, type SightingFields, createEntry, readEntryFields, readSightingFields } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { notifyIndexNow } from '$lib/server/indexnow'
import { writer } from '$lib/server/people'
import { loadSightingSeed, readImages, readViaPictures, sightingForms, storeImages, type ReadImage } from '../../_submission.server'
import type { Actions, PageServerLoad } from './$types'

// `?sighting=` starts the form from a visible sighting: its citation, where it was found and its pictures,
// for another character seen in the same place.
export const load: PageServerLoad = async (event) => {
  const { DB } = env(event)
  const [{ tags, groups }, seed] = await Promise.all([taxonomy(DB), loadSightingSeed(DB, event.url.searchParams.get('sighting'))])
  return { seed, tags, groups }
}

const filled = (form: FormData, fields: SightingFields) => Object.values({ ...fields, vias: fields.vias.length }).some(Boolean) || [...form.getAll('image'), ...form.getAll('via_image')].some(file => file instanceof File && file.size > 0)

export const actions: Actions = {
  // A record and the sightings it starts with. Each sighting needs a picture or a link, and all of them are read and checked before a picture is stored or a row written; the record
  // and its sightings are then saved together by `createEntry`, which gives each claim the ids of the
  // sightings it names. A sighting left empty is passed over.
  //
  // The request has paid for one add in `guardWrite`. Every sighting after the first is charged to the
  // same allowance, as it would be when added to the record afterwards, so a long form never gets past
  // the rate limit. The pictures of all the sightings share one request body (`MAX_PICTURES_BODY`).
  default: async (event) => {
    await guardWrite(event, 'ADDS')
    const form = await event.request.formData()
    const { DB, MEDIA } = env(event)
    const { tags, groups } = await taxonomy(DB)
    const { fields: read, error: claimError } = readEntryFields(form, tags)
    // A form started from a sighting may keep the pictures of its chain, while that sighting can be seen. A refused
    // form shows the ones kept again.
    const seed = (await loadSightingSeed(DB, String(form.get('seed') ?? '')))?.values.vias ?? []
    const all = await Promise.all(sightingForms(form).map(async section => {
      const shots = await readViaPictures(section, seed)
      return { form: section, shots, fields: readSightingFields(section, shots.kept) }
    }))
    const sections = all.filter(section => filled(section.form, section.fields))
    // A claim names the sightings behind it by their place on the page, from 1. A sighting left empty is
    // passed over, so each name becomes the place among the ones that are kept.
    // A tag typed into the form without scripts is made with the record and attached.
    const fresh = readNewTag(form, tags)
    const claims = mapSightings(read.claims, place => sections.indexOf(all[place - 1]) + 1 || null)
    if (fresh && fresh !== 'invalid' && !claims.some(claim => claim.kind === 'tag' && claim.value === fresh.name)) claims.push(newClaim('tag', fresh.name))
    const entry = { ...read, claims }
    const sightings = sections.map(section => section.fields)
    // `sighting` numbers the one an error is about; 0 names none.
    const reject = (status: 400 | 429, error: string, sighting = 0) => fail(status, { error, sighting, values: { ...entry, sightings } })
    if (claimError) return reject(400, claimError)
    if (fresh === 'invalid' || (fresh && fresh.group !== null && !groups.some(group => group.id === fresh.group))) return reject(400, 'tag')
    if (!sections.length) return reject(400, 'evidence', 1)
    if (sections.length > ADD_SIGHTINGS_MAX) return reject(400, 'sightingsMax')

    const pictures: ReadImage[][] = [], cited: { fields: SightingFields; files: ReadImage[] }[] = []
    for (const [index, section] of sections.entries()) {
      const { shots } = section
      if (shots.error) return reject(400, shots.error, index + 1)
      const fields = readSightingFields(section.form, shots.all)
      const images = await readImages(section.form)
      if (images === 'invalid') return reject(400, 'image', index + 1)
      if (!images.length && !citesEvidence(fields)) return reject(400, 'evidence', index + 1)
      cited.push({ fields, files: shots.files })
      pictures.push(images)
    }
    if (!(await chargeWrites(event, 'ADDS', sections.length - 1))) return reject(429, 'slow')

    const drafts = []
    for (const [index, { fields, files }] of cited.entries()) {
      await storeImages(MEDIA, files)
      drafts.push({ fields, media: await storeImages(MEDIA, pictures[index]) })
    }
    const person = await writer(event, DB)
    const who = { actor: person.id, ip: await ipHash(event) }
    if (fresh && !(await createTag(DB, tags, fresh, who, groups)).ok) return reject(400, 'tag')
    const id = await createEntry(DB, entry, drafts[0].fields, drafts[0].media, who, drafts.slice(1))
    notifyIndexNow(event, { entries: [id] })
    redirect(303, `/${event.params.locale}/entry/${id}`)
  },
}
