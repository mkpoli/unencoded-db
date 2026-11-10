-- The profile the issuer returns with the verified account. Both are optional:
-- a provider without a profile scope leaves them null.
ALTER TABLE atlas_identities ADD COLUMN name TEXT;
ALTER TABLE atlas_identities ADD COLUMN picture TEXT;
