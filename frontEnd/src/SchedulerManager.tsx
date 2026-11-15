import { useEffect, useRef, useState } from 'react'
import { DATA_API_ROOT } from './dataApi'
import { DEFAULT_RATIO } from './RatioRotationControls'
import type { RatioParameters } from './RatioRotationControls'
import './scheduler.css'

type Options = { workers: number; sleep_ms: number; min_free_gb: number; bank_update_mode: 'AUTO' | 'FULL';
  capital_cny: number; start: string; minimum_entry_score: number | null; wait_for_data: boolean; ratio_parameters: RatioParameters | null }
type Settings = { enabled: boolean; time: string; frequency: 'TRADING_DAY_NEXT' | 'DAILY'; options: Options }
type Run = { id: string; schedule_id: string; status: string; message: string; created_at: string;
  started_at?: string; finished_at?: string; job_id?: string; target_end: string; manual: boolean; request?: { as_of?: string; end?: string; [key: string]: unknown } }
type Row = Settings & { id: string; name: string; next_run: string | null; last_run: Run | null; calendar_error?: string | null }
type Listing = { items: Row[]; engine_running: boolean; timezone: string }
type History = { items: Run[]; page: number; total_pages: number; total_items: number }
const labels: Record<string, string> = { QUEUED: '排队中', WAITING: '等待中', DISPATCHING: '提交中', RUNNING: '运行中',
  PASS: '成功', FAIL: '失败', BLOCKED: '前置未完成', UNKNOWN: '需核对', STOPPED: '已停止', CANCELLED: '已取消', EXPIRED: '已过期' }
const active = ['QUEUED', 'WAITING', 'DISPATCHING', 'RUNNING']
const settings = (r: Settings): Settings => ({ enabled: r.enabled, time: r.time, frequency: r.frequency, options: r.options })
const stamp = (s?: string | null) => s ? new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'
async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(DATA_API_ROOT + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const v = await r.json()
  if (!r.ok) throw new Error(v.detail || v.error || `请求失败（${r.status}）`)
  return v
}

export default function SchedulerManager() {
  const [data, setData] = useState<Listing | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Settings>>({})
  const prior = useRef<Record<string, Settings>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<History | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [page, setPage] = useState(1)
  const refresh = async () => {
    const value = await call<Listing>('/scheduler')
    const oldBase = prior.current
    setDrafts(previous => Object.fromEntries(value.items.map(row => [row.id,
      !previous[row.id] || JSON.stringify(previous[row.id]) === JSON.stringify(oldBase[row.id])
        ? settings(row) : previous[row.id]])))
    prior.current = Object.fromEntries(value.items.map(row => [row.id, settings(row)]))
    setData(value)
  }
  useEffect(() => {
    let disposed = false
    const poll = () => { if (!disposed) void refresh().catch(e => { if (!disposed) setError(String(e)) }) }
    poll(); const timer = window.setInterval(poll, 10000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!historyOpen) return
    let disposed = false
    void call<History>(`/scheduler/history?page=${page}&page_size=10`).then(v => { if (!disposed) setHistory(v) }).catch(e => setError(String(e)))
    return () => { disposed = true }
  }, [page, historyOpen, data])
  const change = (id: string, patch: Partial<Settings>) => setDrafts(v => ({ ...v, [id]: { ...v[id], ...patch } }))
  const option = (id: string, patch: Partial<Options>) => setDrafts(v => ({ ...v, [id]: { ...v[id], options: { ...v[id].options, ...patch } } }))
  const save = async (id: string) => {
    setBusy(true); setError('')
    try {
      await call(`/scheduler/${id}/save`, settings(drafts[id]))
      prior.current[id] = settings(drafts[id]); await refresh(); setEditing(null)
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const run = async (id: string) => {
    setBusy(true); setError('')
    try { await call(`/scheduler/${id}/run`, {}); await refresh() }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const cancel = async (id: string) => {
    setBusy(true); setError('')
    try { await call(`/scheduler/${id}/cancel`, {}); await refresh() }
    catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const row = data?.items.find(r => r.id === editing)
  const draft = editing ? drafts[editing] : null
  const ratio = draft?.options.ratio_parameters || DEFAULT_RATIO
  const ratioChange = (patch: Partial<RatioParameters>) => editing && option(editing, { ratio_parameters: { ...ratio, ...patch } })
  return <main className="scheduler-page">
    <header><div><span>DAILY TASKS</span><h1>调度管理</h1><p>北京时间执行。每行独立保存，修改启停、时间或参数后点击“保存”。</p></div>
      <button disabled={busy} onClick={() => void refresh().then(() => setError('')).catch(e => setError(String(e)))}>刷新状态</button></header>
    {error && <p role="alert" className="scheduler-error">{error}</p>}
    <p className="scheduler-note">{data?.engine_running ? '● 调度器运行中' : '调度器尚未连接或未启动'} · 网页可关闭，本机与数据后台须保持运行。交易日T+1指下一个自然日：前一天开市才运行，周五数据周六处理，节假日按交易日历跳过。</p>
    <section className="scheduler-card"><div className="scheduler-scroll"><table><thead><tr><th>启用</th><th>调度任务</th><th>频率</th><th>执行时间</th><th>下次执行</th><th>最近运行</th><th>操作</th></tr></thead>
      <tbody>{data?.items.map(r => {
        const d = drafts[r.id] || settings(r)
        const dirty = JSON.stringify(settings(r)) !== JSON.stringify(d)
        return <tr key={r.id}><td><input type="checkbox" aria-label={`${r.name}启用`} checked={d.enabled} onChange={e => change(r.id, { enabled: e.target.checked })} /></td>
          <td><b>{r.name}</b>{dirty && <small className="scheduler-dirty">有修改待保存</small>}</td>
          <td><select aria-label={`${r.name}频率`} value={d.frequency} onChange={e => change(r.id, { frequency: e.target.value as Settings['frequency'] })}><option value="TRADING_DAY_NEXT">交易日T+1（次日）</option><option value="DAILY">每天</option></select></td>
          <td><input type="time" aria-label={`${r.name}时间`} value={d.time} onChange={e => change(r.id, { time: e.target.value })} /></td>
          <td>{r.enabled ? r.calendar_error && !r.next_run ? '日历待更新' : stamp(r.next_run) : '未启用'}{r.calendar_error && <small>{r.calendar_error}</small>}</td>
          <td><strong className={`scheduler-status ${r.last_run?.status || ''}`}>{r.last_run ? labels[r.last_run.status] || r.last_run.status : '尚未运行'}</strong><small>{r.last_run && stamp(r.last_run.created_at)}</small><small title={r.last_run?.message}>{r.last_run?.message}</small></td>
          <td><div className="scheduler-actions"><button disabled={busy} onClick={() => setEditing(r.id)}>参数</button><button disabled={busy || !dirty} onClick={() => void save(r.id)}>保存</button><button disabled={busy || dirty || !!r.last_run && active.includes(r.last_run.status)} onClick={() => void run(r.id)}>立即运行</button>{r.last_run && ['QUEUED', 'WAITING'].includes(r.last_run.status) && <button disabled={busy} onClick={() => void cancel(r.id)}>取消排队</button>}</div></td></tr>
      })}</tbody></table>{!data && <p>正在读取调度配置…</p>}</div></section>
    <p className="scheduler-note">任务串行执行，已有任务时先等待；关闭调度不终止已启动的原任务。日历不完整时暂停并自动获取，不按星期猜测。立即运行不受频率限制，按最新完整数据日处理。</p>
    {row && draft && <section className="scheduler-card scheduler-editor" aria-label="调度参数">
      <div className="scheduler-editor-heading"><h2>{row.name} · 参数</h2><button onClick={() => setEditing(null)}>收起</button></div>
      <div className="scheduler-fields">{['general', 'bank'].includes(row.id) ? <>
        <label>请求并发<input aria-label="调度请求并发" type="number" min="1" max="2" value={draft.options.workers} onChange={e => option(row.id, { workers: Number(e.target.value) })} /></label>
        <label>请求间隔（毫秒）<input type="number" min="0" max="5000" value={draft.options.sleep_ms} onChange={e => option(row.id, { sleep_ms: Number(e.target.value) })} /></label>
        <label>磁盘下限（GiB）<input type="number" min="1" max="500" value={draft.options.min_free_gb} onChange={e => option(row.id, { min_free_gb: Number(e.target.value) })} /></label>
        {row.id === 'bank' && <label>更新方式<select value={draft.options.bank_update_mode} onChange={e => option(row.id, { bank_update_mode: e.target.value as Options['bank_update_mode'] })}><option value="AUTO">日常增量</option><option value="FULL">完整检查</option></select></label>}
      </> : <>
        <label>回测开始日<input aria-label="调度回测开始日" type="date" value={draft.options.start} onChange={e => option(row.id, { start: e.target.value })} /></label>
        <label>初始资金（元）<input type="number" min="1" value={draft.options.capital_cny} onChange={e => option(row.id, { capital_cny: Number(e.target.value) })} /></label>
        {row.id === 'factor' && <label>入选最低评分（留空不设）<input aria-label="调度入选评分" type="number" min="0" max="100" value={draft.options.minimum_entry_score ?? ''} onChange={e => option(row.id, { minimum_entry_score: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
        {row.id === 'ratio' && <>
          <label>数据口径<select aria-label="调度轮动口径" value={ratio.data_mode} onChange={e => ratioChange({ data_mode: e.target.value as RatioParameters['data_mode'] })}><option value="INDEX_PROXY">指数代理 · 2016起</option><option value="ETF">实际ETF 159915／563020 · 2024起</option><option value="ETF_STOCK">ETF＋单股 159915／512890 · 2019起</option></select></label>
          <label>均线天数<input type="number" min="2" max="250" value={ratio.ma_sessions} onChange={e => ratioChange({ ma_sessions: Number(e.target.value) })} /></label>
          <label>缓冲带（%）<input type="number" min="0" max="20" step="0.1" value={Number((ratio.buffer_fraction * 100).toFixed(6))} onChange={e => ratioChange({ buffer_fraction: Number(e.target.value) / 100 })} /></label>
          {ratio.data_mode === 'ETF_STOCK' && <label>单股比例（%）<input type="number" min="0" max="100" value={ratio.stock_weight * 100} onChange={e => ratioChange({ stock_weight: Number(e.target.value) / 100 })} /></label>}
          {ratio.data_mode !== 'INDEX_PROXY' && <>
            <label>执行口径<select value={ratio.execution_model || 'LEGACY_NEXT_SESSION'} onChange={e => ratioChange({ execution_model: e.target.value as RatioParameters['execution_model'] })}><option value="SAME_CLOSE_FIXED">当日收盘近似 · 固定元价差</option><option value="LEGACY_NEXT_SESSION">历史次日开盘口径</option></select></label>
            <label>ETF价差（元／份）<input type="number" min="0" step="0.001" value={ratio.etf_slippage_cny ?? .002} onChange={e => ratioChange({ etf_slippage_cny: Number(e.target.value) })} /></label>
            {ratio.data_mode === 'ETF_STOCK' && <label>股票价差（元／股）<input type="number" min="0" step="0.01" value={ratio.stock_slippage_cny ?? .02} onChange={e => ratioChange({ stock_slippage_cny: Number(e.target.value) })} /></label>}
          </>}
        </>}
      </>}</div>
      {['factor', 'ratio'].includes(row.id) && <label className="scheduler-check"><input type="checkbox" checked={draft.options.wait_for_data} onChange={e => option(row.id, { wait_for_data: e.target.checked })} />等待当天已启用的数据调度成功后运行</label>}
      <p>{row.id === 'general' ? '更新全部通用数据，明确排除财务披露，不计算因子。' : row.id === 'bank' ? '沿用银行行业同步：日常增量按现有规则复用近期财务，完整检查包含财务与免费补充。' : '默认带入最近成功回测设置；这里的设置独立保存，不读取优质策略页面未提交的草稿。每次复算至最新已完成交易日，不自动下单。'}</p>
      {row.id === 'ratio' && <p className="scheduler-note">ETF＋单股使用独立数据版本，通用更新不会自动推进它；超出覆盖会报错。当日收盘价差口径是尾盘近似模拟，最终收盘信号在交易前未知。</p>}
      <button className="primary" disabled={busy} onClick={() => void save(row.id)}>保存此调度</button>
    </section>}
    <details className="scheduler-card scheduler-history" open={historyOpen} onToggle={e => setHistoryOpen(e.currentTarget.open)}><summary>运行记录</summary>
      {history && <><div className="scheduler-scroll"><table><thead><tr><th>创建时间</th><th>调度</th><th>状态</th><th>数据目标日</th><th>说明／原任务</th></tr></thead><tbody>{history.items.map(r => <tr key={r.id}><td>{stamp(r.created_at)}<small>{r.manual ? '手动触发' : '定时触发'}</small></td><td>{data?.items.find(s => s.id === r.schedule_id)?.name || r.schedule_id}</td><td>{labels[r.status] || r.status}</td><td>{r.request?.as_of || r.request?.end || r.target_end}</td><td>{r.message}<small>{r.job_id}</small>{r.request != null && <details><summary>本次参数</summary><pre>{JSON.stringify(r.request, null, 2)}</pre></details>}</td></tr>)}</tbody></table></div>
        <div className="scheduler-pagination"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>第{page}页 · 共{history.total_items}条</span><button disabled={page >= history.total_pages} onClick={() => setPage(p => p + 1)}>下一页</button></div></>}
    </details>
  </main>
}
