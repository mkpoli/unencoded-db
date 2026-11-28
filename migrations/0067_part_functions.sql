-- Per-part role and function annotations extracted from each live record's `composition` claim.
-- Supports component pie-chart analysis (`/part/<part>`) and reusable function autocomplete
-- proposed by NGWU YOH (chat messages, 2026-11-28, unpublished).
-- Existing records are reconciled via `scripts/sweep-part-roles.ts` using `partRoleRowsOf`.
CREATE TABLE entry_part_roles (
  part TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  role TEXT NOT NULL DEFAULT '',
  func TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (part, entry_id, role, func)
) WITHOUT ROWID;
CREATE INDEX entry_part_roles_by_entry ON entry_part_roles(entry_id);
CREATE INDEX entry_part_roles_by_func ON entry_part_roles(part, func, entry_id DESC, role DESC);

-- Pre-aggregated counts per (part, func) for O(K) pie-chart and suggestion reads.
CREATE TABLE part_function_counts (
  part TEXT NOT NULL,
  func TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (part, func)
) WITHOUT ROWID;
CREATE INDEX part_function_counts_by_part_n ON part_function_counts(part, n DESC, func);

-- Pre-aggregated total tagged-part rows per component for `/parts` directory reads.
CREATE TABLE part_counts (
  part TEXT PRIMARY KEY,
  n INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX part_counts_by_n ON part_counts(n DESC, part);

CREATE TRIGGER count_part_role AFTER INSERT ON entry_part_roles
BEGIN
  INSERT INTO part_function_counts(part, func, n) VALUES (NEW.part, NEW.func, 1)
  ON CONFLICT(part, func) DO UPDATE SET n = n + 1;
  INSERT INTO part_counts(part, n) VALUES (NEW.part, 1)
  ON CONFLICT(part) DO UPDATE SET n = n + 1;
END;

CREATE TRIGGER uncount_part_role AFTER DELETE ON entry_part_roles
BEGIN
  DELETE FROM part_function_counts WHERE part = OLD.part AND func = OLD.func AND n <= 1;
  UPDATE part_function_counts SET n = n - 1 WHERE part = OLD.part AND func = OLD.func;
  DELETE FROM part_counts WHERE part = OLD.part AND n <= 1;
  UPDATE part_counts SET n = n - 1 WHERE part = OLD.part;
END;
