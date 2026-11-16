-- An agent signs in through OAuth 2.1 with this site as the authorization server. A client registers
-- itself, a person allows it in their browser, and the client trades the code it is handed for a token
-- that names that person on /mcp. Codes and tokens are kept as hashes.
CREATE TABLE agent_clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX agent_clients_created_at ON agent_clients(created_at);

CREATE TABLE agent_codes (
  code_hash TEXT PRIMARY KEY,
  client TEXT NOT NULL REFERENCES agent_clients(id),
  person TEXT NOT NULL REFERENCES people(id),
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX agent_codes_created_at ON agent_codes(created_at);

CREATE TABLE agent_tokens (
  token_hash TEXT PRIMARY KEY,
  client TEXT NOT NULL REFERENCES agent_clients(id),
  person TEXT NOT NULL REFERENCES people(id),
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX agent_tokens_client ON agent_tokens(client);
CREATE INDEX agent_tokens_created_at ON agent_tokens(created_at);
