-- A sighting that moves to another record takes its own changes in the journal along, and each stays counted
-- for its writer exactly while the history shows it.
CREATE TRIGGER uncount_moved_change BEFORE UPDATE OF entry_id ON revisions
WHEN OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes - 1 WHERE id = (SELECT account FROM visible_revisions WHERE id = OLD.id);
END;
CREATE TRIGGER recount_moved_change AFTER UPDATE OF entry_id ON revisions
WHEN OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes + 1 WHERE id = (SELECT account FROM visible_revisions WHERE id = NEW.id);
END;

-- Its reports go along, wherever they were made.
CREATE INDEX reports_by_sighting ON reports(sighting_id) WHERE sighting_id IS NOT NULL;
