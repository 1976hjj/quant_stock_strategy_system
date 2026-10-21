import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STRATEGY_API_ROOT } from './strategyApi'
import type { TakeProfit } from './strategyApi'
import ChartTimeRange, { useChartTimeRange } from './ChartTimeRange'

type Metrics = { total_return?: number; annualized_return?: number; maximum_drawdown?: number; sharpe?: number }
type Day = { session: string; nav: number; cash?: number; positions?: number; daily_return?: number; actual_stock_exposure?: number; dividend_cash?: number; cost?: number; missing_marks?: number; holdings?: Position[] }
type Job = { job_id: string; status: string; phase?: string; progress?: number; error?: string; created_at?: string; finished_at?: string; current_session?: string; processed_sessions?: number; total_sessions?: number }
type Position = { ts_code: string; security_name?: string; industry_name?: string | null; industry_l3_name?: string | null; industry_in_date?: string; industry_out_date?: string | null; quantity?: number; close?: number; market_value_cny?: number; cost_basis_cny?: number; average_cost_price?: number; unrealized_pnl_cny?: number; unrealized_pnl_pct?: number; daily_price_change_pct?: number; daily_price_change_cny?: number; daily_price_change_status?: string; holding_since_session?: string; last_rebalance_session?: string; weight?: number; rank?: number; score?: number }
type Signal = { calculation_mode?: string; created_at?: string; capital_cny?: number; as_of: string; signal_date: string; next_execution_date?: string | null; due: boolean; target_exposure: number; model_positions: Position[]; targets: Position[]; orders: Array<Position & { current_quantity: number; target_quantity: number; delta_quantity: number; legal_delta_quantity?: number }>; warnings: string[]; input_bindings: Array<{ factor_id: string; end: string; release_id: string }>; historical_replay: { initial_cash_cny?: number; summary: Metrics; daily: Day[]; annual: Array<{ year: number; return: number }>; take_profit?: TakeProfit | null }; execution_note: string }
type ScoreRuleView = { factor_id: string; direction: string; weight: number; missing_policy?: string }
type Candidate = { weight_training?: { start: string; end: string; application?: string }; calculation_policy?: string; display_score_rules?: ScoreRuleView[]; information_clock?: string; calculation_state?: string; input_access_policy?: string; latest_calculation_mode?: string; latest_summary?: Metrics | null; latest_as_of?: string | null; released_input_end?: string | null; fixed_exposure?: number | null; strategy_id: string; category: string; version: number; name: string; notes: string; evidence_version: string; target_count: number; rebalance_sessions: number; schedule: string; allocation: string; start: string; end: string; summary: Metrics; evidence_error?: string; latest_job?: Job | null }
type Detail = Candidate & { initial_cash_cny?: number; daily: Day[]; annual: Array<{ year: number; return: number }>; signal?: Signal | null; take_profit?: TakeProfit | null; request: { take_profit_policy?: string; minimum_cash_fraction: number; score_rules: Array<{ factor_id: string; direction: string; weight: number; missing_policy?: string }>; risk_input_policy?: string; universe_segments: string[]; shadow_health: { experiment_variant: string } }; related_evidence: Array<{ label: string; start: string; end: string; summary: Metrics }> }

const SELECTION_STORAGE_KEY = 'alpha-research.quality-selection'
function savedSelection(): { category: string; strategy_id?: string } {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SELECTION_STORAGE_KEY) || 'null')
    if (stored && ['SMALL_CAP', 'BANK', 'FACTOR_WEIGHTED'].includes(stored.category)) {
      return { category: stored.category, strategy_id: typeof stored.strategy_id === 'string' ? stored.strategy_id : undefined }
    }
  } catch { /* Browser storage may be unavailable; default without blocking the page. */ }
  return { category: 'SMALL_CAP' }
}

async function request<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(`${STRATEGY_API_ROOT}/${path}`, payload === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const result = await response.json()
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : result.detail ? JSON.stringify(result.detail) : result.error || `请求失败 ${response.status}`)
  return result as T
}
const hasResearchReplay = (item: Candidate) => ['MISSING_INPUT_DIAGNOSTIC', 'TAKE_PROFIT_DIAGNOSTIC', 'WEIGHT_REFIT_DIAGNOSTIC'].includes(item.evidence_version)
const trainingPeriod = (item: Candidate) => item.weight_training
  ? `${item.weight_training.start.slice(0, 4)}—${item.weight_training.end.slice(0, 4)}`
  : item.category === 'FACTOR_WEIGHTED' && item.strategy_id.startsWith('factor-sharpe-') ? '2016—2019' : undefined
const factorNames: Record<string, string> = {
  'jqdata-share-turnover-monthly': '月换手率', 'jqdata-nonlinear-size': '非线性市值',
  'jqdata-dividend-yield-ttm': '股息率TTM', 'jqdata-resvol': '残差波动率',
  'jqdata-book-to-price-ratio': 'B/P（净资产/市值）',
  'jqdata-natural-log-of-market-cap': '对数市值', 'jqdata-gross-margin-ttm': '毛利率TTM',
}
const candidateMetrics = (item: Candidate) => item.latest_calculation_mode === 'FULL_LOCAL_REBUILD_V3' ? item.latest_summary : hasResearchReplay(item) ? item.summary : undefined
const pct = (v?: number) => v == null ? '—' : `${(v * 100).toFixed(2)}%`
const num = (v?: number, digits = 2) => v == null ? '—' : v.toLocaleString('zh-CN', { maximumFractionDigits: digits })
const signedNum = (v?: number) => v == null ? '未记录' : `${v > 0 ? '+' : ''}${num(v)}`
const isCalculating = (job?: Job | null) => job?.status === 'RUNNING' || job?.status === 'STARTING'

const missingComparisonLabels: Record<string, string> = {
  'factor-sharpe-quarter-divmissing10': '股息未知最低分',
  'factor-sharpe-quarter-haltrisk10': '停牌风险重算',
  'factor-sharpe-quarter-missing10': '两项合用',
  'factor-sharpe-quarter-missing-tp50-10': '2016—2019权重＋50%止盈',
  'factor-sharpe-quarter-refit2020-2025-tp50-10': '2020—2025权重＋50%止盈',
}
const missingComparisonLabel = (item: Candidate) => item.category === 'FACTOR_WEIGHTED' && item.target_count === 10 ? missingComparisonLabels[item.strategy_id] : undefined

function countFamilyKey(item: Candidate) {
  if (missingComparisonLabel(item)) return 'FACTOR_WEIGHTED:missing-input-comparison'
  // These saved bank variants share a notebook entry, but keep their own
  // strategy IDs, rebalance intervals and calculation results.
  if (item.category === 'BANK' && (
    (item.strategy_id === 'bank-quality10-quarter' && item.target_count === 10)
    || (item.strategy_id === 'bank-quality5-halfyear' && item.target_count === 5)
  )) return 'BANK:quality-cycle-dividend'
  const suffix = String(item.target_count)
  return [5, 10].includes(item.target_count) && item.strategy_id.endsWith(suffix)
    ? JSON.stringify([item.category, item.schedule, item.allocation, item.strategy_id.slice(0, -suffix.length)])
    : item.strategy_id
}

export function TakeProfitResults({ result, schedule = '正常季度调仓' }: { result?: TakeProfit | null; schedule?: string }) {
  if (!result) return null
  const filled = result.events.filter(e => e.status === 'FILLED').length
  const blocked = result.events.reduce((n, e) => n + e.attempts.filter(a => !a.filled).length, 0)
  return <section className="qs-profit-results" aria-label="50%止盈结果">
    <p><b>盈利50%清仓</b> · 已成交 {filled} 次 · 待执行 {result.pending_at_end.length} 只 · 受阻尝试 {blocked} 次</p>
    <p>持仓收益含对应现金分红，成本含买入费用；收盘达到50%后，最早下一合法开盘清仓。未成交继续持有，卖后留现金至{schedule}。</p>
    <details><summary>查看止盈信号与成交记录（{result.events.length}条）</summary><div className="qs-table-scroll"><table><thead><tr><th>股票</th><th>收盘信号</th><th>触发时持仓收益</th><th>实际成交日 / 价格</th><th>股数 / 费用</th><th>状态 / 受阻次数</th></tr></thead><tbody>{result.events.map(e => <tr key={e.event_id}><td>{e.security_name || e.ts_code}<br /><small>{e.ts_code}</small></td><td>{e.signal_session}</td><td>{pct(e.signal_gain)}</td><td>{e.execution_session ? <>{e.execution_session}<br />{num(e.execution_price)}元</> : '尚未成交'}</td><td>{e.quantity == null ? '—' : <>{num(e.quantity, 0)}股<br />{num(e.cost_cny)}元</>}</td><td>{e.status === 'FILLED' ? '已成交' : e.status === 'PENDING' ? '待执行' : e.status === 'CANCELLED_AT_QUARTER' ? '调仓规则接管' : '已撤销'} / {e.attempts.filter(a => !a.filled).length}</td></tr>)}</tbody></table></div></details>
  </section>
}

function cashPeriods(daily: Day[]) {
  const periods: Array<{ start: string; end: string; sessions: number }> = []
  let current: { start: string; end: string; sessions: number } | null = null
  for (const day of daily) {
    if (day.positions === 0) {
      if (!current) current = { start: day.session, end: day.session, sessions: 0 }
      current.end = day.session; current.sessions++
    } else if (current) { if (current.sessions > 1) periods.push(current); current = null }
  }
  if (current && current.sessions > 1) periods.push(current)
  return periods
}

export function CalculationStatus({ job, hasPreviousResult }: { job: Job; hasPreviousResult: boolean }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [job.job_id])
  const phase = job.phase || '检查本地输入并准备计算'
  const stage = phase.includes('全量重算历史因子') || phase.includes('整理银行') ? 1
    : /回测|回放|绩效|信号表/.test(phase) ? 2 : phase.startsWith('检查') ? 0 : /持仓|对账/.test(phase) ? 3 : 0
  const progress = job.progress == null ? null : Math.min(99, Math.max(0, job.progress))
  const started = job.created_at ? Date.parse(job.created_at) : NaN
  const seconds = Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : null
  const elapsed = seconds == null ? null : seconds < 60 ? `${seconds}秒` : seconds < 3600 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${Math.floor(seconds / 3600)}小时${Math.floor(seconds % 3600 / 60)}分`
  return <section className="qs-calculation" aria-label="全量重算运行状态">
    <div className="qs-calculation-heading"><span className="qs-calculation-spinner" aria-hidden="true" /><div><b>{job.status === 'STARTING' ? '正在启动全量重算' : '正在全量重算'}</b><span role="status" aria-live="polite">{phase}</span></div><strong>{progress == null ? '准备中' : `${progress}%`}</strong></div>
    <div className={`qs-calculation-track${progress == null ? ' indeterminate' : ''}`} role="progressbar" aria-label="全量重算进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-valuetext={phase}><i style={progress == null ? undefined : { width: `${progress}%` }} /></div>
    <div className="qs-calculation-meta">{elapsed && <span>已运行 {elapsed}</span>}{job.current_session && <span>回测处理至 {job.current_session}</span>}{job.total_sessions != null && <span>已处理 {num(job.processed_sessions, 0)} / {num(job.total_sessions, 0)} 个交易日</span>}<span>约每2秒更新任务状态</span></div>
    <ol className="qs-calculation-steps" aria-label="计算流程">{['检查本地数据', '重建历史因子', '连续账户回测', '最新信号与持仓'].map((name, index) => <li key={name} className={index < stage ? 'done' : index === stage ? 'current' : 'pending'} aria-current={index === stage ? 'step' : undefined}><i>{index < stage ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol>
    <p>{hasPreviousResult ? '本次计算进行中，下方保留上次成功结果；完成后统一更新曲线与持仓。' : '正在从本地数据重建完整历史；完成后显示曲线和持仓。'} 进度表示计算流程完成度，不是剩余时间预测。</p>
  </section>
}

function AccountSnapshot({ day, shownHoldings, initialCash, cumulativeReturn, drawdown, value }: {
  day: Day; shownHoldings: Array<Position | null>; initialCash?: number; cumulativeReturn?: number; drawdown: number; value: number
}) {
  const stockValue = day.cash == null ? undefined : day.nav - day.cash
  const exposure = day.actual_stock_exposure ?? (stockValue != null && day.nav > 0 ? stockValue / day.nav : undefined)
  return <>
      <dl>{[
        ['累计收益', pct(cumulativeReturn)], ['当日收益', pct(day.daily_return)],
        ['当前回撤', pct(drawdown)], ['图示净值', num(value, 4)],
        ['初始资金', initialCash == null ? '未记录' : `${num(initialCash)} 元`], ['账户权益', `${num(day.nav)} 元`],
        ['现金', day.cash == null ? '未记录' : `${num(day.cash)} 元`], ['股票市值', stockValue == null ? '未记录' : `${num(stockValue)} 元`],
        ['实际股票仓位', pct(exposure)], ['持仓数量', day.positions == null ? '未记录' : `${day.positions} 只`],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {day.holdings != null ? <div className="qs-tooltip-holdings"><b>当日实际持仓 · 全部 {day.holdings.length} 只</b>{shownHoldings.length > 0 && <div className="qs-holdings-table-wrap"><table aria-label={`${day.session}全部持仓与浮盈亏`}><thead><tr><th>股票</th><th title="本轮从空仓买入该股的成交日；加减仓不会重置，下行单独显示最近买卖日">本轮建仓日 / 最近买卖</th><th>股数 / 成本价</th><th>账户仓位</th><th>市值（元）</th><th title="当日收盘价相对上一交易日收盘价的涨跌幅；金额按当日收盘持股数折算">较上个交易日涨跌幅 / 金额</th><th>浮盈亏（元）/ 比例</th></tr></thead><tbody>{shownHoldings.map((p, slot) => p == null ? <tr key={`empty-${slot}`} className="qs-holding-empty"><td colSpan={7}>空位 · 已换出</td></tr> : <tr key={p.ts_code}>
        <td><b>{p.security_name || p.ts_code}</b>{p.security_name && p.security_name !== p.ts_code && <small>{p.ts_code}</small>}<span className="qs-holding-industry" title={p.industry_name ? `申万行业${p.industry_l3_name ? ` · ${p.industry_l3_name}` : ''}；归属自 ${p.industry_in_date || '未记录'}${p.industry_out_date ? ` 至 ${p.industry_out_date}（不含当日）` : ''}` : '该日暂无可匹配的行业归属记录'}>{p.industry_name || '板块未记录'}</span></td>
        <td>{p.holding_since_session || '未记录'}<small>最近买卖 {p.last_rebalance_session || '未记录'}</small></td>
        <td>{num(p.quantity, 0)} 股<small>成本 {num(p.average_cost_price, 4)}</small></td>
        <td>{pct(p.market_value_cny == null || day.nav <= 0 ? undefined : p.market_value_cny / day.nav)}</td>
        <td>{num(p.market_value_cny)}</td>
        <td className={p.daily_price_change_pct == null || p.daily_price_change_pct === 0 ? '' : p.daily_price_change_pct > 0 ? 'qs-holding-profit' : 'qs-holding-loss'}>{p.daily_price_change_pct == null ? '—' : `${p.daily_price_change_pct > 0 ? '+' : ''}${pct(p.daily_price_change_pct)}`}<small>{p.daily_price_change_cny == null ? (p.daily_price_change_status === 'MISSING_MARK' ? '估值沿用' : p.daily_price_change_status === 'SHARE_ADJUSTMENT' ? '送转待核对' : '未记录') : `${signedNum(p.daily_price_change_cny)} 元`}</small></td>
        <td className={p.unrealized_pnl_cny == null || p.unrealized_pnl_cny === 0 ? '' : p.unrealized_pnl_cny > 0 ? 'qs-holding-profit' : 'qs-holding-loss'}>{signedNum(p.unrealized_pnl_cny)}<small>{p.unrealized_pnl_pct == null ? '—' : `${p.unrealized_pnl_pct > 0 ? '+' : ''}${pct(p.unrealized_pnl_pct)}`}</small></td>
      </tr>)}</tbody></table></div>}{!day.holdings.length && <small>空仓</small>}</div> : <p>此版本未保存逐日持仓明细；后续重算会保存。</p>}
      {!!day.missing_marks && <p>当日有 {day.missing_marks} 只持仓缺少价格，沿用回测估值。</p>}
      <footer>较上日涨跌按未复权收盘价比较，金额＝价差×当日持股数，未计现金分红与交易费用；调仓日不等同于该股实际当日盈亏。缺少前收、估值沿用或送转未核对时不估算。持仓保留行位，新股票补入空位。本轮建仓日为从空仓买入该股的日期，清仓后再买才重置；加减仓仅更新最近买卖日，分红、送转不计入。单股浮盈亏＝当日市值－剩余持仓成本；成本含买入费用，浮盈亏不含现金分红及预计卖出费用。缺少成本记录时不估算。账户累计收益包含回测已计入的分红与费用，与下方实盘参考资金分开。</footer>
  </>
}

export function Curve({ daily, initialCash, showLatestDetails = false }: { daily: Day[]; initialCash?: number; showLatestDetails?: boolean }) {
  const timeRange = useChartTimeRange(daily.map(d => d.session))
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState(false)
  const [tooltipLeft, setTooltipLeft] = useState(16)
  const containerRef = useRef<HTMLDivElement>(null)
  // Replay slots chronologically, never in cursor traversal order. Continuing
  // holdings keep their rows; new names take vacated slots, regardless of prices.
  const holdingRows = useMemo(() => {
    let slots: Array<string | null> = []
    return daily.map(day => {
      if (day.holdings == null) return []
      const positions = new Map(day.holdings.map(p => [p.ts_code, p]))
      slots = slots.map(code => code != null && positions.has(code) ? code : null)
      const retained = new Set(slots)
      for (const code of [...positions.keys()].sort()) {
        if (retained.has(code)) continue
        const empty = slots.indexOf(null)
        if (empty < 0) slots.push(code)
        else slots[empty] = code
      }
      while (slots.length && slots.at(-1) == null) slots.pop()
      return slots.map(code => code == null ? null : positions.get(code)!)
    })
  }, [daily])
  const placeTooltip = (next = hovered) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(900, window.innerWidth - 32)
    const left = (next ?? timeRange.start) > (timeRange.start + timeRange.end) / 2 ? rect.left + 12 : rect.right - width - 12
    setTooltipLeft(Math.max(16, Math.min(window.innerWidth - width - 16, left)))
  }
  useEffect(() => {
    if (hovered == null) return
    const reposition = () => placeTooltip()
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [hovered != null, hovered != null && hovered > (timeRange.start + timeRange.end) / 2, daily.length, timeRange.start, timeRange.end])
  useEffect(() => {
    if (!pinned) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPinned(false); setHovered(null) }
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [pinned])
  const chart = useMemo(() => {
    if (!daily.length) return null
    let peak = initialCash && initialCash > 0 ? initialCash : daily[0].nav
    let compounded = 1
    const completeReturns = daily.every(d => d.daily_return != null && Number.isFinite(d.daily_return))
    const values = daily.map(d => d.nav / daily[0].nav)
    const drawdowns = daily.map(d => { peak = Math.max(peak, d.nav); return d.nav / peak - 1 })
    const returns = daily.map(d => {
      if (initialCash && initialCash > 0) return d.nav / initialCash - 1
      if (!completeReturns) return undefined
      compounded *= 1 + d.daily_return!
      return compounded - 1
    })
    return { values, drawdowns, returns, low: Math.min(1, ...values), high: Math.max(...values), ddLow: Math.min(-.01, ...drawdowns) }
  }, [daily, initialCash])
  if (!daily.length) return <p>暂无可核对的曲线。</p>
  const { values, drawdowns, returns } = chart!
  const visibleValues = values.slice(timeRange.start, timeRange.end + 1)
  const visibleDrawdowns = drawdowns.slice(timeRange.start, timeRange.end + 1)
  const low = Math.min(...visibleValues); const high = Math.max(...visibleValues)
  const ddLow = Math.min(-.01, ...visibleDrawdowns)
  const x = (i: number) => 48 + (i - timeRange.start) / Math.max(1, timeRange.end - timeRange.start) * 884
  const y = (v: number) => 32 + (high - v) / Math.max(.01, high - low) * 172
  const dy = (v: number) => 242 + v / ddLow * 65
  const points = visibleValues.map((v, i) => `${x(timeRange.start + i)},${y(v)}`).join(' ')
  const ddPoints = visibleDrawdowns.map((v, i) => `${x(timeRange.start + i)},${dy(v)}`).join(' ')
  const index = hovered == null || hovered < timeRange.start || hovered > timeRange.end ? null : hovered
  const day = index == null ? null : daily[index]
  const shownHoldings = index == null ? [] : holdingRows[index]
  function pointAt(event: React.PointerEvent<SVGSVGElement>, force = false) {
    if (pinned && !force) return
    const rect = event.currentTarget.getBoundingClientRect()
    const scale = Math.min(rect.width / 980, rect.height / 340)
    if (scale <= 0) return
    const px = (event.clientX - rect.left - (rect.width - 980 * scale) / 2) / scale
    const next = Math.max(timeRange.start, Math.min(timeRange.end, timeRange.start + Math.round((px - 48) / 884 * (timeRange.end - timeRange.start))))
    placeTooltip(next)
    setHovered(next)
  }
  const tooltip = day && index != null ? <aside className="qs-curve-tooltip" data-pinned={pinned} style={{ left: tooltipLeft }} role="tooltip">
      <header><b>{day.session}</b><span>{pinned ? '已固定 · Esc关闭' : '回测账户 · 收盘后 · 单击图表固定'}</span>{pinned && <button type="button" className="qs-tooltip-close" aria-label="关闭持仓明细" onClick={() => { setPinned(false); setHovered(null) }}>×</button>}</header>
      <AccountSnapshot day={day} shownHoldings={shownHoldings} initialCash={initialCash} cumulativeReturn={returns[index]} drawdown={drawdowns[index]} value={values[index]} />
    </aside> : null
  return <div className="qs-curve-wrap" ref={containerRef} onPointerLeave={() => { if (!pinned) setHovered(null) }}>
    <svg className="qs-curve" viewBox="0 0 980 340" role="img" tabIndex={0} aria-label={`净值和回撤曲线，${daily[timeRange.start].session}至${daily[timeRange.end].session}；悬停查看当天收盘账户，左右方向键切换日期`} onPointerMove={pointAt} onPointerDown={e => { pointAt(e, true); setPinned(value => !value) }} onFocus={() => { placeTooltip(index ?? timeRange.end); if (index == null) setHovered(timeRange.end) }} onBlur={() => { if (!pinned) setHovered(null) }} onKeyDown={e => {
      if (e.key === 'Escape') { setPinned(false); setHovered(null); return }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPinned(value => !value); setHovered(i => i == null || i < timeRange.start || i > timeRange.end ? timeRange.end : i); return }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      setHovered(i => e.key === 'Home' ? timeRange.start : e.key === 'End' ? timeRange.end : Math.max(timeRange.start, Math.min(timeRange.end, (i ?? timeRange.end) + (e.key === 'ArrowLeft' ? -1 : 1))))
    }}>
    {[0, .5, 1].map(f => <g key={f}><line x1="48" y1={32 + f * 172} x2="932" y2={32 + f * 172} stroke="#dce5df" /><text x="4" y={37 + f * 172}>{(high - f * (high - low)).toFixed(2)}</text></g>)}
    <polyline points={points} fill="none" stroke="#176648" strokeWidth="2" />
    <text x="48" y="226">净值（图示起点＝1）</text>
    <line x1="48" y1="242" x2="932" y2="242" stroke="#dce5df" />
    <polyline points={ddPoints} fill="none" stroke="#bd6653" strokeWidth="1.5" />
    <text x="4" y="246">0%</text><text x="4" y="308">{pct(ddLow)}</text>
    {index != null && <g className="qs-curve-crosshair"><line x1={x(index)} x2={x(index)} y1="26" y2="311" stroke="#78998a" strokeDasharray="4 4" /><circle cx={x(index)} cy={y(values[index])} r="4" fill="#176648" stroke="#fff" strokeWidth="2" /><circle cx={x(index)} cy={dy(drawdowns[index])} r="3" fill="#bd6653" stroke="#fff" /></g>}
    {[0, .25, .5, .75, 1].map(f => { const i = timeRange.start + Math.round(f * (timeRange.end - timeRange.start)); return <text key={f} x={x(i)} y="330" textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{daily[i].session}</text> })}
    </svg>
    <ChartTimeRange sessions={daily.map(d => d.session)} values={values} start={timeRange.start} end={timeRange.end} onChange={window => { timeRange.change(window); setPinned(false); setHovered(null) }} />
    {tooltip && (typeof document === 'undefined' ? tooltip : createPortal(<div className="qs-page qs-tooltip-layer">{tooltip}</div>, document.body))}
    <p className="qs-curve-help">悬停查看当日账户；单击图表固定明细，可滚动查看，Esc关闭；左右方向键切换日期。</p>
    {showLatestDetails && <section className="qs-latest-details" aria-label="最新明细">
      <header><h3>最新明细</h3><b>{daily.at(-1)!.session}</b><span>当前回测最后一个交易日 · 收盘账户</span></header>
      <AccountSnapshot day={daily.at(-1)!} shownHoldings={holdingRows.at(-1)!} initialCash={initialCash} cumulativeReturn={returns.at(-1)} drawdown={drawdowns.at(-1)!} value={values.at(-1)!} />
    </section>}
  </div>
}

function MetricCards({ summary }: { summary: Metrics }) {
  return <div className="qs-metrics">{[['累计收益', pct(summary.total_return)], ['年化收益', pct(summary.annualized_return)], ['最大回撤', pct(summary.maximum_drawdown)], ['夏普', num(summary.sharpe)]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
}

export default function QualityStrategies() {
  const [initialSelection] = useState(savedSelection)
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [items, setItems] = useState<Candidate[]>([])
  const [category, setCategory] = useState(initialSelection.category)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [capital, setCapital] = useState('1000000')
  const [asOf, setAsOf] = useState('')
  const [holdings, setHoldings] = useState('')
  const [history, setHistory] = useState<Array<{ job_id: string; request?: { name: string }; name?: string }>>([])
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerJob, setRegisterJob] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerNotes, setRegisterNotes] = useState('')
  const selectionRef = useRef('')
  const selectionVersion = useRef(0)
  const pendingDetail = useRef('')

  function receiveDetail(data: Detail) {
    setDetail(previous => JSON.stringify(previous) === JSON.stringify(data) ? previous : data)
    const nextJob = data.latest_job || null
    setJob(previous => JSON.stringify(previous) === JSON.stringify(nextJob) ? previous : nextJob)
  }

  async function reload() {
    const data = await request<{ categories: Array<{ id: string; name: string }>; items: Candidate[] }>('quality-strategies')
    setCategories(data.categories); setItems(data.items)
    return data.items
  }
  async function choose(sid: string) {
    if (selectionRef.current === sid && (detail?.strategy_id === sid || pendingDetail.current === sid)) return
    const version = ++selectionVersion.current
    selectionRef.current = sid; pendingDetail.current = sid
    setSelected(sid); setError(''); setLoading(true); setDetailLoading(true)
    try {
      const data = await request<Detail>(`quality-strategies/${encodeURIComponent(sid)}`)
      if (selectionVersion.current !== version) return
      receiveDetail(data)
    } catch (e) { if (selectionVersion.current === version) setError(String(e)) }
    finally { if (selectionVersion.current === version) { pendingDetail.current = ''; setLoading(false); setDetailLoading(false) } }
  }
  useEffect(() => {
    let disposed = false
    request<{ categories: Array<{ id: string; name: string }>; items: Candidate[] }>('quality-strategies').then(data => {
      if (disposed) return
      setCategories(data.categories); setItems(data.items)
      const first = data.items.find(r => r.strategy_id === initialSelection.strategy_id && r.category === initialSelection.category)
        || data.items.find(r => r.category === initialSelection.category) || data.items[0]
      if (first && !selectionRef.current) { setCategory(first.category); void choose(first.strategy_id) }
    }).catch(e => { if (!disposed) setError(String(e)) })
    return () => { disposed = true; selectionVersion.current++ }
  }, [])
  useEffect(() => {
    if (!selected) return
    try { window.localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify({ category, strategy_id: selected })) }
    catch { /* Selection still works when browser storage is disabled. */ }
  }, [category, selected])
  useEffect(() => {
    let disposed = false
    const timer = window.setInterval(async () => {
      try {
        const data = await request<{ categories: Array<{ id: string; name: string }>; items: Candidate[] }>('quality-strategies')
        if (disposed) return
        setItems(data.items)
        const sid = selectionRef.current
        const version = selectionVersion.current
        if (sid && !pendingDetail.current) {
          const current = await request<Detail>(`quality-strategies/${encodeURIComponent(sid)}`)
          if (!disposed && selectionVersion.current === version) receiveDetail(current)
        }
      } catch (e) { if (!disposed) setError(String(e)) }
    }, 30000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!isCalculating(job)) return
    let disposed = false
    const sid = selected, jid = job!.job_id, version = selectionVersion.current
    if (detail?.strategy_id !== sid || pendingDetail.current) return
    const timer = window.setInterval(() => {
      request<Job>(`quality-strategies/jobs/${encodeURIComponent(jid)}`).then(async next => {
        if (disposed || selectionVersion.current !== version) return
        setJob(next)
        if (next.status === 'PASS') {
          const data = await request<Detail>(`quality-strategies/${encodeURIComponent(sid)}`)
          // PASS stops this timer effect; its final detail read still belongs
          // to this selection. Unmount / a new selection invalidates version.
          if (selectionVersion.current === version) { receiveDetail(data); void reload() }
        }
        if (next.status === 'FAIL') setError(next.error || '计算失败，请检查输入和日志')
      }).catch(e => { if (!disposed && selectionVersion.current === version) setError(String(e)) })
    }, 2000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [job?.job_id, job?.status, selected, detail?.strategy_id, detailLoading])

  async function calculate() {
    setError(''); setLoading(true)
    const sid = selected, version = selectionVersion.current
    try {
      const current = holdings.trim() ? holdings.trim().split(/\n/).filter(line => line.trim()).map(line => {
        const parts = line.trim().split(/[\s,，]+/)
        if (parts.length !== 2 || !/^\d{6}\.(SH|SZ)$/i.test(parts[0]) || !/^\d+$/.test(parts[1])) throw new Error('持仓每行填写沪深证券代码和非负整数股数，例如 600036.SH 1000。')
        const [code, quantity] = parts
        return { ts_code: code.toUpperCase(), quantity: Number(quantity) }
      }) : []
      const result = await request<Job>(`quality-strategies/${encodeURIComponent(sid)}/calculate`, { as_of: asOf || null, capital_cny: Number(capital), current_holdings: current })
      if (selectionVersion.current === version) setJob(result)
    } catch (e) { if (selectionVersion.current === version) setError(String(e)) }
    finally { if (selectionVersion.current === version) setLoading(false) }
  }
  async function showRegister() {
    setRegisterOpen(!registerOpen)
    try { const data = await request<{ jobs: Array<{ job_id: string; status: string; request?: { name: string }; name?: string }> }>('strategy/jobs?kind=history'); setHistory(data.jobs.filter(j => j.status === 'PASS')) }
    catch (e) { setError(String(e)) }
  }
  async function register() {
    setLoading(true); setError('')
    try {
      const data = await request<Detail>('quality-strategies', { job_id: registerJob, category, name: registerName, notes: registerNotes })
      await reload(); setRegisterOpen(false); await choose(data.strategy_id)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }
  const signal = detail?.signal?.calculation_mode === 'FULL_LOCAL_REBUILD_V3' ? detail.signal : null
  const diagnosticOnly = detail?.calculation_policy === 'HISTORICAL_DIAGNOSTIC_ONLY'
  const scoreRules = detail?.display_score_rules || detail?.request.score_rules || []
  const curve = signal?.historical_replay
  const previousDateRestrictionFailure = detail?.input_access_policy === 'PIT_AVAILABLE' && job?.status === 'FAIL'
    && job.error?.startsWith('银行财务输入范围仅开放至')
  const needsRebuild = detail?.calculation_state !== 'UP_TO_DATE'
  const calculationLabel = (state?: string) => state === 'HISTORICAL_DIAGNOSTIC' ? '全区间事后回测已保存' : state === 'UP_TO_DATE' ? '全量重算已更新' : state === 'STALE' ? '来源或规则变化，待重算' : '待全量重算'
  const replayCoverageWarnings = signal?.warnings.filter(w => w.includes('历史质量覆盖缺口')) || []
  const historicalCashPeriods = useMemo(() => cashPeriods(curve?.daily || []), [curve?.daily])
  const excessHoldingDays = useMemo(() => (curve?.daily || []).filter(day => day.positions != null
    && day.positions > (detail?.target_count ?? Infinity)), [curve?.daily, detail?.target_count])
  const candidateGroups = useMemo(() => {
    const groups = new Map<string, Candidate[]>()
    for (const item of items) {
      const key = countFamilyKey(item)
      groups.set(key, [...(groups.get(key) || []), item])
    }
    return [...groups].map(([key, variants]) => ({ key, variants,
      item: variants.find(item => item.strategy_id === selected)
        || variants.find(item => item.target_count === 10) || variants[0] }))
  }, [items, selected])
  const countVariants = detail ? [...(candidateGroups.find(group => group.key === countFamilyKey(detail))?.variants || [])]
    .sort((a, b) => a.target_count - b.target_count) : []
  const differentVariantCadence = new Set(countVariants.map(item => `${item.schedule}:${item.rebalance_sessions}`)).size > 1
  const variantLabel = (item: Candidate) => missingComparisonLabel(item) || `${item.target_count}股${differentVariantCadence ? ` · ${item.rebalance_sessions}交易日调仓` : ''}`
  return <main className="qs-page">
    <div className="qs-heading"><div><span className="eyebrow">STRATEGY NOTEBOOK</span><h1>优质策略</h1><p>按类别保留策略规则和历史证据，查看最新重算结果与持仓明细。</p></div><div className="qs-actions"><button onClick={() => reload().catch(e => setError(String(e)))}>刷新列表</button><button className="primary" aria-expanded={registerOpen} onClick={() => void showRegister()}>记录已有策略</button></div></div>
    <div className="qs-tabs qs-category-tabs" aria-label="策略分类">{categories.map(c => <button aria-pressed={category === c.id} className={category === c.id ? 'active' : ''} key={c.id} onClick={() => { setCategory(c.id); const first = items.find(r => r.category === c.id); if (first) void choose(first.strategy_id) }}>{c.name}<small>{candidateGroups.filter(group => group.item.category === c.id).length}</small></button>)}</div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {registerOpen && <section className="qs-panel qs-register"><div className="qs-register-heading"><div><h2>记录完成的历史回测</h2><p>保存独立证据副本，原历史记录删除或变化不会覆盖本页记录。归类不代表研究认证通过。</p></div><button onClick={() => setRegisterOpen(false)}>收起</button></div><div className="qs-register-fields"><label>回测记录<select value={registerJob} onChange={e => { setRegisterJob(e.target.value); const h = history.find(x => x.job_id === e.target.value); setRegisterName(h?.request?.name || h?.name || '') }}><option value="">选择已有完成记录</option>{history.map(h => <option key={h.job_id} value={h.job_id}>{h.request?.name || h.name || h.job_id} · {h.job_id}</option>)}</select></label><label>策略名称<input placeholder="为这项策略取一个便于识别的名称" value={registerName} onChange={e => setRegisterName(e.target.value)} /></label><label className="qs-register-notes">保留理由／局限<textarea placeholder="记录保留理由，以及适用范围和已知局限" value={registerNotes} onChange={e => setRegisterNotes(e.target.value)} /></label></div><div className="qs-register-footer"><span>保存分类：{categories.find(c => c.id === category)?.name}</span><button className="primary" disabled={loading || !registerJob || !registerName.trim()} onClick={() => void register()}>记录到{categories.find(c => c.id === category)?.name}</button></div></section>}
    <div className="qs-layout"><aside className="qs-candidates">{candidateGroups.filter(group => group.item.category === category).map(({ key, item: r, variants }) => <button key={key} aria-pressed={selected === r.strategy_id} className={`qs-candidate${selected === r.strategy_id ? ' selected' : ''}${isCalculating(selected === r.strategy_id && detail?.strategy_id === r.strategy_id ? job : r.latest_job) ? ' calculating' : ''}`} onClick={() => void choose(r.strategy_id)}><span className="qs-candidate-heading"><b>{missingComparisonLabel(r) ? (variants.some(v => v.evidence_version === 'WEIGHT_REFIT_DIAGNOSTIC') ? '历史夏普加权 · 权重与规则对照' : variants.some(v => v.evidence_version === 'TAKE_PROFIT_DIAGNOSTIC') ? '历史夏普加权 · 缺失与止盈对照' : '历史夏普加权 · 缺失处理对照') : variants.length > 1 ? r.name.replace(/(?:\s*·\s*)?(?:5|10)股$/, '').trim() : r.name}</b><small className="qs-selected-mark" aria-hidden={selected !== r.strategy_id} aria-label={selected === r.strategy_id ? '当前查看' : undefined}>✓</small></span>{variants.length > 1 && <span className="qs-candidate-variant">{missingComparisonLabel(r) ? `当前：${missingComparisonLabel(r)} · 可切换${variants.length}种方案` : `当前${r.target_count}股 · 可切换5／10股`}</span>}{trainingPeriod(r) && <span className="qs-candidate-training">权重训练期：{trainingPeriod(r)}</span>}<span className="qs-candidate-period">{r.start} → {r.latest_calculation_mode === 'FULL_LOCAL_REBUILD_V3' ? r.latest_as_of : r.end}</span><span className="qs-candidate-metrics"><span><small>{hasResearchReplay(r) && r.latest_calculation_mode !== 'FULL_LOCAL_REBUILD_V3' ? '对照回测年化' : '上次全量年化'}</small><b>{pct(candidateMetrics(r)?.annualized_return)}</b></span><span><small>最大回撤</small><b className="qs-drawdown">{pct(candidateMetrics(r)?.maximum_drawdown)}</b></span></span>{r.latest_summary && r.latest_calculation_mode === 'FULL_LOCAL_REBUILD_V3' && <span className="qs-candidate-replay"><small>复算至 {r.latest_as_of}</small><span>年化 {pct(r.latest_summary.annualized_return)} · 回撤 {pct(r.latest_summary.maximum_drawdown)}</span></span>}<span className="qs-candidate-footer"><small>{isCalculating(selected === r.strategy_id && detail?.strategy_id === r.strategy_id ? job : r.latest_job) ? '正在全量重算' : calculationLabel(r.calculation_state)}</small><small>版本 {r.version}</small></span></button>)}</aside>
      <div className="qs-detail" aria-busy={detailLoading}>{detailLoading && detail && <div className="qs-detail-loading" role="status">正在读取 {items.find(r => r.strategy_id === selected)?.name || '策略'}…</div>}{detail && detail.strategy_id !== selected && !detailLoading && <p className="qs-warning" role="status">当前选择未能读取，以下仍是 {detail.name} 的内容。</p>}<div className="qs-detail-content" inert={detailLoading || (!!detail && detail.strategy_id !== selected) || undefined}>{!detail ? <section className="qs-panel qs-detail-placeholder" aria-label="策略详情加载区"><p>{error ? '策略读取失败，请重新选择重试。' : '正在读取策略证据…'}</p>{!error && <div className="qs-placeholder-lines" aria-hidden="true"><i /><i /><i /></div>}</section> : <>
        <section className="qs-panel"><h2>{detail.name}</h2>{countVariants.length > 1 && <nav className="qs-count-switch" aria-label={missingComparisonLabel(detail) ? '缺失处理方案切换' : '持股数量切换'}><span>{missingComparisonLabel(detail) ? '对照方案' : differentVariantCadence ? '策略版本' : '持股数量'}</span><div>{countVariants.map(item => <button key={item.strategy_id} type="button" aria-pressed={selected === item.strategy_id} onClick={() => void choose(item.strategy_id)}>{variantLabel(item)}</button>)}</div></nav>}<p>{detail.notes}</p>{detail.evidence_error && <div role="alert" className="error-banner">证据不能读取：{detail.evidence_error}</div>}<div className="qs-facts">{trainingPeriod(detail) && <span>权重训练期：{trainingPeriod(detail)}</span>}{diagnosticOnly && <span>固定权重 · 全区间事后回看</span>}<span>{detail.target_count}只股票</span>{detail.request.take_profit_policy === 'GAIN_50_CLEAR' && <span>盈利50%清仓</span>}{detail.information_clock && <span>收盘后决策，次日执行</span>}<span>{detail.schedule === 'QUARTER' ? '自然季度末' : `${detail.rebalance_sessions}交易日`}选股</span><span>{detail.allocation === 'INVERSE_RESVOL' ? '风险倒数分权' : '等权'}</span><span>{detail.fixed_exposure != null ? `固定股票目标 ${pct(detail.fixed_exposure * (1 - detail.request.minimum_cash_fraction))}` : detail.request.shadow_health.experiment_variant === 'S0' ? '不启用影子择时' : `影子 ${detail.request.shadow_health.experiment_variant}`}</span></div>
          {!signal && hasResearchReplay(detail) && <div aria-label={diagnosticOnly ? "权重训练期对照回测" : "缺失处理独立回测"}><b>{detail.evidence_version === 'WEIGHT_REFIT_DIAGNOSTIC' ? '权重训练期对照 · 全区间回测' : detail.evidence_version === 'TAKE_PROFIT_DIAGNOSTIC' ? '50%止盈独立回测' : '缺失处理独立回测'}</b><p>{detail.start} → {detail.end}{diagnosticOnly ? '；全程固定使用2020—2025年训练权重。2016—2019年使用后来训练的权重，2020—2025年属于训练样本内，2026年属于已查看历史；全区间为事后诊断，不代表当时可执行或独立样本外验证。' : '；固定输入对照，原策略另行保留。这是已暴露历史的研究结果，不代表实盘或未见样本验证。'}</p>{diagnosticOnly && detail.daily.some(d => (d.positions || 0) > detail.target_count) && <p className="qs-warning" role="note">目标{detail.target_count}股；历史实际持仓最多{Math.max(...detail.daily.map(d => d.positions || 0))}只，共{detail.daily.filter(d => (d.positions || 0) > detail.target_count).length}个交易日超过目标。未成交的原持仓仍计入账户，实际持仓以图表明细为准。</p>}<MetricCards summary={detail.summary} /><Curve daily={detail.daily} initialCash={detail.initial_cash_cny} showLatestDetails /><TakeProfitResults result={detail.take_profit} /><div className="qs-years">{detail.annual.map(y => <div key={y.year}><small>{y.year}</small><b>{pct(y.return)}</b></div>)}</div></div>}{!diagnosticOnly && <>{isCalculating(job) && <CalculationStatus job={job!} hasPreviousResult={!!signal} />}<div className="qs-rebuild-heading"><b>最近全量重算</b><span className={needsRebuild ? 'qs-update-needed' : 'qs-update-ready'}>{isCalculating(job) ? '本次更新中' : calculationLabel(detail.calculation_state)}</span></div>
          <p>每次点击计算，从当前本地来源重建全部历史因子输入，再回测和生成持仓。</p>
          {needsRebuild && !isCalculating(job) && <p className="qs-warning">{signal ? '来源、公式或规则已变化，下面是上次全量结果；请重算后再用于当前决策。' : '尚无全量重算结果。旧版回放和归档不作为当前结果，请在下方点击全量重算。'}</p>}
          {signal && excessHoldingDays.length > 0 && <p className="qs-warning" role="note">目标{detail.target_count}股；历史实际持仓最多{Math.max(...excessHoldingDays.map(day => day.positions!))}只，共{excessHoldingDays.length}个交易日超过目标。未成交的原持仓仍计入账户，实际持仓以图表明细为准。</p>}
          {signal && <><p>{detail.start} → {signal.as_of} · 计算时间 {signal.created_at ? new Date(signal.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'}</p>{replayCoverageWarnings.length > 0 && <div className="qs-history-gap" role="note"><b>历史财务输入存在缺口，空仓不能直接解释为成功避险</b><p>财务输入不足可能使回测选股为空；这会影响收益和回撤，需补齐当时可用的财报证据后再评价策略。</p>{historicalCashPeriods.length > 0 && <div>{historicalCashPeriods.map(period => <span key={period.start}>回测空仓：{period.start} → {period.end} · {period.sessions}个交易日</span>)}</div>}</div>}<MetricCards summary={curve?.summary || {}} /><Curve daily={curve?.daily || []} initialCash={curve?.initial_cash_cny} showLatestDetails /><TakeProfitResults result={curve?.take_profit} /><div className="qs-years">{curve?.annual?.map(y => <div key={y.year}><small>{y.year}</small><b>{pct(y.return)}</b></div>)}</div>{replayCoverageWarnings.map((w, i) => <p className="qs-warning" key={i}>{w}</p>)}</>}
          </>}<details><summary>选股因子与冻结权重{trainingPeriod(detail) ? `（训练期：${trainingPeriod(detail)}）` : ''}</summary><table><thead><tr><th>因子</th><th>方向</th><th>权重</th><th>缺失处理</th></tr></thead><tbody>{scoreRules.map(r => <tr key={r.factor_id}><td>{factorNames[r.factor_id] || r.factor_id}</td><td>{r.direction === 'HIGH' ? '高值优先' : '低值优先'}</td><td>{pct(r.weight / scoreRules.reduce((s, x) => s + x.weight, 0))}</td><td>{r.weight === 0 ? '不计分；仍保留缺失剔除要求' : r.missing_policy === 'WORST' ? '保留未知，该项最低分' : '缺值不参与评分'}</td></tr>)}</tbody></table></details>
        </section>
        {!diagnosticOnly && <section className="qs-panel"><h2>最新信号与持仓计算</h2>{detail.input_access_policy === 'PIT_AVAILABLE' && <p>银行财务按PIT自动开放：仅使用决策时点已可用的披露与修订版本；缺失保留为空，晚采数据不回填更早历史。</p>}{detail.released_input_end && <p className="qs-warning">银行财务输入当前开放至 {detail.released_input_end}。未开放的日期会阻断计算，不会把旧持仓当成今天的结果。</p>}<p>按本地可用数据全量重算并更新最新信号。资金为账户总权益；当前持仓可留空。不会自动下单。</p><div className="qs-inputs"><label>账户总权益（元）<input type="number" disabled={isCalculating(job)} min="1" value={capital} onChange={e => setCapital(e.target.value)} /></label><label>计算截至日<input type="date" disabled={isCalculating(job)} value={asOf} onChange={e => setAsOf(e.target.value)} /><small>留空使用本地行情最新日，输入不足会明确报错。</small></label></div><label>当前持仓（可留空）<textarea disabled={isCalculating(job)} placeholder={'每行：证券代码 股数\n例如 600036.SH 1000'} value={holdings} onChange={e => setHoldings(e.target.value)} /></label><button className="primary" disabled={loading || isCalculating(job) || !!detail.evidence_error} onClick={() => void calculate()}>{isCalculating(job) ? '正在计算…' : '全量重算／更新最新信号'}</button>{job && !isCalculating(job) && <p role="status">{job.status === 'RUNNING' ? `${job.phase || '正在计算'} ${num(job.progress, 0)}%` : job.status === 'FAIL' ? (previousDateRestrictionFailure ? '上次计算因旧日期限制中断；现已按PIT开放，请重新计算。' : `计算失败：${job.error}`) : detail.calculation_state === 'UP_TO_DATE' ? '全量重算完成，结果已保存' : '此前结果已保存，仍需完成当前全量重算'}</p>}
          {signal && <><div className="qs-facts"><span>行情截至 {signal.as_of}</span><span>本次计算资金 {num(signal.capital_cny, 0)} 元</span><span>最近选股信号 {signal.signal_date}</span><span>目标股票仓位 {pct(signal.target_exposure)}</span><span>{signal.due ? '存在下个交易日待执行信号' : '当前不是调仓信号日'}</span></div><p>{signal.execution_note}</p>{signal.warnings.filter(w => !w.includes('数量差额仅表示新建仓参考') && !w.includes('下表展示参考持仓目标')).map((w, i) => <p className="qs-warning" key={i}>{w}</p>)}<details><summary>输入版本与截止日期</summary><ul>{signal.input_bindings.map(b => <li key={b.factor_id}>{b.factor_id} · 截至 {b.end} · {b.release_id.slice(0, 22)}</li>)}</ul></details></>}
        </section>}
      </>}</div></div>
    </div>
  </main>
}
