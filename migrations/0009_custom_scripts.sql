-- A script outside the list is `other` with its name in `script_other`; the names already given are offered
-- to the next record, read in name order from this index.
UPDATE entries SET script_other = NULL WHERE script <> 'other' AND script_other IS NOT NULL;
CREATE INDEX entries_custom_scripts ON entries(script_other) WHERE script = 'other' AND script_other IS NOT NULL AND merged_into IS NULL AND hidden_at IS NULL;
