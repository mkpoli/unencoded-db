-- The character a record should be unified with is one of its relations, so the claim kind that held it
-- becomes a relation whose relationship is `unifiable`.
UPDATE claims SET kind = 'relation', data = json_object('relationship', 'unifiable') WHERE kind = 'normalizes_to';

-- The past versions of a record repeat its claims, so they take the same form.
UPDATE revisions SET snapshot = json_set(snapshot, '$.claims', (
  SELECT json_group_array(json(CASE WHEN json_extract(claim.value, '$.kind') = 'normalizes_to'
    THEN json_set(claim.value, '$.kind', 'relation', '$.data', json_object('relationship', 'unifiable')) ELSE claim.value END))
  FROM json_each(revisions.snapshot, '$.claims') AS claim
))
WHERE sighting_id IS NULL AND redacted_at IS NULL AND json_valid(snapshot) AND json_type(snapshot, '$.claims') = 'array' AND instr(snapshot, 'normalizes_to') > 0;
