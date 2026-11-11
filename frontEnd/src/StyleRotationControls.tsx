import './style-rotation.css'

export type RotationParameters = {
  mode: 'SOFT' | 'FULL'; entry_drawdown: number; recovery_drawdown: number
  growth_weight: number; defensive_growth_weight: number; include_star: boolean
  monthly_rebalance: boolean; initial_state: 'G' | 'D'; commission_bps: number
  minimum_commission: number; slippage_bps: number; participation_rate: number
  refresh_market: boolean; refresh_bank_signal: boolean
}
export const DEFAULT_ROTATION: RotationParameters = {
  mode: 'SOFT', entry_drawdown: .15, recovery_drawdown: .05,
  growth_weight: .75, defensive_growth_weight: .25, include_star: true,
  monthly_rebalance: true, initial_state: 'G', commission_bps: 2,
  minimum_commission: 5, slippage_bps: 2, participation_rate: .01,
  refresh_market: true, refresh_bank_signal: true,
}
export type RotationResult = {
  parameters: RotationParameters; bank_signal_as_of: string; bank_signal_start: string
  market_as_of: string; current_state: 'G' | 'D'; bank_drawdown: number | null
  target_weights: Record<string, number>
  switches: Array<{ signal_date: string; from_state: string; to_state: string; bank_drawdown: number | null }>
}
export function rotationValidation(value: RotationParameters) {
  if (!(value.entry_drawdown > 0 && value.entry_drawdown < 1)) return '转防守回撤阈值应在0%与100%之间。'
  if (!(value.recovery_drawdown >= 0 && value.recovery_drawdown < value.entry_drawdown)) return '修复剩余回撤应小于转防守回撤阈值。'
  if (value.mode === 'SOFT' && !(value.growth_weight > value.defensive_growth_weight && value.growth_weight <= 1 && value.defensive_growth_weight >= 0)) return '成长状态的成长仓位应高于防守状态，且均在0%—100%之间。'
  return ''
}
export function StyleRotationControls({ value, onChange, defaults = DEFAULT_ROTATION }: {
  value: RotationParameters; onChange: (value: RotationParameters) => void; defaults?: RotationParameters
}) {
  const update = <K extends keyof RotationParameters>(key: K, next: RotationParameters[K]) => onChange({ ...value, [key]: next })
  return <section className="qs-style-controls" aria-label="风格轮动参数">
    <div className="qs-style-heading"><h3>轮动参数</h3><button type="button" onClick={() => onChange({ ...defaults })}>恢复研究默认值</button></div>
    <p>成长：创业板159915＋科创50 588000，各半；防守：银行512800＋红利低波512890，各半。切换信号来自银行质量10股策略的净值回撤。</p>
    <div className="qs-inputs">
      <label>切换方式<select aria-label="切换方式" value={value.mode} onChange={e => update('mode', e.target.value as 'SOFT' | 'FULL')}><option value="SOFT">软切换：保留两类仓位</option><option value="FULL">全切换：100%成长／100%防守</option></select></label>
      <label>初始风格<select aria-label="初始风格" value={value.initial_state} onChange={e => update('initial_state', e.target.value as 'G' | 'D')}><option value="G">成长状态</option><option value="D">防守状态</option></select></label>
      <label>转防守回撤阈值（%）<input aria-label="转防守回撤阈值" type="number" min="0.1" max="99.9" step="0.1" value={value.entry_drawdown * 100} onChange={e => update('entry_drawdown', Number(e.target.value) / 100)} /></label>
      <label>切回成长：剩余回撤（%）<input aria-label="修复剩余回撤" type="number" min="0" max="99" step="0.1" value={value.recovery_drawdown * 100} onChange={e => update('recovery_drawdown', Number(e.target.value) / 100)} /></label>
      {value.mode === 'SOFT' && <><label>成长状态：成长仓位（%）<input aria-label="成长状态成长仓位" type="number" min="0" max="100" step="1" value={value.growth_weight * 100} onChange={e => update('growth_weight', Number(e.target.value) / 100)} /><small>其余资金配置防守ETF。</small></label><label>防守状态：成长仓位（%）<input aria-label="防守状态成长仓位" type="number" min="0" max="100" step="1" value={value.defensive_growth_weight * 100} onChange={e => update('defensive_growth_weight', Number(e.target.value) / 100)} /><small>默认25%成长／75%防守。</small></label></>}
    </div>
    <p>“修复到5%”指银行净值距此前高点只差5%，不是从低点反弹5%。阈值之间保持原状态；银行高点沿用其原始连续账户，不随这里的回测开始日重置。</p>
    <div className="qs-style-checks">
      <label><input type="checkbox" checked={value.include_star} onChange={e => update('include_star', e.target.checked)} /><span><strong>包含科创50ETF</strong><small>关闭后，成长仓位仅配置创业板ETF。</small></span></label>
      <label><input type="checkbox" checked={value.monthly_rebalance} onChange={e => update('monthly_rebalance', e.target.checked)} /><span><strong>月末再平衡</strong><small>关闭后，仅在成长／防守切换时调仓。</small></span></label>
      <label><input type="checkbox" checked={value.refresh_market} onChange={e => update('refresh_market', e.target.checked)} /><span><strong>更新ETF行情</strong><small>运行前通过当前接口补齐行情。</small></span></label>
      <label><input type="checkbox" checked={value.refresh_bank_signal} onChange={e => update('refresh_bank_signal', e.target.checked)} /><span><strong>重算银行信号</strong><small>使用当前本地数据，默认复用已校验因子。</small></span></label>
    </div>
    <details><summary>交易成本与容量参数</summary><div className="qs-inputs">
      <label>佣金（万分之）<input aria-label="轮动佣金" type="number" min="0" max="50" step="0.1" value={value.commission_bps} onChange={e => update('commission_bps', Number(e.target.value))} /></label>
      <label>最低佣金（元）<input aria-label="轮动最低佣金" type="number" min="0" max="100" value={value.minimum_commission} onChange={e => update('minimum_commission', Number(e.target.value))} /></label>
      <label>不利滑点（万分之，至少一档）<input aria-label="轮动滑点" type="number" min="0" max="100" value={value.slippage_bps} onChange={e => update('slippage_bps', Number(e.target.value))} /></label>
      <label>单日成交额参与上限（%）<input aria-label="轮动成交额参与上限" type="number" min="0.01" max="10" step="0.1" value={value.participation_rate * 100} onChange={e => update('participation_rate', Number(e.target.value) / 100)} /></label>
    </div></details>
    <small>参数会在当前浏览器保存；修改后点击下方回测按钮生效，每次结果保留启动时的独立参数。</small>
  </section>
}

const pct = (n?: number | null) => n == null ? '—' : `${(n * 100).toFixed(2)}%`
export function StyleRotationResults({ result, draft }: { result?: RotationResult; draft: RotationParameters }) {
  if (!result) return null
  const p = result.parameters
  return <section className="qs-style-results" aria-label="轮动信号与切换明细">
    <h3>轮动信号与切换明细</h3>
    <div className="qs-style-stats"><div><small>收盘信号风格</small><b>{result.current_state === 'G' ? '成长状态' : '防守状态'}</b></div><div><small>银行策略当前回撤</small><b>{pct(result.bank_drawdown == null ? null : -result.bank_drawdown)}</b></div><div><small>历史风格切换</small><b>{result.switches.length}次</b></div></div>
    <p>本次结果：阈值 {pct(p.entry_drawdown)}／{pct(p.recovery_drawdown)} · {p.mode === 'FULL' ? '全切换' : `${pct(p.growth_weight)}／${pct(p.defensive_growth_weight)}软切换`} · {p.monthly_rebalance ? '月末再平衡' : '仅切换时调仓'}。</p>
    {JSON.stringify(p) !== JSON.stringify(draft) && <p className="qs-warning">参数已修改；这里仍显示上次回测结果，重新运行后更新。</p>}
    <p>银行信号截至 {result.bank_signal_as_of}，信号账户起点 {result.bank_signal_start}；ETF行情截至 {result.market_as_of}。</p>
    <p>收盘目标配置（实际仓位见上方最新明细）</p><div className="qs-style-weights">{Object.entries(result.target_weights).map(([code, weight]) => <span key={code}>{code}<b>{pct(weight)}</b></span>)}</div>
    <details><summary>查看全部风格切换（{result.switches.length}次）</summary><div className="qs-table-scroll"><table><thead><tr><th>收盘信号日</th><th>切换方向</th><th>银行策略回撤</th></tr></thead><tbody>{result.switches.map((s, i) => <tr key={`${s.signal_date}-${i}`}><td>{s.signal_date}</td><td>{s.from_state === 'G' ? '成长 → 防守' : '防守 → 成长'}</td><td>{pct(s.bank_drawdown == null ? null : -s.bank_drawdown)}</td></tr>)}</tbody></table></div></details>
    <small>信号日与成交日不同；实际成交、未成交和仓位以本次账户记录为准。</small>
  </section>
}
