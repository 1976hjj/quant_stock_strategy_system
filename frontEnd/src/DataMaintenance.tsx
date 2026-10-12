import { useEffect, useState } from 'react'
import { dataApi } from './dataApi'
import type { DataHistory, DataMaintenance as Maintenance } from './dataApi'

const notificationKey = 'quant-data-weekly-notification'
// Older running data services still return a task that includes API synchronization.
// Keep the report-only action usable until that service is next started normally.
const reportPromptFallback = `请检查 D:\\futures_quant_strategy 的银行财报原文证据，补充并核验尚缺的报告数据。
先读取 AGENTS.md、研究宪法和数据访问限制。通用和行业接口数据由我在页面更新，本次只读取已有归档作比对，不重复启动接口同步或调用收费接口；归档过旧时列出需我在页面更新的项目。
查交易所、巨潮或银行官网的新季报、中报、年报、更正及分红公告，只补缺少的报告和修订版本。
保存官方链接、原始文件及哈希、报告期、真实披露时间、采集时间、页码、单位、合并范围及指标口径。
核验盈利、净资产及其他权益工具、资产质量、拨备、资本、净息差、贷款存款及分红所属期间和实施状态。未披露、漏采、口径冲突和待核验分别记录，不补零，不将累计数当单季或将预案当实施。
指标缺失或无效时保留空值及原因，不擅自跨时点、跨定义或跨口径替代；来源直接提供的指标与计算得到的派生指标分别标明，新增补算须核验输入、可用时间、公式及口径。
原文补充单独保存版本，不覆盖接口原始表；同银行、报告期和指标先核对口径及可用时间，记录差异。
最后列出新增证据、缺项、核验结果及待重算因子。因子由我在页面另行计算，不扩大研究范围，不改写旧证据和旧报告；不支持的报告类型明确说明。`
function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无成功时间记录'
}
function weekKey(now: Date) {
  const china = new Date(now.getTime() + 8 * 3600_000)
  const monday = new Date(Date.UTC(china.getUTCFullYear(), china.getUTCMonth(), china.getUTCDate()))
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  return monday.toISOString().slice(0, 10)
}

export default function DataMaintenance({ value, jobId, onError }: {
  value: Maintenance; jobId?: string; onError: (message: string) => void
}) {
  const [copied, setCopied] = useState('')
  const [history, setHistory] = useState<DataHistory | null>(null)
  const [page, setPage] = useState(1)
  const [historyError, setHistoryError] = useState('')
  const [daysAway] = useState(() => {
    try {
      const lastVisit = localStorage.getItem('quant-data-last-visit')
      if (!lastVisit) return 0
      const elapsed = Date.parse(value.checked_at) - Date.parse(lastVisit)
      return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86400_000)) : 0
    } catch { return 0 }
  })
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(notificationKey) === 'on' } catch { return false } })
  useEffect(() => {
    try { localStorage.setItem('quant-data-last-visit', value.checked_at) } catch { /* Browser storage is optional. */ }
  }, [value.checked_at])
  useEffect(() => {
    let active = true
    setHistoryError('')
    void dataApi.history(page).then((data) => { if (active) setHistory(data) })
      .catch((error) => { if (active) setHistoryError(String(error)) })
    return () => { active = false }
  }, [page, jobId, value.checked_at])
  useEffect(() => {
    if (!enabled) return
    const check = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      try {
        const now = new Date()
        const week = weekKey(now)
        const scheduled = new Date(`${week}T20:30:00+08:00`)
        if (now < scheduled || localStorage.getItem(`${notificationKey}-sent`) === week) return
        const notice = new Notification('每周数据维护提醒', {
          body: '检查通用数据、银行行业台账及新财报。接口数据在页面更新，财报原文补充交给项目对话处理。',
          tag: 'quant-data-maintenance',
        })
        notice.onclick = () => { window.focus(); notice.close() }
        localStorage.setItem(`${notificationKey}-sent`, week)
      } catch { /* Storage or notification policy may be blocked by the browser. */ }
    }
    check()
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [enabled])
  const toggleNotifications = async () => {
    try {
      if (enabled) { localStorage.setItem(notificationKey, 'off'); setEnabled(false); return }
      if (!('Notification' in window)) throw new Error('当前浏览器不支持系统通知；页面内的更新到期提示仍然有效。')
      if (await Notification.requestPermission() !== 'granted') throw new Error('通知权限未开启；页面提醒仍然有效。可在浏览器设置中允许本地网站通知。')
      localStorage.setItem(notificationKey, 'on'); setEnabled(true)
    } catch (error) { onError(String(error)) }
  }
  const copy = async (kind: string, prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); setCopied(kind) }
    catch { onError('无法访问剪贴板，请展开提示词手动复制。') }
  }
  const due = value.ledger.filter((row) => row.state !== 'current')
  const reportPrompt = value.update_prompt_scope === 'bank_reports' ? value.update_prompt : reportPromptFallback
  const longUnused = value.ledger.some((row) => row.state === 'long_unused')
  return <section className="data-panel data-maintenance">
    <div className="data-section-title"><span>指南</span><div><h2>完整更新步骤与行业台账</h2><p>每周检查一次；超过 {value.long_unused_days} 天未更新时，先做完整检查。刷新覆盖状态只读取台账，不下载数据。</p></div></div>
    <ol className="data-guide">
      <li><b>更新通用数据：</b>勾选六项通用数据，更新至允许的最新日期，刷新最近财报期保留 4。依次点“检查通用更新计划”→“开始通用增量更新”，等待“已完成”。</li>
      <li><b>更新银行行业：</b>勾选“银行基本面、财务与估值”，设相同截止日期。点“检查行业更新计划”→“开始行业增量同步”，等待完成。免费补充源随行业同步，无需另点。</li>
      <li><b>补充原文财报：</b>点“复制财报补充提示词”，发给项目对话，检查新报告、更正及分红公告，核验缺项并归档原文证据；不重复启动页面的接口更新。</li>
      <li><b>更新因子：</b>进入“因子计算”，选择银行个股或银行板块指标，在已授权研究日期范围内预检、计算，检查覆盖与缺项。既有报告保留，不随采集自动改写。</li>
    </ol>
    {daysAway >= value.long_unused_days && <div className="data-alert error" role="status">距上次打开数据管理已约 {daysAway} 天，建议先刷新覆盖状态，检查遗漏公告，再按完整流程更新。</div>}
    <div className={`data-alert ${longUnused ? 'error' : ''}`} role="status">
      {longUnused ? '有来源已超过30天未更新：建议执行完整更新检查。' : due.length ? `有 ${due.length} 项来源需要每周检查或缺少成功时间记录。` : '已记录来源的采集时间在一周内；仍需核对新公告和缺项。'}
      <p>{value.official_reports_status}</p>
    </div>
    <div className="data-ledger-wrap"><table className="data-ledger"><thead><tr><th>来源</th><th>归档覆盖截止</th><th>上次成功采集</th><th>距今</th><th>维护提示</th></tr></thead><tbody>{value.ledger.map((row) => <tr key={row.id}>
      <td>{row.name}</td><td>{row.coverage_end || '无记录'}</td><td>{dateLabel(row.last_success_at)}</td><td>{row.days_since_success === null ? '未知' : `${row.days_since_success} 天`}</td>
      <td>{({ missing: '待检查成功记录', long_unused: '久未更新 · 完整检查', due: '每周检查已到期', current: '一周内已采集' })[row.state]}</td>
    </tr>)}</tbody></table></div>
    <div className="data-actions"><button onClick={() => void copy('更新', reportPrompt)}>{copied === '更新' ? '已复制财报补充提示词' : '复制财报补充提示词'}</button>
      <button onClick={() => void toggleNotifications()}>{enabled ? '关闭本页每周通知' : '开启本页每周通知'}</button></div>
    <p className="data-notification-note">每周一 20:30（北京时间）。本页通知需要浏览器允许通知且数据管理页保持打开，错过后下次进入补提醒，每周最多一次。提醒不会自动更新数据；财报补充提示词复制后需发给项目对话。</p>
    <details><summary>查看财报补充提示词</summary><pre className="data-prompt">{reportPrompt}</pre></details>
    <details><summary>查看更新历史（{history?.total_items ?? 0} 次）</summary>
      {historyError && <p className="data-alert error">{historyError}</p>}
      <div className="data-ledger-wrap"><table className="data-ledger"><thead><tr><th>任务</th><th>来源</th><th>目标日期</th><th>状态</th><th>说明</th></tr></thead><tbody>{history?.items.map((item) => <tr key={item.job_id}>
        <td>{item.job_id}</td><td>{item.source_id === 'industry' ? '行业' : item.source_id === 'eastmoney' ? '免费补充' : '通用'}</td><td>{item.target_end}</td><td>{({ PASS: '已完成', FAIL: '失败', RUNNING: '运行中' } as Record<string, string>)[item.status] || '未知'}</td><td>{item.error || `${item.completed_groups}/${item.total_groups} 阶段；${item.total_groups === 0 && item.status === 'PASS' ? '无需采集，不重置成功采集时间' : '原文核验及因子计算另行处理'}`}</td>
      </tr>)}</tbody></table></div>
      <div className="data-actions"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button><span>{page} / {Math.max(1, history?.total_pages || 0)}</span><button disabled={!history || page >= history.total_pages} onClick={() => setPage(page + 1)}>下一页</button></div>
    </details>
  </section>
}
