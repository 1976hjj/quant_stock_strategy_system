import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import { defaultAllocation, calculateAllocation, allocationScenario, estimateCycle, CycleEstimate } from '../.quality-test-build/allocation/allocation-entry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const plan = input => {
  const calculated = calculateAllocation(input)
  assert.deepEqual(calculated.errors, [])
  return calculated.result
}
const near = (a, b, tolerance = .03) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

test('one completed round adds each contribution without counting factor cash twice', () => {
  const input = allocationScenario(defaultAllocation(), ['dividend', 'factor', 'growth'])
  const allocation = plan(input), estimate = estimateCycle(input, allocation)
  const byId = Object.fromEntries(estimate.rows.map(row => [row.id, row]))
  near(byId.dividend.profit, allocation.rows[0].targetEquity / 9)
  near(byId.factor.profit, allocation.rows[1].budget * .15)
  near(byId.growth.profit, allocation.rows[2].targetEquity)
  near(byId.bond.profit, allocation.targetBond * .025)
  near(byId.cash.principal, 20000)
  near(estimate.rows.reduce((sum, row) => sum + row.principal, 0), allocation.capital)
  near(estimate.endWealth, allocation.capital + estimate.totalProfit)
  near(estimate.totalReturn, estimate.totalProfit / allocation.capital, 1e-10)
})

test('waiting strategies earn no target stock profit and their budgets remain in bonds', () => {
  const input = defaultAllocation(), allocation = plan(input)
  const estimate = estimateCycle(input, allocation)
  for (const id of ['dividend', 'growth']) {
    const row = estimate.rows.find(r => r.id === id)
    assert.equal(row.principal, 0)
    assert.equal(row.profit, 0)
  }
  near(estimate.rows.find(r => r.id === 'bond').principal, allocation.targetBond)
  near(estimate.rows.reduce((sum, row) => sum + row.principal, 0), allocation.capital)
})

test('six months compounds annual assumptions while each ETF completes only one round', () => {
  const input = allocationScenario(defaultAllocation(), ['dividend', 'factor', 'growth'])
  const full = estimateCycle(input, plan(input))
  input.estimateMonths = '6'
  const half = estimateCycle(input, plan(input))
  near(half.rows[1].returnRate, Math.sqrt(1.15) - 1, 1e-10)
  near(half.rows[3].returnRate, Math.sqrt(1.025) - 1, 1e-10)
  assert.equal(half.rows[0].profit, full.rows[0].profit)
  assert.equal(half.rows[2].profit, full.rows[2].profit)
})

test('legacy saved configurations use twelve months and fifteen percent without changing budgets', () => {
  const input = defaultAllocation(), allocation = plan(input)
  const current = estimateCycle(input, allocation)
  delete input.estimateMonths; delete input.factorAnnualReturnPct
  assert.deepEqual(estimateCycle(input, plan(input)), current)
  input.estimateMonths = '24'; input.factorAnnualReturnPct = '-10'
  assert.deepEqual(plan(input), allocation)
  assert.ok(estimateCycle(input, allocation).rows[1].profit < 0)
})

test('invalid estimate fields suppress totals but remain visible and editable', async () => {
  let input = defaultAllocation(), tree
  const render = () => React.createElement(CycleEstimate, { input, plan: calculateAllocation(input).result,
    onChange: (key, value) => { input = { ...input, [key]: value }; tree.update(render()) } })
  try {
    await act(async () => { tree = renderer.create(render()) })
    const field = () => tree.root.findByProps({ 'aria-label': '目标估算周期（月）' })
    await act(async () => field().props.onChange({ target: { value: '' } }))
    assert.equal(field().props.value, '')
    assert.equal(tree.root.findAllByType('table').length, 0)
    await act(async () => field().props.onChange({ target: { value: '24' } }))
    assert.equal(tree.root.findAllByType('table').length, 1)
    for (const [key, value] of [['estimateMonths', '0'], ['estimateMonths', 'Infinity'], ['factorAnnualReturnPct', ''], ['factorAnnualReturnPct', '-100']]) {
      assert.equal(calculateAllocation({ ...defaultAllocation(), [key]: value }).result, null)
    }
  } finally { if (tree) await act(async () => tree.unmount()) }
})
