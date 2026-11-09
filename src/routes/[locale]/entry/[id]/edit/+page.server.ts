import { error, fail, redirect } from '@sveltejs/kit'
import { SCRIPT_MAX } from '$lib/script'
import { readIvd } from '$lib/server/ivd'
import { addEvidence, evidenceFields, listEvidence, primaryEvidenceId, readEvidenceFields, updateEvidence } from '$lib/server/evidence-links'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage, type ImageError } from '$lib/server/images'
import { readComparisons, type Comparison } from '$lib/server/related'
import { listGenres, genresForEntry, selectedGenres, saveGenres } from '$lib/server/genres'
import { listCollections, collectionsForEntry, selectedCollections, saveCollections } from '$lib/server/collections'
import { listTags, tagsForEntry, parseTags, saveTags } from '$lib/server/tags'
import { listSenses, parseSenses, replaceSenses } from '$lib/server/senses'
import { cookieOptions, hashToken } from '$lib/server/attribution'
import { publicEntryPredicate } from '$lib/server/visibility'
import { isLocale, localizedHref, t, type Locale } from '$lib/i18n'
import type { Actions, PageServerLoad } from './$types'

type EntryRow = {
  id: number
  revision: number
  edit_generation: number
  script: string
  ids: string | null
  description: string | null
  radical: string | null
  encoded_as: string | null
  strokes: number | null
  ivd_status: 'registered' | 'none' | null
  ivd_sequence: string | null
  comparisons: string
}

type FormValues = Record<string, string | string[]>

function idOf(id: string) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) error(404)
  return Number(id)
}

function positive(value: unknown) {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : null
}

function imageError(locale: Locale, error: ImageError): string {
  return t(locale, error === 'oversize' ? 'error.imageOversize' : 'error.imageUnsupported')
}

function text(form: FormData, name: string) {
  return String(form.get(name) ?? '').normalize('NFC').trim()
}

async function discardImage(db: D1Database, bucket: R2Bucket, key: string) {
  const used = await db.prepare(`SELECT 1 AS used FROM evidence_media em JOIN media m ON m.id = em.media_id WHERE m.key = ?
    UNION ALL SELECT 1 FROM entries WHERE image_key = ? LIMIT 1`).bind(key, key).first()
  if (!used) await deleteSourceImage(bucket, key)
}

function readCharacter(form: FormData) {
  const script = text(form, 'script')
  const ids = text(form, 'ids')
  const description = text(form, 'description')
  const radical = text(form, 'radical')
  const encodedAs = text(form, 'encoded_as')
  const rawStrokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
  const strokes = Number.isInteger(rawStrokes) && rawStrokes >= 0 && rawStrokes < 200 ? rawStrokes : null
  return { script, ids, description, radical, encodedAs, strokes }
}

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!isLocale(params.locale)) error(404)
  if (!platform) error(500, 'Database unavailable')
  const id = idOf(params.id)
  const row = await platform.env.DB.prepare(
    `SELECT id, revision, edit_generation, script, ids, description, radical, encoded_as, strokes, ivd_status, ivd_sequence, comparisons
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(id).first<EntryRow>()
  if (!row) error(404)
  const [evidence, senses, tags, genres, collections, allGenres, allCollections, allTags] = await Promise.all([
    listEvidence(platform.env.DB, id),
    listSenses(platform.env.DB, id),
    tagsForEntry(platform.env.DB, id),
    genresForEntry(platform.env.DB, id),
    collectionsForEntry(platform.env.DB, id),
    listGenres(platform.env.DB),
    listCollections(platform.env.DB),
    listTags(platform.env.DB),
  ])
  return {
    entry: { ...row, comparisons: JSON.parse(row.comparisons) as Comparison[] },
    evidence,
    senses,
    tags,
    genres,
    collections,
    allGenres,
    allCollections,
    allTags,
  }
}

export const actions: Actions = {
  character: async ({ params, platform, request }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Database unavailable')
    const locale = params.locale
    const id = idOf(params.id)
    const form = await request.formData()
    const values = readCharacter(form)
    const ivdStatus = text(form, 'ivd_status')
    const ivdSequence = text(form, 'ivd_sequence')
    const ivd = readIvd(form.get('ivd_status'), form.get('ivd_sequence'))
    const tags = parseTags(String(form.get('tags') ?? ''))
    const genres = selectedGenres(form)
    const collections = selectedCollections(form)
    const senses = parseSenses(form)
    const comparisons = readComparisons(form)
    const revision = positive(form.get('revision'))
    const generation = positive(form.get('edit_generation'))
    const submitted: FormValues = {
      script: values.script,
      ids: values.ids,
      description: values.description,
      radical: values.radical,
      encoded_as: values.encodedAs,
      strokes: values.strokes === null ? '' : String(values.strokes),
      ivd_status: ivdStatus,
      ivd_sequence: ivdSequence,
      tags: tags.join(', '),
      genres,
      collections,
    }
    const errors: Record<string, string> = {}
    if (!values.script || values.script.length > SCRIPT_MAX) errors.script = t(locale, 'error.script')
    if (values.ids.length > 200) errors.ids = t(locale, 'error.length')
    if (values.description.length > 5000) errors.description = t(locale, 'error.length')
    if (values.radical.length > 20) errors.radical = t(locale, 'error.length')
    if (values.encodedAs.length > 80) errors.encoded_as = t(locale, 'error.length')
    if (senses === null) errors.senses = t(locale, 'error.length')
    if (!ivd) errors.ivd_sequence = t(locale, 'error.ivd')
    const failForm = (status: 400 | 404 | 409, message: string) => fail(status, {
      action: 'character',
      values: submitted,
      revision: form.get('revision'),
      generation: form.get('edit_generation'),
      errors,
      comparisons,
      senses: senses ?? [],
      message,
    })
    if (!ivd || Object.keys(errors).length || comparisons.tooMany || comparisons.errors.some(Boolean)) return failForm(400, t(locale, 'error.fields'))
    if (!revision || !generation) return failForm(400, t(locale, 'error.fields'))
    const updated = await platform.env.DB.prepare(
      `UPDATE entries SET script = ?, ids = ?, description = ?, radical = ?, encoded_as = ?, strokes = ?, ivd_status = ?, ivd_sequence = ?, comparisons = ?, revision = revision + 1
       WHERE id = ? AND ${publicEntryPredicate} AND revision = ? AND edit_generation = ? RETURNING id`
    ).bind(values.script, values.ids || null, values.description || null, values.radical || null, values.encodedAs || null, values.strokes,
      ivd.status, ivd.sequence, JSON.stringify(comparisons.rows), id, revision, generation).first<{ id: number }>()
    if (!updated) {
      const visible = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
      if (!visible) error(404)
      return failForm(409, t(locale, 'edit.conflict'))
    }
    const primary = await primaryEvidenceId(platform.env.DB, id)
    await saveTags(platform.env.DB, id, tags)
    await saveGenres(platform.env.DB, id, genres)
    await saveCollections(platform.env.DB, id, collections, primary)
    await replaceSenses(platform.env.DB, id, senses ?? [], primary)
    redirect(303, localizedHref(locale, `/entry/${id}`))
  },
  evidence: async ({ params, platform, request, url }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Database unavailable')
    const locale = params.locale
    const id = idOf(params.id)
    const form = await request.formData()
    const evidenceId = positive(form.get('evidence'))
    if (!evidenceId) error(404)
    const row = await platform.env.DB.prepare(
      `SELECT ev.id, ev.image_key, ev.image_type, ev.image_size FROM evidence ev
       JOIN entries en ON en.id = ev.entry_id AND ${publicEntryPredicate}
       WHERE ev.id = ? AND ev.entry_id = ?`
    ).bind(evidenceId, id).first<{ id: number; image_key: string | null; image_type: string | null; image_size: number | null }>()
    if (!row) error(404)
    const raw = Object.fromEntries(evidenceFields.map(name => [name, text(form, name)])) as Record<string, string>
    const errors: Record<string, string> = {}
    const limits: Record<string, number> = { place: 500, url: 1000, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    for (const [name, limit] of Object.entries(limits)) if (raw[name]!.length > limit) errors[name] = t(locale, name === 'place' ? 'error.placeSeen' : 'error.length')
    if (!raw.place) errors.place = t(locale, 'error.placeSeen')
    if (raw.url && !/^https?:\/\//i.test(raw.url)) errors.url = t(locale, 'error.length')
    const fields = readEvidenceFields(form)
    const revision = positive(form.get('revision'))
    const generation = positive(form.get('edit_generation'))
    const removeImage = form.get('remove_image') === '1'
    let image: { key: string; type: string; size: number } | null | undefined
    const file = form.get('image')
    if (file instanceof File && file.size) {
      const source = await readSourceImage(form)
      if (source.error || !source.image) {
        errors.image = imageError(locale, source.error ?? 'unsupported')
      } else {
        const key = createImageKey()
        try {
          await putSourceImage(platform.env.IMAGES, key, source.image)
          image = { key, type: source.image.type, size: source.image.size }
        } catch {
          return fail(500, { action: 'evidence', evidenceId, values: raw, revision: form.get('revision'), generation: form.get('edit_generation'), errors: { image: t(locale, 'error.save') } })
        }
      }
    }
    const discard = async () => { if (image) await deleteSourceImage(platform.env.IMAGES, image.key) }
    const failForm = async (status: 400 | 404 | 409, message: string) => { await discard(); return fail(status, { action: 'evidence', evidenceId, values: raw, revision: form.get('revision'), generation: form.get('edit_generation'), errors, message }) }
    if (image === undefined) image = removeImage ? null : undefined
    if (!revision || !generation) return failForm(400, t(locale, 'error.fields'))
    if (Object.keys(errors).length || !fields) return failForm(400, t(locale, 'error.fields'))
    const current = await platform.env.DB.prepare(`SELECT revision, edit_generation FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ revision: number; edit_generation: number }>()
    if (!current) error(404)
    if (current.revision !== revision || current.edit_generation !== generation) return failForm(409, t(locale, 'edit.conflict'))
    const primary = await primaryEvidenceId(platform.env.DB, id)
    if (evidenceId === primary) {
      const imageKey = image === undefined ? row.image_key : image?.key ?? null
      const imageType = image === undefined ? row.image_type : image?.type ?? null
      const imageSize = image === undefined ? row.image_size : image?.size ?? null
      const synced = await platform.env.DB.prepare(
        `UPDATE entries SET place = ?, title = ?, author = ?, publisher = ?, year = ?, page = ?, note = ?,
           image_key = ?, image_type = ?, image_size = ?, revision = revision + 1
         WHERE id = ? AND ${publicEntryPredicate} AND revision = ? AND edit_generation = ? RETURNING id`
      ).bind(fields.place, fields.title, fields.author, fields.publisher, fields.year, fields.page, fields.note,
        imageKey, imageType, imageSize, id, revision, generation).first<{ id: number }>()
      if (!synced) {
        const visible = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
        if (!visible) error(404)
        return failForm(409, t(locale, 'edit.conflict'))
      }
    }
    const updated = await updateEvidence(platform.env.DB, id, evidenceId, fields, image, evidenceId === primary ? undefined : { revision, generation })
    if (!updated) {
      const visible = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
      if (!visible) error(404)
      return failForm(409, t(locale, 'edit.conflict'))
    }
    if (image !== undefined && row.image_key && row.image_key !== image?.key) await discardImage(platform.env.DB, platform.env.IMAGES, row.image_key)
    redirect(303, `${localizedHref(locale, `/entry/${id}/edit`)}#evidence-${evidenceId}`)
  },
  addEvidence: async ({ params, platform, request, cookies, url }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Database unavailable')
    const locale = params.locale
    const id = idOf(params.id)
    const entry = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ id: number }>()
    if (!entry) error(404)
    const form = await request.formData()
    const values = Object.fromEntries(evidenceFields.map(name => [name, text(form, name)])) as Record<string, string>
    const errors: Record<string, string> = {}
    const limits: Record<string, number> = { place: 500, url: 1000, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    for (const [name, limit] of Object.entries(limits)) if (values[name]!.length > limit) errors[name] = t(locale, name === 'place' ? 'error.placeSeen' : 'error.length')
    if (!values.place) errors.place = t(locale, 'error.placeSeen')
    if (values.url && !/^https?:\/\//i.test(values.url)) errors.url = t(locale, 'error.length')
    const fields = readEvidenceFields(form)
    let image: { key: string; type: string; size: number } | null = null
    const file = form.get('image')
    if (file instanceof File && file.size) {
      const source = await readSourceImage(form)
      if (source.error || !source.image) {
        errors.image = imageError(locale, source.error ?? 'unsupported')
      } else {
        const key = createImageKey()
        try {
          await putSourceImage(platform.env.IMAGES, key, source.image)
          image = { key, type: source.image.type, size: source.image.size }
        } catch {
          return fail(500, { action: 'addEvidence', values, errors: { image: t(locale, 'error.save') } })
        }
      }
    }
    const failForm = async (status: 400, message: string) => {
      if (image) await deleteSourceImage(platform.env.IMAGES, image.key)
      return fail(status, { action: 'addEvidence', values, errors, message })
    }
    if (Object.keys(errors).length || !fields) return failForm(400, t(locale, 'error.fields'))
    const cookie = cookieOptions(url)
    const token = cookie ? cookies.get(cookie.name) : undefined
    const person = token && /^[0-9a-f]{64}$/.test(token)
      ? await platform.env.DB.prepare(`SELECT person_id FROM contributor_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).bind(await hashToken(token)).first<{ person_id: string }>()
      : null
    let added: { id: number }
    try {
      added = await addEvidence(platform.env.DB, id, fields, image, person?.person_id ?? null)
    } catch {
      if (image) await deleteSourceImage(platform.env.IMAGES, image.key)
      return fail(500, { action: 'addEvidence', values, errors: {}, message: t(locale, 'error.save') })
    }
    redirect(303, `${localizedHref(locale, `/entry/${id}/edit`)}#evidence-${added.id}`)
  },
}
