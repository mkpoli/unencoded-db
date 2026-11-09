import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { applyMigration } from '../test-support'
import { redactRevision } from '../lib/server/revision-redaction'
import { actions, load as editLoad } from './[locale]/entry/[id]/edit/+page.server'
import { load as history } from './[locale]/entry/[id]/history/+page.server'

function dbSetup() {
  const db = new Database(':memory:')
  applyMigration(db, '0001_init.sql')
  applyMigration(db, '0002_entry_visibility.sql')
  db.exec("INSERT INTO entries (script,place,url,title,created_at) VALUES ('old','book','https://example.org','title','2026')")
  applyMigration(db, '0003_related_characters.sql')
  applyMigration(db, '0004_attribution.sql')
  applyMigration(db, '0005_oidc.sql')
  applyMigration(db, '0006_source_images.sql')
  applyMigration(db, '0007_revisions.sql')
  applyMigration(db, '0008_edit_generation.sql')
  applyMigration(db, '0009_revision_redaction.sql')
  applyMigration(db, '0013_evidence.sql')
  applyMigration(db, '0014_genres.sql')
  applyMigration(db, '0015_date_precision.sql')
  applyMigration(db, '0016_collections.sql')
  applyMigration(db, '0017_shared_sources.sql')
  applyMigration(db, '0022_character_metadata.sql')
  applyMigration(db, '0023_character_tags.sql')
  applyMigration(db, '0024_senses.sql')
  applyMigration(db, '0025_strokes.sql')
  return db
}
function binding(db: Database) {
  return { prepare(sql: string) { return { bind(...values: (string | number | null)[]) { return {
    first: async () => db.query(sql).get(...values), all: async () => ({ results: db.query(sql).all(...values) }), run: async () => db.query(sql).run(...values)
  } } } } }
}
function event(db: Database, values: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return { params: { locale: 'en', id: '1' }, platform: { env: { DB: binding(db) } }, request: new Request('https://example.test/en/entry/1/edit', { method: 'POST', body: form }), url: new URL('https://example.test/en/entry/1/history') } as any
}

describe('revisions', () => {
  test('revision schema covers every content column', () => {
    const db = dbSetup()
    try {
      const columns = db.query("SELECT name FROM pragma_table_info('entry_revisions')").all().map((row: any) => row.name)
      expect(columns).toEqual(['entry_id', 'revision', 'script', 'ids', 'description', 'place', 'title', 'author', 'publisher', 'year', 'page', 'note', 'recorded_at', 'tombstone'])
    } finally { db.close() }
  })
  test('edit and redaction serialize across database connections', async () => {
    const initial = dbSetup()
    const path = `${tmpdir()}/concurrency-test-${crypto.randomUUID()}.sqlite`
    writeFileSync(path, initial.serialize())
    initial.close()
    const editor = new Database(path)
    const redactor = new Database(path)
    try {
      const api = binding(redactor) as any
      // Redaction first cannot remove the current revision.
      await expect(redactRevision(api, 1, 1)).rejects.toThrow()
      editor.exec('BEGIN IMMEDIATE')
      editor.exec("UPDATE entries SET script='edited', revision=revision+1 WHERE id=1")
      // The open write transaction blocks redaction, and its uncommitted edit stays invisible.
      await expect(redactRevision(api, 1, 1)).rejects.toThrow()
      expect(redactor.query('SELECT tombstone FROM entry_revisions WHERE revision=1').get()).toEqual({ tombstone: 0 })
      expect(redactor.query('SELECT count(*) AS n FROM revision_redaction_audit').get()).toEqual({ n: 0 })
      editor.exec('COMMIT')
      expect(await redactRevision(api, 1, 1)).toBe(true)
      await expect(redactRevision(api, 1, 2)).rejects.toThrow()
      expect(redactor.query('SELECT revision, tombstone FROM entry_revisions ORDER BY revision').all()).toEqual([
        { revision: 1, tombstone: 1 }, { revision: 2, tombstone: 0 }
      ])
    } finally { editor.close(); redactor.close(); unlinkSync(path) }
  })
  test('redaction guard, audit rollback, and projection', async () => {
    const db = dbSetup()
    try {
      const api = binding(db) as any
      const scrub = "script='', ids=NULL, description=NULL, place='', title=NULL, author=NULL, publisher=NULL, year=NULL, page=NULL, note=NULL, tombstone=1"
      // A current snapshot remains protected; an edit makes the old snapshot eligible.
      await expect(redactRevision(api, 1, 1)).rejects.toThrow()
      db.exec("UPDATE entries SET script='current', revision=revision+1 WHERE id=1")
      // An audit row cannot be pre-seeded for a revision that is not redacted.
      expect(() => db.exec("INSERT INTO revision_redaction_audit (entry_id, revision, redacted_at) VALUES (1, 1, 'forged')")).toThrow()
      for (const alteration of [
        "script='tampered'", 'tombstone=1', `${scrub}, title='leak'`, `${scrub}, recorded_at='changed'`,
        `${scrub}, revision=3`, `${scrub}, entry_id=2`, `${scrub}, ids='leak'`, `${scrub}, description='leak'`,
        `${scrub}, place='leak'`, `${scrub}, author='leak'`, `${scrub}, publisher='leak'`,
        `${scrub}, year='leak'`, `${scrub}, page='leak'`, `${scrub}, note='leak'`, `${scrub}, script='leak'`
      ]) expect(() => db.exec(`UPDATE entry_revisions SET ${alteration} WHERE entry_id=1 AND revision=1`)).toThrow()
      expect(() => db.exec("INSERT INTO entry_revisions (entry_id, revision, script, place, recorded_at, tombstone) VALUES (1, 99, '', '', 'time', 1)")).toThrow()
      expect(() => db.exec("INSERT INTO entry_revisions (entry_id, revision, script, place, recorded_at) VALUES (1, 50, 'forged', 'p', 't')")).toThrow()
      expect(() => db.exec(`UPDATE OR REPLACE entry_revisions SET ${scrub}, revision=3 WHERE entry_id=1 AND revision=1`)).toThrow()
      expect(() => db.exec("INSERT OR REPLACE INTO entry_revisions (entry_id, revision, script, place, recorded_at) VALUES (1, 1, 'x', 'x', 'time')")).toThrow()
      expect(() => db.exec('DELETE FROM entry_revisions WHERE revision=1')).toThrow()
      db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON revision_redaction_audit BEGIN SELECT RAISE(ABORT, 'audit failure'); END")
      await expect(redactRevision(api, 1, 1)).rejects.toThrow()
      expect(db.query('SELECT script, tombstone FROM entry_revisions WHERE revision=1').get()).toEqual({ script: 'old', tombstone: 0 })
      db.exec('DROP TRIGGER fail_audit')
      expect(await redactRevision(api, 1, 1)).toBe(true)
      expect(await redactRevision(api, 1, 99)).toBe(false)
      await expect(redactRevision(api, 1, 1)).rejects.toThrow()
      expect(db.query('SELECT entry_id, revision FROM revision_redaction_audit').all()).toEqual([{ entry_id: 1, revision: 1 }])
      expect(() => db.exec('DELETE FROM revision_redaction_audit')).toThrow()
      expect(() => db.exec("UPDATE revision_redaction_audit SET redacted_at='x'")).toThrow()
      expect(() => db.exec("INSERT OR REPLACE INTO revision_redaction_audit VALUES (1, 1, 'x')")).toThrow()
      expect(() => db.exec("INSERT INTO revision_redaction_audit (entry_id, revision, redacted_at) VALUES (1, 99, 'x')")).toThrow()
      const result = await history(event(db)) as any
      expect(result.revisions[0].script).toBe('current')
      expect(result.revisions[1]).toEqual({ entry_id: 1, revision: 1, recorded_at: '2026', tombstone: true })
      expect(JSON.stringify(result.revisions[1])).not.toContain('script')
      db.exec('UPDATE entries SET visible=0 WHERE id=1')
      await expect(history(event(db))).rejects.toMatchObject({ status: 404 })
      db.exec('UPDATE entries SET visible=1 WHERE id=1')
      expect((await history(event(db)) as any).revisions[1].tombstone).toBe(true)
    } finally { db.close() }
  })
  test('redaction fails closed for an orphan revision', async () => {
    const orphan = new Database(':memory:')
    try {
      applyMigration(orphan, '0001_init.sql')
      applyMigration(orphan, '0002_entry_visibility.sql')
      orphan.exec("INSERT INTO entries (script,place,url,created_at) VALUES ('old','book','https://example.org','2026')")
      applyMigration(orphan, '0003_related_characters.sql')
      applyMigration(orphan, '0004_attribution.sql')
      applyMigration(orphan, '0005_oidc.sql')
      applyMigration(orphan, '0006_source_images.sql')
      applyMigration(orphan, '0007_revisions.sql')
      applyMigration(orphan, '0008_edit_generation.sql')
      applyMigration(orphan, '0009_revision_redaction.sql')
      orphan.exec("UPDATE entries SET script='new', revision=revision+1 WHERE id=1")
      orphan.exec('DELETE FROM entries WHERE id=1')
      await expect(redactRevision(binding(orphan) as any, 1, 1)).rejects.toThrow()
    } finally { orphan.close() }
  })
  test('backfills, snapshots atomically, rejects stale edits and hides every revision', async () => {
    const db = dbSetup()
    try {
      expect(db.query('SELECT revision, title FROM entry_revisions').get()).toEqual({ revision: 1, title: 'title' })
      const values = { revision: '1', edit_generation: '1', script: 'new', ids: 'X', description: 'D' }
      await expect(actions.character!(event(db, values))).rejects.toMatchObject({ status: 303, location: '/en/entry/1' })
      expect(db.query('SELECT revision, script, ids, description, place, title FROM entry_revisions WHERE revision = 2').get()).toEqual({ revision: 2, script: 'new', ids: 'X', description: 'D', place: 'book', title: 'title' })
      const stale = await actions.character!(event(db, { ...values, description: 'unsaved' })) as any
      expect(stale.status).toBe(409)
      expect(stale.data.values.description).toBe('unsaved')
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 2 })
      expect(() => db.exec("UPDATE entry_revisions SET title = 'tamper'")).toThrow()
      expect(() => db.exec('DELETE FROM entry_revisions')).toThrow()
      expect(() => db.exec("INSERT OR REPLACE INTO entry_revisions (entry_id, revision, script, ids, description, place, title, author, publisher, year, page, note, recorded_at) SELECT entry_id, revision, script, ids, description, place, title, author, publisher, year, page, note, recorded_at FROM entry_revisions WHERE revision = 1")).toThrow()
      expect(() => db.exec('UPDATE entries SET revision = 5 WHERE id = 1')).toThrow()
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      expect(() => db.exec("INSERT OR REPLACE INTO entries (id, revision, script, place, created_at) VALUES (1, 5, 'replacement', 'book', '2026')")).toThrow()
      expect(db.query('SELECT visible, revision FROM entries WHERE id = 1').get()).toEqual({ visible: 0, revision: 2 })
      await expect(editLoad(event(db))).rejects.toMatchObject({ status: 404 })
      await expect(history(event(db))).rejects.toMatchObject({ status: 404 })
      await expect(actions.character!(event(db, values))).rejects.toMatchObject({ status: 404 })
      db.exec('UPDATE entries SET visible = 1 WHERE id = 1')
      const restored = await history(event(db)) as any
      expect(restored.revisions.find((r: any) => r.revision === 1).title).toBe('title')
    } finally { db.close() }
  })
  test('visibility transitions invalidate old forms without creating revisions', async () => {
    const db = dbSetup()
    try {
      const loaded = await editLoad(event(db)) as any
      expect(loaded.entry.edit_generation).toBe(1)
      const values = { revision: '1', edit_generation: '1', script: 'unsaved', place: 'book' }
      db.exec('UPDATE entries SET visible = 1 WHERE id = 1')
      expect(db.query('SELECT edit_generation FROM entries').get()).toEqual({ edit_generation: 1 })
      db.exec('UPDATE entries SET visible = 0 WHERE id = 1')
      await expect(actions.character!(event(db, values))).rejects.toMatchObject({ status: 404 })
      db.exec('UPDATE entries SET visible = 1 WHERE id = 1')
      expect(db.query('SELECT revision, edit_generation FROM entries').get()).toEqual({ revision: 1, edit_generation: 3 })
      const stale = await actions.character!(event(db, values)) as any
      expect(stale.status).toBe(409)
      expect(stale.data.values.script).toBe('unsaved')
      expect(stale.data.generation).toBe('1')
      const invalid = await actions.character!(event(db, { ...values, script: '' })) as any
      expect(invalid.status).toBe(400)
      expect(invalid.data.generation).toBe('1')
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 1 })
      expect(db.query('SELECT script FROM entries').get()).toEqual({ script: 'old' })
      await expect(actions.character!(event(db, { ...values, edit_generation: '3' }))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 2 })
      const missing = await actions.character!(event(db, { revision: '2', script: 'missing', place: 'book' })) as any
      expect(missing.status).toBe(400)
      expect(missing.data.generation).toBeNull()
    } finally { db.close() }
  })
  test('generation rejects resets, fractional values and invalid combined transitions', () => {
    const db = dbSetup()
    try {
      db.exec('UPDATE entries SET edit_generation = edit_generation + 1 WHERE id = 1')
      for (const value of ['1', '0', '2', '2.5', '4']) {
        expect(() => db.exec(`UPDATE entries SET edit_generation = ${value} WHERE id = 1`)).toThrow()
      }
      expect(() => db.exec('UPDATE entries SET visible = 0, edit_generation = 1 WHERE id = 1')).toThrow()
      expect(db.query('SELECT visible, edit_generation FROM entries').get()).toEqual({ visible: 1, edit_generation: 2 })
      db.exec('UPDATE entries SET visible = 0, edit_generation = edit_generation + 1 WHERE id = 1')
      expect(db.query('SELECT visible, edit_generation FROM entries').get()).toEqual({ visible: 0, edit_generation: 4 })
      db.exec('UPDATE entries SET visible = 1 WHERE id = 1')
      expect(db.query('SELECT visible, edit_generation FROM entries').get()).toEqual({ visible: 1, edit_generation: 5 })
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 1 })
    } finally { db.close() }
  })
  test('a failed generation increment rolls back visibility', () => {
    const db = dbSetup()
    try {
      db.exec("CREATE TRIGGER reject_generation BEFORE UPDATE OF edit_generation ON entries BEGIN SELECT RAISE(ABORT, 'failure'); END")
      expect(() => db.exec('UPDATE entries SET visible = 0 WHERE id = 1')).toThrow()
      expect(db.query('SELECT visible, edit_generation FROM entries').get()).toEqual({ visible: 1, edit_generation: 1 })
    } finally { db.close() }
  })
  test('edits report every invalid field and keep the submitted text', async () => {
    const db = dbSetup()
    try {
      const values = { revision: '1', edit_generation: '1', script: 'Han', ids: 'i'.repeat(201), description: 'd'.repeat(5001), radical: 'r'.repeat(21), encoded_as: 'e'.repeat(81), tags: 'kept' }
      const invalid = await actions.character!(event(db, values)) as any
      expect(invalid.status).toBe(400)
      expect(invalid.data.errors.ids).toContain('length')
      expect(invalid.data.errors.description).toContain('length')
      expect(invalid.data.errors.radical).toContain('length')
      expect(invalid.data.errors.encoded_as).toContain('length')
      expect(invalid.data.values.tags).toBe('kept')
      expect(db.query('SELECT count(*) AS n FROM entry_revisions').get()).toEqual({ n: 1 })
      const missingScript = await actions.character!(event(db, { ...values, ids: '', description: '', radical: '', encoded_as: '', script: '' })) as any
      expect(missingScript.status).toBe(400)
      expect(missingScript.data.errors.script).toContain('script')
      await expect(actions.character!(event(db, { ...values, script: 'Han', ids: '', description: '', radical: '', encoded_as: '', tags: '新, 客家', sense_gloss: '意味', sense_reading: 'いみ', comparison_character: '漢', comparison_relationship: 'variant', comparison_differences: '一画', comparison_evidence: '4頁' }))).rejects.toMatchObject({ status: 303 })
      expect(db.query('SELECT ids, description FROM entry_revisions WHERE revision = 2').get()).toEqual({ ids: null, description: null })
      expect(db.query('SELECT tag FROM character_tags ORDER BY tag').all()).toEqual([{ tag: '客家' }, { tag: '新' }])
      expect(db.query('SELECT gloss, reading FROM senses').get()).toEqual({ gloss: '意味', reading: 'いみ' })
      expect(JSON.parse((db.query('SELECT comparisons FROM entries').get() as any).comparisons)).toHaveLength(1)
    } finally { db.close() }
  })
  test('snapshot failure rolls back both inserts and updates', () => {
    const db = dbSetup()
    try {
      db.exec("CREATE TRIGGER reject_snapshot BEFORE INSERT ON entry_revisions BEGIN SELECT RAISE(ABORT, 'failure'); END")
      expect(() => db.exec("INSERT INTO entries (script, place, created_at) VALUES ('new', 'book', '2026')")).toThrow()
      expect(db.query('SELECT count(*) AS n FROM entries').get()).toEqual({ n: 1 })
      expect(() => db.exec("UPDATE entries SET script = 'new', revision = revision + 1 WHERE id = 1")).toThrow()
      expect(db.query('SELECT script, revision FROM entries WHERE id = 1').get()).toEqual({ script: 'old', revision: 1 })
      expect(() => db.exec("UPDATE entries SET script = 'new' WHERE id = 1")).toThrow()
    } finally { db.close() }
  })
  test('history pages are bounded and use the primary key', async () => {
    const db = dbSetup()
    try {
      for (let n = 0; n < 40; n++) db.exec('UPDATE entries SET revision = revision + 1 WHERE id = 1')
      const e = event(db)
      const first = await history(e) as any
      expect(first.revisions).toHaveLength(20)
      expect(first.next).toBe(22)
      e.url.searchParams.set('before', String(first.next))
      const second = await history(e) as any
      expect(second.revisions).toHaveLength(20)
      expect(second.next).toBe(2)
      e.url.searchParams.set('before', String(second.next))
      expect((await history(e) as any).revisions.map((r: any) => r.revision)).toEqual([1])
      const plan = db.query('EXPLAIN QUERY PLAN SELECT r.* FROM entry_revisions r JOIN entries e ON e.id = r.entry_id AND e.visible = 1 WHERE r.entry_id = ? AND r.revision < ? ORDER BY r.revision DESC LIMIT 21').all(1, 40) as { detail: string }[]
      expect(plan.some(p => /SEARCH r USING PRIMARY KEY \(entry_id=\? AND revision<\?\)/.test(p.detail))).toBe(true)
      expect(plan.some(p => /SCAN|TEMP B-TREE/.test(p.detail))).toBe(false)
    } finally { db.close() }
  })
})
