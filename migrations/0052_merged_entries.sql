-- The duplicates that joined a record are read by the record they joined, to list them and to part them.
CREATE INDEX entries_merged ON entries(merged_into) WHERE merged_into IS NOT NULL;
