import { quotations, QUOTATIONS_MAX } from '$lib/quotations'
import { readDates, sightingDates } from '$lib/server/date-readings'
// The tools an agent calls at /mcp. A write is put into the form the site's own pages send and goes through
// the same readers, limits and store, so a record an agent adds is checked exactly as one typed into /new.
// The tool names, schemas and result shapes follow the Model Context Protocol, revision 2025-11-25
// (https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
import { isHttpError, type RequestEvent } from '@sveltejs/kit'
import { isDescription } from 'ids-input'
import { creatorKey, newClaimKey, type Claim, type ClaimKind } from '$lib/claims'
import { parseRecordCode, recordCode } from '$lib/code'
import { DOCULECTS } from '$lib/doculects'
import { COLLECTIONS } from '$lib/tags'
import { translate } from '$lib/i18n'
import { cleanIds, IDS_LENGTH_MAX } from '$lib/ids'
import { ADD_SIGHTINGS_MAX, BOXES_MAX, MEDIA_MAX, PICTURES_BODY_MAX } from '$lib/limits'
import { REGISTRIES } from '$lib/registries'
import { RELATION_KINDS } from '$lib/related'
import { CONTEXTS, parseContexts, parseSightingTypes, SCRIPTS, SIGHTING_TYPES, SOURCE_KINDS, STYLES, VIAS_MAX } from '$lib/scripts'
import { candidates } from '$lib/server/candidates'
import { tagList } from '$lib/server/tags'
import { addSighting, CITATION_FIELDS, citesEvidence, createEntry, editEntry, editSighting, getEntry, heldPictures, list, mediaVisible, namedVias, readBoxes, readEntryFields, readSightingFields, sameIds, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, SightingLimitError, SIGHTINGS_MAX, viaKey, viaRows, type StoredImage, type ViaPicture } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { scheduleAtlasSync } from '$lib/server/atlas-evidence'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { MAX_WRITE_BODY } from '$lib/server/body-limit'
import { MAX_IMAGE, prepareImage, sniff } from '$lib/server/image'
import { pagesOf } from '$lib/pdf-pages'
import { heavyJpx, isPdf, JPX_PIXELS, PDF_SIDE, renderPdfPage } from '$lib/server/pdf'
import { AGENT_NAME_MAX, agentWriter, cleanAgentName, type AgentSaid } from '$lib/server/people'
import { described, storeImages, type ReadImage } from '../_submission.server'

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
const shownPicture = (event: RequestEvent, picture: ViaPicture) => ({ url: `${event.url.origin}/media/v2/${picture.image_key}`, width: picture.image_w, height: picture.image_h })
const shown = (event: RequestEvent, id: number) => ({ id, code: recordCode(id), url: `${event.url.origin}/entry/${id}` })

// ---------- Writes ----------

async function guard(event: RequestEvent, limit: 'ADDS' | 'EDITS') {
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
/** The most PDF pages one call has the site draw; each takes about a second of the request's time. */
export const PDF_PAGES_MAX = 4

// What one call may still take in: bytes held in memory, and fetches from other sites.
/** The last page a range may name; whether the file has the page is known once it is opened. */
const PDF_PAGE_LAST = 99_999
type Budget = { bytes: number; fetches: number; pages?: number; seen?: Map<string, ReadImage['image']> }

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
  // Wikimedia and the National Archives of Japan refuse a request that does not say who sends it.
  const headers = { accept: 'image/jpeg, image/png, image/webp, application/pdf', 'user-agent': `GlyphAtlasRare/1.0 (+${event.url.origin}/mcp)` }
  let response: Response
  try {
    for (let hop = 0; ; hop++) {
      response = await fetch(url, { headers, redirect: 'manual', signal })
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
  const pictures = pictureItems(value)
  const read: ReadImage[] = []
  for (const picture of pictures) read.push(await readPicture(event, picture, budget))
  return read
}

// The pictures each via sends, as addresses; undefined for a via that sends none. A picture shows a source,
// so a via with pictures needs a citation, and a picture belongs to one via of the chain, which shares one
// allowance. Nothing is fetched here.
function viaPictureItems(vias: readonly Json[], form: FormData) {
  const named = namedVias(form)
  const given = new Set<string>()
  const rows = vias.map((via, index) => {
    if (via.pictures === undefined) return undefined
    const own = new Set<string>()
    for (const item of items(via.pictures)) {
      const picture = typeof item === 'string' ? { url: item } : record(item)
      if (picture.marks !== undefined) throw new Refusal('The pictures of a via take no marks.')
      const address = text(picture.url).trim()
      if (!address) throw new Refusal('Each picture needs a url.')
      own.add(address)
    }
    if (own.size && !named[index]) throw new Refusal(said('viaSourceAt', { position: index + 1 }))
    for (const address of own) {
      if (given.has(address)) throw new Refusal(said('viaPictureTwice'))
      given.add(address)
    }
    return [...own]
  })
  if (given.size > MEDIA_MAX) throw new Refusal(said('viaPictureCount', { most: MEDIA_MAX }))
  return rows
}

// The address of a picture this site holds, as its key.
function ownKey(event: RequestEvent, address: string) {
  let url: URL | null = null
  try { url = new URL(address) } catch { /* refused when it is read */ }
  return url?.origin === event.url.origin ? OWN_PICTURE.exec(url.pathname)?.[1] : undefined
}

type PlannedVia = ({ address: string; kept?: ViaPicture }[] | undefined)[]
// Each address as the picture `held` keeps it, which needs no fetch, or as one to fetch. A picture held
// twice in a via counts once and is refused in two.
function planViaPictures(event: RequestEvent, rows: ReturnType<typeof viaPictureItems>, held: ReadonlyMap<string, ViaPicture> = new Map()): PlannedVia {
  const owner = new Map<string, number>()
  return rows.map((row, index) => row?.flatMap(address => {
    const key = ownKey(event, address)
    const kept = key ? held.get(key) : undefined
    if (!kept) return [{ address }]
    if (owner.get(kept.image_key) === index) return []
    if (owner.has(kept.image_key)) throw new Refusal(said('viaPictureTwice'))
    owner.set(kept.image_key, index)
    return [{ address, kept }]
  }))
}

// The pictures of each via, fetched and not yet stored; those of `planned` that are kept are not fetched, and
// the fetched are in `files`.
async function readViaPictures(event: RequestEvent, planned: PlannedVia, budget: Budget) {
  const files: ReadImage[] = []
  const owner = new Map(planned.flatMap((row, index) => (row ?? []).flatMap(({ kept }) => kept ? [[kept.image_key, index] as const] : [])))
  const pictures: (ViaPicture[] | undefined)[] = []
  for (const [index, row] of planned.entries()) {
    if (!row) { pictures.push(undefined); continue }
    const own: ViaPicture[] = []
    for (const { address, kept } of row) {
      if (kept) { own.push(kept); continue }
      const read = await readPicture(event, { address, marks: undefined }, budget)
      const picture = described(read)
      if (own.some(held => held.image_key === picture.image_key)) continue
      if (owner.has(picture.image_key) && owner.get(picture.image_key) !== index) throw new Refusal(said('viaPictureTwice'))
      owner.set(picture.image_key, index)
      files.push(read)
      own.push(picture)
    }
    pictures.push(own)
  }
  return { pictures, files }
}

function pictureItems(value: unknown) {
  const asked = items(value).map(item => typeof item === 'string' ? { url: item } : record(item))
  // A picture that names several pages of a PDF stands for one picture a page.
  const pictures = asked.flatMap(({ url, marks, page, pages }) => {
    const address = text(url).trim()
    if (!address) throw new Refusal('Each picture needs a url.')
    if (page !== undefined && !(Number.isInteger(page) && (page as number) >= 1)) throw new Refusal('page is a whole number counted from 1.')
    if (pages === undefined) return [{ address, marks, page: page as number | undefined }]
    if (page !== undefined) throw new Refusal('Give page or pages, not both.')
    const named = pagesOf(text(pages), PDF_PAGE_LAST)
    if (!named) throw new Refusal('pages names pages counted from 1, such as "3", "2-4" or "1, 5-6".')
    if (named.length > 1 && items(marks).length) throw new Refusal('marks belong to one page: give each marked page as a picture of its own.')
    return named.map(each => ({ address, marks, page: each as number | undefined }))
  })
  if (pictures.length > MEDIA_MAX) throw new Refusal(`A sighting holds up to ${MEDIA_MAX} pictures.`)
  return pictures
}

// What the caller says it is. Either part may be left out, and a change is an agent's all the same.
function agentSaid(input: Json): AgentSaid {
  const said = input.agent === undefined ? {} : record(input.agent)
  const part = (value: unknown, field: string) => {
    if (value === undefined || value === null || value === '') return null
    const name = cleanAgentName(value)
    if (!name) throw new Refusal(`agent.${field} is a name of up to ${AGENT_NAME_MAX} characters.`)
    return name
  }
  return { harness: part(said.harness, 'harness'), model: part(said.model, 'model') }
}

// The marks of one picture, or null for none.
function marksOn(marks: unknown, width: number, height: number) {
  if (!items(marks).length) return null
  const box = readBoxes(JSON.stringify(marks), width, height)
  if (!box) throw new Refusal(`marks holds up to ${BOXES_MAX} boxes, each [x, y, width, height] in pixels inside the picture and at least 4 pixels a side. This picture is ${width} × ${height}.`)
  return box
}

async function readPicture(event: RequestEvent, { address, marks, page }: { address: string; marks: unknown; page?: number }, budget: Budget): Promise<ReadImage> {
  // An address asked twice in one call is fetched once; a PDF, once for each page asked.
  const asked = `${page ?? ''} ${address}`
  let image = budget.seen?.get(asked)
  if (!image) {
    let bytes: Uint8Array = await pictureBytes(event, address, budget)
    budget.bytes -= bytes.byteLength
    // An image is told by its own first bytes before anything in it is read as a PDF's header.
    if (!sniff(bytes) && isPdf(bytes)) {
      budget.pages ??= PDF_PAGES_MAX
      if (budget.pages < 1) throw new Refusal(`One call draws up to ${PDF_PAGES_MAX} PDF pages.`)
      const jpx = heavyJpx(bytes)
      if (jpx) throw new Refusal(`This PDF holds a JPEG 2000 image of ${jpx.width} × ${jpx.height} pixels, more than the site can draw (${JPX_PIXELS / 1e6} megapixels). Give a JPEG or PNG of the page instead: ${address}`)
      budget.pages--
      // The page is drawn here and kept as a picture; the PDF itself is not kept.
      const drawn = await renderPdfPage(bytes, page ?? 1)
      if (!drawn) throw new Refusal(`Page ${page ?? 1} of this PDF could not be drawn: ${address}`)
      bytes = drawn.bytes
    } else if (page !== undefined) throw new Refusal(`page is for a PDF, and this address is not one: ${address}`)
    image = await prepareImage(new File([bytes as BlobPart], 'picture'), MAX_IMAGE) ?? undefined
    if (!image) throw new Refusal(`${said('image')} (${address})`)
    ;(budget.seen ??= new Map()).set(asked, image)
  }
  return { image, thumb: image, box: marksOn(marks, image.width, image.height) }
}

function sightingForm(input: Json) {
  const form = new FormData()
  const put = (name: string, value: string) => { if (value.trim()) form.set(name, value) }
  put('url', link(input.url, 'url'))
  for (const name of ['place', 'title', 'author', 'publisher', 'report_date', 'container', 'original_date', 'page', 'note']) put(name, text(input[name]))
  put('source_kind', choice(input.source_kind, SOURCE_KINDS, 'source_kind'))
  put('style', choice(input.style, STYLES, 'style'))
  for (const context of items(input.contexts)) form.append('contexts', choice(context, CONTEXTS, 'contexts'))
  for (const type of items(input.types)) form.append('types', choice(type, SIGHTING_TYPES, 'types'))
  const quotes = items(input.quotes)
  if (quotes.length > QUOTATIONS_MAX) throw new Refusal(`A sighting quotes up to ${QUOTATIONS_MAX} passages.`)
  for (const item of quotes) {
    const quote = record(item)
    form.append('quote_text', text(quote.text))
    form.append('quote_locator', text(quote.locator))
  }
  const vias = items(input.vias).map(record)
  if (vias.length > VIAS_MAX) throw new Refusal(`A sighting names up to ${VIAS_MAX} vias.`)
  for (const via of vias) {
    for (const field of CITATION_FIELDS) form.append(`via_${field}`, field === 'url' ? link(via.url, 'A via url') : field === 'source_kind' ? choice(via.source_kind, SOURCE_KINDS, 'A via source_kind') : text(via[field]))
    form.append('via_quote', text(via.quote))
  }
  return form
}

// The record's own fields as its form sends them. A field the input leaves out is left out of the form, so
// an edit keeps it; a list the input gives replaces the record's. A row of meanings, readings, creators or related
// characters keeps the key of the claim it names by `key`, or gets a new one, so a later row can name it and
// each row can name the sightings behind it. `cite` reads the sightings a row names; a row that names none
// keeps those of the claim it continues.
function entryForm(input: Json, tags: readonly string[], cite: (value: unknown) => number[], current: readonly Claim[] = []) {
  const form = new FormData()
  const given = (name: string) => input[name] !== undefined
  if (text(input.script).trim()) form.set('script', text(input.script))
  if (given('ids')) {
    const sequences = items(input.ids).map(text).map(cleanIds).filter(Boolean)
    if (!sequences.length) throw new Refusal('ids holds at least one description sequence.')
    for (const sequence of sequences) {
      if (!isDescription(sequence)) throw new Refusal(`Not an ideographic description sequence: ${sequence}`)
      form.append('ids', sequence)
    }
  }
  for (const name of ['description', 'radical', 'strokes']) if (given(name)) form.set(name, text(input[name]))

  const held = new Map(current.map(claim => [claim.key, claim]))
  const taken = new Set<string>()
  // A row without a key continues the claim it repeats word for word, compared as the claims store text.
  const same = (value: unknown) => text(value).normalize('NFC').trim()
  const repeats = (kind: ClaimKind, row: Json) => (claim: Claim) => claim.kind === kind && !taken.has(claim.key) && (
    kind === 'relation' ? claim.value === same(row.character) && claim.data?.relationship === same(row.relationship)
    : kind === 'creator' ? creatorKey(claim.value) === creatorKey(same(row.name))
    : claim.value === same(row.text) && (kind !== 'reading' || (claim.data?.doculect ?? '') === same(row.doculect)))
  const rows = (value: unknown, field: string, kind: ClaimKind) => items(value).map(row => typeof row === 'string' ? { [field]: row } : record(row)).map(row => {
    const named = held.get(text(row.key))
    const kept = named?.kind === kind && !taken.has(named.key) ? named : row.key === undefined ? current.find(repeats(kind, row)) : undefined
    if (kept) taken.add(kept.key)
    return { row, key: kept?.key ?? newClaimKey(), kept }
  })
  const evidence = (key: string, row: Json, kept?: Claim) => {
    for (const sighting of row.evidence !== undefined ? cite(row.evidence) : kept?.sightings ?? []) form.append(`sightings.${key}`, String(sighting))
  }
  const under = (key: string, value: unknown, scopes: { key: string }[], name: string, kind: ClaimKind, kept?: Claim) => {
    const named = value !== undefined ? places(value, scopes.length, name).map(place => scopes[place - 1].key) : kept?.under.filter(scope => held.get(scope)?.kind === kind) ?? []
    for (const scope of named) form.append(`under.${key}`, scope)
  }

  const meanings = rows(input.meanings, 'text', 'meaning'), readings = rows(input.readings, 'text', 'reading'), related = rows(input.related, 'character', 'relation')
  if (given('meanings')) form.set('meanings_present', '1')
  for (const { row, key, kept } of meanings) {
    form.append('meaning', text(row.text)); form.append('meaning_key', key)
    evidence(key, row, kept)
  }
  if (given('readings')) form.set('readings_present', '1')
  for (const { row, key, kept } of readings) {
    form.append('reading', text(row.text)); form.append('reading_doculect', text(row.doculect)); form.append('reading_key', key)
    under(key, row.meanings, meanings, 'meanings', 'meaning', kept)
    evidence(key, row, kept)
  }
  if (given('related')) form.set('related_characters_present', '1')
  for (const { row, key, kept } of related) {
    form.append('related_character', text(row.character)); form.append('related_relationship', choice(row.relationship, RELATION_KINDS, 'relationship'))
    form.append('related_difference', text(row.difference)); form.append('related_evidence', text(row.basis)); form.append('related_key', key)
    under(key, row.meanings, meanings, 'meanings', 'meaning', kept)
    under(key, row.readings, readings, 'readings', 'reading', kept)
    evidence(key, row, kept)
  }

  if (given('creators')) form.set('creators_present', '1')
  for (const { row, key, kept } of rows(input.creators, 'name', 'creator')) {
    form.append('creator', text(row.name)); form.append('creator_key', key)
    evidence(key, row, kept)
  }

  if (given('encodings')) form.set('encodings_present', '1')
  for (const encoding of items(input.encodings).map(record)) { form.append('encoding_charset', text(encoding.charset)); form.append('encoding_code', text(encoding.code)) }
  if (given('ivd')) {
    const ivd = text(input.ivd).trim()
    form.set('ivd_status', !ivd ? '' : ivd === 'none' ? 'none' : 'registered')
    if (ivd && ivd !== 'none') form.set('ivd_sequence', ivd)
  }
  if (given('categories') || given('tags')) form.set('tags_present', '1')
  for (const slug of items(input.categories)) form.append('tag', choice(slug, tags, 'categories'))
  for (const tag of items(input.tags)) form.append('tags', text(tag))
  if (given('collections')) form.set('collections_present', '1')
  for (const slug of items(input.collections)) form.append('collection', choice(slug, COLLECTIONS.map(collection => collection.slug), 'collections'))
  return form
}

// A record a write names, refused when it is missing, hidden or merged into another.
async function openRecord(event: RequestEvent, named: unknown) {
  const id = recordId(named)
  const found = id ? await getEntry(env(event).DB, id) : null
  if (!id || !found || found.entry.hidden_at) throw new Refusal(said('missing'))
  if (found.entry.merged_into) throw new Refusal(`${said('merged')} Write to ${recordCode(found.entry.merged_into)} (${found.entry.merged_into}).`)
  return { id, found }
}

// The revision an edit is made against: the one get_record answered.
function revisionOf(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Refusal('rev is the revision get_record answered.')
  return value as number
}
const changed = (current: number) => new Refusal(`It changed after you read it and is now at rev ${current}. Read it again with get_record and make the edit on that.`)
const summaryOf = (input: Json) => text(input.summary).trim().slice(0, 500) || null

// Everything is read and every picture fetched before anything is stored. Each sighting after the first
// takes one more add from the rate window, as it does on /new, and takes it before its pictures are
// fetched, so the window also bounds how many addresses a caller can make the site fetch.
async function addRecord(event: RequestEvent, input: Json) {
  await guard(event, 'ADDS')
  const inputs = items(input.sightings).map(record)
  if (!inputs.length) throw new Refusal('A record starts with at least one sighting.')
  if (inputs.length > ADD_SIGHTINGS_MAX) throw new Refusal(said('sightingsMax', { max: ADD_SIGHTINGS_MAX }))
  const tags = await tagList(env(event).DB)
  const { fields: entry, error } = readEntryFields(entryForm(input, tags.map(tag => tag.name), value => places(value, inputs.length, 'evidence')), tags)
  if (error) throw new Refusal(said(error))
  const stated = inputs.map((sighting, index) => {
    const form = sightingForm(sighting)
    const vias = viaPictureItems(items(sighting.vias).map(record), form)
    if (!items(sighting.pictures).length && !vias.some(row => row?.length) && !citesEvidence(readSightingFields(form))) throw new Refusal(`Sighting ${index + 1}: ${said('evidence')}`)
    return { form, vias, pictures: sighting.pictures }
  })
  if (!(await chargeWrites(event, 'ADDS', stated.length - 1))) throw new Refusal(said('slow'))
  const budget = { bytes: PICTURES_BODY_MAX, fetches: FETCHES_MAX }
  const read = []
  for (const { form, vias, pictures } of stated) {
    const own = await readPictures(event, pictures, budget)
    const via = await readViaPictures(event, planViaPictures(event, vias), budget)
    read.push({ fields: readSightingFields(form, via.pictures.map(row => row ?? [])), pictures: own, files: via.files })
  }
  const { DB, MEDIA } = env(event)
  const drafts = []
  for (const { fields, pictures, files } of read) {
    await storeImages(MEDIA, files)
    drafts.push({ fields, media: await storeImages(MEDIA, pictures) })
  }
  const person = await agentWriter(event, DB, agentSaid(input))
  const id = await createEntry(DB, entry, drafts[0].fields, drafts[0].media, { actor: person.id, ip: await ipHash(event) }, drafts.slice(1))
  notifyIndexNow(event, { entries: [id] })
  scheduleAtlasSync(event, [id])
  return shown(event, id)
}

async function addSightingTo(event: RequestEvent, input: Json) {
  await guard(event, 'ADDS')
  const { id, found } = await openRecord(event, input.record)
  const { DB, MEDIA } = env(event)
  if (found.sightings.length >= SIGHTINGS_MAX) throw new Refusal(said('sightingLimit'))
  const form = sightingForm(input)
  const vias = viaPictureItems(items(input.vias).map(record), form)
  if (!items(input.pictures).length && !vias.some(row => row?.length) && !citesEvidence(readSightingFields(form))) throw new Refusal(said('evidence'))
  // One sighting takes what its form takes in one request, its pictures and those of its vias together.
  const budget = { bytes: MAX_WRITE_BODY, fetches: FETCHES_MAX }
  const pictures = await readPictures(event, input.pictures, budget)
  const via = await readViaPictures(event, planViaPictures(event, vias), budget)
  const fields = readSightingFields(form, via.pictures.map(row => row ?? []))
  await storeImages(MEDIA, via.files)
  const media = await storeImages(MEDIA, pictures)
  const person = await agentWriter(event, DB, agentSaid(input))
  let sighting: number | null
  try { sighting = await addSighting(DB, id, fields, media, { actor: person.id, ip: await ipHash(event) }) } catch (cause) {
    if (cause instanceof SightingLimitError) throw new Refusal(said('sightingLimit'))
    throw cause
  }
  if (!sighting) throw new Refusal(said('missing'))
  notifyIndexNow(event, { entries: [id] })
  return { record: shown(event, id), sighting }
}

// Like the record's edit form: what the input leaves out stays, and the edit is made against the
// revision the agent read.
async function editRecordOf(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const { id, found } = await openRecord(event, input.record)
  const rev = revisionOf(input.rev)
  if (rev !== found.entry.rev) throw changed(found.entry.rev)
  const own = found.sightings.filter(sighting => !sighting.hidden_at).map(sighting => sighting.id)
  const cite = (value: unknown) => items(value).map(sighting => {
    if (!own.includes(sighting as number)) throw new Refusal(`evidence names this record's sightings by id: ${own.join(', ')}.`)
    return sighting as number
  })
  const { DB } = env(event)
  const tags = await tagList(DB)
  const { fields, error } = readEntryFields(entryForm(input, tags.map(tag => tag.name), cite, found.claims), tags, { ...found.entry, claims: found.claims })
  if (error) throw new Refusal(said(error))
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await editEntry(DB, id, rev, fields, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (!result.ok) throw result.code === 'conflict' ? changed((await getEntry(DB, id))?.entry.rev ?? rev) : new Refusal(said(result.code))
  notifyIndexNow(event, { entries: [id] })
  scheduleAtlasSync(event, [id], { onlyIfChanged: true })
  return { record: shown(event, id), rev: result.rev }
}

// Like the sighting's edit form. Given pictures are the whole list: a picture the sighting holds is named
// by its address and kept, with new marks when they are given; any other is fetched as add_sighting does.
async function editSightingOf(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const { id, found } = await openRecord(event, input.record)
  const sighting = found.sightings.find(sighting => sighting.id === Number(text(input.sighting)) && !sighting.hidden_at)
  if (!sighting) throw new Refusal(`${recordCode(id)} has no sighting ${text(input.sighting)}. Its sightings: ${found.sightings.filter(sighting => !sighting.hidden_at).map(sighting => sighting.id).join(', ')}.`)
  const rev = revisionOf(input.rev)
  if (rev !== sighting.rev) throw changed(sighting.rev)
  const now: Json = {
    place: sighting.place, ...Object.fromEntries(CITATION_FIELDS.map(field => [field, sighting[field]])),
    original_date: sighting.original_date, page: sighting.page, contexts: parseContexts(sighting.contexts), style: sighting.style, types: parseSightingTypes(sighting.types), note: sighting.note,
    quotes: quotations(sighting.quotes), vias: sighting.vias.map(({ id: _, ...via }) => via),
  }
  const stated = Object.fromEntries(Object.keys(now).filter(name => input[name] !== undefined).map(name => [name, input[name]]))
  // A via that states pictures gets those; any other keeps its own, as a restore does.
  const form = sightingForm({ ...now, ...stated })
  const rows = viaPictureItems(stated.vias === undefined ? [] : items(stated.vias).map(record), form)
  const planned = planViaPictures(event, rows, new Map(sighting.vias.flatMap(via => via.pictures ?? []).map(picture => [picture.image_key, picture])))
  const read = readSightingFields(form)
  const chain = (pictures: readonly (ViaPicture[] | undefined)[]) => {
    const stating = new Map<string, ViaPicture[]>()
    for (const [index, row] of viaRows(form).entries()) {
      const own = pictures[index]
      if (own) stating.set(viaKey(row), [...stating.get(viaKey(row)) ?? [], ...own])
    }
    const vias = heldPictures(read.vias, sighting.vias, stating)
    if (vias.reduce((sum, via) => sum + (via.pictures?.length ?? 0), 0) > MEDIA_MAX) throw new Refusal(said('viaPictureCount', { most: MEDIA_MAX }))
    return vias
  }
  // The count is known before anything is fetched, each address to fetch standing for one picture.
  chain(planned.map(row => row?.map(({ address, kept }) => kept ?? { image_key: `fetch:${address}`, image_type: '', image_w: 0, image_h: 0, thumb_key: '' })))
  const budget = { bytes: MAX_WRITE_BODY, fetches: FETCHES_MAX }
  const pictures = input.pictures === undefined ? null : await editedPictures(event, sighting.media, input.pictures, budget)
  const via = await readViaPictures(event, planned, budget)
  const fields = { ...read, vias: chain(via.pictures) }
  if (!(pictures ?? sighting.media).length && !citesEvidence(fields) && !fields.place) throw new Refusal(said('evidence'))
  const { DB, MEDIA } = env(event)
  await storeImages(MEDIA, via.files)
  let media: StoredImage[] | null = null
  if (pictures) {
    media = []
    for (const picture of pictures) media.push('image_key' in picture ? picture : (await storeImages(MEDIA, [picture]))[0])
  }
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await editSighting(DB, sighting.id, rev, fields, media, { actor: person.id, ip: await ipHash(event) }, summaryOf(input), id)
  if (!result.ok) throw result.code === 'conflict' ? changed((await getEntry(DB, id))?.sightings.find(row => row.id === sighting.id)?.rev ?? rev) : new Refusal(said(result.code))
  notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
  return { record: shown(event, id), sighting: sighting.id, rev: result.rev }
}

// The pictures an edit leaves a sighting with, none stored yet.
async function editedPictures(event: RequestEvent, held: readonly StoredImage[], value: unknown, budget: Budget) {
  const pictures: (StoredImage | ReadImage)[] = []
  // A sighting may hold one picture twice with different marks: each address keeps a held picture not yet
  // kept, the one with the same marks when there is one.
  const unkept = [...held]
  for (const picture of pictureItems(value)) {
    const key = ownKey(event, picture.address)
    const candidates = unkept.filter(stored => stored.image_key === key)
    const marked = picture.marks === undefined ? undefined : JSON.stringify(picture.marks)
    if (key && picture.page !== undefined) throw new Refusal(`page is for a PDF, and this address is not one: ${picture.address}`)
    const kept = candidates.find(stored => marked !== undefined && JSON.stringify(stored.box ? JSON.parse(stored.box) : []) === marked) ?? candidates[0]
    if (!kept) { pictures.push(await readPicture(event, picture, budget)); continue }
    unkept.splice(unkept.indexOf(kept), 1)
    // A picture marked anew stands as its own cover, as a fetched one does.
    const box = picture.marks === undefined ? kept.box : marksOn(picture.marks, kept.image_w, kept.image_h)
    pictures.push(box === kept.box ? kept : { ...kept, box, thumb_key: kept.image_key })
  }
  return pictures
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
    ...shown(event, id), rev: entry.rev,
    script: entry.script === 'other' ? entry.script_other ?? 'other' : entry.script,
    status: entry.status, description: entry.description, radical: entry.radical, strokes: entry.strokes,
    claims: found.claims.map(claim => ({ key: claim.key, kind: claim.kind, value: claim.value, ...(claim.data ? { data: claim.data } : {}), ...(claim.under.length ? { under: claim.under } : {}), evidence: claim.sightings.filter(sighting => visible.has(sighting)) })),
    date_readings: Object.fromEntries(await readDates(env(event).DB, sightingDates(sightings))),
    sightings: sightings.map(sighting => ({
      id: sighting.id, rev: sighting.rev, place: sighting.place,
      ...Object.fromEntries(CITATION_FIELDS.map(field => [field, sighting[field]])),
      original_date: sighting.original_date, page: sighting.page, contexts: parseContexts(sighting.contexts), style: sighting.style, quotes: quotations(sighting.quotes), types: parseSightingTypes(sighting.types), note: sighting.note,
      vias: sighting.vias.map(({ id: _, pictures, ...via }) => ({ ...via, pictures: (pictures ?? []).map(picture => shownPicture(event, picture)) })),
      pictures: sighting.media.map(picture => ({ ...shownPicture(event, picture), marks: picture.box ? JSON.parse(picture.box) as number[][] : [] })),
    })),
  }
}

// ---------- What the agent is told ----------

export const INSTRUCTIONS = `珍字集覽 (Rare Character Compendium) records rare characters of the Han script and the scripts around it, each with the evidence of where it was seen. A record is one written form. A sighting is one place the form was seen: its citation and its pictures.

To add a character:
1. Read the form from the evidence picture and write it as an ideographic description sequence (IDS), such as ⿰山東. A code point or a description given by whoever reported the character is a claim to check against the picture.
2. Call find_similar_records with the IDS and compare the pictures of what comes back. When a record shows the same form, call add_sighting on it. Otherwise call add_record.
3. Cite the work the character appears in as the sighting's source, with author, title, publisher, date and page. Cite where you found it, such as a post or a chat message that shows the page, as a via, with its author, date, link and the words you quote, and its pictures when you have them.
4. A chat message, a forum post or a personal communication is evidence and is cited as one: the author as they sign, the date of that message, the words quoted, the group or channel as container, the service as publisher, and no title. A private message, a letter or a conversation has no container and takes source_kind personal. Each message is its own citation; never reuse another message's author or date.

To correct a record or a sighting, read it with get_record and call edit_record or edit_sighting with the rev it shows, giving only what changes. Say what changed and why in summary.

Every change you make is shown as an agent's. Say what you are in agent on each add and edit: the harness you run in and the model you run on.

Record every attested form, whether or not Unicode encodes it; an encoded character takes an encoding with charset "unicode". State only the readings, meanings, creators and relations the evidence gives.`

const CITATION = {
  url: { type: 'string', description: 'Web address, http or https.' },
  title: { type: 'string' },
  author: { type: 'string', description: 'The author as they sign: a name or a handle.' },
  publisher: { type: 'string', description: 'The publisher, or the service a post or message is on, such as X or QQ.' },
  report_date: { type: 'string', description: 'Publication date as written in the source, e.g. 明萬曆34年, 1936, 168 BCE or 2026-11-14. A year with a minus sign counts as BCE: -168 is 168 BCE.' },
  container: { type: 'string', description: 'What the source appeared in: the journal and issue of an article, the site of a page, the group or channel of a chat message.' },
  source_kind: { type: 'string', enum: SOURCE_KINDS, description: 'personal for a personal communication: a letter, a private message, a conversation. Omit for anything published or sent to a group.' },
}

const SIGHTING = {
  place: { type: 'string', description: 'Where the character was found, in words that help someone find it again: a book and page, a street, a website.' },
  ...CITATION,
  original_date: { type: 'string', description: 'The date of an older work shown in the picture, when the cited publication reproduces one. Written as report_date is.' },
  page: { type: 'string', description: 'Page, folio or volume within the work.' },
  contexts: { type: 'array', items: { type: 'string', enum: CONTEXTS }, description: 'How the character appears, in every way the source shows it.' },
  style: { type: 'string', enum: STYLES, description: 'The writing style.' },
  types: { type: 'array', items: { type: 'string', enum: SIGHTING_TYPES }, description: 'What the source provides: mention (discusses the character), attestation (uses it in a text), description (says how it is written), definition (gives a meaning), reading (gives a pronunciation), relation (names a variant or the same character).' },
  quotes: { type: 'array', maxItems: QUOTATIONS_MAX, items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, locator: { type: 'string' } } }, description: 'Quoted passages, each with an optional attribution or location in the source.' },
  note: { type: 'string', description: 'A note on this source.' },
  vias: { type: 'array', maxItems: VIAS_MAX, description: 'The sources the evidence passed through, from the one nearest the cited work to the one you saw it in.', items: { type: 'object', properties: { ...CITATION, quote: { type: 'string', description: 'The words this sighting quotes from the source, as written.' }, pictures: { type: 'array', maxItems: MEDIA_MAX, description: `Pictures of this source, such as a screenshot of the post, from their addresses, without marks. A picture belongs to one source, the chain holds ${MEDIA_MAX} in all, and the source needs a citation.`, items: { oneOf: [{ type: 'string' }, { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string' } } }], description: 'Address of the image file itself.' } } } } },
  pictures: {
    type: 'array', maxItems: MEDIA_MAX, description: `Evidence pictures, fetched from their addresses and kept by the site. JPEG, PNG or WebP, or pages of a PDF, up to ${FETCHES_MAX} from other sites and ${PDF_PAGES_MAX} PDF pages in one call.`,
    items: {
      type: 'object', required: ['url'],
      properties: {
        url: { type: 'string', description: 'Address of the image file itself, or of a PDF.' },
        page: { type: 'integer', minimum: 1, description: `For a PDF: the page to draw, counted from 1; the first when left out. The page is kept as a picture whose longer side is ${PDF_SIDE} pixels, fewer for a page nearer to square than a sheet of paper, and marks are in pixels of that picture.` },
        pages: { type: 'string', description: 'For a PDF, in place of page: several pages as one picture each, such as "2-4" or "1, 5-6". Marks go with a single page.' },
        marks: { type: 'array', maxItems: BOXES_MAX, description: 'Boxes around the character, each [x, y, width, height] in pixels of the picture.', items: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 } },
      },
    },
  },
}
const SIGHTING_RULE = 'A sighting needs a picture or a link.'
const RECORD = { type: 'string', description: 'A record: its id, or its code such as R+00A1.' }
const AGENT = {
  type: 'object', description: 'What you are, shown beside the change: the harness you run in and the model you run on. A change without it is shown as an unknown agent\'s.',
  properties: {
    harness: { type: 'string', maxLength: AGENT_NAME_MAX, description: 'The harness or client, such as Claude Code, Codex or Antigravity.' },
    model: { type: 'string', maxLength: AGENT_NAME_MAX, description: 'The model, with its version, such as Fable 5.2 or GPT-6-Astra.' },
  },
}
const REV = { type: 'integer', minimum: 1, description: 'The rev get_record answered. An edit made after another one is refused.' }
const SUMMARY = { type: 'string', maxLength: 500, description: 'What the edit changes and why, shown in the history.' }

// The record's own fields. `evidence` says how a row names its sightings; `key` lets an edit's row continue a claim.
function recordFields(evidence: Json, key?: Json) {
  const own = key ? { key } : {}
  return {
    script: { type: 'string', description: `The script: one of ${SCRIPTS.map(script => script.id).filter(id => id !== 'other').join(', ')}, or another script's name. Han when left out.` },
    ids: { type: 'array', minItems: 1, items: { type: 'string' }, description: 'Ideographic description sequences of the form as the picture shows it. The first one draws the glyph; the others are further ways to describe the same form. Leave it out when the form cannot be described: the record then shows its picture.' },
    description: { type: 'string', description: 'What is notable about the form, in prose.' },
    radical: { type: 'string', description: 'The radical, when the source states one.' },
    strokes: { type: 'integer', minimum: 0, description: 'Total strokes.' },
    meanings: { type: 'array', items: { type: 'object', required: ['text'], properties: { ...own, text: { type: 'string' }, evidence } } },
    readings: { type: 'array', items: { type: 'object', required: ['text'], properties: {
      ...own,
      text: { type: 'string' },
      doculect: { type: 'string', description: `The language or dialect: one of ${DOCULECTS.join(', ')}, or another name.` },
      meanings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The meanings this reading goes with, by their place in `meanings`, from 1.' },
      evidence,
    } } },
    creators: { type: 'array', description: 'Who made the character, when a source says so: each person by name as the source writes it.', items: { type: 'object', required: ['name'], properties: { ...own, name: { type: 'string' }, evidence } } },
    encodings: { type: 'array', description: 'The character sets, dictionaries and glyph registries that hold the character.', items: { type: 'object', required: ['charset', 'code'], properties: {
      charset: { type: 'string', description: `One of ${REGISTRIES.map(registry => registry.id).join(', ')}, or another work's name.` },
      code: { type: 'string', description: 'The code as the work writes it, such as U+2D6DD for unicode.' },
    } } },
    related: { type: 'array', items: { type: 'object', required: ['character', 'relationship'], properties: {
      ...own,
      character: { type: 'string', description: 'The other character, or its description sequence.' },
      relationship: { type: 'string', enum: RELATION_KINDS },
      difference: { type: 'string', description: 'How the two forms differ.' },
      basis: { type: 'string', description: 'The evidence or source for the relation, in words.' },
      meanings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The meanings under which the relation holds, by their place in `meanings`.' },
      readings: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The readings under which the relation holds, by their place in `readings`.' },
      evidence,
    } } },
    ivd: { type: 'string', description: 'A registered IVD sequence such as "U+4E00 U+E0100", or "none" when the form is known to have none.' },
    categories: { type: 'array', items: { type: 'string' } },
    collections: { type: 'array', items: { type: 'string', enum: COLLECTIONS.map(collection => collection.slug) } },
    tags: { type: 'array', items: { type: 'string' } },
  }
}

type Tool = { name: string; title: string; description: string; inputSchema: Json; annotations: Json; run: (event: RequestEvent, input: Json) => Promise<unknown> }
const READS = { readOnlyHint: true }
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
// An edit replaces what it changes; the history keeps the version before it.
const EDITS = { readOnlyHint: false, destructiveHint: true, idempotentHint: false }

const TOOLS: Tool[] = [
  {
    name: 'find_similar_records', title: 'Find records of a form', annotations: READS, run: findSimilar,
    description: 'The records that may show the same form as a description sequence: `same` are described by exactly this sequence, `similar` share the most parts with it. Call this before adding a character.',
    inputSchema: { type: 'object', required: ['ids'], properties: { ids: { type: 'string', description: 'An ideographic description sequence, such as ⿰山東.' } } },
  },
  {
    name: 'search_records', title: 'Search records', annotations: READS, run: searchRecords,
    description: 'Records found by a description sequence, an encoded character, or words from their readings, meanings, tags and sources. Without a query, every record, those with the most evidence first. first_year numbers years as ISO 8601 does: 168 BCE is -167.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: SEARCH_PAGE_MAX, default: SEARCH_PAGE },
      after: { type: 'string', description: 'The `next` of an earlier answer, for the records after it.' },
    } },
  },
  {
    name: 'get_record', title: 'Read a record', annotations: READS, run: getRecord,
    description: 'A record with its claims (descriptions, readings, meanings, creators, codes, relations) and its sightings, each with its citation and picture addresses.',
    inputSchema: { type: 'object', required: ['record'], properties: { record: RECORD } },
  },
  {
    name: 'add_record', title: 'Add a character', annotations: ADDS, run: addRecord,
    description: `Add a record for a form no record shows yet, with the sightings it starts from. A form that cannot be described is added without ids and with a picture. ${SIGHTING_RULE} Answers the new record's id, code and page.`,
    inputSchema: { type: 'object', required: ['sightings', 'agent'], properties: {
      agent: AGENT,
      ...recordFields({ type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The sightings that support this, by their place in `sightings`, from 1.' }),
      sightings: { type: 'array', minItems: 1, maxItems: ADD_SIGHTINGS_MAX, items: { type: 'object', properties: SIGHTING } },
    } },
  },
  {
    name: 'add_sighting', title: 'Add evidence to a record', annotations: ADDS, run: addSightingTo,
    description: `Add one more place a recorded form was seen. ${SIGHTING_RULE} Answers the record and the new sighting's id.`,
    inputSchema: { type: 'object', required: ['record', 'agent'], properties: { record: RECORD, agent: AGENT, ...SIGHTING } },
  },
  {
    name: 'edit_record', title: 'Edit a record', annotations: EDITS, run: editRecordOf,
    description: 'Change a record\'s own fields. A field left out stays as it is; a list given replaces the record\'s whole list, so send the rows to keep with the new ones. A row that repeats one the record holds, or names its key, keeps that row\'s evidence. Answers the new rev.',
    inputSchema: { type: 'object', required: ['record', 'rev', 'agent'], properties: {
      record: RECORD, rev: REV, summary: SUMMARY, agent: AGENT,
      ...recordFields(
        { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'The sightings that support this, by their id in get_record. Left out, a row that continues a claim keeps its evidence.' },
        { type: 'string', description: 'The key get_record shows for the claim this row continues.' },
      ),
    } },
  },
  {
    name: 'edit_sighting', title: 'Edit evidence on a record', annotations: EDITS, run: editSightingOf,
    description: `Change one sighting of a record. A field left out stays as it is; quotes, vias and pictures given replace the whole list. Keep a picture by giving its address from get_record. When a via gives pictures, the chain's pictures are those given: a via holds exactly its own list, and a via that leaves them out keeps the ones it has. When no via gives pictures, each via keeps its own, even one left out of vias. ${SIGHTING_RULE} Answers the new rev.`,
    inputSchema: { type: 'object', required: ['record', 'sighting', 'rev', 'agent'], properties: {
      agent: AGENT, record: RECORD, sighting: { type: 'integer', minimum: 1, description: 'The sighting\'s id in get_record.' }, rev: REV, summary: SUMMARY, ...SIGHTING,
    } },
  },
]

/** Public tool names and whether each writes, in server order. */
export const MCP_TOOLS = TOOLS.map(({ name, annotations }) => ({ name, write: annotations.readOnlyHint !== true }))

/** The tools, known tag names listed on the `categories` schema of the tools that take one. */
export const toolList = (tags: readonly string[]) => TOOLS.map(({ run: _, ...tool }) => !('categories' in record(tool.inputSchema.properties)) ? tool : {
  ...tool, inputSchema: { ...tool.inputSchema, properties: { ...record(tool.inputSchema.properties), categories: { type: 'array', items: { type: 'string', enum: tags } } } },
})

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
