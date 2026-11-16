import { useEffect, useState } from 'react'
import { STRATEGY_API_ROOT } from './strategyApi'
import { nextPublishedTradingSession } from './tradingCalendar2026'
import type { RatioResult } from './RatioRotationControls'

export type TriggerReference = {
  status: 'AVAILABLE'; as_of: string; quote_basis: 'ARCHIVED_CLOSE'
  signal_state: 'CASH' | 'GROWTH' | 'DIVIDEND'; ma_sessions: number; buffer_fraction: number
  growth_etf: string; dividend_etf: string; growth_close: number; dividend_close: number
  growth_upper_per_dividend: number; growth_lower_per_dividend: number
  volatility: { sessions: number; median_abs_log_move: number; p90_abs_log_move: number } | null
  assumption: string
}

const price = (v: number) => v.toFixed(3)
const percent = (v: number) => `${(v * 100).toFixed(2)}%`
const tickAbove = (v: number) => (Math.floor(v * 1000 + 1e-8) + 1) / 1000
const tickBelow = (v: number) => Math.max(0, (Math.ceil(v * 1000 - 1e-8) - 1) / 1000)
export function shanghaiDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function ratioTriggerEstimate(r: TriggerReference, growth: number, dividend: number, today: string) {
  if (![growth, dividend, r.growth_upper_per_dividend, r.growth_lower_per_dividend].every(v => Number.isFinite(v) && v > 0)) return null
  const up = r.growth_upper_per_dividend * dividend, down = r.growth_lower_per_dividend * dividend
  const direction = r.signal_state === 'GROWTH' ? 'DOWN' : r.signal_state === 'DIVIDEND' ? 'UP'
    : growth > up ? 'UP' : growth < down ? 'DOWN' : Math.log(up / growth) < Math.log(growth / down) ? 'UP' : 'DOWN'
  const crossed = direction === 'UP' ? growth > up : growth < down
  const distance = Math.max(0, direction === 'UP' ? Math.log(up / growth) : Math.log(growth / down))
  const validFor = nextPublishedTradingSession(r.as_of)
  const expired = !validFor || validFor < today
  const level = expired ? 'STALE' : crossed ? 'CROSSED' : !r.volatility ? 'UNKNOWN'
    : distance <= r.volatility.median_abs_log_move ? 'NEAR'
    : distance <= r.volatility.p90_abs_log_move ? 'WATCH' : 'DISTANT'
  const target = direction === 'UP' ? tickAbove(up) : tickBelow(down)
  return { direction, crossed, distance, level, target, validFor, expired,
    targetReturn: target / growth - 1, requiredRelativeMove: Math.expm1(distance) }
}

export function ratioTriggerRanges(r: TriggerReference, dividend: number) {
  if (!Number.isFinite(dividend) || dividend <= 0) return []
  const step = dividend >= 1 ? .01 : dividend >= .1 ? .005 : .001
  const base = Math.floor(dividend / step + 1e-8)
  return Array.from({ length: 7 }, (_, i) => {
    const low = Number(((base + i - 3) * step).toFixed(3)), high = Number((low + step).toFixed(3))
    return { low, high, up: tickAbove(r.growth_upper_per_dividend * high), down: tickBelow(r.growth_lower_per_dividend * low), selected: dividend >= low && dividend < high }
  }).filter(row => row.low > 0)
}

export function RatioTriggerPanel({ reference: r, today = shanghaiDay() }: { reference: TriggerReference; today?: string }) {
  const [growth, setGrowth] = useState(price(r.growth_close))
  const [dividend, setDividend] = useState(price(r.dividend_close))
  const g = Number(growth), d = Number(dividend)
  const estimate = ratioTriggerEstimate(r, g, d, today)
  const manual = g !== r.growth_close || d !== r.dividend_close
  const forToday = estimate?.validFor === today
  const labels: Record<string, string> = {
    STALE: '参考已过期，请更新数据', CROSSED: '输入价格已越线 · 待指数确认',
    NEAR: `${forToday ? '今日' : '下次交易'}重点关注 · 接近门槛`,
    WATCH: `${forToday ? '今日' : '下次交易'}留意 · 在近期日波动范围内`,
    DISTANT: '距离切换较远', UNKNOWN: '历史样本不足，仅展示距离',
  }
  return <div className="qs-ratio-trigger" aria-label="ETF价格切换参考">
    <div className="qs-trigger-heading"><h4>ETF价格切换参考</h4>
      <span className={`qs-trigger-badge is-${estimate?.level.toLowerCase() || 'unknown'}`} role="status" aria-live="polite">{estimate ? labels[estimate.level] : '请输入有效价格'}</span>
    </div>
    <p className="qs-trigger-dates">适用交易日：{estimate?.validFor || '待交易日历更新'} · 收盘基准：{r.as_of} · {r.ma_sessions}日均线／±{percent(r.buffer_fraction)}</p>
    <div className="qs-trigger-layout">
      <div>
        <div className="qs-trigger-prices">
          <label>创业板ETF · {r.growth_etf}<input aria-label="切换参考创业板ETF价格" type="number" min="0.001" step="0.001" value={growth} onChange={e => setGrowth(e.target.value)} /></label>
          <label>红利低波ETF · {r.dividend_etf}<input aria-label="切换参考红利ETF价格" type="number" min="0.001" step="0.001" value={dividend} onChange={e => setDividend(e.target.value)} /></label>
        </div>
        <div className="qs-trigger-source"><small>{manual ? '手工情景价格，未接入实时行情' : '当前为归档收盘价，可填入看盘价格'}</small><button type="button" onClick={() => { setGrowth(price(r.growth_close)); setDividend(price(r.dividend_close)) }}>恢复收盘价</button></div>
        {estimate ? <>
          <div className={`qs-trigger-target is-${estimate.direction.toLowerCase()}`}>
            <small>{estimate.direction === 'UP' ? '转成长：红利保持输入价格时，创业板需达到' : '转红利：红利保持输入价格时，创业板需降至'}</small>
            <b>{price(estimate.target)} <em>元</em></b>
            <span>{estimate.crossed ? '输入价格已越过ETF近似门槛，尚非确认交易信号。' : `较输入创业板价格还需${estimate.direction === 'UP' ? '上涨' : '下跌'}约${percent(Math.abs(estimate.targetReturn))}。`}</span>
          </div>
          {r.volatility && <p className="qs-trigger-vol">近{r.volatility.sessions}个交易日，比值绝对日变动中位数约{percent(Math.expm1(r.volatility.median_abs_log_move))}，90%分位约{percent(Math.expm1(r.volatility.p90_abs_log_move))}。提醒比较的是所需变动与历史波幅，<strong>不是切换概率</strong>。</p>}
          {estimate.expired && <p className="qs-warning">这份门槛不适用于今天；请更新数据并完成回测后查看。</p>}
        </> : <p className="qs-warning">两只ETF价格均须大于0，不能用空值或0估计切换。</p>}
      </div>
      <div className="qs-trigger-table-wrap"><table className="qs-trigger-table">
        <caption>红利价格区间 → 创业板参考价（元）</caption>
        <thead><tr><th>红利ETF区间</th><th className={estimate?.direction === 'UP' ? 'active-up' : ''}>转成长 ≥</th><th className={estimate?.direction === 'DOWN' ? 'active-down' : ''}>转红利 ≤</th></tr></thead>
        <tbody>{ratioTriggerRanges(r, d).map(row => <tr key={row.low} className={row.selected ? 'is-selected' : ''}><td>{price(row.low)}—{price(row.high)}</td><td>{price(row.up)}</td><td>{price(row.down)}</td></tr>)}</tbody>
      </table><small>上切按红利区间上沿、下切按下沿折算；上方大字按输入价格细算。这里只观察ETF，不指定个股。</small></div>
    </div>
    <small className="qs-trigger-note">{r.assumption} 行情价格门槛不包含滑点与手续费；门槛每日滚动重算，不自动下单。</small>
  </div>
}

export function RatioTriggerReference({ strategyId, result }: { strategyId?: string; result: RatioResult }) {
  const [data, setData] = useState<TriggerReference | null>(null)
  const [error, setError] = useState('')
  const asOf = result.latest?.session
  const state = result.latest?.state || result.current_state
  const n = result.parameters?.ma_sessions, b = result.parameters?.buffer_fraction
  const red = result.defensive_etf || (result.parameters?.data_mode === 'ETF_STOCK' ? '512890.SH' : '563020.SH')
  useEffect(() => {
    setData(null); setError('')
    if (!strategyId || !asOf) return
    const controller = new AbortController()
    let active = true
    ;(async () => {
      try {
        const response = await fetch(`${STRATEGY_API_ROOT}/quality-strategies/${encodeURIComponent(strategyId)}/ratio-trigger-reference`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || '切换参考暂时无法读取')
        if (body.as_of !== asOf || body.ma_sessions !== n || body.buffer_fraction !== b || body.dividend_etf !== red || body.signal_state !== state) throw new Error('回测结果已更新，请刷新面板后查看切换参考')
        if (active) setData(body)
      } catch (e) { if (active && !controller.signal.aborted) setError(String(e instanceof Error ? e.message : e)) }
    })()
    return () => { active = false; controller.abort() }
  }, [strategyId, asOf, n, b, red, state])
  if (!strategyId || !asOf) return null
  if (error) return <p className="qs-warning" role="note">ETF切换参考暂不可用：{error}</p>
  if (!data) return <p className="qs-trigger-dates">正在读取ETF切换价格参考…</p>
  return <RatioTriggerPanel key={`${data.as_of}:${n}:${b}:${red}`} reference={data} />
}
