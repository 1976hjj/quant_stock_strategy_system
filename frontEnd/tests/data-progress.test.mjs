import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import DataUpdateProgress from '../.quality-test-build/data-progress/DataUpdateProgress.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = { setInterval, clearInterval }

test('bank update distinguishes collection success from full publication and shows actual counters', async () => {
  const job = { job_id: 'bank-job', request: { source_id: 'industry' }, status: 'RUNNING',
    phase: '整合财务字段与检查冲突', progress: 81.4, started_at: new Date(Date.now() - 120000).toISOString(),
    updated_at: new Date().toISOString(), detail: '归母净资产 · 招商银行 · 2025-12-31',
    stage_id: 'facts', stage_index: 5, stage_count: 8, stage_completed: 12000, stage_total: 50000,
    stage_unit: '个字段记录', stage_progress: 24, completed_groups: 0, total_groups: 1,
    stages: [{ id: 'free', name: '免费来源补充', status: 'DONE' },
             { id: 'facts', name: '整合财务字段与检查冲突', status: 'RUNNING', completed: 12000, total: 50000, unit: '个字段记录' },
             { id: 'publish', name: '入库并发布新版本', status: 'PENDING' }], log_tail: '{"status":"PASS"}' }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(DataUpdateProgress, { job })) })
  assert.equal(tree.root.findByProps({ role: 'progressbar' }).props['aria-valuenow'], 81.4)
  assert.match(JSON.stringify(tree.toJSON()), /12000 \/ 50000 个字段记录/)
  assert.match(JSON.stringify(tree.toJSON()), /归母净资产 · 招商银行/)
  assert.match(JSON.stringify(tree.toJSON()), /已运行/)
  assert.equal(tree.root.findByProps({ className: 'data-stage-running' }).props['aria-current'], 'step')
  assert.equal(tree.root.findByProps({ className: 'data-job-status' }).findByType('b').children[0], '运行中')
  await act(async () => tree.update(React.createElement(DataUpdateProgress, { job: { ...job, status: 'PASS', phase: '更新完成', progress: 100, stages: job.stages.map(s => ({ ...s, status: 'DONE' })) } })))
  assert.equal(tree.root.findByProps({ role: 'progressbar' }).props['aria-valuenow'], 100)
  assert.equal(tree.root.findAllByProps({ className: 'data-current-work' }).length, 0)
  assert.equal(tree.root.findByProps({ className: 'data-job-status' }).findByType('b').children[0], '已完成')
  await act(async () => tree.unmount())
})

test('failed stage and legacy coarse progress are reported without inventing counters', async () => {
  let tree
  await act(async () => { tree = renderer.create(React.createElement(DataUpdateProgress, { job: {
    job_id: 'legacy', request: {}, status: 'FAIL', phase: '更新失败', progress: 75, error: '来源不可用', log_tail: '',
  } })) })
  assert.match(JSON.stringify(tree.toJSON()), /来源不可用/)
  assert.match(JSON.stringify(tree.toJSON()), /失败阶段/)
  assert.equal(tree.root.findAllByType('ol').length, 0)
  assert.equal(tree.root.findByProps({ role: 'progressbar' }).props['aria-valuenow'], 75)
  await act(async () => tree.unmount())
})
