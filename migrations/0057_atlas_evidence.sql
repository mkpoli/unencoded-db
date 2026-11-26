-- Sightings automatically added from Glyph Atlas: one row per (entry, crop id) and at most one per
-- (entry, book_key). Rows with a committed `sighting_id` are kept even if a contributor removes or
-- hides the sighting, so a later sync never puts back removed evidence. Pending reservations
-- (`sighting_id IS NULL`) expire automatically after a short lease if a run is interrupted.
CREATE TABLE atlas_sightings (
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  crop_id TEXT NOT NULL,
  book_key TEXT NOT NULL,
  sighting_id INTEGER REFERENCES sightings(id),
  synced_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, crop_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX atlas_sightings_by_book ON atlas_sightings(entry_id, book_key);
CREATE INDEX atlas_sightings_by_sighting ON atlas_sightings(sighting_id) WHERE sighting_id IS NOT NULL;

-- Carry Glyph Atlas deduplication rows when a sighting moves to another record (move or merge).
CREATE TRIGGER move_atlas_sighting AFTER UPDATE OF entry_id ON sightings
WHEN OLD.entry_id <> NEW.entry_id
BEGIN
  UPDATE OR IGNORE atlas_sightings SET entry_id = NEW.entry_id WHERE sighting_id = NEW.id;
END;

-- Schedule queue for visible, unmerged records: `next_sync_at = ''` sorts ahead of all timestamps so
-- never-synced records are visited first, and failed attempts back off without starving other records.
-- Every scheduled batch reads a bounded range of `atlas_sync_state_by_due` with no full-table scan.
CREATE TABLE atlas_sync_state (
  entry_id INTEGER PRIMARY KEY REFERENCES entries(id),
  next_sync_at TEXT NOT NULL DEFAULT '',
  synced_at TEXT,
  query_key TEXT NOT NULL DEFAULT '',
  failures INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX atlas_sync_state_by_due ON atlas_sync_state(next_sync_at, entry_id);

INSERT OR IGNORE INTO atlas_sync_state(entry_id, next_sync_at, synced_at, query_key, failures)
SELECT id, '', NULL, '', 0 FROM entries WHERE merged_into IS NULL AND hidden_at IS NULL;

CREATE TRIGGER enqueue_atlas_entry AFTER INSERT ON entries
WHEN NEW.merged_into IS NULL AND NEW.hidden_at IS NULL
BEGIN
  INSERT OR IGNORE INTO atlas_sync_state(entry_id, next_sync_at, synced_at, query_key, failures)
  VALUES (NEW.id, '', NULL, '', 0);
END;

CREATE TRIGGER dequeue_atlas_entry AFTER UPDATE OF hidden_at, merged_into ON entries
WHEN NEW.merged_into IS NOT NULL OR NEW.hidden_at IS NOT NULL
BEGIN
  DELETE FROM atlas_sync_state WHERE entry_id = NEW.id;
END;

CREATE TRIGGER requeue_atlas_entry AFTER UPDATE OF hidden_at, merged_into ON entries
WHEN (OLD.merged_into IS NOT NULL OR OLD.hidden_at IS NOT NULL) AND NEW.merged_into IS NULL AND NEW.hidden_at IS NULL
BEGIN
  INSERT OR IGNORE INTO atlas_sync_state(entry_id, next_sync_at, synced_at, query_key, failures)
  VALUES (NEW.id, '', NULL, '', 0);
END;
