import { expect, test } from 'bun:test'
import { layoutSourceGraph, type SourceGraphData, type SourceGraphNode } from './source-graph'

function makeNode(overrides: Partial<SourceGraphNode> & { id: number }): SourceGraphNode {
  return {
    title: `Work ${overrides.id}`,
    author: null,
    publisher: null,
    report_date: null,
    url: null,
    container: null,
    source_kind: 'book',
    year: null,
    records: 1,
    ...overrides,
  }
}

test('layoutSourceGraph orders works oldest-to-newest, bows skip edges, scales stroke width, and computes lineage', () => {
  const graph: SourceGraphData = {
    focusId: 2,
    truncated: false,
    nodes: [
      makeNode({ id: 1, title: '字彙補', report_date: '1666', year: 1666, records: 12 }),
      makeNode({ id: 2, title: '康熙字典', report_date: '1716', year: 1716, records: 30 }),
      makeNode({ id: 3, title: '漢語大字典', report_date: '1990', year: 1990, records: 80 }),
      makeNode({ id: 4, title: '中華字海', report_date: '1994', year: 1994, records: 95 }),
    ],
    edges: [
      { from: 1, to: 2, records: 12, quotes: 12, edition: 0, derived: 0 },
      { from: 2, to: 3, records: 25, quotes: 25, edition: 0, derived: 0 },
      { from: 3, to: 4, records: 40, quotes: 38, edition: 0, derived: 2 },
      { from: 1, to: 4, records: 3, quotes: 0, edition: 0, derived: 3 },
    ],
  }

  const layout = layoutSourceGraph(graph, 'full')
  const byId = new Map(layout.units.map(unit => [unit.id, unit]))
  expect(byId.get(1)!.col).toBe(0)
  expect(byId.get(2)!.col).toBe(1)
  expect(byId.get(3)!.col).toBe(2)
  expect(byId.get(4)!.col).toBe(3)
  expect(byId.get(1)!.x).toBeLessThan(byId.get(2)!.x)
  expect(byId.get(2)!.x).toBeLessThan(byId.get(3)!.x)
  expect(byId.get(3)!.x).toBeLessThan(byId.get(4)!.x)

  const skip = layout.edges.find(edge => edge.from === 1 && edge.to === 4)!
  const heavy = layout.edges.find(edge => edge.from === 3 && edge.to === 4)!
  expect(skip.derivedOnly).toBe(true)
  expect(heavy.derivedOnly).toBe(false)
  expect(heavy.strokeWidth).toBeGreaterThan(skip.strokeWidth)
  expect(skip.labelX).toBeGreaterThan(byId.get(1)!.x)
  expect(skip.labelX).toBeLessThan(byId.get(4)!.x + byId.get(4)!.width)
  expect(skip.labelY).toBeGreaterThan(byId.get(1)!.y + byId.get(1)!.height)

  expect(new Set(layout.ancestors[4])).toEqual(new Set([1, 2, 3]))
  expect(new Set(layout.descendants[1])).toEqual(new Set([2, 3, 4]))
})

test('layoutSourceGraph breaks mutual-citation cycles deterministically by year and id', () => {
  const graph: SourceGraphData = {
    focusId: null,
    truncated: false,
    nodes: [
      makeNode({ id: 10, title: 'Earlier Work', year: 1600, records: 5 }),
      makeNode({ id: 20, title: 'Later Work', year: 1700, records: 8 }),
    ],
    edges: [
      { from: 10, to: 20, records: 5, quotes: 5, edition: 0, derived: 0 },
      { from: 20, to: 10, records: 1, quotes: 1, edition: 0, derived: 0 },
    ],
  }
  const layout = layoutSourceGraph(graph, 'strip')
  expect(layout.edges.filter(edge => edge.backEdge)).toHaveLength(1)
  expect(layout.edges.find(edge => edge.backEdge)!.from).toBe(20)
  expect(layout.edges.find(edge => edge.backEdge)!.to).toBe(10)
})

test('layoutSourceGraph routes skip-column arcs below taller intermediate columns', () => {
  const graph: SourceGraphData = {
    focusId: null,
    truncated: false,
    nodes: [
      makeNode({ id: 1, title: 'Root', year: 1500 }),
      makeNode({ id: 2, title: 'Mid A', year: 1600 }),
      makeNode({ id: 3, title: 'Mid B', year: 1610 }),
      makeNode({ id: 4, title: 'Mid C', year: 1620 }),
      makeNode({ id: 5, title: 'Leaf', year: 1700 }),
    ],
    edges: [
      { from: 1, to: 2, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 1, to: 3, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 1, to: 4, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 2, to: 5, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 3, to: 5, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 4, to: 5, records: 1, quotes: 1, edition: 0, derived: 0 },
      { from: 1, to: 5, records: 2, quotes: 2, edition: 0, derived: 0 },
    ],
  }
  const layout = layoutSourceGraph(graph, 'full')
  const midBottom = Math.max(...layout.units.filter(u => u.col === 1).map(u => u.y + u.height))
  const skip = layout.edges.find(edge => edge.from === 1 && edge.to === 5)!
  expect(skip.labelY).toBeGreaterThan(midBottom)
  expect(layout.height).toBeGreaterThan(skip.labelY)
})
