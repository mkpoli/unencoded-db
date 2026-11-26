-- The form each description of a visible record names: the description with radical code points as their
-- ideographs and each part as its IWDS group (src/lib/forms.ts). Two records under one form may be one record.
CREATE TABLE forms (
  form TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  PRIMARY KEY (form, entry_id)
) WITHOUT ROWID;
CREATE INDEX forms_by_entry ON forms(entry_id);

-- How many records each form has and the latest of them, so the forms of several records are one range.
CREATE TABLE form_counts (
  id INTEGER PRIMARY KEY,
  form TEXT NOT NULL UNIQUE,
  n INTEGER NOT NULL,
  latest INTEGER NOT NULL
);
CREATE INDEX form_counts_alike ON form_counts(latest, id) WHERE n > 1;

CREATE TRIGGER count_form AFTER INSERT ON forms
BEGIN
  INSERT INTO form_counts(form, n, latest) VALUES (NEW.form, 1, NEW.entry_id)
  ON CONFLICT(form) DO UPDATE SET n = n + 1, latest = MAX(latest, excluded.latest);
END;
CREATE TRIGGER uncount_form AFTER DELETE ON forms
BEGIN
  DELETE FROM form_counts WHERE form = OLD.form AND n <= 1;
  UPDATE form_counts SET n = n - 1, latest = (SELECT MAX(entry_id) FROM forms WHERE form = OLD.form) WHERE form = OLD.form;
END;
