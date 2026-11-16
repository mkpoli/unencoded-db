-- When a person last allowed a client, and null for one nobody has allowed. It decides how long a client
-- is kept: one nobody allowed goes after three months, one that was allowed once its tokens have run out.
ALTER TABLE agent_clients ADD COLUMN used_at TEXT;
-- A client that holds a token or a code was allowed when the latest of them was made.
UPDATE agent_clients SET used_at = (SELECT max(created_at) FROM (SELECT created_at FROM agent_tokens WHERE client = agent_clients.id UNION ALL SELECT created_at FROM agent_codes WHERE client = agent_clients.id));
DROP INDEX agent_clients_created_at;
CREATE INDEX agent_clients_unused ON agent_clients(created_at) WHERE used_at IS NULL;
CREATE INDEX agent_clients_used_at ON agent_clients(used_at) WHERE used_at IS NOT NULL;
CREATE INDEX agent_codes_client ON agent_codes(client);
