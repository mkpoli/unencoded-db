-- How many changes a person has made that anyone may read, kept as they are made, hidden, merged and
-- brought back, so that listing people never counts the journal. A change counts for the account its
-- writer joined, and joining an account brings the count.
ALTER TABLE people ADD COLUMN changes INTEGER NOT NULL DEFAULT 0;

-- What the history and a person's page show.
CREATE VIEW visible_revisions AS
SELECT r.id, r.entry_id, COALESCE(p.merged_into, p.id) AS account
FROM revisions r CROSS JOIN entries e ON e.id = r.entry_id CROSS JOIN people p ON p.id = r.actor
  LEFT JOIN sightings s ON s.id = r.sighting_id AND s.entry_id = r.entry_id
WHERE e.hidden_at IS NULL AND e.merged_into IS NULL AND (r.sighting_id IS NULL OR (s.id IS NOT NULL AND s.hidden_at IS NULL));

WITH counted AS (SELECT account, COUNT(*) AS n FROM visible_revisions GROUP BY account)
UPDATE people SET changes = counted.n FROM counted WHERE counted.account = people.id;

CREATE INDEX people_by_changes ON people(changes DESC, id) WHERE merged_into IS NULL AND changes > 0;

CREATE TRIGGER count_change AFTER INSERT ON revisions
BEGIN
  UPDATE people SET changes = changes + 1 WHERE id = (SELECT account FROM visible_revisions WHERE id = NEW.id);
END;

CREATE TRIGGER join_changes AFTER UPDATE OF merged_into ON people
WHEN OLD.merged_into IS NULL AND NEW.merged_into IS NOT NULL
BEGIN
  UPDATE people SET changes = changes + OLD.changes WHERE id = NEW.merged_into;
  UPDATE people SET changes = 0 WHERE id = NEW.id;
END;

-- A record or a piece of evidence that is hidden, merged or brought back changes what its own records
-- show: their changes are taken off as they stood before and put back as they stand after.
CREATE TRIGGER uncount_entry BEFORE UPDATE OF hidden_at, merged_into ON entries
WHEN (OLD.hidden_at IS NULL AND OLD.merged_into IS NULL) <> (NEW.hidden_at IS NULL AND NEW.merged_into IS NULL)
BEGIN
  UPDATE people SET changes = changes - v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id = OLD.id GROUP BY account) v WHERE v.account = people.id;
END;
CREATE TRIGGER recount_entry AFTER UPDATE OF hidden_at, merged_into ON entries
WHEN (OLD.hidden_at IS NULL AND OLD.merged_into IS NULL) <> (NEW.hidden_at IS NULL AND NEW.merged_into IS NULL)
BEGIN
  UPDATE people SET changes = changes + v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id = NEW.id GROUP BY account) v WHERE v.account = people.id;
END;
CREATE TRIGGER uncount_sighting BEFORE UPDATE OF hidden_at, entry_id ON sightings
WHEN (OLD.hidden_at IS NULL) <> (NEW.hidden_at IS NULL) OR OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes - v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id IN (OLD.entry_id, NEW.entry_id) GROUP BY account) v WHERE v.account = people.id;
END;
CREATE TRIGGER recount_sighting AFTER UPDATE OF hidden_at, entry_id ON sightings
WHEN (OLD.hidden_at IS NULL) <> (NEW.hidden_at IS NULL) OR OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE people SET changes = changes + v.n
  FROM (SELECT account, COUNT(*) AS n FROM visible_revisions WHERE entry_id IN (OLD.entry_id, NEW.entry_id) GROUP BY account) v WHERE v.account = people.id;
END;
