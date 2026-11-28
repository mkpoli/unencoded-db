-- Treat a part's role (`semantic`, `phonetic`, `symbol`, `initial`, `final`, or custom role)
-- as its effective 作用 bucket whenever no narrower `func` label is given.
ALTER TABLE entry_part_roles ADD COLUMN bucket TEXT NOT NULL DEFAULT '';
UPDATE entry_part_roles SET bucket = CASE WHEN func != '' THEN func ELSE role END;

DROP INDEX entry_part_roles_by_func;
CREATE INDEX entry_part_roles_by_bucket ON entry_part_roles(part, bucket, entry_id DESC, role DESC, func DESC);

DROP TRIGGER count_part_role;
DROP TRIGGER uncount_part_role;

CREATE TRIGGER count_part_role AFTER INSERT ON entry_part_roles
BEGIN
  INSERT INTO part_function_counts(part, func, n)
  VALUES (NEW.part, CASE WHEN NEW.bucket != '' THEN NEW.bucket WHEN NEW.func != '' THEN NEW.func ELSE NEW.role END, 1)
  ON CONFLICT(part, func) DO UPDATE SET n = n + 1;
  INSERT INTO part_counts(part, n) VALUES (NEW.part, 1)
  ON CONFLICT(part) DO UPDATE SET n = n + 1;
END;

CREATE TRIGGER uncount_part_role AFTER DELETE ON entry_part_roles
BEGIN
  DELETE FROM part_function_counts
  WHERE part = OLD.part AND func = (CASE WHEN OLD.bucket != '' THEN OLD.bucket WHEN OLD.func != '' THEN OLD.func ELSE OLD.role END) AND n <= 1;
  UPDATE part_function_counts SET n = n - 1
  WHERE part = OLD.part AND func = (CASE WHEN OLD.bucket != '' THEN OLD.bucket WHEN OLD.func != '' THEN OLD.func ELSE OLD.role END);
  DELETE FROM part_counts WHERE part = OLD.part AND n <= 1;
  UPDATE part_counts SET n = n - 1 WHERE part = OLD.part;
END;

DELETE FROM part_function_counts;
INSERT INTO part_function_counts(part, func, n)
SELECT part, bucket, COUNT(*) FROM entry_part_roles GROUP BY part, bucket;
