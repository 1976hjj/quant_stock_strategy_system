import { useEffect, useState } from 'react'
import type { DataJob } from './dataApi'

function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}分${seconds % 60}秒` : `${Math.floor(minutes / 60)}小时${minutes % 60}分`
}

export default function DataUpdateProgress({ job }: { job: DataJob }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (job.status !== 'RUNNING') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [job.job_id, job.status])
  const complete = job.status === 'PASS'
  const progress = complete ? 100 : Math.min(99, Math.max(0, job.progress || 0))
  const started = job.started_at ? Date.parse(job.started_at) : NaN
  const updated = job.updated_at ? Date.parse(job.updated_at) : NaN
  const elapsed = Number.isFinite(started) && (job.status === 'RUNNING' || Number.isFinite(updated)) ? duration((job.status === 'RUNNING' ? now : updated) - started) : null
  const count = job.stage_total != null ? `${job.stage_completed ?? 0} / ${job.stage_total} ${job.stage_unit || '项'}` : null
  return <section className="data-panel data-job">
    <div className="data-section-title"><span>03</span><div><h2>最近一次更新</h2><p>{job.request.source_id === 'industry' ? '银行行业专项 · Token优先' : job.request.source_id === 'eastmoney' ? '东方财富 · 免费公开数据' : '通用数据更新'} · 任务 {job.job_id}</p></div></div>
    <div className="data-job-status"><b className={job.status.toLowerCase()}>{complete ? '已完成' : job.status === 'FAIL' ? '失败' : '运行中'}</b><span>{job.phase}</span><strong>{progress}%</strong></div>
    <div className="data-progress" role="progressbar" aria-label="更新流程完成度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${job.phase}，${count || `${progress}%`}`}><i style={{ width: `${progress}%` }} /></div>
    <div className="data-job-meta"><span>来源组 {job.completed_groups ?? 0} / {job.total_groups ?? '—'}</span>{job.stage_index != null && <span>阶段 {job.stage_index} / {job.stage_count}</span>}{elapsed && <span>{complete ? '总耗时' : '已运行'} {elapsed}</span>}{job.retry_attempt != null && job.retry_attempt > 1 && <span>第 {job.retry_attempt} 次尝试</span>}{Number.isFinite(updated) && <span>{job.status === 'RUNNING' ? `上次进展 ${duration(now - updated)}前` : `结束于 ${new Date(updated).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`}</span>}</div>
    {!complete && <div className="data-current-work"><div><b>{job.status === 'FAIL' ? '失败阶段' : '当前工作'}</b>{count && <strong>{count}</strong>}</div><p>{job.detail || job.phase}</p>{job.stage_progress != null && <div className="data-stage-progress"><i style={{ width: `${Math.min(100, Math.max(0, job.stage_progress))}%` }} /></div>}</div>}
    {!!job.stages?.length && <ol className="data-update-stages" aria-label="数据更新阶段">{job.stages.map((stage, index) => <li key={stage.id} className={`data-stage-${stage.status.toLowerCase()}`} aria-current={stage.id === job.stage_id && !complete ? 'step' : undefined}><span className="data-stage-marker">{stage.status === 'DONE' ? '✓' : stage.status === 'FAIL' ? '!' : index + 1}</span><div><b>{stage.name}</b><small>{stage.reused ? '复用本地' : stage.status === 'DONE' ? '已完成' : stage.status === 'FAIL' ? '失败' : stage.status === 'RUNNING' ? '处理中' : '待处理'}{stage.total != null && ` · ${stage.completed ?? 0}/${stage.total} ${stage.unit || '项'}`}</small></div></li>)}</ol>}
    {!!job.stages?.length && <p className="data-progress-note">百分比按实际工作量分阶段累计，不代表剩余时间；全部入库发布成功才显示100%。</p>}
    {job.error && <p className="data-alert error">{job.error}</p>}
    <details><summary>查看运行日志</summary><pre>{job.log_tail || '暂无日志'}</pre></details>
  </section>
}
