import type { AllocationInput, AllocationResult } from './allocationModel'
import { estimateCycle } from './cycleEstimateModel'

const money = (value: number) => `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`
const wan = (value: number) => `${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万`
export default function CycleEstimate({ input, plan, onChange }: { input: AllocationInput; plan: AllocationResult | null; onChange: (key: 'estimateMonths' | 'factorAnnualReturnPct', value: string) => void }) {
  let estimate: ReturnType<typeof estimateCycle> | null = null
  if (plan) { try { estimate = estimateCycle(input, plan) } catch { /* Inputs remain editable below. */ } }
  return <section className="ca-panel ca-estimate" aria-label="一轮目标收益预估">
    <div className="ca-panel-title"><div><h2>一轮目标收益预估</h2><p>按所选组合的目标仓位，假设在所填周期内均达标；未扣交易费用，达标时间不确定。</p></div><span className="ca-chip">随组合与参数变化</span></div>
    <div className="ca-estimate-inputs"><label className="ca-field"><span>假设持有周期</span><div className="ca-input"><input aria-label="目标估算周期（月）" type="number" min="0.1" max="120" step="1" value={input.estimateMonths ?? '12'} onChange={e => onChange('estimateMonths', e.target.value)} /><b>月</b></div></label><label className="ca-field"><span>因子账户假设年化</span><div className="ca-input"><input aria-label="因子账户假设年化（%）" type="number" min="-99" max="200" step="0.1" value={input.factorAnnualReturnPct ?? '15'} onChange={e => onChange('factorAnnualReturnPct', e.target.value)} /><b>%</b></div></label></div>
    <div className="ca-estimate-totals"><div><span>一轮目标总盈利</span><strong>{estimate ? `${estimate.totalProfit >= 0 ? '+' : ''}${wan(estimate.totalProfit)}` : '—'}</strong></div><div><span>达标后总资金</span><strong>{estimate ? wan(estimate.endWealth) : '—'}</strong></div><div><span>总资金目标收益率</span><strong>{estimate ? `${(estimate.totalReturn * 100).toFixed(2)}%` : '—'}</strong></div></div>
    {estimate ? <div className="ca-table-scroll"><table><thead><tr><th>资金去向</th><th>计算本金</th><th>本轮目标口径</th><th>目标盈利</th></tr></thead><tbody>{estimate.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{money(row.principal)}</td><td>{row.basis}</td><td>{money(row.profit)}</td></tr>)}</tbody></table></div> : <p className="ca-help">完善资金配置和预估参数后显示金额。</p>}
  </section>
}
