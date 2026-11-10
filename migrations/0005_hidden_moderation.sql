CREATE INDEX entries_hidden_moderation ON entries(id) WHERE hidden_at IS NOT NULL;
CREATE INDEX sightings_hidden_moderation ON sightings(id) WHERE hidden_at IS NOT NULL;
