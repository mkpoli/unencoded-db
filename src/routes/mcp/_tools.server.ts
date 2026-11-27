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
import { dateOrderWarnings } from '$lib/cites'
import { CITE_KINDS, CITES_MAX, CLOSENESS, CONTEXTS, parseContexts, parseSightingTypes, SCRIPTS, SIGHTING_TYPES, SOURCE_KINDS, STYLES, VIAS_MAX, type CiteKind } from '$lib/scripts'
import { candidates } from '$lib/server/candidates'
import { addComment, cleanComment, commentsOf, setCommentHidden } from '$lib/server/comments'
import { tagList, taxonomy } from '$lib/server/tags'
import { addSighting, CITATION_FIELDS, citesEvidence, CiteValidationError, createEntry, editEntry, editSighting, ENTRY_HISTORY_PAGE, getEntry, getEntryRow, getSighting, heldPictures, history, linkSightings, list, mediaVisible, mergeEntry, mergedInto, namedVias, openReports, preserveHiddenCites, putBackSighting, rawCitesOfSighting, readBoxes, readEntryFields, readSightingFields, redactRevision, removeSighting, resolveReport, restoreSighting, sameIds, SEARCH_LENGTH_MAX, SEARCH_TERMS_MAX, setHidden, SightingLimitError, SIGHTINGS_MAX, unmergeEntry, validateCiteTargets, viaKey, viaRows, type Cite, type SightingFields, type StoredImage, type ViaPicture } from '$lib/server/entries'
import { chargeWrites, env, guardWrite, ipHash } from '$lib/server/guard'
import { archiveCited } from '$lib/server/archive'
import { scheduleAtlasSync } from '$lib/server/atlas-evidence'
import { citedBy, notifyIndexNow } from '$lib/server/indexnow'
import { MAX_WRITE_BODY } from '$lib/server/body-limit'
import { MAX_IMAGE, prepareImage, sniff } from '$lib/server/image'
import { pagesOf } from '$lib/pdf-pages'
import { heavyJpx, isPdf, JPX_PIXELS, PDF_SIDE, renderPdfPage } from '$lib/server/pdf'
import { AGENT_NAME_MAX, agentWriter, cleanAgentName, type AgentSaid } from '$lib/server/people'
import { entrySnapshot, revisionDates, revisionFields, sightingSnapshot } from '$lib/server/revisions'
import { editSourceAlias } from '$lib/server/source-aliases'
import { described, storeImages, type ReadImage } from '../_submission.server'

type Json = Record<string, unknown>
export type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** What a tool answers in place of a result, in words the agent can act on. */
class Refusal extends Error {}

const said = (code: string, values?: Record<string, string | number>) => translate('en', `error.${code}`, values)
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const items = (value: unknown): unknown[] => Array.isArray(value) ? value : value == null ? [] : [value]
const text = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

function positiveInt(value: unknown, name: string) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 1) return value
    throw new Refusal(`${name} must be a positive integer.`)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^[1-9]\d{0,15}$/.test(trimmed)) {
      const parsed = Number(trimmed)
      if (Number.isSafeInteger(parsed)) return parsed
    }
  }
  throw new Refusal(`${name} must be a positive integer.`)
}

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

export const isModerator = (event: RequestEvent) => Boolean(event.locals.person?.moderator && !event.locals.person.banned)

async function guard(event: RequestEvent, limit: 'ADDS' | 'EDITS', moderation = false) {
  if (moderation && !isModerator(event)) {
    throw new Refusal(event.locals.person?.banned ? said('banned') : 'This action requires moderator permission.')
  }
  try { await guardWrite(event, limit, moderation) } catch (cause) {
    if (!isHttpError(cause)) throw cause
    if (cause.status === 403 && moderation && !event.locals.person?.banned) {
      throw new Refusal('This action requires moderator permission.')
    }
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
  put('closeness', choice(input.closeness, CLOSENESS, 'closeness'))
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
  const cites = items(input.cites).map(record)
  if (cites.length > CITES_MAX) throw new Refusal(`A sighting names up to ${CITES_MAX} cited older works.`)
  for (const cite of cites) {
    const kind = choice(cite.kind, CITE_KINDS, 'A cite kind') || 'quotes'
    const target = cite.sighting === undefined || cite.sighting === null || cite.sighting === '' ? '' : Number.isInteger(cite.sighting) && (cite.sighting as number) >= 1 ? String(cite.sighting) : (() => { throw new Refusal('A cite sighting is a positive integer sighting id.') })()
    form.append('cite_kind', kind)
    form.append('cite_sighting', target)
    for (const field of CITATION_FIELDS) form.append(`cite_${field}`, field === 'url' ? link(cite.url, 'A cite url') : field === 'source_kind' ? choice(cite.source_kind, SOURCE_KINDS, 'A cite source_kind') : text(cite[field]))
    form.append('cite_quote', text(cite.quote))
    form.append('cite_note', text(cite.note))
  }
  return form
}

async function citeDateWarnings(db: D1Database, list: readonly SightingFields[]): Promise<string[]> {
  try {
    const targetIds = [...new Set(list.flatMap(fields => (fields.cites ?? []).map(cite => cite.sighting)).filter((id): id is number => id !== null))]
    const targets = new Map<number, { report_date: string | null; original_date: string | null }>()
    if (targetIds.length) {
      const { results } = await db.prepare(`SELECT s.id, s.original_date, c.report_date FROM sightings s LEFT JOIN sources c ON c.id = s.source_id WHERE s.id IN (${targetIds.map(() => '?').join(', ')})`).bind(...targetIds).all<{ id: number; original_date: string | null; report_date: string | null }>()
      for (const row of results) targets.set(row.id, row)
    }
    const allDates = [...sightingDates(list), ...[...targets.values()].flatMap(target => [target.report_date, target.original_date])]
    const book = await readDates(db, allDates)
    const messages: string[] = []
    for (const fields of list) {
      const citesWithTargets = (fields.cites ?? []).map(cite => {
        const target = cite.sighting ? targets.get(cite.sighting) : undefined
        return { report_date: cite.report_date, target_report_date: target?.report_date ?? null, target_original_date: target?.original_date ?? null }
      })
      for (const warning of dateOrderWarnings(fields, fields.vias, citesWithTargets, book)) {
        if (warning.side === 'via') messages.push(`Via #${warning.index + 1} (${warning.viaYear}) predates the work (${warning.workYear}); if it is an older work this source quotes, record it under cites instead.`)
        else messages.push(`Cite #${warning.index + 1} (${warning.citeYear}) postdates the work (${warning.workYear}); if it is where you found this source, record it under vias instead.`)
      }
    }
    return messages
  } catch {
    return []
  }
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
  const { DB, MEDIA } = env(event)
  const stated = inputs.map((sighting, index) => {
    const form = sightingForm(sighting)
    const vias = viaPictureItems(items(sighting.vias).map(record), form)
    const preview = readSightingFields(form)
    if (!items(sighting.pictures).length && !vias.some(row => row?.length) && !citesEvidence(preview)) throw new Refusal(`Sighting ${index + 1}: ${said('evidence')}`)
    return { form, vias, pictures: sighting.pictures, cites: preview.cites }
  })
  for (const [index, item] of stated.entries()) {
    const badCite = await validateCiteTargets(DB, item.cites)
    if (badCite) throw new Refusal(`Sighting ${index + 1}: ${said(badCite)}`)
  }
  if (!(await chargeWrites(event, 'ADDS', stated.length - 1))) throw new Refusal(said('slow'))
  const budget = { bytes: PICTURES_BODY_MAX, fetches: FETCHES_MAX }
  const read = []
  for (const { form, vias, pictures } of stated) {
    const own = await readPictures(event, pictures, budget)
    const via = await readViaPictures(event, planViaPictures(event, vias), budget)
    read.push({ fields: readSightingFields(form, via.pictures.map(row => row ?? [])), pictures: own, files: via.files })
  }
  const drafts = []
  for (const { fields, pictures, files } of read) {
    await storeImages(MEDIA, files)
    drafts.push({ fields, media: await storeImages(MEDIA, pictures) })
  }
  const person = await agentWriter(event, DB, agentSaid(input))
  const id = await createEntry(DB, entry, drafts[0].fields, drafts[0].media, { actor: person.id, ip: await ipHash(event) }, drafts.slice(1))
  notifyIndexNow(event, { entries: [id] })
  scheduleAtlasSync(event, [id])
  archiveCited(event, drafts.map(draft => draft.fields))
  const warnings = await citeDateWarnings(DB, drafts.map(draft => draft.fields))
  return { ...shown(event, id), ...(warnings.length ? { warnings } : {}) }
}

async function addSightingTo(event: RequestEvent, input: Json) {
  await guard(event, 'ADDS')
  const { id, found } = await openRecord(event, input.record)
  const { DB, MEDIA } = env(event)
  if (found.sightings.length >= SIGHTINGS_MAX) throw new Refusal(said('sightingLimit'))
  const form = sightingForm(input)
  const vias = viaPictureItems(items(input.vias).map(record), form)
  const preview = readSightingFields(form)
  if (!items(input.pictures).length && !vias.some(row => row?.length) && !citesEvidence(preview)) throw new Refusal(said('evidence'))
  const badCite = await validateCiteTargets(DB, preview.cites)
  if (badCite) throw new Refusal(said(badCite))
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
    if (cause instanceof CiteValidationError) throw new Refusal(said(cause.code))
    throw cause
  }
  if (!sighting) throw new Refusal(said('missing'))
  notifyIndexNow(event, { entries: [id] })
  archiveCited(event, [fields])
  const warnings = await citeDateWarnings(DB, [fields])
  return { record: shown(event, id), sighting, ...(warnings.length ? { warnings } : {}) }
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
  const { DB, MEDIA } = env(event)
  const rawCites = await rawCitesOfSighting(DB, sighting.id)
  const now: Json = {
    place: sighting.place, ...Object.fromEntries(CITATION_FIELDS.map(field => [field, sighting[field]])),
    original_date: sighting.original_date, page: sighting.page, contexts: parseContexts(sighting.contexts), style: sighting.style, types: parseSightingTypes(sighting.types), note: sighting.note, closeness: sighting.closeness,
    quotes: quotations(sighting.quotes), vias: sighting.vias.map(({ id: _, ...via }) => via),
    cites: rawCites,
  }
  const stated = Object.fromEntries(Object.keys(now).filter(name => input[name] !== undefined).map(name => [name, input[name]]))
  // A via that states pictures gets those; any other keeps its own, as a restore does.
  const form = sightingForm({ ...now, ...stated })
  const rows = viaPictureItems(stated.vias === undefined ? [] : items(stated.vias).map(record), form)
  const planned = planViaPictures(event, rows, new Map(sighting.vias.flatMap(via => via.pictures ?? []).map(picture => [picture.image_key, picture])))
  const read = readSightingFields(form)
  const citesToSave = input.cites === undefined ? rawCites : preserveHiddenCites(read.cites ?? [], rawCites, sighting.cites)
  const heldTargets = new Set(rawCites.map(cite => cite.sighting).filter((target): target is number => target !== null))
  const badCite = await validateCiteTargets(DB, citesToSave, sighting.id, heldTargets)
  if (badCite) throw new Refusal(said(badCite))
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
  const fields = { ...read, cites: citesToSave, vias: chain(via.pictures) }
  if (!(pictures ?? sighting.media).length && !citesEvidence(fields) && !fields.place) throw new Refusal(said('evidence'))
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
  archiveCited(event, [fields])
  const warnings = await citeDateWarnings(DB, [fields])
  return { record: shown(event, id), sighting: sighting.id, rev: result.rev, ...(warnings.length ? { warnings } : {}) }
}

async function linkSightingsOf(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const sightingId = Number(text(input.sighting))
  if (!Number.isInteger(sightingId) || sightingId < 1) throw new Refusal('sighting is a positive integer sighting id.')
  const kind = (choice(input.kind, CITE_KINDS, 'kind') || 'quotes') as CiteKind
  const citedRaw = input.cited_sighting
  const citedId = citedRaw === undefined || citedRaw === null || citedRaw === '' ? null : Number.isInteger(citedRaw) && (citedRaw as number) >= 1 ? citedRaw as number : (() => { throw new Refusal('cited_sighting is a positive integer sighting id.') })()
  const src = input.source ? record(input.source) : {}
  const form = sightingForm({
    cites: [{
      kind,
      sighting: citedId,
      ...Object.fromEntries(CITATION_FIELDS.map(field => [field, src[field]])),
      quote: input.quote,
      note: input.note,
    }],
  })
  const [cite] = readSightingFields(form).cites ?? []
  if (!cite) throw new Refusal('Give cited_sighting or a source citation.')
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await linkSightings(DB, sightingId, cite, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (!result.ok) throw new Refusal(result.code === 'full' ? `A sighting names up to ${CITES_MAX} cited older works.` : said(result.code))
  const updatedEntries = result.cited_entry_id && result.cited_entry_id !== result.entry_id ? [result.entry_id, result.cited_entry_id] : [result.entry_id]
  const updated = await getSighting(DB, sightingId)
  notifyIndexNow(event, { entries: updatedEntries, sources: updated ? citedBy(updated) : [] })
  if (updated) archiveCited(event, [updated])
  const warnings = updated ? await citeDateWarnings(DB, [updated]) : []
  return { record: shown(event, result.entry_id), sighting: sightingId, rev: result.rev, ...(warnings.length ? { warnings } : {}) }
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

async function removeSightingFrom(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const { id } = await openRecord(event, input.record)
  const sightingId = positiveInt(input.sighting, 'sighting')
  const rev = revisionOf(input.rev)
  const { DB } = env(event)
  const sighting = await getSighting(DB, sightingId)
  if (!sighting || sighting.entry_id !== id || sighting.hidden_at) throw new Refusal(`${recordCode(id)} has no sighting ${sightingId}.`)
  if (sighting.rev !== rev) throw changed(sighting.rev)
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await removeSighting(DB, id, sighting.id, rev, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (result === 'only') throw new Refusal('Cannot remove the only remaining sighting of a record.')
  if (result === 'conflict') throw changed((await getSighting(DB, sighting.id))?.rev ?? rev)
  if (result === 'merged') throw new Refusal(said('merged'))
  if (result !== 'done') throw new Refusal(said('missing'))
  notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
  return { record: shown(event, id), sighting: sighting.id, removed: true }
}

async function mergeRecords(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const first = recordId(input.record)
  const second = recordId(input.duplicate_of)
  if (!first || !second) throw new Refusal(said('missing'))
  if (first === second) throw new Refusal(said('self'))
  const from = Math.max(first, second), into = Math.min(first, second)
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await mergeEntry(DB, from, into, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (!result.ok) {
    throw new Refusal(result.code === 'self' ? said('self') : result.code === 'merged' ? said('merged') : result.code === 'full' ? said('sightingLimit') : said('missing'))
  }
  notifyIndexNow(event, { entries: [from, into] })
  return { merged: shown(event, from), into: shown(event, into) }
}

async function unmergeRecord(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const id = recordId(input.record)
  const { DB } = env(event)
  const entry = id ? await getEntryRow(DB, id) : null
  if (!id || !entry || entry.hidden_at) throw new Refusal(said('missing'))
  if (!entry.merged_into) throw new Refusal('That record is not merged into another record.')
  const into = entry.merged_into
  const person = await agentWriter(event, DB, agentSaid(input))
  if (!await unmergeEntry(DB, id, { actor: person.id, ip: await ipHash(event) })) {
    throw new Refusal(said('conflict'))
  }
  notifyIndexNow(event, { entries: [id, into] })
  return { record: shown(event, id), from: shown(event, into), unmerged: true }
}

async function addCommentTo(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const { id, found } = await openRecord(event, input.record)
  let about: number | null = null
  if (input.sighting !== undefined && input.sighting !== null) {
    about = positiveInt(input.sighting, 'sighting')
    if (!found.sightings.some(sighting => sighting.id === about && !sighting.hidden_at)) {
      throw new Refusal(`${recordCode(id)} has no sighting ${about}.`)
    }
  }
  const body = cleanComment(input.body)
  if (!body) throw new Refusal(said('comment'))
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  const comment = await addComment(DB, { entry: id, sighting: about }, body, { actor: person.id, ip: await ipHash(event) })
  return { record: shown(event, id), comment }
}

async function editSourceAliasTo(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const source = positiveInt(input.source, 'source')
  const alias = text(input.alias).trim()
  const action = choice(input.action, ['add', 'remove'], 'action')
  if (!action) throw new Refusal('action is one of: add, remove.')
  if (!alias || alias.length > 300) throw new Refusal('alias must be 1 to 300 characters.')
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  if (!await editSourceAlias(DB, source, alias, action === 'remove', person.id)) {
    throw new Refusal(translate('en', 'source.aliasError'))
  }
  notifyIndexNow(event, { sources: [source] })
  return { source, alias, action }
}

async function restoreRevisionTo(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS')
  const { id, found } = await openRecord(event, input.record)
  const { DB } = env(event)

  if (input.put_back === true) {
    const sightingId = positiveInt(input.sighting, 'sighting')
    const sighting = found.sightings.find(s => s.id === sightingId && s.hidden_at && s.removed_by)
    if (!sighting) throw new Refusal('No contributor-removed sighting with that id exists on this record.')
    const person = await agentWriter(event, DB, agentSaid(input))
    if (await putBackSighting(DB, id, sightingId, { actor: person.id, ip: await ipHash(event) }) !== 'done') throw new Refusal(said('missing'))
    notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
    return { record: shown(event, id), sighting: sightingId, restored: true }
  }

  const revisionId = positiveInt(input.revision, 'revision')
  const baseRev = revisionOf(input.rev)
  if (input.sighting !== undefined && input.sighting !== null) {
    const sightingId = positiveInt(input.sighting, 'sighting')
    const sighting = found.sightings.find(s => s.id === sightingId && !s.hidden_at)
    if (!sighting) throw new Refusal(`${recordCode(id)} has no sighting ${sightingId}.`)
    if (baseRev !== sighting.rev) throw changed(sighting.rev)
    const old = await DB.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id = ? AND redacted_at IS NULL AND kind IN ('sighting','sighting_edit')")
      .bind(revisionId, id, sighting.id).first<{ snapshot: string; rev: number }>()
    const fields = old && sightingSnapshot(old.snapshot)
    if (!old || !fields) throw new Refusal('That sighting revision cannot be restored.')
    if (!sighting.media.length && !sighting.vias.some(via => via.pictures?.length) && !citesEvidence(fields) && !fields.place) throw new Refusal(said('evidence'))
    const person = await agentWriter(event, DB, agentSaid(input))
    const result = await restoreSighting(DB, id, sighting.id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, old.rev, revisionId)
    if (!result.ok) throw result.code === 'conflict' ? changed((await getSighting(DB, sighting.id))?.rev ?? baseRev) : new Refusal(said('missing'))
    notifyIndexNow(event, { entries: [id], sources: citedBy(sighting) })
    return { record: shown(event, id), sighting: sighting.id, rev: result.rev }
  }

  if (baseRev !== found.entry.rev) throw changed(found.entry.rev)
  const old = await DB.prepare("SELECT snapshot, rev FROM revisions WHERE id = ? AND entry_id = ? AND sighting_id IS NULL AND redacted_at IS NULL AND kind IN ('create','edit','revert','merge','unmerge')")
    .bind(revisionId, id).first<{ snapshot: string; rev: number }>()
  const fields = old && entrySnapshot(old.snapshot)
  if (!old || !fields) throw new Refusal('That record revision cannot be restored.')
  const person = await agentWriter(event, DB, agentSaid(input))
  const result = await editEntry(DB, id, baseRev, fields, { actor: person.id, ip: await ipHash(event) }, `r${old.rev}`, 'revert', revisionId)
  if (!result.ok) throw result.code === 'conflict' ? changed((await getEntry(DB, id))?.entry.rev ?? baseRev) : new Refusal(said('missing'))
  notifyIndexNow(event, { entries: [id] })
  scheduleAtlasSync(event, [id], { onlyIfChanged: true })
  return { record: shown(event, id), rev: result.rev }
}

// ---------- Moderation ----------

async function setHiddenTo(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS', true)
  const id = recordId(input.record)
  if (!id) throw new Refusal(said('missing'))
  if (typeof input.hidden !== 'boolean') throw new Refusal('hidden must be true or false.')
  const sighting = input.sighting === undefined || input.sighting === null ? null : positiveInt(input.sighting, 'sighting')
  const { DB } = env(event)
  const entry = await getEntryRow(DB, id)
  if (!entry) throw new Refusal(said('missing'))
  if (entry.merged_into) throw new Refusal(`${said('merged')} Moderate ${recordCode(entry.merged_into)} (${entry.merged_into}).`)
  const person = await agentWriter(event, DB, agentSaid(input))
  const ok = await setHidden(DB, { entry: id, sighting }, input.hidden, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (!ok) throw new Refusal(said('missing'))
  notifyIndexNow(event, { entries: [id] })
  return { record: shown(event, id), ...(sighting !== null ? { sighting } : {}), hidden: input.hidden }
}

async function listReportsMod(event: RequestEvent, input: Json) {
  if (!isModerator(event)) {
    throw new Refusal(event.locals.person?.banned ? said('banned') : 'This action requires moderator permission.')
  }
  const after = input.after === undefined || input.after === null ? 0 : positiveInt(input.after, 'after')
  const { reports, next } = await openReports(env(event).DB, after)
  return {
    reports: reports.map(report => ({
      id: report.id,
      record: shown(event, report.entry_id),
      sighting: report.sighting_id,
      reason: report.reason,
      at: report.at,
      by: report.by_name,
      ids: report.ids,
      record_hidden: Boolean(report.hidden_at),
      target_hidden: Boolean(report.target_hidden_at),
    })),
    next,
  }
}

async function resolveReportMod(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS', true)
  const report = positiveInt(input.report, 'report')
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  if (!await resolveReport(DB, report, person.id)) throw new Refusal('No open report with that id exists.')
  return { report, resolved: true }
}

async function setCommentHiddenMod(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS', true)
  const id = recordId(input.record)
  if (!id) throw new Refusal(said('missing'))
  const comment = positiveInt(input.comment, 'comment')
  if (typeof input.hidden !== 'boolean') throw new Refusal('hidden must be true or false.')
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  if (!await setCommentHidden(DB, id, comment, input.hidden, person.id)) throw new Refusal('That comment does not exist on this record.')
  return { record: shown(event, id), comment, hidden: input.hidden }
}

async function redactRevisionMod(event: RequestEvent, input: Json) {
  await guard(event, 'EDITS', true)
  const id = recordId(input.record)
  if (!id) throw new Refusal(said('missing'))
  const revisionId = positiveInt(input.revision, 'revision')
  const { DB } = env(event)
  const person = await agentWriter(event, DB, agentSaid(input))
  const ok = await redactRevision(DB, id, revisionId, { actor: person.id, ip: await ipHash(event) }, summaryOf(input))
  if (!ok) throw new Refusal('That revision cannot be redacted (it may be missing, already redacted, or the current revision).')
  return { record: shown(event, id), revision: revisionId, redacted: true }
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
  const { DB } = env(event)
  const showHidden = isModerator(event) && input.include_hidden === true
  const found = id ? await getEntry(DB, id) : null
  if (!id || !found || (found.entry.hidden_at && !showHidden)) throw new Refusal(said('missing'))
  const { entry } = found
  if (entry.merged_into) return { ...shown(event, id), ...(entry.hidden_at ? { hidden: true } : {}), merged_into: shown(event, entry.merged_into) }
  const sightings = showHidden ? found.sightings : found.sightings.filter(sighting => !sighting.hidden_at)
  const visible = new Set(found.sightings.filter(sighting => !sighting.hidden_at).map(sighting => sighting.id))
  const [dates, comments] = await Promise.all([
    readDates(DB, sightingDates(sightings)),
    commentsOf(DB, id, showHidden),
  ])
  return {
    ...shown(event, id), rev: entry.rev,
    ...(entry.hidden_at ? { hidden: true } : {}),
    script: entry.script === 'other' ? entry.script_other ?? 'other' : entry.script,
    status: entry.status, description: entry.description, radical: entry.radical, strokes: entry.strokes,
    claims: found.claims.map(claim => ({ key: claim.key, kind: claim.kind, value: claim.value, ...(claim.data ? { data: claim.data } : {}), ...(claim.under.length ? { under: claim.under } : {}), evidence: claim.sightings.filter(sighting => showHidden || visible.has(sighting)) })),
    date_readings: Object.fromEntries(dates),
    sightings: sightings.map(sighting => ({
      id: sighting.id, rev: sighting.rev, source_id: sighting.source_id,
      ...(sighting.hidden_at ? { hidden: true, removed: Boolean(sighting.removed_by) } : {}),
      place: sighting.place,
      ...Object.fromEntries(CITATION_FIELDS.map(field => [field, sighting[field]])),
      original_date: sighting.original_date, page: sighting.page, contexts: parseContexts(sighting.contexts), style: sighting.style, quotes: quotations(sighting.quotes), types: parseSightingTypes(sighting.types), note: sighting.note, closeness: sighting.closeness,
      vias: sighting.vias.map(({ id: source_id, pictures, ...via }) => ({ source_id, ...via, pictures: (pictures ?? []).map(picture => shownPicture(event, picture)) })),
      cites: sighting.cites.map(cite => ({
        kind: cite.kind,
        status: cite.status,
        sighting: cite.sighting,
        entry_id: cite.target?.entry_id ?? null,
        record: cite.target ? recordCode(cite.target.entry_id) : null,
        source_id: cite.source_id,
        ...Object.fromEntries(CITATION_FIELDS.map(field => [field, cite[field]])),
        quote: cite.quote,
        note: cite.note,
      })),
      cited_by: sighting.cited_by.map(item => ({
        kind: item.kind,
        sighting: item.sighting_id,
        entry_id: item.entry_id,
        record: recordCode(item.entry_id),
        title: item.title,
        place: item.place,
        report_date: item.report_date,
        original_date: item.original_date,
        quote: item.quote,
        note: item.note,
      })),
      pictures: sighting.media.map(picture => ({ ...shownPicture(event, picture), marks: picture.box ? JSON.parse(picture.box) as number[][] : [] })),
    })),
    comments: comments.map(comment => ({ id: comment.id, sighting: comment.sighting_id, body: comment.body, at: comment.at, by: comment.by_name, ...(comment.hidden_at ? { hidden: true } : {}) })),
  }
}

async function listTags(event: RequestEvent) {
  const { tags, groups } = await taxonomy(env(event).DB)
  return {
    groups: groups.map(group => ({ id: group.id, type: group.type, label: group.label })),
    tags: tags.map(tag => ({ name: tag.name, label: tag.label, type: tag.type, group: tag.group, aliases: tag.aliases, implies: tag.implies })),
  }
}

async function getHistory(event: RequestEvent, input: Json) {
  const id = recordId(input.record)
  const { DB } = env(event)
  const showHidden = isModerator(event) && input.include_hidden === true
  const found = id ? await getEntry(DB, id) : null
  if (!id || !found || (found.entry.hidden_at && !showHidden)) throw new Refusal(said('missing'))
  if (found.entry.merged_into) return { ...shown(event, id), ...(found.entry.hidden_at ? { hidden: true } : {}), merged_into: shown(event, found.entry.merged_into) }
  const before = input.before === undefined || input.before === null ? null : positiveInt(input.before, 'before')
  const visibleSightings = new Map(found.sightings.filter(sighting => !sighting.hidden_at).map(sighting => [sighting.id, sighting.rev]))
  const removed = found.sightings.filter(sighting => sighting.hidden_at && sighting.removed_by)
  const removedRevs = new Map(removed.map(sighting => [sighting.id, sighting.rev]))
  const [page, duplicates] = await Promise.all([history(DB, id, before), mergedInto(DB, id)])
  const next = page.length > ENTRY_HISTORY_PAGE ? page[ENTRY_HISTORY_PAGE - 1].id : null
  const rows = page.slice(0, ENTRY_HISTORY_PAGE)
    .filter(row => showHidden || !row.sighting_id || visibleSightings.has(row.sighting_id) || removedRevs.has(row.sighting_id))
    .map(({ id: revId, sighting_id, kind, rev, summary, at, by_name, by_agent, by_model, snapshot, redacted_at }) => ({
      id: revId,
      sighting: sighting_id,
      rev,
      summary,
      at,
      by: by_name,
      ...(by_agent ? { by_agent: true, ...(by_model ? { by_model } : {}) } : {}),
      redacted: Boolean(redacted_at),
      ...revisionFields({ sighting_id, kind, snapshot, redacted_at }),
      removed: sighting_id !== null && removedRevs.has(sighting_id),
      ...(sighting_id !== null && !visibleSightings.has(sighting_id) && !removedRevs.has(sighting_id) ? { hidden: true } : {}),
    }))
  const dates = await revisionDates(DB, rows)
  return {
    record: shown(event, id),
    rev: found.entry.rev,
    duplicates: duplicates.map(dup => shown(event, dup)),
    removed: removed.map(sighting => ({ id: sighting.id, rev: sighting.rev, title: sighting.title, place: sighting.place })),
    date_readings: Object.fromEntries(dates),
    rows: rows.map(({ fields, sightingFields, ...row }) => ({
      ...row,
      ...(fields ? { fields } : {}),
      ...(sightingFields ? { sighting_fields: sightingFields } : {}),
    })),
    next,
  }
}

// ---------- What the agent is told ----------

export const INSTRUCTIONS = `珍字集覽 (Rare Character Compendium) records rare characters of the Han script and the scripts around it, each with the evidence of where it was seen. A record is one written form. A sighting is one place the form was seen: its citation and its pictures.

To add a character:
1. Read the form from the evidence picture and write it as an ideographic description sequence (IDS), such as ⿰山東. A code point or a description given by whoever reported the character is a claim to check against the picture.
2. Call find_similar_records with the IDS and compare the pictures of what comes back. When a record shows the same form, call add_sighting on it. Otherwise call add_record.
3. Cite the work the character appears in as the sighting's source, with author, title, publisher, date and page. Cite where you found it, such as a post or a chat message that shows the page, as a via, with its author, date, link and the words you quote, and its pictures when you have them.
4. A chat message, a forum post or a personal communication is evidence and is cited as one: the author as they sign, the date of that message, the words quoted, the group or channel as container, the service as publisher, and no title. A private message, a letter or a conversation has no container and takes source_kind personal. Each message is its own citation; never reuse another message's author or date.

To correct a record or a sighting, read it with get_record and call edit_record or edit_sighting with the rev it shows, giving only what changes. Say what changed and why in summary. Merge two records with merge_records only when their evidence pictures clearly show the exact same written form; when unsure, leave them separate and add a related claim with relationship "uncertain". Use get_history and restore_revision to inspect or revert earlier changes.

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
  closeness: { type: 'string', enum: CLOSENESS, description: 'How close this sighting is to the original: primary (the work itself, or a photo, scan, rubbing, tracing or line drawing of it), secondary_cited (a compilation, dictionary or typeset transcription that names its own source for this form), secondary_uncited (one that names none), memory (given from memory, with no written witness). Leave it out when unsure.' },
  quotes: { type: 'array', maxItems: QUOTATIONS_MAX, items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, locator: { type: 'string' } } }, description: 'Quoted passages, each with an optional attribution or location in the source.' },
  note: { type: 'string', description: 'A note on this source.' },
  vias: { type: 'array', maxItems: VIAS_MAX, description: 'The sources the evidence passed through, from the one nearest the cited work to the one you saw it in.', items: { type: 'object', properties: { ...CITATION, quote: { type: 'string', description: 'The words this sighting quotes from the source, as written.' }, pictures: { type: 'array', maxItems: MEDIA_MAX, description: `Pictures of this source, such as a screenshot of the post, from their addresses, without marks. A picture belongs to one source, the chain holds ${MEDIA_MAX} in all, and the source needs a citation.`, items: { oneOf: [{ type: 'string' }, { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string' } } }], description: 'Address of the image file itself.' } } } } },
  cites: {
    type: 'array', maxItems: CITES_MAX,
    description: 'Older works this sighting quotes, re-sets as a later edition, or derives from. Each row names a witness sighting by id, a source citation, or both.',
    items: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: CITE_KINDS, description: 'quotes (the text names the older work), edition (re-typeset/re-keyed later edition of a base printing), or derived (dependence argued without explicit naming; requires note).' },
        sighting: { type: 'integer', minimum: 1, description: 'The identified older witness sighting id, in this or any other record.' },
        ...CITATION,
        quote: { type: 'string', description: 'Short excerpt naming the older work (for quotes).' },
        note: { type: 'string', description: 'Rationale for dependence (required for derived).' },
      },
    },
  },
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
    description: 'A record with its revision number (rev), claims (descriptions, readings, meanings, creators, codes, relations), latest comments, and sightings (each with its id, rev, source_id, citation, vias, and picture addresses).',
    inputSchema: { type: 'object', required: ['record'], properties: { record: RECORD } },
  },
  {
    name: 'list_tags', title: 'List tags', annotations: READS, run: listTags,
    description: 'List the typed tag taxonomy: groups, canonical tag names, labels, aliases, and automatic tag implications.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_history', title: 'Read record history', annotations: READS, run: getHistory,
    description: 'Read a record\'s revision history, merged duplicates, and contributor-removed sightings.',
    inputSchema: { type: 'object', required: ['record'], properties: {
      record: RECORD,
      before: { type: 'integer', minimum: 1, description: 'The `next` cursor from an earlier call, for older revisions.' },
    } },
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
    description: `Change one sighting of a record. A field left out stays as it is; quotes, vias, cites and pictures given replace the whole list. Keep a picture by giving its address from get_record. When a via gives pictures, the chain's pictures are those given: a via holds exactly its own list, and a via that leaves them out keeps the ones it has. When no via gives pictures, each via keeps its own, even one left out of vias. ${SIGHTING_RULE} Answers the new rev.`,
    inputSchema: { type: 'object', required: ['record', 'sighting', 'rev', 'agent'], properties: {
      agent: AGENT, record: RECORD, sighting: { type: 'integer', minimum: 1, description: 'The sighting\'s id in get_record.' }, rev: REV, summary: SUMMARY, ...SIGHTING,
    } },
  },
  {
    name: 'link_sightings', title: 'Link a sighting to an older work', annotations: EDITS, run: linkSightingsOf,
    description: 'Add or upgrade one provenance edge on a sighting (quotes, edition, or derived) against its current state without sending the whole sighting. Matches by cited_sighting or source citation.',
    inputSchema: { type: 'object', required: ['sighting', 'kind', 'agent'], properties: {
      agent: AGENT,
      sighting: { type: 'integer', minimum: 1, description: 'The later (citing) sighting id.' },
      kind: { type: 'string', enum: CITE_KINDS, description: 'quotes, edition, or derived.' },
      cited_sighting: { type: 'integer', minimum: 1, description: 'The older witness sighting id (in any record).' },
      source: { type: 'object', description: 'The work as named by the text, used when no witness is linked yet or to record the attested name.', properties: CITATION },
      quote: { type: 'string', description: 'Short excerpt naming the older work.' },
      note: { type: 'string', description: 'Rationale (required for derived).' },
      summary: SUMMARY,
    } },
  },
  {
    name: 'remove_sighting', title: 'Remove evidence from a record', annotations: EDITS, run: removeSightingFrom,
    description: 'Remove an erroneous or misplaced sighting from a record (reversible via restore_revision). Cannot remove a record\'s last remaining sighting.',
    inputSchema: { type: 'object', required: ['record', 'sighting', 'rev', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      sighting: { type: 'integer', minimum: 1, description: 'The sighting\'s id in get_record.' },
      rev: REV,
      summary: SUMMARY,
    } },
  },
  {
    name: 'merge_records', title: 'Merge duplicate records', annotations: EDITS, run: mergeRecords,
    description: 'Merge two duplicate records of the exact same written form. The higher-numbered record always merges into the lower-numbered one, moving its evidence and keeping both histories.',
    inputSchema: { type: 'object', required: ['record', 'duplicate_of', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      duplicate_of: { type: 'string', description: 'The other record id or code representing the same written form.' },
      summary: SUMMARY,
    } },
  },
  {
    name: 'unmerge_record', title: 'Undo a record merge', annotations: EDITS, run: unmergeRecord,
    description: 'Undo a merge, separating a merged duplicate record back out with its sightings and claims.',
    inputSchema: { type: 'object', required: ['record', 'agent'], properties: {
      agent: AGENT,
      record: { type: 'string', description: 'The merged duplicate record id or code to unmerge.' },
    } },
  },
  {
    name: 'add_comment', title: 'Comment on a record', annotations: ADDS, run: addCommentTo,
    description: 'Post a discussion comment on a record or on a specific sighting.',
    inputSchema: { type: 'object', required: ['record', 'body', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      sighting: { type: 'integer', minimum: 1, description: 'Optional sighting id this comment discusses.' },
      body: { type: 'string', description: 'Comment text, up to 4,000 characters.' },
    } },
  },
  {
    name: 'edit_source_alias', title: 'Edit source alternate name', annotations: EDITS, run: editSourceAliasTo,
    description: 'Add or remove an alternate name or abbreviation on a cited source (by source_id from get_record).',
    inputSchema: { type: 'object', required: ['source', 'alias', 'action', 'agent'], properties: {
      agent: AGENT,
      source: { type: 'integer', minimum: 1, description: 'Source id from get_record.' },
      alias: { type: 'string', description: 'Alternate title or abbreviation, 1 to 300 characters.' },
      action: { type: 'string', enum: ['add', 'remove'] },
    } },
  },
  {
    name: 'restore_revision', title: 'Restore a previous revision', annotations: EDITS, run: restoreRevisionTo,
    description: 'Restore a previous record revision, restore a sighting\'s previous text (keeping its current pictures), or put back a contributor-removed sighting (with put_back: true).',
    inputSchema: { type: 'object', required: ['record', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      sighting: { type: 'integer', minimum: 1, description: 'Sighting id when restoring a sighting revision or putting back removed evidence.' },
      revision: { type: 'integer', minimum: 1, description: 'Revision id from get_history (omit when put_back is true).' },
      rev: REV,
      put_back: { type: 'boolean', description: 'Set true with sighting to put back contributor-removed evidence.' },
    } },
  },
]

const MOD_TOOLS: Tool[] = [
  {
    name: 'set_hidden', title: 'Hide or unhide a record or sighting', annotations: EDITS, run: setHiddenTo,
    description: 'Moderator only. Hide or restore visibility of a record or one of its sightings.',
    inputSchema: { type: 'object', required: ['record', 'hidden', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      sighting: { type: 'integer', minimum: 1, description: 'Optional sighting id; omit to hide or unhide the whole record.' },
      hidden: { type: 'boolean', description: 'true to hide, false to unhide.' },
      summary: SUMMARY,
    } },
  },
  {
    name: 'list_reports', title: 'List open moderation reports', annotations: READS, run: listReportsMod,
    description: 'Moderator only. List unresolved moderation reports with their targets and reasons.',
    inputSchema: { type: 'object', properties: {
      after: { type: 'integer', minimum: 1, description: 'The `next` cursor from an earlier call, for later reports.' },
    } },
  },
  {
    name: 'resolve_report', title: 'Resolve a moderation report', annotations: EDITS, run: resolveReportMod,
    description: 'Moderator only. Mark an open moderation report as resolved.',
    inputSchema: { type: 'object', required: ['report', 'agent'], properties: {
      agent: AGENT,
      report: { type: 'integer', minimum: 1, description: 'Report id from list_reports.' },
    } },
  },
  {
    name: 'set_comment_hidden', title: 'Hide or unhide a comment', annotations: EDITS, run: setCommentHiddenMod,
    description: 'Moderator only. Hide or restore visibility of a comment on a record.',
    inputSchema: { type: 'object', required: ['record', 'comment', 'hidden', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      comment: { type: 'integer', minimum: 1, description: 'Comment id from get_record.' },
      hidden: { type: 'boolean', description: 'true to hide, false to unhide.' },
    } },
  },
  {
    name: 'redact_revision', title: 'Redact a past revision', annotations: EDITS, run: redactRevisionMod,
    description: 'Moderator only. Irreversibly clear the stored snapshot and summary of a past revision (cannot redact the current revision).',
    inputSchema: { type: 'object', required: ['record', 'revision', 'agent'], properties: {
      agent: AGENT,
      record: RECORD,
      revision: { type: 'integer', minimum: 1, description: 'Revision id from get_history.' },
      summary: SUMMARY,
    } },
  },
]

/** Public tool names and whether each writes, in server order. */
export const MCP_TOOLS = TOOLS.map(({ name, annotations }) => ({ name, write: annotations.readOnlyHint !== true }))

/** The tools, known tag names listed on the `categories` schema of the tools that take one. */
const INCLUDE_HIDDEN = { type: 'boolean', description: 'Moderator only. Set true to include hidden records, sightings or comments (default false).' }

export const toolList = (tags: readonly string[], moderator = false) => (moderator ? [...TOOLS, ...MOD_TOOLS] : TOOLS).map(({ run: _, ...tool }) => {
  const properties = { ...record(tool.inputSchema.properties) }
  if ('categories' in properties) properties.categories = { type: 'array', items: { type: 'string', enum: tags } }
  if (moderator && (tool.name === 'get_record' || tool.name === 'get_history')) properties.include_hidden = INCLUDE_HIDDEN
  return { ...tool, inputSchema: { ...tool.inputSchema, properties } }
})

/** What a tool answers, or null for a name that is no tool. */
export async function callTool(event: RequestEvent, name: unknown, input: unknown): Promise<ToolResult | null> {
  const tool = TOOLS.find(tool => tool.name === name) ?? MOD_TOOLS.find(tool => tool.name === name)
  if (!tool) return null
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await tool.run(event, record(input))) }] }
  } catch (cause) {
    if (cause instanceof Refusal) return { content: [{ type: 'text', text: cause.message }], isError: true }
    throw cause
  }
}
