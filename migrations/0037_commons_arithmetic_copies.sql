-- Register these two Commons files by their full repository filenames. The
-- viewer's decimal frame and the contributor's printed locator are independent.
INSERT INTO digitized_copies(slug, title, collection) VALUES
  ('commons-nlc-40050', '大數小數命名標準研究意見書', 'Wikimedia Commons'),
  ('commons-nlc-71313', '中等算術教科書', 'Wikimedia Commons');

-- Browsers can paste the same file path with literal Han or percent escapes.
INSERT INTO copy_page_prefixes(copy_slug, prefix) VALUES
  ('commons-nlc-40050', 'https://commons.wikimedia.org/wiki/File:NLC416-08jh009205-40050_大數小數命名標準研究意見書.pdf?page='),
  ('commons-nlc-40050', 'https://commons.wikimedia.org/wiki/File:NLC416-08jh009205-40050_%E5%A4%A7%E6%95%B8%E5%B0%8F%E6%95%B8%E5%91%BD%E5%90%8D%E6%A8%99%E6%BA%96%E7%A0%94%E7%A9%B6%E6%84%8F%E8%A6%8B%E6%9B%B8.pdf?page='),
  ('commons-nlc-71313', 'https://commons.wikimedia.org/wiki/File:NLC416-14jh005564-71313_中等算術教科書.pdf?page='),
  ('commons-nlc-71313', 'https://commons.wikimedia.org/wiki/File:NLC416-14jh005564-71313_%E4%B8%AD%E7%AD%89%E7%AE%97%E8%A1%93%E6%95%99%E7%A7%91%E6%9B%B8.pdf?page=');

-- Seed editable aliases only for citations that name the book itself. A chapter
-- or article can use the same scan URL while having a different title.
CREATE TABLE copy_title_aliases (
  copy_slug TEXT NOT NULL REFERENCES digitized_copies(slug),
  lookup TEXT NOT NULL,
  spelling TEXT NOT NULL,
  PRIMARY KEY (copy_slug, lookup)
) WITHOUT ROWID;
INSERT INTO copy_title_aliases(copy_slug, lookup, spelling) VALUES
  ('commons-nlc-40050', '大数小数命名标准研究意见书', '大数小数命名标准研究意见书'),
  ('commons-nlc-71313', '中等算术教科书', '中等算术教科书');

CREATE VIEW copy_citation_aliases AS
  SELECT p.source_id, a.lookup, a.spelling FROM digitized_copy_pages p
    JOIN digitized_copies d ON d.slug = p.copy_slug
    JOIN sources c ON c.id = p.source_id AND c.title = d.title
    JOIN copy_title_aliases a ON a.copy_slug = d.slug;

-- History keeps the entered spelling, not its Unicode-normalized lookup.
-- Leave previously curated removals alone when backfilling existing citations.
INSERT OR IGNORE INTO source_aliases(source_id, lookup, spelling)
  SELECT a.source_id, a.lookup, a.spelling FROM copy_citation_aliases a
  WHERE NOT EXISTS (SELECT 1 FROM source_alias_changes h WHERE h.source_id = a.source_id AND h.removed = 1)
    AND (SELECT count(*) FROM source_aliases n WHERE n.source_id = a.source_id) < 50;
CREATE TRIGGER copy_title_alias_on_insert AFTER INSERT ON sources WHEN NEW.url IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO source_aliases(source_id, lookup, spelling)
    SELECT source_id, lookup, spelling FROM copy_citation_aliases WHERE source_id = NEW.id;
END;
