-- Records now carry a source image as their evidence. The source URL column is
-- dropped; place remains required so a record still says where it came from.
-- Image lookups by key are rare, but the recovery path needs an index.
-- Visibility is preserved and its public-read index is recreated.
CREATE TABLE _entries_sequence AS SELECT seq FROM sqlite_sequence WHERE name = 'entries';

CREATE TABLE entries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script TEXT NOT NULL,
  ids TEXT,
  description TEXT,
  place TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  image_key TEXT,
  image_type TEXT,
  image_size INTEGER,
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  page TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO entries_new (
  id, script, ids, description, place, visible,
  title, author, publisher, year, page, note, created_at
)
SELECT
  id, script, ids, description, place, visible,
  title, author, publisher, year, page, note, created_at
FROM entries;

DROP TABLE entries;

ALTER TABLE entries_new RENAME TO entries;

CREATE INDEX entries_visible_id ON entries(id DESC) WHERE visible = 1;
CREATE UNIQUE INDEX entries_image_key ON entries(image_key) WHERE image_key IS NOT NULL;

-- Dropping the old table also drops its AUTOINCREMENT high-water mark. Restore
-- it so an id deleted before the migration cannot be reused.
UPDATE sqlite_sequence
SET seq = MAX(seq, COALESCE((SELECT seq FROM _entries_sequence), 0))
WHERE name = 'entries';
DROP TABLE _entries_sequence;
