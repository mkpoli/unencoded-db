-- A record's status follows from its claims, and no one sets it. The statuses that a person chose
-- between, `unencoded` and `doubtful`, go, and `unifiable` and `homograph` join the ones that remain.

-- The column's CHECK names the statuses, so the column is made again. Nothing indexes it.
ALTER TABLE entries DROP COLUMN status;
ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'unchecked' CHECK (status IN ('unchecked','encoded','unifiable','homograph','variant'));

-- Each record takes the first status whose rule its claims meet: a Unicode code, a relation of
-- `unifiable`, a `homograph` of an encoded character, a `variant` or `erroneous` form of one. A related
-- value is an encoded character when it is one code point that is neither private use nor an ideographic
-- description character. This matches `encodedCharacter`, except that NFC is not applied here.
WITH encoded_value(entry_id, relationship) AS (
  SELECT entry_id, json_extract(data, '$.relationship') FROM claims
  WHERE kind = 'relation'
    AND length(value) = 1
    AND unicode(value) NOT BETWEEN 0xE000 AND 0xF8FF
    AND unicode(value) NOT BETWEEN 0xF0000 AND 0x10FFFF
    AND unicode(value) NOT BETWEEN 0x2FF0 AND 0x2FFF
    AND unicode(value) <> 0x31EF
)
UPDATE entries SET status = CASE
  WHEN EXISTS (SELECT 1 FROM claims c WHERE c.entry_id = entries.id AND c.kind = 'encoding' AND json_extract(c.data, '$.charset') = 'unicode') THEN 'encoded'
  WHEN EXISTS (SELECT 1 FROM claims c WHERE c.entry_id = entries.id AND c.kind = 'relation' AND json_extract(c.data, '$.relationship') = 'unifiable') THEN 'unifiable'
  WHEN EXISTS (SELECT 1 FROM encoded_value v WHERE v.entry_id = entries.id AND v.relationship = 'homograph') THEN 'homograph'
  WHEN EXISTS (SELECT 1 FROM encoded_value v WHERE v.entry_id = entries.id AND v.relationship IN ('variant', 'erroneous')) THEN 'variant'
  ELSE 'unchecked'
END;

-- The status tags are `f:<status>`, and `s:<script>|f:<status>` for a script. Those of the old and the
-- new statuses are replaced, and the other facet tags (`n:*`) stay.
DELETE FROM entry_tags
WHERE tag IN ('f:unchecked', 'f:unencoded', 'f:variant', 'f:encoded', 'f:doubtful', 'f:unifiable', 'f:homograph')
  OR (tag LIKE 's:%|f:%' AND substr(tag, instr(tag, '|') + 1) IN ('f:unchecked', 'f:unencoded', 'f:variant', 'f:encoded', 'f:doubtful', 'f:unifiable', 'f:homograph'));

INSERT INTO entry_tags(tag, entry_id)
SELECT 'f:' || status, id FROM entries WHERE merged_into IS NULL AND hidden_at IS NULL;
INSERT INTO entry_tags(tag, entry_id)
SELECT 's:' || script || '|f:' || status, id FROM entries WHERE merged_into IS NULL AND hidden_at IS NULL;

-- The counts of those tags are counted again.
DELETE FROM tag_counts
WHERE tag LIKE 'f:%' OR tag LIKE 's:%|f:%';
INSERT INTO tag_counts(tag, n)
SELECT tag, count(*) FROM entry_tags
WHERE tag LIKE 'f:%' OR tag LIKE 's:%|f:%'
GROUP BY tag;

-- A past version of a record no longer holds a status.
UPDATE revisions SET snapshot = json_remove(snapshot, '$.status')
WHERE sighting_id IS NULL AND json_valid(snapshot) AND json_type(snapshot, '$.status') IS NOT NULL;
