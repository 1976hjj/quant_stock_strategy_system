import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import FactorAssetLibrary from './FactorAssetLibrary'
import FactorLibrary from './FactorLibrary'
import RotationBacktest from './RotationBacktest'
import StrategyBacktest, { STRATEGY_JOB_EVENT, STRATEGY_JOB_STORAGE_KEY } from './StrategyBacktest'
import StrategyBacktestHistory from './StrategyBacktestHistory'
import { strategyApi } from './strategyApi'
import type { FactorCatalogItem, FactorJobStatus, FactorRelease, JobStatus, M4Options, PreflightResult, RunPayload, UiStageId } from './types'

const STAGES: Array<{
  id: UiStageId
  short: string
  title: string
  description: string
  output: string
  cost: '轻' | '中' | '重'
}> = [
  { id: 'm4_1', short: '4.1', title: '有没有用', description: '检查因子值和未来收益有没有稳定关系。', output: 'IC、分组收益、单调性', cost: '中' },
  { id: 'm4_2', short: '4.2', title: '清洗后还管用吗', description: '缩尾、标准化并剔除规模影响，再看信号。', output: '处理后因子版本', cost: '中' },
  { id: 'm4_3', short: '4.3', title: '是不是碰巧', description: '做稳健统计和多重检验，降低误报。', output: '显著性与稳定性证据', cost: '中' },
  { id: 'm4_4', short: '4.4', title: '换时间还管用吗', description: '按时间滚动训练、验证、测试，检查市场环境。', output: 'Walk-Forward 结果', cost: '重' },
  { id: 'm4_5', short: '4.5', title: '有没有重复', description: '找高度相似的因子，判断新因子的增量价值。', output: '聚类、去重与候选集', cost: '重' },
  { id: 'm4_6', short: '4.6', title: '真实能不能成交', description: '加入手续费、滑点、冲击和资金容量。策略成形后再跑也可以。', output: '净收益与容量证据', cost: '重' },
]

const PIPELINE_NAMES: Record<string, string> = {
  processed: '4.2 因子处理',
  basic_evidence: '4.1 基础证据',
  audit_basic_evidence: '4.1 结果审计',
  robustness: '4.3 稳健统计',
  audit_robustness: '4.3 结果审计',
  walk_forward: '4.4 时间滚动检验',
  redundancy: '4.5 去重与增量价值',
  audit_walk_forward: '4.4 结果审计',
  audit_redundancy: '4.5 结果审计',
  execution: '4.6 成交与容量',
  audit_execution: '4.6 结果审计',
  factor_explorer: '4.7 生成结果页',
  audit_factor_explorer: '4.7 页面审计',
}

const DEFAULT_STAGES: UiStageId[] = ['m4_1', 'm4_2', 'm4_3', 'm4_4', 'm4_5']
type View = 'CALCULATE' | 'ASSETS' | 'STRATEGY' | 'ROTATION' | 'STRATEGY_HISTORY'
const VIEW_STORAGE_KEY = 'alpha-research.current-view'
const FACTOR_JOB_STORAGE_KEY = 'alpha-research.factor-job-id'

function savedView(): View {
  const value = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return value === 'ASSETS' || value === 'STRATEGY' || value === 'ROTATION' || value === 'STRATEGY_HISTORY' ? value : 'CALCULATE'
}

function compactId(value: string) {
  return value.length > 24 ? `${value.slice(0, 13)}…${value.slice(-8)}` : value
}

function releaseFactorNames(release: FactorRelease) {
  const names = release.factors.map((factor) => factor.chinese_name || factor.factor_id)
  if (names.length === 1) return names[0]
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 个`
}

function money(value: number) {
  if (value >= 100_000_000) return `${value / 100_000_000} 亿`
  if (value >= 10_000) return `${value / 10_000} 万`
  return value.toLocaleString('zh-CN')
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}分${seconds}秒` : `${seconds}秒`
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export default function App() {
  const [view, setView] = useState<View>(savedView)
  const [strategyRunning, setStrategyRunning] = useState(false)
  const [options, setOptions] = useState<M4Options | null>(null)
  const [releaseId, setReleaseId] = useState('')
  const [stages, setStages] = useState<UiStageId[]>(DEFAULT_STAGES)
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [holding, setHolding] = useState(5)
  const [quantiles, setQuantiles] = useState(5)
  const [minimumPairs, setMinimumPairs] = useState(20)
  const [variants, setVariants] = useState(['WINSORIZED_ZSCORE', 'SIZE_NEUTRALIZED'])
  const [selectionPercent, setSelectionPercent] = useState(20)
  const [capitalText, setCapitalText] = useState('1000000, 10000000, 100000000')
  const [buyFee, setBuyFee] = useState(3)
  const [sellFee, setSellFee] = useState(3)
  const [stampDuty, setStampDuty] = useState(5)
  const [slippage, setSlippage] = useState(2)
  const [impact, setImpact] = useState(20)
  const [maxSlippage, setMaxSlippage] = useState(100)
  const [participation, setParticipation] = useState(10)
  const [advanced, setAdvanced] = useState(false)
  const [factorOpen, setFactorOpen] = useState(false)
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [lastJob, setLastJob] = useState<JobStatus | null>(null)
  const [apiOnline, setApiOnline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedFactor, setSelectedFactor] = useState<FactorCatalogItem | null>(null)
  const [factorJob, setFactorJob] = useState<FactorJobStatus | null>(null)
  const [factorSubmitting, setFactorSubmitting] = useState(false)
  const [factorError, setFactorError] = useState('')
  const [catalogRefresh, setCatalogRefresh] = useState(0)

  const release = options?.factor_releases.find((item) => item.release_id === releaseId)
  const executionSelected = stages.includes('m4_6')

  useEffect(() => { window.localStorage.setItem(VIEW_STORAGE_KEY, view) }, [view])

  useEffect(() => {
    Promise.all([api.health(), api.options(), api.latest()])
      .then(([, loadedOptions, latest]) => {
        setApiOnline(true)
        setOptions(loadedOptions)
        const first = loadedOptions.factor_releases[0]
        if (first) {
          setWindowStart(first.start)
          setWindowEnd(first.end)
        }
        if (latest.job?.status === 'RUNNING') setJob(latest.job)
        else setLastJob(latest.job)
      })
      .catch((reason) => setError(`后端没有连上：${reason.message}`))
  }, [])

  useEffect(() => {
    const refreshStrategyState = () => {
      const jobId = window.localStorage.getItem(STRATEGY_JOB_STORAGE_KEY)
      strategyApi.list()
        .then(({ jobs }) => setStrategyRunning(jobs.some((item) => item.status === 'RUNNING')))
        .catch(() => jobId
          ? strategyApi.status(jobId).then((item) => setStrategyRunning(item.status === 'RUNNING')).catch(() => setStrategyRunning(false))
          : setStrategyRunning(false))
    }
    const onJobChanged = (event: Event) => {
      const job = (event as CustomEvent<{ status?: string }>).detail
      setStrategyRunning(job?.status === 'RUNNING')
    }
    refreshStrategyState()
    window.addEventListener(STRATEGY_JOB_EVENT, onJobChanged)
    const timer = window.setInterval(refreshStrategyState, 3000)
    return () => { window.removeEventListener(STRATEGY_JOB_EVENT, onJobChanged); window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return
    const timer = window.setInterval(() => {
      api.status(job.job_id).then(async (next) => {
        setJob(next)
        if (next.status === 'PASS') {
          setCatalogRefresh((value) => value + 1)
          if (selectedFactor) {
            const refreshed = await api.factorCatalog({ page: 1, pageSize: 100, query: selectedFactor.factor_id })
            const current = refreshed.items.find((item) => item.factor_id === selectedFactor.factor_id)
            if (current) setSelectedFactor(current)
          }
        }
      }).catch((reason) => setError(reason.message))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [job?.job_id, job?.status, selectedFactor?.factor_id])

  useEffect(() => {
    const restoreFactorJob = async () => {
      const storedJobId = window.localStorage.getItem(FACTOR_JOB_STORAGE_KEY)
      let next: FactorJobStatus | null = null
      try {
        if (storedJobId) {
          next = await api.factorCalculationStatus(storedJobId)
        }
        if (!next || next.status !== 'RUNNING') {
          const latest = await api.latestFactorCalculation()
          if (latest.job?.status === 'RUNNING') next = latest.job
        }
      } catch {
        window.localStorage.removeItem(FACTOR_JOB_STORAGE_KEY)
        return
      }
      if (!next) return
      setFactorJob(next)
      setWindowStart(next.start)
      setWindowEnd(next.end)
      if (next.status === 'RUNNING') window.localStorage.setItem(FACTOR_JOB_STORAGE_KEY, next.job_id)
      const refreshed = await api.factorCatalog({ page: 1, pageSize: 100, query: next.factor_id })
      const current = refreshed.items.find((item) => item.factor_id === next?.factor_id)
      if (current) setSelectedFactor(current)
    }
    restoreFactorJob().catch((reason) => setFactorError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  useEffect(() => {
    const discoverRunningJob = () => {
      api.latestFactorCalculation().then(async ({ job: latest }) => {
        if (!latest || latest.status !== 'RUNNING' || latest.job_id === factorJob?.job_id) return
        setFactorJob(latest)
        setWindowStart(latest.start)
        setWindowEnd(latest.end)
        window.localStorage.setItem(FACTOR_JOB_STORAGE_KEY, latest.job_id)
        const refreshed = await api.factorCatalog({ page: 1, pageSize: 100, query: latest.factor_id })
        const current = refreshed.items.find((item) => item.factor_id === latest.factor_id)
        if (current) setSelectedFactor(current)
      }).catch(() => undefined)
    }
    discoverRunningJob()
    const timer = window.setInterval(discoverRunningJob, 3000)
    return () => window.clearInterval(timer)
  }, [factorJob?.job_id])

  useEffect(() => {
    if (!factorJob || (factorJob.status !== 'RUNNING' && factorJob.accuracy_status !== 'PENDING')) return
    const timer = window.setInterval(() => {
      api.factorCalculationStatus(factorJob.job_id).then(async (next) => {
        setFactorJob(next)
        if (next.status === 'PASS' && next.release_id) {
          const loadedOptions = await api.options()
          setOptions(loadedOptions)
          setReleaseId(next.release_id)
          setWindowStart(next.start)
          setWindowEnd(next.end)
          const refreshed = await api.factorCatalog({ page: 1, pageSize: 1, query: next.factor_id })
          if (refreshed.items[0]) setSelectedFactor(refreshed.items[0])
          setCatalogRefresh((value) => value + 1)
        }
      }).catch((reason) => setFactorError(reason.message))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [factorJob?.job_id, factorJob?.status, factorJob?.accuracy_status])

  const clearCurrentRunView = () => {
    if (job?.status === 'RUNNING') return false
    if (job) setLastJob(job)
    setJob(null)
    setPreflight(null)
    return true
  }

  const chooseFactor = (factor: FactorCatalogItem) => {
    if (!clearCurrentRunView()) return
    if (factorSubmitting || factorJob?.status === 'RUNNING') {
      if (factor.factor_id !== factorJob?.factor_id) {
        setFactorError('当前因子任务正在提交或计算，请等待完成或先停止任务。')
      }
      return
    }
    setSelectedFactor(factor)
    setFactorJob(null)
    window.localStorage.removeItem(FACTOR_JOB_STORAGE_KEY)
    setFactorError('')
    if (factor.latest_release_id) {
      selectRelease(factor.latest_release_id)
    } else {
      setReleaseId('')
      setWindowStart('2020-01-02')
      setWindowEnd('2025-12-31')
    }
    document.querySelector('.release-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const calculateSelectedFactor = async () => {
    if (!selectedFactor || selectedFactor.source_collection === 'CURRENT') return
    setFactorSubmitting(true)
    setError('')
    setFactorError('')
    try {
      const started = await api.startFactorCalculation({
        factor_id: selectedFactor.factor_id,
        factor_version: selectedFactor.factor_version,
        start: windowStart,
        end: windowEnd,
      })
      setFactorJob(started)
      window.localStorage.setItem(FACTOR_JOB_STORAGE_KEY, started.job_id)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setFactorError(message)
    } finally {
      setFactorSubmitting(false)
    }
  }

  const stopFactorCalculation = async () => {
    if (!factorJob || factorJob.status !== 'RUNNING') return
    try {
      setFactorJob(await api.stopFactorCalculation(factorJob.job_id))
    } catch (reason) {
      setFactorError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const changeFactorDate = (edge: 'start' | 'end', value: string) => {
    if (!clearCurrentRunView()) return
    if (edge === 'start') setWindowStart(value)
    else setWindowEnd(value)
    // Once the requested range changes, the previously published release must
    // not be used accidentally by M4. A successful calculation selects the new release.
    setReleaseId('')
    setFactorJob(null)
    setFactorError('')
  }

  const selectRelease = (id: string) => {
    if (!clearCurrentRunView()) return
    const next = options?.factor_releases.find((item) => item.release_id === id)
    setReleaseId(id)
    if (next) {
      setWindowStart(next.start)
      setWindowEnd(next.end)
    }
  }

  const toggleStage = (id: UiStageId) => {
    if (!clearCurrentRunView()) return
    setStages((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const payload = useMemo<RunPayload>(() => {
    const capital = capitalText.split(/[,，\s]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0)
    return {
      factor_release_id: releaseId,
      stages,
      window_start: windowStart,
      window_end: windowEnd,
      holding_sessions: holding,
      quantile_count: quantiles,
      minimum_pairs_per_session: minimumPairs,
      processed_variants: variants,
      selection_quantile: selectionPercent / 100,
      capital_scenarios_cny: [...new Set(capital)].sort((a, b) => a - b),
      buy_commission_bps: buyFee,
      sell_commission_bps: sellFee,
      sell_stamp_duty_bps: stampDuty,
      base_slippage_bps: slippage,
      square_root_impact_bps: impact,
      maximum_slippage_bps: maxSlippage,
      maximum_participation_rate: participation / 100,
    }
  }, [releaseId, stages, windowStart, windowEnd, holding, quantiles, minimumPairs, variants, selectionPercent, capitalText, buyFee, sellFee, stampDuty, slippage, impact, maxSlippage, participation])

  const doPreflight = useCallback(async () => {
    if (job?.status !== 'RUNNING' && job) {
      setLastJob(job)
      setJob(null)
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.preflight(payload)
      setPreflight(result)
      return result
    } catch (reason) {
      setPreflight(null)
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    } finally {
      setBusy(false)
    }
  }, [job, payload])

  const startRun = async () => {
    if (job?.status === 'RUNNING') return
    if (job) {
      setLastJob(job)
      setJob(null)
    }
    setBusy(true)
    setError('')
    try {
      const checked = await api.preflight(payload)
      setPreflight(checked)
      setJob(await api.start(payload))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const stopRun = async () => {
    if (!job) return
    setBusy(true)
    try { setJob(await api.stop(job.job_id)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  const configuredStages = job?.configured_stages.length ? job.configured_stages : preflight?.resolved_stages || []
  const completed = new Set(job?.completed_stages || [])
  const progress = configuredStages.length ? Math.round((completed.size / configuredStages.length) * 100) : 0

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M4</span><div><b>因子研究台</b><small>FACTOR EVIDENCE WORKBENCH</small></div></div>
        <nav className="main-nav"><button className={view === 'CALCULATE' ? 'active' : ''} onClick={() => setView('CALCULATE')}>因子计算</button><button className={view === 'ASSETS' ? 'active' : ''} onClick={() => setView('ASSETS')}>因子资产库</button><button className={view === 'STRATEGY' ? 'active' : ''} onClick={() => setView('STRATEGY')}>因子策略{strategyRunning && <i className="nav-running-dot" />}</button><button className={view === 'ROTATION' ? 'active' : ''} onClick={() => setView('ROTATION')}>轮动回测{strategyRunning && <i className="nav-running-dot" />}</button><button className={view === 'STRATEGY_HISTORY' ? 'active' : ''} onClick={() => setView('STRATEGY_HISTORY')}>历史回测结果</button></nav>
        <div className={`api-state ${apiOnline ? 'online' : ''}`}><i />{apiOnline ? '计算后端已连接' : '计算后端未连接'}</div>
      </header>

      {error && <div className="error-banner"><b>没有继续执行</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      {view === 'STRATEGY' ? <StrategyBacktest /> : view === 'ROTATION' ? <RotationBacktest onOpenFactorCalculate={() => setView('CALCULATE')} onOpenHistory={() => setView('STRATEGY_HISTORY')} /> : view === 'STRATEGY_HISTORY' ? <StrategyBacktestHistory onOpenRunning={(strategyType) => setView(strategyType === 'ROTATION' ? 'ROTATION' : 'STRATEGY')} /> : view === 'CALCULATE' ? <>
      <FactorLibrary selected={selectedFactor} onSelect={chooseFactor} refreshKey={catalogRefresh} />

      <div className="workspace">
        <div className="configuration">
          <section className="panel release-panel">
            <div className="section-head"><span>01</span><div><h2>选择本次运行因子</h2><p>从上面的目录选一个因子。未计算的先生成数值，完成后直接进入 M4；每个新因子都有自己的独立版本。</p></div></div>
            {!selectedFactor && <div className="run-target-empty">请先在上面的因子卡片中点击“选择并计算这个因子”。</div>}
            {selectedFactor && <div className="run-target">
              <div><span>{selectedFactor.source_collection === 'ALPHA158' ? 'ALPHA158' : selectedFactor.source_collection === 'JQDATA' ? 'JQDATA' : '现有因子'}</span><h3>{selectedFactor.chinese_name}</h3><code>{selectedFactor.external_name || selectedFactor.factor_id} · v{selectedFactor.factor_version}</code></div>
              <b className={selectedFactor.accuracy_status === 'FAIL' ? 'failed' : selectedFactor.calculated ? 'ready' : ''}>{selectedFactor.status_label}</b>
            </div>}
            {selectedFactor && selectedFactor.source_collection !== 'CURRENT' && <div className="factor-compute-box">
              {factorError && <div className="factor-compute-error"><b>未开始计算</b><span>{factorError}</span></div>}
              <p>{selectedFactor.calculated ? '这个因子已经有计算结果，日期仍可修改。重新计算完成后，新结果会成为当前使用版本。' : '这个因子目前只有公式，还没有因子值。先按你设定的日期范围单独计算并发布。'}</p>
              <div className="compute-dates"><Field label="计算开始"><input type="date" disabled={factorSubmitting || factorJob?.status === 'RUNNING'} value={windowStart} onChange={(event) => changeFactorDate('start', event.target.value)} /></Field><Field label="计算结束"><input type="date" disabled={factorSubmitting || factorJob?.status === 'RUNNING'} value={windowEnd} onChange={(event) => changeFactorDate('end', event.target.value)} /></Field></div>
              <button className="primary compute-button" disabled={factorSubmitting || factorJob?.status === 'RUNNING' || !windowStart || !windowEnd || windowEnd < windowStart} onClick={calculateSelectedFactor}>{factorSubmitting ? '正在提交任务…' : factorJob?.status === 'RUNNING' ? '因子正在计算中…' : selectedFactor.calculated ? '按此日期重新计算并替换当前版本' : '计算并发布这个因子'}</button>
              {factorSubmitting && !factorJob && <div className="compute-status running"><div><b>正在提交任务</b><strong>请稍候</strong></div><i><span className="indeterminate" /></i><small>正在连接计算后端，成功后会立即显示任务编号和进度。</small></div>}
              {factorJob && <div className={`compute-status ${factorJob.accuracy_status === 'FAIL' ? 'fail' : factorJob.status.toLowerCase()}`}>
                <div><b>{factorJob.status === 'RUNNING' || factorJob.accuracy_status === 'PENDING' || factorJob.accuracy_status === 'FAIL' ? factorJob.phase : factorJob.status === 'PASS' ? '计算完成' : factorJob.status === 'FAIL' ? '计算失败' : '已停止'}</b><strong>{factorJob.progress}%</strong></div>
                <i><span style={{ width: `${factorJob.progress}%` }} /></i>
                <p>{factorJob.message}</p>
                <footer><code>{factorJob.job_id}</code><span>已运行 {formatDuration(factorJob.elapsed_seconds)}</span>{factorJob.status === 'RUNNING' && <button onClick={stopFactorCalculation}>停止计算</button>}</footer>
              </div>}
            </div>}
            {release && <div className="release-summary">
              <div className="release-factor-name"><strong>{releaseFactorNames(release)}</strong><span>本次历史版本包含的因子</span></div><div><strong>{release.instrument_count.toLocaleString()}</strong><span>股票</span></div><div><strong>{release.session_count.toLocaleString()}</strong><span>交易日</span></div>
              <button onClick={() => setFactorOpen((value) => !value)}>{factorOpen ? '收起名单' : '查看因子名单'} <b>{factorOpen ? '−' : '+'}</b></button>
            </div>}
            {factorOpen && release && <div className="factor-list">{release.factors.map((item) => <span key={`${item.factor_id}-${item.factor_version}`}>{item.chinese_name || item.factor_id}<small>{item.factor_id} · v{item.factor_version}</small></span>)}</div>}
            <details className="history-release"><summary>历史批次复现入口</summary><select value={releaseId} onChange={(event) => { setSelectedFactor(null); selectRelease(event.target.value) }}><option value="">请选择历史版本</option>{options?.factor_releases.map((item) => <option key={item.release_id} value={item.release_id}>{releaseFactorNames(item)} · {item.start} → {item.end} · {compactId(item.release_id)}</option>)}</select></details>
          </section>

          <section className="panel">
            <div className="section-head"><span>02</span><div><h2>选择要跑的检验</h2><p>4.6 可以先不跑；若后续步骤依赖前置步骤，预检会明确列出来。</p></div></div>
            <div className="stage-grid">
              {STAGES.map((stage) => {
                const selected = stages.includes(stage.id)
                return <button key={stage.id} className={`stage-card ${selected ? 'selected' : ''} ${stage.id === 'm4_6' ? 'execution' : ''}`} onClick={() => toggleStage(stage.id)}>
                  <div className="stage-card-top"><span className="stage-number">M{stage.short}</span><span className={`cost cost-${stage.cost}`}>{stage.cost}计算</span><i>{selected ? '✓' : ''}</i></div>
                  <h3>{stage.title}</h3><p>{stage.description}</p><small>产出：{stage.output}</small>
                </button>
              })}
              <div className="stage-card selected locked"><div className="stage-card-top"><span className="stage-number">M4.7</span><span className="cost">界面</span><i>✓</i></div><h3>看结果、做决策</h3><p>展示任务进度，打开结构化报告与证据浏览器。</p><small>始终开启，不参与计算勾选</small></div>
            </div>
          </section>

          <section className="panel">
            <div className="section-head"><span>03</span><div><h2>设置检验口径</h2><p>这些值会写进证据身份，不同参数不会混成同一个结果。</p></div></div>
            <div className="param-grid">
              <Field label="持仓期"><div className="segmented">{[5, 10, 20, 30].map((value) => <button className={holding === value ? 'active' : ''} onClick={() => { setHolding(value); setPreflight(null) }} key={value}>{value} 日</button>)}</div></Field>
              <Field label="收益分组数" hint="例如 5 = 五分位"><input type="number" min="2" max="20" value={quantiles} onChange={(event) => setQuantiles(Number(event.target.value))} /></Field>
              <Field label="每日最少有效样本" hint="样本不足的日期不计入"><input type="number" min="3" value={minimumPairs} onChange={(event) => setMinimumPairs(Number(event.target.value))} /></Field>
              <Field label="4.6 选股比例" hint="按因子方向选头部/尾部"><div className="suffix-input"><input type="number" min="1" max="99" value={selectionPercent} onChange={(event) => setSelectionPercent(Number(event.target.value))} /><span>%</span></div></Field>
              <Field label="检验开始"><input type="date" min={release?.start} max={windowEnd || release?.end} value={windowStart} onChange={(event) => setWindowStart(event.target.value)} /></Field>
              <Field label="检验结束"><input type="date" min={windowStart || release?.start} max={release?.end} value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} /></Field>
            </div>
            <div className="variant-row"><span>4.2 处理版本</span>{['WINSORIZED_ZSCORE', 'SIZE_NEUTRALIZED'].map((variant) => <label key={variant}><input type="checkbox" checked={variants.includes(variant)} onChange={() => setVariants((current) => current.includes(variant) ? current.filter((item) => item !== variant) : [...current, variant])} /><i />{variant === 'WINSORIZED_ZSCORE' ? '缩尾标准化' : '规模中性化'}</label>)}</div>

            <button className={`advanced-toggle ${executionSelected ? '' : 'muted'}`} onClick={() => setAdvanced((value) => !value)}><span><b>4.6 成交模型参数</b><small>{executionSelected ? '已选择容量测试，可按需修改' : '当前未选择 4.6，这些参数不会参与运行'}</small></span><b>{advanced ? '−' : '+'}</b></button>
            {advanced && <div className="advanced-grid">
              <Field label="资金规模（元）" hint="用逗号分隔多个场景"><input value={capitalText} onChange={(event) => setCapitalText(event.target.value)} /></Field>
              <Field label="最大成交参与率"><div className="suffix-input"><input type="number" value={participation} onChange={(event) => setParticipation(Number(event.target.value))} /><span>%</span></div></Field>
              <Field label="买入佣金 (bps)"><input type="number" value={buyFee} onChange={(event) => setBuyFee(Number(event.target.value))} /></Field>
              <Field label="卖出佣金 (bps)"><input type="number" value={sellFee} onChange={(event) => setSellFee(Number(event.target.value))} /></Field>
              <Field label="卖出印花税 (bps)"><input type="number" value={stampDuty} onChange={(event) => setStampDuty(Number(event.target.value))} /></Field>
              <Field label="基础滑点 (bps)"><input type="number" value={slippage} onChange={(event) => setSlippage(Number(event.target.value))} /></Field>
              <Field label="冲击系数 (bps)"><input type="number" value={impact} onChange={(event) => setImpact(Number(event.target.value))} /></Field>
              <Field label="滑点上限 (bps)"><input type="number" value={maxSlippage} onChange={(event) => setMaxSlippage(Number(event.target.value))} /></Field>
            </div>}
            {executionSelected && <div className="capital-preview">将测试 {payload.capital_scenarios_cny.map(money).join(' / ')} 元资金规模。4.6 使用日线成交代理，结果是容量压力测试，不是逐笔撮合。</div>}
          </section>
        </div>

        <aside className="run-console">
          <div className="console-head"><span>LIVE RUN</span><h2>运行控制</h2><p>{job?.status === 'RUNNING' ? '本次任务正在运行' : preflight ? '本次任务已预检，等待启动' : '当前还没有启动本次运行'}</p></div>
          <div className="summary-row"><span>因子</span><b>{release?.factor_count ?? '—'} 个</b></div>
          <div className="summary-row"><span>持仓</span><b>{holding} 日</b></div>
          <div className="summary-row"><span>时间</span><b>{windowStart || '—'}<br />至 {windowEnd || '—'}</b></div>

          <div className="actions"><button className="secondary" disabled={busy || !releaseId || !stages.length} onClick={doPreflight}>一键预检</button><button className="primary" disabled={busy || !releaseId || !stages.length || job?.status === 'RUNNING'} onClick={startRun}>{job?.status === 'RUNNING' ? '正在运行' : '开始运行 M4'}</button></div>

          {!job && !preflight && <div className="console-idle"><b>本次尚未运行</b><span>左侧勾选的是这次将要执行的阶段；4.6 未勾选就不会运行。</span></div>}
          {preflight && <div className="preflight-ok"><i>✓</i><div><b>预检通过</b><span>将实际执行 {preflight.resolved_stages.length} 个计算/审计步骤</span></div></div>}

          {(preflight || job) && <div className="progress-block">
            <div className="progress-title"><span>流水线进度</span><b>{job?.status === 'PASS' ? '完成' : job?.status === 'FAIL' ? '失败' : job?.status === 'STOPPED' ? '已停止' : `${progress}%`}</b></div>
            <div className="progress-track"><i style={{ width: `${job?.status === 'PASS' ? 100 : progress}%` }} /></div>
            <div className="step-list">{configuredStages.map((stage) => <div key={stage} className={completed.has(stage) ? 'done' : job?.current_stage === stage ? 'running' : ''}><i>{completed.has(stage) ? '✓' : job?.current_stage === stage ? '↻' : ''}</i><span>{PIPELINE_NAMES[stage] || stage}</span></div>)}</div>
          </div>}

          {preflight?.warnings.map((warning) => <p className="warning" key={warning}>注意：{warning}</p>)}
          {job?.error && <div className="job-error"><b>{job.error.type}</b><span>{job.error.message}</span></div>}
          {job?.log_tail && <details className="log"><summary>查看运行日志</summary><pre>{job.log_tail}</pre></details>}

          {job && <div className="job-meta"><span>任务编号</span><code>{job.job_id}</code></div>}
          {job?.status === 'RUNNING' && <button className="stop" disabled={busy} onClick={stopRun}>停止当前任务</button>}
          {job && (job.report_available || job.explorer_available) && <div className="result-actions">{job.report_available && <a href={api.reportUrl(job.job_id)} target="_blank">打开运行报告 ↗</a>}{job.explorer_available && <a className="accent" href={api.explorerUrl(job.job_id)} target="_blank">打开 M4.7 证据页 ↗</a>}</div>}

          {!job && !preflight && lastJob && <details className="previous-run">
            <summary>查看上一次运行记录 <b>{lastJob.status === 'PASS' ? '已完成' : lastJob.status === 'FAIL' ? '失败' : lastJob.status === 'STOPPED' ? '已停止' : '运行中'}</b></summary>
            <div className="previous-run-body">
              <span>任务编号 <code>{lastJob.job_id}</code></span>
              <div className="step-list">{lastJob.completed_stages.map((stage) => <div className="done" key={stage}><i>✓</i><span>{PIPELINE_NAMES[stage] || stage}</span></div>)}</div>
              {lastJob.report_available && <a href={api.reportUrl(lastJob.job_id)} target="_blank">打开上次运行报告 ↗</a>}
              {lastJob.explorer_available && <a href={api.explorerUrl(lastJob.job_id)} target="_blank">打开上次 M4.7 证据页 ↗</a>}
            </div>
          </details>}
        </aside>
      </div>
      </> : <FactorAssetLibrary />}
    </main>
  )
}
