-- IVD membership is separate from encoded_as. NULL means the record has not stated it.
-- A registered sequence is one base character plus a variation selector U+E0100–U+E01EF
-- (Unicode Technical Standard #37, Ideographic Variation Database).
ALTER TABLE entries ADD COLUMN ivd_status TEXT
  CHECK (ivd_status IS NULL OR ivd_status IN ('registered', 'none'));
ALTER TABLE entries ADD COLUMN ivd_sequence TEXT
  CHECK (
    (ivd_status = 'registered' AND ivd_sequence IS NOT NULL)
    OR ((ivd_status IS NULL OR ivd_status = 'none') AND ivd_sequence IS NULL)
  );

CREATE INDEX entries_visible_ivd ON entries(ivd_status, id DESC) WHERE visible = 1;
CREATE INDEX entries_visible_ivd_script ON entries(ivd_status, script, id DESC) WHERE visible = 1;
