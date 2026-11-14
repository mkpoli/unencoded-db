-- The marked works a record is in, as a JSON array of their ids in the order a tile prints them, so that
-- a list draws its tiles from `entries` alone. A record in none of them holds NULL.
ALTER TABLE entries ADD COLUMN marks TEXT CHECK (marks IS NULL OR json_valid(marks));

UPDATE entries SET marks = (
  SELECT json_group_array(id) FROM (
    SELECT w.id FROM (
      SELECT 1 AS place, 'unicode' AS id UNION ALL SELECT 2, 'zitools' UNION ALL SELECT 3, 'yedict' UNION ALL SELECT 4, 'glyphwiki' UNION ALL SELECT 5, 'mj'
    ) w JOIN entry_tags t ON t.tag = 'r:' || w.id AND t.entry_id = entries.id
    ORDER BY w.place
  )
)
WHERE EXISTS (SELECT 1 FROM entry_tags t WHERE t.entry_id = entries.id AND t.tag GLOB 'r:*');
