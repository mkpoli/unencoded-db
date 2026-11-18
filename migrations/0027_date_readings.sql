-- Bibliographic transcriptions remain in sources, sightings and their revision snapshots.
CREATE TABLE date_readings (
  transcription TEXT PRIMARY KEY,
  reading TEXT CHECK (reading IS NULL OR json_valid(reading))
) WITHOUT ROWID;

CREATE VIEW evidence_dates(value) AS
WITH snapshots(item) AS MATERIALIZED (
  SELECT snapshot FROM revisions
  WHERE kind IN ('sighting','sighting_edit') AND redacted_at IS NULL AND json_valid(snapshot)
), vias(item) AS (
  SELECT CASE WHEN via.type = 'object' THEN via.value END FROM snapshots s, json_each(s.item, '$.vias') via
  WHERE json_type(s.item, '$.vias') = 'array'
)
SELECT report_date FROM sources UNION SELECT original_date FROM sightings
  UNION SELECT item ->> '$.report_date' FROM snapshots WHERE json_type(item, '$.report_date') = 'text'
  UNION SELECT item ->> '$.original_date' FROM snapshots WHERE json_type(item, '$.original_date') = 'text'
  UNION SELECT item ->> '$.report_date' FROM vias WHERE json_type(item, '$.report_date') = 'text';

-- A write that computed date-dependent tags before a cache change retries with the new readings.
CREATE TABLE date_index_state (generation INTEGER NOT NULL CHECK (generation >= 0));
INSERT INTO date_index_state VALUES (0);
CREATE TRIGGER date_reading_insert AFTER INSERT ON date_readings
WHEN NEW.reading IS NULL OR json_extract(NEW.reading, '$.query') IS NOT NULL
BEGIN UPDATE date_index_state SET generation = generation + 1; END;
CREATE TRIGGER date_reading_update AFTER UPDATE OF reading ON date_readings
WHEN NEW.reading IS NOT OLD.reading
BEGIN UPDATE date_index_state SET generation = generation + 1; END;
