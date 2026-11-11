import { describe, expect, test } from 'bun:test'
import { boxFromPoints, edgeBounds, edges, moveEdge } from './crop'

describe('crop edges', () => {
  test('start at the image boundaries and create a box', () => {
    expect(edges(null, 100, 80)).toEqual({ left: 0, top: 0, right: 100, bottom: 80 })
    expect(moveEdge('left', 12, null, 100, 80)).toEqual([12, 0, 88, 80])
  })

  test('each edge moves independently in prepared-image pixels', () => {
    const box: [number, number, number, number] = [10, 20, 50, 40]
    expect(moveEdge('left', 15, box, 100, 100)).toEqual([15, 20, 45, 40])
    expect(moveEdge('top', 25, box, 100, 100)).toEqual([10, 25, 50, 35])
    expect(moveEdge('right', 75, box, 100, 100)).toEqual([10, 20, 65, 40])
    expect(moveEdge('bottom', 80, box, 100, 100)).toEqual([10, 20, 50, 60])
  })

  test('edges remain inside the image and cannot cross', () => {
    const box: [number, number, number, number] = [10, 20, 50, 40]
    expect(edgeBounds('left', box, 100, 100)).toEqual([0, 56])
    expect(edgeBounds('bottom', box, 100, 100)).toEqual([24, 100])
    expect(moveEdge('left', 1000, box, 100, 100)).toEqual([56, 20, 4, 40])
    expect(moveEdge('bottom', -10, box, 100, 100)).toEqual([10, 20, 50, 4])
    expect(moveEdge('right', 500, box, 100, 100)).toEqual([10, 20, 90, 40])
  })

  test('returning every edge to the image boundary clears the box', () => {
    expect(moveEdge('left', 0, [1, 0, 99, 80], 100, 80)).toBeNull()
    expect(moveEdge('right', 100, [0, 0, 99, 80], 100, 80)).toBeNull()
  })

  test('pointer corners round and clamp before deriving dimensions', () => {
    expect(boxFromPoints({ x: 0.015, y: 0.015 }, { x: 1, y: 1 }, 100, 100)).toEqual([2, 2, 98, 98])
    expect(boxFromPoints({ x: 1.2, y: 0.75 }, { x: -0.2, y: 0.25 }, 100, 100)).toEqual([0, 25, 100, 50])
  })

  test('adjustment clamps an untouched overflowing edge', () => {
    expect(moveEdge('top', 10, [1, 0, 100, 100], 100, 100)).toEqual([1, 10, 99, 90])
    expect(moveEdge('left', 5, [0, 1, 100, 100], 100, 100)).toEqual([5, 1, 95, 99])
  })

  test('small images retain their full available extent', () => {
    expect(edgeBounds('left', null, 2, 3)).toEqual([0, 0])
    expect(moveEdge('bottom', 0, null, 2, 3)).toBeNull()
  })
})
