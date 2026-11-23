-- Run with the interpretation updates in a single D1 import. Read live rows so an edit or a
-- moved sighting between discovery and import is indexed under its current record and date.
WITH years AS MATERIALIZED (
  SELECT c.id, CAST(substr(json_extract(d.reading, '$.start'), 1, 4) AS INTEGER) AS year
  FROM sources c LEFT JOIN date_readings d ON d.transcription = c.report_date
)
UPDATE sources SET year = years.year FROM years WHERE sources.id = years.id AND sources.year IS NOT years.year;

WITH candidates AS (
  SELECT s.entry_id, s.id, c.year, json_extract(d.reading, '$.end') AS until, 'report' AS kind
  FROM sightings s JOIN sources c ON c.id = s.source_id JOIN date_readings d ON d.transcription = c.report_date
  WHERE s.hidden_at IS NULL AND d.reading IS NOT NULL
  UNION ALL
  SELECT s.entry_id, s.id, CAST(substr(json_extract(d.reading, '$.start'), 1, 4) AS INTEGER), json_extract(d.reading, '$.end'), 'original'
  FROM sightings s JOIN date_readings d ON d.transcription = s.original_date
  WHERE s.hidden_at IS NULL AND d.reading IS NOT NULL
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY entry_id ORDER BY year, bound, id, kind) AS position
  FROM (SELECT *, min(until) OVER (PARTITION BY id) AS bound FROM candidates)
), earliest AS MATERIALIZED (
  SELECT e.id, CAST(r.year AS TEXT) AS year, r.kind, r.id AS sighting
  FROM entries e LEFT JOIN ranked r ON r.entry_id = e.id AND r.position = 1
)
UPDATE entries SET (first_year, first_year_kind, first_sighting) = (x.year, x.kind, x.sighting)
FROM earliest x WHERE entries.id = x.id AND (first_year, first_year_kind, first_sighting) IS NOT (x.year, x.kind, x.sighting);

UPDATE entry_tags SET year = CAST(e.first_year AS INTEGER) FROM entries e
WHERE entry_tags.entry_id = e.id AND tag NOT GLOB '[wp]:*' AND year IS NOT CAST(e.first_year AS INTEGER);
DELETE FROM entry_tags WHERE tag GLOB 'y:*' AND (year IS NULL OR tag != 'y:' || (year / 10 * 10));
INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year)
  SELECT 'y:' || (year / 10 * 10), entry_id, sightings, year FROM entry_tags WHERE tag = 'all' AND year IS NOT NULL;
DELETE FROM tag_counts WHERE tag GLOB 'y:*' AND NOT EXISTS (SELECT 1 FROM entry_tags t WHERE t.tag = tag_counts.tag);
INSERT INTO tag_counts(tag, n) SELECT tag, count(*) FROM entry_tags WHERE tag GLOB 'y:*' GROUP BY tag
  ON CONFLICT(tag) DO UPDATE SET n = excluded.n WHERE n != excluded.n;

UPDATE date_index_state SET generation = generation + 1;
