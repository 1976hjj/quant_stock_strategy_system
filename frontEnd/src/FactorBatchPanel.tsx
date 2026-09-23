import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import FactorBatchProgress from './FactorBatchProgress'
import type { FactorBatchPayload, FactorBatchPlan, FactorBatchStatus, FactorCatalogItem, UiStageId } from './types'

const STAGES: Array<{ id: UiStageId; title: string; text: string }> = [
  { id: 'm4_1', title: '有没有用', text: '因子值与未来收益' },
  { id: 'm4_2', title: '清洗后还管用吗', text: '缩尾、标准化与中性化' },
  { id: 'm4_3', title: '是不是碰巧', text: '稳健统计与多重检验' },
  { id: 'm4_4', title: '换时间还管用吗', text: '时间滚动检验' },
  { id: 'm4_5', title: '有没有重复', text: '本批因子共同去重' },
  { id: 'm4_6', title: '真实能不能成交', text: '成本、冲击与容量' },
]
const STORAGE_KEY = 'alpha-research.factor-batch-id'
const DEFAULT_STAGES: UiStageId[] = ['m4_1', 'm4_2', 'm4_3', 'm4_4', 'm4_5']

export default function FactorBatchPanel({ selected, onFinished }: {
  selected: Record<string, FactorCatalogItem>
  onFinished: () => void
}) {
  const [start, setStart] = useState('2020-01-02')
  const [end, setEnd] = useState('')
  const [bounds, setBounds] = useState<{ start: string | null; end: string | null } | null>(null)
  const [stages, setStages] = useState<UiStageId[]>(DEFAULT_STAGES)
  const [holding, setHolding] = useState(5)
  const [quantiles, setQuantiles] = useState(5)
  const [minimumPairs, setMinimumPairs] = useState(20)
  const [variants, setVariants] = useState(['WINSORIZED_ZSCORE', 'SIZE_NEUTRALIZED'])
  const [plan, setPlan] = useState<FactorBatchPlan | null>(null)
  const [batch, setBatch] = useState<FactorBatchStatus | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.factorBatchOptions().then((value) => {
      setBounds(value)
      if (value.end) setEnd(value.end)
      if (value.start && value.start > '2020-01-02') setStart(value.start)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const restore = saved ? api.factorBatchStatus(saved).then((value) => ({ batch: value })) : api.latestFactorBatch()
    restore.then(({ batch: value }) => {
      if (value) {
        setBatch(value)
        window.localStorage.setItem(STORAGE_KEY, value.batch_id)
      }
    }).catch(() => window.localStorage.removeItem(STORAGE_KEY))
  }, [])

  useEffect(() => {
    if (!batch || batch.status !== 'RUNNING') return
    const timer = window.setInterval(() => {
      api.factorBatchStatus(batch.batch_id).then((value) => {
        setBatch(value)
        if (value.status !== 'RUNNING') onFinished()
      }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [batch?.batch_id, batch?.status, onFinished])

  const factors = useMemo(() => Object.values(selected).sort((a, b) => a.factor_id.localeCompare(b.factor_id)), [selected])
  useEffect(() => setPlan(null), [selected])
  const payload: FactorBatchPayload = {
    factors: factors.map((factor) => ({ factor_id: factor.factor_id, factor_version: factor.factor_version })),
    start, end, stages, holding_sessions: holding, quantile_count: quantiles,
    minimum_pairs_per_session: minimumPairs, processed_variants: variants,
    selection_quantile: 0.2, capital_scenarios_cny: [1_000_000, 10_000_000, 100_000_000],
    buy_commission_bps: 3, sell_commission_bps: 3, sell_stamp_duty_bps: 5,
    base_slippage_bps: 2, square_root_impact_bps: 20, maximum_slippage_bps: 100,
    maximum_participation_rate: 0.1,
  }

  const valid = factors.length > 0 && Boolean(start && end) && start <= end && (!bounds?.start || start >= bounds.start) && (!bounds?.end || end <= bounds.end)
  const toggleStage = (id: UiStageId) => {
    setStages((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setPlan(null)
  }
  const preflight = async () => {
    setWorking(true)
    setError('')
    try { setPlan(await api.preflightFactorBatch(payload)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setWorking(false) }
  }
  const startBatch = async () => {
    setWorking(true)
    setError('')
    try {
      const started = await api.startFactorBatch(payload)
      setBatch(started)
      window.localStorage.setItem(STORAGE_KEY, started.batch_id)
      setPlan(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setWorking(false) }
  }
  const stopBatch = async () => {
    if (!batch) return
    setWorking(true)
    setError('')
    try { setBatch(await api.stopFactorBatch(batch.batch_id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setWorking(false) }
  }
  const retryBatch = async () => {
    if (!batch) return
    setWorking(true)
    setError('')
    try {
      const started = await api.retryFactorBatch(batch.batch_id)
      setBatch(started)
      window.localStorage.setItem(STORAGE_KEY, started.batch_id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setWorking(false) }
  }

  return <div className="factor-batch-workspace">
    <section className="panel">
      <div className="section-head"><span>01</span><div><h2>批量计算因子</h2><p>已选 {factors.length} 个因子。所有因子使用同一目标日期范围，已有覆盖自动复用或补齐。</p></div></div>
      <div className="batch-dates">
        <label>开始日期<input type="date" value={start} min={bounds?.start || undefined} max={end || bounds?.end || undefined} onChange={(event) => { setStart(event.target.value); setPlan(null) }} /></label>
        <label>结束日期<input type="date" value={end} min={start || bounds?.start || undefined} max={bounds?.end || undefined} onChange={(event) => { setEnd(event.target.value); setPlan(null) }} /></label>
        <span>本地数据：{bounds?.start || '—'} 至 {bounds?.end || '—'}</span>
      </div>
      {factors.length > 0 && <div className="batch-factor-names">{factors.map((factor) => <span key={factor.factor_id}>{factor.chinese_name}</span>)}</div>}
    </section>
    <section className="panel">
      <div className="section-head"><span>02</span><div><h2>选择要跑的检验</h2><p>M4.5 对本批因子共同检验；必需的前置阶段由预检补齐。M4.7 自动生成结果界面。</p></div></div>
      <div className="stage-grid">{STAGES.map((stage) => <button key={stage.id} className={`stage-card ${stages.includes(stage.id) ? 'selected' : ''}`} onClick={() => toggleStage(stage.id)}><div className="stage-card-top"><span className="stage-number">{stage.id.toUpperCase().replace('_', '.')}</span><i>{stages.includes(stage.id) ? '✓' : ''}</i></div><h3>{stage.title}</h3><p>{stage.text}</p></button>)}<div className="stage-card selected locked"><div className="stage-card-top"><span className="stage-number">M4.7</span><i>✓</i></div><h3>看结果、做决策</h3><p>任务进度、报告与共同检验结果始终可查看。</p></div></div>
      <div className="batch-params"><label>持仓期<select value={holding} onChange={(event) => { setHolding(Number(event.target.value)); setPlan(null) }}>{[5, 10, 20, 30].map((value) => <option key={value} value={value}>{value} 日</option>)}</select></label><details><summary>其他检验参数</summary><label>收益分组数<input type="number" min="2" max="20" value={quantiles} onChange={(event) => { setQuantiles(Number(event.target.value)); setPlan(null) }} /></label><label>每日最少有效样本<input type="number" min="3" value={minimumPairs} onChange={(event) => { setMinimumPairs(Number(event.target.value)); setPlan(null) }} /></label><div>{['WINSORIZED_ZSCORE', 'SIZE_NEUTRALIZED'].map((value) => <label key={value}><input type="checkbox" checked={variants.includes(value)} onChange={() => { setVariants((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]); setPlan(null) }} />{value === 'WINSORIZED_ZSCORE' ? '缩尾标准化' : '规模中性化'}</label>)}</div></details></div>
    </section>
    <section className="panel batch-run-panel">
      <div className="section-head"><span>03</span><div><h2>预检与运行</h2><p>因子按顺序计算；失败项不会阻止后续因子。</p></div></div>
      <div className="batch-run-actions"><button disabled={!valid || working || batch?.status === 'RUNNING'} onClick={() => void preflight()}>{working ? '处理中…' : '预检批次'}</button><button className="primary" disabled={!plan || working || batch?.status === 'RUNNING'} onClick={() => void startBatch()}>计算 {factors.length} 个因子{stages.length ? '并运行 M4' : ''}</button></div>
      {error && <div className="factor-compute-error">{error}</div>}
      {plan && <div className="batch-plan"><strong>预检通过：{plan.count} 个因子</strong><p>目标区间 {plan.start} 至 {plan.end} · 将运行 {plan.resolved_stages.length ? plan.resolved_stages.map((stage) => stage.toUpperCase().replace('_', '.')).join('、') : '仅计算因子值'}</p>{plan.added_stages.length > 0 && <p>自动补齐前置阶段：{plan.added_stages.map((stage) => stage.toUpperCase().replace('_', '.')).join('、')}</p>}<span>{plan.items.filter((item) => item.action === '已覆盖，可复用').length} 个已覆盖 · {plan.items.filter((item) => item.action !== '已覆盖，可复用').length} 个需计算或补齐{plan.estimated_pair_correlations > 0 ? ` · M4.5 约 ${plan.estimated_pair_correlations.toLocaleString()} 对比较` : ''}</span>{plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {batch && <FactorBatchProgress batch={batch} working={working} onStop={() => void stopBatch()} onRetry={() => void retryBatch()} />}
    </section>
  </div>
}
