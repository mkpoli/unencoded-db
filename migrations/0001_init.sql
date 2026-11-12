-- Whoever writes. A browser becomes a person on its first write, named anon-1a2b3c; signing in through
-- Glyph Atlas joins that person to the account's person through merged_into, and nothing written is
-- rewritten.
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  atlas_sub TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','moderator')),
  merged_into TEXT REFERENCES people(id),
  banned_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX people_merged ON people(merged_into) WHERE merged_into IS NOT NULL;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  person TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_created_at ON sessions(created_at);

-- One character, however many times it was seen. The columns hold what a character has exactly one of;
-- what it can have several of is a row in `claims`. `ids` repeats the first description, and the cover,
-- the counts and the evidence summary repeat the sightings, so a list draws its tiles from this table alone.
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rev INTEGER NOT NULL DEFAULT 1,
  script TEXT NOT NULL,
  script_other TEXT,
  status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','unencoded','variant','encoded','doubtful')),
  description TEXT,
  radical TEXT,
  strokes INTEGER,
  ids TEXT,
  cover_key TEXT,
  cover_place TEXT,
  sightings INTEGER NOT NULL DEFAULT 0,
  types TEXT CHECK (types IS NULL OR json_valid(types)),
  first_year TEXT,
  first_year_kind TEXT CHECK (first_year_kind IS NULL OR first_year_kind IN ('report','original')),
  merged_into INTEGER REFERENCES entries(id),
  hidden_at TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX entries_live_export ON entries(id) WHERE merged_into IS NULL AND hidden_at IS NULL;
CREATE INDEX entries_hidden_moderation ON entries(id) WHERE hidden_at IS NOT NULL;

-- A bibliographic identity. A row never changes: `hash` is its citation, so the same citation is the
-- same row however many sightings give it, and a sighting whose citation is edited points at another row.
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  url TEXT,
  title TEXT,
  author TEXT,
  publisher TEXT,
  report_date TEXT
);

-- One place a character was seen: the evidence. The citation is its source; the rest is this occurrence.
CREATE TABLE sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  first_entry INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  source_id INTEGER REFERENCES sources(id),
  place TEXT NOT NULL,
  original_date TEXT,
  page TEXT,
  context TEXT CHECK (context IN ('running_text','heading','logo','handwriting','other')),
  style TEXT CHECK (style IN ('regular','semi_cursive','seal','clerical','other')),
  types TEXT CHECK (types IS NULL OR json_valid(types)),
  note TEXT,
  hidden_at TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sightings_by_entry ON sightings(entry_id, id);
CREATE INDEX sightings_by_first_entry ON sightings(first_entry);
CREATE INDEX sightings_by_source ON sightings(source_id, id) WHERE source_id IS NOT NULL;
CREATE INDEX sightings_visible_export ON sightings(entry_id, id) WHERE hidden_at IS NULL;
CREATE INDEX sightings_hidden_moderation ON sightings(id) WHERE hidden_at IS NOT NULL;

-- The pictures of a sighting, in order. A stored object is named by its content, so one page shared by
-- several sightings is one object and one row for each, with that sighting's own mark and thumbnail.
CREATE TABLE sighting_media (
  sighting_id INTEGER NOT NULL REFERENCES sightings(id),
  position INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL,
  image_w INTEGER NOT NULL,
  image_h INTEGER NOT NULL,
  thumb_key TEXT NOT NULL,
  box TEXT,
  PRIMARY KEY (sighting_id, position)
) WITHOUT ROWID;
CREATE INDEX sighting_media_by_image ON sighting_media(image_key);
CREATE INDEX sighting_media_by_thumb ON sighting_media(thumb_key);

-- What a record says about its character that it can say more than once: a description sequence, a
-- reading, a meaning, a code in a character set, a related character, a category, a tag. `kind` names
-- the statement, `value` is the part it is found by, `data` holds what else that kind records, and
-- `sighting_id` is the evidence it rests on. A new kind of statement is a new `kind`, not a new table.
CREATE TABLE claims (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  data TEXT CHECK (data IS NULL OR json_valid(data)),
  sighting_id INTEGER REFERENCES sightings(id)
);
CREATE INDEX claims_by_entry ON claims(entry_id, position);
CREATE INDEX claims_by_value ON claims(kind, value, entry_id);

-- The append-only journal: each row is who changed what, when, and the whole state it left. A redacted
-- row keeps its place and its author and loses its state.
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  sighting_id INTEGER REFERENCES sightings(id),
  kind TEXT NOT NULL CHECK (kind IN ('create','edit','revert','sighting','sighting_edit','merge','unmerge','hide','unhide','redact')),
  rev INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  summary TEXT,
  actor TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL,
  ip_hash TEXT,
  redacted_at TEXT,
  redacted_by TEXT REFERENCES people(id)
);
CREATE INDEX revisions_by_entry ON revisions(entry_id, id);
CREATE INDEX revisions_by_actor ON revisions(actor, id);

-- Every way into the list is a key in this table, so each is one index range: a script, a status, what
-- a record still needs, a category, a collection, a tag, a word or character of its text.
CREATE TABLE entry_tags (
  tag TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  PRIMARY KEY (tag, entry_id)
) WITHOUT ROWID;
CREATE INDEX entry_tags_by_entry ON entry_tags(entry_id);

-- Counts of the facet tags, kept with each write so that a page reads them without counting rows.
CREATE TABLE tag_counts (
  tag TEXT PRIMARY KEY,
  n INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  sighting_id INTEGER REFERENCES sightings(id),
  reason TEXT NOT NULL,
  reporter TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES people(id)
);
CREATE INDEX reports_open ON reports(id) WHERE resolved_at IS NULL;
