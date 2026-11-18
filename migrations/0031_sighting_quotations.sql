-- Excerpts from the work, including distinct passages or objects reproduced in one source.
ALTER TABLE sightings ADD COLUMN quotes TEXT CHECK (quotes IS NULL OR json_valid(quotes));
