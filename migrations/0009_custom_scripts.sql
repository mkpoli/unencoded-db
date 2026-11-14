-- A script outside the list is `other` with its name in `script_other`; the names already given are offered
-- to the next record, one seek each in this index.
CREATE INDEX entries_custom_scripts ON entries(script_other) WHERE script = 'other' AND script_other IS NOT NULL AND merged_into IS NULL AND hidden_at IS NULL;
