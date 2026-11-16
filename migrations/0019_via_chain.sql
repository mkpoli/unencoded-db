-- The sources a sighting passed through between the cited work and the contributor, in order. Position 0 is
-- the via nearest the work, and the last one is what the contributor saw.
CREATE TABLE sighting_vias(
  sighting_id INTEGER NOT NULL REFERENCES sightings(id),
  position INTEGER NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY(sighting_id, position)
) WITHOUT ROWID;

-- A source is found with the sightings that passed through it.
CREATE INDEX sighting_vias_by_source ON sighting_vias(source_id, sighting_id);

-- The one via a sighting had becomes the first link of its chain.
INSERT INTO sighting_vias(sighting_id, position, source_id)
SELECT id, 0, via_id FROM sightings WHERE via_id IS NOT NULL;

-- The single-via column and its index are no longer read.
DROP INDEX sightings_by_via;
ALTER TABLE sightings DROP COLUMN via_id;

-- A sighting's snapshot holds its chain as `vias`, a list of citations, in place of the five flat via keys.
UPDATE revisions
SET snapshot = json_remove(
  json_set(snapshot, '$.vias', json(CASE
    WHEN json_extract(snapshot, '$.via_url') IS NULL AND json_extract(snapshot, '$.via_title') IS NULL AND json_extract(snapshot, '$.via_author') IS NULL
      AND json_extract(snapshot, '$.via_publisher') IS NULL AND json_extract(snapshot, '$.via_report_date') IS NULL THEN '[]'
    ELSE json_array(json_object('url', json_extract(snapshot, '$.via_url'), 'title', json_extract(snapshot, '$.via_title'), 'author', json_extract(snapshot, '$.via_author'), 'publisher', json_extract(snapshot, '$.via_publisher'), 'report_date', json_extract(snapshot, '$.via_report_date')))
  END)),
  '$.via_url', '$.via_title', '$.via_author', '$.via_publisher', '$.via_report_date')
WHERE kind IN ('sighting', 'sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot);
