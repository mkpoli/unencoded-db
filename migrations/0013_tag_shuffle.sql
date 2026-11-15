-- A fixed shuffle of every list. A record's rank mixes its id within 32 bits: multiply by an odd constant,
-- fold the high half into the low half, multiply again. Each step can be undone, so no two records of a
-- list share a rank. A shuffled list starts at a random rank and reads on from there.
CREATE INDEX entry_tags_by_shuffle ON entry_tags(tag, ((((((entry_id * 2654435761) % 4294967296) | (((entry_id * 2654435761) % 4294967296) >> 16)) - (((entry_id * 2654435761) % 4294967296) & (((entry_id * 2654435761) % 4294967296) >> 16))) * 73244475) % 4294967296));
