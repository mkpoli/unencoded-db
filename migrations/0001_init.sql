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

-- One character, however many times it was seen. Every column but the bookkeeping is a wiki field, and
-- each state of them is a row in `revisions`.
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rev INTEGER NOT NULL DEFAULT 1,
  script TEXT NOT NULL,
  script_other TEXT,
  ids TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','unencoded','variant','encoded','doubtful')),
  encoded_as TEXT,
  related TEXT,
  reading TEXT,
  meaning TEXT,
  radical TEXT,
  strokes INTEGER,
  cover_key TEXT,
  cover_place TEXT,
  sightings INTEGER NOT NULL DEFAULT 0,
  merged_into INTEGER REFERENCES entries(id),
  hidden_at TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX entries_by_ids ON entries(ids) WHERE ids IS NOT NULL;

-- One place a character was seen: the evidence.
CREATE TABLE sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  first_entry INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  place TEXT NOT NULL,
  url TEXT,
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  page TEXT,
  context TEXT CHECK (context IN ('running_text','heading','logo','handwriting','other')),
  style TEXT CHECK (style IN ('regular','semi_cursive','seal','clerical','other')),
  note TEXT,
  image_key TEXT,
  image_type TEXT,
  image_w INTEGER,
  image_h INTEGER,
  thumb_key TEXT,
  box TEXT,
  hidden_at TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sightings_by_entry ON sightings(entry_id, id);
CREATE INDEX sightings_by_first_entry ON sightings(first_entry);

-- The append-only journal: each row is who changed what, when, and the whole state it left.
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  sighting_id INTEGER REFERENCES sightings(id),
  kind TEXT NOT NULL CHECK (kind IN ('create','edit','revert','sighting','sighting_edit','merge','unmerge','hide','unhide')),
  rev INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  summary TEXT,
  actor TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL,
  ip_hash TEXT
);
CREATE INDEX revisions_by_entry ON revisions(entry_id, id);
CREATE INDEX revisions_by_actor ON revisions(actor, id);

-- Every way into the list is a key in this table, so each is one index range: a script, a status, what
-- a record still needs, a word or character of its text, and their script/filter pairs.
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
