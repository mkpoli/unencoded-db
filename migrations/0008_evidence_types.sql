-- What a source itself provides: a mention, an attestation, a glyph description, a meaning, a reading or a
-- relation. A dictionary entry can be several of these, so the set is a JSON array in one column.
ALTER TABLE sightings ADD COLUMN types TEXT CHECK (types IS NULL OR json_valid(types));
