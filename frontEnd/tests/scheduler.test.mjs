import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import SchedulerManager from '../.quality-test-build/scheduler/SchedulerManager.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = { setInterval, clearInterval }
const defaults = { workers: 2, sleep_ms: 50, min_free_gb: 10, bank_update_mode: 'AUTO', capital_cny: 1000000,
  start: '2016-01-01', minimum_entry_score: 80, wait_for_data: true, ratio_parameters: null }
const rows = ['general', 'bank', 'factor', 'ratio'].map((id, i) => ({ id, name: ['通用数据（不含财务披露）', '银行行业数据', '图1策略', '图2策略'][i],
  enabled: false, time: '18:30', frequency: 'TRADING_DAY_NEXT', options: { ...defaults }, next_run: null, last_run: null }))
const text = tree => JSON.stringify(tree.toJSON())
const button = (tree, value) => tree.root.findAllByType('button').find(b => b.children.join('') === value)

test('scheduler shows one row per task, saves settings before manual run and preserves independent parameters', async () => {
  const items = structuredClone(rows); const posts = []; let tree
  globalThis.fetch = async (url, options) => {
    const body = options?.body && JSON.parse(options.body)
    if (options?.method === 'POST') {
      posts.push({ url, body })
      if (url.endsWith('/save')) Object.assign(items[0], body)
      else items[0].last_run = { id: 'run1', status: 'QUEUED', message: '等待执行', created_at: '2026-11-15T20:00:00+08:00' }
    }
    return { ok: true, json: async () => ({ items, engine_running: true }) }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(SchedulerManager)); await Promise.resolve() })
    assert.equal(tree.root.findByType('tbody').findAllByType('tr').length, 4)
    assert.match(text(tree), /调度器运行中/)
    assert.match(text(tree), /交易日T\+1（次日）/)
    assert.match(text(tree), /周五数据周六处理/)
    assert.equal(posts.length, 0)
    await act(async () => tree.root.findByProps({ 'aria-label': '通用数据（不含财务披露）时间' }).props.onChange({ target: { value: '19:15' } }))
    assert.match(text(tree), /有修改待保存/)
    assert.equal(button(tree, '立即运行').props.disabled, true)
    await act(async () => { button(tree, '保存').props.onClick(); await Promise.resolve() })
    assert.equal(posts[0].body.time, '19:15')
    assert.equal(posts[0].body.options.workers, 2)
    assert.equal(posts[0].body.enabled, false)
    await act(async () => { button(tree, '立即运行').props.onClick(); await Promise.resolve() })
    assert.ok(posts[1].url.endsWith('/general/run'))
    assert.match(text(tree), /排队中/)
    assert.equal(button(tree, '立即运行').props.disabled, true)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('server save failures remain visible and do not claim saved configuration', async () => {
  let tree
  globalThis.fetch = async (url, options) => ({ ok: options?.method !== 'POST', json: async () => options?.method === 'POST'
    ? { detail: '时间格式无效' } : { items: structuredClone(rows), engine_running: false } })
  try {
    await act(async () => { tree = renderer.create(React.createElement(SchedulerManager)); await Promise.resolve() })
    await act(async () => tree.root.findByProps({ 'aria-label': '通用数据（不含财务披露）时间' }).props.onChange({ target: { value: '19:15' } }))
    await act(async () => { button(tree, '保存').props.onClick(); await Promise.resolve() })
    assert.match(text(tree), /时间格式无效/)
    assert.match(text(tree), /有修改待保存/)
  } finally { if (tree) await act(async () => tree.unmount()) }
})
