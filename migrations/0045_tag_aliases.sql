-- Other names of a tag. A record that names an alias is filed under the tag it points to; merging one tag
-- into another leaves the merged tag's name here, so records and links that use it still find it.
CREATE TABLE tag_aliases (
  alias TEXT PRIMARY KEY,
  tag TEXT NOT NULL REFERENCES tags(name),
  created_by TEXT REFERENCES people(id),
  created_at TEXT
) WITHOUT ROWID;
CREATE INDEX tag_aliases_by_tag ON tag_aliases(tag, alias);
