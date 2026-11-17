-- The records each person has starred, newest first on their favourites page.
CREATE TABLE favourites (
  person TEXT NOT NULL REFERENCES people(id),
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (person, entry_id)
) WITHOUT ROWID;
CREATE INDEX favourites_recent ON favourites(person, at DESC, entry_id);
