-- How many changes a person has made, kept with each revision so that listing people never counts the
-- journal. A revision counts for the account its writer joined, and joining an account brings the count.
ALTER TABLE people ADD COLUMN changes INTEGER NOT NULL DEFAULT 0;

UPDATE people SET changes = (SELECT COUNT(*) FROM revisions WHERE actor IN (SELECT a.id FROM people a WHERE a.id = people.id OR a.merged_into = people.id))
WHERE merged_into IS NULL;

CREATE INDEX people_by_changes ON people(changes DESC, id) WHERE merged_into IS NULL AND changes > 0;

CREATE TRIGGER count_change AFTER INSERT ON revisions
BEGIN
  UPDATE people SET changes = changes + 1 WHERE id = (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.actor);
END;

CREATE TRIGGER join_changes AFTER UPDATE OF merged_into ON people
WHEN OLD.merged_into IS NULL AND NEW.merged_into IS NOT NULL
BEGIN
  UPDATE people SET changes = changes + OLD.changes WHERE id = NEW.merged_into;
  UPDATE people SET changes = 0 WHERE id = NEW.id;
END;
