export type SleeveId = 'dividend' | 'factor' | 'growth'
export type SleeveState = 'WAITING' | 'ACTIVE' | 'EXIT'
export type SleeveInput = {
  id: SleeveId; state: SleeveState; preference: string; manualPct: string
  currentPct: string; stressPct: string; exposurePct: string
}
export type AllocationInput = {
  version: 1; capital: string; maxDrawdownPct: string; bufferPct: string
  minimumSafePct: string; cashBufferPct: string; currentCashPct: string
  bondStressPct: string; bondYieldPct: string; redemptionDays: string
  mode: 'AUTO' | 'MANUAL'; factorStrategyId: string
  dividendTriggerPct: string; growthEntryPrice: string; growthExitMultiple: string
  estimateMonths?: string; factorAnnualReturnPct?: string
  sleeves: SleeveInput[]
}
export const ALLOCATION_KEY = 'alpha-research.capital-allocation.v1'
export const DEFAULT_FACTOR_ID = 'factor-sharpe-quarter-missing-tp50-main-chinext10'
export const SLEEVE_NAMES: Record<SleeveId, string> = {
  dividend: '红利低波回撤入场', factor: '因子加权 · 季度10股', growth: '创业板超跌长期持有',
}
export const defaultAllocation = (): AllocationInput => ({
  version: 1, capital: '1000000', maxDrawdownPct: '15', bufferPct: '2', minimumSafePct: '40',
  cashBufferPct: '2', currentCashPct: '5', bondStressPct: '0.5', bondYieldPct: '2.5', redemptionDays: '1',
  mode: 'AUTO', factorStrategyId: DEFAULT_FACTOR_ID, dividendTriggerPct: '10', growthEntryPrice: '1.7', growthExitMultiple: '2', estimateMonths: '12', factorAnnualReturnPct: '15',
  sleeves: [
    { id: 'dividend', state: 'WAITING', preference: '55', manualPct: '20', currentPct: '0', stressPct: '30', exposurePct: '100' },
    { id: 'factor', state: 'ACTIVE', preference: '35', manualPct: '12', currentPct: '10', stressPct: '40', exposurePct: '88.2' },
    { id: 'growth', state: 'WAITING', preference: '10', manualPct: '5', currentPct: '0', stressPct: '50', exposurePct: '100' },
  ],
})
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ids: SleeveId[] = ['dividend', 'factor', 'growth']
export type AllocationRow = { id: SleeveId; state: SleeveState; budget: number; budgetPct: number; targetEquity: number; currentEquity: number; delta: number; internalCash: number; parkedBudget: number; stressPct: number; exposurePct: number }
export type AllocationResult = {
  capital: number; rows: AllocationRow[]; permanentReserve: number
  currentEquity: number; currentCash: number; currentBond: number; currentStressLoss: number
  targetEquity: number; targetCash: number; targetBond: number
  buys: number; sells: number; redeem: number; subscribe: number; unfundedNow: number
  activeStressLoss: number; allActiveStressLoss: number; riskBudget: number; bufferedBudget: number
  allActiveEquity: number; warningMessages: string[]; worstBudgetWithinLimit: boolean
}
export function calculateAllocation(input: AllocationInput): { errors: string[]; result: AllocationResult | null } {
  const errors: string[] = []
  const n = (value: string, label: string, min: number, max: number) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (!Number.isFinite(number) || number < min || number > max) errors.push(`${label}须为${min}至${max}之间的数字`)
    return number
  }
  const total = n(input.capital, '总资金（元）', 1, 1e12)
  const maxDD = n(input.maxDrawdownPct, '回撤预算（%）', 0.1, 99) / 100
  const buffer = n(input.bufferPct, '风险缓冲（百分点）', 0, 99) / 100
  const safeFloor = n(input.minimumSafePct, '永久稳定资金下限（%）', 0, 100) / 100
  const cashFloor = n(input.cashBufferPct, '目标可用现金（%）', 0, 100) / 100
  const currentCashPct = n(input.currentCashPct, '当前可用现金（%）', 0, 100) / 100
  const bondStress = n(input.bondStressPct, '债基压力跌幅（%）', 0, 100) / 100
  n(input.bondYieldPct, '债基假设年化（%）', 0, 30)
  const delay = n(input.redemptionDays, '赎回到账工作日', 0, 30)
  if (Number.isFinite(delay) && !Number.isInteger(delay)) errors.push('赎回到账工作日须为整数')
  n(input.dividendTriggerPct, '红利入场回撤（%）', 0.1, 99)
  n(input.growthEntryPrice, '创业板观察入场价（元）', 0.001, 1000)
  n(input.growthExitMultiple, '创业板目标倍数', 1, 20)
  n(input.estimateMonths ?? '12', '目标估算周期（月）', .1, 120)
  n(input.factorAnnualReturnPct ?? '15', '因子账户假设年化（%）', -99, 200)
  if (!['AUTO', 'MANUAL'].includes(input.mode)) errors.push('请选择有效的预算计算方式')
  if (buffer >= maxDD) errors.push('风险缓冲须小于回撤预算')
  if (cashFloor > safeFloor) errors.push('目标可用现金须包含在永久稳定资金下限内')
  if (!Array.isArray(input.sleeves) || input.sleeves.length !== 3 || ids.some(id => input.sleeves.filter(s => s.id === id).length !== 1)) {
    return { errors: [...errors, '三套策略配置不完整或重复'], result: null }
  }
  const values = ids.map(id => {
    const row = input.sleeves.find(s => s.id === id)!
    const name = SLEEVE_NAMES[id]
    if (!['WAITING', 'ACTIVE', 'EXIT'].includes(row.state)) errors.push(`${name}的状态无效`)
    return { ...row,
      weight: n(row.preference, `${name}偏好权重`, 0, 100),
      manual: n(row.manualPct, `${name}手动预算（%）`, 0, 100) / 100,
      current: n(row.currentPct, `${name}当前股票市值（%）`, 0, 100) / 100,
      shock: n(row.stressPct, `${name}股票压力跌幅（%）`, 0.1, 100) / 100,
      exposure: n(row.exposurePct, `${name}预算内股票仓位（%）`, 0, 100) / 100,
    }
  })
  const sumWeight = values.reduce((s, r) => s + r.weight, 0)
  if (input.mode === 'AUTO' && sumWeight <= 0) errors.push('至少给一套策略设置大于0的偏好权重')
  if (values.reduce((s, r) => s + r.current, 0) + currentCashPct > 1 + 1e-9) errors.push('当前股票市值占比与可用现金占比合计不能超过100%')
  if (input.mode === 'MANUAL' && values.reduce((s, r) => s + r.manual, 0) + cashFloor > 1 + 1e-9) errors.push('手动策略预算与目标可用现金合计不能超过100%')
  if (errors.length) return { errors, result: null }
  const limit = maxDD - buffer
  const averageLoss = values.reduce((sum, r) => sum + r.weight / Math.max(1, sumWeight) * r.exposure * r.shock, 0)
  const baseline = bondStress * (1 - cashFloor)
  const slope = averageLoss - bondStress
  // Simultaneous stress; preference weights only divide the risk allocation.
  // No return forecast, correlation benefit, historical max-loss guarantee or optimisation.
  const fraction = Math.max(0, Math.min(1 - safeFloor, slope > 0 ? (limit - baseline) / slope : 1 - safeFloor))
  const rows: AllocationRow[] = values.map(r => {
    const budget = Math.floor(total * (input.mode === 'MANUAL' ? r.manual : fraction * r.weight / sumWeight) * 100) / 100
    const active = r.state === 'ACTIVE'
    const targetEquity = active ? round(budget * r.exposure) : 0
    const currentEquity = round(total * r.current)
    return { id: r.id, state: r.state, budget, budgetPct: budget / total * 100, targetEquity, currentEquity,
      delta: round(targetEquity - currentEquity), internalCash: active ? round(budget - targetEquity) : 0,
      parkedBudget: active ? 0 : budget, stressPct: r.shock * 100, exposurePct: r.exposure * 100 }
  })
  const budgetTotal = rows.reduce((s, r) => s + r.budget, 0)
  const permanentReserve = round(total - budgetTotal)
  const targetEquity = round(rows.reduce((s, r) => s + r.targetEquity, 0))
  const targetCash = round(total * cashFloor + rows.reduce((s, r) => s + r.internalCash, 0))
  const targetBond = round(total - targetEquity - targetCash)
  const currentEquity = round(rows.reduce((s, r) => s + r.currentEquity, 0))
  const currentCash = round(total * currentCashPct)
  const currentBond = round(total - currentEquity - currentCash)
  if (currentBond < 0) return { errors: ['当前持仓按人民币分取整后超过总资金，请调整金额或比例精度'], result: null }
  const buys = round(rows.reduce((s, r) => s + Math.max(0, r.delta), 0))
  const sells = round(rows.reduce((s, r) => s + Math.max(0, -r.delta), 0))
  const redeem = round(Math.max(0, buys + targetCash - currentCash - sells))
  const subscribe = round(Math.max(0, currentCash + sells - buys - targetCash))
  const unfundedNow = round(Math.max(0, buys - Math.max(0, currentCash - targetCash)))
  const activeStressLoss = round(rows.reduce((s, r) => s + r.targetEquity * r.stressPct / 100, 0) + targetBond * bondStress)
  const allActiveStressLoss = round(values.reduce((s, r, i) => s + rows[i].budget * r.exposure * r.shock, 0) + Math.max(0, permanentReserve - total * cashFloor) * bondStress)
  const currentStressLoss = round(rows.reduce((s, r) => s + r.currentEquity * r.stressPct / 100, 0) + currentBond * bondStress)
  const allActiveEquity = round(values.reduce((s, r, i) => s + rows[i].budget * r.exposure, 0))
  const riskBudget = round(total * maxDD)
  const bufferedBudget = round(total * limit)
  const warningMessages: string[] = []
  if (input.mode === 'AUTO' && allActiveStressLoss > bufferedBudget + .02) warningMessages.push('当前参数下无法生成满足风险缓冲的方案，请重新检查稳定资产压力假设及资金下限。')
  if (allActiveStressLoss > riskBudget + 0.02) warningMessages.push('所有策略同时持仓的压力损失超过回撤预算，请降低手动预算或提高稳定资金比例。')
  else if (allActiveStressLoss > bufferedBudget + 0.02) warningMessages.push('同时持仓的压力损失占用了风险缓冲，请降低预算。')
  if (permanentReserve + .02 < total * safeFloor) warningMessages.push('手动预算未满足永久稳定资金下限。')
  if (currentStressLoss > riskBudget) warningMessages.push('手填当前持仓在本情景下已超过回撤预算；修改目标预算不等于现有持仓已减少。')
  if (redeem > currentBond + .02) warningMessages.push('当前债基余额不足以覆盖计划赎回，资金计划不可执行。')
  if (unfundedNow > .02) warningMessages.push('现有可用现金不足，须等待计划卖出或债基赎回资金实际可用后再买入。')
  if (rows.some(r => r.state === 'WAITING' && r.currentEquity > 0)) warningMessages.push('等待中的策略仍填有持仓，将按目标清零测算；如仍打算持有，请改为“运行／准备入场”。')
  return { errors: [], result: { capital: total, rows, permanentReserve, currentEquity, currentCash, currentBond, currentStressLoss,
    targetEquity, targetCash, targetBond, buys, sells, redeem, subscribe, unfundedNow, activeStressLoss, allActiveStressLoss,
    riskBudget, bufferedBudget, allActiveEquity, warningMessages, worstBudgetWithinLimit: allActiveStressLoss <= riskBudget + .02 } }
}

export function restoreAllocation(raw: string | null): { input: AllocationInput; message?: string } {
  if (!raw) return { input: defaultAllocation() }
  try {
    const candidate = JSON.parse(raw) as AllocationInput
    if (candidate.version !== 1 || typeof candidate.factorStrategyId !== 'string' || calculateAllocation(candidate).errors.length) throw new Error('invalid')
    return { input: candidate }
  } catch { return { input: defaultAllocation(), message: '已保存的参数不完整或无效，已恢复默认示例。' } }
}

export function allocationScenario(input: AllocationInput, active: SleeveId[]): AllocationInput {
  return { ...input, sleeves: input.sleeves.map(s => ({ ...s, state: active.includes(s.id) ? 'ACTIVE' : 'WAITING' })) }
}
