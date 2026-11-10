-- One row per public key and sighting. The key-first primary key makes reads
-- independent of the number of hidden or shared references to an object.
CREATE TABLE public_media_refs (
  key TEXT NOT NULL,
  sighting_id INTEGER NOT NULL,
  PRIMARY KEY (key, sighting_id)
) WITHOUT ROWID;
CREATE INDEX public_media_refs_by_sighting ON public_media_refs(sighting_id);

INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
SELECT s.image_key, s.id FROM sightings s JOIN entries e ON e.id = s.entry_id
WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL AND s.image_key IS NOT NULL;
INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
SELECT s.thumb_key, s.id FROM sightings s JOIN entries e ON e.id = s.entry_id
WHERE s.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL AND s.thumb_key IS NOT NULL;

CREATE TRIGGER public_media_sighting_insert AFTER INSERT ON sightings BEGIN
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT NEW.image_key, NEW.id FROM entries e WHERE e.id = NEW.entry_id AND e.hidden_at IS NULL AND e.merged_into IS NULL AND NEW.hidden_at IS NULL AND NEW.image_key IS NOT NULL;
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT NEW.thumb_key, NEW.id FROM entries e WHERE e.id = NEW.entry_id AND e.hidden_at IS NULL AND e.merged_into IS NULL AND NEW.hidden_at IS NULL AND NEW.thumb_key IS NOT NULL;
END;
CREATE TRIGGER public_media_sighting_update AFTER UPDATE OF entry_id, hidden_at, image_key, thumb_key ON sightings BEGIN
  DELETE FROM public_media_refs WHERE sighting_id = OLD.id;
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT NEW.image_key, NEW.id FROM entries e WHERE e.id = NEW.entry_id AND e.hidden_at IS NULL AND e.merged_into IS NULL AND NEW.hidden_at IS NULL AND NEW.image_key IS NOT NULL;
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT NEW.thumb_key, NEW.id FROM entries e WHERE e.id = NEW.entry_id AND e.hidden_at IS NULL AND e.merged_into IS NULL AND NEW.hidden_at IS NULL AND NEW.thumb_key IS NOT NULL;
END;
CREATE TRIGGER public_media_sighting_delete AFTER DELETE ON sightings BEGIN
  DELETE FROM public_media_refs WHERE sighting_id = OLD.id;
END;
CREATE TRIGGER public_media_entry_update AFTER UPDATE OF hidden_at, merged_into ON entries
WHEN OLD.hidden_at IS NOT NEW.hidden_at OR OLD.merged_into IS NOT NEW.merged_into BEGIN
  DELETE FROM public_media_refs WHERE sighting_id IN (SELECT id FROM sightings WHERE entry_id = NEW.id);
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT image_key, id FROM sightings WHERE entry_id = NEW.id AND hidden_at IS NULL AND NEW.hidden_at IS NULL AND NEW.merged_into IS NULL AND image_key IS NOT NULL;
  INSERT OR IGNORE INTO public_media_refs(key, sighting_id)
  SELECT thumb_key, id FROM sightings WHERE entry_id = NEW.id AND hidden_at IS NULL AND NEW.hidden_at IS NULL AND NEW.merged_into IS NULL AND thumb_key IS NOT NULL;
END;
CREATE TRIGGER public_media_entry_delete AFTER DELETE ON entries BEGIN
  DELETE FROM public_media_refs WHERE sighting_id IN (SELECT id FROM sightings WHERE entry_id = OLD.id);
END;
