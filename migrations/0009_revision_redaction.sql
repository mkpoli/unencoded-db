ALTER TABLE entry_revisions ADD COLUMN tombstone INTEGER NOT NULL DEFAULT 0 CHECK (tombstone IN (0, 1));

CREATE TABLE revision_redaction_audit (
  entry_id INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  redacted_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, revision),
  FOREIGN KEY (entry_id, revision) REFERENCES entry_revisions(entry_id, revision)
) WITHOUT ROWID;

DROP TRIGGER entries_revision_insert;
DROP TRIGGER entries_revision_update;
CREATE TRIGGER entries_revision_insert AFTER INSERT ON entries BEGIN
  INSERT INTO entry_revisions (entry_id, revision, script, ids, description, place, title, author, publisher, year, page, note, recorded_at)
  VALUES (NEW.id, NEW.revision, NEW.script, NEW.ids, NEW.description, NEW.place, NEW.title, NEW.author, NEW.publisher, NEW.year, NEW.page, NEW.note, NEW.created_at);
END;
CREATE TRIGGER entries_revision_update AFTER UPDATE OF revision ON entries WHEN NEW.revision != OLD.revision BEGIN
  INSERT INTO entry_revisions (entry_id, revision, script, ids, description, place, title, author, publisher, year, page, note, recorded_at)
  VALUES (NEW.id, NEW.revision, NEW.script, NEW.ids, NEW.description, NEW.place, NEW.title, NEW.author, NEW.publisher, NEW.year, NEW.page, NEW.note, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;

CREATE TRIGGER entry_revisions_no_tombstone_insert BEFORE INSERT ON entry_revisions
WHEN NEW.tombstone IS NOT 0 BEGIN SELECT RAISE(ABORT, 'Cannot insert a tombstone'); END;
CREATE TRIGGER entry_revisions_snapshot_provenance BEFORE INSERT ON entry_revisions
WHEN NOT EXISTS (SELECT 1 FROM entries WHERE id = NEW.entry_id AND revision = NEW.revision)
BEGIN SELECT RAISE(ABORT, 'Revisions must be current snapshots'); END;
CREATE TRIGGER entry_revisions_redaction_guard BEFORE UPDATE ON entry_revisions
WHEN OLD.tombstone IS NOT 0 OR NEW.tombstone IS NOT 1
  OR NEW.entry_id IS NOT OLD.entry_id OR NEW.revision IS NOT OLD.revision OR NEW.recorded_at IS NOT OLD.recorded_at
  OR NEW.script IS NOT '' OR NEW.ids IS NOT NULL OR NEW.description IS NOT NULL
  OR NEW.place IS NOT '' OR NEW.title IS NOT NULL OR NEW.author IS NOT NULL
  OR NEW.publisher IS NOT NULL OR NEW.year IS NOT NULL OR NEW.page IS NOT NULL OR NEW.note IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM entries WHERE id = OLD.entry_id AND revision != OLD.revision)
BEGIN SELECT RAISE(ABORT, 'Invalid revision redaction'); END;
DROP TRIGGER entry_revisions_no_update;
CREATE TRIGGER entry_revisions_redaction_audit AFTER UPDATE ON entry_revisions BEGIN
  INSERT INTO revision_redaction_audit (entry_id, revision, redacted_at)
  VALUES (NEW.entry_id, NEW.revision, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
CREATE TRIGGER revision_redaction_audit_provenance BEFORE INSERT ON revision_redaction_audit
WHEN NOT EXISTS (SELECT 1 FROM entry_revisions WHERE entry_id = NEW.entry_id AND revision = NEW.revision AND tombstone = 1)
BEGIN SELECT RAISE(ABORT, 'Audit records require a redacted revision'); END;
CREATE TRIGGER revision_redaction_audit_no_replace BEFORE INSERT ON revision_redaction_audit
WHEN EXISTS (SELECT 1 FROM revision_redaction_audit WHERE entry_id = NEW.entry_id AND revision = NEW.revision)
BEGIN SELECT RAISE(ABORT, 'Audit records are immutable'); END;
CREATE TRIGGER revision_redaction_audit_no_update BEFORE UPDATE ON revision_redaction_audit BEGIN SELECT RAISE(ABORT, 'Audit records are immutable'); END;
CREATE TRIGGER revision_redaction_audit_no_delete BEFORE DELETE ON revision_redaction_audit BEGIN SELECT RAISE(ABORT, 'Audit records are immutable'); END;
