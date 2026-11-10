-- A character can carry several character-set codes; the old encoded_as column remains as its first code.
CREATE TABLE entry_encodings (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  charset TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, charset, code)
);

CREATE INDEX entry_encodings_entry ON entry_encodings(entry_id);

INSERT OR IGNORE INTO entry_encodings (entry_id, charset, code, created_at)
SELECT id, 'unicode', trim(encoded_as), created_at
FROM entries
WHERE encoded_as IS NOT NULL AND trim(encoded_as) <> '';
