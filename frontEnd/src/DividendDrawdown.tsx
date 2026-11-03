import { useEffect, useState } from 'react'
import { STRATEGY_API_ROOT } from './strategyApi'

export type DrawdownObservation = {
  code: string; as_of: string; close: number; peak_close: number; peak_date: string
  drawdown: number; checked_at: string; timing_note: string; adjustment_note: string; source: string
}
export default function DividendDrawdown({ triggerPct }: { triggerPct: string }) {
  const [refresh, setRefresh] = useState(0)
  const [market, setMarket] = useState<DrawdownObservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    setLoading(true); setError(''); setMarket(null)
    fetch(`${STRATEGY_API_ROOT}/capital-allocation/market/512890?refresh=${Date.now()}`, { method: 'GET', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '行情服务暂不可用')
        if (data.code !== '512890' || !Number.isFinite(data.drawdown) || data.drawdown > 0 || data.drawdown < -1
          || !Number.isFinite(data.close) || data.close <= 0 || !Number.isFinite(data.peak_close) || data.peak_close <= 0
          || typeof data.as_of !== 'string' || typeof data.peak_date !== 'string' || !Number.isFinite(Date.parse(data.checked_at))) throw new Error('行情数据不完整，未计算回撤')
        if (!cancelled) setMarket(data as DrawdownObservation)
      })
      .catch(reason => { if (!cancelled) setError(reason?.name === 'AbortError' ? '读取行情超时，请重新刷新。' : reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { clearTimeout(timer); if (!cancelled) setLoading(false) })
    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [refresh])
  const trigger = Number(triggerPct)
  const hint = !market ? '' : market.drawdown >= -1e-12 ? '已修复到前高；不是新的回撤入场信号。'
    : Number.isFinite(trigger) && trigger > 0 && market.drawdown <= -trigger / 100
      ? `已达到－${trigger}%观察门槛；收盘确认后仍须核对资金及可成交时间。`
      : `未达到－${triggerPct}%回撤入场门槛。`
  return <section className="ca-live-drawdown" aria-label="512890当前回撤">
    <header><span>当前回撤 · 最新完整收盘</span><button disabled={loading} onClick={() => setRefresh(n => n + 1)}>{loading ? '计算中…' : '刷新回撤'}</button></header>
    <strong className={error ? 'ca-drawdown-unavailable' : ''}>{loading ? '读取中' : market ? `${(market.drawdown * 100).toFixed(2)}%` : '—'}</strong>
    {market && <><p>行情截至 <b>{market.as_of}</b> · 收盘 <b>{market.close.toFixed(3)}</b> 元</p><p>历史收盘高点 <b>{market.peak_close.toFixed(3)}</b> 元 · {market.peak_date}</p><p className="ca-drawdown-hint">{hint}</p><small>本次核对 {new Date(market.checked_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</small></>}
    {error && <p className="ca-drawdown-error" role="status">无法取得当前回撤：{error}。缺失不按0%处理。</p>}
  </section>
}
