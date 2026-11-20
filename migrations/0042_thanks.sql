-- A thank is one person's thanks for one change, said once. Its notice goes to whoever made the change,
-- as the account they joined, so a notice is now of a comment, a revision or a thank.
CREATE TABLE thanks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL REFERENCES revisions(id),
  person TEXT NOT NULL REFERENCES people(id),
  at TEXT NOT NULL,
  ip_hash TEXT,
  UNIQUE (revision_id, person)
);
CREATE INDEX thanks_by_person ON thanks(person, revision_id);

-- SQLite cannot change a CHECK in place, so the table is rebuilt and the triggers that write to it remade.
DROP TRIGGER notify_comment;
DROP TRIGGER notify_revision;
DROP TRIGGER read_hidden_comment;
CREATE TABLE notifications_rebuilt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person TEXT NOT NULL REFERENCES people(id),
  comment_id INTEGER REFERENCES comments(id),
  revision_id INTEGER REFERENCES revisions(id),
  thank_id INTEGER REFERENCES thanks(id),
  at TEXT NOT NULL,
  read_at TEXT,
  CHECK ((comment_id IS NOT NULL) + (revision_id IS NOT NULL) + (thank_id IS NOT NULL) = 1)
);
INSERT INTO notifications_rebuilt(id, person, comment_id, revision_id, at, read_at)
SELECT id, person, comment_id, revision_id, at, read_at FROM notifications ORDER BY id;
DROP TABLE notifications;
ALTER TABLE notifications_rebuilt RENAME TO notifications;
CREATE INDEX notifications_by_person ON notifications(person, id);
CREATE INDEX notifications_unread ON notifications(person, id) WHERE read_at IS NULL;
CREATE INDEX notifications_by_comment ON notifications(comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_once_comment ON notifications(person, comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_once_revision ON notifications(person, revision_id) WHERE revision_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_once_thank ON notifications(person, thank_id) WHERE thank_id IS NOT NULL;

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
-- the record's recorder and that evidence's. A merge writes a revision on each record, and the one on the
-- record that remains tells both records' people, so the one on the record merged away tells nobody.
CREATE TRIGGER notify_revision AFTER INSERT ON revisions
WHEN NEW.kind IN ('edit','revert','sighting','sighting_edit','merge','unmerge')
  AND NOT (NEW.kind = 'merge' AND json_extract(NEW.snapshot, '$.into') IS NOT NULL)
BEGIN
  INSERT INTO notifications(person, revision_id, at)
  SELECT DISTINCT COALESCE(p.merged_into, p.id), NEW.id, NEW.at FROM people p
  WHERE p.id IN (
    SELECT created_by FROM entries WHERE id = NEW.entry_id
    UNION SELECT created_by FROM entries WHERE NEW.kind = 'merge' AND id = json_extract(NEW.snapshot, '$.from')
    UNION SELECT created_by FROM sightings WHERE entry_id = NEW.entry_id AND hidden_at IS NULL AND (NEW.kind <> 'sighting_edit' OR id = NEW.sighting_id))
  AND COALESCE(p.merged_into, p.id) <> (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.actor);
END;

-- A hidden comment is nothing left to read, so its notices stop counting.
CREATE TRIGGER read_hidden_comment AFTER UPDATE OF hidden_at ON comments
WHEN NEW.hidden_at IS NOT NULL
BEGIN
  UPDATE notifications SET read_at = NEW.hidden_at WHERE comment_id = NEW.id AND read_at IS NULL;
END;

-- A thank: whoever made the change, unless they thank themselves.
CREATE TRIGGER notify_thank AFTER INSERT ON thanks
BEGIN
  INSERT INTO notifications(person, thank_id, at)
  SELECT COALESCE(p.merged_into, p.id), NEW.id, NEW.at FROM revisions r JOIN people p ON p.id = r.actor
  WHERE r.id = NEW.revision_id AND COALESCE(p.merged_into, p.id) <> (SELECT COALESCE(merged_into, id) FROM people WHERE id = NEW.person);
END;
