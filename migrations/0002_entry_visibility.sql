ALTER TABLE entries ADD COLUMN visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1));

CREATE INDEX entries_visible_id ON entries(id DESC) WHERE visible = 1;
