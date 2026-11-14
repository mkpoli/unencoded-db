-- Every listed record is counted in or out of each marked work, so a list of the records in a work
-- (`r:`) or not in it (`x:`) is one range of `entry_tags`. A record is in a work whose code it states,
-- and one that states the Unicode code of an ideograph is in zi.tools, yedict and GlyphWiki as well.
-- A Unicode code counts when it opens with `U+` and a run of four to six hexadecimal digits that names
-- a code point; `unicode_points` holds for the length of this migration each such code of a record without its leading zeros.
CREATE TABLE unicode_points AS
SELECT entry_id, ltrim(substr(code, 3, n), '0') AS point
FROM (SELECT entry_id, upper(value) AS code FROM claims WHERE kind = 'encoding' AND json_extract(data, '$.charset') = 'unicode')
CROSS JOIN (SELECT 4 AS n UNION ALL SELECT 5 UNION ALL SELECT 6)
WHERE substr(code, 1, 2) = 'U+' AND length(code) >= n + 2 AND substr(code, 3, n) NOT GLOB '*[^0-9A-F]*' AND substr(code, n + 3, 1) NOT GLOB '[0-9A-F]';
DELETE FROM unicode_points WHERE length(point) < 2 OR (length(point) = 2 AND point < '20') OR (length(point) = 4 AND point BETWEEN 'D800' AND 'DFFF') OR (length(point) = 6 AND point > '10FFFF');

INSERT OR IGNORE INTO entry_tags(tag, entry_id)
SELECT CASE WHEN CASE w.id
    WHEN 'unicode' THEN EXISTS (SELECT 1 FROM unicode_points p WHERE p.entry_id = t.entry_id)
    ELSE EXISTS (SELECT 1 FROM claims k WHERE k.entry_id = t.entry_id AND k.kind = 'encoding' AND json_extract(k.data, '$.charset') = w.id)
  END OR (w.id IN ('zitools', 'yedict', 'glyphwiki') AND EXISTS (
    -- The blocks of unified and compatibility ideographs and the two ideographic planes.
    SELECT 1 FROM unicode_points p WHERE p.entry_id = t.entry_id AND (
      (length(p.point) = 4 AND (p.point BETWEEN '3400' AND '4DBF' OR p.point BETWEEN '4E00' AND '9FFF' OR p.point BETWEEN 'F900' AND 'FAFF'))
      OR (length(p.point) = 5 AND p.point BETWEEN '20000' AND '3FFFF'))
  )) THEN 'r:' ELSE 'x:' END || w.id, t.entry_id
FROM entry_tags t CROSS JOIN (
  SELECT 'unicode' AS id UNION ALL SELECT 'zitools' UNION ALL SELECT 'yedict' UNION ALL SELECT 'glyphwiki' UNION ALL SELECT 'mj'
) w
WHERE t.tag = 'all';

DROP TABLE unicode_points;

INSERT INTO tag_counts(tag, n)
SELECT tag, count(*) FROM entry_tags WHERE tag GLOB 'r:*' OR tag GLOB 'x:*' GROUP BY tag
ON CONFLICT(tag) DO UPDATE SET n = excluded.n;
