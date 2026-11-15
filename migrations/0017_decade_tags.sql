-- A record is listed under the decade of its first year (`y:1930`), so a list can be kept to a decade
-- in any order, and the chronology counts each decade from `tag_counts`.
INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year)
  SELECT 'y:' || (CAST(first_year AS INTEGER) / 10 * 10), id, sightings, CAST(first_year AS INTEGER)
  FROM entries WHERE first_year IS NOT NULL AND hidden_at IS NULL AND merged_into IS NULL;
INSERT INTO tag_counts(tag, n)
  SELECT tag, count(*) FROM entry_tags WHERE tag GLOB 'y:*' GROUP BY tag
  ON CONFLICT(tag) DO UPDATE SET n = excluded.n;
