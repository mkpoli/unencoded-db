-- Separates the model name from the agent (harness/client) name so both can be displayed and
-- queried independently while keeping index seeks covering.
ALTER TABLE people ADD COLUMN agent_model TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS people_agents_by_commander;
CREATE INDEX people_agents_by_commander ON people(merged_into, name, agent_model) WHERE merged_into IS NOT NULL AND agent = 1;
