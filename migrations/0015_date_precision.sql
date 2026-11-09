-- Keep the date as printed and store its precision and normalized parts.
ALTER TABLE evidence ADD COLUMN date_year INTEGER;
ALTER TABLE evidence ADD COLUMN date_month INTEGER;
ALTER TABLE evidence ADD COLUMN date_day INTEGER;
ALTER TABLE evidence ADD COLUMN date_precision TEXT;

UPDATE evidence SET
  date_year = CAST(substr(year, 1, 4) AS INTEGER),
  date_month = CAST(substr(year, 6, 2) AS INTEGER),
  date_day = CAST(substr(year, 9, 2) AS INTEGER),
  date_precision = 'day'
WHERE year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';

UPDATE evidence SET
  date_year = CAST(substr(year, 1, 4) AS INTEGER),
  date_month = CAST(substr(year, 6, 2) AS INTEGER),
  date_precision = 'month'
WHERE year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]';

UPDATE evidence SET
  date_year = CAST(year AS INTEGER),
  date_precision = 'year'
WHERE year GLOB '[0-9][0-9][0-9][0-9]';

UPDATE evidence SET
  date_month = CAST(year AS INTEGER),
  date_precision = 'month-only'
WHERE year GLOB '[0-9]' OR year GLOB '[0-9][0-9]';

CREATE INDEX evidence_entry_date ON evidence(entry_id, date_year, date_month, date_day, id);
