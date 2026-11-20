-- 陳劍, 〈古文字考釋〉, in 《出土文獻與古文字教程》, 上冊, 中西書局, 2024.
-- The introduction has its own pagination. Keep the contributor's place string,
-- including the first “p/ 7”, alongside the structured citation and printed page.
CREATE TABLE fudan_pages (
  sighting INTEGER PRIMARY KEY, entry INTEGER UNIQUE, journal INTEGER, snapshot_id INTEGER, page TEXT
);
INSERT INTO fudan_pages VALUES
  (1815, 1739, 5097, 5097, '7'),
  (1816, 1740, 5099, 5099, '7'),
  (1817, 1741, 5101, 5101, '8'),
  (1818, 1742, 5103, 5103, '8'),
  (1819, 1743, 5105, 5105, '8'),
  (1820, 1744, 5107, 5107, '8'),
  (1821, 1745, 5109, 5109, '10'),
  (1822, 1746, 5111, 5111, '10'),
  (1823, 1747, 5113, 5113, '11'),
  (1824, 1748, 5115, 5115, '11'),
  (1825, 1749, 5117, 5117, '11'),
  (1826, 1750, 5119, 5119, '12'),
  (1827, 1751, 5121, 5121, '15'),
  (1828, 1752, 5123, 5123, '15'),
  (1829, 1753, 5125, 5125, '16'),
  (1830, 1754, 5127, 5127, '16'),
  (1831, 1755, 5129, 5129, '16'),
  (1832, 1756, 5131, 5131, '20'),
  (1833, 1757, 5133, 5133, '21'),
  (1834, 1758, 5135, 5135, '21'),
  (1835, 1759, 5137, 5137, '21'),
  (1836, 1760, 5139, 5139, '22'),
  (1837, 1761, 5141, 5141, '23'),
  (1838, 1762, 5143, 5143, '23'),
  (1839, 1763, 5145, 5145, '23'),
  (1840, 1764, 5147, 5147, '23'),
  (1841, 1765, 5152, 5149, '24'),
  (1842, 1766, 5151, 5151, '24'),
  (1843, 1767, 5154, 5154, '24'),
  (1844, 1768, 5156, 5156, '24'),
  (1845, 1769, 5943, 5158, '24');

-- The index updates below describe records with this single public sighting.
-- Skip a record that changed after review or whose original snapshot was redacted.
DELETE FROM fudan_pages AS p WHERE NOT EXISTS (
  SELECT 1 FROM sightings s JOIN entries e ON e.id = s.entry_id
  JOIN revisions r ON r.id = p.snapshot_id AND r.sighting_id = s.id AND r.entry_id = e.id
  WHERE s.id = p.sighting AND e.id = p.entry AND s.source_id IS NULL AND s.page IS NULL
    AND s.place = '復旦大學出土文獻與古文字研究中心 (ed.) 2024 - 出土文獻與古文字教程 (p'
      || CASE WHEN s.id = 1815 THEN '/ ' ELSE '. ' END || p.page || ')'
    AND s.rev = 1 AND r.rev = s.rev AND r.kind = 'sighting' AND r.redacted_at IS NULL
    AND (SELECT max(id) FROM revisions WHERE entry_id = e.id) = p.journal
    AND e.hidden_at IS NULL AND e.merged_into IS NULL AND s.hidden_at IS NULL
    AND s.original_date IS NULL AND e.first_year IS NULL AND e.script = 'han'
    AND NOT EXISTS (SELECT 1 FROM sightings other WHERE other.entry_id = e.id AND other.id != s.id AND other.hidden_at IS NULL)
);
CREATE TABLE fudan_work (hash TEXT PRIMARY KEY, title TEXT, author TEXT, publisher TEXT, report_date TEXT);
INSERT INTO fudan_work SELECT '95c096cd450c64ce0d7ed148194738a7c659f599069213907369ff25124015ae',
  '出土文獻與古文字教程・古文字考釋', '陳劍', '中西書局', '2024' WHERE EXISTS (SELECT 1 FROM fudan_pages);
INSERT INTO sources(hash, title, author, publisher, report_date, year, name_lookup, publisher_lookup)
  SELECT hash, title, author, publisher, report_date, 2024, title, publisher FROM fudan_work WHERE true
  ON CONFLICT(hash) DO NOTHING;
INSERT OR IGNORE INTO source_aliases(source_id, lookup, spelling)
  SELECT c.id, a.spelling, a.spelling FROM fudan_work w JOIN sources c ON c.hash = w.hash
  CROSS JOIN (SELECT '出土文献与古文字教程・古文字考释' AS spelling UNION ALL SELECT '古文字考釋' UNION ALL SELECT '古文字考释') a;

CREATE TABLE fudan_editor (actor TEXT PRIMARY KEY, at TEXT);
INSERT INTO fudan_editor SELECT lower(hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM fudan_work;
INSERT INTO people(id, name, created_at) SELECT actor, 'Catalogue maintenance', at FROM fudan_editor;

UPDATE sightings AS s SET source_id = (SELECT c.id FROM sources c JOIN fudan_work w USING(hash)),
  page = p.page, rev = rev + 1, updated_at = (SELECT at FROM fudan_editor)
  FROM fudan_pages p WHERE s.id = p.sighting;
INSERT INTO revisions(entry_id, sighting_id, kind, rev, snapshot, summary, actor, at)
SELECT p.entry, s.id, 'sighting_edit', s.rev,
  json_set(r.snapshot, '$.title', c.title, '$.author', c.author, '$.publisher', c.publisher,
    '$.report_date', c.report_date, '$.page', s.page, '$.quotes', s.quotes),
  'Identify the cited chapter and printed page', ed.actor, ed.at
FROM fudan_pages p JOIN revisions r ON r.id = p.snapshot_id JOIN sightings s ON s.id = p.sighting
  JOIN sources c ON c.id = s.source_id CROSS JOIN fudan_editor ed;

UPDATE entries AS e SET first_year = '2024', first_year_kind = 'report', first_sighting = p.sighting,
  updated_at = (SELECT at FROM fudan_editor) FROM fudan_pages p WHERE e.id = p.entry;
-- The volume title and institutional credit are already indexed from the place.
-- Add the terms of the chapter title, author and imprint using the catalogue's CJK tokenization.
INSERT OR IGNORE INTO entry_tags(entry_id, tag)
  SELECT p.entry, 'w:' || j.value FROM fudan_pages p, json_each('["古","文","字","考","釋","陳","劍","中","西","書","局"]') j;
-- The older genre-to-tag migration predates indexing tag names as search terms.
-- A normal sighting edit also indexes the existing 隸定 claim on these records.
INSERT OR IGNORE INTO entry_tags(entry_id, tag)
  SELECT p.entry, word FROM fudan_pages p JOIN claims k ON k.entry_id = p.entry
  CROSS JOIN (SELECT 'w:隸' AS word UNION ALL SELECT 'w:定')
  WHERE k.kind = 'tag' AND k.value = '隸定';
DELETE FROM entry_tags WHERE entry_id IN (SELECT entry FROM fudan_pages) AND tag IN ('n:source', 's:han|n:source');
INSERT INTO entry_tags(entry_id, tag, sightings, year) SELECT entry, 'y:2020', 1, 2024 FROM fudan_pages;
UPDATE entry_tags SET year = 2024 WHERE entry_id IN (SELECT entry FROM fudan_pages) AND tag NOT GLOB '[wp]:*';
INSERT INTO tag_counts(tag, n)
  SELECT key, (SELECT count(*) FROM entry_tags WHERE tag = key) FROM
    (SELECT 'n:source' AS key UNION ALL SELECT 's:han|n:source' UNION ALL SELECT 'y:2020')
    WHERE EXISTS (SELECT 1 FROM fudan_pages)
  ON CONFLICT(tag) DO UPDATE SET n = excluded.n;

UPDATE sources SET records = (SELECT count(*) FROM (
  SELECT s.entry_id FROM sightings s JOIN entries e ON e.id = s.entry_id
    WHERE s.source_id = sources.id AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
  UNION SELECT s.entry_id FROM sighting_vias v JOIN sightings s ON s.id = v.sighting_id JOIN entries e ON e.id = s.entry_id
    WHERE v.source_id = sources.id AND s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL
)) WHERE hash IN (SELECT hash FROM fudan_work);
DROP TABLE fudan_editor;
DROP TABLE fudan_work;
DROP TABLE fudan_pages;
