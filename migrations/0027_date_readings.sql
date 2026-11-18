-- Bibliographic transcriptions remain in sources, sightings and their revision snapshots.
CREATE TABLE date_readings (
  transcription TEXT PRIMARY KEY,
  reading TEXT CHECK (reading IS NULL OR json_valid(reading))
) WITHOUT ROWID;
