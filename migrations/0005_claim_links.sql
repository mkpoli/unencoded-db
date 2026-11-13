-- A claim gains a key of its own within its record, names every sighting that supports it instead of
-- one, and may hold under other claims of the record: `sightings` and `under` are JSON arrays of sighting
-- ids and of claim keys.

-- One key for each statement a record has ever made: its kind, its value, what tells two of a kind apart
-- (a reading's doculect, a code's character set), and which of several alike it is. The claims a record
-- holds and the same claims in its past versions meet in one row here, so they take the same key. A key
-- is eight characters drawn from the row's number, which makes it different from every other.
CREATE TABLE claim_keys (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL,
  identity TEXT NOT NULL,
  n INTEGER NOT NULL,
  UNIQUE (entry_id, identity, n)
);

INSERT OR IGNORE INTO claim_keys(entry_id, identity, n)
SELECT entry_id, identity, row_number() OVER (PARTITION BY entry_id, identity ORDER BY position, id)
FROM (
  SELECT id, entry_id, position,
    kind || char(31) || value || char(31) || COALESCE(CASE kind WHEN 'reading' THEN json_extract(data, '$.doculect') WHEN 'encoding' THEN json_extract(data, '$.charset') END, '') AS identity
  FROM claims
)
ORDER BY entry_id, position, id;

INSERT OR IGNORE INTO claim_keys(entry_id, identity, n)
SELECT entry_id, identity, row_number() OVER (PARTITION BY revision, identity ORDER BY position)
FROM (
  SELECT r.id AS revision, r.entry_id, claim.key AS position,
    COALESCE(json_extract(claim.value, '$.kind'), '') || char(31) || COALESCE(json_extract(claim.value, '$.value'), '') || char(31) || COALESCE(CASE json_extract(claim.value, '$.kind') WHEN 'reading' THEN json_extract(claim.value, '$.data.doculect') WHEN 'encoding' THEN json_extract(claim.value, '$.data.charset') END, '') AS identity
  FROM revisions r, json_each(r.snapshot, '$.claims') claim
  WHERE r.sighting_id IS NULL AND r.redacted_at IS NULL AND json_valid(r.snapshot) AND json_type(r.snapshot, '$.claims') = 'array'
)
ORDER BY revision, position;

-- SQLite does not drop a column that carries a REFERENCES clause, so the table is built again.
CREATE TABLE claims_linked (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  position INTEGER NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  data TEXT CHECK (data IS NULL OR json_valid(data)),
  sightings TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sightings) AND json_type(sightings) = 'array'),
  under TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(under) AND json_type(under) = 'array')
);

INSERT INTO claims_linked(id, entry_id, position, key, kind, value, data, sightings)
SELECT c.id, c.entry_id, c.position, printf('%08x', (k.id * 2654435761) % 4294967296), c.kind, c.value, c.data,
  CASE WHEN c.sighting_id IS NULL THEN '[]' ELSE json_array(c.sighting_id) END
FROM (
  SELECT *, row_number() OVER (PARTITION BY entry_id, identity ORDER BY position, id) AS n
  FROM (
    SELECT *, kind || char(31) || value || char(31) || COALESCE(CASE kind WHEN 'reading' THEN json_extract(data, '$.doculect') WHEN 'encoding' THEN json_extract(data, '$.charset') END, '') AS identity
    FROM claims
  )
) c
JOIN claim_keys k ON k.entry_id = c.entry_id AND k.identity = c.identity AND k.n = c.n;

DROP TABLE claims;
ALTER TABLE claims_linked RENAME TO claims;
CREATE INDEX claims_by_entry ON claims(entry_id, position);
CREATE INDEX claims_by_value ON claims(kind, value, entry_id);
CREATE UNIQUE INDEX claims_by_key ON claims(entry_id, key);

-- The past versions of a record repeat its claims, so they take the same form, each claim with the key
-- its statement has in `claim_keys`. `json()` hands the list to `json_set` as an array, not as its text.
UPDATE revisions SET snapshot = json_set(snapshot, '$.claims', json((
  SELECT json_group_array(json(item)) FROM (
    SELECT json_remove(json_set(c.claim, '$.key', printf('%08x', (k.id * 2654435761) % 4294967296),
      '$.sightings', json(CASE WHEN json_extract(c.claim, '$.sighting_id') IS NULL THEN '[]' ELSE json_array(json_extract(c.claim, '$.sighting_id')) END),
      '$.under', json('[]')), '$.sighting_id') AS item
    FROM (
      SELECT *, row_number() OVER (PARTITION BY identity ORDER BY position) AS n
      FROM (
        SELECT claim.key AS position, claim.value AS claim,
          COALESCE(json_extract(claim.value, '$.kind'), '') || char(31) || COALESCE(json_extract(claim.value, '$.value'), '') || char(31) || COALESCE(CASE json_extract(claim.value, '$.kind') WHEN 'reading' THEN json_extract(claim.value, '$.data.doculect') WHEN 'encoding' THEN json_extract(claim.value, '$.data.charset') END, '') AS identity
        FROM json_each(revisions.snapshot, '$.claims') claim
      )
    ) c
    JOIN claim_keys k ON k.entry_id = revisions.entry_id AND k.identity = c.identity AND k.n = c.n
    ORDER BY c.position
  )
)))
WHERE sighting_id IS NULL AND redacted_at IS NULL AND json_valid(snapshot) AND json_type(snapshot, '$.claims') = 'array';

DROP TABLE claim_keys;
