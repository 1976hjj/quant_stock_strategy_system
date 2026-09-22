import { STRATEGY_API_ROOT } from './strategyApi'

export interface DataGroup {
  id: string
  name: string
  description: string
  required_for_strategy: boolean
  start: string | null
  end: string | null
  partitions: Record<string, number>
  datasets: Array<{ id: string; start: string | null; end: string | null; partitions: number }>
  published: boolean
}

export interface DataInventory {
  today: string
  latest_complete_day: string
  groups: DataGroup[]
  factors: Array<{ id: string; name: string; start: string | null; end: string | null; source?: string }>
  defaults: { groups: string[]; factor_ids: string[] }
}

export interface DataUpdateRequest {
  end: string
  groups: string[]
  factor_ids: string[]
  workers: number
  min_free_gb: number
  sleep_ms: number
  refresh_recent_periods: number
}

export interface DataPlan {
  target_end: string
  stages: Array<{ id: string; name: string; current_end: string | null; needs_update: boolean }>
  required_unselected: string[]
  token_available: boolean
  strategy_ready_if_complete: boolean
}

export interface DataJob {
  job_id: string
  request: DataUpdateRequest
  status: 'RUNNING' | 'PASS' | 'FAIL'
  phase: string
  progress: number
  completed_groups?: number
  total_groups?: number
  group?: string
  step?: number
  steps?: number
  error?: string
  log_tail: string
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${STRATEGY_API_ROOT}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(value.detail || value.error || `请求失败 (${response.status})`)
  return value as T
}

export const dataApi = {
  inventory: () => call<DataInventory>('/data/inventory'),
  plan: (request: DataUpdateRequest) => call<DataPlan>('/data/plan', request),
  start: (request: DataUpdateRequest) => call<DataJob>('/data/jobs', request),
  latest: () => call<{ job: DataJob | null }>('/data/jobs/latest'),
  status: (jobId: string) => call<DataJob>(`/data/jobs/${jobId}`),
}
