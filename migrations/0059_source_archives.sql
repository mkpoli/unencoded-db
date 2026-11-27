-- Copies of a source kept by web archives, so the evidence stays traceable after the page is gone.
-- The source row is fixed by its citation, so the copies live beside it.
CREATE TABLE source_archives (
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  PRIMARY KEY (source_id, url)
) WITHOUT ROWID;

CREATE TABLE source_archive_changes (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  removed INTEGER NOT NULL,
  actor TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX source_archive_changes_by_source ON source_archive_changes(source_id, id);
