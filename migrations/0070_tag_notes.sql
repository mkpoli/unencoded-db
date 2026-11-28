-- What each tag means, in the interface languages that have it: an object of text by locale, like `names`.
ALTER TABLE tags ADD COLUMN notes TEXT NOT NULL DEFAULT '{}';
