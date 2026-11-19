import './style-rotation.css'
import { nextPublishedTradingSession } from './tradingCalendar2026'
import { RatioHistoryPosition } from './RatioHistoryPosition'
import { RatioTriggerReference } from './RatioTriggerReference'

export type RatioParameters = {
  data_mode: 'INDEX_PROXY' | 'ETF' | 'ETF_STOCK'
  signal_basis?: 'INDEX_PRICE' | 'ETF_PRICE' | 'STAR_ETF_PRICE'
  defensive_asset?: 'DIVIDEND_INDEX' | 'WEALTH' | 'WEALTH_3PCT'
  defensive_annual_rate?: number | null
  stock_weight: number
  ma_sessions: number
  buffer_fraction: number
  commission_bps: number
  slippage_bps: number
  minimum_commission: number
  execution_model?: 'SAME_CLOSE_FIXED' | 'LEGACY_NEXT_SESSION'
  etf_slippage_cny?: number
  stock_slippage_cny?: number
  hold_low_chinext?: boolean
  hold_ratio_percentile?: number
  hold_price_cny?: number
}

export const DEFAULT_RATIO: RatioParameters = {
  data_mode: 'INDEX_PROXY', signal_basis: 'INDEX_PRICE', ma_sessions: 40, buffer_fraction: .025,
  commission_bps: 2, slippage_bps: 2, minimum_commission: 5, stock_weight: .25,
  execution_model: 'SAME_CLOSE_FIXED', etf_slippage_cny: .002, stock_slippage_cny: .02,
}

export const ratioUsesClose = (p?: RatioParameters) => p?.data_mode !== 'INDEX_PROXY' && p?.execution_model === 'SAME_CLOSE_FIXED'
export const ratioGrowthName = (p?: RatioParameters) => p?.signal_basis === 'STAR_ETF_PRICE' ? '科创50' : '创业板'
const DEFAULT_WEALTH_RATE = .01
export const ratioUsesWealth = (p?: RatioParameters) => p?.defensive_asset === 'WEALTH' || p?.defensive_asset === 'WEALTH_3PCT'
export const ratioWealthRate = (p?: RatioParameters) => p?.defensive_asset === 'WEALTH_3PCT' ? .03 : p?.defensive_annual_rate ?? DEFAULT_WEALTH_RATE
export const formatRatioWealthRate = (rate: number) => `${(rate * 100).toLocaleString('zh-CN', { maximumFractionDigits: 8, useGrouping: false })}%`
const defensiveName = (p?: RatioParameters) => ratioUsesWealth(p) ? `理财（年化${formatRatioWealthRate(ratioWealthRate(p))}）` : '红利低波'
export const ratioSignalName = (p?: RatioParameters) => p?.signal_basis === 'STAR_ETF_PRICE' ? '科创50ETF价格比值588000／512890' : p?.signal_basis === 'ETF_PRICE' ? 'ETF价格比值159915／512890' : '价格指数比值399006／H30269'
export const RATIO_REFERENCES = {
  INDEX_PRICE: { ma_sessions: 40, buffer_fraction: .025 },
  ETF_PRICE: { ma_sessions: 40, buffer_fraction: .02 },
  STAR_ETF_PRICE: { ma_sessions: 25, buffer_fraction: .05 },
} as const
export const INDEX_PROXY_MIN_START = '2014-01-02'
export function ratioMinimumStart(p: RatioParameters) {
  if (p.signal_basis === 'STAR_ETF_PRICE') return p.stock_weight > 0 ? '2021-03-31' : '2020-11-16'
  const start = p.data_mode === 'ETF_STOCK' ? p.stock_weight === 0 ? '2019-01-18' : '2019-08-30' : p.data_mode === 'ETF' ? '2024-01-02' : INDEX_PROXY_MIN_START
  return p.signal_basis === 'ETF_PRICE' && start < '2019-01-18' ? '2019-01-18' : start
}
export function ratioDraft(...layers: Array<Partial<RatioParameters> | undefined>): RatioParameters {
  // Old basis-point settings stay in the recorded result. They must never
  // become yuan amounts, or replace the new fixed-yuan draft defaults.
  const merged = Object.assign({}, DEFAULT_RATIO, ...layers)
  if (merged.defensive_asset === 'WEALTH_3PCT') {
    merged.defensive_asset = 'WEALTH'
    merged.defensive_annual_rate = DEFAULT_WEALTH_RATE
  }
  const recorded = layers.filter(layer => layer != null).at(-1)
  const upgrade = recorded && recorded.signal_basis == null ? { ma_sessions: 40, buffer_fraction: .025 } : {}
  return { ...merged, ...upgrade, execution_model: 'SAME_CLOSE_FIXED',
    etf_slippage_cny: merged.etf_slippage_cny ?? .002, stock_slippage_cny: merged.stock_slippage_cny ?? .02 }
}

type RatioObservation = {
  session: string; ratio: number; moving_average: number; deviation: number
  state: 'CASH' | 'GROWTH' | 'DIVIDEND'
  low_hold_active?: boolean
  history_percentile?: number | null
  growth_close?: number
}

export type RatioResult = {
  parameters: RatioParameters; market_as_of: string
  current_state: RatioObservation['state']; latest: RatioObservation
  switches: Array<{ signal_date: string; from_state: string; to_state: string; deviation: number }>
  observations?: RatioObservation[]
  defensive_etf?: string
  stock_selection?: { factor: string; input_version: string; input_end: string; records: Array<{ signal_date: string; style: string; stock_ts_code: string; security_name?: string; factor_value: number; eligible: number; basket_source: string; report_date: string; ann_date: string }> }
  next_signal?: {
    signal_date: string; execution_date: string | null; target_state: string; actual_state: string | null
    action: 'HOLD' | 'ENTER' | 'SWITCH' | 'COMPLETE_SWITCH' | 'CHECK_HOLDINGS'
    target_etf: string | null; execution_basis: 'NEXT_OPEN' | 'NEXT_CLOSE_SIMULATION' | 'SAME_CLOSE_FIXED'
    target_stock?: string | null; target_stock_name?: string; stock_target_weight?: number; selection_signal_date?: string | null
    deviation: number; buffer_fraction: number
  }
  execution_assumption?: string
}

export function ratioValidation(value: RatioParameters) {
  if (ratioUsesWealth(value)) {
    if (value.data_mode !== 'INDEX_PROXY' || (value.signal_basis ?? 'INDEX_PRICE') !== 'INDEX_PRICE') return '理财口径使用指数比值与指数代理账户。'
    if (value.defensive_annual_rate === null || !Number.isFinite(ratioWealthRate(value)) || ratioWealthRate(value) <= -1) return '请填写大于-100%的理财年化收益率。'
  }
  if (value.hold_low_chinext) {
    if (value.signal_basis !== 'ETF_PRICE' || value.data_mode !== 'ETF_STOCK' || value.stock_weight !== 0) return '双低持有口径使用159915／512890纯ETF。'
    const rank = value.hold_ratio_percentile ?? 10
    const price = value.hold_price_cny ?? 2
    if (!Number.isFinite(rank) || rank <= 0 || rank > 100) return '持有最低比值应大于0%、且不超过100%。'
    if (!Number.isFinite(price) || price <= 0) return '持有最低价格应大于0元。'
  }
  if (value.signal_basis === 'STAR_ETF_PRICE' && value.data_mode !== 'ETF_STOCK') return '科创50／红利比值使用588000／512890的ETF＋单股口径。'
  if (value.data_mode === 'ETF_STOCK' && (!Number.isFinite(value.stock_weight) || value.stock_weight < 0 || value.stock_weight > 1)) return '单股目标比例应在0%至100%之间。'
  if (!Number.isInteger(value.ma_sessions) || value.ma_sessions < 2 || value.ma_sessions > 250) return '均线周期应为2至250个交易日的整数。'
  if (!Number.isFinite(value.buffer_fraction) || value.buffer_fraction < 0 || value.buffer_fraction > .2) return '缓冲带应在0%至20%之间。'
  if (!Number.isFinite(value.commission_bps) || value.commission_bps < 0 || value.commission_bps > 100) return '单边手续费应在万0至万100之间。'
  if (value.data_mode !== 'INDEX_PROXY') {
    for (const [name, gap, tick] of [['ETF', value.etf_slippage_cny, .001], ['股票', value.stock_slippage_cny, .01]] as const) {
      if (!Number.isFinite(gap) || gap == null || gap < 0 || gap > 100 || Math.abs(gap / tick - Math.round(gap / tick)) > 1e-7) return `${name}价差须为0至100元，且为${tick}元的整数倍。`
    }
  }
  if (!Number.isFinite(value.minimum_commission) || value.minimum_commission < 0 || value.minimum_commission > 1000) return '最低佣金应在0至1000元之间。'
  return ''
}

export function ratioParametersEqual(left: RatioParameters, right: RatioParameters) {
  const key = (p: RatioParameters) => [p.data_mode, p.ma_sessions, p.buffer_fraction, p.commission_bps,
    p.signal_basis ?? 'INDEX_PRICE',
    ratioUsesWealth(p) ? ratioWealthRate(p) : null,
    ratioUsesClose(p) ? ['SAME_CLOSE_FIXED', p.etf_slippage_cny ?? .002, p.data_mode === 'ETF_STOCK' ? p.stock_slippage_cny ?? .02 : null] : ['LEGACY_NEXT_SESSION', p.slippage_bps],
    p.minimum_commission, p.data_mode === 'ETF_STOCK' ? p.stock_weight ?? .25 : null,
    p.hold_low_chinext ? [p.hold_ratio_percentile ?? 10, p.hold_price_cny ?? 2] : null]
  return JSON.stringify(key(left)) === JSON.stringify(key(right))
}

const stateName = (value: string, parameters?: RatioParameters) => value === 'GROWTH' ? ratioGrowthName(parameters) : value === 'DIVIDEND' ? defensiveName(parameters) : '空仓待信号'
const pct = (value: number) => `${(value * 100).toFixed(2)}%`

type AccountDay = { session: string; pending_execution?: boolean; defensive_cash_active?: boolean; holdings?: Array<{ rotation_style?: string; ts_code: string; quantity?: number; market_value_cny?: number }> }

export function RatioNextSignal({ result, accountDay, strategyId }: { result: RatioResult; accountDay?: AccountDay; strategyId?: string }) {
  const name = (state: string) => stateName(state, result.parameters)
  const latest = result.latest
  const wealth = ratioUsesWealth(result.parameters)
  const recordedDay = accountDay?.session === latest?.session ? accountDay : undefined
  const holdings = recordedDay?.holdings
  const styles = new Set(holdings?.filter(h => (h.quantity || h.market_value_cny || 0) > 0).map(h =>
    h.rotation_style === 'GROWTH' || ['159915.SZ', '588000.SH', '399606.SZ'].includes(h.ts_code) ? 'GROWTH' : h.rotation_style === 'DIVIDEND' || ['563020.SH', '512890.SH', 'H20269.CSI'].includes(h.ts_code) ? 'DIVIDEND' : 'UNKNOWN'))
  const actualState = wealth && recordedDay?.defensive_cash_active ? 'DIVIDEND' : holdings == null ? null : styles.size > 1 ? 'MIXED' : styles.size === 0 ? 'CASH' : [...styles][0]
  const target = latest?.state || result.current_state
  const action = !actualState || actualState === 'UNKNOWN' ? 'CHECK_HOLDINGS' : actualState === 'MIXED' || accountDay?.pending_execution ? 'COMPLETE_SWITCH' : actualState === target ? 'HOLD' : actualState === 'CASH' ? 'ENTER' : 'SWITCH'
  const plan: NonNullable<RatioResult['next_signal']> = result.next_signal || {
    signal_date: latest?.session || '', execution_date: null, target_state: target, actual_state: actualState,
    action, target_etf: wealth ? null : target === 'GROWTH' ? result.parameters.signal_basis === 'STAR_ETF_PRICE' ? '588000.SH' : '159915.SZ' : target === 'DIVIDEND' ? result.defensive_etf || (result.parameters.data_mode === 'ETF_STOCK' ? '512890.SH' : '563020.SH') : null,
    execution_basis: ratioUsesClose(result.parameters) ? 'SAME_CLOSE_FIXED' : result.parameters?.data_mode === 'ETF' || result.parameters?.data_mode === 'ETF_STOCK' ? 'NEXT_OPEN' : 'NEXT_CLOSE_SIMULATION',
    deviation: latest?.deviation || 0, buffer_fraction: result.parameters?.buffer_fraction || 0,
  }
  const executionDate = plan.execution_date || nextPublishedTradingSession(plan.signal_date)
  const actionLabel = { HOLD: '继续持有，无需切换', ENTER: '待建仓', SWITCH: '待切换',
    COMPLETE_SWITCH: '待完成调仓', CHECK_HOLDINGS: '需核对账户持仓' }[plan.action]
  const actual = plan.actual_state === 'MIXED' ? '共同持仓' : plan.actual_state === 'UNKNOWN' || !plan.actual_state ? '持仓待核对' : name(plan.actual_state)
  const inBand = Math.abs(plan.deviation) <= plan.buffer_fraction
  const closeModel = plan.execution_basis === 'SAME_CLOSE_FIXED'
  const lowHold = result.parameters?.hold_low_chinext
  return <section className="qs-ratio-next-signal" aria-label="下一交易日信号">
    <div className="qs-style-heading"><h3>{closeModel ? '收盘目标与下一日参考' : '下一交易日信号'}</h3><strong>{actionLabel}</strong></div>
    <div className="qs-style-stats">
      <div><small>信号日期 · 收盘确认</small><b>{plan.signal_date}</b></div>
      <div><small>{closeModel ? '下一交易日 · 盘中重新观察' : plan.execution_basis === 'NEXT_OPEN' ? '下一交易日 · 开盘执行' : '下一交易日 · 收盘模拟'}</small><b>{executionDate || '待交易日历更新'}</b></div>
      <div><small>目标持仓</small><b>{name(plan.target_state)}</b>{plan.target_etf && <span>{plan.execution_basis === 'NEXT_OPEN' ? '' : '对应ETF '}{plan.target_etf}</span>}{plan.target_stock && <span>单股 {plan.target_stock_name || '名称未记录'}（{plan.target_stock}）· 目标 {pct(plan.stock_target_weight || 0)}</span>}</div>
    </div>
    <p>回测实际持仓：{actual}。比值距均线 {pct(plan.deviation)}，缓冲带 ±{pct(plan.buffer_fraction)}。{lowHold ? '' : inBand ? '处于缓冲带内，沿用此前信号。' : plan.deviation > 0 ? `比值高于上缓冲，目标为${ratioGrowthName(result.parameters)}。` : `比值低于下缓冲，目标为${defensiveName(result.parameters)}。`}</p>
    {lowHold && <p>{latest.low_hold_active ? '双低持有中，目标为创业板。' : '双低持有未激活，按原版的新切换信号处理。'}{latest.growth_close != null && ` 创业板ETF收盘 ${latest.growth_close.toFixed(3)}元。`}{latest.history_percentile != null && ` 比值历史分位 P${latest.history_percentile.toFixed(2)}（自2019年共同历史起算）。`}</p>}
    {plan.action === 'SWITCH' && <p>计划由{actual}转向{name(plan.target_state)}，{wealth ? '按下一交易日收盘模拟转换。' : `先卖出原持仓，再买入目标${result.parameters?.data_mode === 'ETF_STOCK' && result.parameters.stock_weight > 0 ? 'ETF与单股组合' : 'ETF'}。`}</p>}
    {plan.action === 'COMPLETE_SWITCH' && <p>账户仍有待完成的调仓，成交前按现有实际持仓记录。</p>}
    {!lowHold && !wealth && <RatioTriggerReference strategyId={strategyId} result={result} />}
    {result.parameters?.data_mode === 'ETF_STOCK' && <small>{plan.target_stock ? `该股票选于${plan.selection_signal_date || '最近切换日'}，持有期间不重新排名或恢复固定比例。` : '本次没有单股目标。'}0%为纯ETF，100%为纯单股。</small>}
    <small>{wealth ? '指数代理按下一交易日收盘模拟转换，防守资金按自然日复利。' : closeModel ? '本次按当日最终收盘信号、同日收盘价加减固定价差模拟；上方为已结束交易日的账户与目标，不是下一日提前确认的尾盘信号。尾盘交易前需重新观察当时比值与选股排名，最终收盘前仍可能变化。' : '计划基于本次回测截至日，使用本次保存的参数。实际证券按下一交易日开盘执行，成交以委托结果为准。'}</small>
  </section>
}

export function RatioRotationControls({ value, onChange, dataEnd }: {
  value: RatioParameters; onChange: (value: RatioParameters) => void; dataEnd?: string
}) {
  const star = value.signal_basis === 'STAR_ETF_PRICE'
  const lowHold = value.hold_low_chinext === true
  const wealth = ratioUsesWealth(value)
  const reference = RATIO_REFERENCES[value.signal_basis ?? 'INDEX_PRICE']
  const growth = ratioGrowthName(value)
  return <section className="qs-style-controls qs-ratio-controls" aria-label="创业板红利低波比值参数">
    <div className="qs-style-heading"><h3>比值轮动参数</h3><button type="button" onClick={() => onChange({ ...DEFAULT_RATIO })}>恢复研究默认值</button></div>
    <p>{value.signal_basis !== 'INDEX_PRICE' && value.signal_basis != null ? `比值＝${star ? '588000科创50' : '159915创业板'}ETF收盘价 ÷ 512890红利低波ETF收盘价，按已核验份额拆分保持连续。` : '比值＝创业板价格指数399006 ÷ 红利低波价格指数H30269。'}突破均线上缓冲切向{growth}，跌破下缓冲切向{defensiveName(value)}，缓冲带内保留原状态。</p>
    <div className="qs-ratio-reference" aria-label="比值均衡参数参考"><small>均衡邻域参考 {reference.ma_sessions}日／±{reference.buffer_fraction * 100}% · {star ? '纯ETF历史研究' : '历史研究'}</small><button type="button" onClick={() => onChange({ ...value, ...reference })}>应用参考参数</button></div>
    <div className="qs-inputs">
      <label>信号比值<select aria-label="比值信号来源" value={value.signal_basis ?? 'INDEX_PRICE'} onChange={e => {
        const signal_basis = e.target.value as NonNullable<RatioParameters['signal_basis']>
        const switchMode = signal_basis !== 'INDEX_PRICE' && (value.data_mode !== 'ETF_STOCK' || lowHold)
        onChange({ ...value, signal_basis, hold_low_chinext: false, defensive_asset: signal_basis === 'INDEX_PRICE' ? value.defensive_asset : undefined, ...(switchMode ? { data_mode: 'ETF_STOCK', stock_weight: signal_basis === 'STAR_ETF_PRICE' ? .25 : 0 } : {}) })
      }}>
        <option value="INDEX_PRICE">指数比值 · 399006／H30269</option><option value="ETF_PRICE">创业板ETF比值 · 159915／512890</option><option value="STAR_ETF_PRICE">科创50ETF比值 · 588000／512890</option>
      </select></label>
      <label>回测数据口径<select aria-label="比值回测数据口径" disabled={star} value={lowHold ? 'LOW_HOLD_CHINEXT' : wealth ? 'INDEX_PROXY_WEALTH' : value.data_mode} onChange={e => {
        if (e.target.value === 'INDEX_PROXY_WEALTH') {
          onChange({ ...value, data_mode: 'INDEX_PROXY', signal_basis: 'INDEX_PRICE', hold_low_chinext: false, defensive_asset: 'WEALTH',
            defensive_annual_rate: value.defensive_annual_rate ?? DEFAULT_WEALTH_RATE })
        } else if (e.target.value === 'LOW_HOLD_CHINEXT') {
          onChange({ ...value, data_mode: 'ETF_STOCK', signal_basis: 'ETF_PRICE', stock_weight: 0, hold_low_chinext: true, defensive_asset: undefined,
            hold_ratio_percentile: value.hold_ratio_percentile ?? 10, hold_price_cny: value.hold_price_cny ?? 2 })
        } else {
          onChange({ ...value, data_mode: e.target.value as RatioParameters['data_mode'], hold_low_chinext: false, defensive_asset: undefined })
        }
      }}>
        <option value="INDEX_PROXY">指数代理 · 支持{ratioMinimumStart({ ...value, data_mode: 'INDEX_PROXY' })}起</option><option value="ETF">实际ETF · 支持2024年起</option><option value="ETF_STOCK">{star ? `ETF＋单股 · 588000／512890 · ${ratioMinimumStart(value)}起` : `ETF＋单股 · ${value.stock_weight === 0 ? '纯ETF支持2019-01-18起' : '支持2019-08-30起'}`}</option>
        {!star && <option value="INDEX_PROXY_WEALTH">指数代理 · 防守端理财</option>}
        {!star && <option value="LOW_HOLD_CHINEXT">双低持有创业板 · 解锁后等新信号</option>}
      </select></label>
      {wealth && <label>理财年化收益率（%）<input aria-label="理财年化收益率" type="number" step="any"
        value={value.defensive_annual_rate === null ? '' : Number((ratioWealthRate(value) * 100).toFixed(8))}
        onChange={e => onChange({ ...value, defensive_annual_rate: e.target.value === '' ? null : Number(e.target.value) / 100 })} />
        <small>默认1%。防守期间按自然日复利，填0可模拟不计息。</small></label>}
      {lowHold && <>
        <label>持有最低比值（历史分位%）<input aria-label="持有最低比值" type="number" min="0.1" max="100" step="0.1" value={value.hold_ratio_percentile ?? 10} onChange={e => onChange({ ...value, hold_ratio_percentile: Number(e.target.value) })} /><small>填10即P10，分位使用2019年以来截至当日的共同历史。</small></label>
        <label>持有最低价格（元／份）<input aria-label="持有最低价格" type="number" min="0.001" step="0.001" value={value.hold_price_cny ?? 2} onChange={e => onChange({ ...value, hold_price_cny: Number(e.target.value) })} /><small>使用创业板ETF 159915收盘价。</small></label>
      </>}
      {value.data_mode === 'ETF_STOCK' && !lowHold && <label>单股目标比例（%）<input aria-label="单股目标比例" type="number" min="0" max="100" step="5" value={Number(((value.stock_weight ?? .25) * 100).toFixed(6))} onChange={e => onChange({ ...value, stock_weight: Number(e.target.value) / 100 })} /><small>两端默认股25%＋ETF75%；0%纯ETF，100%纯股。</small></label>}
      <label>均线周期（交易日）<input aria-label="比值均线周期" type="number" min="2" max="250" step="1" value={value.ma_sessions} onChange={e => onChange({ ...value, ma_sessions: Number(e.target.value) })} /></label>
      <label>上下缓冲带（%）<input aria-label="比值缓冲带" type="number" min="0" max="20" step="0.1" value={Number((value.buffer_fraction * 100).toFixed(6))} onChange={e => onChange({ ...value, buffer_fraction: Number(e.target.value) / 100 })} /></label>
      <label>单边手续费（万分之）<input aria-label="比值单边手续费" type="number" min="0" max="100" step="0.1" value={value.commission_bps} onChange={e => onChange({ ...value, commission_bps: Number(e.target.value) })} /><small>填2即万二（0.02%），买卖各收。</small></label>
      {value.data_mode !== 'INDEX_PROXY' && <label>ETF单边价差（元／份）<input aria-label="比值ETF单边价差" type="number" min="0" max="100" step="0.001" value={value.etf_slippage_cny ?? .002} onChange={e => onChange({ ...value, execution_model: 'SAME_CLOSE_FIXED', etf_slippage_cny: Number(e.target.value) })} /><small>默认0.002元；买入加、卖出减；填0关闭。</small></label>}
      {value.data_mode === 'ETF_STOCK' && !lowHold && <label>股票单边价差（元／股）<input aria-label="比值股票单边价差" type="number" min="0" max="100" step="0.01" value={value.stock_slippage_cny ?? .02} onChange={e => onChange({ ...value, execution_model: 'SAME_CLOSE_FIXED', stock_slippage_cny: Number(e.target.value) })} /><small>默认0.02元；买入加、卖出减；填0关闭。</small></label>}
      {value.data_mode !== 'INDEX_PROXY' && <label>每笔最低佣金（元）<input aria-label="比值最低佣金" type="number" min="0" max="1000" step="1" value={value.minimum_commission} onChange={e => onChange({ ...value, minimum_commission: Number(e.target.value) })} /><small>默认5元；填0免最低佣金。</small></label>}
    </div>
    {lowHold && <p>比值分位和创业板ETF收盘价同时低于门槛时，切到并持有创业板ETF。任一条件回到门槛即解锁，当天继续持有，之后等待原版的新切换信号。</p>}
    <p>每次回测空仓开始，均线读取开始日前的历史预热；ETF上市初期等待完整均线与首个突破后入场。{value.data_mode === 'INDEX_PROXY' ? '指数代理按次日收盘模拟' : '按当日收盘信号、同日收盘价加减固定价差模拟'}，同方向信号持续持有。</p>
    {wealth ? <p>成长端按创业板全收益指数计价，保留原交易费用和年化0.20%模型持有费。理财假设可即时进出、零费用。回测开始的待信号资金不计息。</p>
      : value.data_mode === 'INDEX_PROXY'
      ? <p>指数代理仅保留历史对照：全收益指数点位不是ETF每份价格，不能套用固定元价差；仍按次日收盘与历史比例费用模拟。要测试本次尾盘固定价差，请选择实际ETF或ETF＋单股。不设最低佣金，另计年化模型持有费0.20%。</p>
      : value.data_mode === 'ETF_STOCK' && value.stock_weight === 0
      ? <p>实际交易{star ? '588000' : '159915'}与512890，按当日收盘价模拟，保留100份、T+1、停牌和涨跌停约束。纯ETF使用通用ETF行情归档。</p>
      : value.data_mode === 'ETF_STOCK'
      ? <><p>成长端：{star ? '588000＋一只科创板股票' : '159915＋一只创业板股票'}；红利端：512890＋一只红利低波股票。单股按复权收盘价÷近252日复权最高价排名第1选取；使用信号日前已公开的完整ETF持仓池（滞后代理），至少253日完整历史，剔除当时ST及异常证券。{star && '科创端保留披露持仓中科创板股票，按市值取前50只作为候选池。'}</p><p>仅在风格切换时选股、配置，持有中比例自然漂移。按当日收盘价模拟，保留T+1、停牌、涨跌停和整手约束；科创板买入至少200股，之后按1股递增。股票另计印花税、过户费和10%日成交额上限，ETF无此上限。股票分红沿用除息日入账近似，未计个人股息税。</p></>
      : <p>实际交易159915与563020，按当日收盘价模拟，保留100份、T+1、停牌和涨跌停约束；每日成交额参与比例上限已关闭。</p>}
    {value.data_mode !== 'INDEX_PROXY' && <p className="qs-warning">尾盘近似模拟：当日最终收盘信号与单股排名在收盘前未知；假设先卖后买、资金可接续，不能证明同一收盘集合竞价能完成全仓切换。日成交额也不代表最后5分钟可成交量。</p>}
    <small>当前口径数据截至{dataEnd || '待更新'}。{value.data_mode === 'ETF_STOCK' && value.stock_weight > 0 ? '单股版为独立校验的研究数据版本，通用数据更新不会自动推进其截止日。' : '在数据管理的“日行情与估值”和“指数与策略基准”更新。'}参数按策略保存在当前浏览器；修改后点击回测按钮生效。</small>
  </section>
}

export function RatioRotationResults({ result, draft }: { result?: RatioResult; draft: RatioParameters }) {
  if (!result) return null
  const latest = result.latest
  const wealth = ratioUsesWealth(result.parameters)
  return <section className="qs-style-results" aria-label="比值轮动信号与切换明细">
    {result.parameters.hold_low_chinext && <p>本次采用双低持有创业板。持有门槛为比值低于历史P{result.parameters.hold_ratio_percentile ?? 10}且创业板ETF收盘价低于{result.parameters.hold_price_cny ?? 2}元。解锁后等待原版新信号。</p>}
    <p>本次信号采用{ratioSignalName(result.parameters)}，交易口径为{result.parameters.data_mode === 'ETF_STOCK' ? `${result.parameters.signal_basis === 'STAR_ETF_PRICE' ? '588000' : '159915'}／512890实际ETF＋单股（股票目标${pct(result.parameters.stock_weight)}）` : result.parameters.data_mode === 'ETF' ? '159915／563020实际ETF' : wealth ? `创业板指数代理／${defensiveName(result.parameters)}` : '指数代理'}，{result.parameters.ma_sessions}日均线，±{pct(result.parameters.buffer_fraction)}缓冲带。信号截至{latest.session}，数据截至{result.market_as_of}。</p>
    {wealth && <p>防守资金在实际切入后按自然日复利。模型假设可即时进出、零费用。</p>}
    <p>{result.parameters.commission_bps == null
      ? `历史结果费用：${result.parameters.data_mode === 'ETF' ? '单边万五、最低5元，至少一档不利滑点' : '单边万十、滑点0，年化模型持有费0.20%'}。`
      : `本次费用：单边手续费万${result.parameters.commission_bps}，${ratioUsesClose(result.parameters) ? `ETF单边价差${result.parameters.etf_slippage_cny ?? .002}元／份${result.parameters.data_mode === 'ETF_STOCK' && result.parameters.stock_weight > 0 ? `、股票${result.parameters.stock_slippage_cny ?? .02}元／股` : ''}；当日收盘模拟` : `历史比例滑点${((result.parameters.slippage_bps || 0) / 100).toFixed(2)}%；${result.parameters.data_mode === 'INDEX_PROXY' ? '次日收盘模拟' : '次日开盘成交'}`}${result.parameters.data_mode !== 'INDEX_PROXY' ? `，每笔最低佣金${result.parameters.minimum_commission}元` : '，另计年化模型持有费0.20%'}。`}</p>
    {ratioUsesClose(result.parameters) && <p className="qs-warning">{result.execution_assumption || '使用最终收盘信号与当日收盘价的尾盘近似模拟，未验证盘中信号、排队成交及同一收盘竞价的资金接续。'}</p>}
    {result.parameters.data_mode === 'ETF_STOCK' && result.parameters.stock_weight > 0 && <p>股票另计历史印花税、过户费；ETF派息与股票送转均进入同一实际账户。单股选择只在切换日发生，历史已用于研究，不能当作样本外结果。</p>}
    {!ratioParametersEqual(result.parameters, draft) && <p className="qs-warning">参数已修改，当前曲线仍为上次回测结果，重新运行后更新。</p>}
    <RatioHistoryPosition observations={result.observations} latest={latest} maSessions={result.parameters.ma_sessions} />
    <details><summary>查看全部信号切换（{result.switches.length}次）</summary><div className="qs-table-scroll"><table><thead><tr><th>收盘信号日</th><th>切换方向</th><th>比值距均线</th></tr></thead><tbody>{result.switches.map(row => <tr key={row.signal_date}><td>{row.signal_date}</td><td>{stateName(row.from_state, result.parameters)} → {stateName(row.to_state, result.parameters)}</td><td>{pct(row.deviation)}</td></tr>)}</tbody></table></div></details>
    {!!result.stock_selection?.records.length && <details><summary>查看单股选择（{result.stock_selection.records.length}次）</summary><div className="qs-table-scroll"><table><thead><tr><th>信号日</th><th>方向</th><th>股票</th><th>距一年高点</th><th>合格数</th><th>股票池／报告期／披露日</th></tr></thead><tbody>{result.stock_selection.records.map(row => <tr key={row.signal_date}><td>{row.signal_date}</td><td>{stateName(row.style, result.parameters)}</td><td><b>{row.security_name || '名称未记录'}</b><br /><small>{row.stock_ts_code}</small></td><td>{pct(row.factor_value)}</td><td>{row.eligible}</td><td>{row.basket_source}／{row.report_date}／{row.ann_date}</td></tr>)}</tbody></table></div></details>}
    <small>{ratioUsesClose(result.parameters) ? '切换表记录收盘信号，同日收盘模拟成交；受限未成交的部分继续计原持仓。' : '切换表记录收盘信号，末日新信号在后续交易日执行；'}逐日持仓、成交和收益来自本次同一账户。</small>
  </section>
}
