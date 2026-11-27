-- Unify record scripts into typed tags under a dedicated `script` tag type.

-- 1. Allow `script` in `tags.type` and `tag_groups.type` without dropping foreign-key targets.
ALTER TABLE tags ADD COLUMN type_next TEXT NOT NULL DEFAULT 'general'
  CHECK (type_next IN ('script','general','region','language','form','domain','meta'));
UPDATE tags SET type_next = type;
DROP INDEX tags_by_type;
ALTER TABLE tags DROP COLUMN type;
ALTER TABLE tags RENAME COLUMN type_next TO type;
CREATE INDEX tags_by_type ON tags(type, position, name);

ALTER TABLE tag_groups ADD COLUMN type_next TEXT NOT NULL DEFAULT 'general'
  CHECK (type_next IN ('script','general','region','language','form','domain','meta'));
UPDATE tag_groups SET type_next = type;
DROP INDEX tag_groups_by_label;
DROP INDEX tag_groups_by_type;
ALTER TABLE tag_groups DROP COLUMN type;
ALTER TABLE tag_groups RENAME COLUMN type_next TO type;
CREATE UNIQUE INDEX tag_groups_by_label ON tag_groups(type, label);
CREATE INDEX tag_groups_by_type ON tag_groups(type, position, id);

-- 2. Seed built-in scripts as `script` tags, reusing existing tags (such as `nom` and `baiwen`)
-- and preserving any localized names already set on them.
CREATE TABLE script_seeds (
  script TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  names TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO script_seeds(script, name, label, position, names) VALUES
  ('han', 'han', '漢字', 0, '{"en":"Han","ja":"漢字","ko":"한자","vi":"Chữ Hán","zh-Hans":"汉字","zh-Hant":"漢字"}'),
  ('nom', 'nom', '喃字', 1, '{"en":"Chữ Nôm","ja":"チュノム","ko":"쯔놈","vi":"Chữ Nôm","zh-Hans":"喃字","zh-Hant":"喃字"}'),
  ('sawndip', 'sawndip', '古壯字', 2, '{"en":"Sawndip","ja":"古壮字","ko":"쏘우디프","vi":"Chữ Tráng cổ (Sawndip)","zh-Hans":"古壮字","zh-Hant":"古壯字"}'),
  ('gugyeol', 'gugyeol', '口訣字', 3, '{"en":"Gugyeol","ja":"口訣","ko":"구결","vi":"Gugyeol","zh-Hans":"口诀字","zh-Hant":"口訣字"}'),
  ('kana', 'kana', '仮名', 4, '{"en":"Kana","ja":"仮名","ko":"가나","vi":"Kana","zh-Hans":"假名","zh-Hant":"假名"}'),
  ('bopomofo', 'bopomofo', '注音符號', 5, '{"en":"Bopomofo","ja":"注音符号","ko":"주음부호","vi":"Chú âm phù hiệu","zh-Hans":"注音符号","zh-Hant":"注音符號"}'),
  ('bai', 'baiwen', '白文', 6, '{"en":"Bai","ja":"白文","ko":"바이어 문자","vi":"Chữ Bạch","zh-Hans":"白文","zh-Hant":"白文"}'),
  ('miao', 'miao', '方塊苗文', 7, '{"en":"Square Miao","ja":"方塊苗字","ko":"방괴 먀오 문자","vi":"Chữ Miêu vuông","zh-Hans":"方块苗文","zh-Hant":"方塊苗文"}'),
  ('yao', 'yao', '方塊瑤文', 8, '{"en":"Square Yao","ja":"方塊瑶字","ko":"방괴 야오 문자","vi":"Chữ Dao vuông","zh-Hans":"方块瑶文","zh-Hant":"方塊瑤文"}'),
  ('bouyei', '布依方塊字', '布依方塊字', 9, '{"en":"Square Bouyei","ja":"方塊布依字","ko":"방괴 부이 문자","vi":"Chữ Bố Y vuông","zh-Hans":"布依方块字","zh-Hant":"布依方塊字"}'),
  ('dong', 'dong', '侗字', 10, '{"en":"Dong","ja":"トン文字","ko":"둥 문자","vi":"Chữ Động","zh-Hans":"侗字","zh-Hant":"侗字"}'),
  ('tangut', 'tangut', '西夏文字', 11, '{"en":"Tangut","ja":"西夏文字","ko":"서하 문자","vi":"Chữ Tây Hạ","zh-Hans":"西夏文字","zh-Hant":"西夏文字"}'),
  ('khitan', 'khitan', '契丹文字', 12, '{"en":"Khitan","ja":"契丹文字","ko":"거란 문자","vi":"Chữ Khiết Đan","zh-Hans":"契丹文字","zh-Hant":"契丹文字"}'),
  ('jurchen', 'jurchen', '女真文字', 13, '{"en":"Jurchen","ja":"女真文字","ko":"여진 문자","vi":"Chữ Nữ Chân","zh-Hans":"女真文字","zh-Hant":"女真文字"}'),
  ('shuishu', 'shuishu', '水書', 14, '{"en":"Shuishu","ja":"水書","ko":"수서","vi":"Thủy thư","zh-Hans":"水书","zh-Hant":"水書"}'),
  ('nushu', 'nushu', '女書', 15, '{"en":"Nüshu","ja":"女書","ko":"여서","vi":"Nữ thư","zh-Hans":"女书","zh-Hant":"女書"}');

CREATE TABLE script_tag_map (
  script TEXT PRIMARY KEY,
  tag TEXT NOT NULL
) WITHOUT ROWID;

INSERT INTO script_tag_map(script, tag)
SELECT s.script, COALESCE(
  (SELECT t.name FROM tags t WHERE t.name = s.name),
  (SELECT t.name FROM tags t WHERE t.name = s.script),
  (SELECT t.name FROM tags t WHERE t.name = s.label),
  (SELECT t.name FROM tags t WHERE t.label = s.label),
  (SELECT a.tag FROM tag_aliases a WHERE a.alias IN (s.name, s.script, s.label) ORDER BY CASE a.alias WHEN s.name THEN 0 WHEN s.script THEN 1 ELSE 2 END LIMIT 1),
  s.name
)
FROM script_seeds s;

INSERT INTO tags(name, label, names, type, group_id, position)
SELECT s.name, s.label, s.names, 'script', NULL, s.position
FROM script_seeds s
JOIN script_tag_map m ON m.script = s.script
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.name = m.tag);

UPDATE tags
SET type = 'script',
    group_id = NULL,
    position = (SELECT MIN(s.position) FROM script_tag_map m JOIN script_seeds s ON s.script = m.script WHERE m.tag = tags.name),
    names = json_patch(
      (SELECT s.names FROM script_tag_map m JOIN script_seeds s ON s.script = m.script WHERE m.tag = tags.name ORDER BY s.position LIMIT 1),
      tags.names
    )
WHERE name IN (SELECT tag FROM script_tag_map);

INSERT OR IGNORE INTO tag_aliases(alias, tag)
SELECT m.script, m.tag
FROM script_tag_map m
WHERE m.script <> m.tag
  AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.name = m.script OR t.label = m.script)
  AND NOT EXISTS (SELECT 1 FROM tag_aliases a WHERE a.alias = m.script);

-- 3. Convert custom `script_other` values (from records and unredacted snapshots) into `script` tags.
CREATE TABLE custom_script_map (
  raw TEXT PRIMARY KEY,
  tag TEXT NOT NULL
) WITHOUT ROWID;

WITH raw_custom(raw) AS (
  SELECT DISTINCT script_other
  FROM entries
  WHERE script = 'other' AND script_other IS NOT NULL AND trim(script_other) <> ''
  UNION
  SELECT DISTINCT json_extract(snapshot, '$.script_other')
  FROM revisions
  WHERE sighting_id IS NULL AND redacted_at IS NULL AND json_valid(snapshot)
    AND json_extract(snapshot, '$.script') = 'other'
    AND json_type(snapshot, '$.script_other') = 'text'
    AND trim(json_extract(snapshot, '$.script_other')) <> ''
),
cleaned AS (
  SELECT raw,
    substr(
      ltrim(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(
          trim(raw),
          char(9), ''), char(10), ''), char(13), ''), char(12288), ''), ' ', ''), '|', ''), ',', ''), '，', ''), '、', ''),
        '#'
      ),
      1, 40
    ) AS clean
  FROM raw_custom
)
INSERT INTO custom_script_map(raw, tag)
SELECT raw, COALESCE(
  (SELECT t.name FROM tags t WHERE t.name = clean),
  (SELECT t.name FROM tags t WHERE t.label = clean),
  (SELECT a.tag FROM tag_aliases a WHERE a.alias = clean),
  clean
)
FROM cleaned
WHERE clean <> '';

INSERT OR IGNORE INTO tags(name, label, type, position, created_by, created_at)
SELECT m.tag, m.tag, 'script',
  16 + row_number() OVER (ORDER BY COALESCE(MIN(e.created_at), ''), m.tag) - 1,
  (SELECT e2.created_by FROM entries e2 JOIN custom_script_map m2 ON m2.raw = e2.script_other WHERE e2.script = 'other' AND m2.tag = m.tag ORDER BY e2.created_at, e2.id LIMIT 1),
  MIN(e.created_at)
FROM custom_script_map m
LEFT JOIN entries e ON e.script = 'other' AND e.script_other = m.raw
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.name = m.tag OR t.label = m.tag)
  AND NOT EXISTS (SELECT 1 FROM tag_aliases a WHERE a.alias = m.tag)
GROUP BY m.tag;

-- 4. Attach each record's script tag claim when not already carried directly or via an alias.
WITH entry_script(entry_id, tag) AS (
  SELECT e.id, m.tag
  FROM entries e
  JOIN script_tag_map m ON m.script = e.script
  WHERE e.script <> 'other'
  UNION ALL
  SELECT e.id, c.tag
  FROM entries e
  JOIN custom_script_map c ON c.raw = e.script_other
  WHERE e.script = 'other' AND e.script_other IS NOT NULL
)
INSERT INTO claims(entry_id, position, key, kind, value, data, sightings, under)
SELECT es.entry_id,
  COALESCE((SELECT MAX(position) + 1 FROM claims WHERE entry_id = es.entry_id), 0),
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM claims k WHERE k.entry_id = es.entry_id AND k.key = printf('sc%06x', es.entry_id % 16777216))
    THEN printf('sc%06x', es.entry_id % 16777216)
    ELSE printf('sd%06x', es.entry_id % 16777216)
  END,
  'tag',
  es.tag,
  NULL,
  '[]',
  '[]'
FROM entry_script es
WHERE NOT EXISTS (
    SELECT 1 FROM claims c
    WHERE c.entry_id = es.entry_id
      AND c.kind = 'tag'
      AND COALESCE((SELECT a.tag FROM tag_aliases a WHERE a.alias = c.value), c.value) = es.tag
  )
  AND (SELECT count(*) FROM claims c WHERE c.entry_id = es.entry_id AND c.kind = 'tag') < 30;

-- 5. Fold `script` / `script_other` into `$.claims` in historical entry snapshots, then drop those keys.
-- Each revision's script tag is found once into a keyed table, so the update below reads one row per revision.
CREATE TABLE revision_script_map (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  tag TEXT NOT NULL
);

INSERT INTO revision_script_map(id, entry_id, tag)
SELECT id, entry_id, tag FROM (
  SELECT r.id, r.entry_id,
    CASE
      WHEN json_extract(r.snapshot, '$.script') <> 'other'
      THEN (SELECT m.tag FROM script_tag_map m WHERE m.script = json_extract(r.snapshot, '$.script'))
      ELSE (SELECT c.tag FROM custom_script_map c WHERE c.raw = json_extract(r.snapshot, '$.script_other'))
    END AS tag
  FROM revisions r
  WHERE r.sighting_id IS NULL
    AND r.redacted_at IS NULL
    AND json_valid(r.snapshot)
    AND json_type(r.snapshot, '$.claims') = 'array'
    AND json_type(r.snapshot, '$.script') = 'text'
)
WHERE tag IS NOT NULL;

DELETE FROM revision_script_map
WHERE EXISTS (
    SELECT 1 FROM revisions r, json_each(r.snapshot, '$.claims') c
    WHERE r.id = revision_script_map.id
      AND json_extract(c.value, '$.kind') IN ('tag', 'genre')
      AND COALESCE(
        (SELECT a.tag FROM tag_aliases a WHERE a.alias = ltrim(json_extract(c.value, '$.value'), '#')),
        ltrim(json_extract(c.value, '$.value'), '#')
      ) = revision_script_map.tag
  )
  OR (
    SELECT count(*) FROM revisions r, json_each(r.snapshot, '$.claims') c
    WHERE r.id = revision_script_map.id AND json_extract(c.value, '$.kind') IN ('tag', 'genre')
  ) >= 30;

UPDATE revisions
SET snapshot = json_insert(
  snapshot,
  '$.claims[#]',
  json_object(
    'key',
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM json_each(revisions.snapshot, '$.claims') k WHERE json_extract(k.value, '$.key') = printf('sc%06x', revisions.entry_id % 16777216))
      THEN printf('sc%06x', revisions.entry_id % 16777216)
      ELSE printf('sd%06x', revisions.entry_id % 16777216)
    END,
    'kind', 'tag',
    'value', (SELECT m.tag FROM revision_script_map m WHERE m.id = revisions.id),
    'data', NULL,
    'sightings', json('[]'),
    'under', json('[]')
  )
)
WHERE id IN (SELECT id FROM revision_script_map);

DROP TABLE revision_script_map;

UPDATE revisions
SET snapshot = json_remove(snapshot, '$.script', '$.script_other')
WHERE sighting_id IS NULL
  AND json_valid(snapshot)
  AND (json_type(snapshot, '$.script') IS NOT NULL OR json_type(snapshot, '$.script_other') IS NOT NULL);

-- 6. Drop script columns and custom-script index from `entries`.
DROP INDEX IF EXISTS entries_custom_scripts;
ALTER TABLE entries DROP COLUMN script_other;
ALTER TABLE entries DROP COLUMN script;

-- 7. Remove obsolete `s:` rows and rebuild `t:` index rows and counts with aliases and DAG implications.
DELETE FROM entry_tags WHERE (tag >= 's:' AND tag < 's;') OR (tag >= 't:' AND tag < 't;');
DELETE FROM tag_counts WHERE (tag >= 's:' AND tag < 's;') OR (tag >= 't:' AND tag < 't;');

WITH RECURSIVE up(entry_id, name) AS (
  SELECT cl.entry_id, COALESCE((SELECT a.tag FROM tag_aliases a WHERE a.alias = cl.value), cl.value)
  FROM claims cl
  WHERE +cl.kind = 'tag'
  UNION
  SELECT up.entry_id, i.implies
  FROM up
  JOIN tag_implications i ON i.tag = up.name
)
INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year)
SELECT 't:' || up.name, up.entry_id, e.sightings, CAST(e.first_year AS INTEGER)
FROM up
CROSS JOIN entries e ON e.id = up.entry_id
WHERE e.merged_into IS NULL AND e.hidden_at IS NULL;

INSERT INTO tag_counts(tag, n)
SELECT tag, count(*) FROM entry_tags WHERE tag >= 't:' AND tag < 't;' GROUP BY tag
ON CONFLICT(tag) DO UPDATE SET n = excluded.n;

-- 8. Clean up staging tables.
DROP TABLE custom_script_map;
DROP TABLE script_tag_map;
DROP TABLE script_seeds;
