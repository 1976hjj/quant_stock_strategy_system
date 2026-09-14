import { useEffect, useMemo, useState } from 'react'
import { strategyApi } from './strategyApi'
import type { FilterRule, RiskLevel, RiskOverlaySpec, ScoreRule, StrategyFactorOption, StrategyJob, StrategyOptions, StrategyPreflight, StrategyPreview, StrategyRequest } from './strategyApi'

const DEFAULT_SCORE = ['jqdata-earnings-to-price-ratio', 'jqdata-cash-earnings-to-price-ratio']
const DEFAULT_FILTERS = ['jqdata-share-turnover-monthly', 'jqdata-daily-standard-deviation']
export const STRATEGY_JOB_STORAGE_KEY = 'alpha-research.strategy-current-job-id'
export const STRATEGY_JOB_EVENT = 'alpha-research:strategy-job-changed'
const STRATEGY_DRAFT_STORAGE_KEY = 'alpha-research.strategy-draft'

const DEFAULT_RISK_LEVELS: RiskLevel[] = [
  { level_id: 'M0', score_min: 0, score_max: 20, exposure: 1 },
  { level_id: 'M1', score_min: 20, score_max: 35, exposure: .9 },
  { level_id: 'M2', score_min: 35, score_max: 50, exposure: .8 },
  { level_id: 'M3', score_min: 50, score_max: 60, exposure: .65 },
  { level_id: 'M4', score_min: 60, score_max: 70, exposure: .5 },
  { level_id: 'M5', score_min: 70, score_max: 85, exposure: .35 },
  { level_id: 'M6', score_min: 85, score_max: 100, exposure: .2 },
]

const DEFAULT_RISK: RiskOverlaySpec = {
  experiment_variant: 'R0', market_scope: 'ALL_A_EQUAL_WEIGHT_PIT',
  weights: { breadth: .30, trend: .20, volatility: .15, liquidity: .15, stress_tail: .20 },
  levels: DEFAULT_RISK_LEVELS, percentile_window_sessions: 756, percentile_min_sessions: 252,
  breadth_return_sessions: 20, trend_sessions: 200, volatility_sessions: 20,
  liquidity_sessions: 60, stress_smoothing_sessions: 5, tail_loss_threshold: -.05,
  r3_interval_sessions: 10, down_confirmation_sessions: 1, up_confirmation_sessions: 3,
  hysteresis_score: 3, train_lookback_sessions: 756, fixed_exposure: .65,
  kelly_lookback_sessions: 756, kelly_min_sessions: 252, kelly_update_sessions: 63,
  kelly_fraction: .5, kelly_initial_exposure: .65, kelly_min_exposure: .2,
  kelly_max_exposure: 1, kelly_drawdown_limit: .3, kelly_exposure_step: .05,
  cash_annual_yield: 0,
}

const RISK_VARIANTS = {
  R0: 'R0 · 原策略（关闭风险仓位）', R1: 'R1 · Risk Score 每日直接调整',
  R2: 'R2 · 每周最后一个信号调整', R3: 'R3 · 每 N 个交易日调整',
  R4: 'R4 · 降仓快、加仓确认', R5: 'R5 · 与 R1 同平均仓位的固定仓位',
  R6: 'R6 · Rolling Train Fixed',
  R7: 'R7 · 自定义固定风险仓位',
  R8: 'R8 · 滚动分数凯利＋回撤约束',
} as const

function savedDraft(): Partial<StrategyRequest> | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STRATEGY_DRAFT_STORAGE_KEY) || 'null')
    return value && typeof value === 'object' ? value as Partial<StrategyRequest> : null
  } catch {
    return null
  }
}

function percent(value: number | null | undefined) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}

function duration(seconds: number | null | undefined) {
  if (seconds == null) return '—'
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return minutes ? `${minutes}分${remaining}秒` : `${remaining}秒`
}

function factorName(options: StrategyOptions | null, factorId: string) {
  return options?.factors.find((item) => item.factor_id === factorId)?.chinese_name || factorId
}

function factorById(options: StrategyOptions, factorId: string) {
  return options.factors.find((item) => item.factor_id === factorId)
}

function FactorSelect({ options, value, onChange }: { options: StrategyOptions; value: string; onChange: (factor: StrategyFactorOption) => void }) {
  return <select value={value} onChange={(event) => { const factor = factorById(options, event.target.value); if (factor) onChange(factor) }}>
    {options.factors.map((factor) => <option value={factor.factor_id} key={factor.factor_id}>{factor.chinese_name} · {factor.source_collection}</option>)}
  </select>
}

function EquityChart({ daily, benchmark, drawdown }: {
  daily: NonNullable<StrategyJob['result']>['daily']
  benchmark?: NonNullable<StrategyJob['result']>['benchmark']
  drawdown?: NonNullable<StrategyJob['result']>['drawdown_period']
}) {
  if (daily.length < 2) return null
  const strategy = daily.map((item) => ({ session: item.session, value: item.nav / daily[0].nav - 1 }))
  const benchmarkBySession = new Map(benchmark?.daily.map((item) => [item.session, item.return]) || [])
  const benchmarkValues = strategy.map((item) => benchmarkBySession.get(item.session)).filter((item): item is number => item != null)
  const values = [...strategy.map((item) => item.value), ...benchmarkValues, 0]
  const rawStep = (Math.max(...values) - Math.min(...values) || .1) / 4
  const power = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 5, 10].find((candidate) => rawStep <= candidate * power)! * power
  const yMin = Math.floor(Math.min(...values) / step) * step
  const yMax = Math.ceil(Math.max(...values) / step) * step
  const left = 54; const right = 12; const top = 20; const bottom = 32; const width = 1000 - left - right; const height = 240 - top - bottom
  const x = (index: number) => left + index / (daily.length - 1) * width
  const y = (value: number) => top + (yMax - value) / (yMax - yMin || 1) * height
  const polyline = (series: Array<number | undefined>) => series.map((value, index) => value == null ? '' : `${x(index)},${y(value)}`).filter(Boolean).join(' ')
  const yTicks = Array.from({ length: Math.round((yMax - yMin) / step) + 1 }, (_, index) => yMin + index * step)
  const years = daily.reduce<Array<{ label: string; index: number }>>((items, item, index) => {
    const label = item.session.slice(0, 4)
    return !items.length || items.at(-1)?.label !== label ? [...items, { label, index }] : items
  }, [])
  const peakIndex = drawdown ? daily.findIndex((item) => item.session === drawdown.peak_session) : -1
  const recoveryIndex = drawdown ? daily.findIndex((item) => item.session === drawdown.recovery_session) : -1
  const drawdownEnd = recoveryIndex >= 0 ? recoveryIndex : daily.length - 1
  const peakToRecoveryDays = drawdown?.peak_to_recovery_calendar_days ?? (drawdown?.recovery_session ? Math.round((new Date(drawdown.recovery_session).getTime() - new Date(drawdown.peak_session).getTime()) / 86_400_000) : 0)
  const recoveredText = drawdown?.recovered
    ? `最大回撤区间：${drawdown.peak_to_recovery_sessions} 个交易日 / ${peakToRecoveryDays} 天`
    : '最大回撤尚未恢复'
  return <div className="strategy-chart">
    <div className="strategy-chart-legend"><span className="strategy-line">策略 {percent(strategy.at(-1)?.value)}</span>{benchmark && <span className="benchmark-line">沪深300 {percent(benchmark.summary.total_return)}</span>}</div>
    <svg viewBox="0 0 1000 240" preserveAspectRatio="none" role="img" aria-label="策略与沪深300累计收益走势">
      {yTicks.map((tick) => <g className="chart-y-tick" key={tick}><line x1={left} x2={1000 - right} y1={y(tick)} y2={y(tick)} /><text x={left - 7} y={y(tick) + 3} textAnchor="end">{percent(tick)}</text></g>)}
      {years.map((item) => <g className="chart-x-tick" key={item.label}><line x1={x(item.index)} x2={x(item.index)} y1={top} y2={top + height} /><text x={x(item.index)} y={232} textAnchor={item.index === 0 ? 'start' : 'middle'}>{item.label}</text></g>)}
      {benchmark && <polyline className="benchmark-series" points={polyline(strategy.map((item) => benchmarkBySession.get(item.session)))} />}
      <polyline className="strategy-series" points={polyline(strategy.map((item) => item.value))} />
      {drawdown && peakIndex >= 0 && <g className="drawdown-marker"><line x1={x(peakIndex)} x2={x(drawdownEnd)} y1="10" y2="10" /><line x1={x(peakIndex)} x2={x(peakIndex)} y1="7" y2="14" /><line x1={x(drawdownEnd)} x2={x(drawdownEnd)} y1="7" y2="14" /><text x={(x(peakIndex) + x(drawdownEnd)) / 2} y="7" textAnchor="middle">{recoveredText}</text></g>}
    </svg>
    {drawdown && <div className="strategy-chart-note"><span>最大回撤 {percent(drawdown.drawdown)}：峰值 {drawdown.peak_session} → 低点 {drawdown.trough_session}</span><b>{drawdown.recovered ? `低点后 ${drawdown.recovery_sessions} 个交易日恢复于 ${drawdown.recovery_session}` : '截至回测结束未恢复'}</b></div>}
  </div>
}

export default function StrategyBacktest() {
  const [options, setOptions] = useState<StrategyOptions | null>(null)
  const [online, setOnline] = useState(false)
  const [name, setName] = useState('通用多因子策略 v1')
  const [start, setStart] = useState('2020-01-02')
  const [end, setEnd] = useState('2025-12-31')
  const [previewDate, setPreviewDate] = useState('2025-12-30')
  const [scoreRules, setScoreRules] = useState<ScoreRule[]>([])
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])
  const [excludeSt, setExcludeSt] = useState(true)
  const [excludeAbnormalStatus, setExcludeAbnormalStatus] = useState(true)
  const [listedSessions, setListedSessions] = useState(60)
  const [selectionSequenceMode, setSelectionSequenceMode] = useState<'ACTUAL_POSITIONS' | 'MODEL_TARGETS'>('MODEL_TARGETS')
  const [targetCount, setTargetCount] = useState(50)
  const [retentionRank, setRetentionRank] = useState(75)
  const [rebalanceSessions, setRebalanceSessions] = useState(5)
  const [initialCash, setInitialCash] = useState(1_000_000)
  const [cashReserve, setCashReserve] = useState(2)
  const [buyFee, setBuyFee] = useState(3)
  const [sellFee, setSellFee] = useState(3)
  const [stampDuty, setStampDuty] = useState(5)
  const [slippage, setSlippage] = useState(2)
  const [impact, setImpact] = useState(20)
  const [participation, setParticipation] = useState(10)
  const [riskOverlay, setRiskOverlay] = useState<RiskOverlaySpec>(DEFAULT_RISK)
  const [preflight, setPreflight] = useState<StrategyPreflight | null>(null)
  const [preview, setPreview] = useState<StrategyPreview | null>(null)
  const [job, setJob] = useState<StrategyJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => {
    Promise.all([strategyApi.health(), strategyApi.options()]).then(([, loaded]) => {
      setOnline(true)
      setOptions(loaded)
      const draft = savedDraft()
      if (!draft?.risk_overlay && loaded.risk_overlay_defaults) {
        setRiskOverlay(loaded.risk_overlay_defaults)
      }
      const scores = DEFAULT_SCORE.map((id) => factorById(loaded, id)).filter(Boolean) as StrategyFactorOption[]
      const filters = DEFAULT_FILTERS.map((id) => factorById(loaded, id)).filter(Boolean) as StrategyFactorOption[]
      const usableScores = draft?.score_rules?.filter((rule) => factorById(loaded, rule.factor_id))
      const usableFilters = draft?.filter_rules?.filter((rule) => factorById(loaded, rule.factor_id))
      setScoreRules(usableScores?.length ? usableScores : scores.map((factor) => ({ factor_id: factor.factor_id, release_id: factor.release_id, direction: 'HIGH', weight: 50, transform: 'PERCENTILE' })))
      setFilterRules(usableFilters ? usableFilters : filters.map((factor) => ({ factor_id: factor.factor_id, release_id: factor.release_id, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' })))
      if (draft) {
        if (typeof draft.name === 'string') setName(draft.name)
        if (typeof draft.exclude_st === 'boolean') setExcludeSt(draft.exclude_st)
        if (typeof draft.exclude_abnormal_status === 'boolean') setExcludeAbnormalStatus(draft.exclude_abnormal_status)
        if (typeof draft.minimum_listed_sessions === 'number') setListedSessions(draft.minimum_listed_sessions)
        if (draft.selection_sequence_mode) setSelectionSequenceMode(draft.selection_sequence_mode)
        if (typeof draft.target_count === 'number') setTargetCount(draft.target_count)
        if (typeof draft.retention_rank === 'number') setRetentionRank(draft.retention_rank)
        if (typeof draft.rebalance_sessions === 'number') setRebalanceSessions(draft.rebalance_sessions)
        if (typeof draft.initial_cash_cny === 'number') setInitialCash(draft.initial_cash_cny)
        if (typeof draft.minimum_cash_fraction === 'number') setCashReserve(draft.minimum_cash_fraction * 100)
        if (typeof draft.buy_commission_bps === 'number') setBuyFee(draft.buy_commission_bps)
        if (typeof draft.sell_commission_bps === 'number') setSellFee(draft.sell_commission_bps)
        if (typeof draft.sell_stamp_duty_bps === 'number') setStampDuty(draft.sell_stamp_duty_bps)
        if (typeof draft.base_slippage_bps === 'number') setSlippage(draft.base_slippage_bps)
        if (typeof draft.square_root_impact_bps === 'number') setImpact(draft.square_root_impact_bps)
        if (typeof draft.maximum_participation_rate === 'number') setParticipation(draft.maximum_participation_rate * 100)
        if (draft.risk_overlay) setRiskOverlay({ ...DEFAULT_RISK, ...draft.risk_overlay })
      }
      const chosen = [
        ...(usableScores?.length ? usableScores.map((rule) => factorById(loaded, rule.factor_id)).filter(Boolean) : scores),
        ...(usableFilters ? usableFilters.map((rule) => factorById(loaded, rule.factor_id)).filter(Boolean) : filters),
      ] as StrategyFactorOption[]
      if (chosen.length) {
        const commonStart = chosen.map((item) => item.start).sort().at(-1)!
        const commonEnd = chosen.map((item) => item.end).sort()[0]
        setStart(draft?.start || commonStart); setEnd(draft?.end || commonEnd); setPreviewDate(draft?.end || commonEnd)
      }
      setDraftRestored(true)
      const savedJobId = window.localStorage.getItem(STRATEGY_JOB_STORAGE_KEY)
      const recover = strategyApi.list().then(({ jobs }) => {
        const selectedId = jobs.find((item) => item.status === 'RUNNING')?.job_id || savedJobId || jobs[0]?.job_id
        return selectedId ? strategyApi.status(selectedId) : null
      }).catch(() => savedJobId ? strategyApi.status(savedJobId).catch(() => null) : null)
      void recover.then((savedJob) => {
        if (!savedJob) return
        setJob(savedJob)
        window.localStorage.setItem(STRATEGY_JOB_STORAGE_KEY, savedJob.job_id)
        window.dispatchEvent(new CustomEvent(STRATEGY_JOB_EVENT, { detail: savedJob }))
      })
    }).catch((reason) => setError(`策略回测后端没有连上：${reason.message}`))
  }, [])

  useEffect(() => {
    if (!job) return
    window.localStorage.setItem(STRATEGY_JOB_STORAGE_KEY, job.job_id)
    window.dispatchEvent(new CustomEvent(STRATEGY_JOB_EVENT, { detail: job }))
  }, [job])

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return
    const timer = window.setInterval(() => strategyApi.status(job.job_id).then(setJob).catch((reason) => setError(reason.message)), 1500)
    return () => window.clearInterval(timer)
  }, [job?.job_id, job?.status])

  const payload = useMemo<StrategyRequest>(() => ({
    name, start, end, universe_id: 'ALL-A-PIT', selection_sequence_mode: selectionSequenceMode,
    score_rules: scoreRules, filter_rules: filterRules,
    exclude_st: excludeSt, exclude_abnormal_status: excludeAbnormalStatus,
    minimum_listed_sessions: listedSessions, target_count: targetCount,
    retention_rank: retentionRank, rebalance_sessions: rebalanceSessions, initial_cash_cny: initialCash,
    minimum_cash_fraction: cashReserve / 100, buy_commission_bps: buyFee, sell_commission_bps: sellFee,
    sell_stamp_duty_bps: stampDuty, base_slippage_bps: slippage, square_root_impact_bps: impact,
    maximum_slippage_bps: 100, maximum_participation_rate: participation / 100,
    risk_overlay: riskOverlay,
  }), [name, start, end, selectionSequenceMode, scoreRules, filterRules, excludeSt, excludeAbnormalStatus, listedSessions, targetCount, retentionRank, rebalanceSessions, initialCash, cashReserve, buyFee, sellFee, stampDuty, slippage, impact, participation, riskOverlay])

  useEffect(() => {
    if (draftRestored) window.localStorage.setItem(STRATEGY_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  }, [draftRestored, payload])

  const resetResults = () => { setPreflight(null); setPreview(null); if (job?.status !== 'RUNNING') setJob(null) }
  const updateScore = (index: number, patch: Partial<ScoreRule>) => { setScoreRules((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); resetResults() }
  const updateFilter = (index: number, patch: Partial<FilterRule>) => { setFilterRules((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); resetResults() }
  const addScore = () => { if (!options) return; const factor = options.factors.find((item) => !scoreRules.some((rule) => rule.factor_id === item.factor_id)); if (factor) setScoreRules([...scoreRules, { factor_id: factor.factor_id, release_id: factor.release_id, direction: factor.expected_direction, weight: 10, transform: 'PERCENTILE' }]) }
  const addFilter = () => { if (!options) return; const factor = options.factors.find((item) => !filterRules.some((rule) => rule.factor_id === item.factor_id)); if (factor) setFilterRules([...filterRules, { factor_id: factor.factor_id, release_id: factor.release_id, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' }]) }
  const updateRisk = (patch: Partial<RiskOverlaySpec>) => { setRiskOverlay((value) => ({ ...value, ...patch })); resetResults() }
  const updateRiskLevel = (index: number, patch: Partial<RiskLevel>) => {
    setRiskOverlay((value) => ({ ...value, levels: value.levels.map((item, i) => i === index ? { ...item, ...patch } : item) })); resetResults()
  }

  const runAction = async (action: 'preflight' | 'preview' | 'backtest') => {
    setBusy(true); setError('')
    try {
      if (action === 'preflight') setPreflight(await strategyApi.preflight(payload))
      if (action === 'preview') setPreview(await strategyApi.preview(payload, previewDate))
      if (action === 'backtest') setJob(await strategyApi.start(payload))
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const result = job?.result
  const summaryRequest = job?.request && 'score_rules' in job.request ? job.request : payload
  return <div className="strategy-page">
    <div className="strategy-heading"><div><span>STRATEGY BACKTEST</span><h1>通用策略回测</h1><p>从已发布因子出发，配置过滤、综合打分、持仓和交易规则，生成连续账户结果。</p></div><b className={online ? 'online' : ''}><i />{online ? '独立回测后端已连接' : '回测后端未连接'}</b></div>
    {error && <div className="strategy-error"><b>没有继续执行</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

    <div className="strategy-layout"><div className="strategy-config">
      <section className="strategy-panel"><header><span>01</span><div><h2>范围与股票池</h2><p>全部因子必须覆盖同一个回测区间。</p></div></header><div className="strategy-fields">
        <label><span>策略名称</span><input value={name} onChange={(e) => { setName(e.target.value); resetResults() }} /></label>
        <label><span>股票池</span><select><option>历史全 A 股票池</option></select></label>
        <label><span>选股序列口径</span><select value={selectionSequenceMode} onChange={(e) => { setSelectionSequenceMode(e.target.value as 'ACTUAL_POSITIONS' | 'MODEL_TARGETS'); resetResults() }}><option value="MODEL_TARGETS">模型目标序列（实验共用）</option><option value="ACTUAL_POSITIONS">实际持仓序列（原逻辑）</option></select></label>
        <label><span>开始日期</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); resetResults() }} /></label>
        <label><span>结束日期</span><input type="date" value={end} onChange={(e) => { setEnd(e.target.value); resetResults() }} /></label>
        <label><span>最少上市交易日</span><input type="number" value={listedSessions} onChange={(e) => setListedSessions(Number(e.target.value))} /></label>
        <label className="strategy-check"><input type="checkbox" checked={excludeSt} onChange={(e) => setExcludeSt(e.target.checked)} /><span>排除当日 ST 股票</span></label>
        <label className="strategy-check"><input type="checkbox" checked={excludeAbnormalStatus} onChange={(e) => setExcludeAbnormalStatus(e.target.checked)} /><span>PIT 异常状态退出（* / ST / PT / 退）</span></label>
      </div></section>

      <section className="strategy-panel"><header><span>02</span><div><h2>因子综合打分</h2><p>先转换成当日百分位排名，再按权重合成。</p></div></header>{options && <div className="rule-list">{scoreRules.map((rule, index) => <div className="rule-row" key={`${rule.factor_id}-${index}`}>
        <FactorSelect options={options} value={rule.factor_id} onChange={(factor) => updateScore(index, { factor_id: factor.factor_id, release_id: factor.release_id, direction: factor.expected_direction })} />
        <select value={rule.direction} onChange={(e) => updateScore(index, { direction: e.target.value as 'HIGH' | 'LOW' })}><option value="HIGH">高值优先</option><option value="LOW">低值优先</option></select>
        <label><input type="number" min="0.1" value={rule.weight} onChange={(e) => updateScore(index, { weight: Number(e.target.value) })} /><span>% 权重</span></label>
        <button onClick={() => setScoreRules((items) => items.filter((_, i) => i !== index))}>删除</button>
      </div>)}<button className="add-rule" onClick={addScore}>＋ 添加打分因子</button></div>}</section>

      <section className="strategy-panel"><header><span>03</span><div><h2>过滤规则</h2><p>规则数量不限；第一版按全部规则依次过滤。</p></div></header>{options && <div className="rule-list">{filterRules.map((rule, index) => <div className="rule-row filter" key={`${rule.factor_id}-${index}`}>
        <FactorSelect options={options} value={rule.factor_id} onChange={(factor) => updateFilter(index, { factor_id: factor.factor_id, release_id: factor.release_id })} />
        <select value={rule.mode} onChange={(e) => updateFilter(index, { mode: e.target.value as FilterRule['mode'] })}><option value="EXCLUDE_HIGH">排除最高</option><option value="EXCLUDE_LOW">排除最低</option></select>
        <label><input type="number" min="1" max="49" value={rule.fraction * 100} onChange={(e) => updateFilter(index, { fraction: Number(e.target.value) / 100 })} /><span>%</span></label>
        <select value={rule.missing_policy} onChange={(e) => updateFilter(index, { missing_policy: e.target.value as FilterRule['missing_policy'] })}><option value="EXCLUDE">缺值排除</option><option value="KEEP">缺值保留</option></select>
        <button onClick={() => setFilterRules((items) => items.filter((_, i) => i !== index))}>删除</button>
      </div>)}<button className="add-rule" onClick={addFilter}>＋ 添加过滤规则</button></div>}</section>

      <section className="strategy-panel"><header><span>04</span><div><h2>持仓、调仓与成本</h2><p>信号在收盘后形成，下一交易日开盘尝试成交。</p></div></header><div className="strategy-fields compact">
        <label><span>目标持股数</span><input type="number" value={targetCount} onChange={(e) => setTargetCount(Number(e.target.value))} /></label>
        <label><span>保留排名</span><input type="number" value={retentionRank} onChange={(e) => setRetentionRank(Number(e.target.value))} /></label>
        <label><span>每几日调仓</span><input type="number" value={rebalanceSessions} onChange={(e) => setRebalanceSessions(Number(e.target.value))} /></label>
        <label><span>初始资金（元）</span><input type="number" value={initialCash} onChange={(e) => setInitialCash(Number(e.target.value))} /></label>
        <label><span>现金保留 %</span><input type="number" value={cashReserve} onChange={(e) => setCashReserve(Number(e.target.value))} /></label>
        <label><span>最大参与率 %</span><input type="number" value={participation} onChange={(e) => setParticipation(Number(e.target.value))} /></label>
        <label><span>买入佣金 bps</span><input type="number" value={buyFee} onChange={(e) => setBuyFee(Number(e.target.value))} /></label>
        <label><span>卖出佣金 bps</span><input type="number" value={sellFee} onChange={(e) => setSellFee(Number(e.target.value))} /></label>
        <label><span>印花税 bps</span><input type="number" value={stampDuty} onChange={(e) => setStampDuty(Number(e.target.value))} /></label>
        <label><span>基础滑点 bps</span><input type="number" value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} /></label>
        <label><span>冲击系数 bps</span><input type="number" value={impact} onChange={(e) => setImpact(Number(e.target.value))} /></label>
      </div></section>

      <section className="strategy-panel risk-config"><header><span>05</span><div><h2>Risk Score 仓位管理</h2><p>R0–R8 是实验版本；M0–M6 是仓位档位。T 日收盘计算，T+1 开盘执行。</p></div></header>
      <div className="strategy-fields compact">
        <label><span>实验版本 R0–R8</span><select value={riskOverlay.experiment_variant} onChange={(e) => { const variant = e.target.value as RiskOverlaySpec['experiment_variant']; updateRisk({ experiment_variant: variant }); if (variant === 'R8') setSelectionSequenceMode('MODEL_TARGETS') }}>{Object.entries(RISK_VARIANTS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        <label><span>市场风险信号</span><select value={riskOverlay.market_scope} disabled><option value="ALL_A_EQUAL_WEIGHT_PIT">历史时点全 A 等权</option></select></label>
        <label><span>R3 调整间隔</span><input type="number" min="1" max="60" value={riskOverlay.r3_interval_sessions} onChange={(e) => updateRisk({ r3_interval_sessions: Number(e.target.value) })} /></label>
        <label><span>R6 回看交易日</span><input type="number" min="20" max="2520" value={riskOverlay.train_lookback_sessions} onChange={(e) => updateRisk({ train_lookback_sessions: Number(e.target.value) })} /></label>
        <label><span>R7 固定风险仓位 %</span><input type="number" min="0" max="100" step="1" value={riskOverlay.fixed_exposure * 100} onChange={(e) => updateRisk({ fixed_exposure: Number(e.target.value) / 100 })} /></label>
        <label><span>降仓确认日</span><input type="number" min="1" max="20" value={riskOverlay.down_confirmation_sessions} onChange={(e) => updateRisk({ down_confirmation_sessions: Number(e.target.value) })} /></label>
        <label><span>加仓确认日</span><input type="number" min="1" max="20" value={riskOverlay.up_confirmation_sessions} onChange={(e) => updateRisk({ up_confirmation_sessions: Number(e.target.value) })} /></label>
        <label><span>R4 阈值缓冲</span><input type="number" min="0" max="20" step="0.5" value={riskOverlay.hysteresis_score} onChange={(e) => updateRisk({ hysteresis_score: Number(e.target.value) })} /></label>
        <label><span>现金年化收益 %</span><input type="number" min="0" max="20" step="0.1" value={riskOverlay.cash_annual_yield * 100} onChange={(e) => updateRisk({ cash_annual_yield: Number(e.target.value) / 100 })} /></label>
      </div>
      {riskOverlay.experiment_variant === 'R8' && <><h3 className="risk-subtitle">R8 滚动凯利参数</h3><div className="strategy-fields compact kelly-config">
        <label><span>R8 回看交易日</span><input type="number" min="20" max="2520" value={riskOverlay.kelly_lookback_sessions} onChange={(e) => updateRisk({ kelly_lookback_sessions: Number(e.target.value) })} /></label>
        <label><span>R8 最小历史样本</span><input type="number" min="20" max="1260" value={riskOverlay.kelly_min_sessions} onChange={(e) => updateRisk({ kelly_min_sessions: Number(e.target.value) })} /></label>
        <label><span>R8 更新间隔（交易日）</span><input type="number" min="1" max="252" value={riskOverlay.kelly_update_sessions} onChange={(e) => updateRisk({ kelly_update_sessions: Number(e.target.value) })} /></label>
        <label><span>R8 凯利折扣 %</span><input type="number" min="1" max="100" step="5" value={riskOverlay.kelly_fraction * 100} onChange={(e) => updateRisk({ kelly_fraction: Number(e.target.value) / 100 })} /></label>
        <label><span>R8 初始风险仓位 %</span><input type="number" min="0" max="100" step="5" value={riskOverlay.kelly_initial_exposure * 100} onChange={(e) => updateRisk({ kelly_initial_exposure: Number(e.target.value) / 100 })} /></label>
        <label><span>R8 最低风险仓位 %</span><input type="number" min="0" max="100" step="5" value={riskOverlay.kelly_min_exposure * 100} onChange={(e) => updateRisk({ kelly_min_exposure: Number(e.target.value) / 100 })} /></label>
        <label><span>R8 最高风险仓位 %</span><input type="number" min="0" max="100" step="5" value={riskOverlay.kelly_max_exposure * 100} onChange={(e) => updateRisk({ kelly_max_exposure: Number(e.target.value) / 100 })} /></label>
        <label><span>R8 可接受回撤 %</span><input type="number" min="1" max="100" step="5" value={riskOverlay.kelly_drawdown_limit * 100} onChange={(e) => updateRisk({ kelly_drawdown_limit: Number(e.target.value) / 100 })} /></label>
        <label><span>R8 仓位步长 %</span><input type="number" min="1" max="100" step="1" value={riskOverlay.kelly_exposure_step * 100} onChange={(e) => updateRisk({ kelly_exposure_step: Number(e.target.value) / 100 })} /></label>
      </div><p className="risk-note">使用同一“模型目标序列（实验共用）”的 R0 净收益估算；只使用信号日及以前的数据，下一交易日执行。达到“R8 最小历史样本”之前使用“R8 初始风险仓位”。</p></>}
      <h3 className="risk-subtitle">M0–M6 仓位映射</h3>
      <div className="risk-level-table"><div className="risk-level-head"><b>档位</b><b>Risk 下限</b><b>Risk 上限</b><b>风险仓位 %</b><b>股票目标 %</b></div>{riskOverlay.levels.map((level, index) => <div className="risk-level-row" key={level.level_id}><b>{level.level_id}</b><input type="number" min="0" max="100" value={level.score_min} onChange={(e) => updateRiskLevel(index, { score_min: Number(e.target.value) })} /><input type="number" min="0" max="100" value={level.score_max} onChange={(e) => updateRiskLevel(index, { score_max: Number(e.target.value) })} /><input type="number" min="0" max="100" value={level.exposure * 100} onChange={(e) => updateRiskLevel(index, { exposure: Number(e.target.value) / 100 })} /><span>{(level.exposure * (1 - cashReserve / 100) * 100).toFixed(2)}%</span></div>)}</div>
      <details className="risk-advanced"><summary>五维 Risk Score 高级参数</summary><div className="strategy-fields compact">
        {Object.entries(riskOverlay.weights).map(([key, value]) => <label key={key}><span>{key} 权重 %</span><input type="number" min="0" max="100" value={value * 100} onChange={(e) => updateRisk({ weights: { ...riskOverlay.weights, [key]: Number(e.target.value) / 100 } })} /></label>)}
        <label><span>历史分位窗口</span><input type="number" value={riskOverlay.percentile_window_sessions} onChange={(e) => updateRisk({ percentile_window_sessions: Number(e.target.value) })} /></label>
        <label><span>最小历史样本</span><input type="number" value={riskOverlay.percentile_min_sessions} onChange={(e) => updateRisk({ percentile_min_sessions: Number(e.target.value) })} /></label>
        <label><span>广度回看</span><input type="number" value={riskOverlay.breadth_return_sessions} onChange={(e) => updateRisk({ breadth_return_sessions: Number(e.target.value) })} /></label>
        <label><span>趋势周期</span><input type="number" value={riskOverlay.trend_sessions} onChange={(e) => updateRisk({ trend_sessions: Number(e.target.value) })} /></label>
        <label><span>波动率周期</span><input type="number" value={riskOverlay.volatility_sessions} onChange={(e) => updateRisk({ volatility_sessions: Number(e.target.value) })} /></label>
        <label><span>流动性周期</span><input type="number" value={riskOverlay.liquidity_sessions} onChange={(e) => updateRisk({ liquidity_sessions: Number(e.target.value) })} /></label>
        <label><span>尾部压力平滑</span><input type="number" value={riskOverlay.stress_smoothing_sessions} onChange={(e) => updateRisk({ stress_smoothing_sessions: Number(e.target.value) })} /></label>
        <label><span>尾部跌幅阈值 %</span><input type="number" step="0.5" value={riskOverlay.tail_loss_threshold * 100} onChange={(e) => updateRisk({ tail_loss_threshold: Number(e.target.value) / 100 })} /></label>
      </div></details>
      {riskOverlay.experiment_variant === 'R5' && <p className="risk-warning">R5 使用完整回测区间的 R1 平均仓位，只能作为事后诊断。</p>}
      </section>
    </div>

    <aside className="strategy-console"><span>RUN CONTROL</span><h2>预检与运行</h2><div className="strategy-summary"><p><span>打分因子</span><b>{summaryRequest.score_rules.length} 个</b></p><p><span>过滤规则</span><b>{summaryRequest.filter_rules.length} 条</b></p><p><span>目标持股</span><b>{summaryRequest.target_count} 只</b></p><p><span>Risk实验</span><b>{summaryRequest.risk_overlay?.experiment_variant || 'R0'}</b></p><p><span>原持仓保留至</span><b>前 {summaryRequest.retention_rank} 名</b></p><p><span>区间</span><b>{summaryRequest.start}<br />至 {summaryRequest.end}</b></p></div>
      <button disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('preflight')}>一键预检</button>
      <div className="preview-control"><input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} /><button disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('preview')}>预览选股</button></div>
      <button className="run-backtest" disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('backtest')}>{job?.status === 'RUNNING' ? '正在回测…' : busy ? '正在创建回测任务…' : '开始策略回测'}</button>
      {preflight && <div className="strategy-ready"><b>✓ 数据预检通过</b><span>{preflight.session_count} 个交易日 · 预计选股调仓 {preflight.estimated_rebalances} 次</span>{preflight.risk_overlay?.data_check && <span>初始风险仓位 {percent(preflight.risk_overlay.data_check.initial_exposure)}{preflight.risk_overlay.data_check.scheduled_changes === null ? ' · 仓位变化在回测中滚动计算' : ` · 后续目标变化 ${preflight.risk_overlay.data_check.scheduled_changes} 次`}</span>}<small>共同范围 {preflight.common_range.start} → {preflight.common_range.end}</small></div>}
      {job?.status === 'RUNNING' && <div className="strategy-job">
        <p><b>{job.phase}</b><span>{job.progress}%</span></p>
        <i><em style={{ width: `${job.progress}%` }} /></i>
        <div className={`strategy-process-state ${job.process_alive !== false ? 'alive' : ''}`}><i />{job.process_alive !== false ? '回测进程正在运行' : '未检测到回测进程'}</div>
        <div className="strategy-progress-detail">
          <span><small>{job.query_progress != null && !job.processed_sessions ? '信号表查询' : '交易日进度'}</small><b>{job.query_progress != null && !job.processed_sessions ? `${job.query_progress.toFixed(1)}%` : job.processed_sessions != null && job.total_sessions ? `${job.processed_sessions} / ${job.total_sessions}` : '准备中'}</b></span>
          <span><small>当前日期</small><b>{job.current_session || '—'}</b></span>
          <span><small>已调仓</small><b>{job.rebalance_count ?? '—'} 次</b></span>
          <span><small>当前持仓</small><b>{job.position_count ?? '—'} 只</b></span>
          <span><small>运行时长</small><b>{duration(job.elapsed_seconds)}</b></span>
          <span><small>最近心跳</small><b>{job.heartbeat_at ? new Date(job.heartbeat_at).toLocaleTimeString('zh-CN', { hour12: false }) : '等待上报'}</b></span>
        </div>
        <code>{job.job_id}</code>
      </div>}
      {job?.status === 'STOPPED' && <div className="strategy-job-ended stopped"><b>本次回测已停止</b><span>未生成结果；旧进度已清除，可以调整参数后重新开始。</span><code>{job.job_id}</code></div>}
      {job?.status === 'FAIL' && <div className="strategy-job-ended failed"><b>本次回测失败</b><span>请查看运行日志或修改参数后重试。</span><code>{job.job_id}</code></div>}
      {job?.status === 'RUNNING' && <button className="stop-strategy" onClick={() => strategyApi.stop(job.job_id).then(setJob)}>停止回测</button>}
      {job?.status === 'PASS' && <a className="strategy-report" href={strategyApi.reportUrl(job.job_id)} target="_blank">打开 JSON 报告 ↗</a>}
    </aside></div>

    {preview && <section className="strategy-output"><header><div><span>SELECTION PREVIEW</span><h2>{preview.signal_date} 选股预览</h2></div><p>基础池 {preview.base_count} → 过滤后 {preview.after_filters} → 可打分 {preview.score_ready} → 选中 {preview.holdings.length}</p></header><div className="preview-stats">{preview.filter_counts.map((item) => <div key={item.factor_id}><span>{factorName(options, item.factor_id)}</span><b>排除 {item.excluded}</b><small>剩余 {item.remaining}</small></div>)}</div><div className="holding-table"><div><b>排名</b><b>股票</b><b>综合分</b><b>说明</b></div>{preview.holdings.map((item) => <div key={item.ts_code}><span>{item.rank}</span><span>{item.security_name}<small>{item.ts_code}</small></span><span>{item.score.toFixed(4)}</span><span>{item.retained ? '原持仓保留' : '新入选'}</span></div>)}</div></section>}

    {result && <section className="strategy-output result">
      <header><div><span>BACKTEST RESULT</span><h2>{name}</h2></div><p>{result.daily[0]?.session} → {result.daily.at(-1)?.session}</p></header>
      <div className="result-summary">
        <div className="result-hero"><span>累计收益</span><b>{percent(result.summary.total_return)}</b><small>连续账户净值表现</small></div>
        <div className="result-metrics">
          <div><span>年化收益</span><b>{percent(result.summary.annualized_return)}</b></div>
          <div className="risk"><span>最大回撤</span><b>{percent(result.summary.maximum_drawdown)}</b></div>
          <div><span>年化波动</span><b>{percent(result.summary.annualized_volatility)}</b></div>
          <div><span>夏普比率</span><b>{result.summary.sharpe?.toFixed(2) ?? '—'}</b></div>
          <div><span>总交易成本</span><b>¥{result.summary.total_cost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</b></div>
        </div>
      </div>
      <EquityChart daily={result.daily} benchmark={result.benchmark} drawdown={result.drawdown_period} />
      <div className="annual-results">{result.annual.map((item) => <div key={item.year}><span>{item.year}</span><b>{percent(item.return)}</b></div>)}</div>
      {result.risk_overlay && <div className="risk-result">
        <h3>仓位管理结果 · {result.risk_overlay.experiment_variant}</h3>
        {result.selection_sequence && <div className="selection-sequence-proof"><span>选股序列口径</span><b>{result.selection_sequence.mode === 'MODEL_TARGETS' ? '模型目标序列（实验共用）' : '实际持仓序列（原逻辑）'}</b><span>选股序列指纹</span><code title={result.selection_sequence.fingerprint}>{result.selection_sequence.fingerprint.slice(7, 23)}</code><small>{result.selection_sequence.selection_count} 次选股调仓；跨实验指纹相同才可直接比较</small></div>}
        <div className="risk-result-metrics"><div><span>平均目标风险仓位</span><b>{percent(result.risk_overlay.average_target_exposure)}</b></div><div><span>平均实际股票仓</span><b>{percent(result.risk_overlay.average_actual_stock_exposure)}</b></div><div><span>仓位变化</span><b>{result.risk_overlay.exposure_change_count} 次</b></div><div><span>样本标签</span><b>{result.risk_overlay.sample_classification}</b></div></div>
        <details><summary>查看逐季度仓位、收益与回撤</summary><div className="risk-quarter-table"><div><b>季度</b><b>目标仓位</b><b>实际股票仓</b><b>季度收益</b><b>季度最大回撤</b></div>{result.risk_overlay.quarterly.map((item) => <div key={item.period}><span>{item.period}</span><span>{percent(item.average_target_exposure)}</span><span>{percent(item.average_actual_stock_exposure)}</span><span>{percent(item.return)}</span><span>{percent(item.maximum_drawdown)}</span></div>)}</div></details>
        {!!result.risk_overlay.changes.length && result.risk_overlay.experiment_variant !== 'R8' && <details><summary>查看逐次仓位变化</summary><div className="risk-change-table"><div><b>信号日</b><b>执行日</b><b>Risk Score</b><b>目标档位</b><b>原仓位</b><b>新仓位</b></div>{result.risk_overlay.changes.map((item) => <div key={item.signal_session}><span>{item.signal_session}</span><span>{item.execution_session || '区间结束后'}</span><span>{item.risk_score === null ? '—' : item.risk_score.toFixed(2)}</span><span>{item.to_level || '滚动均值'}</span><span>{percent(item.from_exposure)}</span><span>{percent(item.to_exposure)}</span></div>)}</div></details>}
        {!!result.risk_overlay.changes.length && result.risk_overlay.experiment_variant === 'R8' && <details open><summary>查看滚动凯利仓位变化</summary><div className="kelly-change-table"><div><b>信号日</b><b>执行日</b><b>历史样本</b><b>年化均值</b><b>年化波动</b><b>历史最大回撤</b><b>原始凯利</b><b>回撤仓位上限</b><b>新仓位</b></div>{result.risk_overlay.changes.map((item) => <div key={item.signal_session}><span>{item.signal_session}</span><span>{item.execution_session || '区间结束后'}</span><span>{item.observations}</span><span>{percent(item.annualized_mean_return || 0)}</span><span>{percent(item.annualized_volatility || 0)}</span><span>{percent(item.historical_maximum_drawdown || 0)}</span><span>{percent(item.raw_kelly || 0)}</span><span>{percent(item.drawdown_cap || 0)}</span><span>{percent(item.to_exposure)}</span></div>)}</div></details>}
      </div>}
    </section>}
  </div>
}
