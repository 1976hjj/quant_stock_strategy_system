import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import QualityStrategies, { CalculationStatus, Curve, TakeProfitResults, QualityTradePlan, preloadQualityStrategies, readQuality, invalidateQualityReads } from '../.quality-test-build/QualityStrategies.js'

beforeEach(() => invalidateQualityReads())

test('CSI2000 comparison preserves account baseline through zoom and leaves data gaps open', async () => {
  const daily = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].map((session, i) => ({ session, nav: 100 + i * 10 }))
  const benchmark = { benchmark_id: 'CSI2000', name: '中证2000', status: 'OK', daily: [
    { session: daily[0].session, close: 1000 }, { session: daily[2].session, close: 2000 }, { session: daily[3].session, close: 1500 },
  ], note: '价格指数，不含分红', missing_sessions: 1 }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(Curve, { daily, initialCash: 100, benchmark, showLatestDetails: true })) })
    const line = () => tree.root.findByProps({ className: 'qs-benchmark-line' }).props.d
    assert.equal((line().match(/M/g) || []).length, 2)
    assert.equal((line().match(/L/g) || []).length, 1)
    assert.ok(line().startsWith('M48,204'))
    const account = () => Object.fromEntries(tree.root.findByProps({ 'aria-label': '最新明细' }).findAllByType('dt').map((dt, i) => [nodeText(dt), nodeText(tree.root.findByProps({ 'aria-label': '最新明细' }).findAllByType('dd')[i])]))
    assert.equal(account()['累计收益'], '30.00%')
    await act(async () => tree.root.findByProps({ 'aria-label': '图表起始日期' }).props.onChange({ target: { value: daily[2].session } }))
    assert.ok(line().startsWith('M48,32'), 'zoom must preserve the original 2x benchmark level')
    assert.equal(account()['累计收益'], '30.00%')
    await act(async () => tree.update(React.createElement(Curve, { daily, initialCash: 100, benchmark: { ...benchmark, status: 'MISSING_BASELINE' } })))
    assert.equal(tree.root.findAllByProps({ className: 'qs-benchmark-line' }).length, 0)
    assert.equal(daily[3].nav, 130)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('factor rebuild checkbox defaults off, sends the chosen mode and remembers it', async()=>{
  const oldWindow=globalThis.window;const storage=new Map();const posts=[];let tree
  globalThis.window={...oldWindow,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}}
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1]
    if(options?.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>({job_id:'done',status:'PASS'})}}
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:[items[2]]})}
    return {ok:true,json:async()=>detail(items[2])}
  }
  const checkbox=()=>tree.root.findByProps({type:'checkbox'})
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(checkbox().props.checked,false)
    assert.match(text(tree),/无兼容缓存、历史来源更正或公式变化时自动重建/)
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(posts[0].rebuild_factors,false)
    await act(async()=>checkbox().props.onChange({target:{checked:true}}))
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(posts[1].rebuild_factors,true)
    await act(async()=>tree.unmount())
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(checkbox().props.checked,true)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=oldWindow}
})

test('cached input progress and report describe factor reuse without claiming a full rebuild',async()=>{
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(CalculationStatus,{job:{job_id:'cached',status:'RUNNING',calculation_mode:'INCREMENTAL_LOCAL_INPUTS_V1',phase:'增量计算因子 jqdata-resvol',progress:5},hasPreviousResult:true}))})
    assert.equal(tree.root.findByProps({'aria-label':'缓存与增量计算运行状态'}).type,'section')
    assert.match(nodeText(tree.root),/校验缓存／增量因子/)
    assert.doesNotMatch(nodeText(tree.root),/正在全量重算|重建历史因子/)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('custom account range persists per strategy, survives running polls and labels the saved account', async()=>{
  const oldWindow=globalThis.window;const storage=new Map();const timers=[];const posts=[];let tree
  const running={job_id:'running-account',status:'RUNNING',phase:'连续账户回放',progress:50}
  let active=true
  const account={...items[2],latest_calculation_mode:'INCREMENTAL_LOCAL_INPUTS_V1',latest_start:'2024-01-02',latest_as_of:'2026-10-22'}
  globalThis.window={...oldWindow,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    setInterval:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearInterval:()=>{}}
  storage.set('alpha-research.quality-selection',JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:account.strategy_id}))
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1]
    if(options?.method==='POST'){posts.push(JSON.parse(options.body));return {ok:true,json:async()=>running}}
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:[account]})}
    if(path.includes('/jobs/'))return {ok:true,json:async()=>active?running:{...running,status:'PASS'}}
    return {ok:true,json:async()=>({...detail(account),latest_job:active?running:{...running,status:'PASS'},signal:{
      input_cache:{mode:'REUSE',reused_factors:7},backtest_start:'2024-01-02',calculation_mode:'INCREMENTAL_LOCAL_INPUTS_V1',as_of:'2026-10-22',signal_date:'2026-09-30',
      due:false,target_exposure:.882,model_positions:[],targets:[],orders:[],warnings:[],input_bindings:[],execution_note:'',
      historical_replay:{summary:metrics,daily:[],annual:[]}}})}
  }
  const start=()=>tree.root.findByProps({'aria-label':'回测开始日'})
  const end=()=>tree.root.findAllByType('input').find(n=>n.props.type==='date'&&!n.props['aria-label'])
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(start().props.value,'2024-01-02')
    assert.equal(!!start().props.disabled,false);assert.equal(!!end().props.disabled,false)
    assert.equal(button(tree.root,'正在计算').props.disabled,true)
    assert.match(nodeText(tree.root),/2024-01-02 → 2026-10-22/)
    await act(async()=>{start().props.onChange({target:{value:'2025-01-02'}});end().props.onChange({target:{value:'2026-09-30'}})})
    await act(async()=>{await timers.find(t=>t.ms===30000).fn()})
    assert.equal(start().props.value,'2025-01-02');assert.equal(end().props.value,'2026-09-30')
    assert.match(nodeText(tree.root),/2024-01-02 → 2026-10-22/)
    assert.deepEqual(JSON.parse(storage.get('alpha-research.quality-ranges'))[account.strategy_id],{start:'2025-01-02',as_of:'2026-09-30'})
    active=false
    await act(async()=>{await timers.find(t=>t.ms===30000).fn()})
    await act(async()=>{end().props.onChange({target:{value:'2024-01-01'}})})
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(posts.length,0);assert.match(text(tree),/回测开始日不能晚于计算截至日/)
    await act(async()=>{end().props.onChange({target:{value:'2026-09-30'}})})
    await act(async()=>tree.unmount())
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(start().props.value,'2025-01-02');assert.equal(end().props.value,'2026-09-30')
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.deepEqual(posts,[{rebuild_factors:false,start:'2025-01-02',as_of:'2026-09-30',capital_cny:1000000,current_holdings:[]}])
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=oldWindow}
})

test('site preload starts saved detail alongside list and opening the page shares both requests', async()=>{
  const oldWindow=globalThis.window;let tree;const pending=[]
  globalThis.window={...oldWindow,localStorage:{getItem:()=>JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:'candidate-2'}),setItem:()=>{}}}
  globalThis.fetch=url=>new Promise(resolve=>pending.push({path:String(url).split('?')[0].split('/api/v1/')[1],resolve}))
  try{
    const warm=preloadQualityStrategies()
    assert.deepEqual(pending.map(x=>x.path),['quality-strategies','quality-strategies/candidate-2'])
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies))})
    assert.equal(pending.length,2)
    await act(async()=>{
      pending[1].resolve({ok:true,json:async()=>detail(items[2])})
      pending[0].resolve({ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items})})
      await warm
    })
    assert.equal(tree.root.findByType(QualityTradePlan).props.strategyId,'candidate-2')
    assert.equal(pending.length,2)
    assert.equal(tree.root.findByProps({className:'qs-detail'}).props['aria-busy'],false)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=oldWindow}
})

test('cached reads retry failures, force refresh, and invalidated old responses cannot overwrite a newer account',async()=>{
  let count=0;const path='quality-strategies/example'
  globalThis.fetch=async()=>({ok:++count!==1,json:async()=>count===1?{detail:'暂时未连接'}:{revision:count}})
  await assert.rejects(readQuality(path),/暂时未连接/)
  assert.deepEqual(await readQuality(path),{revision:2})
  assert.deepEqual(await readQuality(path),{revision:2});assert.equal(count,2)
  assert.deepEqual(await readQuality(path,true),{revision:3})
  invalidateQualityReads()
  let resolveOld
  globalThis.fetch=()=>new Promise(resolve=>{resolveOld=resolve})
  const old=readQuality(path)
  invalidateQualityReads()
  globalThis.fetch=async()=>({ok:true,json:async()=>({revision:'new'})})
  await readQuality(path)
  resolveOld({ok:true,json:async()=>({revision:'old'})});await old
  assert.deepEqual(await readQuality(path),{revision:'new'})
})

test('calendar cadence switches complete accounts and never offers untested half-year scope/count pairs', async()=>{
  const previousWindow=globalThis.window;let tree
  const quarterId='factor-sharpe-quarter-missing-tp50-main-chinext10'
  const halfId='factor-sharpe-halfyear-missing-tp50-main-chinext10'
  const storage=new Map([['alpha-research.quality-selection',JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:quarterId})]])
  globalThis.window={...previousWindow,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}}
  const quarter={...items[2],strategy_id:quarterId,target_count:10,schedule:'QUARTER',name:'季度账户',
    evidence_version:'UNIVERSE_DIAGNOSTIC',stock_scope:{key:'MAIN_CHINEXT',label:'沪深主板＋创业板',base_strategy_id:'factor-sharpe-quarter-missing-tp50-10'}}
  const half={...quarter,strategy_id:halfId,schedule:'HALF_YEAR',name:'半年账户',rebalance_sessions:126}
  const five={...quarter,strategy_id:'factor-sharpe-quarter-missing-tp50-main-chinext5',target_count:5,stock_scope:{...quarter.stock_scope,base_strategy_id:'factor-sharpe-quarter-missing-tp50-5'}}
  const star={...quarter,strategy_id:'factor-sharpe-quarter-missing-tp50-10',stock_scope:undefined}
  const variants=[quarter,half,five,star];const calls=[]
  globalThis.fetch=async (url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1];calls.push({path,options})
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:variants})}
    if(path.endsWith('/calculate'))return {ok:true,json:async()=>({job_id:'half-year-target',status:'RUNNING'})}
    const item=variants.find(v=>path.endsWith(v.strategy_id));const isHalf=item===half
    const plan={...historicalPlan,signal_session:isHalf?'2026-06-30':'2026-09-30',execution_session:isHalf?'2026-07-01':'2026-10-08'}
    return {ok:true,json:async()=>({...detail(item),request:{...detail(item).request,take_profit_policy:'GAIN_50_CLEAR'},
      signal:{calculation_mode:'RULE_REPLAY_V1',as_of:'2026-10-21',signal_date:plan.signal_session,due:false,target_exposure:.882,
        warnings:[],model_positions:[],targets:[],orders:[],input_bindings:[],execution_note:'',
        historical_replay:{summary:{...metrics,annualized_return:isHalf?.150057891:.154963879},initial_cash_cny:100,
          daily:[{session:'2026-10-21',nav:isHalf?115:116,cash:0,positions:1,holdings:[{ts_code:isHalf?'600111.SH':'600222.SH',security_name:isHalf?'半年持仓':'季度持仓',quantity:100,market_value_cny:100}]}],
          annual:[{year:2026,return:isHalf?-.0152:-.029}],take_profit:{events:[],pending_at_end:[]},latest_rebalance:plan}}})}
  }
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    const nav=()=>tree.root.findByProps({'aria-label':'调仓频率切换'})
    assert.deepEqual(nav().findAllByType('button').map(nodeText),['季度换仓','半年换仓'])
    assert.equal(tree.root.findByProps({className:'qs-candidates'}).findAllByType('button').length,1)
    assert.equal(tree.root.findByProps({'aria-label':'股票范围切换'}).findAllByType('button').length,2)
    assert.equal(tree.root.findByProps({'aria-label':'持股数量切换'}).findAllByType('button').length,2)
    await act(async()=>{button(nav(),'半年换仓').props.onClick();await Promise.resolve()})
    assert.match(text(tree),/15.01%/);assert.match(text(tree),/自然半年末（6月／12月）/)
    assert.match(nodeText(tree.root.findByProps({'aria-label':'50%止盈结果'})),/卖后留现金至下一次半年调仓/)
    assert.match(text(tree),/半年持仓/);assert.doesNotMatch(text(tree),/季度持仓/)
    assert.equal(tree.root.findByType(QualityTradePlan).props.plan.execution_session,'2026-07-01')
    assert.equal(tree.root.findAllByProps({'aria-label':'股票范围切换'}).length,0)
    assert.equal(tree.root.findAllByProps({'aria-label':'持股数量切换'}).length,0)
    assert.equal(JSON.parse(storage.get('alpha-research.quality-selection')).strategy_id,halfId)
    await act(async()=>tree.unmount())
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(button(nav(),'半年换仓').props['aria-pressed'],true)
    await act(async()=>{button(nav(),'季度换仓').props.onClick();await Promise.resolve()})
    assert.match(text(tree),/15.50%/);assert.match(text(tree),/季度持仓/)
    assert.equal(tree.root.findByType(QualityTradePlan).props.plan.execution_session,'2026-10-08')
    await act(async()=>{button(nav(),'半年换仓').props.onClick();await Promise.resolve()})
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(calls.find(x=>x.options?.method==='POST').path,`quality-strategies/${halfId}/calculate`)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=previousWindow}
})

const historicalPlan = {kind:'HISTORICAL_MODEL_REBALANCE',as_of:'2026-10-21',signal_session:'2026-09-30',execution_session:'2026-10-08',
  initial_cash_cny:1000000,before_session:'2026-09-30',before_nav:4200000,after_nav:4300000,after_cash:500000,
  sell_count:1,buy_count:1,sell_amount_cny:12300,buy_amount_cny:9000,total_cost_cny:15,
  actions:[{id:'sell',ts_code:'600001.SH',security_name:'历史卖出股',side:'SELL',action:'清仓',quantity:1000,before_quantity:1000,after_quantity:0,price:12.3,amount_cny:12300,cost_cny:10,reason:'退出本期名单',status:'FILLED'},
    {id:'buy',ts_code:'600002.SH',security_name:'历史买入股',side:'BUY',action:'新买入',quantity:1000,before_quantity:0,after_quantity:1000,price:9,amount_cny:9000,cost_cny:5,reason:'本次选股买入',status:'FILLED'}],
  unchanged:[{ts_code:'600003.SH',security_name:'历史留仓股',quantity:2000,industry_name:'当时行业',industry_in_date:'2020-01-01',reason:'偏离在25%带宽内，保留股数'}],unresolved:[]}

test('right-edge historical drawer opens on hover, closes on leave, and can be pinned',async()=>{
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityTradePlan,{strategyId:'account-a',name:'策略A',plan:historicalPlan}))})
    const handle=()=>tree.root.findByProps({className:'qs-plan-handle'})
    const shell=()=>tree.root.findByProps({'aria-label':'最近调仓侧栏'})
    assert.equal(handle().props['aria-expanded'],false)
    await act(async()=>shell().props.onMouseEnter())
    assert.equal(handle().props['aria-expanded'],true)
    await act(async()=>shell().props.onMouseLeave())
    assert.equal(handle().props['aria-expanded'],false)
    await act(async()=>handle().props.onClick())
    await act(async()=>shell().props.onMouseLeave())
    assert.equal(handle().props['aria-expanded'],true)
    await act(async()=>tree.root.findByProps({'aria-label':'关闭调仓侧栏'}).props.onClick())
    assert.equal(handle().props['aria-expanded'],false)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('drawer copies actual historical actions with dates and share counts rather than today orders',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied='';let tree
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied=value}}}})
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityTradePlan,{strategyId:'account-a',name:'策略A',plan:historicalPlan}))})
    assert.match(text(tree),/2026-10-08/)
    assert.match(text(tree),/历史卖出股/)
    assert.match(text(tree),/当时行业/)
    assert.match(text(tree),/不是今天的待执行订单/)
    assert.deepEqual(tree.root.findAll(n=>n.props.className?.startsWith?.('qs-plan-group ')).map(n=>n.props['aria-label']),['先卖出记录','后买入记录','保留不动记录'])
    await act(async()=>button(tree.root,'复制清单').props.onClick())
    assert.match(copied,/实际|历史/);assert.match(copied,/2026-10-08/)
    assert.match(copied,/600001.SH.*1,000股.*12.3元/)
    assert.ok(copied.indexOf('先卖出')<copied.indexOf('后买入'))
    assert.match(text(tree),/已复制历史清单/)
  }finally{if(tree)await act(async()=>tree.unmount());if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator}
})

test('drawer preserves missing history and unresolved orders without inventing completed trades',async()=>{
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityTradePlan,{strategyId:'empty',name:'空记录'}))})
    assert.match(text(tree),/没有可核对的调仓成交记录/)
    assert.equal(button(tree.root,'复制清单').props.disabled,true)
    const plan={...historicalPlan,actions:[],sell_count:0,buy_count:0,unresolved:[{ts_code:'600004.SH',quantity:100,reason:'当日仍持有未入选股票，未视为已卖出'}]}
    await act(async()=>tree.update(React.createElement(QualityTradePlan,{strategyId:'blocked',name:'受阻记录',plan})))
    assert.match(text(tree),/当日需核对/)
    assert.match(text(tree),/未视为已卖出/)
    assert.doesNotMatch(text(tree),/清仓 · 已成交/)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('switching holding count replaces the drawer with that exact replay account and clears pinning',async()=>{
  const previousWindow=globalThis.window;let tree
  const tenId='factor-sharpe-quarter-missing-tp50-main-chinext10'
  globalThis.window={...previousWindow,localStorage:{getItem:()=>JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:tenId}),setItem:()=>{}}}
  const variants=[5,10].map(count=>({...items[2],strategy_id:`factor-sharpe-quarter-missing-tp50-main-chinext${count}`,target_count:count,
    evidence_version:'UNIVERSE_DIAGNOSTIC',name:`回测${count}股`,stock_scope:{key:'MAIN_CHINEXT',label:'沪深主板＋创业板',base_strategy_id:`factor-sharpe-quarter-missing-tp50-${count}`}}))
  globalThis.fetch=async url=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1]
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:variants})}
    const item=variants.find(v=>path.endsWith(v.strategy_id));const plan={...historicalPlan,execution_session:item.target_count===10?'2026-10-08':'2026-07-01'}
    return {ok:true,json:async()=>({...detail(item),latest_rebalance:{...historicalPlan,execution_session:'2000-01-01'},signal:{
      calculation_mode:'RULE_REPLAY_V1',as_of:'2026-10-21',signal_date:'2026-09-30',due:false,target_exposure:.882,
      model_positions:[],targets:[],orders:[],warnings:[],input_bindings:[],execution_note:'',
      historical_replay:{initial_cash_cny:100,summary:metrics,daily:[],annual:[],latest_rebalance:plan}
    }})}
  }
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(tree.root.findByType(QualityTradePlan).props.plan.execution_session,'2026-10-08')
    await act(async()=>tree.root.findByProps({className:'qs-plan-handle'}).props.onClick())
    assert.equal(tree.root.findByProps({className:'qs-plan-handle'}).props['aria-expanded'],true)
    await act(async()=>{tree.root.findByProps({'aria-label':'持股数量切换'}).findAllByType('button')[0].props.onClick();await Promise.resolve()})
    assert.equal(tree.root.findByType(QualityTradePlan).props.plan.execution_session,'2026-07-01')
    assert.equal(tree.root.findByProps({className:'qs-plan-handle'}).props['aria-expanded'],false)
    assert.equal(tree.root.findByType(QualityTradePlan).props.strategyId,variants[0].strategy_id)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=previousWindow}
})

test('same-input rule replay progress does not claim factors were rebuilt', async () => {
  let tree
  try {
    await act(async()=>{tree=renderer.create(React.createElement(CalculationStatus,{
      job:{job_id:'rule-replay',status:'RUNNING',calculation_mode:'RULE_REPLAY_V1',phase:'连续账户回放',progress:60},hasPreviousResult:true
    }))})
    assert.match(text(tree),/正在按新规则回测/)
    assert.match(text(tree),/核对已有因子版本/)
    assert.doesNotMatch(text(tree),/重建历史因子/)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('25% retained tolerance updates the existing strategy without adding a comparison tab', async () => {
  const originalWindow=globalThis.window
  globalThis.window={...originalWindow,localStorage:{getItem:()=>null,setItem:()=>{}}}
  const candidate={...items[2],strategy_id:'factor-sharpe-quarter-missing-tp50-main-chinext10',
    name:'两项合用＋50%止盈 · 10股',retained_rebalance_policy:'BAND25',version:2,
    stock_scope:{key:'MAIN_CHINEXT',label:'沪深主板＋创业板',base_strategy_id:'factor-sharpe-quarter-missing-tp50-10'},
    notes:'留仓市值在目标的75%—125%内不调权',evidence_version:'UNIVERSE_DIAGNOSTIC',
    summary:{...metrics,annualized_return:.10},latest_summary:{...metrics,annualized_return:.1551},
    latest_calculation_mode:'RULE_REPLAY_V1',latest_as_of:'2026-10-21',calculation_state:'UP_TO_DATE'}
  const calls=[]
  globalThis.fetch=async (url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1];calls.push({path,options})
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:[candidate]})}
    if(path.endsWith('/calculate'))return {ok:true,json:async()=>({job_id:'same-entry-band25',status:'RUNNING'})}
    return {ok:true,json:async()=>({...detail(candidate),signal:{
      calculation_mode:'RULE_REPLAY_V1',as_of:'2026-10-21',signal_date:'2026-09-30',due:false,
      target_exposure:.882,model_positions:[],targets:[],orders:[],warnings:[],input_bindings:[],execution_note:'',
      historical_replay:{initial_cash_cny:100,summary:candidate.latest_summary,
        daily:[{session:'2016-01-04',nav:100,cash:100,holdings:[]},{session:'2026-10-21',nav:120,cash:120,holdings:[]}],annual:[]}
    }})}
  }
  let tree
  try {
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(tree.root.findByProps({className:'qs-candidates'}).findAllByType('button').length,1)
    assert.equal(tree.root.findAll(n=>n.type==='nav' && n.props['aria-label']==='缺失处理方案切换').length,0)
    assert.match(text(tree),/留仓偏离25%才调权/)
    assert.match(text(tree),/15.51%/)
    assert.match(text(tree),/规则重算已更新/)
    assert.match(text(tree),/最近规则重算/)
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(calls.find(c=>c.options?.method==='POST').path,`quality-strategies/${candidate.strategy_id}/calculate`)
  } finally {if(tree)await act(async()=>tree.unmount());globalThis.window=originalWindow}
})

test('50% exit is a fourth independent comparison with its own curve, records and rebuild target', async () => {
  const originalWindow=globalThis.window
  globalThis.window={...originalWindow,localStorage:{getItem:()=>null,setItem:()=>{}}}
  const base={...items[2],strategy_id:'factor-sharpe-quarter-missing10',name:'两项合用',evidence_version:'MISSING_INPUT_DIAGNOSTIC'}
  const exit={...base,strategy_id:'factor-sharpe-quarter-missing-tp50-10',name:'两项合用＋50%止盈',evidence_version:'TAKE_PROFIT_DIAGNOSTIC',summary:{...metrics,annualized_return:.1744658718}}
  const variants=[base,exit]
  const calls=[]
  globalThis.fetch=async (url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1];calls.push({path,options})
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:variants})}
    if(path.endsWith('/calculate'))return {ok:true,json:async()=>({job_id:'exit50-job',status:'RUNNING'})}
    const item=path.endsWith(exit.strategy_id)?exit:base
    return {ok:true,json:async()=>({...detail(item),request:{...detail(item).request,take_profit_policy:item===exit?'GAIN_50_CLEAR':'NONE'},take_profit:item===exit?{events:[{event_id:1,ts_code:'600001.SH',security_name:'历史止盈股',signal_session:'2025-01-02',signal_gain:.51,status:'FILLED',execution_session:'2025-01-03',execution_price:15,quantity:100,cost_cny:5,attempts:[{session:'2025-01-03',filled:true,quantity:100}]}],pending_at_end:[]}:null})}
  }
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(tree.root.findByProps({className:'qs-candidates'}).findAllByType('button').length,1)
    const nav=tree.root.findByProps({'aria-label':'缺失处理方案切换'})
    await act(async()=>{nav.findAllByType('button')[1].props.onClick();await Promise.resolve()})
    assert.match(text(tree),/17.45%/)
    assert.match(text(tree),/50%止盈独立回测/)
    assert.match(text(tree),/历史止盈股/)
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(calls.find(c=>c.options?.method==='POST').path,`quality-strategies/${exit.strategy_id}/calculate`)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=originalWindow}
})

test('exit results distinguish pending and blocked signals from actual sales', async()=>{
  let tree
  try{
    const result={events:[{event_id:1,ts_code:'603096.SH',security_name:'待卖出',signal_session:'2026-10-19',signal_gain:.51,status:'PENDING',attempts:[{session:'2026-10-20',filled:false,quantity:100}]}],pending_at_end:['603096.SH']}
    await act(async()=>{tree=renderer.create(React.createElement(TakeProfitResults,{result}))})
    assert.match(text(tree),/已成交 .*0.* 次/)
    assert.match(text(tree),/尚未成交/)
    assert.match(text(tree),/待执行/)
    assert.doesNotMatch(text(tree),/21.85/)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('missing-input comparisons share one entry but keep three independent replay and calculation targets', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { ...originalWindow, localStorage: { getItem: () => null, setItem: () => {} } }
  const ids = ['factor-sharpe-quarter-divmissing10', 'factor-sharpe-quarter-haltrisk10', 'factor-sharpe-quarter-missing10']
  const labels = ['股息未知最低分', '停牌风险重算', '两项合用']
  const variants = ids.map((strategy_id, i) => ({ ...items[2], strategy_id,
    name: `${labels[i]} · 10股`, target_count: 10, schedule: 'QUARTER',
    evidence_version: 'MISSING_INPUT_DIAGNOSTIC', summary: { ...metrics, total_return: (i + 1) / 10 } }))
  const calls = []
  globalThis.fetch = async (url, options) => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    calls.push({ path, options })
    if (path === 'quality-strategies') return { ok: true, json: async () => ({ categories: [{ id: 'FACTOR_WEIGHTED', name: '因子加权' }], items: variants }) }
    if (path.endsWith('/calculate')) return { ok: true, json: async () => ({ job_id: 'missing-test', status: 'RUNNING' }) }
    const item = variants.find(v => path.endsWith(v.strategy_id))
    return { ok: true, json: async () => detail(item) }
  }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.equal(tree.root.findByProps({ className: 'qs-candidates' }).findAllByType('button').length, 1)
    const nav = () => tree.root.findByProps({ 'aria-label': '缺失处理方案切换' })
    assert.deepEqual(nav().findAllByType('button').map(b => b.children.join('')), labels)
    for (let i = 0; i < variants.length; i++) {
      await act(async () => { nav().findAllByType('button')[i].props.onClick(); await Promise.resolve() })
      const replay = tree.root.findByProps({ 'aria-label': '缺失处理独立回测' })
      assert.equal(replay.findByProps({ className: 'qs-metrics' }).findAllByType('b')[0].children.join(''), `${(i + 1) * 10}.00%`)
      assert.equal(nav().findAllByType('button')[i].props['aria-pressed'], true)
      assert.equal(tree.root.findAllByType('h2')[0].children.join(''), variants[i].name)
    }
    await act(async () => { button(tree.root, '回测／更新').props.onClick(); await Promise.resolve() })
    assert.equal(calls.find(c => c.options?.method === 'POST').path, `quality-strategies/${ids[2]}/calculate`)
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = originalWindow }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.window = { setInterval, clearInterval }
const noOpEventListener = () => {}
globalThis.window.addEventListener = noOpEventListener
globalThis.window.removeEventListener = noOpEventListener
const metrics = { total_return: .2, annualized_return: .1, maximum_drawdown: -.15, sharpe: .8 }
const items = ['SMALL_CAP', 'BANK', 'FACTOR_WEIGHTED'].map((category, i) => ({
  strategy_id: `candidate-${i}`, category, name: ['小市值质量＋影子', '银行质量股息', '因子加权'][i],
  version: 1, notes: '冻结研究规则', evidence_version: 'SAVED_BACKTEST', target_count: 10,
  rebalance_sessions: 10, schedule: 'INTERVAL', allocation: 'EQUAL', start: '2020-01-02', end: '2025-12-31', summary: metrics,
}))
const detail = item => ({ ...item, annual: [{ year: 2025, return: .2 }],
  daily: [{ session: '2020-01-02', nav: 100 }, { session: '2025-12-31', nav: 120 }], related_evidence: [],
  request: { minimum_cash_fraction: .02, score_rules: [{ factor_id: 'quality', direction: 'HIGH', weight: 1 }], universe_segments: ['MAIN-SH'], shadow_health: { experiment_variant: 'S4V3' } },
})
const button = (root, label) => root.findAllByType('button').find(b => b.children.some(c => typeof c === 'string' && c.includes(label)))
const text = tree => JSON.stringify(tree.toJSON())
const nodeText = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(nodeText).join('')

test('stock scope has separate tabs and switches the complete account without duplicating rule variants', async () => {
  const originalWindow=globalThis.window
  let saved=JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:'factor-sharpe-quarter-missing-tp50-10'})
  globalThis.window={...originalWindow,localStorage:{getItem:()=>saved,setItem:(_,value)=>{saved=value}}}
  const base={...items[2],strategy_id:'factor-sharpe-quarter-missing-tp50-10',name:'两项合用＋50%止盈',evidence_version:'TAKE_PROFIT_DIAGNOSTIC',summary:{...metrics,annualized_return:.1736125}}
  const narrow={...base,strategy_id:'factor-sharpe-quarter-missing-tp50-main-chinext10',name:'沪深主板＋创业板10股',evidence_version:'UNIVERSE_DIAGNOSTIC',stock_scope:{key:'MAIN_CHINEXT',label:'沪深主板＋创业板',base_strategy_id:base.strategy_id},summary:{...metrics,annualized_return:.1604211,maximum_drawdown:-.1834259}}
  const refit={...base,strategy_id:'factor-sharpe-quarter-refit2020-2025-tp50-10',name:'新权重',evidence_version:'WEIGHT_REFIT_DIAGNOSTIC',calculation_policy:'HISTORICAL_DIAGNOSTIC_ONLY',weight_training:{start:'2020-01-01',end:'2025-12-31'}}
  const variants=[base,narrow,refit],calls=[]
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1];calls.push({path,options})
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:variants})}
    if(path.endsWith('/calculate'))return {ok:true,json:async()=>({job_id:'scope-job',status:'RUNNING'})}
    const item=variants.find(v=>path.endsWith(v.strategy_id))||base
    const position={ts_code:item===narrow?'600018.SH':'688606.SH',security_name:item===narrow?'上港集团':'原范围持仓',quantity:100,market_value_cny:20,industry_name:'历史行业',cost_basis_cny:18,average_cost_price:.18,unrealized_pnl_cny:2,unrealized_pnl_pct:2/18}
    return {ok:true,json:async()=>({...detail(item),request:{...detail(item).request,take_profit_policy:'GAIN_50_CLEAR',universe_segments:item===narrow?['SH_MAIN','SZ_MAIN','CHINEXT']:['SH_MAIN','SZ_MAIN','CHINEXT','STAR']},initial_cash_cny:100,
      annual:[{year:2026,return:item===narrow?-.024577:.074072}],daily:[{session:'2016-01-04',nav:100,cash:100,holdings:[]},{session:'2026-10-20',nav:120,cash:100,holdings:[position]}],
      take_profit:{events:[{event_id:1,ts_code:position.ts_code,security_name:item===narrow?'新范围止盈记录':'原范围止盈记录',signal_session:'2025-01-02',signal_gain:.51,status:'FILLED',execution_session:'2025-01-03',execution_price:15,quantity:100,cost_cny:5,attempts:[{session:'2025-01-03',filled:true,quantity:100}]}],pending_at_end:[]}})}
  }
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    const scope=()=>tree.root.findByProps({'aria-label':'股票范围切换'})
    const rules=()=>tree.root.findByProps({'aria-label':'缺失处理方案切换'})
    assert.equal(tree.root.findByProps({className:'qs-candidates'}).findAllByType('button').length,1)
    assert.equal(rules().findAllByType('button').length,2)
    assert.deepEqual(scope().findAllByType('button').map(nodeText),['沪深主板＋创业板＋科创板','沪深主板＋创业板'])
    await act(async()=>{scope().findAllByType('button')[1].props.onClick();await Promise.resolve()})
    assert.equal(scope().findAllByType('button')[1].props['aria-pressed'],true)
    assert.equal(rules().findAllByType('button')[0].props['aria-pressed'],true)
    assert.match(text(tree),/16.04%/);assert.match(text(tree),/-18.34%/);assert.match(text(tree),/-2.46%/)
    assert.match(text(tree),/新范围止盈记录/);assert.doesNotMatch(text(tree),/原范围止盈记录/)
    const snapshot=nodeText(tree.root.findByProps({'aria-label':'最新明细'}))
    assert.match(snapshot,/上港集团/);assert.match(snapshot,/历史行业/);assert.doesNotMatch(snapshot,/688606/)
    assert.equal(JSON.parse(saved).strategy_id,narrow.strategy_id)
    // No scope result exists for the later-trained rule; don't imply it does.
    await act(async()=>{rules().findAllByType('button')[1].props.onClick();await Promise.resolve()})
    assert.equal(tree.root.findAllByProps({'aria-label':'股票范围切换'}).length,0)
    await act(async()=>{rules().findAllByType('button')[0].props.onClick();await Promise.resolve()})
    assert.equal(scope().findAllByType('button')[0].props['aria-pressed'],true)
    assert.match(nodeText(tree.root.findByProps({'aria-label':'最新明细'})),/原范围持仓/)
    await act(async()=>{scope().findAllByType('button')[1].props.onClick();await Promise.resolve()})
    await act(async()=>{button(tree.root,'回测／更新').props.onClick();await Promise.resolve()})
    assert.equal(calls.find(c=>c.options?.method==='POST').path,`quality-strategies/${narrow.strategy_id}/calculate`)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=originalWindow}
})

test('five-stock profit-exit accounts preserve scope across count switches and restore their own full account', async () => {
  const originalWindow = globalThis.window
  const baseId = 'factor-sharpe-quarter-missing-tp50-10'
  let saved = JSON.stringify({ category: 'FACTOR_WEIGHTED', strategy_id: 'factor-sharpe-quarter-missing-tp50-main-chinext10' })
  globalThis.window = { ...originalWindow, localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value } } }
  const base = { ...items[2], strategy_id: baseId, evidence_version: 'TAKE_PROFIT_DIAGNOSTIC' }
  const variants = [
    base,
    { ...base, strategy_id: 'factor-sharpe-quarter-missing-tp50-main-chinext10', stock_scope: { key: 'MAIN_CHINEXT', label: '沪深主板＋创业板', base_strategy_id: baseId } },
    { ...base, strategy_id: 'factor-sharpe-quarter-missing-tp50-5', target_count: 5, stock_scope: { key: 'WITH_STAR', label: '沪深主板＋创业板＋科创板', base_strategy_id: 'factor-sharpe-quarter-missing-tp50-5' } },
    { ...base, strategy_id: 'factor-sharpe-quarter-missing-tp50-main-chinext5', target_count: 5, stock_scope: { key: 'MAIN_CHINEXT', label: '沪深主板＋创业板', base_strategy_id: 'factor-sharpe-quarter-missing-tp50-5' } },
    { ...base, strategy_id: 'factor-sharpe-quarter-refit2020-2025-tp50-10', evidence_version: 'WEIGHT_REFIT_DIAGNOSTIC', calculation_policy: 'HISTORICAL_DIAGNOSTIC_ONLY' },
  ].map((item, i) => ({ ...item, name: `独立账户${i} · ${item.target_count}股`, summary: { ...metrics, total_return: (i + 1) / 10 } }))
  const calls = []
  globalThis.fetch = async (url, options) => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]; calls.push({ path, options })
    if (path === 'quality-strategies') return { ok: true, json: async () => ({ categories: [{ id: 'FACTOR_WEIGHTED', name: '因子加权' }], items: variants }) }
    if (path.endsWith('/calculate')) return { ok: true, json: async () => ({ job_id: 'five-stock-job', status: 'RUNNING' }) }
    const item = variants.find(row => path.endsWith(row.strategy_id)), i = variants.indexOf(item)
    return { ok: true, json: async () => ({ ...detail(item), initial_cash_cny: 100,
      request: { ...detail(item).request, take_profit_policy: 'GAIN_50_CLEAR' },
      annual: [{ year: 2026, return: (i + 1) / 100 }],
      daily: [{ session: '2016-01-04', nav: 100, cash: 100, holdings: [], positions: item.target_count + 1 },
        { session: '2026-10-20', nav: 110 + i * 10, cash: 100, positions: 1, holdings: [{ ts_code: `60000${i}.SH`, security_name: `账户${i}持仓`, quantity: 100, market_value_cny: 10 + i * 10, industry_name: '历史板块' }] }],
      take_profit: { events: [{ event_id: i, ts_code: `60000${i}.SH`, security_name: `账户${i}止盈`, signal_session: '2025-01-02', signal_gain: .51, status: 'FILLED', execution_session: '2025-01-03', execution_price: 15, quantity: 100, cost_cny: 5, attempts: [] }], pending_at_end: [] } }) }
  }
  let tree
  const nav = label => tree.root.findByProps({ 'aria-label': label })
  const clickTab = async (label, index) => act(async () => { nav(label).findAllByType('button')[index].props.onClick(); await Promise.resolve() })
  const checkAccount = i => {
    assert.match(nodeText(nav('最新明细')), new RegExp(`账户${i}持仓`))
    assert.match(nodeText(nav('50%止盈结果')), new RegExp(`账户${i}止盈`))
    assert.equal(nodeText(tree.root.findByProps({ className: 'qs-years' })), `2026${(i + 1).toFixed(2)}%`)
    assert.equal(tree.root.findByProps({ className: 'qs-metrics' }).findAllByType('b')[0].children.join(''), `${(i + 1) * 10}.00%`)
    assert.equal(tree.root.findByProps({ className: 'qs-candidates' }).findAllByType('button').length, 1)
    assert.equal(nav('缺失处理方案切换').findAllByType('button').length, 2)
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    checkAccount(1)
    assert.deepEqual(nav('持股数量切换').findAllByType('button').map(nodeText), ['5股', '10股'])
    await clickTab('持股数量切换', 0); checkAccount(3)
    assert.equal(nav('股票范围切换').findAllByType('button')[1].props['aria-pressed'], true)
    assert.match(nodeText(tree.root.findByProps({ role: 'note' })), /目标5股；历史实际持仓最多6只/)
    assert.match(nodeText(tree.root.findByProps({ className: 'qs-candidate-variant' })), /5股/)
    await clickTab('股票范围切换', 0); checkAccount(2)
    assert.equal(nav('持股数量切换').findAllByType('button')[0].props['aria-pressed'], true)
    await clickTab('持股数量切换', 1); checkAccount(0)
    await clickTab('缺失处理方案切换', 1); checkAccount(4)
    assert.equal(tree.root.findAllByProps({ 'aria-label': '持股数量切换' }).length, 0)
    await clickTab('缺失处理方案切换', 0)
    await clickTab('股票范围切换', 1)
    await clickTab('持股数量切换', 0); checkAccount(3)
    await act(async () => tree.unmount())
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    checkAccount(3)
    assert.equal(JSON.parse(saved).strategy_id, variants[3].strategy_id)
    assert.ok(!calls.some(call => call.options?.method === 'POST'))
    await act(async () => { button(tree.root, '回测／更新').props.onClick(); await Promise.resolve() })
    assert.equal(calls.find(call => call.options?.method === 'POST').path, `quality-strategies/${variants[3].strategy_id}/calculate`)
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = originalWindow }
})

test('refit full history switches its own account, labels training years and keeps zero-weight eligibility visible', async () => {
  const originalWindow=globalThis.window
  let saved=JSON.stringify({category:'FACTOR_WEIGHTED',strategy_id:'factor-sharpe-quarter-refit2020-2025-tp50-10'})
  globalThis.window={...originalWindow,localStorage:{getItem:()=>saved,setItem:(_,v)=>{saved=v}}}
  const base={...items[2],strategy_id:'factor-sharpe-quarter-missing-tp50-10',name:'旧权重50%止盈',evidence_version:'TAKE_PROFIT_DIAGNOSTIC'}
  const refit={...base,strategy_id:'factor-sharpe-quarter-refit2020-2025-tp50-10',name:'新权重50%止盈',evidence_version:'WEIGHT_REFIT_DIAGNOSTIC',calculation_policy:'HISTORICAL_DIAGNOSTIC_ONLY',calculation_state:'HISTORICAL_DIAGNOSTIC',weight_training:{start:'2020-01-01',end:'2025-12-31'},summary:{...metrics,total_return:5.2916,annualized_return:.193675,maximum_drawdown:-.270808},display_score_rules:[{factor_id:'jqdata-gross-margin-ttm',direction:'HIGH',weight:1},{factor_id:'jqdata-book-to-price-ratio',direction:'HIGH',weight:0,missing_policy:'EXCLUDE'}]}
  const calls=[]
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('?')[0].split('/api/v1/')[1];calls.push({path,options})
    if(path==='quality-strategies')return {ok:true,json:async()=>({categories:[{id:'FACTOR_WEIGHTED',name:'因子加权'}],items:[base,refit]})}
    const item=path.endsWith(refit.strategy_id)?refit:base
    return {ok:true,json:async()=>({...detail(item),start:'2016-01-01',end:'2026-10-19',initial_cash_cny:100,annual:[{year:2016,return:item===refit?.3:.1},{year:2026,return:item===refit?.14:.08}],daily:[{session:'2016-01-04',nav:100,cash:100,holdings:[]},{session:'2026-10-19',nav:item===refit?629.16:120,cash:100,holdings:[{ts_code:'A',security_name:item===refit?'新权重持仓':'旧权重持仓',quantity:100,market_value_cny:item===refit?529.16:20,industry_name:'测试行业'}]}]})}
  }
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(QualityStrategies));await Promise.resolve()})
    assert.equal(tree.root.findByProps({className:'qs-candidates'}).findAllByType('button').length,1)
    const nav=()=>tree.root.findByProps({'aria-label':'缺失处理方案切换'})
    assert.deepEqual(nav().findAllByType('button').map(nodeText),['2016—2019权重＋50%止盈','2020—2025权重＋50%止盈'])
    assert.match(text(tree),/19.37%/);assert.match(text(tree),/-27.08%/)
    assert.match(text(tree),/全程固定使用2020—2025年训练权重/)
    assert.match(text(tree),/2016—2019年使用后来训练的权重/)
    assert.match(nodeText(tree.root.findByProps({'aria-label':'最新明细'})),/新权重持仓/)
    assert.match(text(tree),/B\/P（净资产\/市值）/);assert.match(text(tree),/0.00%/)
    assert.match(text(tree),/不计分；仍保留缺失剔除要求/)
    assert.equal(tree.root.findAllByType('input').filter(n=>n.props.type==='number').length,0)
    assert.equal(button(tree.root,'回测／更新'),undefined)
    await act(async()=>{nav().findAllByType('button')[0].props.onClick();await Promise.resolve()})
    assert.match(nodeText(tree.root.findByProps({'aria-label':'最新明细'})),/旧权重持仓/)
    assert.ok(button(tree.root,'回测／更新'))
    await act(async()=>{nav().findAllByType('button')[1].props.onClick();await Promise.resolve()})
    assert.equal(JSON.parse(saved).strategy_id,refit.strategy_id)
    assert.equal(calls.filter(c=>c.options?.method==='POST').length,0)
  }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=originalWindow}
})

test('running calculation panel shows reported progress, session and old-result provenance', async () => {
  let tree
  try {
  await act(async () => { tree = renderer.create(React.createElement(CalculationStatus, {
    job: { job_id: 'running', status: 'RUNNING', phase: '连续账户回放', progress: 32,
      created_at: new Date(Date.now() - 120000).toISOString(), current_session: '2021-04-01' },
    hasPreviousResult: true,
  })) })
  assert.equal(tree.root.findByProps({ role: 'progressbar' }).props['aria-valuenow'], 32)
  assert.ok(tree.root.findByProps({ className: 'qs-calculation-meta' }).findAllByType('span').some(span => span.children.join('') === '回测处理至 2021-04-01'))
  assert.match(text(tree), /已运行/)
  assert.match(text(tree), /保留上次成功结果/)
  assert.equal(tree.root.findByProps({ className: 'current' }).findByType('span').children[0], '连续账户回测')
  await act(async () => tree.update(React.createElement(CalculationStatus, {
    job: { job_id: 'starting', status: 'STARTING' }, hasPreviousResult: false,
  })))
  assert.equal(tree.root.findByProps({ role: 'progressbar' }).props['aria-valuenow'], undefined)
  assert.match(text(tree), /正在启动全量重算/)
  assert.doesNotMatch(text(tree), /保留上次成功结果/)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('chart hover uses the exact historical account and initial capital, including first-day costs', async () => {
  const daily = [
    { session: '2025-01-02', nav: 995000, cash: 95000, positions: 2, daily_return: -.005, actual_stock_exposure: 900000 / 995000,
      holdings: [{ ts_code: '600036.SH', quantity: 1000, market_value_cny: 400000 }, { ts_code: '000001.SZ', quantity: 2000, market_value_cny: 500000 }] },
    { session: '2025-01-03', nav: 1100000, cash: 1100000, positions: 0, daily_return: 1100000 / 995000 - 1, actual_stock_exposure: 0, holdings: [] },
    { session: '2025-01-06', nav: 1000000, cash: 1000000, positions: 0, daily_return: 1000000 / 1100000 - 1, actual_stock_exposure: 0, holdings: [] },
  ]
  let tree
  await act(async () => { tree = renderer.create(React.createElement(Curve, { daily, initialCash: 1000000 })) })
  assert.equal(tree.root.findAllByProps({ role: 'tooltip' }).length, 0)
  const svg = tree.root.findByProps({className:'qs-curve'})
  await act(async () => svg.props.onPointerMove({ clientX: 48, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 980, height: 400 }) } }))
  let tooltip = tree.root.findByProps({ role: 'tooltip' })
  const pairs = () => Object.fromEntries(tooltip.findAllByType('dt').map((dt, i) => [dt.children.join(''), tooltip.findAllByType('dd')[i].children.join('')]))
  assert.equal(pairs()['累计收益'], '-0.50%')
  assert.equal(pairs()['当前回撤'], '-0.50%')
  assert.equal(pairs()['账户权益'], '995,000 元')
  assert.equal(pairs()['现金'], '95,000 元')
  assert.equal(pairs()['股票市值'], '900,000 元')
  assert.equal(pairs()['持仓数量'], '2 只')
  assert.match(text(tree), /600036.SH/)
  await act(async () => svg.props.onKeyDown({ key: 'End', preventDefault() {} }))
  tooltip = tree.root.findByProps({ role: 'tooltip' })
  assert.equal(pairs()['累计收益'], '0.00%')
  assert.equal(pairs()['当前回撤'], '-9.09%')
  assert.equal(pairs()['实际股票仓位'], '0.00%')
  assert.equal(pairs()['持仓数量'], '0 只')
  assert.match(text(tree), /空仓/)
  await act(async () => tree.root.findByProps({ className: 'qs-curve-wrap' }).props.onPointerLeave())
  assert.equal(tree.root.findAllByProps({ role: 'tooltip' }).length, 0)
  await act(async () => tree.unmount())
})

test('chart never invents missing historical cash or holdings', async () => {
  let tree
  await act(async () => { tree = renderer.create(React.createElement(Curve, { daily: [{ session: '2020-01-02', nav: 100 }] })) })
  await act(async () => tree.root.findByProps({className:'qs-curve'}).props.onFocus())
  assert.match(text(tree), /未记录/)
  assert.match(text(tree), /未保存逐日持仓明细/)
  assert.equal(tree.root.findAllByProps({ className: 'qs-tooltip-holdings' }).length, 0)
  const tooltip = tree.root.findByProps({ role: 'tooltip' })
  const values = Object.fromEntries(tooltip.findAllByType('dt').map((dt, i) => [dt.children.join(''), tooltip.findAllByType('dd')[i].children.join('')]))
  assert.equal(values['累计收益'], '—')
  assert.equal(values['实际股票仓位'], '—')
  await act(async () => tree.unmount())
})

test('fixed latest details equal the final crosshair snapshot and stay fixed when the cursor moves', async () => {
  const daily=[
    {session:'2026-10-16',nav:1000,cash:400,positions:1,daily_return:0,holdings:[{ts_code:'A',security_name:'较早持仓',quantity:100,market_value_cny:600}]},
    {session:'2026-10-19',nav:1100,cash:400,positions:1,daily_return:.1,holdings:[{ts_code:'B',security_name:'最后日持仓',quantity:100,market_value_cny:700,industry_name:'传媒 / 出版',holding_since_session:'2026-10-19',last_rebalance_session:'2026-10-19',average_cost_price:6,unrealized_pnl_cny:100,unrealized_pnl_pct:1/6,daily_price_change_pct:.05,daily_price_change_cny:30}]},
  ]
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(Curve,{daily,initialCash:1000,showLatestDetails:true}))})
    const latest=()=>tree.root.findByProps({'aria-label':'最新明细'})
    const pairs=root=>Object.fromEntries(root.findAllByType('dt').map((dt,i)=>[dt.children.join(''),root.findAllByType('dd')[i].children.join('')]))
    assert.equal(tree.root.findAllByProps({role:'tooltip'}).length,0)
    assert.equal(pairs(latest())['账户权益'],'1,100 元')
    assert.equal(pairs(latest())['累计收益'],'10.00%')
    assert.match(nodeText(latest()),/最后日持仓/)
    await act(async()=>tree.root.findByProps({className:'qs-curve'}).props.onFocus())
    const tooltip=tree.root.findByProps({role:'tooltip'})
    assert.deepEqual(pairs(latest()),pairs(tooltip))
    assert.deepEqual(latest().findAllByType('tbody').map(t=>t.findAllByType('td').map(td=>nodeText(td))),tooltip.findAllByType('tbody').map(t=>t.findAllByType('td').map(td=>nodeText(td))))
    await act(async()=>tree.root.findByProps({className:'qs-curve'}).props.onKeyDown({key:'Home',preventDefault(){}}))
    assert.equal(tree.root.findByProps({role:'tooltip'}).findByType('header').findByType('b').children[0],'2026-10-16')
    assert.equal(pairs(latest())['账户权益'],'1,100 元')
    assert.match(nodeText(latest()),/最后日持仓/)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('shared holding disclosures start collapsed and opening the cursor details pins its own date',async()=>{
  let tree
  try{
    await act(async()=>{tree=renderer.create(React.createElement(Curve,{showLatestDetails:true,initialCash:100,daily:[
      {session:'2026-10-21',nav:100,cash:50,positions:1,holdings:[{ts_code:'A',quantity:10,market_value_cny:50}]},
      {session:'2026-10-22',nav:110,cash:50,positions:1,holdings:[{ts_code:'A',quantity:10,market_value_cny:60}]},
    ]}))})
    const svg=tree.root.findByProps({className:'qs-curve'})
    await act(async()=>svg.props.onFocus())
    const cursor=()=>tree.root.findByProps({role:'tooltip'})
    const latest=tree.root.findByProps({'aria-label':'最新明细'})
    for(const panel of [cursor(),latest]){
      const disclosure=panel.findByProps({className:'qs-tooltip-holdings'})
      assert.equal(disclosure.type,'details');assert.equal(!!disclosure.props.open,false)
      assert.equal(disclosure.findAllByType('summary').length,1)
      assert.equal(disclosure.findAllByType('footer').length,1)
      assert.equal(panel.findAllByType('dl').length,1)
    }
    assert.equal(cursor().parent.props.className,'qs-curve-wrap')
    assert.equal(typeof cursor().props.style.left,'number')
    await act(async()=>cursor().findByType('summary').props.onPointerDown())
    assert.equal(cursor().props['data-pinned'],true)
    await act(async()=>svg.props.onBlur())
    assert.equal(cursor().findByType('header').findByType('b').children[0],'2026-10-22')
    assert.equal(!!latest.findByProps({className:'qs-tooltip-holdings'}).props.open,false)
  }finally{if(tree)await act(async()=>tree.unmount())}
})

test('latest details show final-day cash or missing holdings without falling back to an earlier stock list', async()=>{
  for(const holdings of [[],undefined]){
    let tree
    try{
      await act(async()=>{tree=renderer.create(React.createElement(Curve,{showLatestDetails:true,daily:[{session:'2026-10-16',nav:100,holdings:[{ts_code:'A',security_name:'已经清仓'}]},{session:'2026-10-19',nav:100,cash:100,positions:0,holdings}]}))})
      const latest=tree.root.findByProps({'aria-label':'最新明细'})
      assert.equal(latest.findAllByType('table').length,0)
      assert.doesNotMatch(nodeText(latest),/已经清仓/)
      assert.match(text(tree),holdings?/空仓/:/未保存逐日持仓明细/)
    }finally{if(tree)await act(async()=>tree.unmount())}
  }
})

test('crosshair shows all ten holdings and their own date-specific floating P/L', async () => {
  const holdings = Array.from({ length: 10 }, (_, i) => ({ ts_code: `${600000+i}.SH`, security_name: `股票${i+1}`,
    quantity: (i+1)*100, market_value_cny: (i+1)*1000, average_cost_price: 9,
    unrealized_pnl_cny: i === 9 ? -1234.56 : 100, unrealized_pnl_pct: i === 9 ? -.12 : .1 }))
  delete holdings[8].unrealized_pnl_cny
  delete holdings[8].unrealized_pnl_pct
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(Curve, { initialCash: 100000, daily: [
      { session: '2026-08-19', nav: 100000, holdings, positions: 10 },
      { session: '2026-08-20', nav: 100001, holdings: [], positions: 0 },
    ] })) })
    const svg = tree.root.findByProps({className:'qs-curve'})
    await act(async () => svg.props.onKeyDown({ key: 'Home', preventDefault() {} }))
    let table = tree.root.findByProps({ 'aria-label': '2026-08-19全部持仓与浮盈亏' })
    assert.equal(table.findByType('tbody').findAllByType('tr').length, 10)
    for (const p of holdings) assert.match(text(tree), new RegExp(p.ts_code))
    assert.match(text(tree), /-1,234.56/)
    assert.match(text(tree), /-12.00%/)
    assert.match(text(tree), /\+100/)
    assert.match(text(tree), /未记录/)
    assert.doesNotMatch(text(tree), /最大的6只/)
    assert.match(text(tree), /不含现金分红/)
    await act(async () => svg.props.onKeyDown({ key: 'End', preventDefault() {} }))
    assert.match(text(tree), /空仓/)
    assert.equal(tree.root.findAllByType('tbody').length, 0)
    assert.doesNotMatch(text(tree), /-1,234.56/)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('holdings display daily price percentage and share-scaled amount independently of floating P/L', async () => {
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(Curve, { daily: [
      { session: '2026-10-19', nav: 10000, holdings: [
        { ts_code: 'A', daily_price_change_pct: .025, daily_price_change_cny: 125, unrealized_pnl_cny: -500 },
        { ts_code: 'B', daily_price_change_pct: -.01, daily_price_change_cny: -60 },
        { ts_code: 'C', daily_price_change_pct: 0, daily_price_change_cny: 0 },
        { ts_code: 'D', daily_price_change_status: 'MISSING_PREVIOUS_CLOSE' },
        { ts_code: 'E', daily_price_change_status: 'SHARE_ADJUSTMENT' },
        { ts_code: 'F', daily_price_change_status: 'MISSING_MARK' },
      ] },
    ] })) })
    await act(async () => tree.root.findByProps({className:'qs-curve'}).props.onFocus())
    assert.match(text(tree), /较上个交易日涨跌幅 \/ 金额/)
    const cells = tree.root.findByType('tbody').findAllByType('tr').map(row => row.findAllByType('td')[5])
    assert.equal(cells[0].children[0], '+2.50%')
    assert.equal(cells[0].findByType('small').children.join(''), '+125 元')
    assert.equal(cells[0].props.className, 'qs-holding-profit')
    assert.equal(cells[1].children[0], '-1.00%')
    assert.equal(cells[1].findByType('small').children.join(''), '-60 元')
    assert.equal(cells[1].props.className, 'qs-holding-loss')
    assert.equal(cells[2].children[0], '0.00%')
    assert.equal(cells[2].props.className, '')
    assert.equal(cells[3].findByType('small').children.join(''), '未记录')
    assert.equal(cells[4].findByType('small').children.join(''), '送转待核对')
    assert.equal(cells[5].findByType('small').children.join(''), '估值沿用')
    assert.match(text(tree), /-500/)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('crosshair preserves continuing holding slots across prices, substitutions and reverse navigation', async () => {
  const p = (ts_code, value = 100) => ({ ts_code, market_value_cny: value, quantity: 10,
    holding_since_session: '2025-06-24', last_rebalance_session: '2026-07-08' })
  const daily = [
    { session: '2026-07-08', nav: 1000, holdings: [p('C'), p('B'), p('A')] },
    { session: '2026-07-09', nav: 1001, holdings: [p('B', 900), p('A', 1), p('C', 500)] },
    // A lower-code new name replaces B without moving A or C.
    { session: '2026-10-13', nav: 1002, holdings: [p('0'), p('C'), p('A')] },
    { session: '2026-10-14', nav: 1003, holdings: [p('C'), p('A')] },
    { session: '2026-10-15', nav: 1004 }, // missing snapshot must not mean an exit
    { session: '2026-10-16', nav: 1005, holdings: [p('D'), p('C'), p('A')] },
    { session: '2026-10-19', nav: 1006, holdings: [] },
  ]
  const original = JSON.stringify(daily)
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(Curve, { daily })) })
    const svg = tree.root.findByProps({className:'qs-curve'})
    const key = async key => act(async () => svg.props.onKeyDown({ key, preventDefault() {} }))
    const order = () => tree.root.findByType('tbody').findAllByType('tr').map(row => row.findAllByType('b')[0]?.children[0] ?? null)
    await key('Home')
    assert.deepEqual(order(), ['A', 'B', 'C'])
    await key('ArrowRight')
    assert.deepEqual(order(), ['A', 'B', 'C'])
    await key('ArrowRight')
    assert.deepEqual(order(), ['A', '0', 'C'])
    assert.match(text(tree), /2025-06-24/)
    assert.match(text(tree), /最近买卖/)
    assert.match(text(tree), /2026-07-08/)
    await key('ArrowRight')
    assert.deepEqual(order(), ['A', null, 'C'])
    await key('ArrowRight')
    assert.equal(tree.root.findAllByType('tbody').length, 0)
    await key('ArrowRight')
    assert.deepEqual(order(), ['A', 'D', 'C'])
    await key('Home')
    assert.deepEqual(order(), ['A', 'B', 'C'])
    await key('End')
    assert.equal(tree.root.findAllByType('tbody').length, 0)
    assert.equal(JSON.stringify(daily), original)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('crosshair keeps moving left, while deliberate pinning holds the date until dismissed', async () => {
  let tree
  const pointer = clientX => ({ clientX, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 980, height: 340 }) } })
  try {
    await act(async () => { tree = renderer.create(React.createElement(Curve, { daily: [
      { session: '2026-01-02', nav: 100, holdings: [] },
      { session: '2026-01-05', nav: 101, holdings: [] },
      { session: '2026-01-06', nav: 102, holdings: [] },
    ] })) })
    const svg = tree.root.findByProps({className:'qs-curve'})
    const date = () => tree.root.findByProps({ role: 'tooltip' }).findByType('header').findByType('b').children[0]
    await act(async () => svg.props.onPointerMove(pointer(932)))
    assert.equal(date(), '2026-01-06')
    await act(async () => svg.props.onPointerMove(pointer(490)))
    assert.equal(date(), '2026-01-05')
    await act(async () => svg.props.onPointerMove(pointer(48)))
    assert.equal(date(), '2026-01-02')
    assert.equal(tree.root.findByProps({ role: 'tooltip' }).props['data-pinned'], false)
    await act(async () => svg.props.onPointerDown(pointer(490)))
    assert.equal(date(), '2026-01-05')
    assert.equal(tree.root.findByProps({ role: 'tooltip' }).props['data-pinned'], true)
    await act(async () => { svg.props.onPointerMove(pointer(48)); svg.props.onBlur(); tree.root.findByProps({ className: 'qs-curve-wrap' }).props.onPointerLeave() })
    assert.equal(date(), '2026-01-05')
    await act(async () => tree.root.findByProps({ 'aria-label': '关闭持仓明细' }).props.onClick())
    assert.equal(tree.root.findAllByProps({ role: 'tooltip' }).length, 0)
    await act(async () => { svg.props.onFocus(); svg.props.onKeyDown({ key: 'Escape' }) })
    assert.equal(tree.root.findAllByProps({ role: 'tooltip' }).length, 0)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('real component switches categories, displays evidence, submits holdings and restores persisted signals', async () => {
  const calls = []
  const signal = { calculation_mode: 'FULL_LOCAL_REBUILD_V3', capital_cny: 2000000, as_of: '2026-10-12', signal_date: '2026-10-12', due: true, target_exposure: .98,
    model_positions: [{ ts_code: '600036.SH', security_name: '招商银行', quantity: 100, close: 42.76, market_value_cny: 4276 }],
    targets: [], orders: [{ ts_code: '600036.SH', security_name: '招商银行', current_quantity: 100, target_quantity: 200, delta_quantity: 100, weight: .1 }],
    warnings: ['晚采财务不回填历史'], input_bindings: [{ factor_id: 'quality', end: '2026-10-12', release_id: 'sha256:abc' }],
    historical_replay: { summary: metrics, daily: [{ session: '2020-01-02', nav: 100 }, { session: '2026-10-12', nav: 130 }], annual: [{ year: 2026, return: .1 }] }, execution_note: '参考数量，次日执行',
  }
  globalThis.fetch = async (url, options) => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    calls.push({ path, options })
    let payload
    if (path === 'quality-strategies') payload = { categories: [{ id: 'SMALL_CAP', name: '小市值' }, { id: 'BANK', name: '银行' }, { id: 'FACTOR_WEIGHTED', name: '因子加权' }], items }
    else if (path.endsWith('/calculate')) payload = { job_id: 'job-1', status: 'RUNNING', progress: 0 }
    else if (path === 'quality-strategies/candidate-1') payload = { ...detail(items[1]), calculation_state: 'UP_TO_DATE', signal, latest_job: { job_id: 'saved-job', status: 'PASS' } }
    else payload = detail(items.find(i => path.endsWith(i.strategy_id)))
    return { ok: true, json: async () => payload }
  }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
  assert.match(text(tree), /小市值质量＋影子/)
  assert.equal(tree.root.findAllByType('svg').length, 0)
  assert.doesNotMatch(text(tree), /-15.00%/)
  const requestsBeforeSameCard = calls.length
  await act(async () => tree.root.findByProps({ className: 'qs-candidate selected' }).props.onClick())
  assert.equal(calls.length, requestsBeforeSameCard)
  assert.equal(tree.root.findAllByType('svg').length, 0)
  await act(async () => { button(tree.root, '银行').props.onClick(); await Promise.resolve() })
  assert.match(text(tree), /银行质量股息/)
  assert.doesNotMatch(text(tree), /模型参考持仓|最近信号的目标组合／数量差额|招商银行/)
  assert.match(text(tree), /行情截至/)
  assert.match(text(tree), /晚采财务不回填历史/)
  assert.match(text(tree), /2,000,000/)
  await act(async () => { button(tree.root, '因子加权').props.onClick(); await Promise.resolve() })
  await act(async () => { tree.root.findByType('textarea').props.onChange({ target: { value: '600036.SH 100 unexpected' } }) })
  await act(async () => { button(tree.root, '回测／更新').props.onClick(); await Promise.resolve() })
  assert.match(text(tree), /持仓每行填写/)
  assert.equal(calls.some(c => c.path.endsWith('/calculate')), false)
  await act(async () => {
    tree.root.findAllByType('input').find(n => n.props.type === 'number').props.onChange({ target: { value: '2000000' } })
    tree.root.findAllByType('input').find(n => n.props.type === 'date' && !n.props['aria-label']).props.onChange({ target: { value: '2026-10-12' } })
    tree.root.findByType('textarea').props.onChange({ target: { value: '600036.SH 100' } })
  })
  await act(async () => { button(tree.root, '回测／更新').props.onClick(); await Promise.resolve() })
  const sent = calls.find(c => c.path.endsWith('/calculate'))
  assert.equal(sent.path, 'quality-strategies/candidate-2/calculate')
  assert.deepEqual(JSON.parse(sent.options.body), { rebuild_factors: false, start: '2020-01-02', capital_cny: 2000000, as_of: '2026-10-12', current_holdings: [{ ts_code: '600036.SH', quantity: 100 }] })
  assert.equal(button(tree.root, '正在计算').props.disabled, true)
  assert.equal(tree.root.findByProps({ 'aria-label': '全量重算运行状态' }).type, 'section')
  assert.equal(tree.root.findByType('textarea').props.disabled, true)
  assert.equal(tree.root.findAllByType('input').find(n => n.props.type === 'number').props.disabled, true)
  await act(async () => tree.unmount())
})

test('every quality category displays industry in the shared holding identity, with an explicit missing label', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { ...originalWindow, localStorage: { getItem: () => null, setItem() {} } }
  const categories = [{ id: 'SMALL_CAP', name: '小市值' }, { id: 'BANK', name: '银行' }, { id: 'FACTOR_WEIGHTED', name: '因子加权' }]
  const industries = ['纺织服饰 / 服装家纺', '银行 / 股份制银行', '传媒 / 出版']
  globalThis.fetch = async url => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    const index = items.findIndex(item => path.endsWith(item.strategy_id))
    if (path === 'quality-strategies') return { ok: true, json: async () => ({ categories, items }) }
    const daily = [{ session: '2026-10-19', nav: 1000, holdings: [
        { ts_code: 'A', security_name: '已知板块股票', industry_name: industries[index], industry_l3_name: '三级行业', industry_in_date: '2020-01-01' },
        { ts_code: 'B', security_name: '未知板块股票' },
      ] }]
    return { ok: true, json: async () => ({ ...detail(items[index]), signal: {
      calculation_mode: 'FULL_LOCAL_REBUILD_V3', as_of: '2026-10-19', model_positions: [], targets: [], orders: [], warnings: [], input_bindings: [], execution_note: '参考持仓',
      historical_replay: { summary: metrics, daily, annual: [] },
    } }) }
  }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    for (let index = 0; index < categories.length; index++) {
      if (index) await act(async () => { button(tree.root, categories[index].name).props.onClick(); await Promise.resolve() })
      const latest = tree.root.findByProps({ 'aria-label': '最新明细' })
      const labels = latest.findAllByProps({ className: 'qs-holding-industry' })
      assert.equal(labels[0].children.join(''), industries[index])
      assert.match(labels[0].props.title, /申万行业.*三级行业.*2020-01-01/)
      assert.equal(labels[1].children.join(''), '板块未记录')
    }
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = originalWindow }
})

test('component exposes a server error instead of displaying a successful signal', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ detail: '证据哈希不一致' }) })
  let tree
  await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
  assert.match(text(tree), /证据哈希不一致/)
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 1)
  await act(async () => tree.unmount())
})

test('archive block is removed and legacy accounts never become latest details', async () => {
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    const payload = String(url).split('?')[0].endsWith('/quality-strategies')
      ? { categories: [{ id: 'SMALL_CAP', name: '小市值' }], items: [items[0]] }
      : { ...detail(items[0]), calculation_state: 'LEGACY_INPUTS', signal: {
        as_of: '2026-10-12', model_positions: [{ ts_code: '600036.SH', security_name: '过期持仓' }],
        historical_replay: { summary: metrics, daily: [], annual: [] }, warnings: [],
      } }
    return { ok: true, json: async () => payload }
  }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
  assert.match(text(tree), /待全量重算/)
  assert.doesNotMatch(text(tree), /过期持仓/)
  assert.equal(tree.root.findAllByProps({ className: 'qs-history-evidence' }).length, 0)
  assert.equal(tree.root.findAllByProps({ 'aria-label': '最新明细' }).length, 0)
  assert.doesNotMatch(text(tree), /历史归档与对照/)
  assert.equal(calls.some(path => path.endsWith('/calculate')), false)
  assert.equal(button(tree.root, '本次同规则复算'), undefined)
  await act(async () => tree.unmount())
})

test('source polling marks corrected data as requiring a rebuild without launching calculation', async () => {
  const originalWindow = globalThis.window
  const timers = []
  globalThis.window = { setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearInterval: () => {} }
  let changed = false, posts = 0, tree
  const signal = { calculation_mode: 'FULL_LOCAL_REBUILD_V3', capital_cny: 1000000, as_of: '2026-10-14', signal_date: '2026-10-12', due: false,
    target_exposure: .98, model_positions: [], targets: [], orders: [], warnings: [], input_bindings: [], execution_note: '参考组合',
    historical_replay: { summary: metrics, daily: detail(items[0]).daily, annual: [] } }
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') posts++
    const state = changed ? 'STALE' : 'UP_TO_DATE'
    const payload = String(url).split('?')[0].endsWith('/quality-strategies')
      ? { categories: [{ id: 'SMALL_CAP', name: '小市值' }], items: [{ ...items[0], calculation_state: state }] }
      : { ...detail(items[0]), calculation_state: state, signal }
    return { ok: true, json: async () => payload }
  }
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.match(text(tree), /全量重算已更新/)
    changed = true
    await act(async () => { await timers.find(t => t.ms === 30000).fn() })
    assert.match(text(tree), /来源或规则变化，待重算/)
    assert.match(text(tree), /请重算后再用于当前决策/)
    assert.equal(posts, 0)
  } finally {
    if (tree) await act(async () => tree.unmount())
    globalThis.window = originalWindow
  }
})

test('StrictMode ignores its abandoned initialization and loads the right panel once', async () => {
  const initialRequests = [], detailRequests = []
  globalThis.fetch = url => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    if (path === 'quality-strategies') return new Promise(resolve => initialRequests.push(resolve))
    detailRequests.push(path)
    return Promise.resolve({ ok: true, json: async () => detail(items[0]) })
  }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(React.StrictMode, null, React.createElement(QualityStrategies))) })
  assert.equal(initialRequests.length, 1)
  const response = () => ({ ok: true, json: async () => ({ categories: [{ id: 'SMALL_CAP', name: '小市值' }], items: [items[0]] }) })
  await act(async () => { initialRequests[0](response()); await Promise.resolve() })
  const panel = tree.root.findByProps({ className: 'qs-detail-content' })
  assert.deepEqual(detailRequests, ['quality-strategies/candidate-0'])
  assert.equal(tree.root.findByProps({ className: 'qs-detail-content' }), panel)
  assert.equal(tree.root.findByProps({ className: 'qs-detail' }).props['aria-busy'], false)
  await act(async () => tree.unmount())
})

test('switching keeps the panel mounted and stale same-strategy responses cannot replace the latest selection', async () => {
  const pending = []
  let holdDetails = false
  globalThis.fetch = url => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    if (path === 'quality-strategies') return Promise.resolve({ ok: true, json: async () => ({
      categories: [{ id: 'SMALL_CAP', name: '小市值' }, { id: 'BANK', name: '银行' }, { id: 'FACTOR_WEIGHTED', name: '因子加权' }], items,
    }) })
    const item = items.find(i => path.endsWith(i.strategy_id))
    if (!holdDetails) return Promise.resolve({ ok: true, json: async () => detail(item) })
    return new Promise(resolve => pending.push({ item, resolve }))
  }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
  const panel = tree.root.findByProps({ className: 'qs-detail-content' })
  holdDetails = true
  await act(async () => button(tree.root, '银行').props.onClick())
  assert.equal(tree.root.findByProps({ className: 'qs-detail-content' }), panel)
  assert.equal(panel.props.inert, true)
  assert.equal(tree.root.findAllByType('svg').length, 0)
  await act(async () => button(tree.root, '因子加权').props.onClick())
  // Simulate a source/job invalidation while both earlier requests are pending.
  invalidateQualityReads()
  await act(async () => button(tree.root, '银行').props.onClick())
  await act(async () => pending[2].resolve({ ok: true, json: async () => ({ ...detail(items[1]), notes: '当前正确结果' }) }))
  assert.match(text(tree), /当前正确结果/)
  assert.equal(panel.props.inert, undefined)
  await act(async () => {
    pending[0].resolve({ ok: true, json: async () => ({ ...detail(items[1]), notes: '同一银行的过期请求' }) })
    pending[1].resolve({ ok: true, json: async () => detail(items[2]) })
  })
  assert.match(text(tree), /当前正确结果/)
  assert.doesNotMatch(text(tree), /同一银行的过期请求/)
  assert.equal(tree.root.findByProps({ className: 'qs-detail-content' }), panel)
  await act(async () => tree.unmount())
})

test('refresh restores category and strategy, with a safe fallback for a deleted saved strategy', async () => {
  const originalWindow = globalThis.window
  const storage = new Map([['alpha-research.quality-selection', JSON.stringify({ category: 'BANK', strategy_id: 'candidate-1' })]])
  globalThis.window = { ...originalWindow, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } }
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).split('?')[0].endsWith('/quality-strategies')
    ? { categories: [{ id: 'SMALL_CAP', name: '小市值' }, { id: 'BANK', name: '银行' }, { id: 'FACTOR_WEIGHTED', name: '因子加权' }], items }
    : detail(items.find(i => String(url).split('?')[0].endsWith(i.strategy_id))) })
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.equal(button(tree.root, '银行').props['aria-pressed'], true)
    assert.match(tree.root.findByProps({ className: 'qs-candidate selected' }).findByProps({ className: 'qs-candidate-heading' }).findByType('b').children.join(''), /银行质量股息/)
    await act(async () => button(tree.root, '因子加权').props.onClick())
    assert.deepEqual(JSON.parse(storage.get('alpha-research.quality-selection')), { category: 'FACTOR_WEIGHTED', strategy_id: 'candidate-2' })
    await act(async () => tree.unmount())
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.equal(button(tree.root, '因子加权').props['aria-pressed'], true)
    await act(async () => tree.unmount())
    storage.set('alpha-research.quality-selection', JSON.stringify({ category: 'BANK', strategy_id: 'deleted' }))
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.equal(button(tree.root, '银行').props['aria-pressed'], true)
    assert.match(text(tree), /银行质量股息/)
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = originalWindow }
})

test('history input-gap warning exposes recorded cash periods without claiming successful timing', async () => {
  const signal = { calculation_mode: 'FULL_LOCAL_REBUILD_V3', as_of: '2026-10-14', signal_date: '2026-10-12', due: false,
    target_exposure: .98, model_positions: [], targets: [], orders: [], input_bindings: [], execution_note: '',
    warnings: ['2026年历史质量覆盖缺口影响曲线'], historical_replay: { summary: metrics, annual: [],
      daily: [{ session: '2026-07-07', nav: 100, positions: 10 }, { session: '2026-07-08', nav: 100, positions: 0 },
        { session: '2026-10-12', nav: 100, positions: 0 }, { session: '2026-10-13', nav: 101, positions: 10 }] } }
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).split('?')[0].endsWith('/quality-strategies')
    ? { categories: [{ id: 'SMALL_CAP', name: '小市值' }], items: [items[0]] }
    : { ...detail(items[0]), signal, calculation_state: 'UP_TO_DATE' } })
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    const note = tree.root.findByProps({ className: 'qs-history-gap' })
    assert.equal(note.props.role, 'note')
    const period = note.findByType('span').children.join('')
    assert.match(period, /2026-07-08 → 2026-10-12/)
    assert.match(period, /2个交易日/)
    assert.match(note.findByType('b').children.join(''), /空仓不能直接解释为成功避险/)
  } finally { if (tree) await act(async () => tree.unmount()) }
})

test('original quarterly variants share the comparison entry while preserving independent results and saved count', async () => {
  const originalWindow = globalThis.window
  const storage = new Map()
  globalThis.window = { ...originalWindow, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } }
  const quarters = [10, 5].map(count => ({ ...items[2], strategy_id: `factor-sharpe-quarter${count}`,
    name: `季度${count}股`, target_count: count, schedule: 'QUARTER', allocation: 'INVERSE_RESVOL', calculation_state: 'UP_TO_DATE' }))
  const variants = [...quarters,
    { ...quarters[0], strategy_id: 'factor-sharpe-quarter-missing10', name: '两项合用', evidence_version: 'MISSING_INPUT_DIAGNOSTIC' },
    { ...quarters[0], strategy_id: 'factor-sharpe-quarter-missing-tp50-10', name: '两项合用＋50%止盈', evidence_version: 'TAKE_PROFIT_DIAGNOSTIC' }]
  const requests = []
  globalThis.fetch = async url => {
    const path = String(url).split('?')[0].split('/api/v1/')[1]
    requests.push(path)
    if (path === 'quality-strategies') return { ok: true, json: async () => ({ categories: [{ id: 'FACTOR_WEIGHTED', name: '因子加权' }], items: variants }) }
    const item = variants.find(row => path.endsWith(row.strategy_id))
    const summary = { total_return: item.strategy_id === 'factor-sharpe-quarter-missing10' ? .6 : item.target_count === 5 ? .25 : .5 }
    return { ok: true, json: async () => ({ ...detail(item), daily: [], signal: { calculation_mode: 'FULL_LOCAL_REBUILD_V3',
      as_of: '2026-10-14', signal_date: '2026-09-30', due: false, target_exposure: .882, warnings: [],
      input_bindings: [], execution_note: '', historical_replay: { summary, annual: [],
        daily: [{ session: '2026-01-02', nav: 100 }, { session: '2026-10-14', nav: item.target_count === 5 ? 125 : 150 }] } } }) }
  }
  let tree
  try {
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    const variantNav = () => tree.root.findByProps({ 'aria-label': '持股数量切换' })
    const candidates = () => tree.root.findByProps({ className: 'qs-candidates' }).findAllByType('button')
    const categoryCount = () => tree.root.findByProps({ 'aria-label': '策略分类' }).findByType('small').children.join('')
    assert.equal(candidates().length, 1)
    assert.equal(categoryCount(), '1')
    assert.equal(candidates()[0].findByProps({ className: 'qs-candidate-heading' }).findByType('b').children.join(''), '历史夏普加权 · 权重与规则对照')
    assert.match(candidates()[0].findByProps({ className: 'qs-candidate-variant' }).children.join(''), /原季度（未作缺失修正） · 10股/)
    const rules = () => tree.root.findByProps({ 'aria-label': '缺失处理方案切换' }).findAllByType('button')
    assert.deepEqual(rules().map(nodeText), ['原季度（未作缺失修正）', '两项合用', '2016—2019权重＋50%止盈'])
    assert.deepEqual(variantNav().findAllByType('button').map(b => b.children.join('')), ['5股', '10股'])
    assert.match(text(tree), /50.00%/)
    await act(async () => { variantNav().findAllByType('button')[0].props.onClick(); await Promise.resolve() })
    assert.equal(variantNav().findAllByType('button')[0].props['aria-pressed'], true)
    assert.equal(candidates().length, 1)
    assert.equal(candidates()[0].props['aria-pressed'], true)
    assert.match(candidates()[0].findByProps({ className: 'qs-candidate-variant' }).children.join(''), /原季度（未作缺失修正） · 5股/)
    const beforeReselect = requests.length
    await act(async () => { candidates()[0].props.onClick(); await Promise.resolve() })
    assert.equal(requests.length, beforeReselect)
    assert.match(text(tree), /25.00%/)
    assert.doesNotMatch(text(tree), /50.00%/)
    assert.equal(tree.root.findAllByProps({className:'qs-curve'}).length, 1)
    assert.equal(JSON.parse(storage.get('alpha-research.quality-selection')).strategy_id, 'factor-sharpe-quarter5')
    await act(async () => tree.unmount())
    await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
    assert.equal(variantNav().findAllByType('button')[0].props['aria-pressed'], true)
    assert.match(text(tree), /25.00%/)
    await act(async () => { variantNav().findAllByType('button')[1].props.onClick(); await Promise.resolve() })
    assert.equal(variantNav().findAllByType('button')[1].props['aria-pressed'], true)
    assert.match(text(tree), /50.00%/)
    await act(async () => { rules()[1].props.onClick(); await Promise.resolve() })
    assert.match(text(tree), /60.00%/)
    assert.equal(candidates().length, 1)
    assert.equal(tree.root.findAllByProps({ 'aria-label': '持股数量切换' }).length, 0)
    await act(async () => { rules()[0].props.onClick(); await Promise.resolve() })
    assert.match(text(tree), /50.00%/)
    assert.equal(variantNav().findAllByType('button')[1].props['aria-pressed'], true)
    assert.ok(requests.includes('quality-strategies/factor-sharpe-quarter5'))
    assert.ok(requests.includes('quality-strategies/factor-sharpe-quarter10'))
    assert.ok(!requests.some(path => path.endsWith('/calculate')))
  } finally { if (tree) await act(async () => tree.unmount()); globalThis.window = originalWindow }
})
