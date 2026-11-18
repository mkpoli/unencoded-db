-- A source keeps its citation as written. The directory identifies the publisher or
-- publishing service for filtering. A NULL alias records a reviewed non-publisher.
CREATE TABLE publishers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  lookup TEXT NOT NULL UNIQUE,
  listed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE publisher_aliases (
  lookup TEXT PRIMARY KEY,
  spelling TEXT NOT NULL,
  publisher_id INTEGER REFERENCES publishers(id)
) WITHOUT ROWID;

WITH preferred(name) AS (VALUES ('江苏教育出版社'), ('广东人民出版社'), ('X'), ('QQ'),
  ('徐孝、張元善'), ('中央研究院歷史語言研究所'))
INSERT INTO publishers(name, lookup) SELECT name, lower(name) FROM preferred;
WITH aliases(spelling, name) AS (VALUES
  ('江蘇教育出版社','江苏教育出版社'), ('廣東人民出版社','广东人民出版社'), ('Twitter','X'),
  ('QQ羣','QQ'), ('QQ羣：zi.tools討論羣','QQ'), ('(明)徐孝、張元善','徐孝、張元善'),
  ('國立中央研究院歷史語言研究所集刊 第六本第四分','中央研究院歷史語言研究所'),
  ('中央研究院歷史語言研究所集刊 第三十九本下冊','中央研究院歷史語言研究所')
)
INSERT INTO publisher_aliases SELECT lower(replace(a.spelling, '：', ':')), a.spelling, p.id FROM aliases a JOIN publishers p ON p.name = a.name;
WITH unresolved(name) AS (VALUES ('未詳'), ('中國語文 1955年第3期'), ('CINCPAC-CINCPOA Bulletin No. 18-45'))
INSERT INTO publisher_aliases SELECT lower(name), name, NULL FROM unresolved;

ALTER TABLE sources ADD COLUMN publisher_id INTEGER REFERENCES publishers(id);
-- New citation writes supply a Unicode-normalized lookup. During migration and a
-- rolling release, this fallback covers all spellings in the audited legacy rows.
ALTER TABLE sources ADD COLUMN publisher_lookup TEXT;
CREATE VIEW source_publisher_fallback AS
SELECT id, nullif(lower(replace(trim(publisher, char(9,10,13,32,160,12288)), '：', ':')), '') AS lookup FROM sources;
CREATE INDEX sources_by_publisher_lookup ON sources(publisher_lookup);

CREATE TRIGGER source_publisher_resolve AFTER UPDATE OF publisher_lookup ON sources
BEGIN
  INSERT INTO publishers(name, lookup) SELECT trim(NEW.publisher), NEW.publisher_lookup
    WHERE NEW.publisher_lookup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM publisher_aliases WHERE lookup = NEW.publisher_lookup)
    ON CONFLICT(lookup) DO NOTHING;
  UPDATE sources SET publisher_id = CASE WHEN EXISTS (SELECT 1 FROM publisher_aliases WHERE lookup = NEW.publisher_lookup)
    THEN (SELECT publisher_id FROM publisher_aliases WHERE lookup = NEW.publisher_lookup)
    ELSE (SELECT id FROM publishers WHERE lookup = NEW.publisher_lookup) END WHERE id = NEW.id;
END;
CREATE TRIGGER source_publisher_added AFTER INSERT ON sources WHEN NEW.publisher IS NOT NULL
BEGIN
  UPDATE sources SET publisher_lookup = coalesce(NEW.publisher_lookup, (SELECT lookup FROM source_publisher_fallback WHERE id = NEW.id)) WHERE id = NEW.id;
END;
UPDATE sources SET publisher_lookup = (SELECT lookup FROM source_publisher_fallback WHERE id = sources.id) WHERE publisher IS NOT NULL;

-- Later curation immediately moves existing sources into the corrected group.
CREATE TRIGGER publisher_alias_added AFTER INSERT ON publisher_aliases BEGIN
  UPDATE sources SET publisher_lookup = publisher_lookup WHERE publisher_lookup = NEW.lookup;
END;
CREATE TRIGGER publisher_alias_changed AFTER UPDATE ON publisher_aliases BEGIN
  UPDATE sources SET publisher_lookup = publisher_lookup WHERE publisher_lookup IN (OLD.lookup, NEW.lookup);
END;
CREATE TRIGGER publisher_alias_removed AFTER DELETE ON publisher_aliases BEGIN
  UPDATE sources SET publisher_lookup = publisher_lookup WHERE publisher_lookup = OLD.lookup;
END;

CREATE INDEX sources_listed_publisher ON sources(publisher_id, id) WHERE records > 0;
CREATE INDEX sources_any_publisher ON sources(publisher_id);
CREATE INDEX sources_by_records_publisher ON sources(publisher_id, records, id) WHERE records > 0;
CREATE INDEX sources_by_year_publisher ON sources(publisher_id, year, id) WHERE records > 0 AND year IS NOT NULL;
CREATE INDEX sources_undated_publisher ON sources(publisher_id, id) WHERE records > 0 AND year IS NULL;
CREATE INDEX publisher_aliases_by_publisher ON publisher_aliases(publisher_id);

-- Keep suggestion reads bounded even when many publishers have only hidden citations.
CREATE INDEX publishers_listed ON publishers(lookup) WHERE listed = 1;
CREATE VIEW publisher_usage AS SELECT p.id,
  EXISTS (SELECT 1 FROM sources s WHERE s.publisher_id = p.id AND s.records > 0) AS listed,
  NOT EXISTS (SELECT 1 FROM sources s WHERE s.publisher_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM publisher_aliases a WHERE a.publisher_id = p.id) AS unused
  FROM publishers p;
UPDATE publishers SET listed = (SELECT u.listed FROM publisher_usage u WHERE u.id = publishers.id);
CREATE TRIGGER source_publisher_visibility AFTER UPDATE OF publisher_id, records ON sources
WHEN NEW.publisher_id IS NOT OLD.publisher_id OR (NEW.records > 0) != (OLD.records > 0)
BEGIN
  UPDATE publishers SET listed = (SELECT u.listed FROM publisher_usage u WHERE u.id = publishers.id)
    WHERE id IN (OLD.publisher_id, NEW.publisher_id);
  DELETE FROM publishers WHERE id = OLD.publisher_id AND (SELECT unused FROM publisher_usage WHERE id = OLD.publisher_id);
END;
CREATE TRIGGER source_publisher_removed AFTER DELETE ON sources WHEN OLD.publisher_id IS NOT NULL
BEGIN
  UPDATE publishers SET listed = (SELECT listed FROM publisher_usage WHERE id = OLD.publisher_id) WHERE id = OLD.publisher_id;
  DELETE FROM publishers WHERE id = OLD.publisher_id AND (SELECT unused FROM publisher_usage WHERE id = OLD.publisher_id);
END;
