-- Homograph relation claims indexed by record and by target value, so listing and grouping homographs
-- reads only homograph relations instead of scanning all claims.
CREATE INDEX claims_homograph ON claims(entry_id, id) WHERE kind = 'relation' AND json_extract(data, '$.relationship') = 'homograph';
CREATE INDEX claims_homograph_by_value ON claims(value, entry_id) WHERE kind = 'relation' AND json_extract(data, '$.relationship') = 'homograph';
