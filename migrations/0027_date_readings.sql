-- Bibliographic transcriptions remain in sources, sightings and their revision snapshots.
CREATE TABLE date_readings (
  transcription TEXT PRIMARY KEY,
  reading TEXT CHECK (reading IS NULL OR json_valid(reading))
) WITHOUT ROWID;

CREATE VIEW evidence_dates(value) AS
SELECT report_date FROM sources UNION SELECT original_date FROM sightings
  UNION SELECT snapshot ->> '$.report_date' FROM revisions WHERE kind IN ('sighting','sighting_edit') AND redacted_at IS NULL
  UNION SELECT snapshot ->> '$.original_date' FROM revisions WHERE kind IN ('sighting','sighting_edit') AND redacted_at IS NULL
  UNION SELECT via.value ->> '$.report_date' FROM revisions r, json_each(r.snapshot, '$.vias') via
    WHERE r.kind IN ('sighting','sighting_edit') AND r.redacted_at IS NULL;

-- A write that computed date-dependent tags before a cache change retries with the new readings.
CREATE TABLE date_index_state (generation INTEGER NOT NULL CHECK (generation >= 0));
INSERT INTO date_index_state VALUES (0);
CREATE TRIGGER date_reading_insert AFTER INSERT ON date_readings
WHEN NEW.reading IS NULL OR json_extract(NEW.reading, '$.query') IS NOT NULL
BEGIN UPDATE date_index_state SET generation = generation + 1; END;
CREATE TRIGGER date_reading_update AFTER UPDATE OF reading ON date_readings
WHEN NEW.reading IS NOT OLD.reading
BEGIN UPDATE date_index_state SET generation = generation + 1; END;
