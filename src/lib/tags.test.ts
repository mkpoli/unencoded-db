import { expect, test } from 'bun:test'
import { arrangeTags, tagDepths, tagParents, type Tag, type TagGroup } from './tags'

const tag = (name: string, implies: string[] = [], extra: Partial<Tag> = {}): Tag => ({ name, label: name, type: 'script', position: 0, rev: 1, n: 0, implies, group: null, aliases: [], names: {}, notes: {}, ...extra })

test('a tag stands under the tag of its own type it implies, at any depth', () => {
  const tags = [tag('方塊苗文'), tag('板塘', ['方塊苗文']), tag('古丈', ['方塊苗文']), tag('板塘甲', ['板塘']), tag('板塘甲一', ['板塘甲'])]
  const parents = tagParents(tags)
  expect(Object.fromEntries(parents)).toEqual({ 板塘: '方塊苗文', 古丈: '方塊苗文', 板塘甲: '板塘', 板塘甲一: '板塘甲' })
  expect(Object.fromEntries(tagDepths(tags, parents))).toEqual({ 方塊苗文: 0, 板塘: 1, 古丈: 1, 板塘甲: 2, 板塘甲一: 3 })
  // Each shelf lists a tag, then its children, depth first.
  expect(arrangeTags(tags, [])[0].shelves[0].tags.map(item => item.name)).toEqual(['方塊苗文', '古丈', '板塘', '板塘甲', '板塘甲一'])
})

test('of several parents a tag sits under the deepest, and an implied tag of another type stays an implication', () => {
  const tags = [
    tag('略字', [], { type: 'form' }),
    tag('大陸簡體字', ['略字', '大陸'], { type: 'form' }),
    tag('大陸二簡字', ['略字', '大陸簡體字', '大陸'], { type: 'form' }),
    tag('大陸', [], { type: 'region' }),
  ]
  expect(Object.fromEntries(tagParents(tags))).toEqual({ 大陸簡體字: '略字', 大陸二簡字: '大陸簡體字' })
  const form = arrangeTags(tags, []).find(section => section.type === 'form')!
  expect(form.shelves[0].tags.map(item => item.name)).toEqual(['略字', '大陸簡體字', '大陸二簡字'])
})

test('a child is listed on the shelf of its root, whatever its own group', () => {
  const groups: TagGroup[] = [{ id: 1, type: 'form', label: '合字', names: {}, position: 0, rev: 1 }]
  const tags = [tag('合字', [], { type: 'form', group: 1 }), tag('單純合字', ['合字'], { type: 'form' }), tag('豎排合字', ['單純合字'], { type: 'form' }), tag('俗字', [], { type: 'form' })]
  const shelves = arrangeTags(tags, groups).find(section => section.type === 'form')!.shelves
  expect(shelves.map(shelf => [shelf.group?.label ?? null, shelf.tags.map(item => item.name)])).toEqual([['合字', ['合字', '單純合字', '豎排合字']], [null, ['俗字']]])
})

test('a parent missing from the list leaves its child a root', () => {
  const tags = [tag('板塘', ['方塊苗文'])]
  expect(tagParents(tags).size).toBe(0)
  expect(arrangeTags(tags, [])[0].shelves[0].tags.map(item => item.name)).toEqual(['板塘'])
})
