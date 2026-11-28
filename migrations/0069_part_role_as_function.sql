-- Treat a part's role (`semantic`, `phonetic`, `symbol`, `initial`, `final`, or custom role)
-- as its effective 作用 bucket whenever no narrower `func` label is given.
-- Using a VIRTUAL generated column keeps writes from both the previous and new Workers consistent
-- during rollout, and `entry_part_roles_by_func` stays in place for zero-downtime deployment.
ALTER TABLE entry_part_roles
  ADD COLUMN bucket TEXT GENERATED ALWAYS AS (CASE WHEN func != '' THEN func ELSE role END) VIRTUAL;

CREATE INDEX entry_part_roles_by_bucket ON entry_part_roles(part, bucket, entry_id DESC, role DESC, func DESC);

DROP TRIGGER count_part_role;
DROP TRIGGER uncount_part_role;

CREATE TRIGGER count_part_role AFTER INSERT ON entry_part_roles
BEGIN
  INSERT INTO part_function_counts(part, func, n) VALUES (NEW.part, NEW.bucket, 1)
  ON CONFLICT(part, func) DO UPDATE SET n = n + 1;
  INSERT INTO part_counts(part, n) VALUES (NEW.part, 1)
  ON CONFLICT(part) DO UPDATE SET n = n + 1;
END;

CREATE TRIGGER uncount_part_role AFTER DELETE ON entry_part_roles
BEGIN
  DELETE FROM part_function_counts WHERE part = OLD.part AND func = OLD.bucket AND n <= 1;
  UPDATE part_function_counts SET n = n - 1 WHERE part = OLD.part AND func = OLD.bucket;
  DELETE FROM part_counts WHERE part = OLD.part AND n <= 1;
  UPDATE part_counts SET n = n - 1 WHERE part = OLD.part;
END;

DELETE FROM part_function_counts;
INSERT INTO part_function_counts(part, func, n)
SELECT part, bucket, COUNT(*) FROM entry_part_roles GROUP BY part, bucket;
