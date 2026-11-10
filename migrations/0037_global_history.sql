-- The global history reads revisions newest first across every visible record.
CREATE INDEX entry_revisions_history ON entry_revisions(recorded_at DESC, entry_id DESC, revision DESC);
