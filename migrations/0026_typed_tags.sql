-- Unify categories and #tags into typed tags with DAG implications. Each tag holds a type (which
-- determines its color) and may automatically carry other tags via `tag_implications`.
CREATE TABLE tags (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general','region','language','form','domain','meta')),
  position INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES people(id),
  created_at TEXT
) WITHOUT ROWID;
CREATE UNIQUE INDEX tags_by_label ON tags(label);
CREATE INDEX tags_by_type ON tags(type, position, name);

CREATE TABLE tag_implications (
  tag TEXT NOT NULL REFERENCES tags(name),
  implies TEXT NOT NULL REFERENCES tags(name),
  PRIMARY KEY (tag, implies),
  CHECK (tag <> implies)
) WITHOUT ROWID;
CREATE INDEX tag_implications_by_implies ON tag_implications(implies, tag);

CREATE TABLE tag_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('create','move','rename','retype','imply','unimply','delete')),
  before TEXT,
  after TEXT,
  actor TEXT,
  at TEXT
);
CREATE INDEX tag_changes_by_name ON tag_changes(name, id);
CREATE INDEX tag_changes_by_actor ON tag_changes(actor, kind, at);

-- Preserve change history and keep `tag_changes` sequence past every migrated `rev`.
INSERT INTO tag_changes(id, name, kind, before, after, actor, at)
SELECT id, COALESCE(name, ''), kind, before, after, actor, at FROM category_changes;

INSERT INTO tag_changes(id, name, kind, before, after, actor, at)
SELECT MAX(COALESCE((SELECT MAX(rev) FROM categories), 0), COALESCE((SELECT MAX(id) FROM category_changes), 0)) + 1, '', 'create', NULL, NULL, NULL, NULL
WHERE COALESCE((SELECT MAX(rev) FROM categories), 0) > COALESCE((SELECT MAX(id) FROM category_changes), 0);
DELETE FROM tag_changes WHERE name = '' AND at IS NULL;

-- Migrate existing categories into typed tags.
INSERT INTO tags(name, label, type, position, rev, created_by, created_at)
SELECT name, label,
  CASE
    WHEN name IN ('dialect','wu','mindong','yue','minnan','hakka','mandarin') THEN 'language'
    WHEN name IN ('nom','baiwen','kokuji','kokuji-kr','abbreviation','shinjitai','shinjitai-extended','simplified-cn','simplified-cn-2','yakja','ryakuji') THEN 'form'
    WHEN name IN ('music','medicine','chemistry','metrology','taoism','buddhism','qieshen','transliteration','names','places','flora-fauna') THEN 'domain'
    ELSE 'general'
  END,
  position, rev, created_by, created_at
FROM categories;

-- Migrate single-parent category trees into tag implications.
INSERT OR IGNORE INTO tag_implications(tag, implies)
SELECT name, parent FROM categories
WHERE parent IS NOT NULL AND parent IN (SELECT name FROM tags) AND name <> parent;

-- Normalize existing genre/tag claims onto canonical tag names, deduplicate, and unify under kind = 'tag'.
UPDATE claims
SET value = (SELECT t.name FROM tags t WHERE t.label = claims.value)
WHERE kind IN ('genre', 'tag')
  AND EXISTS (SELECT 1 FROM tags t WHERE t.label = claims.value AND t.name <> claims.value);

DELETE FROM claims
WHERE kind IN ('genre', 'tag')
  AND id NOT IN (SELECT MIN(id) FROM claims WHERE kind IN ('genre', 'tag') GROUP BY entry_id, value);

UPDATE claims SET kind = 'tag' WHERE kind = 'genre';

-- Ensure every existing freeform tag claim has a row in `tags`.
INSERT OR IGNORE INTO tags(name, label, type, position, created_by, created_at)
SELECT c.value, c.value, 'general',
  (SELECT count(*) FROM tags WHERE type = 'general') + row_number() OVER (ORDER BY MIN(e.created_at), c.value) - 1,
  (SELECT e2.created_by FROM claims c2 JOIN entries e2 ON e2.id = c2.entry_id WHERE c2.kind = 'tag' AND c2.value = c.value ORDER BY e2.created_at, e2.id LIMIT 1),
  MIN(e.created_at)
FROM claims c JOIN entries e ON e.id = c.entry_id
WHERE c.kind = 'tag'
  AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.name = c.value OR t.label = c.value)
GROUP BY c.value;

-- Seed region tags and form tags with automatic implications.
INSERT INTO tags(name, label, type, position)
SELECT v.name, v.label, 'region', v.pos
FROM (
  SELECT '日本' AS name, '日本' AS label, 0 AS pos
  UNION ALL SELECT '越南', '越南', 1
  UNION ALL SELECT '大陸', '大陸', 2
  UNION ALL SELECT '韓國', '韓國', 3
  UNION ALL SELECT '臺灣', '臺灣', 4
) v
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.label = v.label AND t.name <> v.name)
ON CONFLICT(name) DO UPDATE SET type = 'region' WHERE type = 'general';

INSERT INTO tags(name, label, type, position)
SELECT 'ゲバ字', 'ゲバ字', 'form', COALESCE((SELECT MAX(position) + 1 FROM tags WHERE type = 'form'), 0)
WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.label = 'ゲバ字' AND t.name <> 'ゲバ字')
ON CONFLICT(name) DO UPDATE SET type = 'form' WHERE type = 'general';

-- D1 allows at most five terms in a compound SELECT, so the seed takes two statements.
INSERT OR IGNORE INTO tag_implications(tag, implies)
SELECT t.src, t.dst FROM (
  SELECT 'nom' AS src, '越南' AS dst
  UNION ALL SELECT 'kokuji', '日本'
  UNION ALL SELECT 'shinjitai', '日本'
  UNION ALL SELECT 'shinjitai-extended', '日本'
  UNION ALL SELECT 'ryakuji', '日本'
) t
WHERE EXISTS (SELECT 1 FROM tags WHERE name = t.src)
  AND EXISTS (SELECT 1 FROM tags WHERE name = t.dst);

INSERT OR IGNORE INTO tag_implications(tag, implies)
SELECT t.src, t.dst FROM (
  SELECT 'ゲバ字' AS src, '日本' AS dst
  UNION ALL SELECT 'simplified-cn', '大陸'
  UNION ALL SELECT 'simplified-cn-2', '大陸'
  UNION ALL SELECT 'yakja', '韓國'
  UNION ALL SELECT 'kokuji-kr', '韓國'
) t
WHERE EXISTS (SELECT 1 FROM tags WHERE name = t.src)
  AND EXISTS (SELECT 1 FROM tags WHERE name = t.dst);

-- Rebuild all `g:` and `t:` index rows and facet counts using transitive DAG implications.
DELETE FROM entry_tags WHERE (tag >= 'g:' AND tag < 'g;') OR (tag >= 't:' AND tag < 't;');
DELETE FROM tag_counts WHERE (tag >= 'g:' AND tag < 'g;') OR (tag >= 't:' AND tag < 't;');

WITH RECURSIVE implied(entry_id, name) AS (
  SELECT cl.entry_id, cl.value FROM claims cl WHERE +cl.kind = 'tag'
  UNION
  SELECT implied.entry_id, i.implies FROM implied JOIN tag_implications i ON i.tag = implied.name
)
INSERT OR IGNORE INTO entry_tags(tag, entry_id, sightings, year)
SELECT 't:' || implied.name, implied.entry_id, e.sightings, CAST(e.first_year AS INTEGER)
FROM implied CROSS JOIN entries e ON e.id = implied.entry_id
WHERE e.merged_into IS NULL AND e.hidden_at IS NULL;

INSERT INTO tag_counts(tag, n)
SELECT tag, count(*) FROM entry_tags WHERE tag >= 't:' AND tag < 't;' GROUP BY tag
ON CONFLICT(tag) DO UPDATE SET n = excluded.n;

DROP TABLE categories;
DROP TABLE category_changes;
