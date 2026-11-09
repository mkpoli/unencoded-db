-- One source image can support several characters from a batch.
DROP INDEX entries_image_key;
CREATE INDEX entries_image_key ON entries(image_key) WHERE image_key IS NOT NULL;
