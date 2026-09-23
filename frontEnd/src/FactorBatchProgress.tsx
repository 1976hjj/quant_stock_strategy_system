import { api } from './api'
import type { FactorBatchStageProgress, FactorBatchStatus } from './types'

const statusText: Record<string, string> = {
  WAITING: '等待', RUNNING: '运行中', PASS: '完成', FAIL: '失败',
  PARTIAL: '部分完成', STOPPED: '已停止', SKIPPED: '已跳过', NOT_RUN: '未开始',
}

function duration(seconds?: number | null) {
  if (seconds == null) return null
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`
}

function StepList({ progress }: { progress?: FactorBatchStageProgress | null }) {
  if (!progress?.steps.length) return null
  return <ol className="batch-step-list" aria-label="检验步骤">
    {progress.steps.map((step) => <li key={step.id} className={`batch-step ${step.status.toLowerCase()}`}>
      <span className="batch-step-mark">{step.status === 'PASS' ? '✓' : step.status === 'RUNNING' ? '●' : '○'}</span>
      <span>{step.label}</span>
    </li>)}
  </ol>
}

export default function FactorBatchProgress({ batch, working, onStop, onRetry }: {
  batch: FactorBatchStatus
  working: boolean
  onStop: () => void
  onRetry: () => void
}) {
  const activity = batch.activity
  const completedSteps = batch.completed_steps
  const totalSteps = batch.total_steps
  const overall = Math.max(0, Math.min(100, batch.progress))
  return <div className="batch-progress">
    <div className="batch-progress-head">
      <div><strong>{batch.phase}</strong><p>{batch.completed}/{batch.total} 个因子已结束{totalSteps != null && ` · 已完成 ${completedSteps}/${totalSteps} 步`}{batch.elapsed_seconds != null && ` · 已运行 ${duration(batch.elapsed_seconds)}`}</p></div>
      <div className="batch-progress-percent"><b>{overall}%</b><span>{statusText[batch.status] || batch.status}</span></div>
    </div>
    <div className="progress-track" role="progressbar" aria-label="批次步骤进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}><i style={{ width: `${overall}%` }} /></div>
    <p className="batch-progress-note">按已完成的计算与检验步骤计数；长步骤进行中会显示当前工作，不代表剩余时间。</p>
    {batch.status === 'RUNNING' && activity && <div className="batch-current-work" aria-live="polite">
      <span className="batch-current-dot" />
      <div><strong>{activity.title}</strong><p>{activity.stage || '准备下一步'}{activity.stage_progress && ` · ${activity.stage_progress.completed}/${activity.stage_progress.total} 个检验步骤已完成`}{activity.stage_progress?.elapsed_seconds != null && ` · 本步已运行 ${duration(activity.stage_progress.elapsed_seconds)}`}</p>{activity.detail && <small>{activity.detail}</small>}</div>
    </div>}
    <div className="batch-results">{batch.items.map((item) => <div className="batch-result-row" key={item.factor_id}>
      <div className="batch-result-main"><b>{item.name}</b><span className={`batch-status ${item.status.toLowerCase()}`}>{statusText[item.status] || item.status}</span>{item.m4_job_id && item.status === 'PASS' && <a href={api.reportUrl(item.m4_job_id)} target="_blank" rel="noreferrer">报告 ↗</a>}</div>
      <div className="batch-result-detail"><span>{item.stage_progress?.current_label || item.phase}</span>{item.stage_progress && <span>{item.stage_progress.completed}/{item.stage_progress.total} 步</span>}{item.factor_years && item.status === 'RUNNING' && <span>年度 {item.factor_years.completed}/{item.factor_years.total}</span>}</div>
      <div className="batch-mini-track"><i style={{ width: `${item.progress ?? (item.status === 'WAITING' ? 0 : item.status === 'RUNNING' ? 5 : 100)}%` }} /></div>
      {item.status === 'RUNNING' && <StepList progress={item.stage_progress} />}
      {item.status !== 'RUNNING' && item.stage_progress && <details className="batch-step-details"><summary>查看检验步骤</summary><StepList progress={item.stage_progress} /></details>}
      {item.error && <small className="batch-error" title={item.error}>{item.error}</small>}
    </div>)}</div>
    {batch.request.stages.includes('m4_5') && <div className="batch-cohort-row">
      <div className="batch-result-main"><b>本批联合 M4.5</b><span className={`batch-status ${batch.cohort_status.toLowerCase()}`}>{statusText[batch.cohort_status] || batch.cohort_status}</span>{batch.cohort_job_id && batch.cohort_status === 'PASS' && <a href={api.explorerUrl(batch.cohort_job_id)} target="_blank" rel="noreferrer">查看共同检验 ↗</a>}</div>
      {batch.cohort_stage_progress ? <><p>{batch.cohort_stage_progress.current_label || '联合检验已结束'} · {batch.cohort_stage_progress.completed}/{batch.cohort_stage_progress.total} 步</p><StepList progress={batch.cohort_stage_progress} /></> : <p>{batch.cohort_status === 'NOT_RUN' ? '等待前置因子检验完成' : '正在合并因子数据'}</p>}
    </div>}
    {batch.error && <div className="factor-compute-error">{batch.error}</div>}
    <div className="batch-run-actions">{batch.status === 'RUNNING' && <button disabled={working || batch.stop_requested} onClick={onStop}>{batch.stop_requested ? '将在当前因子完成后停止' : '完成当前因子后停止'}</button>}{batch.status !== 'RUNNING' && (batch.items.some((item) => item.status === 'FAIL' || item.status === 'WAITING') || batch.cohort_status === 'FAIL') && <button disabled={working} onClick={onRetry}>{batch.status === 'STOPPED' ? '继续未完成项' : '重试失败项'}</button>}</div>
    <code>{batch.batch_id}</code>
  </div>
}
