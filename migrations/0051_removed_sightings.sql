-- Who took a sighting off its record. A removed sighting is hidden like one a moderator hides, and stays
-- with its pictures and history; anyone who can edit may put it back. A moderator's hide names no one here.
ALTER TABLE sightings ADD COLUMN removed_by TEXT REFERENCES people(id);

-- The history and a person's page go on showing the changes of a removed sighting, so they count.
DROP TRIGGER uncount_sighting;
DROP TRIGGER recount_sighting;
DROP VIEW visible_revisions;
CREATE VIEW visible_revisions AS
SELECT r.id, r.entry_id, COALESCE(p.merged_into, p.id) AS account
FROM revisions r CROSS JOIN entries e ON e.id = r.entry_id CROSS JOIN people p ON p.id = r.actor
  LEFT JOIN sightings s ON s.id = r.sighting_id AND s.entry_id = r.entry_id
WHERE e.hidden_at IS NULL AND e.merged_into IS NULL AND (r.sighting_id IS NULL OR (s.id IS NOT NULL AND (s.hidden_at IS NULL OR s.removed_by IS NOT NULL)));
CREATE TRIGGER uncount_sighting BEFORE UPDATE OF hidden_at, removed_by, entry_id ON sightings
WHEN (OLD.hidden_at IS NULL OR OLD.removed_by IS NOT NULL) <> (NEW.hidden_at IS NULL OR NEW.removed_by IS NOT NULL) OR OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes - v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id IN (OLD.entry_id, NEW.entry_id) GROUP BY account) v WHERE v.account = people.id;
END;
CREATE TRIGGER recount_sighting AFTER UPDATE OF hidden_at, removed_by, entry_id ON sightings
WHEN (OLD.hidden_at IS NULL OR OLD.removed_by IS NOT NULL) <> (NEW.hidden_at IS NULL OR NEW.removed_by IS NOT NULL) OR OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes + v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id IN (OLD.entry_id, NEW.entry_id) GROUP BY account) v WHERE v.account = people.id;
END;

-- A removal, or its undo, is told like an edit of that evidence: to the record's recorder and the evidence's.
DROP TRIGGER notify_revision;
CREATE TRIGGER notify_revision AFTER INSERT ON revisions
WHEN (NEW.kind IN ('edit','revert','sighting','sighting_edit','merge','unmerge') OR (NEW.kind IN ('hide','unhide') AND json_extract(NEW.snapshot, '$.removed')))
  AND NOT (NEW.kind = 'merge' AND json_extract(NEW.snapshot, '$.into') IS NOT NULL)
BEGIN
  INSERT INTO notifications(person, revision_id, at)
  SELECT DISTINCT COALESCE(p.merged_into, p.id), NEW.id, NEW.at FROM people p
  WHERE p.id IN (
    SELECT created_by FROM entries WHERE id = NEW.entry_id
    UNION SELECT created_by FROM entries WHERE NEW.kind = 'merge' AND id = json_extract(NEW.snapshot, '$.from')
    UNION SELECT created_by FROM sightings WHERE entry_id = NEW.entry_id AND hidden_at IS NULL AND NEW.kind NOT IN ('sighting_edit','hide','unhide')
    UNION SELECT created_by FROM sightings WHERE id = NEW.sighting_id AND entry_id = NEW.entry_id AND (hidden_at IS NULL OR removed_by IS NOT NULL) AND NEW.kind IN ('sighting_edit','hide','unhide'))
  AND COALESCE(p.merged_into, p.id) <> (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.actor);
END;
