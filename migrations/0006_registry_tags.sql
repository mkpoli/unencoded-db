-- Every listed record is counted in or out of each marked work, so a list of the records in a work
-- (`r:`) or not in it (`x:`) is one range of `entry_tags`. A record is in a work whose code it states,
-- and one that states the Unicode code of an ideograph is in zi.tools, yedict and GlyphWiki as well.
INSERT OR IGNORE INTO entry_tags(tag, entry_id)
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM claims k WHERE k.entry_id = t.entry_id AND k.kind = 'encoding' AND json_extract(k.data, '$.charset') = w.id
  ) OR (w.id IN ('zitools', 'yedict', 'glyphwiki') AND EXISTS (
    -- The code as `U+` and four to six hexadecimal digits, in the blocks of ideographs.
    SELECT 1 FROM (
      SELECT ltrim(upper(substr(k.value, 3)), '0') AS point FROM claims k
      WHERE k.entry_id = t.entry_id AND k.kind = 'encoding' AND json_extract(k.data, '$.charset') = 'unicode'
        AND upper(substr(k.value, 1, 2)) = 'U+' AND length(k.value) BETWEEN 6 AND 8 AND upper(substr(k.value, 3)) NOT GLOB '*[^0-9A-F]*'
    ) WHERE (length(point) = 4 AND (point BETWEEN '3400' AND '4DBF' OR point BETWEEN '4E00' AND '9FFF' OR point BETWEEN 'F900' AND 'FAFF'))
      OR (length(point) = 5 AND point BETWEEN '20000' AND '3FFFF')
  )) THEN 'r:' ELSE 'x:' END || w.id, t.entry_id
FROM entry_tags t CROSS JOIN (
  SELECT 'unicode' AS id UNION ALL SELECT 'zitools' UNION ALL SELECT 'yedict' UNION ALL SELECT 'glyphwiki' UNION ALL SELECT 'mj'
) w
WHERE t.tag = 'all';

INSERT INTO tag_counts(tag, n)
SELECT tag, count(*) FROM entry_tags WHERE tag GLOB 'r:*' OR tag GLOB 'x:*' GROUP BY tag
ON CONFLICT(tag) DO UPDATE SET n = excluded.n;
