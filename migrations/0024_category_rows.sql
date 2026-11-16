-- Every category is a row: the ones the site started with and the ones people added alike. `name` is what a
-- record's claim stores and never changes; `label` is what is shown; `position` orders a category among the
-- categories under the same parent; `rev` is the id of the change that last wrote the row, 0 for none, and a
-- write names the `rev` it read so that it lands only on the row it saw. A category the site started with
-- has no author or date.
CREATE TABLE categories_rows (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  parent TEXT,
  position INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES people(id),
  created_at TEXT
) WITHOUT ROWID;

INSERT INTO categories_rows(name, label, parent, position) VALUES
  ('dialect', '方言字', NULL, 0),
  ('wu', '吳語', 'dialect', 0),
  ('mindong', '閩東語', 'dialect', 1),
  ('yue', '粵語', 'dialect', 2),
  ('minnan', '閩南語', 'dialect', 3),
  ('hakka', '客家語', 'dialect', 4),
  ('mandarin', '官話', 'dialect', 5),
  ('nom', '喃字', 'dialect', 6),
  ('baiwen', '白文', 'dialect', 7),
  ('kokuji', '日本國字', 'dialect', 8),
  ('kokuji-kr', '朝鮮國字', 'dialect', 9),
  ('abbreviation', '略字・簡化字', NULL, 1),
  ('shinjitai', '日本新字體', 'abbreviation', 0),
  ('shinjitai-extended', '日本擴張新字體', 'abbreviation', 1),
  ('simplified-cn', '大陸簡體字', 'abbreviation', 2),
  ('simplified-cn-2', '大陸二簡字', 'abbreviation', 3),
  ('yakja', '韓國略字', 'abbreviation', 4),
  ('ryakuji', '日本俗略字', 'abbreviation', 5),
  ('music', '樂譜', NULL, 2),
  ('medicine', '醫藥', NULL, 3),
  ('chemistry', '化學', NULL, 4),
  ('metrology', '度量衡', NULL, 5),
  ('taoism', '道教', NULL, 6),
  ('buddhism', '佛教', NULL, 7),
  ('qieshen', '切身', NULL, 8),
  ('transliteration', '音譯', NULL, 9),
  ('names', '人名', NULL, 10),
  ('places', '地名', NULL, 11),
  ('flora-fauna', '動植物', NULL, 12);

-- An added category keeps its name as its label and follows the started-with categories under its parent,
-- the earliest added first.
INSERT INTO categories_rows(name, label, parent, position, created_by, created_at)
SELECT c.name, c.name, c.parent,
  (SELECT count(*) FROM categories_rows b WHERE b.parent IS c.parent) + row_number() OVER (PARTITION BY c.parent ORDER BY c.created_at, c.name) - 1,
  c.created_by, c.created_at
FROM categories c
WHERE c.name NOT IN (SELECT name FROM categories_rows);

DROP TABLE categories;
ALTER TABLE categories_rows RENAME TO categories;
-- The categories under one parent in order, and a label names one category.
CREATE INDEX categories_by_parent ON categories(parent, position);
CREATE UNIQUE INDEX categories_by_label ON categories(label);

-- What was done to the categories, newest last: `before` and `after` are JSON of the fields the change touched.
-- A category's changes are read newest first to undo the latest, and a writer's moves of the last hour are counted.
CREATE TABLE category_changes(id INTEGER PRIMARY KEY, name TEXT, kind TEXT, before TEXT, after TEXT, actor TEXT, at TEXT);
CREATE INDEX category_changes_by_name ON category_changes(name, id);
CREATE INDEX category_changes_by_actor ON category_changes(actor, kind, at);
