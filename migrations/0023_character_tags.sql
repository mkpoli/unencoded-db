CREATE TABLE character_tags (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag)
);

CREATE INDEX character_tags_tag ON character_tags(tag, entry_id);
