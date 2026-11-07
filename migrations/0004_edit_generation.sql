ALTER TABLE entries ADD COLUMN edit_generation INTEGER NOT NULL DEFAULT 1 CHECK (typeof(edit_generation) = 'integer' AND edit_generation BETWEEN 1 AND 9007199254740991);

CREATE TRIGGER entries_generation_step BEFORE UPDATE OF edit_generation ON entries
WHEN typeof(NEW.edit_generation) != 'integer' OR NEW.edit_generation != OLD.edit_generation + 1 BEGIN
  SELECT RAISE(ABORT, 'Edit generation must advance by one');
END;

-- Visibility transitions invalidate forms without creating content revisions.
CREATE TRIGGER entries_visibility_generation AFTER UPDATE OF visible ON entries
WHEN NEW.visible != OLD.visible BEGIN
  UPDATE entries SET edit_generation = edit_generation + 1 WHERE id = NEW.id;
END;
