-- Directed provenance edges from a later witness (`sighting_id`) to an older work it quotes,
-- re-sets as a later edition, or derives from. `source_id` keeps the work as attested in the text;
-- `cited_id` stores the editorial identification with a specific recorded sighting (in any record).
-- Both may be set together so a hidden or removed witness falls back cleanly to the named source.
CREATE TABLE sighting_cites (
  sighting_id INTEGER NOT NULL REFERENCES sightings(id),
  position    INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('quotes', 'edition', 'derived')),
  source_id   INTEGER REFERENCES sources(id),
  cited_id    INTEGER REFERENCES sightings(id),
  quote       TEXT,
  note        TEXT,
  PRIMARY KEY (sighting_id, position),
  CHECK (source_id IS NOT NULL OR cited_id IS NOT NULL),
  CHECK (cited_id IS NOT sighting_id)
) WITHOUT ROWID;

CREATE INDEX sighting_cites_by_cited ON sighting_cites(cited_id, sighting_id) WHERE cited_id IS NOT NULL;
CREATE INDEX sighting_cites_by_source ON sighting_cites(source_id, sighting_id) WHERE source_id IS NOT NULL;
