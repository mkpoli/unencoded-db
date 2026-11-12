-- Who supplied a sighting, such as the person who posted or sent the picture, and a link for them.
ALTER TABLE sightings ADD COLUMN provider TEXT;
ALTER TABLE sightings ADD COLUMN provider_url TEXT CHECK (provider_url IS NULL OR provider_url LIKE 'http://%' OR provider_url LIKE 'https://%');

-- A sighting's past versions hold every sighting field, so the ones written before this migration gain the two new ones.
UPDATE revisions SET snapshot = json_set(snapshot, '$.provider', NULL, '$.provider_url', NULL)
WHERE sighting_id IS NOT NULL AND kind IN ('sighting', 'sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot) AND json_type(snapshot, '$.place') = 'text';
