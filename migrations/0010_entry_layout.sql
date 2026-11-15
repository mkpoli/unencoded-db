-- How the first description's parts are moved in its drawing, repeated from that description's claim as
-- `ids` repeats the description, so a list draws an adjusted glyph from this table alone.
ALTER TABLE entries ADD COLUMN layout TEXT CHECK (layout IS NULL OR json_valid(layout));
