import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import { defaultAllocation, calculateAllocation, allocationScenario, restoreAllocation, ALLOCATION_KEY, CapitalAllocation, invalidateQualityReads } from '../.quality-test-build/allocation/allocation-entry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => invalidateQualityReads())
const result = input => {
  const r = calculateAllocation(input)
  assert.deepEqual(r.errors, [])
  assert.ok(r.result)
  return r.result
}
const near = (left, right, tolerance = .03) => assert.ok(Math.abs(left - right) < tolerance, `${left} != ${right}`)

test('default risk budget constrains simultaneous exposure, while only factor is active', () => {
  const r = result(defaultAllocation())
  assert.ok(r.allActiveStressLoss <= r.bufferedBudget + .02)
  assert.equal(r.riskBudget, 150000)
  assert.equal(r.bufferedBudget, 130000)
  assert.equal(r.currentEquity, 100000)
  assert.equal(r.rows.find(x => x.id === 'dividend').targetEquity, 0)
  assert.equal(r.rows.find(x => x.id === 'growth').targetEquity, 0)
  assert.ok(r.rows.find(x => x.id === 'factor').targetEquity > 0)
  assert.ok(r.permanentReserve >= 400000)
})

test('all scenarios conserve money and never double count parked strategy budgets', () => {
  const input = defaultAllocation()
  for (const active of [[], ['factor'], ['factor', 'dividend'], ['factor', 'growth'], ['dividend', 'factor', 'growth']]) {
    const r = result(allocationScenario(input, active))
    near(r.targetEquity + r.targetCash + r.targetBond, r.capital)
    near(r.currentEquity + r.currentCash + r.currentBond, r.capital)
    near(r.currentBond - r.redeem + r.subscribe, r.targetBond)
    near(r.currentCash + r.sells + r.redeem - r.buys - r.subscribe, r.targetCash)
    near(r.permanentReserve + r.rows.reduce((s, x) => s + x.budget, 0), r.capital)
    assert.ok(r.targetBond >= 0 && r.targetCash >= 0)
    near(r.rows.reduce((s, x) => s + x.parkedBudget, 0) + r.permanentReserve - Number(input.cashBufferPct) / 100 * r.capital, r.targetBond)
  }
})

test('factor internal cash is separate from stock exposure and bond balance', () => {
  const r = result(defaultAllocation())
  const factor = r.rows.find(x => x.id === 'factor')
  near(factor.targetEquity, factor.budget * .882)
  near(factor.internalCash + factor.targetEquity, factor.budget)
  near(r.targetCash, 20000 + factor.internalCash)
})

test('manual over-budget scenario remains visible with an explicit risk warning', () => {
  const input = defaultAllocation()
  input.mode = 'MANUAL'
  input.sleeves.forEach(s => { s.manualPct = '30' })
  const r = result(allocationScenario(input, ['dividend', 'factor', 'growth']))
  assert.equal(r.worstBudgetWithinLimit, false)
  assert.ok(r.warningMessages.some(m => m.includes('超过回撤预算')))
  assert.ok(r.warningMessages.some(m => m.includes('稳定资金下限')))
})

test('liquidity is actual cash; pending redemptions do not fund immediate purchases', () => {
  const input = defaultAllocation()
  input.currentCashPct = '0'
  input.sleeves.forEach(s => { s.currentPct = '0' })
  const r = result(allocationScenario(input, ['dividend', 'factor', 'growth']))
  near(r.redeem, r.buys + r.targetCash)
  near(r.unfundedNow, r.buys)
  assert.ok(r.warningMessages.some(m => m.includes('实际可用')))
})

test('exit returns stock proceeds to safe assets, without automatic cross-strategy buying', () => {
  const input = allocationScenario(defaultAllocation(), [])
  input.sleeves.find(s => s.id === 'factor').state = 'EXIT'
  const r = result(input)
  assert.equal(r.sells, 100000)
  assert.equal(r.buys, 0)
  assert.equal(r.redeem, 0)
  assert.equal(r.subscribe, 130000)
  assert.equal(r.targetCash, 20000)
  assert.equal(r.targetBond, 980000)
})

test('lower tolerable drawdown or larger buffer does not enlarge recommended risk budgets', () => {
  const input = defaultAllocation()
  const old = result(input)
  input.maxDrawdownPct = '10'
  const lower = result(input)
  assert.ok(lower.allActiveEquity < old.allActiveEquity)
  input.bufferPct = '3'
  assert.ok(result(input).allActiveEquity < lower.allActiveEquity)
})

test('unrealistic stable-asset shock cannot masquerade as a successful risk fit', () => {
  const input = defaultAllocation()
  input.bondStressPct = '25'
  const r = result(input)
  assert.equal(r.worstBudgetWithinLimit, false)
  assert.ok(r.warningMessages.some(m => m.includes('无法生成')))
})

test('changing total equity updates budgets without inventing or annualising a return', () => {
  const input = defaultAllocation()
  const first = result(input)
  input.capital = '1100000'
  const second = result(input)
  near(second.rows[0].budget, first.rows[0].budget * 1.1)
  input.bondYieldPct = '3'
  const third = result(input)
  near(second.targetEquity, third.targetEquity)
  assert.equal(Object.hasOwn(third, 'expectedPortfolioReturn'), false)
})

test('scenario changes preserve actual holdings and chosen factor identity', () => {
  const input = defaultAllocation()
  input.factorStrategyId = 'factor-sharpe-quarter10'
  const next = allocationScenario(input, ['dividend', 'factor'])
  assert.equal(next.factorStrategyId, input.factorStrategyId)
  assert.deepEqual(next.sleeves.map(x => x.currentPct), input.sleeves.map(x => x.currentPct))
  assert.equal(input.sleeves.find(x => x.id === 'dividend').state, 'WAITING')
})

test('invalid amounts, percentages, blank fields and non-finite numbers suppress output', () => {
  for (const [key, value] of [['capital', ''], ['capital', '-1'], ['capital', 'Infinity'], ['maxDrawdownPct', 'NaN'], ['maxDrawdownPct', '0'], ['redemptionDays', '1.5'], ['cashBufferPct', '101'], ['growthEntryPrice', '0']]) {
    const input = { ...defaultAllocation(), [key]: value }
    const r = calculateAllocation(input)
    assert.equal(r.result, null, `${key}=${value}`)
    assert.ok(r.errors.length > 0)
  }
  const input = defaultAllocation()
  input.currentCashPct = '99'
  assert.equal(calculateAllocation(input).result, null)
  input.currentCashPct = '0'; input.mode = 'MANUAL'; input.sleeves.forEach(s => { s.manualPct = '40' })
  assert.equal(calculateAllocation(input).result, null)
})

test('zero preferences, duplicate strategies and buffer above loss limit are rejected', () => {
  const empty = defaultAllocation(); empty.sleeves.forEach(s => { s.preference = '0' })
  assert.equal(calculateAllocation(empty).result, null)
  const duplicate = defaultAllocation(); duplicate.sleeves[1].id = 'dividend'
  assert.equal(calculateAllocation(duplicate).result, null)
  const badBuffer = { ...defaultAllocation(), bufferPct: '16' }
  assert.equal(calculateAllocation(badBuffer).result, null)
})

test('manual budgets do not depend on preference weights and tiny accounts never produce negative cash', () => {
  const manual = defaultAllocation(); manual.mode = 'MANUAL'; manual.sleeves.forEach(s => { s.preference = '0' })
  assert.ok(calculateAllocation(manual).result)
  const tiny = defaultAllocation(); tiny.capital = '1'; tiny.currentCashPct = '0'
  tiny.sleeves[0].currentPct = '66.66'; tiny.sleeves[1].currentPct = '16.67'; tiny.sleeves[2].currentPct = '16.67'
  assert.equal(calculateAllocation(tiny).result, null)
})

test('stored plans are validated; malformed or old versions recover with a visible message', () => {
  const input = defaultAllocation(); input.capital = '2000000'
  assert.deepEqual(restoreAllocation(JSON.stringify(input)).input, input)
  for (const raw of ['{bad', 'null', '{"version":3}', JSON.stringify({ ...input, capital: '-1' })]) {
    const restored = restoreAllocation(raw)
    assert.deepEqual(restored.input, defaultAllocation())
    assert.ok(restored.message)
  }
})

test('UI exposes strategy identity and recalculates scenarios using only read requests', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  const storage = new Map(), calls = []
  globalThis.window = { localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) } }
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/capital-allocation/settings')) return { ok: true, json: async () => ({ config: null, revision: null, saved_at: null }) }
    return { ok: true, json: async () => ({ items: [{ strategy_id: 'factor-sharpe-quarter-missing-tp50-main-chinext10', name: '选定季度10股策略', category: 'FACTOR_WEIGHTED', target_count: 10, schedule: 'QUARTER' }] }) }
  }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    const text = () => JSON.stringify(tree.toJSON())
    assert.match(text(), /512890/); assert.match(text(), /159915/); assert.match(text(), /选定季度10股策略/)
    assert.equal(calls.length, 3); assert.ok(calls.every(c => !c.options || !c.options.method || c.options.method === 'GET'))
    const before = JSON.parse(storage.get(ALLOCATION_KEY))
    assert.equal(before.sleeves.find(s => s.id === 'growth').state, 'WAITING')
    const switches = tree.root.findAllByType('button').filter(b => b.children.join('') === '查看分配 →')
    await act(async () => switches[3].props.onClick())
    const after = JSON.parse(storage.get(ALLOCATION_KEY))
    assert.ok(after.sleeves.every(s => s.state === 'ACTIVE'))
    assert.deepEqual(after.sleeves.map(s => s.currentPct), before.sleeves.map(s => s.currentPct))
    assert.ok(result(after).targetEquity > result(before).targetEquity)
    const capital = tree.root.findByProps({ 'aria-label': '现有总资金' })
    await act(async () => capital.props.onChange({ target: { value: '' } }))
    assert.ok(tree.root.findByProps({ role: 'alert' }))
    assert.equal(tree.root.findAllByProps({ 'aria-label': '资金规划摘要' }).length, 0)
    assert.equal(JSON.parse(storage.get(ALLOCATION_KEY)).capital, '1000000')
  } finally {
    if (tree) await act(async () => tree.unmount())
    globalThis.window = oldWindow; globalThis.fetch = oldFetch
  }
})

test('offline strategy catalogue leaves calculator usable and labels the read limitation', async () => {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch
  globalThis.window = { localStorage: { getItem: () => null, setItem() {} } }
  globalThis.fetch = async () => { throw new Error('offline') }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    assert.match(JSON.stringify(tree.toJSON()), /策略目录暂不可用/)
    assert.ok(tree.root.findByProps({ 'aria-label': '资金规划摘要' }))
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = oldWindow; globalThis.fetch = oldFetch }
})
