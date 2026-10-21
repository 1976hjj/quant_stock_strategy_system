import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import { Curve, EquityChart, ShadowTimeline, RotationComparison, ChartTimeRange, useChartTimeRange } from '../.quality-test-build/chart-range/chart-range-entry.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = { addEventListener() {}, removeEventListener() {}, setInterval, clearInterval }
const sessions = ['2019-12-31','2020-01-02','2020-01-03','2021-01-04','2021-01-05','2022-01-04']
const navs = [100,200,150,180,210,240]
const daily = sessions.map((session,i)=>({session,nav:navs[i],cash:0,positions:1,daily_return:i?navs[i]/navs[i-1]-1:0,actual_stock_exposure:1,holdings:[{ts_code:'A',security_name:'账户持股',quantity:10,close:navs[i]/10,market_value_cny:navs[i]}]}))
const content = node => typeof node==='string'||typeof node==='number'?String(node):(node?.children||[]).map(content).join('')
const input = (tree,name) => tree.root.findByProps({'aria-label':name})
const dates = tree => [input(tree,'图表起始日期').props.value,input(tree,'图表结束日期').props.value]
const button = (tree,label) => tree.root.findAllByType('button').find(b=>content(b)===label)
async function dateRange(tree,start,end) {
  await act(async()=>input(tree,'图表结束日期').props.onChange({target:{value:end}}))
  await act(async()=>input(tree,'图表起始日期').props.onChange({target:{value:start}}))
}
const tableData = root => root.findAllByType('tbody').map(t=>t.findAllByType('td').map(content))

test('quality zoom changes visible dates and pointer mapping, preserving historical P/L, drawdowns and latest snapshot',async()=>{
  let tree
  try {
    await act(async()=>{tree=renderer.create(React.createElement(Curve,{daily,initialCash:100,showLatestDetails:true}))})
    const latest=()=>tree.root.findByProps({'aria-label':'最新明细'})
    const latestBefore=content(latest());const rowsBefore=tableData(latest())
    await dateRange(tree,'2020-01-03','2021-01-04')
    const svg=()=>tree.root.findByProps({className:'qs-curve'})
    assert.match(svg().props['aria-label'],/2020-01-03至2021-01-04/)
    assert.equal(svg().findAllByType('polyline')[0].props.points.split(' ').length,2)
    assert.deepEqual(tableData(latest()),rowsBefore);assert.equal(content(latest()),latestBefore)
    await act(async()=>svg().props.onPointerMove({clientX:48,currentTarget:{getBoundingClientRect:()=>({left:0,width:980,height:340})}}))
    let tip=tree.root.findByProps({role:'tooltip'})
    assert.equal(tip.findByType('header').findByType('b').children[0],'2020-01-03')
    let fields=Object.fromEntries(tip.findAllByType('dt').map((dt,i)=>[content(dt),content(tip.findAllByType('dd')[i])]))
    assert.equal(fields['累计收益'],'50.00%');assert.equal(fields['当前回撤'],'-25.00%')
    await act(async()=>svg().props.onKeyDown({key:'End',preventDefault(){}}))
    tip=tree.root.findByProps({role:'tooltip'});assert.equal(tip.findByType('header').findByType('b').children[0],'2021-01-04')
    await act(async()=>svg().props.onKeyDown({key:'ArrowRight',preventDefault(){}}))
    assert.equal(tree.root.findByProps({role:'tooltip'}).findByType('header').findByType('b').children[0],'2021-01-04')
    await act(async()=>button(tree,'恢复全区间').props.onClick())
    assert.deepEqual(dates(tree),[sessions[0],sessions.at(-1)])
    assert.equal(svg().findAllByType('polyline')[0].props.points.split(' ').length,daily.length)
  } finally { if(tree)await act(async()=>tree.unmount()) }
})

test('date bounds snap to trading days, stay ordered, persist across polling and reset on new date domains',async()=>{
  let tree
  try {
    await act(async()=>{tree=renderer.create(React.createElement(Curve,{daily,initialCash:100}))})
    await act(async()=>input(tree,'图表结束日期').props.onInput({currentTarget:{value:'2021-01-03'}}))
    await act(async()=>input(tree,'图表起始日期').props.onInput({currentTarget:{value:'2020-01-01'}}))
    assert.deepEqual(dates(tree),['2020-01-02','2020-01-03'])
    await act(async()=>tree.update(React.createElement(Curve,{daily:daily.map(d=>({...d})),initialCash:100})))
    assert.deepEqual(dates(tree),['2020-01-02','2020-01-03'])
    await act(async()=>input(tree,'时间范围起点').props.onKeyDown({key:'End',preventDefault(){}}))
    assert.deepEqual(dates(tree),['2020-01-02','2020-01-03'])
    await act(async()=>input(tree,'时间范围终点').props.onKeyDown({key:'Home',preventDefault(){}}))
    assert.deepEqual(dates(tree),['2020-01-02','2020-01-03'])
    const next=daily.slice(2)
    await act(async()=>tree.update(React.createElement(Curve,{daily:next,initialCash:100})))
    assert.deepEqual(dates(tree),[next[0].session,next.at(-1).session])
  } finally {if(tree)await act(async()=>tree.unmount())}
})

function NavigatorFixture(){
  const range=useChartTimeRange(sessions)
  return React.createElement(ChartTimeRange,{sessions,values:navs,start:range.start,end:range.end,onChange:range.change})
}
test('brush handles resize and dragging the middle pans without crossing or escaping the full domain',async()=>{
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(NavigatorFixture))})
    const track=()=>tree.root.findByProps({className:'chart-time-range-track'})
    const target={getBoundingClientRect:()=>({left:0,width:500}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}}
    const down=(mode,x)=>({button:0,clientX:x,pointerId:1,preventDefault(){},target:{closest:()=>({getAttribute:()=>mode,focus(){}})},currentTarget:target})
    const move=x=>({clientX:x,pointerId:1,currentTarget:target})
    await act(async()=>track().props.onPointerDown(down('START',0)))
    await act(async()=>track().props.onPointerMove(move(200)))
    await act(async()=>track().props.onPointerUp(move(200)))
    assert.deepEqual(dates(tree),[sessions[2],sessions[5]])
    await act(async()=>track().props.onPointerDown(down('END',500)))
    await act(async()=>track().props.onPointerMove(move(400)))
    await act(async()=>track().props.onPointerUp(move(400)))
    assert.deepEqual(dates(tree),[sessions[2],sessions[4]])
    await act(async()=>track().props.onPointerDown(down('MOVE',300)))
    await act(async()=>track().props.onPointerMove(move(0)))
    await act(async()=>track().props.onPointerCancel(move(0)))
    assert.deepEqual(dates(tree),[sessions[0],sessions[2]])
    await act(async()=>track().props.onPointerMove(move(500)))
    assert.deepEqual(dates(tree),[sessions[0],sessions[2]])
    await act(async()=>button(tree,'近1年').props.onClick())
    assert.deepEqual(dates(tree),[sessions[3],sessions[5]])
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('generic strategy and benchmark zoom together while global account returns and prior peaks remain intact',async()=>{
 let tree
 try{
  const benchmark={daily:sessions.map((session,i)=>({session,return:i/10})),summary:{total_return:.5}}
  await act(async()=>{tree=renderer.create(React.createElement(EquityChart,{daily,benchmark,drawdown:{peak_session:sessions[1],trough_session:sessions[2],recovery_session:sessions[4],recovered:true,drawdown:-.25}}))})
  await dateRange(tree,sessions[2],sessions[3])
  const svg=tree.root.findByProps({'aria-label':'策略与沪深300累计收益走势'})
  assert.equal(svg.findByProps({className:'strategy-series'}).props.points.split(' ').length,2)
  assert.equal(svg.findByProps({className:'benchmark-series'}).props.points.split(' ').length,2)
  assert.match(content(tree.root.findByProps({className:'strategy-chart-hover'})),/80.00%/)
  assert.match(content(tree.root.findByProps({className:'strategy-chart-hover'})),/-10.00%/)
  const markers=svg.findByProps({className:'drawdown-marker'}).findAllByType('line')
  assert.ok(markers.every(l=>l.props.x1>=54&&l.props.x2<=988))
 }finally{if(tree)await act(async()=>tree.unmount())}
})

test('shadow and rotation curves have independent zoom controls and retain full-history return baselines',async()=>{
 const result={daily,shadow_health:{experiment_variant:'S4V3',changes:[],timeline:daily.map((d,i)=>({session:d.session,shadow_return:d.nav/100-1,shadow_drawdown:i===2?-.25:0,target_exposure:.5}))},rotation:{decisions:[],candidate_shadows:[{candidate_id:'one',name:'候选组合',daily:daily.slice(1)}]}}
 for(const Component of [ShadowTimeline,RotationComparison]){
  let tree
  try{
   await act(async()=>{tree=renderer.create(React.createElement(Component,{result,hoverDate:null,onHoverDate(){}}))})
   await dateRange(tree,sessions[2],sessions[3])
   assert.deepEqual(dates(tree),[sessions[2],sessions[3]])
   assert.ok(!JSON.stringify(tree.toJSON()).includes('NaN'))
   if(Component===ShadowTimeline){
    assert.equal(tree.root.findByProps({className:'shadow-return-line'}).props.d.split('L').length,2)
    assert.match(content(tree.root.findByProps({className:'shadow-timeline-values'})),/80.00%/)
   }else{
    const svg=tree.root.findByProps({'aria-label':'轮动账户与候选组合收益走势'})
    assert.ok(svg.findAllByType('polyline').every(l=>l.props.points.split(' ').length===2))
    // Candidate dates are aligned by session, not by position in a shorter array.
    const line=svg.findAllByType('polyline')[1];assert.equal(Number(line.props.points.split(' ')[0].split(',')[0]),20)
   }
  }finally{if(tree)await act(async()=>tree.unmount())}
 }
})
