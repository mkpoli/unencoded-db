-- Keep the date as printed and store its precision and normalized parts.
ALTER TABLE evidence ADD COLUMN date_year INTEGER;
ALTER TABLE evidence ADD COLUMN date_month INTEGER;
ALTER TABLE evidence ADD COLUMN date_day INTEGER;
ALTER TABLE evidence ADD COLUMN date_precision TEXT;

-- Backfill with the same formats, ranges and calendar rules as parseDate.
-- Normalize the accepted / and . separators first so one shape check covers
-- every combination of one- and two-digit months and days.
UPDATE evidence
SET date_year = parts.y, date_month = parts.m, date_day = parts.d, date_precision = 'day'
FROM (
  SELECT id,
    CAST(substr(text, 1, 4) AS INTEGER) AS y,
    CASE WHEN substr(text, 7, 1) = '-' THEN CAST(substr(text, 6, 1) AS INTEGER) ELSE CAST(substr(text, 6, 2) AS INTEGER) END AS m,
    CASE WHEN substr(text, 7, 1) = '-' THEN CAST(substr(text, 8) AS INTEGER) ELSE CAST(substr(text, 9) AS INTEGER) END AS d
  FROM (SELECT id, replace(replace(trim(year), '/', '-'), '.', '-') AS text FROM evidence)
  WHERE text GLOB '[0-9][0-9][0-9][0-9]-[0-9]-[0-9]'
     OR text GLOB '[0-9][0-9][0-9][0-9]-[0-9]-[0-9][0-9]'
     OR text GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9]'
     OR text GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
) AS parts
WHERE evidence.id = parts.id
  AND parts.m BETWEEN 1 AND 12
  AND parts.d BETWEEN 1 AND CASE
    WHEN parts.m = 2 THEN CASE WHEN parts.y % 4 = 0 AND (parts.y % 100 <> 0 OR parts.y % 400 = 0) THEN 29 ELSE 28 END
    WHEN parts.m IN (4, 6, 9, 11) THEN 30
    ELSE 31
  END;

UPDATE evidence
SET date_year = parts.y, date_month = parts.m, date_day = NULL, date_precision = 'month'
FROM (
  SELECT id, CAST(substr(text, 1, 4) AS INTEGER) AS y, CAST(substr(text, 6) AS INTEGER) AS m
  FROM (SELECT id, replace(replace(trim(year), '/', '-'), '.', '-') AS text FROM evidence)
  WHERE text GLOB '[0-9][0-9][0-9][0-9]-[0-9]'
     OR text GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
) AS parts
WHERE evidence.id = parts.id AND parts.m BETWEEN 1 AND 12;

UPDATE evidence
SET date_year = CAST(trim(year) AS INTEGER), date_month = NULL, date_day = NULL, date_precision = 'year'
WHERE trim(year) GLOB '[0-9][0-9][0-9][0-9]';

UPDATE evidence
SET date_year = NULL, date_month = CAST(trim(year) AS INTEGER), date_day = NULL, date_precision = 'month-only'
WHERE (trim(year) GLOB '[0-9]' OR trim(year) GLOB '[0-9][0-9]')
  AND CAST(trim(year) AS INTEGER) BETWEEN 1 AND 12;

UPDATE evidence
SET date_year = NULL, date_month = NULL, date_day = NULL, date_precision = 'text'
WHERE date_precision IS NULL;

CREATE INDEX evidence_entry_date ON evidence(entry_id, date_year, date_month, date_day, id);
