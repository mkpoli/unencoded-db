-- A record is listed under every language its readings state (`d:<doculect>`), listed codes and custom
-- names alike, so a form can offer the languages people have added. Rows and counts are the ones a write
-- gives a visible record; the partial index reads the languages in use most used first.
INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year)
  SELECT DISTINCT 'd:' || json_extract(k.data, '$.doculect'), e.id, e.sightings, CAST(e.first_year AS INTEGER)
  FROM claims k CROSS JOIN entries e ON e.id = k.entry_id
  WHERE k.kind = 'reading' AND json_type(k.data, '$.doculect') = 'text' AND json_extract(k.data, '$.doculect') != ''
    AND e.hidden_at IS NULL AND e.merged_into IS NULL;
INSERT INTO tag_counts(tag, n)
  SELECT tag, count(*) FROM entry_tags WHERE tag GLOB 'd:*' GROUP BY tag
  ON CONFLICT(tag) DO UPDATE SET n = excluded.n;
CREATE INDEX tag_counts_doculects ON tag_counts(n DESC, tag) WHERE tag GLOB 'd:*' AND n > 0;
