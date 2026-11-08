CREATE TABLE report_dismissals (
  report_id INTEGER PRIMARY KEY REFERENCES entry_reports(id),
  moderator TEXT NOT NULL CHECK (length(moderator) BETWEEN 3 AND 320),
  dismissed_at TEXT NOT NULL
);

-- The dismissal row owns the resolution. Checks run before insert and the
-- resolution runs after it, so an insert skipped by OR IGNORE never resolves a
-- report. A failed resolution aborts and rolls back the dismissal row.
CREATE TRIGGER report_dismissals_check
BEFORE INSERT ON report_dismissals
BEGIN
  SELECT RAISE(ABORT, 'dismissals: unknown report')
  WHERE NOT EXISTS (SELECT 1 FROM entry_reports WHERE id = NEW.report_id);
  SELECT RAISE(ABORT, 'dismissals: report already dismissed')
  WHERE EXISTS (SELECT 1 FROM report_dismissals WHERE report_id = NEW.report_id);
  SELECT RAISE(ABORT, 'dismissals: report is not open')
  WHERE EXISTS (SELECT 1 FROM entry_reports WHERE id = NEW.report_id AND resolved_at IS NOT NULL);
  SELECT RAISE(ABORT, 'dismissals: entry is not visible')
  WHERE NOT EXISTS (
    SELECT 1 FROM entry_reports r
    JOIN entries e ON e.id = r.entry_id
    WHERE r.id = NEW.report_id AND e.visible = 1
  );
END;

CREATE TRIGGER report_dismissals_apply
AFTER INSERT ON report_dismissals
BEGIN
  UPDATE entry_reports
  SET resolved_at = NEW.dismissed_at
  WHERE id = NEW.report_id;
END;

CREATE TRIGGER report_dismissals_no_update
BEFORE UPDATE ON report_dismissals
BEGIN
  SELECT RAISE(ABORT, 'dismissals: audit rows are append-only');
END;

CREATE TRIGGER report_dismissals_no_delete
BEFORE DELETE ON report_dismissals
BEGIN
  SELECT RAISE(ABORT, 'dismissals: audit rows are append-only');
END;
