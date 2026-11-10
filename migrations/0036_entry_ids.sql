-- A character may be described by more than one sequence. `entries.ids` holds them separated by
-- whitespace, in entered order; this table indexes each one so a description can be looked up without
-- reading the record.
CREATE TABLE entry_ids (
  ids TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  PRIMARY KEY (ids, entry_id)
) WITHOUT ROWID;
CREATE INDEX entry_ids_entry ON entry_ids(entry_id);

WITH RECURSIVE split(entry_id, value, rest) AS (
  SELECT id, '', replace(replace(replace(replace(replace(coalesce(ids, ''), char(9), ' '), char(10), ' '), char(11), ' '), char(12), ' '), char(13), ' ') || ' ' FROM entries
  UNION ALL
  SELECT entry_id, substr(rest, 1, instr(rest, ' ') - 1), substr(rest, instr(rest, ' ') + 1)
  FROM split WHERE rest <> ''
)
INSERT OR IGNORE INTO entry_ids (ids, entry_id) SELECT value, entry_id FROM split WHERE value <> '';

-- The split lives in triggers so every writer, including a data import, keeps the index true.
CREATE TRIGGER entries_ids_insert AFTER INSERT ON entries BEGIN
  INSERT OR IGNORE INTO entry_ids(ids, entry_id)
  SELECT value, NEW.id FROM (
    WITH RECURSIVE split(value, rest) AS (
      SELECT '', replace(replace(replace(replace(replace(coalesce(NEW.ids, ''), char(9), ' '), char(10), ' '), char(11), ' '), char(12), ' '), char(13), ' ') || ' '
      UNION ALL
      SELECT substr(rest, 1, instr(rest, ' ') - 1), substr(rest, instr(rest, ' ') + 1)
      FROM split WHERE rest <> ''
    )
    SELECT value FROM split WHERE value <> ''
  );
END;

CREATE TRIGGER entries_ids_update AFTER UPDATE OF ids ON entries BEGIN
  DELETE FROM entry_ids WHERE entry_id = NEW.id;
  INSERT OR IGNORE INTO entry_ids(ids, entry_id)
  SELECT value, NEW.id FROM (
    WITH RECURSIVE split(value, rest) AS (
      SELECT '', replace(replace(replace(replace(replace(coalesce(NEW.ids, ''), char(9), ' '), char(10), ' '), char(11), ' '), char(12), ' '), char(13), ' ') || ' '
      UNION ALL
      SELECT substr(rest, 1, instr(rest, ' ') - 1), substr(rest, instr(rest, ' ') + 1)
      FROM split WHERE rest <> ''
    )
    SELECT value FROM split WHERE value <> ''
  );
END;

CREATE TRIGGER entries_ids_delete AFTER DELETE ON entries BEGIN
  DELETE FROM entry_ids WHERE entry_id = OLD.id;
END;
