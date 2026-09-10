import { useEffect, useMemo, useState } from 'react'
import { strategyApi } from './strategyApi'
import type { FilterRule, ScoreRule, StrategyFactorOption, StrategyJob, StrategyOptions, StrategyPreflight, StrategyPreview, StrategyRequest } from './strategyApi'

const DEFAULT_SCORE = ['jqdata-earnings-to-price-ratio', 'jqdata-cash-earnings-to-price-ratio']
const DEFAULT_FILTERS = ['jqdata-share-turnover-monthly', 'jqdata-daily-standard-deviation']
export const STRATEGY_JOB_STORAGE_KEY = 'alpha-research.strategy-current-job-id'
export const STRATEGY_JOB_EVENT = 'alpha-research:strategy-job-changed'
const STRATEGY_DRAFT_STORAGE_KEY = 'alpha-research.strategy-draft'

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
  const [listedSessions, setListedSessions] = useState(60)
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
      const scores = DEFAULT_SCORE.map((id) => factorById(loaded, id)).filter(Boolean) as StrategyFactorOption[]
      const filters = DEFAULT_FILTERS.map((id) => factorById(loaded, id)).filter(Boolean) as StrategyFactorOption[]
      const usableScores = draft?.score_rules?.filter((rule) => factorById(loaded, rule.factor_id))
      const usableFilters = draft?.filter_rules?.filter((rule) => factorById(loaded, rule.factor_id))
      setScoreRules(usableScores?.length ? usableScores : scores.map((factor) => ({ factor_id: factor.factor_id, release_id: factor.release_id, direction: 'HIGH', weight: 50, transform: 'PERCENTILE' })))
      setFilterRules(usableFilters ? usableFilters : filters.map((factor) => ({ factor_id: factor.factor_id, release_id: factor.release_id, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' })))
      if (draft) {
        if (typeof draft.name === 'string') setName(draft.name)
        if (typeof draft.exclude_st === 'boolean') setExcludeSt(draft.exclude_st)
        if (typeof draft.minimum_listed_sessions === 'number') setListedSessions(draft.minimum_listed_sessions)
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
    name, start, end, universe_id: 'ALL-A-PIT', score_rules: scoreRules, filter_rules: filterRules,
    exclude_st: excludeSt, minimum_listed_sessions: listedSessions, target_count: targetCount,
    retention_rank: retentionRank, rebalance_sessions: rebalanceSessions, initial_cash_cny: initialCash,
    minimum_cash_fraction: cashReserve / 100, buy_commission_bps: buyFee, sell_commission_bps: sellFee,
    sell_stamp_duty_bps: stampDuty, base_slippage_bps: slippage, square_root_impact_bps: impact,
    maximum_slippage_bps: 100, maximum_participation_rate: participation / 100,
  }), [name, start, end, scoreRules, filterRules, excludeSt, listedSessions, targetCount, retentionRank, rebalanceSessions, initialCash, cashReserve, buyFee, sellFee, stampDuty, slippage, impact, participation])

  useEffect(() => {
    if (draftRestored) window.localStorage.setItem(STRATEGY_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  }, [draftRestored, payload])

  const resetResults = () => { setPreflight(null); setPreview(null); if (job?.status !== 'RUNNING') setJob(null) }
  const updateScore = (index: number, patch: Partial<ScoreRule>) => { setScoreRules((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); resetResults() }
  const updateFilter = (index: number, patch: Partial<FilterRule>) => { setFilterRules((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item)); resetResults() }
  const addScore = () => { if (!options) return; const factor = options.factors.find((item) => !scoreRules.some((rule) => rule.factor_id === item.factor_id)); if (factor) setScoreRules([...scoreRules, { factor_id: factor.factor_id, release_id: factor.release_id, direction: factor.expected_direction, weight: 10, transform: 'PERCENTILE' }]) }
  const addFilter = () => { if (!options) return; const factor = options.factors.find((item) => !filterRules.some((rule) => rule.factor_id === item.factor_id)); if (factor) setFilterRules([...filterRules, { factor_id: factor.factor_id, release_id: factor.release_id, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' }]) }

  const runAction = async (action: 'preflight' | 'preview' | 'backtest') => {
    setBusy(true); setError('')
    try {
      if (action === 'preflight') setPreflight(await strategyApi.preflight(payload))
      if (action === 'preview') setPreview(await strategyApi.preview(payload, previewDate))
      if (action === 'backtest') { setPreflight(await strategyApi.preflight(payload)); setJob(await strategyApi.start(payload)) }
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
        <label><span>开始日期</span><input type="date" value={start} onChange={(e) => { setStart(e.target.value); resetResults() }} /></label>
        <label><span>结束日期</span><input type="date" value={end} onChange={(e) => { setEnd(e.target.value); resetResults() }} /></label>
        <label><span>最少上市交易日</span><input type="number" value={listedSessions} onChange={(e) => setListedSessions(Number(e.target.value))} /></label>
        <label className="strategy-check"><input type="checkbox" checked={excludeSt} onChange={(e) => setExcludeSt(e.target.checked)} /><span>排除当日 ST 股票</span></label>
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
    </div>

    <aside className="strategy-console"><span>RUN CONTROL</span><h2>预检与运行</h2><div className="strategy-summary"><p><span>打分因子</span><b>{summaryRequest.score_rules.length} 个</b></p><p><span>过滤规则</span><b>{summaryRequest.filter_rules.length} 条</b></p><p><span>目标持股</span><b>{summaryRequest.target_count} 只</b></p><p><span>原持仓保留至</span><b>前 {summaryRequest.retention_rank} 名</b></p><p><span>区间</span><b>{summaryRequest.start}<br />至 {summaryRequest.end}</b></p></div>
      <button disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('preflight')}>一键预检</button>
      <div className="preview-control"><input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} /><button disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('preview')}>预览选股</button></div>
      <button className="run-backtest" disabled={busy || !scoreRules.length || job?.status === 'RUNNING'} onClick={() => runAction('backtest')}>{job?.status === 'RUNNING' ? '正在回测…' : '开始策略回测'}</button>
      {preflight && <div className="strategy-ready"><b>✓ 数据预检通过</b><span>{preflight.session_count} 个交易日 · 预计调仓 {preflight.estimated_rebalances} 次</span><small>共同范围 {preflight.common_range.start} → {preflight.common_range.end}</small></div>}
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
    </section>}
  </div>
}
