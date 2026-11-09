-- Sources and media become independent records; evidence points at them.
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'other',
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  place TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE evidence_sources (
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (evidence_id, source_id)
);

CREATE TABLE evidence_media (
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media(id),
  PRIMARY KEY (evidence_id, media_id)
);

INSERT INTO sources (id, kind, title, author, publisher, year, place, created_at)
SELECT id, 'other', title, author, publisher, year, place, created_at FROM evidence;

INSERT INTO media (id, key, type, size, created_at)
SELECT id, image_key, image_type, image_size, created_at FROM evidence WHERE image_key IS NOT NULL AND image_type IS NOT NULL;

INSERT INTO evidence_sources (evidence_id, source_id) SELECT id, id FROM evidence;
INSERT INTO evidence_media (evidence_id, media_id) SELECT id, id FROM evidence WHERE image_key IS NOT NULL AND image_type IS NOT NULL;

CREATE INDEX evidence_sources_source ON evidence_sources(source_id, evidence_id);
CREATE INDEX evidence_media_media ON evidence_media(media_id, evidence_id);
