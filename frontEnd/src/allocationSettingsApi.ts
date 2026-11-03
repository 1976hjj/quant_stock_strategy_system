import { STRATEGY_API_ROOT } from './strategyApi'
import { calculateAllocation } from './allocationModel'
import type { AllocationInput } from './allocationModel'

export type SavedAllocation = { config: AllocationInput | null; revision: string | null; saved_at: string | null }
export function allocationSignature(input: AllocationInput): string {
  const sorted = (value: unknown): unknown => Array.isArray(value) ? value.map(sorted)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)])) : value
  return JSON.stringify(sorted(input))
}
async function request(payload?: { config: AllocationInput; expected_revision: string | null }): Promise<SavedAllocation> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${STRATEGY_API_ROOT}/capital-allocation/settings`, {
      method: payload ? 'POST' : 'GET', signal: controller.signal, cache: 'no-store',
      ...(payload ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : response.status === 404 ? '当前后端尚未提供配置保存接口，请重启更新后的后端。' : data.error || `请求失败 ${response.status}`)
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'config')) throw new Error('后端配置响应不完整，当前草稿已保留。')
    if (data.config !== null && (data.config.version !== 1 || typeof data.config.factorStrategyId !== 'string' || !calculateAllocation(data.config).result || typeof data.revision !== 'string' || typeof data.saved_at !== 'string')) throw new Error('已保存配置校验失败，当前草稿已保留。')
    if (data.config === null && (data.revision !== null || data.saved_at !== null)) throw new Error('后端配置版本不一致。')
    return data as SavedAllocation
  } finally { clearTimeout(timeout) }
}
export const readAllocationSettings = () => request()
export const saveAllocationSettings = (config: AllocationInput, expected_revision: string | null) => request({ config, expected_revision })
