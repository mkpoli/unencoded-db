-- The categories people add. A category sits under a built-in category's slug, under another category here
-- by its name, or at the top. Records are filed under a category and every category above it, by `g:` rows.
CREATE TABLE categories (
  name TEXT PRIMARY KEY,
  parent TEXT,
  created_by TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL
) WITHOUT ROWID;

-- The categories records already carry, at the top, credited to the author of the first record to use each.
INSERT OR IGNORE INTO categories(name, parent, created_by, created_at)
SELECT c.value, NULL,
  (SELECT e2.created_by FROM claims c2 JOIN entries e2 ON e2.id = c2.entry_id WHERE c2.kind = 'genre' AND c2.value = c.value ORDER BY e2.created_at, e2.id LIMIT 1),
  MIN(e.created_at)
FROM claims c JOIN entries e ON e.id = c.entry_id
WHERE c.kind = 'genre' AND c.value NOT IN ('dialect', 'wu', 'mindong', 'yue', 'minnan', 'hakka', 'mandarin', 'nom', 'baiwen', 'kokuji', 'kokuji-kr',
  'abbreviation', 'shinjitai', 'shinjitai-extended', 'simplified-cn', 'simplified-cn-2', 'yakja', 'ryakuji', 'music', 'medicine', 'chemistry',
  'metrology', 'taoism', 'buddhism', 'qieshen', 'transliteration', 'names', 'places', 'flora-fauna')
GROUP BY c.value;
