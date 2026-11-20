-- What a person is told about: a comment on a record they recorded, added evidence to or discussed, and a
-- change to a record or to evidence they recorded. A row is one person's notice of one comment or one
-- revision, unread until `read_at`. The triggers write the notices with the comment or revision itself,
-- so every way of writing one tells the same people: each as the account they joined, never the writer.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person TEXT NOT NULL REFERENCES people(id),
  comment_id INTEGER REFERENCES comments(id),
  revision_id INTEGER REFERENCES revisions(id),
  at TEXT NOT NULL,
  read_at TEXT,
  CHECK ((comment_id IS NULL) <> (revision_id IS NULL))
);
CREATE INDEX notifications_by_person ON notifications(person, id);
CREATE INDEX notifications_unread ON notifications(person, id) WHERE read_at IS NULL;
CREATE INDEX notifications_by_comment ON notifications(comment_id) WHERE comment_id IS NOT NULL;

-- A comment: the record's recorder, the recorder of the evidence it is about (of all the evidence, for a
-- comment on the whole record) and everyone already in the discussion.
CREATE TRIGGER notify_comment AFTER INSERT ON comments
BEGIN
  INSERT INTO notifications(person, comment_id, at)
  SELECT DISTINCT COALESCE(p.merged_into, p.id), NEW.id, NEW.at FROM people p
  WHERE p.id IN (
    SELECT created_by FROM entries WHERE id = NEW.entry_id
    UNION SELECT created_by FROM sightings WHERE entry_id = NEW.entry_id AND hidden_at IS NULL AND (NEW.sighting_id IS NULL OR id = NEW.sighting_id)
    UNION SELECT author FROM comments WHERE entry_id = NEW.entry_id AND hidden_at IS NULL)
  AND COALESCE(p.merged_into, p.id) <> (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.author);
END;

-- A change: the record's recorder and the recorders of its evidence; for an edit of one piece of evidence,
-- the record's recorder and that evidence's.
CREATE TRIGGER notify_revision AFTER INSERT ON revisions
WHEN NEW.kind IN ('edit','revert','sighting','sighting_edit','merge','unmerge')
BEGIN
  INSERT INTO notifications(person, revision_id, at)
  SELECT DISTINCT COALESCE(p.merged_into, p.id), NEW.id, NEW.at FROM people p
  WHERE p.id IN (
    SELECT created_by FROM entries WHERE id = NEW.entry_id
    UNION SELECT created_by FROM sightings WHERE entry_id = NEW.entry_id AND hidden_at IS NULL AND (NEW.kind <> 'sighting_edit' OR id = NEW.sighting_id))
  AND COALESCE(p.merged_into, p.id) <> (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.actor);
END;

-- A hidden comment is nothing left to read, so its notices stop counting.
CREATE TRIGGER read_hidden_comment AFTER UPDATE OF hidden_at ON comments
WHEN NEW.hidden_at IS NOT NULL
BEGIN
  UPDATE notifications SET read_at = NEW.hidden_at WHERE comment_id = NEW.id AND read_at IS NULL;
END;
