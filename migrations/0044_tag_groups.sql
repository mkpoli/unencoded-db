-- A middle tier between a tag's type and the tag: each type holds ordered groups, and a tag sits in at
-- most one group of its own type or loose under the type.
CREATE TABLE tag_groups (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('general','region','language','form','domain','meta')),
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES people(id),
  created_at TEXT
);
CREATE UNIQUE INDEX tag_groups_by_label ON tag_groups(type, label);
CREATE INDEX tag_groups_by_type ON tag_groups(type, position, id);

ALTER TABLE tags ADD COLUMN group_id INTEGER REFERENCES tag_groups(id);
CREATE INDEX tags_by_group ON tags(group_id, position, name);

-- The change log covers groups too: `subject` says whether `name` is a tag's name or a group's id. The
-- kinds are checked by the code that writes them.
CREATE TABLE tag_changes_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL DEFAULT 'tag' CHECK (subject IN ('tag','group')),
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  before TEXT,
  after TEXT,
  actor TEXT,
  at TEXT
);
INSERT INTO tag_changes_next(id, subject, name, kind, before, after, actor, at)
SELECT id, 'tag', name, kind, before, after, actor, at FROM tag_changes;
-- Keep the sequence where it stood, so a change id is never handed out twice: a placeholder row at the
-- last id handed out moves the sequence there, and goes.
INSERT INTO tag_changes_next(id, subject, name, kind)
SELECT seq, 'tag', '', 'create' FROM sqlite_sequence
WHERE name = 'tag_changes' AND seq > COALESCE((SELECT MAX(id) FROM tag_changes), 0);
DELETE FROM tag_changes_next WHERE name = '' AND at IS NULL;
DROP TABLE tag_changes;
ALTER TABLE tag_changes_next RENAME TO tag_changes;
CREATE INDEX tag_changes_by_name ON tag_changes(subject, name, id);
CREATE INDEX tag_changes_by_actor ON tag_changes(actor, kind, at);
