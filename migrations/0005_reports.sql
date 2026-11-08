CREATE TABLE entry_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'privacy', 'rights', 'other')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX entry_reports_open ON entry_reports(id) WHERE resolved_at IS NULL;

CREATE INDEX entry_reports_entry ON entry_reports(entry_id);

-- A report is accepted only while its entry is public. The route repeats this
-- check, and the trigger keeps a concurrent hide from admitting a late report.
CREATE TRIGGER entry_reports_require_visible
BEFORE INSERT ON entry_reports
BEGIN
  SELECT RAISE(ABORT, 'reports: entry is not visible')
  WHERE NOT EXISTS (SELECT 1 FROM entries WHERE id = NEW.entry_id AND visible = 1);
  SELECT RAISE(ABORT, 'reports: too many open reports')
  WHERE (SELECT count(*) FROM entry_reports WHERE entry_id = NEW.entry_id AND resolved_at IS NULL) >= 100;
END;

-- Hiding resolves every open report for the entry in the same statement that
-- changes visibility. Restoring deliberately leaves resolved reports alone.
CREATE TRIGGER entry_reports_resolve_on_hide
AFTER INSERT ON moderation_audit
WHEN NEW.action = 'hide'
BEGIN
  UPDATE entry_reports
  SET resolved_at = NEW.created_at
  WHERE entry_id = NEW.entry_id AND resolved_at IS NULL;
END;
