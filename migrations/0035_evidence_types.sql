-- What a source shows about the character. A dictionary entry can be a mention, an attestation, a glyph
-- description, a meaning, a reading and a relation at once, so the set is a JSON array in one column.
ALTER TABLE evidence ADD COLUMN types TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(types) AND json_type(types) = 'array' AND json_array_length(types) <= 6);

-- The parser writes the six known slugs once each, in a fixed order. These guards keep a direct write from
-- storing something the reader would silently drop or reorder.
CREATE TRIGGER evidence_types_insert_guard BEFORE INSERT ON evidence
WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.types)
    WHERE typeof(value) != 'text' OR value NOT IN ('mention', 'attestation', 'description', 'definition', 'reading', 'relation')
  )
  OR json_array_length(NEW.types) != (SELECT count(DISTINCT value) FROM json_each(NEW.types))
BEGIN
  SELECT RAISE(ABORT, 'invalid evidence types');
END;

CREATE TRIGGER evidence_types_update_guard BEFORE UPDATE OF types ON evidence
WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.types)
    WHERE typeof(value) != 'text' OR value NOT IN ('mention', 'attestation', 'description', 'definition', 'reading', 'relation')
  )
  OR json_array_length(NEW.types) != (SELECT count(DISTINCT value) FROM json_each(NEW.types))
BEGIN
  SELECT RAISE(ABORT, 'invalid evidence types');
END;
