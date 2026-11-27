-- Older works a sighting's text quotes, re-sets as a later edition, or derives from.
-- Owned by the later sighting (`sighting_id`) so each edge lives in its snapshot; `cited_id` may
-- point to a sighting in any record, and `source_id` preserves what the text itself named.
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

-- Distinct live records holding a visible sighting that names this source with no visible witness identified.
ALTER TABLE sources ADD COLUMN named INTEGER NOT NULL DEFAULT 0;
CREATE INDEX sources_wanted ON sources(named, id) WHERE named > 0;
