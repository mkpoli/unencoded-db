-- A record that no status rule matches holds no status, where it held `unchecked`, and is listed under no
-- status filter.

-- The column's CHECK names the statuses, so the column is made again. Nothing indexes it.
ALTER TABLE entries ADD COLUMN status_next TEXT CHECK (status_next IS NULL OR status_next IN ('encoded','unifiable','homograph','variant'));
UPDATE entries SET status_next = NULLIF(status, 'unchecked');
ALTER TABLE entries DROP COLUMN status;
ALTER TABLE entries RENAME COLUMN status_next TO status;

DELETE FROM entry_tags WHERE tag = 'f:unchecked' OR (tag LIKE 's:%|f:unchecked');
DELETE FROM tag_counts WHERE tag = 'f:unchecked' OR (tag LIKE 's:%|f:unchecked');
