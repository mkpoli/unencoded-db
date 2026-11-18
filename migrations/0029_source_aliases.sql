CREATE TABLE source_aliases (
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  lookup TEXT NOT NULL,
  spelling TEXT NOT NULL,
  PRIMARY KEY (source_id, lookup)
) WITHOUT ROWID;

CREATE TABLE source_alias_changes (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  spelling TEXT NOT NULL,
  removed INTEGER NOT NULL,
  actor TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX source_alias_changes_by_source ON source_alias_changes(source_id, id);

-- The release sweep replaces SQLite's legacy ASCII fallback with Unicode keys.
ALTER TABLE sources ADD COLUMN name_lookup TEXT;
UPDATE sources SET name_lookup = lower(coalesce(title, url, author, publisher, report_date));
CREATE TRIGGER source_name_fallback AFTER INSERT ON sources WHEN NEW.name_lookup IS NULL
BEGIN
  UPDATE sources SET name_lookup = lower(coalesce(title, url, author, publisher, report_date)) WHERE id = NEW.id;
END;

-- Simplified spellings of three traditional titles already in the catalogue.
WITH variants(title, spelling) AS (VALUES
  ('合併字學集韻', '合并字学集韵'), ('彙音字典', '汇音字典'), ('大南一統志', '大南一统志')
)
INSERT INTO source_aliases(source_id, lookup, spelling)
SELECT s.id, v.spelling, v.spelling FROM variants v JOIN sources s ON s.title = v.title;

-- One key per public citation and spelling, even when an alias matches its title.
CREATE TABLE source_search_names (
  lookup TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (lookup, source_id)
) WITHOUT ROWID;
CREATE INDEX source_search_names_by_source ON source_search_names(source_id, lookup);
CREATE VIEW public_source_names AS
  SELECT id AS source_id, name_lookup AS lookup FROM sources WHERE records > 0 AND name_lookup IS NOT NULL
  UNION ALL SELECT a.source_id, a.lookup FROM source_aliases a JOIN sources s ON s.id = a.source_id WHERE s.records > 0;
INSERT OR IGNORE INTO source_search_names(source_id, lookup) SELECT source_id, lookup FROM public_source_names;

CREATE TRIGGER source_names_refresh AFTER UPDATE OF name_lookup, records ON sources
WHEN (NEW.records > 0) <> (OLD.records > 0) OR NEW.name_lookup IS NOT OLD.name_lookup
BEGIN
  DELETE FROM source_search_names WHERE source_id = NEW.id;
  INSERT OR IGNORE INTO source_search_names(source_id, lookup)
    SELECT source_id, lookup FROM public_source_names WHERE source_id = NEW.id;
END;
CREATE TRIGGER source_names_insert AFTER INSERT ON sources WHEN NEW.records > 0 AND NEW.name_lookup IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO source_search_names(lookup, source_id) VALUES(NEW.name_lookup, NEW.id);
END;
CREATE TRIGGER source_alias_add AFTER INSERT ON source_aliases
BEGIN
  INSERT OR IGNORE INTO source_search_names(lookup, source_id)
    SELECT NEW.lookup, NEW.source_id FROM sources WHERE id = NEW.source_id AND records > 0;
END;
CREATE TRIGGER source_alias_remove AFTER DELETE ON source_aliases
BEGIN
  DELETE FROM source_search_names WHERE source_id = OLD.source_id AND lookup = OLD.lookup
    AND NOT EXISTS (SELECT 1 FROM sources WHERE id = OLD.source_id AND records > 0 AND name_lookup = OLD.lookup);
END;
