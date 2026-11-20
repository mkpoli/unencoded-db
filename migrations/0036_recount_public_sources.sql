-- The directory and its title/publisher indexes use records > 0 to identify
-- public citations. A record citing the same source directly and via another
-- sighting counts once. Hidden sightings and hidden or merged records count zero.
WITH visible AS MATERIALIZED (
  SELECT s.id, s.entry_id, s.source_id FROM sightings s JOIN entries e ON e.id = s.entry_id
  WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
), cited AS (
  SELECT source_id, entry_id FROM visible WHERE source_id IS NOT NULL
  UNION SELECT v.source_id, s.entry_id FROM visible s JOIN sighting_vias v ON v.sighting_id = s.id
), totals AS MATERIALIZED (
  SELECT source_id, count(*) AS n FROM cited GROUP BY source_id
), changed AS MATERIALIZED (
  SELECT c.id, coalesce(t.n, 0) AS n FROM sources c LEFT JOIN totals t ON t.source_id = c.id
  WHERE c.records != coalesce(t.n, 0)
)
UPDATE sources AS c SET records = changed.n FROM changed WHERE changed.id = c.id;
