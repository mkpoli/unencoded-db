CREATE TABLE atlas_identities (
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  person_id TEXT NOT NULL UNIQUE REFERENCES persons(id),
  PRIMARY KEY (issuer, subject)
);

CREATE TABLE person_merges (
  source_id TEXT PRIMARY KEY REFERENCES persons(id),
  target_id TEXT NOT NULL REFERENCES persons(id),
  CHECK (source_id <> target_id)
);

ALTER TABLE contributor_sessions ADD COLUMN parent_hash TEXT REFERENCES contributor_sessions(token_hash);
ALTER TABLE contributor_sessions ADD COLUMN family_hash TEXT;
CREATE INDEX contributor_sessions_parent ON contributor_sessions(parent_hash);
CREATE TABLE revoked_session_families (
  family_hash TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL
);

CREATE TABLE oidc_flows (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  person_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- A single insert runs the whole transition in SQLite's transaction. The flow
-- is deleted in the same statement, and every guard is evaluated under the write lock.
CREATE TABLE oidc_completions (
  state_hash TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  new_hash TEXT NOT NULL,
  now TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TRIGGER oidc_complete BEFORE INSERT ON oidc_completions BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM oidc_flows f WHERE f.state_hash = NEW.state_hash AND f.expires_at > NEW.now
    AND f.session_hash IS NOT NULL AND EXISTS (
      SELECT 1 FROM contributor_sessions s WHERE s.token_hash = f.session_hash
      AND s.person_id = f.person_id AND s.revoked_at IS NULL AND s.expires_at > NEW.now
      AND NOT EXISTS (SELECT 1 FROM revoked_session_families r WHERE r.family_hash = COALESCE(s.family_hash, s.token_hash))
    )
  ) THEN RAISE(ABORT, 'invalid flow or session') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM oidc_flows f JOIN person_merges m ON m.source_id = f.person_id
    WHERE f.state_hash = NEW.state_hash
  ) THEN RAISE(ABORT, 'person already merged') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM oidc_flows f JOIN atlas_identities i ON i.person_id = f.person_id
    WHERE f.state_hash = NEW.state_hash AND (i.issuer <> NEW.issuer OR i.subject <> NEW.subject)
  ) THEN RAISE(ABORT, 'account switching prohibited') END;

  INSERT INTO atlas_identities (issuer, subject, person_id)
    SELECT NEW.issuer, NEW.subject, (SELECT person_id FROM oidc_flows WHERE state_hash = NEW.state_hash)
    WHERE NOT EXISTS (SELECT 1 FROM atlas_identities WHERE issuer = NEW.issuer AND subject = NEW.subject);
  INSERT INTO person_merges (source_id, target_id)
    SELECT f.person_id, i.person_id FROM oidc_flows f JOIN atlas_identities i ON i.issuer = NEW.issuer AND i.subject = NEW.subject
    WHERE f.state_hash = NEW.state_hash AND f.person_id IS NOT NULL AND f.person_id <> i.person_id;
  UPDATE contributor_sessions SET revoked_at = NEW.now
    WHERE token_hash = (SELECT session_hash FROM oidc_flows WHERE state_hash = NEW.state_hash);
  INSERT INTO contributor_sessions (token_hash, person_id, created_at, expires_at, parent_hash, family_hash)
    SELECT NEW.new_hash, i.person_id, NEW.now, NEW.expires_at, f.session_hash,
      COALESCE((SELECT COALESCE(s.family_hash, s.token_hash) FROM contributor_sessions s WHERE s.token_hash = f.session_hash), NEW.new_hash)
    FROM oidc_flows f JOIN atlas_identities i ON i.issuer = NEW.issuer AND i.subject = NEW.subject
    WHERE f.state_hash = NEW.state_hash;
  DELETE FROM oidc_flows WHERE state_hash = NEW.state_hash;
END;

CREATE TRIGGER oidc_completion_cleanup AFTER INSERT ON oidc_completions BEGIN
  DELETE FROM oidc_completions WHERE state_hash = NEW.state_hash;
END;
