-- Marks person rows that represent an AI agent acting for the contributor they are merged into,
-- preserving the agent and model name on edits while counting them toward the commander.
ALTER TABLE people ADD COLUMN agent INTEGER NOT NULL DEFAULT 0 CHECK (agent IN (0, 1));
CREATE INDEX people_agents_by_commander ON people(merged_into, name) WHERE merged_into IS NOT NULL AND agent = 1;
