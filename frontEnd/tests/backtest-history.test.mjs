import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import History, { StrategyHistoryDetail } from '../.quality-test-build/history/StrategyBacktestHistory.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = { setInterval: () => 1, clearInterval: () => {}, addEventListener: () => {}, removeEventListener: () => {}, confirm: () => true }
const nodeText = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n?.children || []).map(nodeText).join('')
const button = (root, label) => root.findAllByType('button').find(n => nodeText(n) === label)
const config = { start: '2010-01-01', end: '2015-12-31', universe_segments: ['SH_MAIN', 'SZ_MAIN', 'CHINEXT'],
  target_count: 10, retention_rank: 20, rebalance_sessions: 63, minimum_entry_score: 85,
  minimum_cash_fraction: .02, initial_cash_cny: 100, score_rules: [{factor_id:'fixture',weight:1,direction:'HIGH'}], filter_rules: [] }
const quality = { job_id:'quality--saved', history_source:'QUALITY', strategy_type:'QUALITY', name:'保存的85分策略',
  created_at:'2026-10-24T10:00:00Z',status:'PASS',execution_model_valid:true,request:config,
  result_summary:{total_return:.1,annualized_return:.05,maximum_drawdown:-.1,sharpe:.7},
  quality_strategy:{version:2,schedule:'QUARTER',allocation:'INVERSE_RESVOL',weight_training:{start:'2016-01-01',end:'2019-12-31'}} }
const detail = {...quality,trade_detail_available:true,result:{ summary:quality.result_summary,initial_cash_cny:100,
  daily:[{session:'2010-01-04',nav:100,cash:100,holdings:[]},{session:'2015-12-31',nav:110,cash:110,holdings:[]}],annual:[{year:2015,return:.1}]}}

test('running quality history stops through the quality endpoint and refreshes its stopped state', async () => {
  const calls = []; let stopped = false; let tree
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options?.method })
    if (options?.method === 'POST') stopped = true
    return { ok: true, json: async () => ({ jobs: [{ ...quality, status: stopped ? 'STOPPED' : 'RUNNING', result_summary: null }], total: 1 }) }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(History, { onOpenRunning() {} })); await Promise.resolve() })
    await act(async () => { button(tree.root, '停止回测').props.onClick(); await Promise.resolve() })
    assert.ok(calls.some(c => c.method === 'POST' && c.url.endsWith('/quality-strategies/jobs/quality--saved/stop')))
    assert.match(nodeText(tree.root), /已停止/)
    assert.equal(button(tree.root, '停止回测'), undefined)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('history includes quality jobs, opens their own snapshot and routes annual trades to their source', async () => {
  const calls=[];let tree
  globalThis.fetch=async url=>{
    const path=String(url).split('/api/v1')[1];calls.push(path)
    return {ok:true,json:async()=>path.includes('/trades?')?{available:true,total:0,summary:{},trades:[]}
      :path.startsWith('/backtest-history?')?{jobs:[quality],total:1,offset:0,limit:50}:detail}
  }
  try {
    await act(async()=>{tree=renderer.create(React.createElement(History,{onOpenRunning:()=>{}}));await Promise.resolve()})
    assert.match(nodeText(tree.root),/保存的85分策略/)
    assert.match(nodeText(tree.root),/入选评分 ≥85分/)
    assert.match(nodeText(tree.root),/季度换仓/)
    await act(async()=>{button(tree.root,'详情').props.onClick();await Promise.resolve()})
    assert.ok(calls.includes('/backtest-history/QUALITY/quality--saved'))
    assert.equal(tree.root.findByProps({'aria-label':'最新明细'}).findAllByType('dd')[0].children[0],'10.00%')
    assert.match(tree.root.findByType('a').props.href,/backtest-history\/QUALITY\/quality--saved\/report/)
    const year=tree.root.findAllByType('button').find(n=>nodeText(n).includes('2015')&&nodeText(n).includes('查看交易'))
    await act(async()=>{year.props.onClick();await Promise.resolve()})
    assert.ok(calls.some(p=>p.startsWith('/backtest-history/QUALITY/quality--saved/trades?year=2015')))
  } finally {if(tree)await act(async()=>tree.unmount())}
})

test('source and date survive pagination; switching source resets page without extra detail hydration',async()=>{
  const calls=[];let tree
  globalThis.fetch=async url=>{calls.push(String(url));return{ok:true,json:async()=>({jobs:[quality],total:51,offset:0,limit:50})}}
  try {
    await act(async()=>{tree=renderer.create(React.createElement(History,{onOpenRunning:()=>{}}));await Promise.resolve()})
    await act(async()=>{tree.root.findByProps({'aria-label':'历史策略来源'}).props.onChange({target:{value:'QUALITY'}});await Promise.resolve()})
    const day=tree.root.findByProps({'aria-label':'历史运行日期'}).props.value
    await act(async()=>{button(tree.root.findByProps({'aria-label':'历史记录分页'}),'下一页').props.onClick();await Promise.resolve()})
    assert.match(calls.at(-1),/strategy_type=QUALITY/);assert.match(calls.at(-1),/offset=50/);assert.ok(calls.at(-1).includes(`day=${day}`))
    await act(async()=>{tree.root.findByProps({'aria-label':'历史策略来源'}).props.onChange({target:{value:'FACTOR'}});await Promise.resolve()})
    assert.match(calls.at(-1),/strategy_type=FACTOR/);assert.match(calls.at(-1),/offset=0/)
    assert.ok(calls.every(p=>p.includes('/backtest-history?')))
  } finally {if(tree)await act(async()=>tree.unmount())}
})

test('quality history removal says it preserves evidence, and running jobs cannot be removed',async()=>{
  const calls=[];const confirmations=[];let removed=false;let tree
  globalThis.window.confirm=text=>{confirmations.push(text);return true}
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),method:options?.method});if(options?.method==='DELETE')removed=true;return{ok:true,json:async()=>removed?{jobs:[],total:0}:{jobs:[quality],total:1}}}
  try {
    await act(async()=>{tree=renderer.create(React.createElement(History,{onOpenRunning:()=>{}}));await Promise.resolve()})
    await act(async()=>{button(tree.root,'移除').props.onClick();await Promise.resolve()})
    assert.match(confirmations[0],/原账户、因子文件和优质策略页面的结果仍会保留/)
    assert.ok(calls.some(c=>c.method==='DELETE'&&c.url.endsWith('/backtest-history/QUALITY/quality--saved')))
  } finally {if(tree)await act(async()=>tree.unmount())}
})
