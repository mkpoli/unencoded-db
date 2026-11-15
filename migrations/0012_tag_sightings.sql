-- Each listed row carries its record's count of sources, so a list can be read by that count from an
-- index in either direction. Word rows are only looked up by key and keep none.
ALTER TABLE entry_tags ADD COLUMN sightings INTEGER NOT NULL DEFAULT 0;
UPDATE entry_tags SET sightings = (SELECT e.sightings FROM entries e WHERE e.id = entry_tags.entry_id) WHERE tag NOT GLOB 'w:*';
CREATE INDEX entry_tags_by_sightings ON entry_tags(tag, sightings, entry_id);
