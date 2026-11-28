-- The pictures of a go-between itself: a screenshot of the message, a photograph of the letter. They are kept
-- apart from the pictures of the sighting, which show the character in the cited work.
CREATE TABLE sighting_via_media (
  sighting_id INTEGER NOT NULL,
  via_position INTEGER NOT NULL,
  position INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  image_type TEXT NOT NULL,
  image_w INTEGER NOT NULL,
  image_h INTEGER NOT NULL,
  thumb_key TEXT NOT NULL,
  PRIMARY KEY (sighting_id, via_position, position),
  FOREIGN KEY (sighting_id, via_position) REFERENCES sighting_vias(sighting_id, position) ON DELETE CASCADE
) WITHOUT ROWID;
CREATE INDEX sighting_via_media_by_image ON sighting_via_media(image_key);
CREATE INDEX sighting_via_media_by_thumb ON sighting_via_media(thumb_key);
