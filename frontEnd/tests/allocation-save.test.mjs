import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import { CapitalAllocation, defaultAllocation, invalidateQualityReads } from '../.quality-test-build/allocation/allocation-entry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(() => invalidateQualityReads())
const time = '2026-11-03T09:00:00+00:00'
const record = (config, revision = 'a'.repeat(32)) => ({ config, revision, saved_at: time })
const button = (tree, text) => tree.root.findAllByType('button').find(b => b.children.join('') === text)
const field = tree => tree.root.findByProps({ 'aria-label': '现有总资金' })
const setup = () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch }
  const storage = new Map()
  globalThis.window = { localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) } }
  return () => { globalThis.window = previous.window; globalThis.fetch = previous.fetch }
}

test('save persists exact input and a new mount restores backend config without browser storage', async () => {
  const cleanup = setup(); let tree; let saved = record({ ...defaultAllocation(), capital: '2000000' }); const posts = []
  globalThis.fetch = async (url, options) => {
    if (!String(url).endsWith('/capital-allocation/settings')) return { ok: true, json: async () => ({ items: [] }) }
    if (options?.method === 'POST') {
      const p = JSON.parse(options.body); posts.push(p)
      assert.equal(p.expected_revision, saved.revision)
      saved = record(p.config, 'b'.repeat(32))
    }
    return { ok: true, json: async () => saved }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    assert.equal(field(tree).props.value, '2000000')
    assert.match(JSON.stringify(tree.toJSON()), /已保存/)
    await act(async () => field(tree).props.onChange({ target: { value: '3000000' } }))
    await act(async () => tree.root.findByProps({ 'aria-label': '目标估算周期（月）' }).props.onChange({ target: { value: '24' } }))
    await act(async () => tree.root.findByProps({ 'aria-label': '因子账户假设年化（%）' }).props.onChange({ target: { value: '12' } }))
    assert.match(JSON.stringify(tree.toJSON()), /尚未保存到后端/)
    await act(async () => { button(tree, '保存配置').props.onClick(); await Promise.resolve() })
    assert.equal(posts.length, 1); assert.equal(posts[0].config.capital, '3000000')
    assert.equal(posts[0].config.estimateMonths, '24'); assert.equal(posts[0].config.factorAnnualReturnPct, '12')
    assert.doesNotMatch(JSON.stringify(tree.toJSON()), /当前修改尚未保存/)
    await act(async () => tree.unmount()); tree = null
    globalThis.window.localStorage.getItem = () => null
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    assert.equal(field(tree).props.value, '3000000')
    assert.equal(tree.root.findByProps({ 'aria-label': '目标估算周期（月）' }).props.value, '24')
    assert.equal(tree.root.findByProps({ 'aria-label': '因子账户假设年化（%）' }).props.value, '12')
    assert.equal(posts.length, 1)
  } finally { if (tree) await act(async () => tree.unmount()); cleanup() }
})

test('slow initial backend read does not overwrite edits already made in this page', async () => {
  const cleanup = setup(); let tree; let finish
  globalThis.fetch = async url => String(url).endsWith('/capital-allocation/settings')
    ? new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => record({ ...defaultAllocation(), capital: '2000000' }) }) })
    : { ok: true, json: async () => ({ items: [] }) }
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    assert.equal(button(tree, '保存配置').props.disabled, true)
    await act(async () => field(tree).props.onChange({ target: { value: '1500000' } }))
    await act(async () => { finish(); await Promise.resolve() })
    assert.equal(field(tree).props.value, '1500000')
    assert.match(JSON.stringify(tree.toJSON()), /尚未保存到后端/)
    assert.equal(button(tree, '保存配置').props.disabled, false)
  } finally { if (tree) await act(async () => tree.unmount()); cleanup() }
})

test('save failure preserves edited inputs and never marks them successfully saved', async () => {
  const cleanup = setup(); let tree
  globalThis.fetch = async (url, options) => {
    if (!String(url).endsWith('/capital-allocation/settings')) return { ok: true, json: async () => ({ items: [] }) }
    return options.method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ detail: '配置已被其他页面更新' }) }
      : { ok: true, json: async () => record(defaultAllocation()) }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    await act(async () => field(tree).props.onChange({ target: { value: '1200000' } }))
    await act(async () => { button(tree, '保存配置').props.onClick(); await Promise.resolve() })
    assert.equal(field(tree).props.value, '1200000')
    assert.match(JSON.stringify(tree.toJSON()), /配置已被其他页面更新/)
    assert.match(JSON.stringify(tree.toJSON()), /尚未保存到后端/)
  } finally { if (tree) await act(async () => tree.unmount()); cleanup() }
})

test('editing while save is pending leaves the newer draft marked unsaved', async () => {
  const cleanup = setup(); let tree; let finish
  globalThis.fetch = async (url, options) => {
    if (!String(url).endsWith('/capital-allocation/settings')) return { ok: true, json: async () => ({ items: [] }) }
    if (options.method === 'POST') {
      const snapshot = JSON.parse(options.body).config
      return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => record(snapshot, 'b'.repeat(32)) }) })
    }
    return { ok: true, json: async () => record(defaultAllocation()) }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(CapitalAllocation)); await Promise.resolve() })
    await act(async () => field(tree).props.onChange({ target: { value: '1100000' } }))
    await act(async () => { button(tree, '保存配置').props.onClick(); await Promise.resolve() })
    assert.equal(button(tree, '正在保存…').props.disabled, true)
    await act(async () => field(tree).props.onChange({ target: { value: '1300000' } }))
    await act(async () => { finish(); await Promise.resolve() })
    assert.equal(field(tree).props.value, '1300000')
    assert.match(JSON.stringify(tree.toJSON()), /尚未保存到后端/)
  } finally { if (tree) await act(async () => tree.unmount()); cleanup() }
})
