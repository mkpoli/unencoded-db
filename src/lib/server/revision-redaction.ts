// Internal primitive: callers must authorize moderators and handle current content separately.
export async function redactRevision(db: D1Database, entryId: number, revision: number): Promise<boolean> {
  if (!Number.isSafeInteger(entryId) || entryId < 1 || !Number.isSafeInteger(revision) || revision < 1) {
    throw new RangeError('Invalid revision identity')
  }
  const result = await db.prepare(`UPDATE entry_revisions SET
    script = '', ids = NULL, description = NULL, place = '', url = '', title = NULL,
    author = NULL, publisher = NULL, year = NULL, page = NULL, note = NULL, tombstone = 1
    WHERE entry_id = ? AND revision = ? RETURNING revision`).bind(entryId, revision).first()
  return result !== null
}
