-- Who took a sighting off its record. A removed sighting is hidden like one a moderator hides, and stays
-- with its pictures and history; anyone who can edit may put it back. A moderator's hide names no one here.
ALTER TABLE sightings ADD COLUMN removed_by TEXT REFERENCES people(id);
