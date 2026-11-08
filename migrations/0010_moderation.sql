CREATE TABLE moderation_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('hide', 'restore')),
  moderator TEXT NOT NULL CHECK (length(moderator) BETWEEN 3 AND 320),
  created_at TEXT NOT NULL
);

CREATE INDEX entries_hidden_id ON entries(id DESC) WHERE visible = 0;

-- The transition belongs to the audit insert. Checks run before the row is
-- accepted and the visibility change runs after it, so an INSERT OR IGNORE that
-- is skipped never changes visibility. A failed change aborts and rolls back.
CREATE TRIGGER moderation_audit_check
BEFORE INSERT ON moderation_audit
BEGIN
  SELECT RAISE(ABORT, 'moderation: audit rows are append-only')
  WHERE NEW.id IS NOT NULL AND EXISTS (SELECT 1 FROM moderation_audit WHERE id = NEW.id);
  SELECT RAISE(ABORT, 'moderation: unknown action')
  WHERE NEW.action NOT IN ('hide', 'restore');
  SELECT RAISE(ABORT, 'moderation: entry is not visible')
  WHERE NEW.action = 'hide'
    AND NOT EXISTS (SELECT 1 FROM entries WHERE id = NEW.entry_id AND visible = 1);
  SELECT RAISE(ABORT, 'moderation: entry is not hidden')
  WHERE NEW.action = 'restore'
    AND NOT EXISTS (SELECT 1 FROM entries WHERE id = NEW.entry_id AND visible = 0);
END;

CREATE TRIGGER moderation_audit_apply
AFTER INSERT ON moderation_audit
BEGIN
  UPDATE entries
  SET visible = CASE NEW.action WHEN 'hide' THEN 0 ELSE 1 END
  WHERE id = NEW.entry_id;
END;

CREATE TRIGGER moderation_audit_no_update
BEFORE UPDATE ON moderation_audit
BEGIN
  SELECT RAISE(ABORT, 'moderation: audit rows are append-only');
END;

CREATE TRIGGER moderation_audit_no_delete
BEFORE DELETE ON moderation_audit
BEGIN
  SELECT RAISE(ABORT, 'moderation: audit rows are append-only');
END;
