-- What a source appeared in: the journal of an article, the site of a page, the group of a chat message.
-- A message is cited by its author, its date and its container, so the group is named once and each
-- message keeps its own author and date.
ALTER TABLE sources ADD COLUMN container TEXT;
-- The container folded for lookup, as publishers are. Only sources of visible records are suggested.
ALTER TABLE sources ADD COLUMN container_lookup TEXT;
CREATE INDEX sources_by_container ON sources(container_lookup, id) WHERE container_lookup IS NOT NULL AND records > 0;
