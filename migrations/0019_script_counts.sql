-- A script filter reads one row per script value, and its tab counts come from
-- this table rather than a scan of the records.
CREATE TABLE script_counts (
  script TEXT PRIMARY KEY,
  n INTEGER NOT NULL CHECK (n >= 0)
) WITHOUT ROWID;

INSERT INTO script_counts (script, n)
SELECT script, COUNT(*) FROM entries WHERE visible = 1 GROUP BY script;

CREATE INDEX entries_visible_script ON entries(script, id DESC) WHERE visible = 1;

CREATE TRIGGER entries_script_counts_insert AFTER INSERT ON entries WHEN NEW.visible = 1
BEGIN
  INSERT INTO script_counts (script, n) VALUES (NEW.script, 1)
  ON CONFLICT(script) DO UPDATE SET n = n + 1;
END;

CREATE TRIGGER entries_script_counts_delete AFTER DELETE ON entries WHEN OLD.visible = 1
BEGIN
  UPDATE script_counts SET n = n - 1 WHERE script = OLD.script;
  DELETE FROM script_counts WHERE n = 0;
END;

CREATE TRIGGER entries_script_counts_update AFTER UPDATE OF script, visible ON entries
BEGIN
  UPDATE script_counts SET n = n - 1 WHERE OLD.visible = 1 AND script = OLD.script;
  INSERT OR IGNORE INTO script_counts (script, n) SELECT NEW.script, 0 WHERE NEW.visible = 1;
  UPDATE script_counts SET n = n + 1 WHERE NEW.visible = 1 AND script = NEW.script;
  DELETE FROM script_counts WHERE n = 0;
END;
