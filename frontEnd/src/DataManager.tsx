import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataApi } from './dataApi'
import type { DataInventory, DataJob, DataPlan, DataUpdateRequest } from './dataApi'

function dateLabel(value: string | null) { return value || '尚无记录' }

export default function DataManager() {
  const [inventory, setInventory] = useState<DataInventory | null>(null)
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedFactors, setSelectedFactors] = useState<string[]>([])
  const [factorSource, setFactorSource] = useState<'ALL' | 'CURRENT' | 'ALPHA158' | 'JQDATA'>('ALL')
  const [target, setTarget] = useState('')
  const [workers, setWorkers] = useState(2)
  const [freeGb, setFreeGb] = useState(10)
  const [sleepMs, setSleepMs] = useState(50)
  const [refreshPeriods, setRefreshPeriods] = useState(4)
  const [plan, setPlan] = useState<DataPlan | null>(null)
  const [job, setJob] = useState<DataJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async (initial = false) => {
    const [data, latest] = await Promise.all([dataApi.inventory(), dataApi.latest()])
    setInventory(data)
    setJob(latest.job)
    if (initial) {
      setSelectedGroups(data.defaults.groups)
      setSelectedFactors(data.defaults.factor_ids.filter((factor) => data.factors.some((item) => item.id === factor)))
      setTarget(data.latest_complete_day)
    }
  }, [])

  useEffect(() => { void refresh(true).catch((reason) => setError(String(reason))) }, [refresh])
  useEffect(() => {
    if (job?.status !== 'RUNNING') return
    const timer = window.setInterval(() => {
      void dataApi.status(job.job_id).then((next) => {
        setJob(next)
        if (next.status === 'PASS') void refresh()
      }).catch((reason) => setError(String(reason)))
    }, 2500)
    return () => window.clearInterval(timer)
  }, [job?.job_id, job?.status, refresh])

  const refreshCoverage = async () => {
    setRefreshing(true)
    setError('')
    try {
      await refresh()
      setRefreshedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const request = useMemo<DataUpdateRequest>(() => ({
    end: target, groups: selectedGroups, factor_ids: selectedFactors, workers,
    min_free_gb: freeGb, sleep_ms: sleepMs, refresh_recent_periods: refreshPeriods,
  }), [target, selectedGroups, selectedFactors, workers, freeGb, sleepMs, refreshPeriods])
  const toggle = (id: string, values: string[], setter: (value: string[]) => void) => {
    setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id])
    setPlan(null)
  }
  const factorCounts = useMemo(() => ({
    total: inventory?.factors.length ?? 0,
    current: inventory?.factors.filter((item) => item.source === 'CURRENT').length ?? 0,
    alpha158: inventory?.factors.filter((item) => item.source === 'ALPHA158').length ?? 0,
    jqdata: inventory?.factors.filter((item) => item.source === 'JQDATA').length ?? 0,
  }), [inventory])
  const visibleFactors = useMemo(
    () => inventory?.factors.filter((item) => factorSource === 'ALL' || item.source === factorSource) ?? [],
    [inventory, factorSource],
  )
  const prepare = async () => {
    setBusy(true); setError('')
    try { setPlan(await dataApi.plan(request)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  const start = async () => {
    setBusy(true); setError('')
    try { setJob(await dataApi.start(request)); setPlan(null) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <main className="data-manager">
    <header className="data-heading"><div><span>DATA WORKBENCH</span><h1>数据管理与增量更新</h1><p>查看本地覆盖区间，按缺失日期续拉原始数据，再发布到回测仓库。因子计算安排在源数据更新之后。</p></div><div className="data-refresh"><button onClick={() => void refreshCoverage()} disabled={refreshing}>{refreshing ? '正在刷新…' : '刷新覆盖状态'}</button>{refreshedAt && <small>已刷新：{refreshedAt}</small>}</div></header>
    {error && <div className="data-alert error">{error}</div>}
    {!inventory ? <div className="data-alert">正在读取数据目录…</div> : <>
      <section className="data-panel"><div className="data-section-title"><span>01</span><div><h2>选择数据</h2><p>标记“策略必需”的项目默认勾选。取消后仍可更新其余数据，但不能认为目标日期已具备完整回测输入。</p></div></div>
        <div className="data-group-grid">{inventory.groups.map((group) => <div className={`data-group ${selectedGroups.includes(group.id) ? 'selected' : ''}`} key={group.id}>
          <input id={`data-${group.id}`} type="checkbox" checked={selectedGroups.includes(group.id)} disabled={job?.status === 'RUNNING'} onChange={() => toggle(group.id, selectedGroups, setSelectedGroups)} />
          <div><label htmlFor={`data-${group.id}`} className="data-group-name"><b>{group.name}</b>{group.required_for_strategy && <em>策略必需</em>}{!group.published && <em className="pending">待发布</em>}</label><p>{group.description}</p><small>归档覆盖 {dateLabel(group.start)} → {dateLabel(group.end)}</small>{!!group.datasets.length && <details className="data-datasets"><summary>查看 {group.datasets.length} 项数据日期</summary><div>{group.datasets.map((item) => <span key={item.id}><b>{item.id}</b> {dateLabel(item.start)} → {dateLabel(item.end)} <i>{item.partitions.toLocaleString()} 分区</i></span>)}</div></details>}</div>
        </div>)}</div>
      </section>
      {selectedGroups.includes('factors') && <section className="data-panel"><div className="data-section-title"><span>02</span><div><h2>选择要更新的因子</h2><p>默认选中当前小市值策略使用的两个因子。这里列出支持增量拉取的 JQData 因子；自定义因子和 Alpha158 请在“因子计算”页重算。</p></div></div>
        <div className="data-factor-tabs">
          <button className={factorSource === 'ALL' ? 'active' : ''} onClick={() => setFactorSource('ALL')}>全部 <span>{factorCounts.total}</span></button>
          <button className={factorSource === 'CURRENT' ? 'active' : ''} onClick={() => setFactorSource('CURRENT')}>自定义因子 <span>{factorCounts.current}</span></button>
          <button className={factorSource === 'ALPHA158' ? 'active' : ''} onClick={() => setFactorSource('ALPHA158')}>Alpha158 <span>{factorCounts.alpha158}</span></button>
          <button className={factorSource === 'JQDATA' ? 'active' : ''} onClick={() => setFactorSource('JQDATA')}>JQDATA <span>{factorCounts.jqdata}</span></button>
          <small>当前显示 {visibleFactors.length} 个 · 已选择 {selectedFactors.length} 个</small>
        </div>
        <div className="data-factor-list">{visibleFactors.map((factor) => <label key={factor.id}><input type="checkbox" checked={selectedFactors.includes(factor.id)} disabled={job?.status === 'RUNNING'} onChange={() => toggle(factor.id, selectedFactors, setSelectedFactors)} /><b>{factor.name}</b><code>{factor.id}</code><small>{dateLabel(factor.start)} → {dateLabel(factor.end)}</small></label>)}</div>
      </section>}
      <section className="data-panel"><div className="data-section-title"><span>03</span><div><h2>目标日期与运行参数</h2><p>结束日期包含当天；尚未发布的交易数据会在预检或拉取阶段明确提示。数据更新期间暂停启动新回测。</p></div></div>
        <div className="data-settings"><label>更新至<input type="date" max={inventory.latest_complete_day} value={target} disabled={job?.status === 'RUNNING'} onChange={(event) => { setTarget(event.target.value); setPlan(null) }} /></label><label>并发请求<input type="number" min="1" max="8" value={workers} disabled={job?.status === 'RUNNING'} onChange={(event) => setWorkers(Number(event.target.value))} /></label><label>磁盘安全下限 GiB<input type="number" min="1" max="500" value={freeGb} disabled={job?.status === 'RUNNING'} onChange={(event) => setFreeGb(Number(event.target.value))} /></label><label>请求间隔 ms<input type="number" min="0" max="5000" value={sleepMs} disabled={job?.status === 'RUNNING'} onChange={(event) => setSleepMs(Number(event.target.value))} /></label><label>刷新最近财报期<input type="number" min="0" max="4" value={refreshPeriods} disabled={job?.status === 'RUNNING'} onChange={(event) => setRefreshPeriods(Number(event.target.value))} /></label></div>
        <div className="data-actions"><button onClick={() => void prepare()} disabled={busy || job?.status === 'RUNNING'}>检查更新计划</button><button className="primary" onClick={() => void start()} disabled={busy || job?.status === 'RUNNING' || !plan || !plan.token_available && plan.stages.some((stage) => stage.needs_update && !['benchmark', 'factors'].includes(stage.id))}>开始增量更新</button></div>
        {plan && <div className="data-plan"><b>目标 {plan.target_end} · {plan.stages.filter((stage) => stage.needs_update).length} 个阶段需要更新</b>{!plan.token_available && <p>后端未配置 TUSHARE_TOKEN；原始数据拉取无法启动。</p>}{!!plan.required_unselected.length && <p>未选策略必需数据：{plan.required_unselected.join('、')}。完成后也不代表策略输入已齐全。</p>}<div>{plan.stages.map((stage) => <span key={stage.id}>{stage.name}：{stage.needs_update ? `${stage.current_end || '无记录'} → ${plan.target_end}` : '已覆盖'}</span>)}</div></div>}
      </section>
      {job && <section className="data-panel data-job"><div className="data-section-title"><span>04</span><div><h2>最近一次更新</h2><p>任务 {job.job_id}</p></div></div><div className="data-job-status"><b className={job.status.toLowerCase()}>{job.status === 'RUNNING' ? '运行中' : job.status === 'PASS' ? '已完成' : '失败'}</b><span>{job.phase} · {job.completed_groups ?? 0}/{job.total_groups ?? '—'} 组</span><strong>{job.progress}%</strong></div><div className="data-progress"><i style={{ width: `${job.progress}%` }} /></div>{job.error && <p className="data-alert error">{job.error}</p>}<details><summary>查看运行日志</summary><pre>{job.log_tail || '暂无日志'}</pre></details></section>}
    </>}
  </main>
}
