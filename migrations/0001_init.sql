CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script TEXT NOT NULL,
  ids TEXT,
  description TEXT,
  place TEXT NOT NULL,
  url TEXT,
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  page TEXT,
  note TEXT,
  image_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX entries_by_image ON entries(image_key) WHERE image_key IS NOT NULL;
