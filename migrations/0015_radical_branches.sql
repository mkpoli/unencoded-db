-- The paths with enough records to stand as a radical, so that a page reads them without reading every
-- path under a radical. The threshold repeats BRANCH_MIN of src/lib/radicals.ts.
CREATE INDEX tag_counts_branches ON tag_counts(tag) WHERE n >= 10;
