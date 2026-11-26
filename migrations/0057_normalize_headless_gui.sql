-- Normalize the alternate headless-鬼 spelling (⿱田⿺儿厶) to the canonical form (⿷⿱田儿厶)
-- that han-compose renders natively (mkpoli/han-compose#385, issue #331).

-- Track entries that actually hold the alternate spelling so forms belonging to other
-- IWDS-group mates (such as 毌 or 几) are never touched.
CREATE TABLE _headless_gui_entries (entry_id INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO _headless_gui_entries(entry_id)
SELECT DISTINCT entry_id FROM claims WHERE kind = 'ids' AND value LIKE '%⿱田⿺儿厶%';

-- Before dropping duplicate IDS claims that collapse onto an earlier claim of the same entry,
-- merge their sightings onto the kept claim (deduplicated, sorted, capped at 20).
UPDATE claims
SET sightings = COALESCE((
  SELECT json_group_array(sid) FROM (
    SELECT DISTINCT CAST(j.value AS INTEGER) AS sid
    FROM claims dup
    JOIN json_each(dup.sightings) j
    WHERE dup.entry_id = claims.entry_id
      AND dup.kind = 'ids'
      AND replace(dup.value, '⿱田⿺儿厶', '⿷⿱田儿厶') = replace(claims.value, '⿱田⿺儿厶', '⿷⿱田儿厶')
    ORDER BY sid
    LIMIT 20
  )
), '[]')
WHERE kind = 'ids'
  AND entry_id IN (SELECT entry_id FROM _headless_gui_entries)
  AND EXISTS (
    SELECT 1 FROM claims dup
    WHERE dup.entry_id = claims.entry_id
      AND dup.kind = 'ids'
      AND dup.position > claims.position
      AND replace(dup.value, '⿱田⿺儿厶', '⿷⿱田儿厶') = replace(claims.value, '⿱田⿺儿厶', '⿷⿱田儿厶')
      AND dup.sightings != '[]'
  );

-- Drop any second IDS claim on a record that already states the canonical form (keeping the earlier position).
DELETE FROM claims
WHERE kind = 'ids'
  AND entry_id IN (SELECT entry_id FROM _headless_gui_entries)
  AND EXISTS (
    SELECT 1 FROM claims other
    WHERE other.entry_id = claims.entry_id
      AND other.kind = 'ids'
      AND other.position < claims.position
      AND replace(other.value, '⿱田⿺儿厶', '⿷⿱田儿厶') = replace(claims.value, '⿱田⿺儿厶', '⿷⿱田儿厶')
  );

-- Preserve unaffected layout adjustments on binary compounds whose second operand is ⿱田⿺儿厶
-- (e.g. ⿰云⿱田⿺儿厶 keeps path "0" and whole-glyph "" while dropping paths under "1"), and drop
-- invalid subtree paths elsewhere so stored layouts remain valid under validLayout().
UPDATE claims
SET data = CASE
      WHEN data IS NULL THEN NULL
      WHEN json_extract(data, '$.layout.faces') IS NULL
           AND substr(value, 1, 1) IN ('⿰','⿱','⿴','⿵','⿶','⿷','⿸','⿹','⿺')
           AND substr(value, 2, 1) NOT IN ('⿰','⿱','⿲','⿳','⿴','⿵','⿶','⿷','⿸','⿹','⿺','⿻','⿼','⿽','⿾','⿿','㇯')
           AND substr(value, 3) = '⿱田⿺儿厶' THEN (
        SELECT CASE WHEN count(*) > 0 THEN json_object('layout', json_group_object(j.key, json(j.value))) ELSE NULL END
        FROM json_each(claims.data, '$.layout') j
        WHERE j.key IN ('', '0')
      )
      WHEN json_extract(data, '$.layout.faces') IS NULL AND value = '⿱田⿺儿厶' THEN (
        SELECT CASE WHEN count(*) > 0 THEN json_object('layout', json_group_object(j.key, json(j.value))) ELSE NULL END
        FROM json_each(claims.data, '$.layout') j
        WHERE j.key = ''
      )
      ELSE NULL
    END,
    value = replace(value, '⿱田⿺儿厶', '⿷⿱田儿厶')
WHERE kind = 'ids' AND value LIKE '%⿱田⿺儿厶%';

-- Rewrite composition claims referencing the alternate spelling.
UPDATE claims
SET value = replace(value, '⿱田⿺儿厶', '⿷⿱田儿厶'),
    data = CASE WHEN data IS NULL THEN NULL ELSE replace(data, '⿱田⿺儿厶', '⿷⿱田儿厶') END
WHERE kind = 'composition' AND (value LIKE '%⿱田⿺儿厶%' OR data LIKE '%⿱田⿺儿厶%');

-- Keep the primary IDS summary and layout on entries in sync with the primary IDS claim.
UPDATE entries
SET ids = replace(ids, '⿱田⿺儿厶', '⿷⿱田儿厶'),
    layout = (
      SELECT json_extract(c.data, '$.layout')
      FROM claims c
      WHERE c.entry_id = entries.id AND c.kind = 'ids'
      ORDER BY c.position
      LIMIT 1
    )
WHERE ids LIKE '%⿱田⿺儿厶%';

-- Re-file normalized form keys only for affected entries, firing the form_counts triggers.
INSERT OR IGNORE INTO forms(form, entry_id)
SELECT replace(form, '⿱' || char(1) || '83⿺' || char(1) || '119厶', '⿷⿱' || char(1) || '83' || char(1) || '119厶'), entry_id
FROM forms
WHERE entry_id IN (SELECT entry_id FROM _headless_gui_entries)
  AND form LIKE '%⿱' || char(1) || '83⿺' || char(1) || '119厶%';

DELETE FROM forms
WHERE entry_id IN (SELECT entry_id FROM _headless_gui_entries)
  AND form LIKE '%⿱' || char(1) || '83⿺' || char(1) || '119厶%'
  AND NOT EXISTS (
    SELECT 1 FROM claims c
    WHERE c.entry_id = forms.entry_id AND c.kind = 'ids'
      AND (c.value LIKE '%毌%' OR c.value LIKE '%几%')
  );

DROP TABLE _headless_gui_entries;
