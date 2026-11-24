-- How a source reached the contributor when it was never published: 'personal' for a letter, a private message
-- or a conversation. Null for every other source, so a source that merely names no container is told apart.
ALTER TABLE sources ADD COLUMN source_kind TEXT;
