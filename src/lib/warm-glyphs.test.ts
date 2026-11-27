import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { addressesOf, ask, keyOf, KEY_PREFIX, warm, type Addresses } from '../../scripts/warm-glyphs'
import { composerDrawing, GLYPH_STYLES } from './composer'
import { glyphAddress } from './glyph-address'

const origin = 'https://example.test'
const records = [{ ids: '⿰山東', layout: null }, { ids: '⿱日木', layout: '{"0":[1,0,0,1,40,0]}' }, { ids: '⿰山東', layout: null }]
const undrawable = () => Response.json({ undrawable: true }, { status: 404 })

// A site answering each address with the next of its answers, and repeating the last.
function site(answers: Record<string, (() => Response)[]> = {}) {
  const asked: string[] = [], pauses: number[] = []
  const get = async (url: string) => {
    asked.push(url)
    const left = answers[url]
    return left ? (left.length > 1 ? left.shift()! : left[0])() : Response.json({ d: 'M0 0' })
  }
  return { asked, pauses, options: { get, pause: async (ms: number) => { pauses.push(ms) }, log: () => {} } }
}

test('each style has one address for each drawing', () => {
  const addresses = addressesOf(records)
  expect(Object.keys(addresses)).toEqual([...GLYPH_STYLES])
  for (const style of GLYPH_STYLES) {
    expect(addresses[style]).toEqual([glyphAddress('⿰山東', null, style), glyphAddress('⿱日木', records[1].layout, style)])
    expect(addresses[style][0]).toContain(encodeURIComponent(composerDrawing(style)))
  }
})

test('the key names the set of addresses, whatever their order', () => {
  const key = keyOf(addressesOf(records))
  expect(key).toMatch(/^warm-glyphs-v1-[0-9a-f]{64}$/)
  expect(keyOf(addressesOf([...records].reverse()))).toBe(key)
  expect(keyOf(addressesOf([...records, { ids: '⿰木木', layout: null }]))).not.toBe(key)
  expect(keyOf(addressesOf([records[0], { ...records[1], layout: null }]))).not.toBe(key)
  // Another export or composer is another address, and so another key.
  const other = Object.fromEntries(GLYPH_STYLES.map(style => [style, addressesOf(records)[style].map(address => address.replace('&v=', '&v=next-'))])) as Addresses
  expect(keyOf(other)).not.toBe(key)
})

test('a drawing settles its address at once', async () => {
  const { asked, options } = site()
  expect(await ask(`${origin}/a`, options)).toBe('drawn')
  expect(asked).toEqual([`${origin}/a`])
})

test('a description the composer cannot draw settles its address without another request', async () => {
  const { asked, pauses, options } = site({ [`${origin}/a`]: [undrawable] })
  expect(await ask(`${origin}/a`, options)).toBe('undrawable')
  expect(asked.length).toBe(1)
  expect(pauses).toEqual([])
})

test('any other 404 is final and leaves the address open', async () => {
  const { asked, options } = site({ [`${origin}/a`]: [() => new Response(null, { status: 404 })], [`${origin}/b`]: [() => Response.json({ d: null }, { status: 404 })] })
  expect(await ask(`${origin}/a`, options)).toBe(404)
  expect(await ask(`${origin}/b`, options)).toBe(404)
  expect(asked.length).toBe(2)
})

test('storage that fails is asked again, three times in all', async () => {
  const down = () => new Response(null, { status: 503 })
  const failing = site({ [`${origin}/a`]: [down] })
  expect(await ask(`${origin}/a`, failing.options)).toBe(503)
  expect(failing.asked.length).toBe(3)
  expect(failing.pauses).toEqual([3000, 3000])
  const recovering = site({ [`${origin}/a`]: [down, () => { throw new Error('reset') }, () => Response.json({ d: 'M0 0' })] })
  expect(await ask(`${origin}/a`, recovering.options)).toBe('drawn')
  expect(recovering.asked.length).toBe(3)
})

test('a rate limit is waited out as it asks, up to a minute', async () => {
  const limited = (after: string) => () => new Response(null, { status: 429, headers: { 'retry-after': after } })
  const { pauses, options } = site({ [`${origin}/a`]: [limited('7'), limited('600'), () => Response.json({ d: 'M0 0' })] })
  expect(await ask(`${origin}/a`, options)).toBe('drawn')
  expect(pauses).toEqual([7000, 60_000])
})

test('a run asks only for the addresses no earlier run settled', async () => {
  const addresses = addressesOf(records)
  const first = site()
  const whole = await warm(origin, addresses, [], first.options)
  expect(first.asked.length).toBe(10)
  expect(whole.unwarmed).toEqual([])
  expect(new Set(whole.settled)).toEqual(new Set(GLYPH_STYLES.flatMap(style => addresses[style])))
  const again = site()
  expect(await warm(origin, addresses, whole.settled, again.options)).toEqual({ settled: whole.settled, unwarmed: [] })
  expect(again.asked).toEqual([])
  const more = addressesOf([...records, { ids: '⿰木木', layout: null }])
  const next = site()
  const grown = await warm(origin, more, whole.settled, next.options)
  expect(next.asked).toEqual(GLYPH_STYLES.map(style => origin + glyphAddress('⿰木木', null, style)))
  expect(grown.settled.length).toBe(15)
})

test('the settled list holds only addresses still wanted', async () => {
  const addresses = addressesOf(records.slice(0, 1))
  const { asked, options } = site()
  const { settled } = await warm(origin, addresses, [...addresses.sans, '/api/glyph?ids=gone&v=old'], options)
  expect(asked.length).toBe(4)
  expect(new Set(settled)).toEqual(new Set(GLYPH_STYLES.flatMap(style => addresses[style])))
})

test('descriptions the composer cannot draw are settled and do not fail the run', async () => {
  const addresses = addressesOf(records)
  const { asked, options } = site(Object.fromEntries(GLYPH_STYLES.flatMap(style => addresses[style].map(address => [origin + address, [undrawable]]))))
  const { settled, unwarmed } = await warm(origin, addresses, [], options)
  expect(unwarmed).toEqual([])
  expect(settled.length).toBe(10)
  expect(asked.length).toBe(10)
})

test('a style mostly unanswered fails the run, and its open addresses stay unsettled', async () => {
  const addresses = addressesOf(records)
  const { options } = site(Object.fromEntries(addresses.serif.map(address => [origin + address, [() => new Response(null, { status: 503 })]])))
  const { settled, unwarmed } = await warm(origin, addresses, [], options)
  expect(unwarmed).toEqual(['serif'])
  expect(settled.some(address => address.includes('style=serif'))).toBe(false)
  expect(settled.length).toBe(8)
})

test('a few open addresses leave the run completed and are asked again by the next', async () => {
  const many = addressesOf(Array.from({ length: 40 }, (_, i) => ({ ids: `⿰山${String.fromCodePoint(0x4e00 + i)}`, layout: null })))
  const open = origin + many.sans[0]
  const { options } = site({ [open]: [() => new Response(null, { status: 503 })] })
  const { settled, unwarmed } = await warm(origin, many, [], options)
  expect(unwarmed).toEqual([])
  expect(settled).not.toContain(many.sans[0])
  const next = site()
  await warm(origin, many, settled, next.options)
  expect(next.asked).toEqual([open])
})

type Step = { id?: string; if?: string; run?: string; uses?: string; with?: Record<string, string> }
const workflow = Bun.YAML.parse(readFileSync(new URL('../../.github/workflows/warm-glyphs.yml', import.meta.url), 'utf8')) as { jobs: { warm: { steps: Step[] } } }
const steps = workflow.jobs.warm.steps
const at = (match: (step: Step) => boolean) => steps.findIndex(match)

test('the workflow warms only when the planned key was not kept by a completed run', () => {
  const plan = at(step => step.run?.includes('warm-glyphs.ts plan') ?? false)
  const restore = at(step => step.uses?.startsWith('actions/cache/restore@') ?? false)
  const run = at(step => step.run?.includes('warm-glyphs.ts warm') ?? false)
  const save = at(step => step.uses?.startsWith('actions/cache/save@') ?? false)
  expect([plan, restore, run, save].every(index => index >= 0)).toBe(true)
  expect(plan < restore && restore < run && run < save).toBe(true)
  const key = `\${{ steps.${steps[plan].id}.outputs.key }}`
  expect(steps[restore].with?.key).toBe(key)
  expect(steps[save].with?.key).toBe(key)
  // An earlier list is found by what every key starts with.
  expect(steps[restore].with?.['restore-keys']).toBe(KEY_PREFIX)
  const missed = `steps.${steps[restore].id}.outputs.cache-hit != 'true'`
  expect(steps[run].if).toBe(missed)
  // No status function, so the save is skipped once any step before it failed or the run was cancelled.
  expect(steps[save].if).toBe(missed)
  expect(steps[restore].with?.path).toBe(steps[save].with?.path)
})

test('the plan and the run share the folder the settled list is kept in', () => {
  const folder = (command: string) => steps.find(step => step.run?.includes(`warm-glyphs.ts ${command}`))!.run!.split(' ').at(-1)!
  expect(folder('plan')).toBe(folder('warm'))
  expect(steps.find(step => step.uses?.startsWith('actions/cache/save@'))!.with?.path).toBe(`${folder('warm')}/settled.json`)
})
