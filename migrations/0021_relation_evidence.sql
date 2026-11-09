-- A relation is one row in each direction and cites an evidence record.
CREATE TABLE relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_id TEXT NOT NULL,
  from_entry INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  to_entry INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  to_character TEXT NOT NULL,
  kind TEXT NOT NULL,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  difference TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX relations_from ON relations(from_entry, id);
CREATE INDEX relations_to ON relations(to_entry, id);
