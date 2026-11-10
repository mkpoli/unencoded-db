-- A variant can name the existing character it normalizes to.
ALTER TABLE entries ADD COLUMN equivalent_to TEXT
  CHECK (equivalent_to IS NULL OR (length(equivalent_to) BETWEEN 1 AND 80));
