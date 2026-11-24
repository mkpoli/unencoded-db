-- Once assigned, a record's number is permanent: records are never deleted, their numbers never change,
-- and duplicates always merge the later number into an earlier one. Enforcing `merged_into < id` also
-- guarantees every merge chain is acyclic.
CREATE TRIGGER entries_no_delete BEFORE DELETE ON entries
BEGIN
  SELECT RAISE(ABORT, 'entries cannot be deleted');
END;

CREATE TRIGGER entries_no_rekey BEFORE UPDATE OF id ON entries
WHEN NEW.id <> OLD.id
BEGIN
  SELECT RAISE(ABORT, 'entry id cannot change');
END;

CREATE TRIGGER entries_merge_earlier_insert AFTER INSERT ON entries
WHEN NEW.merged_into IS NOT NULL AND NEW.merged_into >= NEW.id
BEGIN
  SELECT RAISE(ABORT, 'a record can only merge into an earlier record');
END;

CREATE TRIGGER entries_merge_earlier_update BEFORE UPDATE OF merged_into ON entries
WHEN NEW.merged_into IS NOT NULL AND NEW.merged_into >= NEW.id
BEGIN
  SELECT RAISE(ABORT, 'a record can only merge into an earlier record');
END;
