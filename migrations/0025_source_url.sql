-- A source may be a web page rather than an image. Evidence and its shared
-- source keep the URL; evidence reuses a source when the URL matches.
ALTER TABLE evidence ADD COLUMN url TEXT;
ALTER TABLE sources ADD COLUMN url TEXT;
