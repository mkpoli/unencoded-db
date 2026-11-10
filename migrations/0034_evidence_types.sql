-- What a source shows about the character. A dictionary entry can be a mention, an attestation, a glyph
-- description, a meaning, a reading and a relation at once, so the set is a JSON array in one column.
ALTER TABLE evidence ADD COLUMN types TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(types) AND json_type(types) = 'array' AND json_array_length(types) <= 6);
