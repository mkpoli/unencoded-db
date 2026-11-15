-- A list can be read by when its records were first seen, so every listed row holds its record's
-- earliest year, the one a tile shows. Word rows are only looked up by key and hold none. A record
-- with no year is left out of the index, and so out of a list read by year.
ALTER TABLE entry_tags ADD COLUMN year INTEGER;
UPDATE entry_tags SET year = (SELECT CAST(e.first_year AS INTEGER) FROM entries e WHERE e.id = entry_tags.entry_id) WHERE tag NOT GLOB 'w:*';
CREATE INDEX entry_tags_by_year ON entry_tags(tag, year, entry_id) WHERE year IS NOT NULL AND tag NOT GLOB 'w:*';
