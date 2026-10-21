import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

export type TimeWindow = { start: number; end: number }

export function useChartTimeRange(sessions: readonly string[]) {
  // Polling returns new arrays. A date-domain key keeps a user's zoom intact.
  const key = `${sessions[0]}:${sessions.at(-1)}:${sessions.length}`
  const [saved, setSaved] = useState<TimeWindow & { key: string } | null>(null)
  const last = Math.max(0, sessions.length - 1)
  const start = saved?.key === key ? Math.min(saved.start, Math.max(0, last - 1)) : 0
  const end = saved?.key === key ? Math.min(last, Math.max(start + 1, saved.end)) : last
  const change = (window: TimeWindow) => {
    const a = Math.max(0, Math.min(Math.max(0, last - 1), Math.round(window.start)))
    const b = Math.max(Math.min(last, a + 1), Math.min(last, Math.round(window.end)))
    setSaved({ key, start: a, end: b })
  }
  return { start, end, change }
}

export default function ChartTimeRange({ sessions, values, start, end, onChange }: {
  sessions: readonly string[]; values: readonly number[]; start: number; end: number
  onChange: (window: TimeWindow) => void
}) {
  const drag = useRef<{ mode: string; x: number; start: number; end: number; width: number } | null>(null)
  if (sessions.length < 2) return null
  const last = sessions.length - 1
  const x = (i: number) => i / last * 100
  const finite = values.filter(Number.isFinite)
  const low = Math.min(...finite); const high = Math.max(...finite)
  const points = values.map((v, i) => Number.isFinite(v)
    ? `${i / last * 1000},${35 - (v - low) / (high - low || 1) * 28}` : '').filter(Boolean).join(' ')
  const commit = (next: TimeWindow) => onChange(next)
  const move = (offset: number, from = start, to = end) => {
    const step = Math.max(-from, Math.min(last - to, offset))
    commit({ start: from + step, end: to + step })
  }
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const box = event.currentTarget.getBoundingClientRect()
    if (!box.width) return
    event.preventDefault()
    const rangeTarget = (event.target as HTMLElement).closest<HTMLElement>('[data-range-mode]')
    const mode = rangeTarget?.getAttribute('data-range-mode')
    if (mode === 'START' || mode === 'END') rangeTarget?.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!mode) {
      const center = Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * last)
      const nextStart = Math.max(0, Math.min(last - (end - start), center - Math.round((end - start) / 2)))
      commit({ start: nextStart, end: nextStart + end - start })
      drag.current = { mode: 'MOVE', x: event.clientX, start: nextStart, end: nextStart + end - start, width: box.width }
    } else drag.current = { mode, x: event.clientX, start, end, width: box.width }
  }
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const offset = Math.round((event.clientX - d.x) / d.width * last)
    if (d.mode === 'START') commit({ start: Math.max(0, Math.min(d.end - 1, d.start + offset)), end: d.end })
    else if (d.mode === 'END') commit({ start: d.start, end: Math.max(d.start + 1, Math.min(last, d.end + offset)) })
    else move(offset, d.start, d.end)
  }
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keyMove = (event: KeyboardEvent<HTMLButtonElement>, side: 'START' | 'END') => {
    const step = event.key.startsWith('Page') ? Math.max(1, Math.round(last / 10)) : 1
    let next = side === 'START' ? start : end
    if (['ArrowLeft', 'ArrowDown', 'PageDown'].includes(event.key)) next -= step
    else if (['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key)) next += step
    else if (event.key === 'Home') next = side === 'START' ? 0 : start + 1
    else if (event.key === 'End') next = side === 'START' ? end - 1 : last
    else return
    event.preventDefault()
    if (side === 'START') commit({ start: Math.max(0, Math.min(end - 1, next)), end })
    else commit({ start, end: Math.max(start + 1, Math.min(last, next)) })
  }
  const dateChange = (value: string, side: 'START' | 'END') => {
    if (!value) return
    if (side === 'START') {
      // A non-trading start date maps to the first trading day on/after it.
      const i = sessions.findIndex(ds => ds >= value)
      commit({ start: Math.min(end - 1, i < 0 ? last : i), end })
    } else {
      let i = last
      while (i > 0 && sessions[i] > value) i--
      commit({ start, end: Math.max(start + 1, i) })
    }
  }
  const recent = (months: number) => {
    const ds = new Date(`${sessions[last]}T00:00:00Z`)
    ds.setUTCMonth(ds.getUTCMonth() - months)
    const i = sessions.findIndex(s => s >= ds.toISOString().slice(0, 10))
    commit({ start: Math.min(last - 1, Math.max(0, i)), end: last })
  }
  return <section className="chart-time-range" aria-label="时间范围缩放">
    <div className="chart-time-range-track" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
      <svg viewBox="0 0 1000 42" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} /></svg>
      <div className="chart-time-range-mask" style={{ left: 0, width: `${x(start)}%` }} />
      <div className="chart-time-range-mask" style={{ left: `${x(end)}%`, right: 0 }} />
      <div className="chart-time-range-selection" data-range-mode="MOVE" style={{ left: `${x(start)}%`, width: `${x(end) - x(start)}%` }} title="拖动选中区域平移时间范围" />
      <button type="button" role="slider" data-range-mode="START" className="chart-time-range-handle" style={{ left: `${x(start)}%` }} aria-label="时间范围起点" aria-valuemin={0} aria-valuemax={end - 1} aria-valuenow={start} aria-valuetext={sessions[start]} onKeyDown={e => keyMove(e, 'START')}><i /><i /></button>
      <button type="button" role="slider" data-range-mode="END" className="chart-time-range-handle" style={{ left: `${x(end)}%` }} aria-label="时间范围终点" aria-valuemin={start + 1} aria-valuemax={last} aria-valuenow={end} aria-valuetext={sessions[end]} onKeyDown={e => keyMove(e, 'END')}><i /><i /></button>
    </div>
    <div className="chart-time-range-controls">
      <div className="chart-time-range-dates"><label>起始日期<input type="date" aria-label="图表起始日期" min={sessions[0]} max={sessions[Math.max(0, end - 1)]} value={sessions[start]} onInput={e => dateChange(e.currentTarget.value, 'START')} onChange={e => dateChange(e.target.value, 'START')} /></label><span>—</span><label>结束日期<input type="date" aria-label="图表结束日期" min={sessions[Math.min(last, start + 1)]} max={sessions[last]} value={sessions[end]} onInput={e => dateChange(e.currentTarget.value, 'END')} onChange={e => dateChange(e.target.value, 'END')} /></label><small>{end - start + 1}个交易日</small></div>
      <div className="chart-time-range-shortcuts"><button type="button" onClick={() => recent(3)}>近3个月</button><button type="button" onClick={() => recent(12)}>近1年</button><button type="button" disabled={start === 0 && end === last} onClick={() => commit({ start: 0, end: last })}>恢复全区间</button></div>
    </div>
    <p className="chart-time-range-help">拖动两端放大时间段，拖动中间平移；仅缩放显示，收益与回撤保持原账户口径。</p>
  </section>
}
