-- What people say about a record: a doubt, a question, a correction to make. A comment may be about one
-- piece of evidence. Comments follow their record through a merge, and `first_entry` brings them back.
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  first_entry INTEGER NOT NULL,
  sighting_id INTEGER REFERENCES sightings(id),
  body TEXT NOT NULL,
  author TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL,
  ip_hash TEXT,
  hidden_at TEXT,
  hidden_by TEXT REFERENCES people(id)
);
CREATE INDEX comments_by_entry ON comments(entry_id, id);
