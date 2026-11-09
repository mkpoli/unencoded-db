-- A source image can be cited through several rectangular crops.
CREATE TABLE crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
  x REAL NOT NULL CHECK (x >= 0 AND x < 100),
  y REAL NOT NULL CHECK (y >= 0 AND y < 100),
  w REAL NOT NULL CHECK (w > 0 AND w <= 100),
  h REAL NOT NULL CHECK (h > 0 AND h <= 100),
  created_at TEXT NOT NULL,
  CHECK (x + w <= 100),
  CHECK (y + h <= 100)
);

CREATE INDEX crops_evidence ON crops(evidence_id, id);
