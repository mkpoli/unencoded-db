-- Write-maintained summary of visible work-to-work citations derived from `sighting_cites`.
-- Each row counts distinct live records where a visible sighting of `citing_source_id`
-- cites `cited_source_id` (through a live linked witness's `source_id`, or via an unseen
-- stub's `source_id`), broken down by citation kind.
CREATE TABLE source_citations (
  citing_source_id INTEGER NOT NULL REFERENCES sources(id),
  cited_source_id  INTEGER NOT NULL REFERENCES sources(id),
  records          INTEGER NOT NULL,
  quotes_count     INTEGER NOT NULL DEFAULT 0,
  edition_count    INTEGER NOT NULL DEFAULT 0,
  derived_count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (citing_source_id, cited_source_id),
  CHECK (citing_source_id != cited_source_id),
  CHECK (records > 0)
) WITHOUT ROWID;

CREATE INDEX source_citations_by_citing
  ON source_citations(citing_source_id, records DESC, cited_source_id);
CREATE INDEX source_citations_by_cited
  ON source_citations(cited_source_id, records DESC, citing_source_id);
CREATE INDEX source_citations_by_records
  ON source_citations(records DESC, citing_source_id, cited_source_id);

-- Backfill from existing visible sightings and provenance citations.
INSERT INTO source_citations (citing_source_id, cited_source_id, records, quotes_count, edition_count, derived_count)
SELECT
  citing_source_id,
  cited_source_id,
  COUNT(DISTINCT entry_id) AS records,
  COUNT(DISTINCT CASE WHEN kind = 'quotes' THEN entry_id END) AS quotes_count,
  COUNT(DISTINCT CASE WHEN kind = 'edition' THEN entry_id END) AS edition_count,
  COUNT(DISTINCT CASE WHEN kind = 'derived' THEN entry_id END) AS derived_count
FROM (
  SELECT
    s.source_id AS citing_source_id,
    CASE
      WHEN sc.cited_id IS NOT NULL THEN COALESCE(cs.source_id, sc.source_id)
      ELSE sc.source_id
    END AS cited_source_id,
    s.entry_id AS entry_id,
    sc.kind AS kind
  FROM sighting_cites sc
  JOIN sightings s ON s.id = sc.sighting_id
  JOIN entries e ON e.id = s.entry_id
  LEFT JOIN sightings cs ON cs.id = sc.cited_id
  LEFT JOIN entries ce ON ce.id = cs.entry_id
  WHERE s.source_id IS NOT NULL
    AND s.hidden_at IS NULL
    AND e.hidden_at IS NULL
    AND e.merged_into IS NULL
    AND (
      (sc.cited_id IS NULL AND sc.source_id IS NOT NULL)
      OR (sc.cited_id IS NOT NULL AND cs.id IS NOT NULL AND cs.hidden_at IS NULL AND ce.hidden_at IS NULL AND ce.merged_into IS NULL)
    )
)
WHERE cited_source_id IS NOT NULL
  AND citing_source_id != cited_source_id
GROUP BY citing_source_id, cited_source_id;
