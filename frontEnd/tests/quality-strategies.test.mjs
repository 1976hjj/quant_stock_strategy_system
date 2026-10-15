import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import renderer from 'react-test-renderer'
import QualityStrategies, { CalculationStatus, Curve } from '../.quality-test-build/QualityStrategies.js'

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
  const svg = tree.root.findByType('svg')
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
  await act(async () => tree.root.findByType('svg').props.onFocus())
  assert.match(text(tree), /未记录/)
  assert.match(text(tree), /未保存逐日持仓明细/)
  assert.equal(tree.root.findAllByProps({ className: 'qs-tooltip-holdings' }).length, 0)
  const tooltip = tree.root.findByProps({ role: 'tooltip' })
  const values = Object.fromEntries(tooltip.findAllByType('dt').map((dt, i) => [dt.children.join(''), tooltip.findAllByType('dd')[i].children.join('')]))
  assert.equal(values['累计收益'], '—')
  assert.equal(values['实际股票仓位'], '—')
  await act(async () => tree.unmount())
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
    const svg = tree.root.findByType('svg')
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
    const svg = tree.root.findByType('svg')
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
    const svg = tree.root.findByType('svg')
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
    const path = String(url).split('/api/v1/')[1]
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
  assert.equal(tree.root.findAllByType('svg').length, 1)
  assert.match(text(tree), /-15.00%/)
  const requestsBeforeSameCard = calls.length
  await act(async () => tree.root.findByProps({ className: 'qs-candidate selected' }).props.onClick())
  assert.equal(calls.length, requestsBeforeSameCard)
  assert.equal(tree.root.findAllByType('svg').length, 1)
  await act(async () => { button(tree.root, '银行').props.onClick(); await Promise.resolve() })
  assert.match(text(tree), /银行质量股息/)
  assert.match(text(tree), /招商银行/)
  assert.match(text(tree), /晚采财务不回填历史/)
  assert.match(text(tree), /2,000,000/)
  await act(async () => { button(tree.root, '因子加权').props.onClick(); await Promise.resolve() })
  await act(async () => { tree.root.findByType('textarea').props.onChange({ target: { value: '600036.SH 100 unexpected' } }) })
  await act(async () => { button(tree.root, '全量重算／更新').props.onClick(); await Promise.resolve() })
  assert.match(text(tree), /持仓每行填写/)
  assert.equal(calls.some(c => c.path.endsWith('/calculate')), false)
  await act(async () => {
    tree.root.findAllByType('input').find(n => n.props.type === 'number').props.onChange({ target: { value: '2000000' } })
    tree.root.findAllByType('input').find(n => n.props.type === 'date').props.onChange({ target: { value: '2026-10-12' } })
    tree.root.findByType('textarea').props.onChange({ target: { value: '600036.SH 100' } })
  })
  await act(async () => { button(tree.root, '全量重算／更新').props.onClick(); await Promise.resolve() })
  const sent = calls.find(c => c.path.endsWith('/calculate'))
  assert.equal(sent.path, 'quality-strategies/candidate-2/calculate')
  assert.deepEqual(JSON.parse(sent.options.body), { capital_cny: 2000000, as_of: '2026-10-12', current_holdings: [{ ts_code: '600036.SH', quantity: 100 }] })
  assert.equal(button(tree.root, '正在计算').props.disabled, true)
  assert.equal(tree.root.findByProps({ 'aria-label': '全量重算运行状态' }).type, 'section')
  assert.equal(tree.root.findByType('textarea').props.disabled, true)
  assert.equal(tree.root.findAllByType('input').find(n => n.props.type === 'number').props.disabled, true)
  await act(async () => tree.unmount())
})

test('component exposes a server error instead of displaying a successful signal', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ detail: '证据哈希不一致' }) })
  let tree
  await act(async () => { tree = renderer.create(React.createElement(QualityStrategies)); await Promise.resolve() })
  assert.match(text(tree), /证据哈希不一致/)
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 1)
  await act(async () => tree.unmount())
})

test('legacy replay is kept in collapsed history and never shown as a current signal', async () => {
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    const payload = String(url).endsWith('/quality-strategies')
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
  const history = tree.root.findByProps({ className: 'qs-history-evidence' })
  assert.equal(history.props.open, undefined)
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
    const payload = String(url).endsWith('/quality-strategies')
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
    const path = String(url).split('/api/v1/')[1]
    if (path === 'quality-strategies') return new Promise(resolve => initialRequests.push(resolve))
    detailRequests.push(path)
    return Promise.resolve({ ok: true, json: async () => detail(items[0]) })
  }
  let tree
  await act(async () => { tree = renderer.create(React.createElement(React.StrictMode, null, React.createElement(QualityStrategies))) })
  assert.equal(initialRequests.length, 2)
  const response = () => ({ ok: true, json: async () => ({ categories: [{ id: 'SMALL_CAP', name: '小市值' }], items: [items[0]] }) })
  await act(async () => { initialRequests[1](response()); await Promise.resolve() })
  const panel = tree.root.findByProps({ className: 'qs-detail-content' })
  await act(async () => { initialRequests[0](response()); await Promise.resolve() })
  assert.deepEqual(detailRequests, ['quality-strategies/candidate-0'])
  assert.equal(tree.root.findByProps({ className: 'qs-detail-content' }), panel)
  assert.equal(tree.root.findByProps({ className: 'qs-detail' }).props['aria-busy'], false)
  await act(async () => tree.unmount())
})

test('switching keeps the panel mounted and stale same-strategy responses cannot replace the latest selection', async () => {
  const pending = []
  let holdDetails = false
  globalThis.fetch = url => {
    const path = String(url).split('/api/v1/')[1]
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
  assert.equal(tree.root.findAllByType('svg').length, 1)
  await act(async () => button(tree.root, '因子加权').props.onClick())
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
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).endsWith('/quality-strategies')
    ? { categories: [{ id: 'SMALL_CAP', name: '小市值' }, { id: 'BANK', name: '银行' }, { id: 'FACTOR_WEIGHTED', name: '因子加权' }], items }
    : detail(items.find(i => String(url).endsWith(i.strategy_id))) })
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
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).endsWith('/quality-strategies')
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
