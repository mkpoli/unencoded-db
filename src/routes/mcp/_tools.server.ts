// The tools an agent calls at /mcp. A write is put into the form the site's own pages send and goes through
// the same readers, limits and store, so a record an agent adds is checked exactly as one typed into /new.
// The tool names, schemas and result shapes follow the Model Context Protocol, revision 2025-11-25
// (https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
import { isHttpError, type RequestEvent } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { newClaimKey } from '$lib/claims'
import { parseRecordCode, recordCode } from '$lib/code'
import { DOCULECTS } from '$lib/doculects'
import { COLLECTIONS, GENRES } from '$lib/genres'
import { translate } from '$lib/i18n'
import { cleanIds, IDS_LENGTH_MAX } from '$lib/ids'
import { ADD_SIGHTINGS_MAX, BOXES_MAX, MEDIA_MAX, PICTURES_BODY_MAX } from '$lib/limits'
import { REGISTRIES } from '$lib/registries'
import { RELATION_KINDS } from '$lib/related'
import { CONTEXTS, parseSightingTypes, SCRIPTS, SIGHTING_TYPES, STYLES, VIAS_MAX } from '$lib/scripts'
import { candidates } from '$lib/server/candidates'
import { addSighting, CITATION_FIELDS, createEntry, getEntry, hasLink, list, mediaVisible, readBoxes, readEntryFields, readSightingFields, sameIds, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, SightingLimitError, SIGHTINGS_MAX } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { MAX_WRITE_BODY } from '$lib/server/body-limit'
import { MAX_IMAGE, prepareImage } from '$lib/server/image'
import { agentWriter } from '$lib/server/people'
import { storeImages, type ReadImage } from '../_submission.server'

type Json = Record<string, unknown>
export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** What a tool answers in place of a result, in words the agent can act on. */
class Refusal extends Error {}

const said = (code: string, values?: Record<string, string | number>) => translate('en', `error.${code}`, values)
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const items = (value: unknown): unknown[] => Array.isArray(value) ? value : value == null ? [] : [value]
const text = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

function choice(value: unknown, allowed: readonly string[], name: string) {
  const chosen = text(value).trim()
  if (chosen && !allowed.includes(chosen)) throw new Refusal(`${name} is one of: ${allowed.join(', ')}.`)
  return chosen
}
function link(value: unknown, name: string) {
  const address = text(value).trim()
  if (address && !/^https?:\/\//i.test(address)) throw new Refusal(`${name} must be an http or https address.`)
  return address
}
// The rows a list names by their place in it, from 1.
function places(value: unknown, count: number, name: string) {
  return items(value).map(place => {
    if (!Number.isInteger(place) || (place as number) < 1 || (place as number) > count) throw new Refusal(`${name} names rows by number, from 1 to ${count}.`)
    return place as number
  })
}

/** The id a record is named by: its number, or its code in either spelling. */
function recordId(value: unknown) {
  const named = text(value).trim()
  const id = /^[1-9]\d{0,15}$/.test(named) ? Number(named) : parseRecordCode(named)
  return id && Number.isSafeInteger(id) ? id : null
}
// A record's page without a locale opens in the reader's language.
const shown = (event: RequestEvent, id: number) => ({ id, code: recordCode(id), url: `${event.url.origin}/entry/${id}` })

// ---------- Writes ----------

async function guard(event: RequestEvent, limit: 'ADDS') {
  try { await guardWrite(event, limit) } catch (cause) {
    if (!isHttpError(cause)) throw cause
    throw new Refusal(cause.status === 403 ? said('banned') : cause.status === 503 ? said('paused') : cause.status === 429 ? said('slow') : cause.body.message)
  }
}

const OWN_PICTURE = /^\/media\/v2\/([a-f0-9]{64}\.(?:jpg|png|webp))$/
const PICTURE_WAIT = 20_000
const REDIRECTS_MAX = 3
/** The most pictures one call has the site fetch from other sites. */
export const FETCHES_MAX = 10

// What one call may still take in: bytes held in memory, and fetches from other sites.
type Budget = { bytes: number; fetches: number }

// The bytes behind a picture's address, within what the call has left. A picture this site already shows
// comes from its own store. Another site's is fetched, following a few redirects by hand so that each
// hop is counted and stays a web address.
async function pictureBytes(event: RequestEvent, address: string, budget: Budget) {
  let url: URL
  try { url = new URL(link(address, 'A picture')) } catch (cause) {
    if (cause instanceof Refusal) throw cause
    throw new Refusal(`Not a web address: ${address}`)
  }
  const limit = Math.min(MAX_IMAGE, budget.bytes)
  const large = new Refusal(`${said('tooLarge')} (${address})`)
  const failed = (status?: number) => new Refusal(`The picture could not be fetched${status ? ` (${status})` : ''}: ${address}`)
  const { DB, MEDIA } = env(event)
  const own = url.origin === event.url.origin ? OWN_PICTURE.exec(url.pathname) : null
  if (own) {
    const object = await mediaVisible(DB, own[1]) ? await MEDIA.get(own[1]) : null
    if (!object) throw new Refusal(`No picture at ${address}`)
    if (object.size > limit) throw large
    return new Uint8Array(await object.arrayBuffer())
  }
  if (budget.fetches < 1) throw new Refusal(`One call fetches up to ${FETCHES_MAX} pictures from other sites.`)
  budget.fetches--
  const signal = AbortSignal.timeout(PICTURE_WAIT)
  let response: Response
  try {
    for (let hop = 0; ; hop++) {
      response = await fetch(url, { headers: { accept: 'image/jpeg, image/png, image/webp' }, redirect: 'manual', signal })
      const next = response.status >= 300 && response.status < 400 ? response.headers.get('location') : null
      if (!next) break
      void response.body?.cancel().catch(() => {})
      url = new URL(next, url)
      if (hop >= REDIRECTS_MAX || !/^https?:$/.test(url.protocol)) throw failed(response.status)
    }
  } catch (cause) {
    throw cause instanceof Refusal ? cause : failed()
  }
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => {})
    throw failed(response.status)
  }
  if (Number(response.headers.get('content-length')) > limit) {
    void response.body.cancel().catch(() => {})
    throw large
  }
  // The header may be missing or wrong, so the body is counted as it arrives.
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { void reader.cancel().catch(() => {}); throw large }
      chunks.push(value)
    }
  } catch (cause) {
    throw cause instanceof Refusal ? cause : failed()
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
  return bytes
}

// A sighting's pictures, fetched and checked and not yet stored. No thumbnail is cut here, so each picture
// is its own cover, as it is for a form sent without scripts.
async function readPictures(event: RequestEvent, value: unknown, budget: Budget): Promise<ReadImage[]> {
  const pictures: ReadImage[] = []
  for (const item of items(value)) {
    if (pictures.length >= MEDIA_MAX) throw new Refusal(`A sighting holds up to ${MEDIA_MAX} pictures.`)
    const { url, marks } = typeof item === 'string' ? { url: item, marks: null } : record(item)
    const address = text(url).trim()
    if (!address) throw new Refusal('Each picture needs a url.')
    const bytes = await pictureBytes(event, address, budget)
    budget.bytes -= bytes.byteLength
    const image = await prepareImage(new File([bytes as BlobPart], 'picture'), MAX_IMAGE)
    if (!image) throw new Refusal(`${said('image')} (${address})`)
    const marked = items(marks).length > 0
    const box = marked ? readBoxes(JSON.stringify(marks), image.width, image.height) : null
    if (marked && !box) throw new Refusal(`marks holds up to ${BOXES_MAX} boxes, each [x, y, width, height] in pixels inside the picture and at least 4 pixels a side. This picture is ${image.width} × ${image.height}.`)
    pictures.push({ image, thumb: image, box })
  }
  return pictures
}

function sightingForm(input: Json) {
  const form = new FormData()
  const put = (name: string, value: string) => { if (value.trim()) form.set(name, value) }
  put('url', link(input.url, 'url'))
  for (const name of ['place', 'title', 'author', 'publisher', 'report_date', 'original_date', 'page', 'note']) put(name, text(input[name]))
  put('context', choice(input.context, CONTEXTS, 'context'))
  put('style', choice(input.style, STYLES, 'style'))
  for (const type of items(input.types)) form.append('types', choice(type, SIGHTING_TYPES, 'types'))
  const vias = items(input.vias).map(record)
  if (vias.length > VIAS_MAX) throw new Refusal(`A sighting names up to ${VIAS_MAX} vias.`)
  for (const via of vias) for (const field of CITATION_FIELDS) form.append(`via_${field}`, field === 'url' ? link(via.url, 'A via url') : text(via[field]))
  return form
}

// The record's own fields as /new sends them. A row of meanings, readings or related characters gets its
// key here, so a later row can name it and each row can name the sightings behind it.
function entryForm(input: Json, sightings: number) {
  const form = new FormData()
  if (text(input.script).trim()) form.set('script', text(input.script))
  for (const sequence of items(input.ids).map(text).map(cleanIds).filter(Boolean)) {
    if (!isDescription(sequence)) throw new Refusal(`Not an ideographic description sequence: ${sequence}`)
    form.append('ids', sequence)
  }
  for (const name of ['description', 'radical', 'strokes']) if (text(input[name]).trim()) form.set(name, text(input[name]))

  const rows = (value: unknown, field: string) => items(value).map(row => typeof row === 'string' ? { [field]: row } : record(row)).map(row => ({ row, key: newClaimKey() }))
  const evidence = (key: string, row: Json) => { for (const place of places(row.evidence, sightings, 'evidence')) form.append(`sightings.${key}`, String(place)) }
  const under = (key: string, value: unknown, scopes: { key: string }[], name: string) => { for (const place of places(value, scopes.length, name)) form.append(`under.${key}`, scopes[place - 1].key) }

  const meanings = rows(input.meanings, 'text'), readings = rows(input.readings, 'text'), related = rows(input.related, 'character')
  if (meanings.length) form.set('meanings_present', '1')
  for (const { row, key } of meanings) {
    form.append('meaning', text(row.text)); form.append('meaning_key', key)
    evidence(key, row)
  }
  if (readings.length) form.set('readings_present', '1')
  for (const { row, key } of readings) {
    form.append('reading', text(row.text)); form.append('reading_doculect', text(row.doculect)); form.append('reading_key', key)
    under(key, row.meanings, meanings, 'meanings')
    evidence(key, row)
  }
  if (related.length) form.set('related_characters_present', '1')
  for (const { row, key } of related) {
    form.append('related_character', text(row.character)); form.append('related_relationship', choice(row.relationship, RELATION_KINDS, 'relationship'))
    form.append('related_difference', text(row.difference)); form.append('related_evidence', text(row.basis)); form.append('related_key', key)
    under(key, row.meanings, meanings, 'meanings')
    under(key, row.readings, readings, 'readings')
    evidence(key, row)
  }

  const encodings = items(input.encodings).map(record)
  if (encodings.length) form.set('encodings_present', '1')
  for (const encoding of encodings) { form.append('encoding_charset', text(encoding.charset)); form.append('encoding_code', text(encoding.code)) }
  const ivd = text(input.ivd).trim()
  if (ivd) { form.set('ivd_status', ivd === 'none' ? 'none' : 'registered'); if (ivd !== 'none') form.set('ivd_sequence', ivd) }
  if (items(input.categories).length) form.set('genres_present', '1')
  for (const slug of items(input.categories)) form.append('genre', choice(slug, GENRES.map(genre => genre.slug), 'categories'))
  if (items(input.collections).length) form.set('collections_present', '1')
  for (const slug of items(input.collections)) form.append('collection', choice(slug, COLLECTIONS.map(collection => collection.slug), 'collections'))
  for (const tag of items(input.tags)) form.append('tags', text(tag))
  return form
}

// Everything is read and every picture fetched before anything is stored. Each sighting after the first
// takes one more add from the rate window, as it does on /new, and takes it before its pictures are
// fetched, so the window also bounds how many addresses a caller can make the site fetch.
async function addRecord(event: RequestEvent, input: Json) {
  await guard(event, 'ADDS')
  const inputs = items(input.sightings).map(record)
  if (!inputs.length) throw new Refusal('A record starts with at least one sighting.')
  if (inputs.length > ADD_SIGHTINGS_MAX) throw new Refusal(said('sightingsMax', { max: ADD_SIGHTINGS_MAX }))
  const { fields: entry, error } = readEntryFields(entryForm(input, inputs.length))
  if (error) throw new Refusal(said(error))
  const stated = inputs.map((sighting, index) => {
    const fields = readSightingFields(sightingForm(sighting))
    if (!items(sighting.pictures).length && !hasLink(fields)) throw new Refusal(`Sighting ${index + 1}: ${said('evidence')}`)
    return { fields, pictures: sighting.pictures }
  })
  if (!(await chargeWrites(event, 'ADDS', stated.length - 1))) throw new Refusal(said('slow'))
  const budget = { bytes: PICTURES_BODY_MAX, fetches: FETCHES_MAX }
  const read = []
  for (const { fields, pictures } of stated) read.push({ fields, pictures: await readPictures(event, pictures, budget) })
  const { DB, MEDIA } = env(event)
  const drafts = []
  for (const { fields, pictures } of read) drafts.push({ fields, media: await storeImages(MEDIA, pictures) })
  const person = await agentWriter(event, DB)
  const id = await createEntry(DB, entry, drafts[0].fields, drafts[0].media, { actor: person.id, ip: await ipHash(event) }, drafts.slice(1))
  return shown(event, id)
}

async function addSightingTo(event: RequestEvent, input: Json) {
  await guard(event, 'ADDS')
  const id = recordId(input.record)
  const { DB, MEDIA } = env(event)
  const found = id ? await getEntry(DB, id) : null
  if (!id || !found || found.entry.hidden_at) throw new Refusal(said('missing'))
  if (found.entry.merged_into) throw new Refusal(`${said('merged')} Add to ${recordCode(found.entry.merged_into)} (${found.entry.merged_into}).`)
  if (found.sightings.length >= SIGHTINGS_MAX) throw new Refusal(said('sightingLimit'))
  const fields = readSightingFields(sightingForm(input))
  if (!items(input.pictures).length && !hasLink(fields)) throw new Refusal(said('evidence'))
  // One sighting takes what its form takes in one request.
  const pictures = await readPictures(event, input.pictures, { bytes: MAX_WRITE_BODY, fetches: FETCHES_MAX })
  const media = await storeImages(MEDIA, pictures)
  const person = await agentWriter(event, DB)
  let sighting: number | null
  try { sighting = await addSighting(DB, id, fields, media, { actor: person.id, ip: await ipHash(event) }) } catch (cause) {
    if (cause instanceof SightingLimitError) throw new Refusal(said('sightingLimit'))
    throw cause
  }
  if (!sighting) throw new Refusal(said('missing'))
  return { record: shown(event, id), sighting }
}

// ---------- Reads ----------

const SEARCH_PAGE = 20
const SEARCH_PAGE_MAX = 50

async function searchRecords(event: RequestEvent, input: Json) {
  const limit = Number.isInteger(input.limit) ? Math.min(Math.max(input.limit as number, 1), SEARCH_PAGE_MAX) : SEARCH_PAGE
  const page = await list(env(event).DB, { query: text(input.query).trim(), after: text(input.after) || null, limit })
  if (!page) throw new Refusal(`Search for one description sequence, or up to ${SEARCH_TERMS_MAX} words or characters, in at most ${SEARCH_LENGTH_MAX} characters.`)
  return {
    records: page.tiles.map(tile => ({ ...shown(event, tile.id), ids: tile.ids, status: tile.status, sightings: tile.sightings, first_year: tile.firstYear, registered_in: tile.marks })),
    next: page.next,
  }
}

async function findSimilar(event: RequestEvent, input: Json) {
  const ids = cleanIds(text(input.ids))
  if (!ids || ids.length > IDS_LENGTH_MAX) throw new Refusal(`ids is a description sequence of at most ${IDS_LENGTH_MAX} characters.`)
  const { DB } = env(event)
  const [same, near] = await Promise.all([sameIds(DB, ids), candidates(DB, ids)])
  const exact = new Set(same.map(found => found.id))
  const brief = (found: { id: number; ids: string | null }) => ({ ...shown(event, found.id), ids: found.ids })
  return { same: same.map(brief), similar: near.filter(found => !exact.has(found.id)).map(brief) }
}

async function getRecord(event: RequestEvent, input: Json) {
  const id = recordId(input.record)
  const found = id ? await getEntry(env(event).DB, id) : null
  if (!id || !found || found.entry.hidden_at) throw new Refusal(said('missing'))
  const { entry } = found
  if (entry.merged_into) return { ...shown(event, id), merged_into: shown(event, entry.merged_into) }
  const sightings = found.sightings.filter(sighting => !sighting.hidden_at)
  const visible = new Set(sightings.map(sighting => sighting.id))
  return {
    ...shown(event, id),
    script: entry.script === 'other' ? entry.script_other ?? 'other' : entry.script,
    status: entry.status, description: entry.description, radical: entry.radical, strokes: entry.strokes,
    claims: found.claims.map(claim => ({ key: claim.key, kind: claim.kind, value: claim.value, ...(claim.data ? { data: claim.data } : {}), ...(claim.under.length ? { under: claim.under } : {}), evidence: claim.sightings.filter(sighting => visible.has(sighting)) })),
    sightings: sightings.map(sighting => ({
      id: sighting.id, place: sighting.place,
      ...Object.fromEntries(CITATION_FIELDS.map(field => [field, sighting[field]])),
      original_date: sighting.original_date, page: sighting.page, context: sighting.context, style: sighting.style, types: parseSightingTypes(sighting.types), note: sighting.note,
      vias: sighting.vias.map(({ id: _, ...via }) => via),
      pictures: sighting.media.map(picture => ({ url: `${event.url.origin}/media/v2/${picture.image_key}`, width: picture.image_w, height: picture.image_h, marks: picture.box ? JSON.parse(picture.box) as number[][] : [] })),
    })),
  }
}

// ---------- What the agent is told ----------

export const INSTRUCTIONS = `珍字集覽 (Rare Character Compendium) records rare characters of the Han script and the scripts around it, each with the evidence of where it was seen. A record is one written form. A sighting is one place the form was seen: its citation and its pictures.

To add a character:
1. Read the form from the evidence picture and write it as an ideographic description sequence (IDS), such as ⿰山東. A code point or a description given by whoever reported the character is a claim to check against the picture.
2. Call find_similar_records with the IDS and compare the pictures of what comes back. When a record shows the same form, call add_sighting on it. Otherwise call add_record.
3. Cite the work the character appears in as the sighting's source, with author, title, publisher, date and page. Cite where you found it, such as a post or a chat message that shows the page, as a via, with its author, date and link.

Record every attested form, whether or not Unicode encodes it; an encoded character takes an encoding with charset "unicode". State only the readings, meanings and relations the evidence gives.`

const CITATION = {
  url: { type: 'string', description: 'Web address, http or https.' },
  title: { type: 'string' },
  author: { type: 'string', description: 'The author as they sign: a name or a handle.' },
  publisher: { type: 'string', description: 'The publisher, or the service a post is on, such as X.' },
  report_date: { type: 'string', description: 'When it was published: a year or a date, such as 1936 or 2026-11-14.' },
}

const SIGHTING = {
  place: { type: 'string', description: 'Where the character was found, in words that help someone find it again: a book and page, a street, a website.' },
  ...CITATION,
  original_date: { type: 'string', description: 'The date of an older work shown in the picture, when the cited publication reproduces one.' },
  page: { type: 'string', description: 'Page, folio or volume within the work.' },
  context: { type: 'string', enum: CONTEXTS, description: 'How the character appears.' },
  style: { type: 'string', enum: STYLES, description: 'The writing style.' },
  types: { type: 'array', items: { type: 'string', enum: SIGHTING_TYPES }, description: 'What the source provides: mention (discusses the character), attestation (uses it in a text), description (says how it is written), definition (gives a meaning), reading (gives a pronunciation), relation (names a variant or the same character).' },
  note: { type: 'string', description: 'A note on this source.' },
  vias: { type: 'array', maxItems: VIAS_MAX, description: 'The sources the evidence passed through, from the one nearest the cited work to the one you saw it in.', items: { type: 'object', properties: CITATION } },
  pictures: {
    type: 'array', maxItems: MEDIA_MAX, description: `Evidence pictures, fetched from their addresses and kept by the site. JPEG, PNG or WebP, up to ${FETCHES_MAX} from other sites in one call.`,
    items: {
      type: 'object', required: ['url'],
      properties: {
        url: { type: 'string', description: 'Address of the image file itself.' },
        marks: { type: 'array', maxItems: BOXES_MAX, description: 'Boxes around the character, each [x, y, width, height] in pixels of the picture.', items: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 } },
      },
    },
  },
}
const SIGHTING_RULE = 'A sighting needs a picture or a link.'
const EVIDENCE = { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The sightings that support this, by their place in `sightings`, from 1.' }
const RECORD = { type: 'string', description: 'A record: its id, or its code such as R+00A1.' }

type Tool = { name: string; title: string; description: string; inputSchema: Json; annotations: Json; run: (event: RequestEvent, input: Json) => Promise<unknown> }
const READS = { readOnlyHint: true }
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false }

const TOOLS: Tool[] = [
  {
    name: 'find_similar_records', title: 'Find records of a form', annotations: READS, run: findSimilar,
    description: 'The records that may show the same form as a description sequence: `same` are described by exactly this sequence, `similar` share the most parts with it. Call this before adding a character.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'string', description: 'An ideographic description sequence, such as ⿰山東.' } } },
  },
  {
    name: 'search_records', title: 'Search records', annotations: READS, run: searchRecords,
    description: 'Records found by a description sequence, an encoded character, or words from their readings, meanings, tags and sources. Without a query, every record, those with the most evidence first.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: SEARCH_PAGE_MAX, default: SEARCH_PAGE },
      after: { type: 'string', description: 'The `next` of an earlier answer, for the records after it.' },
    } },
  },
  {
    name: 'get_record', title: 'Read a record', annotations: READS, run: getRecord,
    description: 'A record with its claims (descriptions, readings, meanings, codes, relations) and its sightings, each with its citation and picture addresses.',
    inputSchema: { type: 'object', required: ['record'], properties: { record: RECORD } },
  },
  {
    name: 'add_record', title: 'Add a character', annotations: ADDS, run: addRecord,
    description: `Add a record for a form no record shows yet, with the sightings it starts from. ${SIGHTING_RULE} Answers the new record's id, code and page.`,
    inputSchema: { type: 'object', required: ['ids', 'sightings'], properties: {
      script: { type: 'string', description: `The script: one of ${SCRIPTS.map(script => script.id).filter(id => id !== 'other').join(', ')}, or another script's name. Han when left out.` },
      ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Ideographic description sequences of the form as the picture shows it. The first one draws the glyph; the others are further ways to describe the same form.' },
      description: { type: 'string', description: 'What is notable about the form, in prose.' },
      radical: { type: 'string', description: 'The radical, when the source states one.' },
      strokes: { type: 'integer', minimum: 0, description: 'Total strokes.' },
      meanings: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, evidence: EVIDENCE } } },
      readings: { type: 'array', items: { type: 'object', required: ['text'], properties: {
        text: { type: 'string' },
        doculect: { type: 'string', description: `The language or dialect: one of ${DOCULECTS.join(', ')}, or another name.` },
        meanings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The meanings this reading goes with, by their place in `meanings`, from 1.' },
        evidence: EVIDENCE,
      } } },
      encodings: { type: 'array', description: 'The character sets, dictionaries and glyph registries that hold the character.', items: { type: 'object', required: ['charset', 'code'], properties: {
        charset: { type: 'string', description: `One of ${REGISTRIES.map(registry => registry.id).join(', ')}, or another work's name.` },
        code: { type: 'string', description: 'The code as the work writes it, such as U+2D6DD for unicode.' },
      } } },
      related: { type: 'array', items: { type: 'object', required: ['character', 'relationship'], properties: {
        character: { type: 'string', description: 'The other character, or its description sequence.' },
        relationship: { type: 'string', enum: RELATION_KINDS },
        difference: { type: 'string', description: 'How the two forms differ.' },
        basis: { type: 'string', description: 'The evidence or source for the relation, in words.' },
        meanings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The meanings under which the relation holds, by their place in `meanings`.' },
        readings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The readings under which the relation holds, by their place in `readings`.' },
        evidence: EVIDENCE,
      } } },
      ivd: { type: 'string', description: 'A registered IVD sequence such as "U+4E00 U+E0100", or "none" when the form is known to have none.' },
      categories: { type: 'array', items: { type: 'string', enum: GENRES.map(genre => genre.slug) } },
      collections: { type: 'array', items: { type: 'string', enum: COLLECTIONS.map(collection => collection.slug) } },
      tags: { type: 'array', items: { type: 'string' } },
      sightings: { type: 'array', minItems: 1, maxItems: ADD_SIGHTINGS_MAX, items: { type: 'object', properties: SIGHTING } },
    } },
  },
  {
    name: 'add_sighting', title: 'Add evidence to a record', annotations: ADDS, run: addSightingTo,
    description: `Add one more place a recorded form was seen. ${SIGHTING_RULE} Answers the record and the new sighting's id.`,
    inputSchema: { type: 'object', required: ['record'], properties: { record: RECORD, ...SIGHTING } },
  },
]

export const toolList = () => TOOLS.map(({ run: _, ...tool }) => tool)

/** What a tool answers, or null for a name that is no tool. */
export async function callTool(event: RequestEvent, name: unknown, input: unknown): Promise<ToolResult | null> {
  const tool = TOOLS.find(tool => tool.name === name)
  if (!tool) return null
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await tool.run(event, record(input))) }] }
  } catch (cause) {
    if (cause instanceof Refusal) return { content: [{ type: 'text', text: cause.message }], isError: true }
    throw cause
  }
}
