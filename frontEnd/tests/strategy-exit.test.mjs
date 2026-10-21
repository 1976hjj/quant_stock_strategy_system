import assert from 'node:assert/strict'
import {test} from 'node:test'
import React,{act} from 'react'
import renderer from 'react-test-renderer'
import StrategyBacktest from '../.quality-test-build/strategy-exit/StrategyBacktest.js'

globalThis.IS_REACT_ACT_ENVIRONMENT=true
globalThis.window={setInterval,clearInterval,dispatchEvent:()=>{},localStorage:{getItem:()=>null,setItem:()=>{}}}

test('generic backtest defaults off, saves50%selection and submits it to preflight',async()=>{
  let tree
  const calls=[],saved=[]
  window.localStorage.setItem=(key,value)=>saved.push([key,value])
  globalThis.fetch=async(url,init)=>{
    const path=String(url).split('/api/v1')[1];calls.push({path,init})
    const body=path==='/health'?{status:'ok'}:path==='/strategy/options'?{factors:[{factor_id:'jqdata-earnings-to-price-ratio',chinese_name:'估值',release_id:'sha256:fixture',expected_direction:'HIGH',source_collection:'CURRENT',start:'2020-01-02',end:'2025-12-31'}],universe_segments:[],defaults:{},universes:[]}:
      path==='/strategy/jobs'?{jobs:[]}:path==='/strategy/preflight'?{status:'READY',config_id:'fixture',session_count:10,factor_count:0,estimated_rebalances:1,common_range:{start:'2020-01-02',end:'2025-12-31'},warnings:[]}:{}
    return {ok:true,json:async()=>body}
  }
  try{
    await act(async()=>{tree=renderer.create(React.createElement(StrategyBacktest));await Promise.resolve()})
    const select=tree.root.findAllByType('select').find(s=>s.findAllByType('option').some(o=>o.props.value==='GAIN_50_CLEAR'))
    assert.equal(select.props.value,'NONE')
    await act(async()=>select.props.onChange({target:{value:'GAIN_50_CLEAR'}}))
    const draft=saved.filter(([key])=>key==='alpha-research.strategy-draft').at(-1)
    assert.equal(JSON.parse(draft[1]).take_profit_policy,'GAIN_50_CLEAR')
    const preflight=tree.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&c.includes('一键预检')))
    assert.ok(preflight)
    assert.equal(preflight.props.disabled,false)
    await act(async()=>{preflight.props.onClick();await Promise.resolve()})
    const call=calls.find(c=>c.path==='/strategy/preflight')
    assert.equal(JSON.parse(call.init.body).take_profit_policy,'GAIN_50_CLEAR')
  }finally{if(tree)await act(async()=>tree.unmount())}
})
