-- A sighting can show its character several ways, as in both the title and the text. `contexts` is a JSON array.
ALTER TABLE sightings ADD COLUMN contexts TEXT CHECK (contexts IS NULL OR json_valid(contexts));
UPDATE sightings SET contexts = json_array(context) WHERE context IS NOT NULL;
ALTER TABLE sightings DROP COLUMN context;

-- A sighting's snapshot holds the same list, in place of its one context. It is kept as text, as `types` is;
-- `|| ''` keeps json_set from nesting it as an array.
UPDATE revisions
SET snapshot = json_remove(json_set(snapshot, '$.contexts',
  CASE WHEN json_extract(snapshot, '$.context') IS NULL THEN NULL ELSE json_array(json_extract(snapshot, '$.context')) || '' END), '$.context')
WHERE kind IN ('sighting', 'sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot);
