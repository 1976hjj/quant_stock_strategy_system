type Observation = { session: string; ratio: number }
type Props = {
  observations?: Observation[]
  latest: { session: string; ratio: number; moving_average: number; deviation: number }
  maSessions: number
}

const cuts = [0, .1, .25, .5, .75, .9, 1]
const colors = ['#b6cee8', '#8fbacb', '#b6cdb4', '#dbcf9b', '#dfb385', '#d79384']

function quantile(values: number[], probability: number) {
  const position = probability * (values.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return values[lower] + (values[upper] - values[lower]) * (position - lower)
}

function percentile(values: number[], value: number) {
  if (value < values[0]) return 0
  if (value > values[values.length - 1]) return 100
  if (values[0] === values[values.length - 1]) return 50
  const upper = values.findIndex(sample => sample >= value)
  if (upper < 0) return 100
  if (values[upper] === value) return (upper + values.lastIndexOf(value)) / 2 / (values.length - 1) * 100
  if (upper === 0) return 0
  const fraction = (value - values[upper - 1]) / (values[upper] - values[upper - 1])
  return (upper - 1 + fraction) / (values.length - 1) * 100
}

export function RatioHistoryPosition({ observations, latest, maSessions }: Props) {
  const history = (observations || []).filter(row => row.session <= latest.session && Number.isFinite(row.ratio) && row.ratio > 0)
    .sort((a, b) => a.session.localeCompare(b.session))
  const values = history.map(row => row.ratio).sort((a, b) => a - b)
  if (values.length < 2 || history.at(-1)?.session !== latest.session) {
    return <div className="qs-ratio-history"><b>当前比值 {latest.ratio.toFixed(4)} · 均线 {latest.moving_average.toFixed(4)}</b><p>历史分位数据不足，重新回测后显示分位图。</p></div>
  }
  const currentPercentile = percentile(values, latest.ratio)
  const meanPercentile = percentile(values, latest.moving_average)
  const minimum = history.find(row => row.ratio === values[0])!
  const maximum = history.find(row => row.ratio === values[values.length - 1])!
  const positionLabel = currentPercentile <= 25 ? '较低分位' : currentPercentile >= 75 ? '较高分位' : '中间分位'
  return <section className="qs-ratio-history" aria-label="比值历史分位图">
    <div className="qs-ratio-history-heading"><div><h4>比值历史位置</h4><small>{history[0].session} → {latest.session} · {history.length.toLocaleString()}个交易日</small></div>
      <strong>当前 P{currentPercentile.toFixed(1)} <span>· {positionLabel}</span></strong></div>
    <div className="qs-ratio-history-track-area">
      <div className="qs-ratio-current-label" style={{ left: `${Math.max(9, Math.min(91, currentPercentile))}%` }}>当前 {latest.ratio.toFixed(4)}</div>
      <div className="qs-ratio-history-track" role="img" aria-label={`当前比值${latest.ratio.toFixed(4)}，历史百分位${currentPercentile.toFixed(1)}%，历史最低${minimum.ratio.toFixed(4)}，最高${maximum.ratio.toFixed(4)}`}>
        {cuts.slice(0, -1).map((cut, index) => <span key={cut} className="qs-ratio-percentile-band" style={{ width: `${(cuts[index + 1] - cut) * 100}%`, background: colors[index] }} title={`P${cut * 100}—P${cuts[index + 1] * 100}：${quantile(values, cut).toFixed(4)}—${quantile(values, cuts[index + 1]).toFixed(4)}`} />)}
        <i className="qs-ratio-current-marker" style={{ left: `${currentPercentile}%` }} title={`当前 P${currentPercentile.toFixed(1)}`} />
        <i className="qs-ratio-mean-marker" style={{ left: `${meanPercentile}%` }} title={`${maSessions}日均线 ${latest.moving_average.toFixed(4)} · P${meanPercentile.toFixed(1)}`} />
      </div>
      <div className="qs-ratio-history-ticks">{cuts.map((cut, index) => <div key={cut} className={index === 1 || index === 5 ? 'minor' : ''}
        style={{ left: `${cut * 100}%`, transform: index === 0 ? 'none' : index === cuts.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>
        <b>{index === 0 ? '最低' : index === cuts.length - 1 ? '最高' : `P${cut * 100}`}</b><span>{quantile(values, cut).toFixed(4)}</span></div>)}</div>
    </div>
    <div className="qs-ratio-history-facts">
      <div><small>当前比值 · {latest.session}</small><b>{latest.ratio.toFixed(4)}</b></div>
      <div><small><i className="qs-ratio-mean-key" />{maSessions}日均线 · P{meanPercentile.toFixed(1)}</small><b>{latest.moving_average.toFixed(4)}</b></div>
      <div><small>历史最低 · {minimum.session}</small><b>{minimum.ratio.toFixed(4)}</b></div>
      <div><small>历史最高 · {maximum.session}</small><b>{maximum.ratio.toFixed(4)}</b></div>
    </div>
    <p>横轴为本次回测的历史分位，P50为中位数。颜色表示比值所处分位，轮动信号仍按均线与缓冲带判断。</p>
  </section>
}
