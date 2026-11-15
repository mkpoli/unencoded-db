-- The source gallery sorts by when a work is dated and by how many records cite it, so a source holds
-- both. `year` is the first run of three or four digits in its date, as a record's first year is read,
-- and never changes with the citation. `records` counts the visible records that cite it, as their work
-- or as where they were found, and every write that moves, hides or shows a sighting counts it again.
ALTER TABLE sources ADD COLUMN year INTEGER;
ALTER TABLE sources ADD COLUMN records INTEGER NOT NULL DEFAULT 0;

WITH RECURSIVE place(p) AS (SELECT 1 UNION ALL SELECT p + 1 FROM place WHERE p < 64)
UPDATE sources SET year = (
  SELECT CAST(substr(report_date, p, CASE WHEN substr(report_date, p + 3, 1) GLOB '[0-9]' THEN 4 ELSE 3 END) AS INTEGER)
  FROM place WHERE substr(report_date, p, 3) GLOB '[0-9][0-9][0-9]' ORDER BY p LIMIT 1
) WHERE report_date IS NOT NULL;

UPDATE sources SET records = (SELECT count(*) FROM (
  SELECT s.entry_id FROM sightings s JOIN entries e ON e.id = s.entry_id WHERE s.source_id = sources.id AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
  UNION
  SELECT s.entry_id FROM sightings s JOIN entries e ON e.id = s.entry_id WHERE s.via_id = sources.id AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
));

-- The gallery lists only sources a visible record cites. A dated source is read by its year, and the
-- undated ones follow it by id.
CREATE INDEX sources_listed ON sources(id) WHERE records > 0;
CREATE INDEX sources_by_records ON sources(records, id) WHERE records > 0;
CREATE INDEX sources_by_year ON sources(year, id) WHERE records > 0 AND year IS NOT NULL;
CREATE INDEX sources_undated ON sources(id) WHERE records > 0 AND year IS NULL;
