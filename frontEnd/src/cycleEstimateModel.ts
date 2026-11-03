import type { AllocationInput, AllocationResult } from './allocationModel'
export type CycleContribution = { id: string; name: string; principal: number; returnRate: number; profit: number; basis: string }
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export function estimateCycle(input: AllocationInput, plan: AllocationResult) {
  const months = Number(input.estimateMonths ?? '12')
  const annual = Number(input.factorAnnualReturnPct ?? '15') / 100
  const years = months / 12
  const trigger = Number(input.dividendTriggerPct) / 100
  const multiple = Number(input.growthExitMultiple)
  const bondAnnual = Number(input.bondYieldPct) / 100
  const numbers = [months, annual, years, trigger, multiple, bondAnnual]
  if (!numbers.every(Number.isFinite) || months <= 0 || months > 120 || annual <= -1 || trigger <= 0 || trigger >= 1 || multiple < 1) throw new Error('预估参数无效')
  const rows: CycleContribution[] = plan.rows.map(row => {
    const active = row.state === 'ACTIVE'
    const principal = !active ? 0 : row.id === 'factor' ? row.budget : row.targetEquity
    const rate = row.id === 'dividend' ? 1 / (1 - trigger) - 1 : row.id === 'growth' ? multiple - 1 : (1 + annual) ** years - 1
    const names = { dividend: '512890红利低波', factor: '季度10股因子账户', growth: '159915创业板' }
    return { id: row.id, name: names[row.id], principal, returnRate: principal > 0 ? rate : 0, profit: rounded(principal * rate),
      basis: !active ? '未参与；等待预算计入债基' : row.id === 'dividend' ? `－${input.dividendTriggerPct}%买入，修复至0%，一轮${(rate * 100).toFixed(2)}%`
        : row.id === 'growth' ? `达到${multiple}倍目标，一轮${(rate * 100).toFixed(2)}%`
          : `账户假设年化${(annual * 100).toFixed(2)}%，按${months}个月折算（含策略内部现金）` }
  })
  const bondRate = (1 + bondAnnual) ** years - 1
  rows.push({ id: 'bond', name: '债基', principal: plan.targetBond, returnRate: bondRate, profit: rounded(plan.targetBond * bondRate), basis: `假设年化${input.bondYieldPct}%，持有${months}个月` })
  // Factor account return already includes its internal cash; never add it again.
  const factorInternal = plan.rows.find(r => r.id === 'factor')?.internalCash || 0
  rows.push({ id: 'cash', name: '其余现金', principal: rounded(plan.targetCash - factorInternal), returnRate: 0, profit: 0, basis: '不计现金收益；因子内部现金已包含在因子账户内' })
  const totalProfit = rounded(rows.reduce((s, r) => s + r.profit, 0))
  return { months, rows, totalProfit, endWealth: rounded(plan.capital + totalProfit), totalReturn: totalProfit / plan.capital }
}
