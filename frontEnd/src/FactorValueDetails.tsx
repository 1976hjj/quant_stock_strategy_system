import { useState } from 'react'
import { api } from './api'
import type { SectorValuePage } from './types'

const REASONS: Record<string, string> = {
  PB_CURRENT_INPUT_MISSING: '当日PB缺失或非正',
  PB_VALID_HISTORY_INSUFFICIENT: 'PB有效历史尚未达到门槛',
  COVERAGE_OR_HISTORY_WARMUP: '有效样本或历史长度不足',
  QUALITY_OR_VALUATION_COVERAGE_OR_WARMUP: '质量条件或估值输入覆盖不足',
  BENCHMARK_OR_BASKET_SEGMENT_WARMUP_OR_MISSING: '银行篮子或宽基收益序列缺失、连续历史不足',
  CALCULATION_INPUT_UNAVAILABLE: '计算输入不足',
}

export default function FactorValueDetails({ releaseId, factorId }: { releaseId: string; factorId: string }) {
  const [page, setPage] = useState<SectorValuePage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async (number: number) => {
    setBusy(true); setError('')
    try { setPage(await api.sectorValues(releaseId, factorId, number)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }
  return <details className="factor-values" onToggle={event => {
    if (event.currentTarget.open && !page && !busy) void load(1)
  }}>
    <summary>查看因子数值与覆盖情况</summary>
    {busy && <p>正在读取结果…</p>}
    {error && <p className="factor-compute-error">{error}<button disabled={busy} onClick={() => void load(page?.page || 1)}>重试</button></p>}
    {page && <><div className="processing-table-scroll"><table><thead><tr><th>日期</th><th>数值</th><th>有效数 / 统计样本数</th><th>覆盖率</th><th>状态 / 原因</th></tr></thead><tbody>{page.items.map(item => <tr key={item.session}><td>{item.session.slice(0, 10)}</td><td>{item.value === null ? '—' : item.value.toFixed(4)}</td><td title={item.coverage_basis === 'quality_eligible_pool' ? '统计样本为质量合格银行' : '统计样本为当日银行范围'}>{item.valid_count} / {item.denominator_count ?? item.universe_count}</td><td>{(item.coverage * 100).toFixed(1)}%</td><td>{item.status === 'READY_RESEARCH_ONLY' ? '研究值可用' : `输入不足：${item.reason_detail || REASONS[item.reason] || item.reason}`}</td></tr>)}</tbody></table></div><div className="processing-pagination"><button disabled={busy || page.page <= 1} onClick={() => void load(page.page - 1)}>上一页</button><span>{page.page} / {Math.max(1, page.totalPages)} · 共 {page.totalItems} 条</span><button disabled={busy || page.page >= page.totalPages} onClick={() => void load(page.page + 1)}>下一页</button></div></>}
  </details>
}
