-- A fixed shuffle of every list: each record's id multiplied by an odd constant, modulo 2^32, is a rank
-- no other record of the list shares. A shuffled list starts at a random rank and reads on from there.
CREATE INDEX entry_tags_by_shuffle ON entry_tags(tag, ((entry_id * 2654435761) % 4294967296));
