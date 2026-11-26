-- Named bulk imports whose records carry an awaiting-review mark until someone has checked them.
CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  total INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES people(id),
  created_at TEXT NOT NULL
);

ALTER TABLE entries ADD COLUMN import_id INTEGER REFERENCES imports(id);
ALTER TABLE entries ADD COLUMN reviewed_at TEXT;
ALTER TABLE entries ADD COLUMN reviewed_by TEXT REFERENCES people(id);
ALTER TABLE entries ADD COLUMN review_rev INTEGER NOT NULL DEFAULT 0;

CREATE INDEX entries_import_pending ON entries(import_id, id) WHERE import_id IS NOT NULL AND reviewed_at IS NULL AND merged_into IS NULL AND hidden_at IS NULL;
CREATE INDEX entries_by_import ON entries(import_id, id) WHERE import_id IS NOT NULL AND merged_into IS NULL AND hidden_at IS NULL;
