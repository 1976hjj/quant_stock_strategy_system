const DATA_API_ROOT = (import.meta.env.VITE_DATA_API_URL || 'http://127.0.0.1:8774/api/v1').replace(/\/$/, '')

export interface DataGroup {
  source_id?: 'tushare' | 'eastmoney' | 'industry'
  audit?: { status: string; missing_field_provenance: number; bps_source_differences_over_001: number; implemented_unique_events: number; implemented_event_conflicts: number; history_first_disclosure_certified: boolean } | null
  requires_token?: boolean
  id: string
  name: string
  description: string
  required_for_strategy: boolean
  start: string | null
  end: string | null
  partitions: Record<string, number>
  datasets: Array<{ id: string; start: string | null; end: string | null; partitions: number }>
  published: boolean
  last_collected_at?: string | null
  bank_count?: number
  expected_banks?: number
  history_rows?: number
  current_complete_banks?: number
  metric_coverage?: Record<string, number>
  quality_label?: string
  quality_flag_rows?: number
  missing_notice_rows?: number
  bank_research?: { banks: number; expected_banks: number; rows: number; start: string | null; end: string | null; collected_at: string; quality_label: string }
}

export interface DataSource {
  id: 'tushare' | 'eastmoney'
  name: string
  credential_required: boolean
  credential_status: 'configured' | 'missing' | 'invalid' | 'not_required'
  description: string
  defaults: { groups: string[]; factor_ids: string[] }
}

export interface DataInventory {
  today: string
  latest_complete_day: string
  groups: DataGroup[]
  industries?: DataGroup[]
  sources?: DataSource[]
  factors: Array<{ id: string; name: string; start: string | null; end: string | null; source?: string }>
  defaults: { groups: string[]; factor_ids: string[] }
}

export interface DataUpdateRequest {
  source_id?: 'tushare' | 'eastmoney' | 'industry'
  end: string
  groups: string[]
  factor_ids: string[]
  workers: number
  min_free_gb: number
  sleep_ms: number
  refresh_recent_periods: number
}

export interface DataPlan {
  source_id?: 'tushare' | 'eastmoney' | 'industry'
  target_end: string
  stages: Array<{ id: string; name: string; current_end: string | null; needs_update: boolean; requires_token?: boolean }>
  required_unselected: string[]
  token_available: boolean
  token_required?: boolean
  can_start?: boolean
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
  const response = await fetch(`${DATA_API_ROOT}${path}`, {
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
