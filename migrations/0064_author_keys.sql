-- Whether the author field offers a key of a source: 0 when the author gives no part of it, 1 when the author
-- gives it and a visible record cites the source, 2 when the author gives it and none does. The release sweep
-- marks the keys stored before this.
ALTER TABLE source_keys ADD COLUMN author INTEGER NOT NULL DEFAULT 0;
CREATE INDEX source_keys_by_author ON source_keys(lookup, source_id) WHERE author = 1;
CREATE TRIGGER source_keys_author_visibility AFTER UPDATE OF records ON sources WHEN (NEW.records > 0) <> (OLD.records > 0)
BEGIN
  UPDATE source_keys SET author = CASE WHEN NEW.records > 0 THEN 1 ELSE 2 END WHERE source_id = NEW.id AND author <> 0;
END;
