import type { StrategyResult } from './strategyApi'

type Timeline = NonNullable<NonNullable<StrategyResult['shadow_health']>['timeline']>

function pct(value: number) { return `${(value * 100).toFixed(2)}%` }

function yearTicks(rows: Timeline) {
  return rows.reduce<Array<{ label: string; index: number }>>((ticks, row, index) => {
    const label = row.session.slice(0, 4)
    if (ticks.at(-1)?.label !== label) ticks.push({ label, index })
    return ticks
  }, [])
}

function plot(rows: Timeline, value: (row: Timeline[number]) => number, min: number, max: number, top: number, height: number, stepped = false) {
  const x = (index: number) => 54 + index / (rows.length - 1) * 934
  const y = (row: Timeline[number]) => top + (max - value(row)) / (max - min || 1) * height
  return rows.map((row, index) => `${index && stepped ? `H${x(index)}` : ''}${index && stepped ? `V${y(row)}` : `${index ? 'L' : 'M'}${x(index)},${y(row)}`}`).join(' ')
}

export default function ShadowTimeline({ result, hoverDate, onHoverDate }: {
  result: StrategyResult
  hoverDate: string | null
  onHoverDate: (date: string | null) => void
}) {
  const health = result.shadow_health
  if (!health || health.experiment_variant !== 'S4V3') return null
  const rows = health.timeline
  if (!rows || rows.length < 2) return <section className="shadow-timeline shadow-timeline-empty">
    <h3>影子 S0 与目标仓位</h3>
    <p>这份历史回测生成时尚未保存影子逐日净值。重新运行 S4-V3 后即可查看曲线。</p>
  </section>

  const minReturn = Math.min(0, ...rows.map((row) => row.shadow_return))
  const maxReturn = Math.max(0, ...rows.map((row) => row.shadow_return))
  const minDrawdown = Math.min(-.01, ...rows.map((row) => row.shadow_drawdown))
  const zeroReturnY = 14 + maxReturn / (maxReturn - minReturn || 1) * 96
  const selectedIndex = hoverDate ? rows.findIndex((row) => row.session === hoverDate) : -1
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : rows.at(-1)!
  const x = (index: number) => 54 + index / (rows.length - 1) * 934
  const ticks = yearTicks(rows)
  const pointer = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const relative = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    const index = Math.max(0, Math.min(rows.length - 1, Math.round((relative * 1000 - 54) / 934 * (rows.length - 1))))
    onHoverDate(rows[index].session)
  }
  const switchDates = new Set(health.changes.map((change) => change.execution_session).filter(Boolean))
  return <section className="shadow-timeline">
    <div className="shadow-timeline-heading"><div><h3>影子 S0 与目标仓位</h3><p>影子账户只提供 T 日收盘环境信号；下方仓位从 T+1 执行。</p></div><strong>{selected.session}</strong></div>
    <div className="shadow-timeline-values"><span>影子累计收益 <b>{pct(selected.shadow_return)}</b></span><span>影子当前回撤 <b>{pct(selected.shadow_drawdown)}</b></span><span>目标仓位 <b>{pct(selected.target_exposure)}</b></span></div>
    <svg viewBox="0 0 1000 270" preserveAspectRatio="none" role="img" aria-label="影子 S0 净值回撤和目标仓位逐日变化" onMouseMove={pointer} onMouseLeave={() => onHoverDate(null)}>
      <text className="shadow-axis" x="48" y="19" textAnchor="end">{pct(maxReturn)}</text>
      <text className="shadow-axis" x="48" y="111" textAnchor="end">{pct(minReturn)}</text>
      <text className="shadow-axis" x="48" y="181" textAnchor="end">{pct(minDrawdown)}</text>
      <line className="shadow-zero" x1="54" x2="988" y1={zeroReturnY} y2={zeroReturnY} />
      <path className="shadow-return-line" d={plot(rows, (row) => row.shadow_return, minReturn, maxReturn, 14, 96)} />
      <path className="shadow-drawdown-line" d={plot(rows, (row) => row.shadow_drawdown, minDrawdown, 0, 126, 54)} />
      {[.3, .5, 1].map((level) => <g key={level}><line className="shadow-exposure-guide" x1="54" x2="988" y1={204 + (1 - level) * 42} y2={204 + (1 - level) * 42} /><text className="shadow-axis" x="48" y={208 + (1 - level) * 42} textAnchor="end">{Math.round(level * 100)}%</text></g>)}
      <path className="shadow-exposure-line" d={plot(rows, (row) => row.target_exposure, 0, 1, 204, 42, true)} />
      {rows.map((row, index) => switchDates.has(row.session) ? <circle key={row.session} className="shadow-switch-point" cx={x(index)} cy={204 + (1 - row.target_exposure) * 42} r="2.5" /> : null)}
      {ticks.map((tick) => <g key={tick.label}><line className="shadow-year-guide" x1={x(tick.index)} x2={x(tick.index)} y1="14" y2="246" /><text className="shadow-axis" x={x(tick.index)} y="263" textAnchor={tick.index ? 'middle' : 'start'}>{tick.label}</text></g>)}
      {selectedIndex >= 0 && <line className="shadow-cursor" x1={x(selectedIndex)} x2={x(selectedIndex)} y1="14" y2="246" />}
    </svg>
    <div className="shadow-timeline-legend"><span className="shadow-return-key">影子累计收益 {pct(rows.at(-1)!.shadow_return)}</span><span className="shadow-drawdown-key">影子回撤</span><span className="shadow-exposure-key">S4-V3 目标仓位</span><span className="shadow-switch-key">切换日</span></div>
    {health.source?.selection_sequence_matches === false && <p className="shadow-timeline-note">影子 S0 与实际持仓的选股序列不同，这条曲线仅用于说明环境信号，不代表真实账户的固定满仓收益。</p>}
  </section>
}
