-- The role each top-level part of the first description plays. The formation is derived from the
-- roles, so only the choices are stored, against the exact sequence that was tagged.
ALTER TABLE entries ADD COLUMN composition TEXT
  CHECK (composition IS NULL OR (json_valid(composition) AND json_type(composition) = 'object'));
