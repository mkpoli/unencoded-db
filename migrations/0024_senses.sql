CREATE TABLE senses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  gloss TEXT NOT NULL,
  reading TEXT,
  evidence_id INTEGER REFERENCES evidence(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX senses_entry ON senses(entry_id, id);
