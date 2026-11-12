import './style-rotation.css'
import { nextPublishedTradingSession } from './tradingCalendar2026'
import { RatioHistoryPosition } from './RatioHistoryPosition'

export type RatioParameters = {
  data_mode: 'INDEX_PROXY' | 'ETF'
  ma_sessions: number
  buffer_fraction: number
  commission_bps: number
  slippage_bps: number
  minimum_commission: number
}

export const DEFAULT_RATIO: RatioParameters = {
  data_mode: 'INDEX_PROXY', ma_sessions: 20, buffer_fraction: .015,
  commission_bps: 2, slippage_bps: 2, minimum_commission: 5,
}

type RatioObservation = {
  session: string; ratio: number; moving_average: number; deviation: number
  state: 'CASH' | 'GROWTH' | 'DIVIDEND'
}

export type RatioResult = {
  parameters: RatioParameters; market_as_of: string
  current_state: RatioObservation['state']; latest: RatioObservation
  switches: Array<{ signal_date: string; from_state: string; to_state: string; deviation: number }>
  observations?: RatioObservation[]
  next_signal?: {
    signal_date: string; execution_date: string | null; target_state: string; actual_state: string | null
    action: 'HOLD' | 'ENTER' | 'SWITCH' | 'COMPLETE_SWITCH' | 'CHECK_HOLDINGS'
    target_etf: string | null; execution_basis: 'NEXT_OPEN' | 'NEXT_CLOSE_SIMULATION'
    deviation: number; buffer_fraction: number
  }
}

export function ratioValidation(value: RatioParameters) {
  if (!Number.isInteger(value.ma_sessions) || value.ma_sessions < 2 || value.ma_sessions > 250) return '均线周期应为2至250个交易日的整数。'
  if (!Number.isFinite(value.buffer_fraction) || value.buffer_fraction < 0 || value.buffer_fraction > .2) return '缓冲带应在0%至20%之间。'
  if (!Number.isFinite(value.commission_bps) || value.commission_bps < 0 || value.commission_bps > 100) return '单边手续费应在万0至万100之间。'
  if (!Number.isFinite(value.slippage_bps) || value.slippage_bps < 0 || value.slippage_bps > 100) return '单边滑点应在万0至万100之间。'
  if (!Number.isFinite(value.minimum_commission) || value.minimum_commission < 0 || value.minimum_commission > 1000) return '最低佣金应在0至1000元之间。'
  return ''
}

const stateName = (value: string) => value === 'GROWTH' ? '创业板' : value === 'DIVIDEND' ? '红利低波' : '空仓待信号'
const pct = (value: number) => `${(value * 100).toFixed(2)}%`

type AccountDay = { session: string; pending_execution?: boolean; holdings?: Array<{ ts_code: string; quantity?: number; market_value_cny?: number }> }

export function RatioNextSignal({ result, accountDay }: { result: RatioResult; accountDay?: AccountDay }) {
  const latest = result.latest
  const holdings = accountDay && latest && accountDay.session === latest.session ? accountDay.holdings : undefined
  const styles = new Set(holdings?.filter(h => (h.quantity || h.market_value_cny || 0) > 0).map(h =>
    ['159915.SZ', '399606.SZ'].includes(h.ts_code) ? 'GROWTH' : ['563020.SH', 'H20269.CSI'].includes(h.ts_code) ? 'DIVIDEND' : 'UNKNOWN'))
  const actualState = holdings == null ? null : styles.size > 1 ? 'MIXED' : styles.size === 0 ? 'CASH' : [...styles][0]
  const target = latest?.state || result.current_state
  const action = !actualState || actualState === 'UNKNOWN' ? 'CHECK_HOLDINGS' : actualState === 'MIXED' || accountDay?.pending_execution ? 'COMPLETE_SWITCH' : actualState === target ? 'HOLD' : actualState === 'CASH' ? 'ENTER' : 'SWITCH'
  const plan: NonNullable<RatioResult['next_signal']> = result.next_signal || {
    signal_date: latest?.session || '', execution_date: null, target_state: target, actual_state: actualState,
    action, target_etf: target === 'GROWTH' ? '159915.SZ' : target === 'DIVIDEND' ? '563020.SH' : null,
    execution_basis: result.parameters?.data_mode === 'ETF' ? 'NEXT_OPEN' : 'NEXT_CLOSE_SIMULATION',
    deviation: latest?.deviation || 0, buffer_fraction: result.parameters?.buffer_fraction || 0,
  }
  const executionDate = plan.execution_date || nextPublishedTradingSession(plan.signal_date)
  const actionLabel = { HOLD: '继续持有，无需切换', ENTER: '待建仓', SWITCH: '待切换',
    COMPLETE_SWITCH: '待完成调仓', CHECK_HOLDINGS: '需核对账户持仓' }[plan.action]
  const actual = plan.actual_state === 'MIXED' ? '共同持仓' : plan.actual_state === 'UNKNOWN' || !plan.actual_state ? '持仓待核对' : stateName(plan.actual_state)
  const inBand = Math.abs(plan.deviation) <= plan.buffer_fraction
  return <section className="qs-ratio-next-signal" aria-label="下一交易日信号">
    <div className="qs-style-heading"><h3>下一交易日信号</h3><strong>{actionLabel}</strong></div>
    <div className="qs-style-stats">
      <div><small>信号日期 · 收盘确认</small><b>{plan.signal_date}</b></div>
      <div><small>{plan.execution_basis === 'NEXT_OPEN' ? '下一交易日 · 开盘执行' : '下一交易日 · 收盘模拟'}</small><b>{executionDate || '待交易日历更新'}</b></div>
      <div><small>目标持仓</small><b>{stateName(plan.target_state)}</b>{plan.target_etf && <span>{plan.execution_basis === 'NEXT_OPEN' ? '' : '对应ETF '}{plan.target_etf}</span>}</div>
    </div>
    <p>回测实际持仓：{actual}。比值距均线 {pct(plan.deviation)}，缓冲带 ±{pct(plan.buffer_fraction)}。{inBand ? '处于缓冲带内，沿用此前信号。' : plan.deviation > 0 ? '比值高于上缓冲，目标为创业板。' : '比值低于下缓冲，目标为红利低波。'}</p>
    {plan.action === 'SWITCH' && <p>计划由{actual}转向{stateName(plan.target_state)}，先卖出原持仓，再买入目标ETF。</p>}
    {plan.action === 'COMPLETE_SWITCH' && <p>账户仍有待完成的调仓，成交前按现有实际持仓记录。</p>}
    <small>计划基于本次回测截至日，使用本次保存的参数。实际ETF按下一交易日开盘执行，成交以委托结果为准。</small>
  </section>
}

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
      <label>单边手续费（万分之）<input aria-label="比值单边手续费" type="number" min="0" max="100" step="0.1" value={value.commission_bps} onChange={e => onChange({ ...value, commission_bps: Number(e.target.value) })} /><small>填2表示万二，即0.02%；买卖分别收取。</small></label>
      <label>单边滑点（万分之）<input aria-label="比值单边滑点" type="number" min="0" max="100" step="0.1" value={value.slippage_bps} onChange={e => onChange({ ...value, slippage_bps: Number(e.target.value) })} /><small>默认万二，买入价上调、卖出价下调；填0关闭。</small></label>
      {value.data_mode === 'ETF' && <label>每笔最低佣金（元）<input aria-label="比值最低佣金" type="number" min="0" max="1000" step="1" value={value.minimum_commission} onChange={e => onChange({ ...value, minimum_commission: Number(e.target.value) })} /><small>默认5元；免最低佣金可填0。</small></label>}
    </div>
    <p>默认20日均线、上下各1.5%。每次回测空仓开始，均线读取开始日前的历史预热；首次突破后在下一交易日执行，同方向信号持续持有。</p>
    {value.data_mode === 'INDEX_PROXY'
      ? <p>指数代理按创业板／红利低波全收益指数计价，次日收盘切换；手续费与滑点采用上方参数，不设最低佣金。另计年化模型持有费0.20%，模拟份额可为小数。</p>
      : <p>实际交易创业板ETF 159915与红利低波ETF 563020，次日开盘执行，按100份、T+1及上方费用参数计算。非零滑点按0.001元报价档位向不利方向取整，实际幅度可能高于填写比例；滑点0按开盘价成交。每日成交额参与比例上限已关闭。</p>}
    <small>当前口径数据截至{dataEnd || '待更新'}。在数据管理的“日行情与估值”和“指数与策略基准”更新。参数按策略保存在当前浏览器；修改后点击回测按钮生效。</small>
  </section>
}

export function RatioRotationResults({ result, draft }: { result?: RatioResult; draft: RatioParameters }) {
  if (!result) return null
  const latest = result.latest
  return <section className="qs-style-results" aria-label="比值轮动信号与切换明细">
    <p>本次结果采用{result.parameters.data_mode === 'ETF' ? '159915／563020实际ETF' : '指数代理'}，{result.parameters.ma_sessions}日均线，±{pct(result.parameters.buffer_fraction)}缓冲带。信号截至{latest.session}，数据截至{result.market_as_of}。</p>
    <p>{result.parameters.commission_bps == null
      ? `历史结果费用：${result.parameters.data_mode === 'ETF' ? '单边万五、最低5元，至少一档不利滑点' : '单边万十、滑点0，年化模型持有费0.20%'}。`
      : `本次费用：单边手续费万${result.parameters.commission_bps}，滑点万${result.parameters.slippage_bps}${result.parameters.data_mode === 'ETF' ? `，每笔最低佣金${result.parameters.minimum_commission}元，非零滑点按报价档位取整` : '，另计年化模型持有费0.20%'}。`}</p>
    {JSON.stringify(result.parameters) !== JSON.stringify(draft) && <p className="qs-warning">参数已修改，当前曲线仍为上次回测结果，重新运行后更新。</p>}
    <RatioHistoryPosition observations={result.observations} latest={latest} maSessions={result.parameters.ma_sessions} />
    <details><summary>查看全部信号切换（{result.switches.length}次）</summary><div className="qs-table-scroll"><table><thead><tr><th>收盘信号日</th><th>切换方向</th><th>比值距均线</th></tr></thead><tbody>{result.switches.map(row => <tr key={row.signal_date}><td>{row.signal_date}</td><td>{stateName(row.from_state)} → {stateName(row.to_state)}</td><td>{pct(row.deviation)}</td></tr>)}</tbody></table></div></details>
    <small>切换表记录收盘信号，末日新信号在后续交易日执行；逐日持仓、成交和收益来自本次同一账户。</small>
  </section>
}
