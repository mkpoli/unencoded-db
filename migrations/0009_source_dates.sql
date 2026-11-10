-- A source reports a sighting, and the work in its image may be older. The report date is when the
-- source published or posted it; the original date is when the work shown was made.
ALTER TABLE sightings RENAME COLUMN year TO report_date;
ALTER TABLE sightings ADD COLUMN original_date TEXT;

-- Revision snapshots are JSON, not columns. Move their year and give every sighting snapshot both
-- keys, so earlier revisions stay readable and restorable.
UPDATE revisions
SET snapshot = json_set(json_remove(snapshot, '$.year'), '$.report_date', json_extract(snapshot, '$.year'), '$.original_date', NULL)
WHERE sighting_id IS NOT NULL AND json_valid(snapshot);
