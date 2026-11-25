-- A citation names the kind of publication it comes from, and a periodical's volume and number. They are
-- part of the source's identity: one article in two volumes is two sources.
ALTER TABLE sources ADD COLUMN publication_kind TEXT CHECK (publication_kind IS NULL OR publication_kind IN ('book','journal','newspaper','website','other'));
ALTER TABLE sources ADD COLUMN volume TEXT;
ALTER TABLE sources ADD COLUMN number TEXT;
