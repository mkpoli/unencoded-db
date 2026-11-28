import { expect, test } from 'bun:test'
import { buildEntryStemma, layoutStemma, unseenNodeId, witnessNodeId, type StemmaGraph } from './stemma'
import type { Sighting } from './server/entries'

function fakeSighting(overrides: Partial<Sighting> & { id: number; entry_id: number }): Sighting {
  return {
    first_entry: overrides.entry_id,
    rev: 1,
    source_id: null,
    place: `Place ${overrides.id}`,
    url: null,
    title: null,
    author: null,
    publisher: null,
    report_date: null,
    container: null,
    source_kind: null,
    vias: [],
    cites: [],
    cited_by: [],
    original_date: null,
    page: null,
    contexts: null,
    style: null,
    types: null,
    note: null,
    quotes: null,
    media: [],
    hidden_at: null,
    removed_by: null,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

test('buildEntryStemma returns null when an entry has zero cite edges', () => {
  const s1 = fakeSighting({ id: 1, entry_id: 10, title: 'Book A', report_date: '1666' })
  expect(buildEntryStemma(10, [s1])).toBeNull()
})

test('layoutStemma orders chains left-to-right, bundles witness editions, bows skip edges, and offsets parallel edges', () => {
  const s1 = fakeSighting({
    id: 1, entry_id: 1, title: '字彙補', report_date: '1666',
    cites: [{
      kind: 'quotes', sighting: null, source_id: 99, status: 'unseen', target: null,
      url: null, title: '龍龕手鑑', author: null, publisher: null, report_date: '997', container: null, source_kind: null, quote: null, note: null,
    }],
    cited_by: [
      { position: 0, kind: 'quotes', sighting_id: 2, entry_id: 1, title: '康熙字典', place: 'p.1', author: null, report_date: '1716', original_date: null, thumb_key: null, quote: null, note: null },
      { position: 0, kind: 'quotes', sighting_id: 5, entry_id: 2, title: '中華字海', place: 'p.2', author: null, report_date: '1994', original_date: null, thumb_key: null, quote: null, note: null },
    ],
  })
  const s2 = fakeSighting({
    id: 2, entry_id: 1, title: '康熙字典', report_date: '1716',
    cites: [{
      kind: 'quotes', sighting: 1, source_id: null, status: 'witness',
      target: { id: 1, entry_id: 1, title: '字彙補', place: 'p.1', author: null, report_date: '1666', original_date: null, thumb_key: null },
      url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, note: null,
    }],
    cited_by: [
      { position: 0, kind: 'edition', sighting_id: 3, entry_id: 1, title: '道光重訂康熙字典', place: 'p.2', author: null, report_date: '1827', original_date: null, thumb_key: null, quote: null, note: null },
      { position: 0, kind: 'derived', sighting_id: 4, entry_id: 1, title: '大漢和辭典', place: 'p.3', author: null, report_date: '1957', original_date: null, thumb_key: null, quote: null, note: 're-cut' },
    ],
  })
  const s3 = fakeSighting({
    id: 3, entry_id: 1, title: '道光重訂康熙字典', report_date: '1827',
    cites: [{
      kind: 'edition', sighting: 2, source_id: null, status: 'witness',
      target: { id: 2, entry_id: 1, title: '康熙字典', place: 'p.1', author: null, report_date: '1716', original_date: null, thumb_key: null },
      url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, note: null,
    }],
  })
  const s4 = fakeSighting({
    id: 4, entry_id: 1, title: '大漢和辭典', report_date: '1957',
    cites: [
      {
        kind: 'derived', sighting: 2, source_id: null, status: 'witness',
        target: { id: 2, entry_id: 1, title: '康熙字典', place: 'p.1', author: null, report_date: '1716', original_date: null, thumb_key: null },
        url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, note: 're-cut',
      },
      // Skip-column edge from s1 (col 1) directly to s4 (col 3), plus parallel edge kind!
      {
        kind: 'quotes', sighting: 1, source_id: null, status: 'witness',
        target: { id: 1, entry_id: 1, title: '字彙補', place: 'p.1', author: null, report_date: '1666', original_date: null, thumb_key: null },
        url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, note: null,
      },
      {
        kind: 'quotes', sighting: 2, source_id: null, status: 'witness',
        target: { id: 2, entry_id: 1, title: '康熙字典', place: 'p.1', author: null, report_date: '1716', original_date: null, thumb_key: null },
        url: null, title: null, author: null, publisher: null, report_date: null, container: null, source_kind: null, quote: null, note: null,
      },
    ],
  })
  const sUnlinked = fakeSighting({ id: 6, entry_id: 1, title: 'Independent note', report_date: '2020' })

  const graph = buildEntryStemma(1, [s1, s2, s3, s4, sUnlinked])!
  expect(graph).not.toBeNull()
  expect(graph.unlinkedCount).toBe(1)

  const layout = layoutStemma(graph, 'strip')
  const unitOf = (nodeId: string) => layout.units.find(u => u.id === layout.nodeToUnit[nodeId])!

  expect(unitOf(unseenNodeId(99)).col).toBe(0)
  expect(unitOf(witnessNodeId(1)).col).toBe(1)
  expect(unitOf(witnessNodeId(2)).kind).toBe('edition')
  expect(unitOf(witnessNodeId(2)).id).toBe(unitOf(witnessNodeId(3)).id)
  expect(unitOf(witnessNodeId(2)).col).toBe(2)
  expect(unitOf(witnessNodeId(4)).col).toBe(3)

  // Skip-column edge s1 -> s4 routes beneath the shared row rather than straight across col 2.
  const skipEdge = layout.edges.find(e => e.fromUnit === witnessNodeId(1) && e.toUnit === witnessNodeId(4))!
  expect(skipEdge).toBeDefined()
  expect(skipEdge.backEdge).toBe(false)
  const s1Unit = unitOf(witnessNodeId(1))
  expect(skipEdge.path).toContain(` ${s1Unit.y + s1Unit.height} `)

  // Parallel edges between edition cluster and s4 get distinct offset SVG paths.
  const parallel = layout.edges.filter(e => e.fromUnit === unitOf(witnessNodeId(2)).id && e.toUnit === witnessNodeId(4))
  expect(parallel).toHaveLength(2)
  expect(parallel[0].path).not.toBe(parallel[1].path)

  // Ancestor maps include edition bundle, s1, and unseen stub u:99.
  const s4Ancestors = layout.ancestors[unitOf(witnessNodeId(4)).id]
  expect(s4Ancestors).toContain(unitOf(witnessNodeId(2)).id)
  expect(s4Ancestors).toContain(unitOf(witnessNodeId(1)).id)
  expect(s4Ancestors).toContain(unseenNodeId(99))
})

test('layoutStemma orders undated numeric sighting ids numerically and respects buildEntryStemma node cap', () => {
  const graph: StemmaGraph = {
    entryId: 1,
    unlinkedCount: 0,
    nodes: [
      { id: 's:10', kind: 'witness', sightingId: 10, entryId: 1, sourceId: null, title: 'Ten', place: '', date: null, year: null, thumbKey: null },
      { id: 's:2', kind: 'witness', sightingId: 2, entryId: 1, sourceId: null, title: 'Two', place: '', date: null, year: null, thumbKey: null },
      { id: 's:1', kind: 'witness', sightingId: 1, entryId: 1, sourceId: null, title: 'One', place: '', date: null, year: null, thumbKey: null },
    ],
    edges: [
      { from: 's:1', to: 's:2', kind: 'quotes' },
      { from: 's:1', to: 's:10', kind: 'quotes' },
    ],
  }
  const layout = layoutStemma(graph, 'strip')
  const col1 = layout.units.filter(u => u.col === 1).sort((a, b) => a.row - b.row).map(u => u.id)
  expect(col1).toEqual(['s:2', 's:10'])

  // Cap buildEntryStemma at 3 nodes and verify truncated flag.
  const s1 = fakeSighting({
    id: 1, entry_id: 1,
    cited_by: [2, 3, 4, 5].map(sid => ({ position: 0, kind: 'quotes' as const, sighting_id: sid, entry_id: 1, title: `W${sid}`, place: 'p', author: null, report_date: null, original_date: null, thumb_key: null, quote: null, note: null })),
  })
  const capped = buildEntryStemma(1, [s1], undefined, 3)!
  expect(capped.nodes).toHaveLength(3)
  expect(capped.truncated).toBe(true)
})

test('layoutStemma breaks residual cycles deterministically without infinite loops', () => {
  const graph: StemmaGraph = {
    entryId: 1,
    unlinkedCount: 0,
    nodes: [
      { id: 's:1', kind: 'witness', sightingId: 1, entryId: 1, sourceId: null, title: 'A', place: '', date: '1600', year: 1600, thumbKey: null },
      { id: 's:2', kind: 'witness', sightingId: 2, entryId: 1, sourceId: null, title: 'B', place: '', date: '1700', year: 1700, thumbKey: null },
      { id: 's:3', kind: 'witness', sightingId: 3, entryId: 1, sourceId: null, title: 'C', place: '', date: '1800', year: 1800, thumbKey: null },
    ],
    edges: [
      { from: 's:1', to: 's:2', kind: 'quotes' },
      { from: 's:2', to: 's:3', kind: 'quotes' },
      { from: 's:3', to: 's:1', kind: 'derived' },
    ],
  }
  const layout = layoutStemma(graph, 'full')
  expect(layout.units.map(u => [u.id, u.col])).toEqual([['s:1', 0], ['s:2', 1], ['s:3', 2]])
  expect(layout.edges.filter(e => e.backEdge)).toHaveLength(1)
  expect(layout.width).toBeGreaterThan(0)
  expect(layout.height).toBeGreaterThan(0)
})
