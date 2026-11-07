ALTER TABLE entries ADD COLUMN comparisons TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(comparisons) AND json_type(comparisons) = 'array' AND json_array_length(comparisons) <= 10);
