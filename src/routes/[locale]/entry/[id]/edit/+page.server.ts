import { error, fail, redirect } from '@sveltejs/kit'
import { SCRIPT_MAX } from '$lib/script'
import { readIvd } from '$lib/server/ivd'
import { idsInvalid, rawIds, readIds } from '$lib/server/ids'
import { readComposition } from '$lib/server/composition'
import { addEvidence, addEvidenceMedia, evidenceFields, listEvidence, listEvidenceMedia, primaryEvidenceId, readEvidenceFields, updateEvidence } from '$lib/server/evidence-links'
import { createImageKey, deleteSourceImage, putSourceImage, readSourceImage, readSourceImages, type ImageError } from '$lib/server/images'
import { readComparisons } from '$lib/server/related'
import { readEquivalentTo } from '$lib/equivalent'
import type { Comparison } from '$lib/comparison-rows'
import { listGenres, genresForEntry, selectedGenres, saveGenres } from '$lib/server/genres'
import { listCollections, collectionsForEntry, selectedCollections, saveCollections } from '$lib/server/collections'
import { listTags, tagsForEntry, parseTags, saveTags } from '$lib/server/tags'
import { listSenses, parseSenses, replaceSenses } from '$lib/server/senses'
import { listEncodings, parseEncodings, primaryEncoding, saveEncodings } from '$lib/server/encodings'
import type { Encoding } from '$lib/encodings'
import { cookieOptions, hashToken } from '$lib/server/attribution'
import { publicEntryPredicate } from '$lib/server/visibility'
import { readEvidenceTypes } from '$lib/evidence-types'
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
  equivalent_to: string | null
  strokes: number | null
  composition: string | null
  ivd_status: 'registered' | 'none' | null
  ivd_sequence: string | null
  comparisons: string
}

type FormValues = Record<string, string | string[] | Encoding[]>

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
  const ids = readIds(form) ?? ''
  const description = text(form, 'description')
  const radical = text(form, 'radical')
  const equivalentTo = readEquivalentTo(form.get('equivalent_to'))
  const rawStrokes = Number.parseInt(String(form.get('strokes') ?? ''), 10)
  const strokes = Number.isInteger(rawStrokes) && rawStrokes >= 0 && rawStrokes < 200 ? rawStrokes : null
  return { script, ids, description, radical, equivalentTo, strokes }
}

export const load: PageServerLoad = async ({ params, platform }) => {
  if (!isLocale(params.locale)) error(404)
  if (!platform) error(500, 'Database unavailable')
  const id = idOf(params.id)
  const row = await platform.env.DB.prepare(
    `SELECT id, revision, edit_generation, script, ids, description, radical, encoded_as, equivalent_to, strokes, composition, ivd_status, ivd_sequence, comparisons
     FROM entries WHERE id = ? AND ${publicEntryPredicate}`
  ).bind(id).first<EntryRow>()
  if (!row) error(404)
  const [evidence, senses, tags, genres, collections, allGenres, allCollections, allTags, encodings, media] = await Promise.all([
    listEvidence(platform.env.DB, id),
    listSenses(platform.env.DB, id),
    tagsForEntry(platform.env.DB, id),
    genresForEntry(platform.env.DB, id),
    collectionsForEntry(platform.env.DB, id),
    listGenres(platform.env.DB),
    listCollections(platform.env.DB),
    listTags(platform.env.DB),
    listEncodings(platform.env.DB, id),
    listEvidenceMedia(platform.env.DB, id),
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
    encodings,
    media,
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
    const encodings = parseEncodings(form)
    const revision = positive(form.get('revision'))
    const generation = positive(form.get('edit_generation'))
    const composition = readComposition(form, values.ids || null)
    const submitted: FormValues = {
      script: values.script,
      ids: rawIds(form).join(', '),
      description: values.description,
      radical: values.radical,
      equivalent_to: values.equivalentTo.value ?? '',
      strokes: values.strokes === null ? '' : String(values.strokes),
      encodings: encodings ?? [],
      ivd_status: ivdStatus,
      ivd_sequence: ivdSequence,
      tags: tags.join(', '),
      genres,
      collections,
      composition: composition ?? '',
    }
    const errors: Record<string, string> = {}
    if (!values.script || values.script.length > SCRIPT_MAX) errors.script = t(locale, 'error.script')
    if (idsInvalid(form)) errors.ids = t(locale, 'error.length')
    if (values.description.length > 5000) errors.description = t(locale, 'error.length')
    if (values.radical.length > 20) errors.radical = t(locale, 'error.length')
    if (!encodings) errors.encodings = t(locale, 'error.encodings')
    if (!values.equivalentTo.valid) errors.equivalent_to = t(locale, 'error.equivalentTo')
    if (senses === null) errors.senses = t(locale, 'error.length')
    if (!ivd) errors.ivd_sequence = t(locale, 'error.ivd')
    if (comparisons.invalid) errors.comparison = t(locale, 'error.comparison')
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
    if (!ivd || !encodings || Object.keys(errors).length) return failForm(400, t(locale, 'error.fields'))
    if (!revision || !generation) return failForm(400, t(locale, 'error.fields'))
    const updated = await platform.env.DB.prepare(
      `UPDATE entries SET script = ?, ids = ?, description = ?, radical = ?, encoded_as = ?, equivalent_to = ?, strokes = ?, composition = ?, ivd_status = ?, ivd_sequence = ?, comparisons = ?, revision = revision + 1
       WHERE id = ? AND ${publicEntryPredicate} AND revision = ? AND edit_generation = ? RETURNING id`
    ).bind(values.script, values.ids || null, values.description || null, values.radical || null, primaryEncoding(encodings), values.equivalentTo.valid ? values.equivalentTo.value : null, values.strokes, composition,
      ivd.status, ivd.sequence, JSON.stringify(comparisons.rows), id, revision, generation).first<{ id: number }>()
    if (!updated) {
      const visible = await platform.env.DB.prepare(`SELECT id FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first()
      if (!visible) error(404)
      return failForm(409, t(locale, 'edit.conflict'))
    }
    const primary = await primaryEvidenceId(platform.env.DB, id)
    await saveTags(platform.env.DB, id, tags)
    await saveEncodings(platform.env.DB, id, encodings)
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
      `SELECT ev.id, ev.image_key, ev.image_type, ev.image_size, ev.provider, ev.provider_url FROM evidence ev
       JOIN entries en ON en.id = ev.entry_id AND ${publicEntryPredicate}
       WHERE ev.id = ? AND ev.entry_id = ?`
    ).bind(evidenceId, id).first<{ id: number; image_key: string | null; image_type: string | null; image_size: number | null; provider: string | null; provider_url: string | null }>()
    if (!row) error(404)
    const raw = Object.fromEntries(evidenceFields.map(name => [name, text(form, name)])) as Record<string, string>
    const submitted = { ...raw, types: readEvidenceTypes(form) }
    const errors: Record<string, string> = {}
    const limits: Record<string, number> = { place: 500, url: 1000, provider: 300, provider_url: 1000, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    for (const [name, limit] of Object.entries(limits)) if (raw[name]!.length > limit) errors[name] = t(locale, name === 'place' ? 'error.placeSeen' : 'error.length')
    if (!raw.place && !(raw.provider && (raw.provider_url || raw.url))) errors.place = t(locale, 'error.placeSeen')
    if (raw.url && !/^https?:\/\//i.test(raw.url)) errors.url = t(locale, 'error.length')
    if (raw.provider_url && !/^https?:\/\//i.test(raw.provider_url)) errors.provider_url = t(locale, 'error.length')
    const fields = readEvidenceFields(form)
    if (fields) {
      if (!form.has('provider')) fields.provider = row.provider
      if (!form.has('provider_url')) fields.provider_url = row.provider_url
    }
    const revision = positive(form.get('revision'))
    const generation = positive(form.get('edit_generation'))
    const removeImage = form.get('remove_image') === '1'
    const extraSource = await readSourceImages(form)
    if ('error' in extraSource) errors.image = imageError(locale, extraSource.error)
    const extraImages = 'images' in extraSource ? extraSource.images : []
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
          return fail(500, { action: 'evidence', evidenceId, values: submitted, revision: form.get('revision'), generation: form.get('edit_generation'), errors: { image: t(locale, 'error.save') } })
        }
      }
    }
    const discard = async () => { if (image) await deleteSourceImage(platform.env.IMAGES, image.key) }
    const failForm = async (status: 400 | 404 | 409, message: string) => { await discard(); return fail(status, { action: 'evidence', evidenceId, values: submitted, revision: form.get('revision'), generation: form.get('edit_generation'), errors, message }) }
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
    const extraMetas: { key: string; type: string; size: number }[] = []
    for (const extra of extraImages) {
      const key = createImageKey()
      try {
        await putSourceImage(platform.env.IMAGES, key, extra)
        extraMetas.push({ key, type: extra.type, size: extra.size })
      } catch {
        // An extra picture is optional; the evidence edit still stands.
      }
    }
    await addEvidenceMedia(platform.env.DB, evidenceId, extraMetas)
    if (image !== undefined && row.image_key && row.image_key !== image?.key) await discardImage(platform.env.DB, platform.env.IMAGES, row.image_key)
    redirect(303, `${localizedHref(locale, `/entry/${id}/edit`)}#evidence-${evidenceId}`)
  },
  gallery: async ({ params, platform, request }) => {
    if (!isLocale(params.locale)) error(404)
    if (!platform) error(500, 'Database unavailable')
    const locale = params.locale
    const id = idOf(params.id)
    const form = await request.formData()
    const evidenceId = positive(form.get('evidence'))
    const revision = positive(form.get('revision'))
    const generation = positive(form.get('edit_generation'))
    if (!evidenceId || !revision || !generation) error(400)
    const row = await platform.env.DB.prepare(
      `SELECT ev.id, ev.image_key FROM evidence ev JOIN entries en ON en.id = ev.entry_id AND ${publicEntryPredicate} WHERE ev.id = ? AND ev.entry_id = ?`
    ).bind(evidenceId, id).first<{ id: number; image_key: string | null }>()
    if (!row) error(404)
    const current = await platform.env.DB.prepare(`SELECT revision, edit_generation FROM entries WHERE id = ? AND ${publicEntryPredicate}`).bind(id).first<{ revision: number; edit_generation: number }>()
    if (!current) error(404)
    if (current.revision !== revision || current.edit_generation !== generation) return fail(409, { action: 'gallery', evidenceId, message: t(locale, 'edit.conflict') })
    const { results } = await platform.env.DB.prepare(
      `SELECT m.id, m.key, m.type, m.size FROM evidence_media em JOIN media m ON m.id = em.media_id WHERE em.evidence_id = ? ORDER BY m.id`
    ).bind(evidenceId).all<{ id: number; key: string; type: string; size: number }>()
    const remove = new Set(form.getAll('remove_media').map(value => Number(value)).filter(value => Number.isSafeInteger(value) && value > 0))
    const remaining = results.filter(image => !remove.has(image.id))
    const selected = remaining.find(image => image.key === row.image_key) ?? remaining[0] ?? null
    const primary = await primaryEvidenceId(platform.env.DB, id) === evidenceId
    const updated = await platform.env.DB.prepare(
      `UPDATE entries SET revision = revision + 1${primary ? ', image_key = ?, image_type = ?, image_size = ?' : ''}
       WHERE id = ? AND ${publicEntryPredicate} AND revision = ? AND edit_generation = ? RETURNING id`
    ).bind(...(primary ? [selected?.key ?? null, selected?.type ?? null, selected?.size ?? null] : []), id, revision, generation).first<{ id: number }>()
    if (!updated) return fail(409, { action: 'gallery', evidenceId, message: t(locale, 'edit.conflict') })
    for (const image of results.filter(image => remove.has(image.id))) {
      await platform.env.DB.prepare('DELETE FROM evidence_media WHERE evidence_id = ? AND media_id = ?').bind(evidenceId, image.id).run()
    }
    await platform.env.DB.prepare('UPDATE evidence SET image_key = ?, image_type = ?, image_size = ? WHERE id = ? AND entry_id = ?')
      .bind(selected?.key ?? null, selected?.type ?? null, selected?.size ?? null, evidenceId, id).run()
    for (const image of results.filter(image => remove.has(image.id))) await discardImage(platform.env.DB, platform.env.IMAGES, image.key)
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
    const submitted = { ...values, types: readEvidenceTypes(form) }
    const errors: Record<string, string> = {}
    const limits: Record<string, number> = { place: 500, url: 1000, provider: 300, provider_url: 1000, title: 300, author: 300, publisher: 300, year: 40, page: 80, note: 5000 }
    for (const [name, limit] of Object.entries(limits)) if (values[name]!.length > limit) errors[name] = t(locale, name === 'place' ? 'error.placeSeen' : 'error.length')
    if (!values.place && !(values.provider && (values.provider_url || values.url))) errors.place = t(locale, 'error.placeSeen')
    if (values.url && !/^https?:\/\//i.test(values.url)) errors.url = t(locale, 'error.length')
    if (values.provider_url && !/^https?:\/\//i.test(values.provider_url)) errors.provider_url = t(locale, 'error.length')
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
          return fail(500, { action: 'addEvidence', values: submitted, errors: { image: t(locale, 'error.save') } })
        }
      }
    }
    const failForm = async (status: 400, message: string) => {
      if (image) await deleteSourceImage(platform.env.IMAGES, image.key)
      return fail(status, { action: 'addEvidence', values: submitted, errors, message })
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
      return fail(500, { action: 'addEvidence', values: submitted, errors: {}, message: t(locale, 'error.save') })
    }
    redirect(303, `${localizedHref(locale, `/entry/${id}/edit`)}#evidence-${added.id}`)
  },
}
