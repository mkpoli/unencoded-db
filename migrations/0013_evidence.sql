-- A character can have more than one piece of evidence. The first evidence is
-- copied from the existing entry columns, which stay as the character's cover.
CREATE TABLE evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  place TEXT NOT NULL,
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  page TEXT,
  note TEXT,
  image_key TEXT,
  image_type TEXT,
  image_size INTEGER,
  creator_id TEXT REFERENCES persons(id),
  created_at TEXT NOT NULL
);

INSERT INTO evidence (entry_id, place, title, author, publisher, year, page, note, image_key, image_type, image_size, created_at)
SELECT id, place, title, author, publisher, year, page, note, image_key, image_type, image_size, created_at FROM entries;

CREATE INDEX evidence_entry ON evidence(entry_id, id);
CREATE INDEX evidence_image ON evidence(image_key) WHERE image_key IS NOT NULL;
