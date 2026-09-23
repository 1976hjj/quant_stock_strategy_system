import { useCallback, useEffect, useMemo, useState } from 'react'
import { factorAssets } from './api'
import { StrategyHistoryDetail } from './StrategyBacktestHistory'
import { strategyApi } from './strategyApi'
import type { StrategyFactorOption, StrategyJob, StrategyJobHistory, UniverseSegment } from './strategyApi'
import type { FactorAssetRun } from './types'

const SEGMENT_NAMES: Record<UniverseSegment, string> = {
  SH_MAIN: '沪市主板', SZ_MAIN: '深市主板', CHINEXT: '创业板', STAR: '科创板', BSE: '北交所',
}
const STATUS_NAMES: Record<StrategyJobHistory['status'], string> = {
  RUNNING: '回测中', PASS: '已完成', FAIL: '失败', STOPPED: '已停止',
}

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}

function time(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}

function runDay(value?: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

function universe(job: StrategyJobHistory) {
  const request = job.request
  if (!request || !('universe_segments' in request) || !request.universe_segments?.length) return '全A股'
  if (request.universe_segments.length === Object.keys(SEGMENT_NAMES).length) return '全A股'
  return request.universe_segments.map((item) => SEGMENT_NAMES[item]).join(' · ')
}

function factorId(job: StrategyJobHistory) {
  return job.single_factor?.factor_id
    || (job.request && 'score_rules' in job.request ? job.request.score_rules[0]?.factor_id : '')
}

function direction(job: StrategyJobHistory) {
  const value = job.single_factor?.direction
    || (job.request && 'score_rules' in job.request ? job.request.score_rules[0]?.direction : undefined)
  return value === 'LOW' ? '低值优先' : value === 'HIGH' ? '高值优先' : '—'
}

function ComparePanel({ jobs, factors, onRemove, onClear }: {
  jobs: StrategyJobHistory[]
  factors: Map<string, StrategyFactorOption>
  onRemove: (id: string) => void
  onClear: () => void
}) {
  if (jobs.length < 2) return null
  const comparable = jobs.every((job) => job.comparison_key && job.comparison_key === jobs[0].comparison_key)
  const rows: Array<[string, (job: StrategyJobHistory) => string]> = [
    ['累计收益', (job) => pct(job.result_summary?.total_return)],
    ['年化收益', (job) => pct(job.result_summary?.annualized_return)],
    ['沪深300', (job) => pct(job.result_summary?.benchmark_total_return)],
    ['超额收益', (job) => pct(job.result_summary?.excess_return)],
    ['最大回撤', (job) => pct(job.result_summary?.maximum_drawdown)],
    ['夏普', (job) => job.result_summary?.sharpe?.toFixed(2) ?? '—'],
    ['Calmar', (job) => job.result_summary?.calmar?.toFixed(2) ?? '—'],
    ['年化波动', (job) => pct(job.result_summary?.annualized_volatility)],
    ['总交易成本', (job) => job.result_summary ? `¥${job.result_summary.total_cost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}` : '—'],
  ]
  return <section className="single-compare">
    <header><div><span>RESULT COMPARISON</span><h2>单因子结果对比</h2></div><div><b className={comparable ? 'comparable' : 'different'}>{comparable ? '参数一致，可直接比较' : '参数不同，请谨慎比较'}</b><button onClick={onClear}>清空对比</button></div></header>
    <div className="single-compare-grid" style={{ gridTemplateColumns: `130px repeat(${jobs.length}, minmax(180px, 1fr))` }}>
      <span className="compare-corner">指标</span>
      {jobs.map((job) => { const meta = factors.get(factorId(job)); const interval = job.request && 'rebalance_sessions' in job.request ? job.request.rebalance_sessions : '—'; return <div className="compare-factor" key={job.job_id}><b>{meta?.chinese_name || factorId(job)}</b><small>{direction(job)} · {interval}日调仓</small><button onClick={() => onRemove(job.job_id)}>移除</button></div> })}
      {rows.flatMap(([label, format]) => [<b className="compare-label" key={`${label}-label`}>{label}</b>, ...jobs.map((job) => <span key={`${label}-${job.job_id}`}>{format(job)}</span>)])}
    </div>
  </section>
}

function FactorEvidence({ run }: { run: FactorAssetRun | null | undefined }) {
  if (run === undefined) return <section className="single-evidence"><h3>因子研究证据</h3><p>正在读取对应的 M4 检验结果…</p></section>
  if (run === null) return <section className="single-evidence"><h3>因子研究证据</h3><p>该因子版本尚无可关联的 M4 检验结果，策略回测结果仍可独立查看。</p></section>
  const variant = run.variants.find((item) => item.variant === 'RAW') || run.variants[0]
  if (!variant) return <section className="single-evidence"><h3>因子研究证据</h3><p>已找到检验批次，但该批次没有可展示的处理版本。</p></section>
  return <section className="single-evidence">
    <header><div><span>FACTOR EVIDENCE</span><h3>因子研究证据</h3></div><b>{variant.variant_label}</b></header>
    <div className="single-evidence-grid">
      <div><span>有效覆盖率</span><b>{pct(variant.coverage)}</b></div>
      <div><span>Rank IC 均值</span><b>{variant.mean_rank_ic?.toFixed(4) ?? '—'}</b></div>
      <div><span>样本外方向 IC</span><b>{variant.mean_test_rank_ic_directed?.toFixed(4) ?? '—'}</b></div>
      <div><span>多空分组收益差</span><b>{pct(variant.quantile_spread)}</b></div>
      <div><span>头部分组换手率</span><b>{pct(variant.top_turnover)}</b></div>
      <div><span>支持 / 反向折数</span><b>{variant.supported_folds} / {variant.contradicted_folds}</b></div>
      <div><span>HAC q 值</span><b>{variant.hac_q_value?.toFixed(4) ?? '—'}</b></div>
      <div><span>Bootstrap q 值</span><b>{variant.bootstrap_q_value?.toFixed(4) ?? '—'}</b></div>
    </div>
    <small>检验区间 {run.test_window ? `${run.test_window.start} → ${run.test_window.end}` : `${run.asset_window.start} → ${run.asset_window.end}`} · 预测未来 {run.holding_sessions ?? '—'} 日收益 · {run.quantile_count ?? '—'} 组</small>
  </section>
}

function PerformanceOverview({ job }: { job: StrategyJob }) {
  const summary = job.result?.summary
  if (!summary) return null
  const benchmark = job.result?.benchmark?.summary.total_return
  const excess = benchmark == null ? null : summary.total_return - benchmark
  const calmar = summary.maximum_drawdown ? summary.annualized_return / Math.abs(summary.maximum_drawdown) : null
  const metrics: Array<[string, string, string?]> = [
    ['累计收益', pct(summary.total_return), 'primary'], ['年化收益', pct(summary.annualized_return)],
    ['沪深300', pct(benchmark)], ['超额收益', pct(excess), excess != null && excess >= 0 ? 'positive' : 'negative'],
    ['最大回撤', pct(summary.maximum_drawdown), 'negative'], ['夏普比率', summary.sharpe?.toFixed(2) ?? '—'],
    ['Calmar', calmar?.toFixed(2) ?? '—'], ['年化波动', pct(summary.annualized_volatility)],
    ['总换手', pct(summary.turnover)], ['交易成本', `¥${summary.total_cost.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`],
  ]
  return <section className="single-performance"><h3>结果概览</h3><div>{metrics.map(([label, value, tone]) => <span className={tone || ''} key={label}><i>{label}</i><b>{value}</b></span>)}</div></section>
}

export default function SingleFactorReports({ onOpenRunning }: { onOpenRunning: () => void }) {
  const [jobs, setJobs] = useState<StrategyJobHistory[]>([])
  const [factorOptions, setFactorOptions] = useState<StrategyFactorOption[]>([])
  const [details, setDetails] = useState<Record<string, StrategyJob>>({})
  const [evidence, setEvidence] = useState<Record<string, FactorAssetRun | null>>({})
  const [expanded, setExpanded] = useState('')
  const [detailLoading, setDetailLoading] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [selectedDay, setSelectedDay] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState('')

  const factors = useMemo(() => new Map(factorOptions.map((item) => [item.factor_id, item])), [factorOptions])
  const sources = useMemo(() => [...new Set(factorOptions.map((item) => item.source_collection))].sort(), [factorOptions])
  const categories = useMemo(() => [...new Set(factorOptions.map((item) => item.category))].sort(), [factorOptions])

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [history, options] = await Promise.all([strategyApi.list('single-factor'), strategyApi.options()])
      setJobs(history.jobs)
      setFactorOptions(options.factors)
      setError('')
      setRefreshedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(true) }, [load])
  useEffect(() => {
    if (!jobs.some((item) => item.status === 'RUNNING')) return
    const timer = window.setInterval(() => void load(), 1500)
    return () => window.clearInterval(timer)
  }, [jobs, load])

  const visible = useMemo(() => jobs.filter((job) => {
    const meta = factors.get(factorId(job))
    const needle = query.trim().toLowerCase()
    if (needle && !`${meta?.chinese_name || ''} ${factorId(job)} ${job.name}`.toLowerCase().includes(needle)) return false
    if (source !== 'ALL' && meta?.source_collection !== source) return false
    if (category !== 'ALL' && meta?.category !== category) return false
    if (selectedDay && runDay(job.created_at) !== selectedDay) return false
    return true
  }), [jobs, factors, query, source, category, selectedDay])

  const toggleDetail = async (jobId: string) => {
    if (expanded === jobId) { setExpanded(''); return }
    setExpanded(jobId)
    if (details[jobId]) return
    setDetailLoading(jobId)
    try {
      const job = jobs.find((item) => item.job_id === jobId)
      const id = job ? factorId(job) : ''
      const [detailResult, evidenceResult] = await Promise.allSettled([
        strategyApi.status(jobId),
        id ? factorAssets({ page: 1, pageSize: 20, query: id }) : Promise.resolve(null),
      ])
      if (detailResult.status === 'rejected') throw detailResult.reason
      setDetails((current) => ({ ...current, [jobId]: detailResult.value }))
      if (evidenceResult.status === 'fulfilled' && evidenceResult.value) {
        const releases = evidenceResult.value.items.flatMap((item) => item.runs)
        const releaseId = job?.single_factor?.release_id
        const matched = releases.find((item) => item.factor_id === id && item.factor_release_id === releaseId)
          || releases.find((item) => item.factor_id === id)
          || null
        setEvidence((current) => ({ ...current, [jobId]: matched }))
      } else {
        setEvidence((current) => ({ ...current, [jobId]: null }))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDetailLoading('')
    }
  }

  const toggleCompare = (job: StrategyJobHistory) => {
    if (job.status !== 'PASS') return
    setSelected((current) => current.includes(job.job_id)
      ? current.filter((id) => id !== job.job_id)
      : current.length < 4 ? [...current, job.job_id] : current)
  }

  const deleteJob = async (job: StrategyJobHistory) => {
    if (job.status === 'RUNNING' || !window.confirm(`确定删除“${factors.get(factorId(job))?.chinese_name || job.name}”的这次单因子回测吗？`)) return
    try {
      await strategyApi.delete(job.job_id)
      setJobs((current) => current.filter((item) => item.job_id !== job.job_id))
      setSelected((current) => current.filter((id) => id !== job.job_id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const selectedJobs = selected.map((id) => jobs.find((job) => job.job_id === id)).filter(Boolean) as StrategyJobHistory[]
  const completed = jobs.filter((job) => job.status === 'PASS')
  const testedFactors = new Set(completed.map(factorId).filter(Boolean)).size
  const best = completed.reduce<StrategyJobHistory | null>((winner, job) => !winner || (job.result_summary?.sharpe ?? -Infinity) > (winner.result_summary?.sharpe ?? -Infinity) ? job : winner, null)

  return <div className="strategy-history-page single-factor-page">
    <div className="strategy-history-heading single-factor-heading">
      <div><span>SINGLE FACTOR LAB</span><h1>单因子回测报告</h1><p>统一参数下比较每个因子的收益、风险和交易代价；点击详情查看完整参数快照与成交记录。</p></div>
      <div className="history-refresh"><button onClick={() => void load(true)} disabled={loading}>{loading ? '正在刷新…' : '刷新列表'}</button>{refreshedAt && <small>已刷新：{refreshedAt}</small>}</div>
    </div>
    <div className="single-summary">
      <div><b>{testedFactors}</b><span>已测试因子</span></div><div><b>{completed.length}</b><span>完成的回测</span></div><div><b>{jobs.filter((job) => job.status === 'RUNNING').length}</b><span>正在运行</span></div><div><b>{best ? factors.get(factorId(best))?.chinese_name || factorId(best) : '—'}</b><span>当前最高夏普 {best?.result_summary?.sharpe?.toFixed(2) ?? '—'}</span></div>
    </div>
    <div className="single-filters">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索因子名称、编号或策略名称" />
      <select value={source} onChange={(event) => setSource(event.target.value)}><option value="ALL">全部来源</option>{sources.map((item) => <option value={item} key={item}>{item === 'CURRENT' ? '自定义因子' : item}</option>)}</select>
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">全部分类</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select>
      <label>运行日期<input type="date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} /></label>
      <span>找到 {visible.length} 条结果</span>
    </div>
    {selected.length === 1 && <div className="single-compare-hint">已选择 1 条结果，再选择一条即可开始对比；最多选择 4 条。</div>}
    <ComparePanel jobs={selectedJobs} factors={factors} onRemove={(id) => setSelected((current) => current.filter((item) => item !== id))} onClear={() => setSelected([])} />
    {error && <div className="strategy-error"><b>读取失败</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {!loading && !error && visible.length === 0 && <div className="history-empty"><b>还没有符合条件的单因子回测</b><span>在“因子策略”中只选择一个评分因子运行，完成后会自动归档到这里。</span></div>}
    {visible.length > 0 && <div className="history-table single-factor-table">
      <div className="single-factor-head"><span>对比</span><span>因子 / 运行时间</span><span>回测区间</span><span>股票池</span><span>调仓</span><span>累计收益</span><span>超额收益</span><span>最大回撤</span><span>夏普</span><span>状态</span><span /></div>
      {visible.map((job) => { const meta = factors.get(factorId(job)); const picked = selected.includes(job.job_id); return <div className={`history-table-item ${job.status.toLowerCase()} ${picked ? 'compare-selected' : ''}`} key={job.job_id}>
        <div className="single-factor-row">
          <button className={`compare-toggle ${picked ? 'active' : ''}`} disabled={job.status !== 'PASS' || (!picked && selected.length >= 4)} onClick={() => toggleCompare(job)} title="加入结果对比">{picked ? '✓' : '+'}</button>
          <span className="history-name"><b>{meta?.chinese_name || factorId(job)}</b><small>{direction(job)} · {meta?.category || '未分类'} · {time(job.created_at)}</small><code>{factorId(job)} · {job.single_factor?.release_id || '历史版本'}</code></span>
          <span>{job.request?.start || '—'}<small>至 {job.request?.end || '—'}</small></span>
          <span className="history-universe-summary" title={universe(job)}>{universe(job)}<small>股票池范围</small></span>
          <span className="history-rebalance-summary">{job.request && 'rebalance_sessions' in job.request ? `${job.request.rebalance_sessions}日` : '—'}<small>{job.request && 'shadow_health' in job.request ? job.request.shadow_health?.experiment_variant || 'S0' : 'S0'}</small></span>
          <strong>{pct(job.result_summary?.total_return)}</strong><strong>{pct(job.result_summary?.excess_return)}</strong><strong>{pct(job.result_summary?.maximum_drawdown)}</strong><strong>{job.result_summary?.sharpe?.toFixed(2) ?? '—'}</strong>
          <span className="history-status"><i />{job.status === 'RUNNING' ? `${job.phase} ${job.progress}%` : STATUS_NAMES[job.status]}</span>
          <span className="history-row-actions"><button className="history-detail-button" onClick={() => void toggleDetail(job.job_id)}>{expanded === job.job_id ? '收起' : '详情'}</button><button className="history-delete-button" disabled={job.status === 'RUNNING'} onClick={() => void deleteJob(job)}>删除</button></span>
        </div>
        {job.status === 'RUNNING' && <div className="history-inline-progress"><i style={{ width: `${job.progress}%` }} /></div>}
        {expanded === job.job_id && <div className="history-detail-wrap">{detailLoading === job.job_id ? <div className="history-detail-loading">正在读取详细结果…</div> : details[job.job_id] && <><PerformanceOverview job={details[job.job_id]} /><FactorEvidence run={evidence[job.job_id]} /><StrategyHistoryDetail job={details[job.job_id]} /></>}<div className="history-detail-actions">{job.status === 'RUNNING' ? <button onClick={onOpenRunning}>返回运行控制台 →</button> : <a href={strategyApi.reportUrl(job.job_id)} target="_blank">打开原始 JSON 报告 →</a>}</div></div>}
      </div> })}
    </div>}
  </div>
}
