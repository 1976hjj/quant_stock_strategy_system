import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import { DividendDrawdown } from '../.quality-test-build/allocation/allocation-entry.js'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const observation = (dd = -.0048270313757) => ({ code: '512890', as_of: '2026-11-02', close: 1.237, peak_close: 1.243, peak_date: '2026-10-30', drawdown: dd, checked_at: '2026-11-03T09:00:00+00:00', timing_note: '最新完整收盘，非盘中实时回撤', source: 'fixture' })

test('displays measured drawdown with quote date; refreshing issues a fresh no-store read', async () => {
  const previous = globalThis.fetch; let tree; const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => observation(calls.length === 1 ? -.0048270313757 : 0) } }
  try {
    await act(async () => { tree = renderer.create(React.createElement(DividendDrawdown, { triggerPct: '10' })); await Promise.resolve() })
    assert.match(JSON.stringify(tree.toJSON()), /-0.48%/)
    assert.match(JSON.stringify(tree.toJSON()), /2026-11-02/)
    assert.match(JSON.stringify(tree.toJSON()), /未达到/)
    assert.equal(calls[0].options.cache, 'no-store')
    await act(async () => { tree.root.findByType('button').props.onClick(); await Promise.resolve() })
    assert.equal(calls.length, 2)
    assert.match(JSON.stringify(tree.toJSON()), /0.00%/)
    assert.match(JSON.stringify(tree.toJSON()), /不是新的回撤入场信号/)
    await act(async () => tree.unmount()); tree = null
    await act(async () => { tree = renderer.create(React.createElement(DividendDrawdown, { triggerPct: '10' })); await Promise.resolve() })
    assert.equal(calls.length, 3)
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.fetch = previous }
})

test('source failures or malformed data show unavailable, not a fabricated zero', async () => {
  const previous = globalThis.fetch; let tree
  try {
    for (const response of [{ ok: false, json: async () => ({ detail: '两个来源不一致' }) }, { ok: true, json: async () => ({ code: '512890' }) }]) {
      globalThis.fetch = async () => response
      await act(async () => { tree = renderer.create(React.createElement(DividendDrawdown, { triggerPct: '10' })); await Promise.resolve() })
      assert.match(JSON.stringify(tree.toJSON()), /无法取得当前回撤/)
      assert.doesNotMatch(JSON.stringify(tree.toJSON()), /0.00%/)
      await act(async () => tree.unmount()); tree = null
    }
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.fetch = previous }
})
