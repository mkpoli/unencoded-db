-- How close a sighting stands to the original: 'primary' for the work itself or a direct reproduction of it,
-- 'secondary_cited' and 'secondary_uncited' for a compilation that names its own source or names none, 'memory'
-- for a form given from memory. Null when nobody has said.
ALTER TABLE sightings ADD COLUMN closeness TEXT CHECK (closeness IN ('primary', 'secondary_cited', 'secondary_uncited', 'memory'));
