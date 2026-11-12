-- A picture holds up to eight marks, so `box` is a JSON array of [x, y, width, height] boxes. A single stored box becomes a one-element array.
UPDATE sighting_media SET box = '[' || box || ']' WHERE box IS NOT NULL;

-- The past versions of a sighting repeat its pictures, so their boxes take the same form.
UPDATE revisions SET snapshot = json_set(snapshot, '$.media', (
  SELECT json_group_array(json(CASE WHEN json_type(image.value, '$.box') = 'text' THEN json_set(image.value, '$.box', '[' || json_extract(image.value, '$.box') || ']') ELSE image.value END))
  FROM json_each(revisions.snapshot, '$.media') AS image
))
WHERE sighting_id IS NOT NULL AND kind IN ('sighting', 'sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot) AND json_type(snapshot, '$.media') = 'array';
