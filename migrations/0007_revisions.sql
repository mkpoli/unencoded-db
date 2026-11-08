-- Each record keeps its evidence text as an append-only revision history. The
-- image and related comparisons are not versioned: editing changes text fields
-- only, so the current image and comparisons belong to every revision.
ALTER TABLE entries ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

CREATE TABLE entry_revisions (
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  revision INTEGER NOT NULL,
  script TEXT NOT NULL, ids TEXT, description TEXT, place TEXT NOT NULL,
  title TEXT, author TEXT, publisher TEXT, year TEXT, page TEXT, note TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, revision)
) WITHOUT ROWID;

INSERT INTO entry_revisions SELECT id, revision, script, ids, description, place, title, author, publisher, year, page, note, created_at FROM entries;

CREATE TRIGGER entries_no_replace BEFORE INSERT ON entries WHEN EXISTS (SELECT 1 FROM entries WHERE id = NEW.id) BEGIN
  SELECT RAISE(ABORT, 'Entries cannot be replaced');
END;
CREATE TRIGGER entries_revision_insert AFTER INSERT ON entries BEGIN
  INSERT INTO entry_revisions VALUES (NEW.id, NEW.revision, NEW.script, NEW.ids, NEW.description, NEW.place, NEW.title, NEW.author, NEW.publisher, NEW.year, NEW.page, NEW.note, NEW.created_at);
END;
CREATE TRIGGER entries_revision_guard BEFORE UPDATE OF script, ids, description, place, title, author, publisher, year, page, note ON entries
WHEN NEW.revision != OLD.revision + 1 BEGIN
  SELECT RAISE(ABORT, 'Evidence updates require the next revision');
END;
CREATE TRIGGER entries_revision_step BEFORE UPDATE OF revision ON entries WHEN NEW.revision != OLD.revision + 1 BEGIN
  SELECT RAISE(ABORT, 'Revision must advance by one');
END;
CREATE TRIGGER entries_revision_update AFTER UPDATE OF revision ON entries WHEN NEW.revision != OLD.revision BEGIN
  INSERT INTO entry_revisions VALUES (NEW.id, NEW.revision, NEW.script, NEW.ids, NEW.description, NEW.place, NEW.title, NEW.author, NEW.publisher, NEW.year, NEW.page, NEW.note, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
CREATE TRIGGER entry_revisions_no_replace BEFORE INSERT ON entry_revisions WHEN EXISTS (SELECT 1 FROM entry_revisions WHERE entry_id = NEW.entry_id AND revision = NEW.revision) BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
CREATE TRIGGER entry_revisions_no_update BEFORE UPDATE ON entry_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
CREATE TRIGGER entry_revisions_no_delete BEFORE DELETE ON entry_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
