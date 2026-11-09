CREATE TABLE genres (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

INSERT INTO genres (slug, label) VALUES
  ('music', '樂譜'),
  ('medicine', '醫學'),
  ('chemistry', '化學'),
  ('metrology', '度量衡');

CREATE TABLE entry_genres (
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  genre TEXT NOT NULL REFERENCES genres(slug),
  PRIMARY KEY (entry_id, genre)
);

CREATE INDEX entry_genres_genre ON entry_genres(genre, entry_id);
