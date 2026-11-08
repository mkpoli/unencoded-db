CREATE TABLE persons (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE contributor_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES persons(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

ALTER TABLE entries ADD COLUMN creator_id TEXT REFERENCES persons(id);
