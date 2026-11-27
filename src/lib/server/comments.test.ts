import { expect, test } from 'bun:test'
import { newClaim } from '$lib/claims'
import { addComment, cleanComment, commentsOf, setCommentHidden } from './comments'
import { createEntry, mergeEntry, unmergeEntry, type EntryFields, type SightingFields } from './entries'
import { createPerson } from './people'
import { openTestDb } from './testdb'

const fields = (ids: string): EntryFields => ({ script: 'han', script_other: null, description: null, radical: null, strokes: null, claims: [newClaim('ids', ids)] })
const sighting: SightingFields = { place: 'Source', url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, vias: [], closeness: null, original_date: null, page: null, contexts: null, style: null, types: null, quotes: null, note: null }

test('a comment is trimmed and bounded', () => {
  expect(cleanComment('  one\r\ntwo  ')).toBe('one\ntwo')
  expect(cleanComment('   ')).toBeNull()
  expect(cleanComment('x'.repeat(4001))).toBeNull()
  expect(cleanComment(null)).toBeNull()
})

test('comments read oldest first under their writer, and a hidden one only for a moderator', async () => {
  const { db } = openTestDb()
  const author = await createPerson(db), reader = await createPerson(db)
  const entry = await createEntry(db, fields('⿰山東'), sighting, [], { actor: author.id, ip: null })
  const first = await addComment(db, { entry }, 'Is this 觀?', { actor: reader.id, ip: null })
  const second = await addComment(db, { entry, sighting: 1 }, 'The date looks late.', { actor: author.id, ip: null })
  expect((await commentsOf(db, entry)).map(comment => [comment.id, comment.sighting_id, comment.by_id])).toEqual([[first, null, reader.id], [second, 1, author.id]])
  expect(await setCommentHidden(db, entry, first, true, author.id)).toBe(true)
  expect(await setCommentHidden(db, entry + 1, second, true, author.id)).toBe(false)
  expect((await commentsOf(db, entry)).map(comment => comment.id)).toEqual([second])
  expect((await commentsOf(db, entry, true)).map(comment => Boolean(comment.hidden_at))).toEqual([true, false])
  await setCommentHidden(db, entry, first, false, author.id)
  expect(await commentsOf(db, entry)).toHaveLength(2)
})

test('comments follow a merged record and return when it is taken apart', async () => {
  const { db } = openTestDb()
  const who = { actor: (await createPerson(db)).id, ip: null }
  const a = await createEntry(db, fields('⿰山東'), sighting, [], who), b = await createEntry(db, fields('⿰山西'), sighting, [], who)
  await addComment(db, { entry: a }, 'on a', who)
  await addComment(db, { entry: b }, 'on b', who)
  await mergeEntry(db, b, a, who, null)
  expect((await commentsOf(db, a)).map(comment => comment.body)).toEqual(['on a', 'on b'])
  await addComment(db, { entry: a, sighting: 2 }, 'on the evidence b brought', who)
  await unmergeEntry(db, b, who)
  expect((await commentsOf(db, b)).map(comment => comment.body)).toEqual(['on b', 'on the evidence b brought'])
  expect((await commentsOf(db, a)).map(comment => comment.body)).toEqual(['on a'])
})

test('a record reads its comments through the index', () => {
  const { raw } = openTestDb()
  const plan = (raw.query('EXPLAIN QUERY PLAN SELECT id FROM comments c WHERE c.entry_id = ? AND c.hidden_at IS NULL ORDER BY c.id DESC LIMIT 200').all(1) as { detail: string }[]).map(row => row.detail).join('\n')
  expect(plan).toContain('comments_by_entry')
  expect(plan).not.toContain('TEMP B-TREE')
})
