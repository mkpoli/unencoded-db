-- A record keeps which piece of evidence holds its earliest year, so the chronology can name the source
-- beside the year. A sighting's year is the work's own date when it is the earlier, else the date its
-- source was reported, each read as the first run of three or four digits; among the visible sightings
-- the earliest year wins, and the first added on a tie.
ALTER TABLE entries ADD COLUMN first_sighting INTEGER;

WITH RECURSIVE place(p) AS (SELECT 1 UNION ALL SELECT p + 1 FROM place WHERE p < 64),
dated AS (
  SELECT s.id, s.entry_id, c.year AS report, (
    SELECT CAST(substr(s.original_date, p, CASE WHEN substr(s.original_date, p + 3, 1) GLOB '[0-9]' THEN 4 ELSE 3 END) AS INTEGER)
    FROM place WHERE substr(s.original_date, p, 3) GLOB '[0-9][0-9][0-9]' ORDER BY p LIMIT 1
  ) AS original
  FROM sightings s LEFT JOIN sources c ON c.id = s.source_id
  WHERE s.hidden_at IS NULL
),
yeared AS (
  SELECT id, entry_id, CASE WHEN original IS NOT NULL AND (report IS NULL OR original <= report) THEN original ELSE report END AS year
  FROM dated
)
UPDATE entries SET first_sighting = (SELECT id FROM yeared WHERE yeared.entry_id = entries.id AND year IS NOT NULL ORDER BY year, id LIMIT 1);
