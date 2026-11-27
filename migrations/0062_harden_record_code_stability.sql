-- Harden the record-code permanence triggers added in 0053:
-- 1. Watch every UPDATE on entries (not only `OF id`) so rowid/_rowid_/oid aliases cannot rekey a record.
-- 2. Block INSERT OR REPLACE over an existing record even when recursive_triggers is OFF.
-- 3. Verify no legacy upward merge (`merged_into >= id`) exists so the acyclic-chain invariant holds on all rows.
DROP TRIGGER IF EXISTS entries_no_rekey;
CREATE TRIGGER entries_no_rekey BEFORE UPDATE ON entries
WHEN NEW.id <> OLD.id
BEGIN
  SELECT RAISE(ABORT, 'entry id cannot change');
END;

DROP TRIGGER IF EXISTS entries_no_replace;
CREATE TRIGGER entries_no_replace BEFORE INSERT ON entries
WHEN NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM entries WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'entries cannot be replaced');
END;

UPDATE entries SET merged_into = merged_into WHERE merged_into >= id;
