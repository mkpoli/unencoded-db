// Builds this app's database from an export of the previous production database, by replaying its
// records through the store: every entry, sighting, claim and journal row is written the way the
// app writes one. Run once, at the cutover.
//
//   bun scripts/import-production.ts <previous.sqlite> <media-dir> <out-dir>
//
// <media-dir> holds the previous bucket's objects, named by the last segment of their key. The
// output is <out-dir>/data.sql for `wrangler d1 execute DB --remote --file`, after the migrations,
// and <out-dir>/media/<key> for the bucket.
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseClaims, type Claim } from '../src/lib/claims'
import { parseComposition } from '../src/lib/composition'
import { genreOf, isCollection } from '../src/lib/genres'
import { splitIds } from '../src/lib/ids'
import { MEDIA_MAX } from '../src/lib/limits'
import { isRelationKind } from '../src/lib/related'
import { isScript, isSightingType, SIGHTING_TYPES } from '../src/lib/scripts'
import { cleanSourceUrl } from '../src/lib/source-url'
import { addSighting, createEntry, editEntry, editSighting, getEntry, readBox, setHidden, type EntryFields, type SightingFields, type StoredImage } from '../src/lib/server/entries'
import { prepareImage } from '../src/lib/server/image'
import { openTestDb } from '../src/lib/server/testdb'

const [oldPath, mediaDir, outDir] = process.argv.slice(2)
if (!oldPath || !mediaDir || !outDir) throw new Error('usage: bun scripts/import-production.ts <previous.sqlite> <media-dir> <out-dir>')

type Row = Record<string, any>
const old = new Database(oldPath, { readonly: true })
const rows = (sql: string, ...values: unknown[]) => old.query(sql).all(...(values as never[])) as Row[]
const has = (table: string, column?: string) => column
  ? rows(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`, column).length > 0
  : rows(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, table).length > 0

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'media'), { recursive: true })
const { db, raw } = openTestDb(join(outDir, 'database.sqlite'))
const notes: string[] = []
const text = (value: unknown) => (typeof value === 'string' && value.normalize('NFC').trim()) || null

// ---------- People ----------

// The previous database kept no names for anonymous people; each takes the name this app gives one.
const IMPORTER = 'import'
const identities = new Map(rows('SELECT person_id, subject, name FROM atlas_identities').map(row => [row.person_id, row]))
const merges = new Map(rows('SELECT source_id, target_id FROM person_merges').map(row => [row.source_id, row.target_id]))
raw.query('INSERT INTO people(id, name, created_at) VALUES(?, ?, ?)').run(IMPORTER, 'import', new Date().toISOString())
for (const person of rows('SELECT id, created_at FROM persons ORDER BY created_at, id')) {
  const identity = identities.get(person.id)
  raw.query('INSERT INTO people(id, name, atlas_sub, created_at) VALUES(?, ?, ?, ?)').run(person.id, text(identity?.name) ?? `anon-${person.id.slice(0, 6)}`, identity?.subject ?? null, person.created_at)
}
for (const [source, target] of merges) raw.query('UPDATE people SET merged_into = ? WHERE id = ?').run(target, source)

// ---------- Pictures ----------

const mediaFiles = readdirSync(mediaDir)
const pictures = new Map<string, Promise<{ image: NonNullable<Awaited<ReturnType<typeof prepareImage>>> } | null>>()
function picture(key: string) {
  if (!pictures.has(key)) pictures.set(key, (async () => {
    const stem = key.split('/').at(-1)!
    const name = mediaFiles.find(file => file === stem || file.startsWith(stem + '.'))
    if (!name) { notes.push(`picture ${key} is not in ${mediaDir}`); return null }
    const image = await prepareImage(new File([readFileSync(join(mediaDir, name))], name), Number.MAX_SAFE_INTEGER)
    if (!image) { notes.push(`picture ${key} is not an image this app stores`); return null }
    writeFileSync(join(outDir, 'media', image.key), image.bytes)
    return { image }
  })())
  return pictures.get(key)!
}

// The cover a browser would have made: the marked part, or the whole picture, at most 640 pixels.
async function thumbnail(source: string, box: [number, number, number, number] | null) {
  const out = join(outDir, 'thumb.webp')
  const crop = box ? ['-crop', `${box[2]}x${box[3]}+${box[0]}+${box[1]}`, '+repage'] : []
  const made = Bun.spawnSync(['magick', source, ...crop, '-resize', '640x640>', '-strip', '-quality', '85', out])
  if (made.exitCode !== 0) throw new Error(`magick failed: ${made.stderr.toString()}`)
  const thumb = await prepareImage(new File([readFileSync(out)], 'thumb.webp'), Number.MAX_SAFE_INTEGER)
  rmSync(out)
  if (!thumb) throw new Error('thumbnail is not an image')
  writeFileSync(join(outDir, 'media', thumb.key), thumb.bytes)
  return thumb.key
}

async function mediaOf(evidence: Row): Promise<StoredImage[]> {
  const keys: string[] = rows('SELECT m.key FROM evidence_media em JOIN media m ON m.id = em.media_id WHERE em.evidence_id = ? ORDER BY m.id', evidence.id).map(row => row.key)
  if (evidence.image_key) { const at = keys.indexOf(evidence.image_key); if (at > 0) keys.splice(at, 1); if (at !== 0) keys.unshift(evidence.image_key) }
  if (keys.length > MEDIA_MAX) throw new Error(`evidence ${evidence.id} has ${keys.length} pictures; a sighting holds ${MEDIA_MAX}`)
  const crops = has('crops') ? rows('SELECT x, y, w, h FROM crops WHERE evidence_id = ? ORDER BY id', evidence.id) : []
  if (crops.length > 1) notes.push(`evidence ${evidence.id}: ${crops.length} marks, the first is kept on the first picture`)
  const out: StoredImage[] = []
  for (const [index, key] of keys.entries()) {
    const found = await picture(key)
    if (!found) continue
    const { image } = found
    const crop = index === 0 ? crops[0] : null
    // A mark was a percentage of the picture; here it is in its pixels.
    const box = crop ? readBox(JSON.stringify([crop.x * image.width / 100, crop.y * image.height / 100, crop.w * image.width / 100, crop.h * image.height / 100]), image.width, image.height) : null
    out.push({ image_key: image.key, image_type: image.type, image_w: image.width, image_h: image.height, thumb_key: await thumbnail(join(outDir, 'media', image.key), box ? JSON.parse(box) : null), box })
  }
  return out
}

// ---------- Records ----------

const claim = (kind: Claim['kind'], value: string, data: Claim['data'] = null, sighting_id: number | null = null): Claim => ({ kind, value, data, sighting_id })
const link = (value: unknown) => { const found = text(value); return found && /^https?:\/\//i.test(found) ? cleanSourceUrl(found) : null }

function sightingFields(row: Row): SightingFields {
  const types = (() => { try { return SIGHTING_TYPES.filter(type => (JSON.parse(row.types ?? '[]') as unknown[]).some(value => isSightingType(value) && value === type)) } catch { return [] } })()
  const provider = [text(row.provider), text(row.provider_url)].filter(Boolean).join(' ')
  return {
    place: text(row.place) ?? '', url: link(row.url) ?? link(row.place), title: text(row.title), author: text(row.author), publisher: text(row.publisher),
    report_date: text(row.year), original_date: null, page: text(row.page), context: null, style: null,
    types: types.length ? JSON.stringify(types) : null,
    note: [text(row.note), provider].filter(Boolean).join('\n') || null,
  }
}

function claimsOf(entry: Row, sightings: Map<number, number>): Claim[] {
  const claims: Claim[] = splitIds(entry.ids).map(sequence => claim('ids', sequence))
  const composition = has('entries', 'composition') ? parseComposition(entry.composition) : null
  if (composition) claims.push(claim('composition', composition.ids, { parts: composition.parts, roles: composition.roles, formation: composition.formation }))
  if (has('senses')) for (const sense of rows('SELECT gloss, reading, evidence_id FROM senses WHERE entry_id = ? ORDER BY id', entry.id)) {
    const on = sightings.get(sense.evidence_id) ?? null
    if (text(sense.reading)) claims.push(claim('reading', text(sense.reading)!, null, on))
    if (text(sense.gloss)) claims.push(claim('meaning', text(sense.gloss)!, null, on))
  }
  const encodings = has('entry_encodings') ? rows('SELECT charset, code FROM entry_encodings WHERE entry_id = ? ORDER BY created_at, rowid', entry.id) : []
  if (!encodings.length && text(entry.encoded_as)) encodings.push({ charset: 'unicode', code: entry.encoded_as })
  for (const encoding of encodings) claims.push(claim('encoding', text(encoding.code)!, { charset: text(encoding.charset) ?? 'unicode' }))
  for (const item of JSON.parse(entry.comparisons ?? '[]') as Row[]) {
    if (!text(item.character) || !isRelationKind(item.relationship)) { notes.push(`entry ${entry.id}: comparison ${JSON.stringify(item)} is not a relation this app records`); continue }
    const difference = text(item.differences ?? item.difference), evidence = text(item.evidence)
    claims.push(claim('relation', text(item.character)!, { relationship: item.relationship, ...(difference ? { difference } : {}), ...(evidence ? { evidence } : {}) }))
  }
  if (has('relations')) for (const relation of rows('SELECT to_character, kind, evidence_id, difference FROM relations WHERE from_entry = ? ORDER BY id', entry.id)) {
    if (!isRelationKind(relation.kind)) { notes.push(`entry ${entry.id}: relation kind ${relation.kind} is not one this app records`); continue }
    claims.push(claim('relation', text(relation.to_character)!, { relationship: relation.kind, ...(text(relation.difference) ? { difference: text(relation.difference) } : {}) }, sightings.get(relation.evidence_id) ?? null))
  }
  if (text(entry.equivalent_to)) claims.push(claim('normalizes_to', text(entry.equivalent_to)!))
  if (entry.ivd_status === 'none') claims.push(claim('ivd', 'none'))
  if (entry.ivd_status === 'registered' && text(entry.ivd_sequence)) claims.push(claim('ivd', text(entry.ivd_sequence)!))
  if (has('entry_genres')) for (const { genre } of rows('SELECT genre FROM entry_genres WHERE entry_id = ? ORDER BY rowid', entry.id)) genreOf(genre) ? claims.push(claim('genre', genre)) : notes.push(`entry ${entry.id}: category ${genre} is not one this app has`)
  if (has('entry_collections')) for (const { collection } of rows('SELECT collection FROM entry_collections WHERE entry_id = ? ORDER BY rowid', entry.id)) isCollection(collection) ? claims.push(claim('collection', collection)) : notes.push(`entry ${entry.id}: collection ${collection} is not one this app has`)
  if (has('character_tags')) for (const { tag } of rows('SELECT tag FROM character_tags WHERE entry_id = ? ORDER BY rowid', entry.id)) claims.push(claim('tag', text(tag)!.replace(/[\s,，、|]+/gu, '-')))
  const valid = parseClaims(claims)
  if (!valid) throw new Error(`entry ${entry.id}: its claims are not ones this app writes: ${JSON.stringify(claims)}`)
  return valid
}

// Sets when the rows a store call just wrote were written.
let journalMark = 0
function dated(at: string) {
  raw.query('UPDATE revisions SET at = ? WHERE id > ?').run(at, journalMark)
  journalMark = (raw.query('SELECT COALESCE(MAX(id), 0) AS id FROM revisions').get() as { id: number }).id
}

for (const entry of rows('SELECT * FROM entries ORDER BY id')) {
  const scriptOf = (value: unknown) => { const script = String(value).toLowerCase(); return { script: isScript(script) ? script : 'other', script_other: isScript(script) ? null : text(value) } }
  const scalars = { ...scriptOf(entry.script), status: 'unchecked', radical: text(entry.radical), strokes: Number.isInteger(entry.strokes) ? entry.strokes : null }
  const creator = entry.creator_id ?? IMPORTER
  const evidence = rows('SELECT * FROM evidence WHERE entry_id = ? ORDER BY id', entry.id)
  if (!evidence.length) throw new Error(`entry ${entry.id} has no evidence`)
  const history = rows('SELECT * FROM entry_revisions WHERE entry_id = ? AND tombstone = 0 ORDER BY revision', entry.id)
  const first = history[0] ?? entry

  // The first recorded state. A past revision held the entry's text and its first evidence's citation.
  const cited = (state: Row): SightingFields => ({ ...sightingFields(evidence[0]), ...Object.fromEntries(Object.entries(sightingFields({ ...evidence[0], ...state, url: null, types: null })).filter(([field]) => ['place', 'title', 'author', 'publisher', 'report_date', 'page', 'note'].includes(field))), url: null, types: null } as SightingFields)
  const stated = (state: Row): EntryFields => ({ ...scalars, ...scriptOf(state.script), radical: null, strokes: null, description: text(state.description), claims: splitIds(state.ids).map(sequence => claim('ids', sequence)) })
  const id = await createEntry(db, stated(first), cited(first), [], { actor: creator, ip: null })
  if (id !== entry.id) throw new Error(`entry ${entry.id} would become ${id}`)
  raw.query('UPDATE entries SET created_at = ?, updated_at = ? WHERE id = ?').run(entry.created_at, entry.created_at, id)
  raw.query('UPDATE sightings SET created_at = ?, updated_at = ? WHERE entry_id = ?').run(evidence[0].created_at, evidence[0].created_at, id)
  dated(first.recorded_at ?? entry.created_at)

  const sightingIds = new Map<number, number>([[evidence[0].id, (await getEntry(db, id))!.sightings[0].id]])
  const who = { actor: IMPORTER, ip: null }
  const current = async () => (await getEntry(db, id))!
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const entryState = async () => { const { entry: row, claims } = await current(); return { script: row.script, script_other: row.script_other, description: row.description, status: row.status, radical: row.radical, strokes: row.strokes, claims } }
  const sightingState = async (sighting: number) => { const found = (await current()).sightings.find(item => item.id === sighting)!; return { fields: Object.fromEntries(Object.keys(cited(first)).map(field => [field, (found as Row)[field]])) as SightingFields, media: found.media, rev: found.rev } }

  // Each later revision that recorded a different state is that edit, at its own time. The previous
  // database did not record who made it.
  for (const state of history.slice(1)) {
    const before = await entryState(), next = { ...before, ...scriptOf(state.script), description: stated(state).description, claims: stated(state).claims }
    if (!same(before, next)) { const done = await editEntry(db, id, (await current()).entry.rev, next, who, null); if (!done.ok) throw new Error(`entry ${id} r${state.revision}: ${done.code}`) }
    const sighting = await sightingState(sightingIds.get(evidence[0].id)!)
    if (!same(sighting.fields, cited(state))) { const done = await editSighting(db, sightingIds.get(evidence[0].id)!, sighting.rev, cited(state), null, who, null, id); if (!done.ok) throw new Error(`entry ${id} r${state.revision}: ${done.code}`) }
    dated(state.recorded_at)
  }

  // What the database holds now: the other evidence, then everything the old revisions left out.
  for (const row of evidence.slice(1)) {
    const sighting = await addSighting(db, id, sightingFields(row), await mediaOf(row), { actor: row.creator_id ?? creator, ip: null })
    if (!sighting) throw new Error(`evidence ${row.id} was not added`)
    sightingIds.set(row.id, sighting)
    raw.query('UPDATE sightings SET created_at = ?, updated_at = ? WHERE id = ?').run(row.created_at, row.created_at, sighting)
    dated(row.created_at)
  }
  const sighting = await sightingState(sightingIds.get(evidence[0].id)!)
  const media = await mediaOf(evidence[0])
  if (!same(sighting.fields, sightingFields(evidence[0])) || media.length) {
    const done = await editSighting(db, sightingIds.get(evidence[0].id)!, sighting.rev, sightingFields(evidence[0]), media, who, null, id)
    if (!done.ok) throw new Error(`entry ${id}: first evidence: ${done.code}`)
  }
  const final: EntryFields = { ...scalars, description: text(entry.description), claims: claimsOf(entry, sightingIds) }
  if (!same(await entryState(), final)) { const done = await editEntry(db, id, (await current()).entry.rev, final, who, null); if (!done.ok) throw new Error(`entry ${id}: ${done.code}`) }
  if (!entry.visible) await setHidden(db, { entry: id }, true, who, null)
  dated(history.at(-1)?.recorded_at ?? entry.created_at)

  if (has('entry_reports')) for (const report of rows('SELECT * FROM entry_reports WHERE entry_id = ? ORDER BY id', entry.id)) {
    const dismissed = has('report_dismissals') && rows('SELECT 1 FROM report_dismissals WHERE report_id = ?', report.id).length > 0
    raw.query('INSERT INTO reports(entry_id, reason, reporter, at, resolved_at, resolved_by) VALUES(?, ?, ?, ?, ?, ?)').run(id, [text(report.reason), text(report.note)].filter(Boolean).join(': ') || 'report', report.reporter_id ?? IMPORTER, report.created_at, dismissed ? report.created_at : null, dismissed ? IMPORTER : null)
  }
}

// ---------- Output ----------

raw.exec('PRAGMA wal_checkpoint(TRUNCATE)')
const dump = Bun.spawnSync(['sqlite3', join(outDir, 'database.sqlite'), '.dump'])
if (dump.exitCode !== 0) throw new Error(dump.stderr.toString())
const data = dump.stdout.toString().split('\n').filter(line => line.startsWith('INSERT INTO') && !/^INSERT INTO "?(sqlite_sequence|d1_migrations)/.test(line))
// Rows refer to rows that come later in the file, such as the person one was merged into.
writeFileSync(join(outDir, 'data.sql'), 'PRAGMA defer_foreign_keys = true;\n' + data.join('\n') + '\n')
const count = (table: string) => (raw.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
console.log(Object.fromEntries(['people', 'entries', 'claims', 'sources', 'sightings', 'sighting_media', 'revisions', 'entry_tags', 'reports'].map(table => [table, count(table)])))
console.log(`${readdirSync(join(outDir, 'media')).length} objects in ${join(outDir, 'media')}`)
for (const note of notes) console.log('note:', note)
if (!existsSync(join(outDir, 'data.sql'))) throw new Error('no output')
