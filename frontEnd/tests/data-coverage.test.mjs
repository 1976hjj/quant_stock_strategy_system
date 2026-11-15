import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DataCoverageGroups } from '../.quality-test-build/data-coverage/DataManager.js'

const dataset = (id, more = {}) => ({ id, start: '2010-01-04', end: '2026-11-13', partitions: 4000, ...more })
const render = datasets => renderToStaticMarkup(React.createElement(DataCoverageGroups, { group: { id: 'benchmark', datasets } }))

test('index coverage groups consume catalogue names and categories with distinct dividend quality identities', () => {
  const html = render([
    dataset('csi300_daily'), dataset('000852.SH', { name: '中证1000', category: 'BROAD' }),
    dataset('932000.CSI', { name: '中证2000', category: 'BROAD' }),
    dataset('000688.SH', { name: '科创50', category: 'GROWTH' }), dataset('399006.SZ'),
    dataset('931468.CSI', { name: '中证红利质量', category: 'DIVIDEND' }),
    dataset('932315.CSI', { name: '中证全指红利质量', category: 'DIVIDEND' }), dataset('H20269.CSI'),
  ])
  assert.match(html, /宽基指数/)
  assert.match(html, /3项/)
  assert.match(html, /中证1000价格指数 · 000852/)
  assert.match(html, /中证2000价格指数 · 932000/)
  assert.match(html, /成长指数/)
  assert.match(html, /科创50价格指数/)
  assert.match(html, /红利与质量指数/)
  assert.match(html, /中证全指红利质量价格指数 · 932315/)
  assert.match(html, /红利低波全收益指数/)
  assert.doesNotMatch(html, /其他数据/)
})

test('missing component coverage stays missing and source failures remain explicit', () => {
  const html = render([dataset('csi300_daily'), dataset('000852.SH', {
    name: '中证1000', category: 'BROAD', start: null, end: null, partitions: 0, error: '接口没有返回行情',
  })])
  assert.match(html, /截至尚无完整记录/)
  assert.match(html, /尚无记录 → 尚无记录/)
  assert.match(html, /最近更新未完成：接口没有返回行情/)
  assert.match(html, /1\/2项截至2026-11-13/)
})

test('backfilled history is labelled by publication date and unrecognised data stays visible', () => {
  const html = render([dataset('932000.CSI', { name: '中证2000', category: 'BROAD',
    publication_date: '2023-08-11', history_note: '发布日前的数据为回溯历史' }), dataset('additional')])
  assert.match(html, /发布日 2023-08-11 · 发布日前的数据为回溯历史/)
  assert.match(html, /其他数据/)
  assert.match(html, /additional/)
})
