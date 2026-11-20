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
-- One notice of one thing for each person, also after an anonymous person's notices join an account's.
CREATE UNIQUE INDEX notifications_once_comment ON notifications(person, comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX notifications_once_revision ON notifications(person, revision_id) WHERE revision_id IS NOT NULL;

-- The changes made before notices existed are queued as unread, by the rule of `notify_revision` below.
-- Evidence added later than a change is not told of it, and the catalogue's own maintenance tells nobody.
INSERT INTO notifications(person, revision_id, at)
SELECT DISTINCT COALESCE(p.merged_into, p.id), r.id, r.at
FROM revisions r
JOIN (
  SELECT id AS entry_id, NULL AS sighting_id, created_by, created_at FROM entries
  UNION ALL SELECT entry_id, id, created_by, created_at FROM sightings WHERE hidden_at IS NULL
) o ON o.entry_id = r.entry_id AND o.created_at <= r.at AND (r.kind <> 'sighting_edit' OR o.sighting_id IS NULL OR o.sighting_id = r.sighting_id)
JOIN people p ON p.id = o.created_by
JOIN people a ON a.id = r.actor
WHERE r.kind IN ('edit','revert','sighting','sighting_edit','merge','unmerge')
  AND a.name <> 'Catalogue maintenance'
  AND NOT (r.kind = 'merge' AND json_extract(r.snapshot, '$.into') IS NOT NULL)
  AND COALESCE(p.merged_into, p.id) <> COALESCE(a.merged_into, a.id)
ORDER BY r.id;

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
