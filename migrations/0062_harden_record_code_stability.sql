-- Harden the record-code permanence triggers added in 0053:
-- 1. Watch every UPDATE on entries (not only `OF id`) so rowid/_rowid_/oid aliases cannot rekey a record.
-- 2. Require positive record IDs (`id > 0`) so SQLite's unassigned `-1` sentinel in BEFORE INSERT never collides.
-- 3. Block INSERT OR REPLACE over an existing record even when recursive_triggers is OFF.
-- 4. Verify no legacy non-positive ID or upward merge (`merged_into >= id`) exists on migration.
DROP TRIGGER IF EXISTS entries_no_rekey;
CREATE TRIGGER entries_no_rekey BEFORE UPDATE ON entries
WHEN NEW.id <> OLD.id
BEGIN
  SELECT RAISE(ABORT, 'entry id cannot change');
END;

DROP TRIGGER IF EXISTS entries_positive_id;
CREATE TRIGGER entries_positive_id AFTER INSERT ON entries
WHEN NEW.id <= 0
BEGIN
  SELECT RAISE(ABORT, 'entry id must be positive');
END;

DROP TRIGGER IF EXISTS entries_positive_id_update;
CREATE TRIGGER entries_positive_id_update BEFORE UPDATE ON entries
WHEN NEW.id <= 0
BEGIN
  SELECT RAISE(ABORT, 'entry id must be positive');
END;

DROP TRIGGER IF EXISTS entries_no_replace;
CREATE TRIGGER entries_no_replace BEFORE INSERT ON entries
WHEN NEW.id > 0 AND EXISTS (SELECT 1 FROM entries WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'entries cannot be replaced');
END;

UPDATE entries SET merged_into = merged_into WHERE id <= 0 OR merged_into >= id;
