import './style-rotation.css'

export type RatioParameters = {
  data_mode: 'INDEX_PROXY' | 'ETF'
  ma_sessions: number
  buffer_fraction: number
}

export const DEFAULT_RATIO: RatioParameters = {
  data_mode: 'INDEX_PROXY', ma_sessions: 20, buffer_fraction: .015,
}

type RatioObservation = {
  session: string; ratio: number; moving_average: number; deviation: number
  state: 'CASH' | 'GROWTH' | 'DIVIDEND'
}

export type RatioResult = {
  parameters: RatioParameters; market_as_of: string
  current_state: RatioObservation['state']; latest: RatioObservation
  switches: Array<{ signal_date: string; from_state: string; to_state: string; deviation: number }>
}

export function ratioValidation(value: RatioParameters) {
  if (!Number.isInteger(value.ma_sessions) || value.ma_sessions < 2 || value.ma_sessions > 250) return '均线周期应为2至250个交易日的整数。'
  if (!Number.isFinite(value.buffer_fraction) || value.buffer_fraction < 0 || value.buffer_fraction > .2) return '缓冲带应在0%至20%之间。'
  return ''
}

const stateName = (value: string) => value === 'GROWTH' ? '创业板' : value === 'DIVIDEND' ? '红利低波' : '空仓待信号'
const pct = (value: number) => `${(value * 100).toFixed(2)}%`

export function RatioRotationControls({ value, onChange, dataEnd }: {
  value: RatioParameters; onChange: (value: RatioParameters) => void; dataEnd?: string
}) {
  return <section className="qs-style-controls" aria-label="创业板红利低波比值参数">
    <div className="qs-style-heading"><h3>比值轮动参数</h3><button type="button" onClick={() => onChange({ ...DEFAULT_RATIO })}>恢复研究默认值</button></div>
    <p>比值＝创业板价格指数399006 ÷ 红利低波价格指数H30269。突破均线上缓冲切向创业板，跌破下缓冲切向红利低波；缓冲带内保留原状态。</p>
    <div className="qs-inputs">
      <label>回测数据口径<select aria-label="比值回测数据口径" value={value.data_mode} onChange={e => onChange({ ...value, data_mode: e.target.value as RatioParameters['data_mode'] })}>
        <option value="INDEX_PROXY">指数代理 · 支持2016年起</option><option value="ETF">实际ETF · 支持2024年起</option>
      </select></label>
      <label>均线周期（交易日）<input aria-label="比值均线周期" type="number" min="2" max="250" step="1" value={value.ma_sessions} onChange={e => onChange({ ...value, ma_sessions: Number(e.target.value) })} /></label>
      <label>上下缓冲带（%）<input aria-label="比值缓冲带" type="number" min="0" max="20" step="0.1" value={Number((value.buffer_fraction * 100).toFixed(6))} onChange={e => onChange({ ...value, buffer_fraction: Number(e.target.value) / 100 })} /></label>
    </div>
    <p>默认20日均线、上下各1.5%。每次回测空仓开始，均线读取开始日前的历史预热；首次突破后在下一交易日执行，同方向信号持续持有。</p>
    {value.data_mode === 'INDEX_PROXY'
      ? <p>指数代理按创业板／红利低波全收益指数计价，次日收盘切换；单边费用10bp、年化模型持有费0.20%，模拟份额可为小数。</p>
      : <p>实际交易创业板ETF 159915与红利低波ETF 563020，次日开盘执行，按100份、T+1、单边5bp最低5元及一档不利滑点计算。每日成交额参与比例上限已关闭，按账户可用资金执行换仓。</p>}
    <small>当前口径数据截至{dataEnd || '待更新'}。在数据管理的“日行情与估值”和“指数与策略基准”更新。参数按策略保存在当前浏览器；修改后点击回测按钮生效。</small>
  </section>
}

export function RatioRotationResults({ result, draft }: { result?: RatioResult; draft: RatioParameters }) {
  if (!result) return null
  const latest = result.latest
  return <section className="qs-style-results" aria-label="比值轮动信号与切换明细">
    <h3>比值轮动信号与切换明细</h3>
    <div className="qs-style-stats"><div><small>末日收盘信号</small><b>{stateName(result.current_state)}</b></div><div><small>比值距均线</small><b>{pct(latest.deviation)}</b></div><div><small>信号切换</small><b>{result.switches.length}次</b></div></div>
    <p>本次结果采用{result.parameters.data_mode === 'ETF' ? '159915／563020实际ETF' : '指数代理'}，{result.parameters.ma_sessions}日均线，±{pct(result.parameters.buffer_fraction)}缓冲带。信号截至{latest.session}，数据截至{result.market_as_of}。</p>
    {JSON.stringify(result.parameters) !== JSON.stringify(draft) && <p className="qs-warning">参数已修改，当前曲线仍为上次回测结果，重新运行后更新。</p>}
    <p>末日比值{latest.ratio.toFixed(4)}，均线{latest.moving_average.toFixed(4)}。实际仓位以曲线下方最新明细为准。</p>
    <details><summary>查看全部信号切换（{result.switches.length}次）</summary><div className="qs-table-scroll"><table><thead><tr><th>收盘信号日</th><th>切换方向</th><th>比值距均线</th></tr></thead><tbody>{result.switches.map(row => <tr key={row.signal_date}><td>{row.signal_date}</td><td>{stateName(row.from_state)} → {stateName(row.to_state)}</td><td>{pct(row.deviation)}</td></tr>)}</tbody></table></div></details>
    <small>切换表记录收盘信号，末日新信号在后续交易日执行；逐日持仓、成交和收益来自本次同一账户。</small>
  </section>
}
