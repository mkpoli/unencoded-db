-- The words a sighting quotes from a source it was found through. The quote belongs to this link, so the
-- same post quoted for another character keeps one row of `sources`.
ALTER TABLE sighting_vias ADD COLUMN quote TEXT;
