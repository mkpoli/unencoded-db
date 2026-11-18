// A bounded sample for one source (aliased as c). Visibility is checked on both
// the sighting and its record before any evidence is returned to the browser.
export const SOURCE_CARD_READ = 32
export function sampledSightings(via: boolean) {
  const from = via
    ? 'sighting_vias v INDEXED BY sighting_vias_by_source CROSS JOIN sightings s ON s.id = v.sighting_id WHERE v.source_id = c.id ORDER BY v.sighting_id'
    : 'sightings s INDEXED BY sightings_by_source WHERE s.source_id = c.id ORDER BY s.id'
  return `FROM (SELECT s.id, s.entry_id, s.source_id, s.hidden_at, s.page, s.place FROM ${from} LIMIT ${SOURCE_CARD_READ}) r
    CROSS JOIN entries e ON e.id = r.entry_id LEFT JOIN sighting_media x ON x.sighting_id = r.id AND x.position = 0
    WHERE r.hidden_at IS NULL AND e.hidden_at IS NULL AND e.merged_into IS NULL ${via ? 'AND r.source_id IS NOT c.id' : ''}`
}
