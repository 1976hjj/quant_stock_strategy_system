import { useEffect, useMemo, useState } from 'react'
import { rotationApi, strategyApi } from './strategyApi'
import type { FilterRule, RotationCandidate, RotationFactorOption, RotationOptions, RotationPreflight, RotationPreview, RotationRequest, ScoreRule, StrategyJob } from './strategyApi'

const JOB_KEY = 'alpha-research.strategy-current-job-id'
const JOB_EVENT = 'alpha-research:strategy-job-changed'

function available(options: RotationOptions, factorId: string) {
  return options.factors.find((item) => item.factor_id === factorId && item.calculated && item.release_id)
}

function score(factor: RotationFactorOption, direction = factor.expected_direction): ScoreRule {
  return { factor_id: factor.factor_id, release_id: factor.release_id!, direction, weight: 1, transform: 'PERCENTILE' }
}

function newCandidate(options: RotationOptions, id: string, name: string, factorId: string, direction?: 'HIGH' | 'LOW'): RotationCandidate {
  const factor = available(options, factorId) || options.factors.find((item) => item.calculated && item.release_id)!
  return {
    candidate_id: id,
    name,
    kind: 'FACTOR',
    score_rules: [score(factor, direction || factor.expected_direction)],
    filter_rules: [],
    exclude_st: true,
    minimum_listed_sessions: 60,
    target_count: 30,
    retention_rank: 45,
    rebalance_sessions: 5,
    industry_control: 'CAP',
    maximum_industry_weight: .25,
    missing_industry_policy: 'UNKNOWN_BUCKET',
  }
}

function FactorSelect({ options, value, onChange }: { options: RotationOptions; value: string; onChange: (factor: RotationFactorOption) => void }) {
  return <select value={value} onChange={(event) => {
    const factor = options.factors.find((item) => item.factor_id === event.target.value)
    if (factor?.calculated && factor.release_id) onChange(factor)
  }}>
    {options.factors.map((factor) => <option key={factor.factor_id} value={factor.factor_id} disabled={!factor.calculated}>
      {factor.chinese_name} · {factor.source_collection}{factor.calculated ? '' : '（需先计算）'}
    </option>)}
  </select>
}

export default function RotationBacktest({ onOpenFactorCalculate, onOpenHistory }: { onOpenFactorCalculate: () => void; onOpenHistory: () => void }) {
  const [options, setOptions] = useState<RotationOptions | null>(null)
  const [online, setOnline] = useState(false)
  const [name, setName] = useState('价值 / 小盘轮动 v1')
  const [start, setStart] = useState('2020-01-02')
  const [end, setEnd] = useState('2025-12-31')
  const [previewDate, setPreviewDate] = useState('2025-12-30')
  const [candidates, setCandidates] = useState<RotationCandidate[]>([])
  const [metric, setMetric] = useState<RotationRequest['signal']['metric']>('TRAILING_RETURN')
  const [lookback, setLookback] = useState(20)
  const [decisionInterval, setDecisionInterval] = useState(1)
  const [threshold, setThreshold] = useState(1)
  const [confirmations, setConfirmations] = useState(2)
  const [minimumHold, setMinimumHold] = useState(5)
  const [allocationMode, setAllocationMode] = useState<RotationRequest['allocation']['mode']>('WINNER_TAKE_ALL')
  const [winnerWeight, setWinnerWeight] = useState(70)
  const [cashReserve, setCashReserve] = useState(2)
  const [initialCash, setInitialCash] = useState(1_000_000)
  const [buyFee, setBuyFee] = useState(3)
  const [sellFee, setSellFee] = useState(3)
  const [stampDuty, setStampDuty] = useState(5)
  const [slippage, setSlippage] = useState(2)
  const [impact, setImpact] = useState(20)
  const [participation, setParticipation] = useState(10)
  const [preflight, setPreflight] = useState<RotationPreflight | null>(null)
  const [preview, setPreview] = useState<RotationPreview | null>(null)
  const [job, setJob] = useState<StrategyJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([strategyApi.health(), rotationApi.options()]).then(([, loaded]) => {
      setOnline(true)
      setOptions(loaded)
      const value = newCandidate(loaded, 'value', '价值组合', 'earnings-yield')
      const book = available(loaded, 'book-to-price')
      if (book) value.score_rules.push(score(book))
      const small = newCandidate(loaded, 'small', '小盘组合', 'log-size', 'LOW')
      const volatility = available(loaded, 'return-volatility-20')
      if (volatility) small.filter_rules.push({ factor_id: volatility.factor_id, release_id: volatility.release_id!, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' })
      setCandidates([value, small])
    }).catch((reason) => setError(`轮动回测后端没有连上：${reason.message}`))
  }, [])

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return
    const timer = window.setInterval(() => strategyApi.status(job.job_id).then(setJob).catch((reason) => setError(reason.message)), 1500)
    return () => window.clearInterval(timer)
  }, [job?.job_id, job?.status])

  const payload = useMemo<RotationRequest>(() => ({
    schema_version: '1', strategy_type: 'ROTATION', name, start, end, universe_id: 'ALL-A-PIT', candidates,
    signal: { metric, lookback_sessions: lookback, decision_interval_sessions: decisionInterval, switch_threshold: threshold / 100, confirmation_periods: confirmations, minimum_hold_periods: minimumHold },
    allocation: { mode: allocationMode, winner_weight: winnerWeight / 100, minimum_cash_fraction: cashReserve / 100 },
    initial_cash_cny: initialCash, buy_commission_bps: buyFee, sell_commission_bps: sellFee,
    sell_stamp_duty_bps: stampDuty, historical_sell_stamp_duty_bps: 10, minimum_commission_cny: 5,
    transfer_fee_bps: .1, historical_transfer_fee_bps: .2, base_slippage_bps: slippage,
    square_root_impact_bps: impact, maximum_slippage_bps: 100, maximum_participation_rate: participation / 100,
  }), [name, start, end, candidates, metric, lookback, decisionInterval, threshold, confirmations, minimumHold, allocationMode, winnerWeight, cashReserve, initialCash, buyFee, sellFee, stampDuty, slippage, impact, participation])

  const updateCandidate = (index: number, patch: Partial<RotationCandidate>) => {
    setCandidates((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
    setPreflight(null)
  }
  const addCandidate = () => {
    if (!options || candidates.length >= 8) return
    setCandidates([...candidates, newCandidate(options, `candidate-${candidates.length + 1}`, `候选组合 ${candidates.length + 1}`, 'price-momentum-20')])
  }
  const addScore = (candidateIndex: number) => {
    if (!options) return
    const candidate = candidates[candidateIndex]
    const factor = options.factors.find((item) => item.calculated && item.release_id && !candidate.score_rules.some((rule) => rule.factor_id === item.factor_id))
    if (factor) updateCandidate(candidateIndex, { score_rules: [...candidate.score_rules, score(factor)] })
  }
  const addFilter = (candidateIndex: number) => {
    if (!options) return
    const candidate = candidates[candidateIndex]
    const factor = options.factors.find((item) => item.calculated && item.release_id && !candidate.filter_rules.some((rule) => rule.factor_id === item.factor_id))
    if (factor) updateCandidate(candidateIndex, { filter_rules: [...candidate.filter_rules, { factor_id: factor.factor_id, release_id: factor.release_id!, mode: 'EXCLUDE_HIGH', fraction: .2, missing_policy: 'EXCLUDE' }] })
  }
  const run = async (kind: 'preflight' | 'preview' | 'backtest') => {
    setBusy(true); setError('')
    try {
      if (kind === 'preview') {
        setPreview(await rotationApi.preview(payload, previewDate))
        return
      }
      const checked = await rotationApi.preflight(payload); setPreflight(checked)
      if (kind === 'backtest') {
        const started = await rotationApi.start(payload)
        setJob(started)
        window.localStorage.setItem(JOB_KEY, started.job_id)
        window.dispatchEvent(new CustomEvent(JOB_EVENT, { detail: started }))
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return <div className="strategy-page rotation-page">
    <div className="strategy-heading"><div><span>PORTFOLIO ROTATION</span><h1>通用多组合轮动</h1><p>候选组合独立形成影子净值，收盘后判断，下一交易日由同一个账户净额调仓。</p></div><b className={online ? 'online' : ''}><i />{online ? '独立回测后端已连接' : '回测后端未连接'}</b></div>
    {error && <div className="strategy-error"><b>没有继续执行</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    <div className="rotation-catalog-note"><b>因子目录 {options?.factor_counts.total ?? '—'} 个</b><span>已计算 {options?.factor_counts.calculated ?? '—'} 个 · 待计算 {options?.factor_counts.needs_calculation ?? '—'} 个</span><button onClick={onOpenFactorCalculate}>去计算更多因子</button></div>
    <div className="strategy-layout"><div className="strategy-config">
      <section className="strategy-panel"><header><span>01</span><div><h2>范围与候选组合</h2><p>支持2–8个候选组合；首版已预置价值与小盘。</p></div></header><div className="strategy-fields">
        <label><span>策略名称</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>开始日期</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label><span>结束日期</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div></section>
      {options && candidates.map((candidate, candidateIndex) => <section className="strategy-panel rotation-candidate" key={candidate.candidate_id}><header><span>{String(candidateIndex + 2).padStart(2, '0')}</span><div><h2>{candidate.name}</h2><p>{candidate.score_rules.length}个评分因子 · {candidate.filter_rules.length}条过滤规则</p></div>{candidates.length > 2 && <button className="candidate-delete" onClick={() => setCandidates((items) => items.filter((_, index) => index !== candidateIndex))}>删除组合</button>}</header>
        <div className="strategy-fields compact"><label><span>组合名称</span><input value={candidate.name} onChange={(e) => updateCandidate(candidateIndex, { name: e.target.value })} /></label><label><span>目标持股</span><input type="number" min="1" max="500" value={candidate.target_count} onChange={(e) => updateCandidate(candidateIndex, { target_count: Number(e.target.value) })} /></label><label><span>保留至排名</span><input type="number" value={candidate.retention_rank} onChange={(e) => updateCandidate(candidateIndex, { retention_rank: Number(e.target.value) })} /></label><label><span>组合调仓间隔</span><input type="number" value={candidate.rebalance_sessions} onChange={(e) => updateCandidate(candidateIndex, { rebalance_sessions: Number(e.target.value) })} /></label><label><span>行业控制</span><select value={candidate.industry_control} onChange={(e) => updateCandidate(candidateIndex, { industry_control: e.target.value as RotationCandidate['industry_control'] })}>{options.industry_controls.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>单行业上限 %</span><input type="number" value={candidate.maximum_industry_weight * 100} onChange={(e) => updateCandidate(candidateIndex, { maximum_industry_weight: Number(e.target.value) / 100 })} /></label></div>
        <h3 className="rotation-rule-title">评分因子</h3><div className="rule-list">{candidate.score_rules.map((rule, ruleIndex) => <div className="rule-row" key={`${rule.factor_id}-${ruleIndex}`}><FactorSelect options={options} value={rule.factor_id} onChange={(factor) => updateCandidate(candidateIndex, { score_rules: candidate.score_rules.map((item, index) => index === ruleIndex ? score(factor) : item) })} /><select value={rule.direction} onChange={(e) => updateCandidate(candidateIndex, { score_rules: candidate.score_rules.map((item, index) => index === ruleIndex ? { ...item, direction: e.target.value as 'HIGH' | 'LOW' } : item) })}><option value="HIGH">高值优先</option><option value="LOW">低值优先</option></select><label><input type="number" value={rule.weight} onChange={(e) => updateCandidate(candidateIndex, { score_rules: candidate.score_rules.map((item, index) => index === ruleIndex ? { ...item, weight: Number(e.target.value) } : item) })} /><span>权重</span></label><button disabled={candidate.score_rules.length === 1} onClick={() => updateCandidate(candidateIndex, { score_rules: candidate.score_rules.filter((_, index) => index !== ruleIndex) })}>删除</button></div>)}<button className="add-rule" onClick={() => addScore(candidateIndex)}>＋ 添加评分因子</button></div>
        <h3 className="rotation-rule-title">过滤规则</h3><div className="rule-list">{candidate.filter_rules.map((rule, ruleIndex) => <div className="rule-row filter" key={`${rule.factor_id}-${ruleIndex}`}><FactorSelect options={options} value={rule.factor_id} onChange={(factor) => updateCandidate(candidateIndex, { filter_rules: candidate.filter_rules.map((item, index) => index === ruleIndex ? { ...item, factor_id: factor.factor_id, release_id: factor.release_id! } : item) })} /><select value={rule.mode} onChange={(e) => updateCandidate(candidateIndex, { filter_rules: candidate.filter_rules.map((item, index) => index === ruleIndex ? { ...item, mode: e.target.value as FilterRule['mode'] } : item) })}><option value="EXCLUDE_HIGH">排除最高</option><option value="EXCLUDE_LOW">排除最低</option></select><label><input type="number" value={rule.fraction * 100} onChange={(e) => updateCandidate(candidateIndex, { filter_rules: candidate.filter_rules.map((item, index) => index === ruleIndex ? { ...item, fraction: Number(e.target.value) / 100 } : item) })} /><span>%</span></label><button onClick={() => updateCandidate(candidateIndex, { filter_rules: candidate.filter_rules.filter((_, index) => index !== ruleIndex) })}>删除</button></div>)}<button className="add-rule" onClick={() => addFilter(candidateIndex)}>＋ 添加过滤规则</button></div>
      </section>)}
      <button className="add-candidate" disabled={!options || candidates.length >= 8} onClick={addCandidate}>＋ 添加候选组合（{candidates.length}/8）</button>
      <section className="strategy-panel"><header><span>R</span><div><h2>轮动信号与资金分配</h2><p>阈值、连续确认和最短持有共同抑制来回切换。</p></div></header><div className="strategy-fields compact"><label><span>比较指标</span><select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>{options?.signal_metrics.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>回看交易日</span><input type="number" value={lookback} onChange={(e) => setLookback(Number(e.target.value))} /></label><label><span>每几日判断</span><input type="number" value={decisionInterval} onChange={(e) => setDecisionInterval(Number(e.target.value))} /></label><label><span>切换阈值 %</span><input type="number" step=".1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label><label><span>连续确认次数</span><input type="number" value={confirmations} onChange={(e) => setConfirmations(Number(e.target.value))} /></label><label><span>最短持有期</span><input type="number" value={minimumHold} onChange={(e) => setMinimumHold(Number(e.target.value))} /></label><label><span>分配方式</span><select value={allocationMode} onChange={(e) => setAllocationMode(e.target.value as typeof allocationMode)}>{options?.allocation_modes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>领先组合权重 %</span><input type="number" disabled={allocationMode !== 'WINNER_TILT'} value={winnerWeight} onChange={(e) => setWinnerWeight(Number(e.target.value))} /></label></div></section>
      <section className="strategy-panel"><header><span>C</span><div><h2>账户、成交与成本</h2><p>与普通因子回测共用同一真实成交模型。</p></div></header><div className="strategy-fields compact"><label><span>初始资金</span><input type="number" value={initialCash} onChange={(e) => setInitialCash(Number(e.target.value))} /></label><label><span>现金保留 %</span><input type="number" value={cashReserve} onChange={(e) => setCashReserve(Number(e.target.value))} /></label><label><span>买入佣金 bps</span><input type="number" value={buyFee} onChange={(e) => setBuyFee(Number(e.target.value))} /></label><label><span>卖出佣金 bps</span><input type="number" value={sellFee} onChange={(e) => setSellFee(Number(e.target.value))} /></label><label><span>卖出印花税 bps</span><input type="number" value={stampDuty} onChange={(e) => setStampDuty(Number(e.target.value))} /></label><label><span>基础滑点 bps</span><input type="number" value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} /></label><label><span>冲击系数 bps</span><input type="number" value={impact} onChange={(e) => setImpact(Number(e.target.value))} /></label><label><span>最大参与率 %</span><input type="number" value={participation} onChange={(e) => setParticipation(Number(e.target.value))} /></label></div><p className="cost-note">最低佣金固定为每笔5元；卖出另收印花税，买入不收；过户费买卖双向计算。</p></section>
    </div><aside className="strategy-console"><span>ROTATION CONTROL</span><h2>预检与运行</h2><div className="strategy-summary"><p><span>候选组合</span><b>{candidates.length} 个</b></p><p><span>可用因子</span><b>{options?.factor_counts.calculated ?? '—'} 个</b></p><p><span>轮动规则</span><b>{lookback}日 / 阈值{threshold}%</b></p><p><span>调仓执行</span><b>次日开盘</b></p><p><span>区间</span><b>{start}<br />至 {end}</b></p></div><button disabled={busy || candidates.length < 2 || job?.status === 'RUNNING'} onClick={() => run('preflight')}>一键预检</button><div className="preview-control"><input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} /><button disabled={busy || candidates.length < 2 || job?.status === 'RUNNING'} onClick={() => run('preview')}>预览候选持仓</button></div><button className="run-backtest" disabled={busy || candidates.length < 2 || job?.status === 'RUNNING'} onClick={() => run('backtest')}>{job?.status === 'RUNNING' ? `正在回测 ${job.progress}%` : '开始轮动回测'}</button>{preflight && <div className="strategy-ready"><b>✓ 数据预检通过</b><span>{preflight.session_count}个交易日 · 预计判断{preflight.estimated_decisions}次</span><small>行业 {preflight.industry.mapped_count}/{preflight.industry.universe_count} · 解决重叠 {preflight.industry.overlap_resolved_count}只</small></div>}{job && <div className="rotation-job"><b>{job.phase}</b><span>{job.status} · {job.progress}%</span>{job.status === 'PASS' && <button onClick={onOpenHistory}>进入历史结果</button>}</div>}</aside></div>
    {preview && <section className="strategy-output rotation-preview"><header><span>PREVIEW</span><div><h2>{preview.signal_date} 候选组合预览</h2><p>信号使用当日收盘可得信息，交易在下一可成交日开盘尝试执行。</p></div></header><div className="rotation-preview-grid">{preview.candidates.map((candidate) => <article key={candidate.candidate_id}><h3>{candidate.name}<small>入选 {candidate.holdings.length}只 · 行业上限排除 {candidate.industry_limit_excluded}只</small></h3><div>{candidate.holdings.slice(0, 12).map((holding) => <span key={holding.ts_code}><b>{holding.rank}. {holding.security_name}</b><small>{holding.ts_code} · {holding.industry_code || 'UNKNOWN'} · {holding.score.toFixed(3)}</small></span>)}</div></article>)}</div>{preview.overlaps.length > 0 && <div className="rotation-overlaps">{preview.overlaps.map((item) => <span key={`${item.left_candidate_id}-${item.right_candidate_id}`}>{item.left_candidate_id} / {item.right_candidate_id}：共同 {item.shared_count}只，重合度 {(item.jaccard * 100).toFixed(1)}%</span>)}</div>}</section>}
  </div>
}
