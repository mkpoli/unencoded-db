CREATE TABLE collections (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

INSERT INTO collections (slug, label) VALUES ('extension-e', 'Extension E');

CREATE TABLE entry_collections (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  collection TEXT NOT NULL REFERENCES collections(slug),
  evidence_id INTEGER REFERENCES evidence(id) ON DELETE SET NULL,
  PRIMARY KEY (entry_id, collection)
);

CREATE INDEX entry_collections_collection ON entry_collections(collection, entry_id);
