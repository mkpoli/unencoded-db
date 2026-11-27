-- Marks each revision an agent made, so the history can list agents' changes, or people's, by walking one
-- index in order. Triggers keep the mark with the actor: when a revision is written, when it changes hands,
-- and when its actor becomes an agent or stops being one.
ALTER TABLE revisions ADD COLUMN agent INTEGER NOT NULL DEFAULT 0 CHECK (agent IN (0, 1));
UPDATE revisions SET agent = 1 WHERE actor IN (SELECT id FROM people WHERE agent = 1);
CREATE INDEX revisions_by_agents ON revisions(id) WHERE agent = 1;
CREATE INDEX revisions_by_people ON revisions(id) WHERE agent = 0;
CREATE TRIGGER revision_agent_insert AFTER INSERT ON revisions WHEN (SELECT agent FROM people WHERE id = NEW.actor) = 1
BEGIN
  UPDATE revisions SET agent = 1 WHERE id = NEW.id;
END;
CREATE TRIGGER revision_agent_actor AFTER UPDATE OF actor ON revisions
BEGIN
  UPDATE revisions SET agent = COALESCE((SELECT agent FROM people WHERE id = NEW.actor), 0) WHERE id = NEW.id;
END;
CREATE TRIGGER revision_agent_person AFTER UPDATE OF agent ON people WHEN NEW.agent <> OLD.agent
BEGIN
  UPDATE revisions SET agent = NEW.agent WHERE actor = NEW.id;
END;
