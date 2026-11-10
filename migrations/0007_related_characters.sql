-- Structured comparisons are independent of the existing free-text related notes.
ALTER TABLE entries ADD COLUMN related_characters TEXT CHECK (related_characters IS NULL OR json_valid(related_characters));
