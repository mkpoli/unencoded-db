-- The other names a source is found by: its author, what it appeared in, its link, and the account or group
-- number given with a name. The title field offers source_search_names alone, so that typing a group's name
-- there does not offer one of its messages. The release sweep fills this table.
CREATE TABLE source_keys (
  lookup TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (lookup, source_id)
) WITHOUT ROWID;
CREATE INDEX source_keys_by_source ON source_keys(source_id, lookup);
