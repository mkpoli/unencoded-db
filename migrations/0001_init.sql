CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script TEXT NOT NULL,
  ids TEXT,
  description TEXT,
  place TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  author TEXT,
  publisher TEXT,
  year TEXT,
  page TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
