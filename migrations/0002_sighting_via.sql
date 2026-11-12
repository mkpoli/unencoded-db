-- A second source a sighting was found through, such as a post that shows a page of the cited work. It is
-- a row of `sources` like the work itself.
ALTER TABLE sightings ADD COLUMN via_id INTEGER REFERENCES sources(id);
CREATE INDEX sightings_by_via ON sightings(via_id, id) WHERE via_id IS NOT NULL;

-- A sighting's snapshot holds every field of the form, so the journal's earlier ones gain the new keys.
UPDATE revisions
SET snapshot = json_set(snapshot, '$.via_url', NULL, '$.via_title', NULL, '$.via_author', NULL, '$.via_publisher', NULL, '$.via_report_date', NULL)
WHERE kind IN ('sighting', 'sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot);
