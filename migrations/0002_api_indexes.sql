CREATE INDEX entries_live_export ON entries(id) WHERE merged_into IS NULL AND hidden_at IS NULL;
CREATE INDEX entries_live_ids ON entries(ids, id) WHERE merged_into IS NULL AND hidden_at IS NULL;
CREATE INDEX sightings_visible_export ON sightings(entry_id, id) WHERE hidden_at IS NULL;
