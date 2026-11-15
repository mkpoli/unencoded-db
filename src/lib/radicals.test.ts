import { expect, test } from 'bun:test'
import { filedUnder, fileRecord, parsePath, pathsOf, radicalPath, radicalStrokes, standing } from './radicals'

test('a description is filed under the radical of its head, through the characters on the way', () => {
  expect(radicalPath('⿰氵⿱艹男')).toEqual(['水'])
  expect(radicalPath('⿰口男')).toEqual(['口'])
  expect(radicalPath('⿰男求')).toEqual(['田', '男'])
  expect(radicalPath('⿱吅犬')).toEqual(['口', '吅'])
  expect(radicalPath('⿺克卡')).toEqual(['儿', '兄', '克'])
  expect(radicalPath('⿸尾巴')).toEqual(['尸', '尾'])
  expect(radicalPath('⿰钅滞')).toEqual(['金'])
})

test('a variation selector on a part leaves its radical alone', () => {
  expect(radicalPath('⿰氵\u{E0100}男')).toEqual(['水'])
  expect(radicalPath('⿱艹\uFE00男')).toEqual(radicalPath('⿱艹男'))
  expect(radicalPath('男\uFE00')).toEqual(['田'])
})

test('the first description counts, and a part without a radical is passed over', () => {
  expect(radicalPath('⿰口男 ⿰氵男')).toEqual(['口'])
  expect(radicalPath('⿰？男')).toEqual(['田', '男'])
  expect(radicalPath('⿰⺼尔')).toEqual(['肉'])
  expect(radicalPath('⿸ㄏ·')).toBeNull()
  // 𬼁 is described as ？ alone, which is no character on the way to its radical.
  expect(radicalPath('⿰𬼁口')).toEqual(['丿', '𬼁'])
  expect(parsePath('丿𬼁')).toBe('丿𬼁')
  expect(radicalPath('')).toBeNull()
  expect(radicalPath(null)).toBeNull()
})

test('a record that is one encoded character is filed with that character', () => {
  expect(radicalPath('噐')).toEqual(['口', '吅'])
  expect(radicalPath('男')).toEqual(['田'])
  expect(radicalPath('氵')).toEqual(['水'])
})

test('a stated radical stands unless the description leads further down its path', () => {
  expect(radicalPath('⿱吅犬', '口')).toEqual(['口', '吅'])
  expect(radicalPath('⿱吅犬', '山')).toEqual(['山'])
  expect(radicalPath('⿱糞土', '糞部')).toEqual(['米', '糞'])
  expect(radicalPath(null, '氵')).toEqual(['水'])
  expect(radicalPath('⿰口男', 'mouth')).toEqual(['口'])
})

test('a record names the path of the radical it states', () => {
  expect(fileRecord('⿱糞土', '糞')).toEqual({ path: ['米', '糞'], stated: '米糞' })
  expect(fileRecord('⿱吅犬', '口')).toEqual({ path: ['口', '吅'], stated: '口' })
  expect(fileRecord('⿱吅犬')).toEqual({ path: ['口', '吅'], stated: null })
  expect(fileRecord('⿰口男', 'mouth')).toEqual({ path: ['口'], stated: null })
  expect(fileRecord(null, '部')?.path[0]).toBe('邑')
  expect(fileRecord(null, null)).toBeNull()
})

test('a stated character without a Kangxi radical is a radical of its own', () => {
  expect(fileRecord('⿸ㄏ·', 'ㄏ')).toEqual({ path: ['ㄏ'], stated: 'ㄏ' })
  expect(radicalPath('⿰口男', 'ㄏ部')).toEqual(['ㄏ'])
  expect(radicalPath('⿰口男', '㇇')).toEqual(['㇇'])
  expect(radicalPath('⿰口男', 'a')).toEqual(['口'])
  expect(radicalPath('⿰口男', '1')).toEqual(['口'])
  expect(parsePath('ㄏ')).toBe('ㄏ')
  expect(parsePath('ㄏ口')).toBeNull()
  expect(parsePath('a')).toBeNull()
  expect(radicalStrokes('ㄏ')).toBeNull()
})

test('a stated path stands whatever it holds, and radicals outside the Kangxi set come last', () => {
  const counts = new Map([['田', 5], ['田男', 2], ['米', 3], ['米糞', 1], ['ㄏ', 1], ['龠', 1]])
  expect(standing(counts).map(branch => [branch.path, branch.branches.length])).toEqual([['田', 0], ['米', 0], ['龠', 0], ['ㄏ', 0]])
  const found = standing(counts, new Set(['田男', 'ㄏ']))
  expect(found.map(branch => branch.path)).toEqual(['田', '米', '龠', 'ㄏ'])
  expect(found[0].branches).toEqual([{ path: '田男', radical: '男', records: 2, branches: [] }])
  expect(filedUnder(['田', '男'], counts, new Set(['田男'])).map(branch => branch.radical)).toEqual(['田', '男'])
  expect(filedUnder(['米', '糞'], counts, new Set(['田男'])).map(branch => branch.radical)).toEqual(['米'])
})

test('a path names itself and each path above it', () => {
  expect(pathsOf(['儿', '兄', '克'])).toEqual(['儿', '儿兄', '儿兄克'])
  expect(parsePath('儿兄克')).toBe('儿兄克')
  expect(parsePath('克')).toBeNull()
  expect(parsePath('口a')).toBeNull()
  expect(parsePath('')).toBeNull()
  expect(parsePath('口'.repeat(9))).toBeNull()
  expect(radicalStrokes('口')).toBe(3)
  expect(radicalStrokes('龠')).toBe(17)
})

test('a branch stands on the records that stay in it, and the radicals come in Kangxi order', () => {
  const counts = new Map([['口', 30], ['口吅', 14], ['口吅㗊', 10], ['儿', 38], ['儿兄', 25], ['儿兄克', 24], ['儿兀', 10], ['一', 2], ['八', 9], ['八公', 9]])
  const found = standing(counts)
  expect(found.map(branch => branch.path)).toEqual(['一', '儿', '八', '口'])
  // 兄 keeps one record once 克 is taken out, and 吅 four once 㗊 is.
  expect(found[1].branches.map(branch => [branch.path, branch.records])).toEqual([['儿兄克', 24], ['儿兀', 10]])
  expect(found[2].branches).toEqual([])
  expect(found[3].branches.map(branch => branch.path)).toEqual(['口吅㗊'])
  expect(filedUnder(['儿', '兄', '克'], counts).map(branch => branch.radical)).toEqual(['儿', '克'])
  expect(filedUnder(['儿', '兄'], counts).map(branch => branch.radical)).toEqual(['儿'])
  expect(filedUnder(['口', '吅'], counts).map(branch => branch.radical)).toEqual(['口'])
  expect(filedUnder(['山'], counts)).toEqual([])
})
