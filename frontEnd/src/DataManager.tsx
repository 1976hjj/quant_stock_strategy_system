import { useCallback, useEffect, useMemo, useState } from 'react'
import { dataApi } from './dataApi'
import type { DataInventory, DataJob, DataPlan, DataUpdateRequest } from './dataApi'

function dateLabel(value: string | null) { return value || '尚无记录' }
export default function DataManager() {
  const [inventory, setInventory] = useState<DataInventory | null>(null)
  const [sourceId] = useState<'tushare' | 'eastmoney'>('tushare')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(['bank_industry'])
  const [industryPlan, setIndustryPlan] = useState<DataPlan | null>(null)
  const [industryTarget, setIndustryTarget] = useState('')
  const [industryWorkers, setIndustryWorkers] = useState(2)
  const [industryFreeGb, setIndustryFreeGb] = useState(10)
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
      const source = data.sources?.find((item) => item.id === 'tushare')
      const defaults = source?.defaults || data.defaults
      setSelectedGroups(defaults.groups)
      setTarget(data.latest_complete_day)
      setIndustryTarget(data.latest_complete_day)
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
    source_id: sourceId, end: target, groups: selectedGroups, factor_ids: [], workers,
    min_free_gb: freeGb, sleep_ms: sleepMs, refresh_recent_periods: refreshPeriods,
  }), [sourceId, target, selectedGroups, workers, freeGb, sleepMs, refreshPeriods])
  const visibleGroups = inventory?.groups.filter((group) => (group.source_id || 'tushare') === sourceId) || []
  const freeBank = inventory?.groups.find((group) => group.id === 'bank_free')
  const tokenBlocked = plan && !(plan.can_start ?? (plan.token_available || !plan.stages.some(
    (stage) => stage.needs_update && !['benchmark', 'factors', 'bank_free'].includes(stage.id),
  )))
  const toggle = (id: string, values: string[], setter: (value: string[]) => void) => {
    setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id])
    setPlan(null)
  }
  const industryRequest: DataUpdateRequest = {
    source_id: 'industry', end: industryTarget, groups: selectedIndustries, factor_ids: [],
    workers: industryWorkers, min_free_gb: industryFreeGb, sleep_ms: 50, refresh_recent_periods: 4,
  }
  const prepareIndustry = async () => {
    setBusy(true); setError('')
    try { setIndustryPlan(await dataApi.plan(industryRequest)) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  const startIndustry = async () => {
    setBusy(true); setError('')
    try { setJob(await dataApi.start(industryRequest)); setIndustryPlan(null) }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
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
    <header className="data-heading"><div><span>DATA WORKBENCH</span><h1>数据管理与增量更新</h1><p>通用数据与行业数据分别更新。银行研究优先采用 Tushare，免费补充数据随行业同步。</p></div><div className="data-refresh"><button onClick={() => void refreshCoverage()} disabled={refreshing}>{refreshing ? '正在刷新…' : '刷新覆盖状态'}</button>{refreshedAt && <small>已刷新：{refreshedAt}</small>}</div></header>
    {error && <div className="data-alert error">{error}</div>}
    {!inventory ? <div className="data-alert">正在读取数据目录…</div> : <>
      {!!inventory.sources?.length && <section className="data-panel data-source-panel"><div className="data-section-title"><span>00</span><div><h2>数据来源</h2><p>通用数据使用 Tushare；行业数据按 Tushare 优先、免费补缺处理，并保留各来源版本。</p></div></div><div className="data-source-options">{inventory.sources.filter((source) => source.id === 'tushare').map((source) => <div key={source.id} className="data-source-option active"><strong>{source.name}</strong><em>需要 Token</em><span>{source.description}</span><small>{source.credential_status === 'configured' ? '已配置凭证 · 有效期及权限以更新结果为准' : source.credential_status === 'invalid' ? '凭证格式异常 · 请检查 Token 配置' : '未配置凭证 · 请配置 Token'}</small></div>)}</div></section>}
      <section className="data-panel"><div className="data-section-title"><span>01</span><div><h2>通用数据</h2><p>{sourceId === 'eastmoney' ? '当前免费源覆盖42家银行的财报指标。报告期与采集日期分别展示；最新版本归档到银行专用暂存库。' : '标记“策略必需”的项目默认勾选。取消后仍可更新其余数据，但不能认为目标日期已具备完整回测输入。'}</p></div></div>
        <div className={`data-group-grid ${sourceId === 'eastmoney' ? 'free-data-grid' : ''}`}>{visibleGroups.map((group) => <div className={`data-group ${selectedGroups.includes(group.id) ? 'selected' : ''}`} key={group.id}>
          <input id={`data-${group.id}`} type="checkbox" checked={selectedGroups.includes(group.id)} disabled={job?.status === 'RUNNING'} onChange={() => toggle(group.id, selectedGroups, setSelectedGroups)} />
          <div><label htmlFor={`data-${group.id}`} className="data-group-name"><b>{group.name}</b>{group.required_for_strategy && <em>策略必需</em>}{group.source_id === 'eastmoney' && <em>免费 · 无需 Token</em>}{!group.published && <em className="pending">{sourceId === 'eastmoney' ? '待采集' : '待发布'}</em>}</label><p>{group.description}</p><small>{sourceId === 'eastmoney' ? '财报期覆盖' : '归档覆盖'} {dateLabel(group.start)} → {dateLabel(group.end)}</small>{sourceId === 'eastmoney' && <div className="bank-data-summary"><b>{group.bank_count ?? 0}/{group.expected_banks ?? 42} 家银行 · {(group.history_rows ?? 0).toLocaleString()} 条财报记录</b><span>最新五项完整：{group.current_complete_banks ?? 0}/{group.expected_banks ?? 42} 家</span><span>最近采集：{group.last_collected_at ? new Date(group.last_collected_at).toLocaleString('zh-CN', { hour12: false }) : '尚未采集'}</span><span>{group.quality_label}</span><span>历史待复核 {group.quality_flag_rows ?? 0} 条，其中缺少公告日 {group.missing_notice_rows ?? 0} 条</span></div>}{!!group.datasets.length && <details className="data-datasets"><summary>查看 {group.datasets.length} 项数据日期</summary><div>{group.datasets.map((item) => <span key={item.id}><b>{({ npl_ratio: '不良贷款率', provision_coverage_ratio: '拨备覆盖率', cet1_ratio: '核心一级资本充足率', capital_adequacy_ratio: '资本充足率', net_interest_margin: '净息差' } as Record<string, string>)[item.id] || item.id}</b> {dateLabel(item.start)} → {dateLabel(item.end)} <i>{item.partitions.toLocaleString()} {sourceId === 'eastmoney' ? '条指标记录' : '分区'}</i></span>)}</div></details>}</div>
        </div>)}</div>
      <div className="data-update-settings"><div className="data-section-title"><div><h3>通用数据 · 更新参数</h3><p>{sourceId === 'eastmoney' ? '更新截至所选日期已公告的银行财报，并保留本次采集版本。每天可刷新；财报事实按公告和更正变化，并发最多2路。' : '仅更新上方勾选的通用数据。结束日期包含当天；尚未发布的交易数据会在预检或拉取阶段提示。数据更新期间暂停启动新回测。'}</p></div></div>
        <div className="data-settings"><label>{sourceId === 'eastmoney' ? '公告截止日期' : '更新至'}<input type="date" max={sourceId === 'eastmoney' ? inventory.today : inventory.latest_complete_day} value={target} disabled={job?.status === 'RUNNING'} onChange={(event) => { setTarget(event.target.value); setPlan(null) }} /></label><label>并发请求<input type="number" min="1" max={sourceId === 'eastmoney' ? '2' : '8'} value={workers} disabled={job?.status === 'RUNNING'} onChange={(event) => { setWorkers(Number(event.target.value)); setPlan(null) }} /></label><label>磁盘安全下限 GiB<input type="number" min="1" max="500" value={freeGb} disabled={job?.status === 'RUNNING'} onChange={(event) => { setFreeGb(Number(event.target.value)); setPlan(null) }} /></label>{sourceId === 'tushare' && <><label>请求间隔 ms<input type="number" min="0" max="5000" value={sleepMs} disabled={job?.status === 'RUNNING'} onChange={(event) => { setSleepMs(Number(event.target.value)); setPlan(null) }} /></label><label>刷新最近财报期<input type="number" min="0" max="4" value={refreshPeriods} disabled={job?.status === 'RUNNING'} onChange={(event) => { setRefreshPeriods(Number(event.target.value)); setPlan(null) }} /></label></>}</div>
        <div className="data-actions"><button onClick={() => void prepare()} disabled={busy || job?.status === 'RUNNING' || !selectedGroups.length}>检查通用更新计划</button><button className="primary" onClick={() => void start()} disabled={busy || job?.status === 'RUNNING' || !plan || !!tokenBlocked}>开始通用增量更新</button></div>
        {plan && <div className="data-plan"><b>目标 {plan.target_end} · {plan.stages.filter((stage) => stage.needs_update).length} 个阶段需要更新</b>{tokenBlocked && <p>所选 Tushare 数据需要有效 Token；当前未配置或格式异常，请检查 Token 配置。</p>}{sourceId === 'eastmoney' && <p>免费公开接口 · 本次更新无需 Tushare Token · 历史版本保留在银行暂存库</p>}{!!plan.required_unselected.length && <p>未选策略必需数据：{plan.required_unselected.join('、')}。完成后也不代表策略输入已齐全。</p>}<div>{plan.stages.map((stage) => <span key={stage.id}>{stage.name}：{stage.needs_update ? (sourceId === 'eastmoney' ? '采集最新快照与历史报告' : `${stage.current_end || '无记录'} → ${plan.target_end}`) : (sourceId === 'eastmoney' ? '今日已采集' : '已覆盖')}</span>)}</div></div>}
      </div>
      </section>
      <section className="data-panel"><div className="data-section-title"><span>02</span><div><h2>行业数据</h2><p>独立选择和增量同步，不与通用数据合并。Tushare 优先，免费来源和研报仅补同口径缺项；原始版本保留供核验。因子请在“因子计算”中计算。</p></div></div>
        <div className="data-group-grid free-data-grid">{inventory.industries?.map((group) => <div key={group.id} className={`data-group ${selectedIndustries.includes(group.id) ? 'selected' : ''}`}>
          <input id={`industry-${group.id}`} type="checkbox" checked={selectedIndustries.includes(group.id)} disabled={job?.status === 'RUNNING'} onChange={() => { setSelectedIndustries(selectedIndustries.includes(group.id) ? selectedIndustries.filter((id) => id !== group.id) : [...selectedIndustries, group.id]); setIndustryPlan(null) }} />
          <div><label htmlFor={`industry-${group.id}`} className="data-group-name"><b>{group.name}</b><em>Tushare 主源 · 免费补缺</em></label><p>{group.description}</p><small>{group.bank_count}/{group.expected_banks} 家银行 · 同步核验截至 {dateLabel(group.end)}</small><div className="bank-data-summary">{group.datasets.map((item) => <span key={item.id}>{({ market: '行情与估值', financial: '基本面与财务', corporate: '分红与送转' } as Record<string,string>)[item.id]}：{dateLabel(item.start)} → {dateLabel(item.end)} · {item.partitions.toLocaleString()} 条</span>)}</div>{group.audit && <small>核验：采用指标来源完整 · {group.audit.implemented_unique_events} 个去重后的分红实施事件 · {group.audit.bps_source_differences_over_001} 个每股净资产跨源差异标记待核；历史首次披露版本尚未认证。</small>}<small>最近采集：{group.last_collected_at ? new Date(group.last_collected_at).toLocaleString('zh-CN', {hour12:false}) : '尚未采集'}；历史首次披露版本仍需核验。</small></div>
        </div>)}</div>
        {freeBank && <div className="bank-data-summary"><b>免费补充：资产质量、资本与净息差</b><span>{freeBank.bank_count ?? 0}/{freeBank.expected_banks ?? 42} 家银行 · {(freeBank.history_rows ?? 0).toLocaleString()} 条财报记录 · 财报期 {dateLabel(freeBank.start)} → {dateLabel(freeBank.end)}</span><span>最近采集：{freeBank.last_collected_at ? new Date(freeBank.last_collected_at).toLocaleString('zh-CN', {hour12:false}) : '尚未采集'} · {freeBank.quality_label}</span></div>}
        <div className="data-update-settings"><div className="data-section-title"><div><h3>行业数据 · 同步参数</h3><p>仅同步上方勾选的行业，参数独立于通用数据。银行接口最多并发 2 路，免费补充数据随行业统一更新。</p></div></div>
        <div className="data-settings"><label>行业更新至<input type="date" max={inventory.latest_complete_day} value={industryTarget} disabled={job?.status === 'RUNNING'} onChange={(event) => { setIndustryTarget(event.target.value); setIndustryPlan(null) }} /></label><label>行业并发请求<input type="number" min="1" max="2" value={industryWorkers} disabled={job?.status === 'RUNNING'} onChange={(event) => { setIndustryWorkers(Number(event.target.value)); setIndustryPlan(null) }} /></label><label>磁盘安全下限 GiB<input type="number" min="1" max="500" value={industryFreeGb} disabled={job?.status === 'RUNNING'} onChange={(event) => { setIndustryFreeGb(Number(event.target.value)); setIndustryPlan(null) }} /></label></div>
        <div className="data-actions"><button onClick={() => void prepareIndustry()} disabled={busy || job?.status === 'RUNNING' || !selectedIndustries.length || !industryTarget}>检查行业更新计划</button><button className="primary" onClick={() => void startIndustry()} disabled={busy || job?.status === 'RUNNING' || !industryPlan?.can_start}>开始行业增量同步</button></div>
        {industryPlan && <div className="data-plan"><b>行业数据 · 截至 {industryPlan.target_end}</b>{!industryPlan.can_start && <p>需要配置有效的 Tushare Token。</p>}{industryPlan.stages.map((stage) => <p key={stage.id}>{stage.name}：{stage.needs_update ? '增量更新行情，复查近期财报及分红，保留旧版本' : '已完成本日采集和目标日期核验'}</p>)}</div>}
        </div>
      </section>
      {job && <section className="data-panel data-job"><div className="data-section-title"><span>03</span><div><h2>最近一次更新</h2><p>{job.request.source_id === 'industry' ? '银行行业专项 · Token优先' : job.request.source_id === 'eastmoney' ? '东方财富 · 免费公开数据' : '通用数据更新'} · 任务 {job.job_id}</p></div></div><div className="data-job-status"><b className={job.status.toLowerCase()}>{job.status === 'RUNNING' ? '运行中' : job.status === 'PASS' ? '已完成' : '失败'}</b><span>{job.phase} · {job.completed_groups ?? 0}/{job.total_groups ?? '—'} 组</span><strong>{job.progress}%</strong></div><div className="data-progress"><i style={{ width: `${job.progress}%` }} /></div>{job.error && <p className="data-alert error">{job.error}</p>}<details><summary>查看运行日志</summary><pre>{job.log_tail || '暂无日志'}</pre></details></section>}
    </>}
  </main>
}
