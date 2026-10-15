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
  maintenance?: DataMaintenance
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
  bank_update_mode?: 'AUTO' | 'FULL'
}

export interface DataPlan {
  source_id?: 'tushare' | 'eastmoney' | 'industry'
  target_end: string
  stages: Array<{ id: string; name: string; current_end: string | null; needs_update: boolean; requires_token?: boolean; refresh_recent_periods?: number }>
  required_unselected: string[]
  token_available: boolean
  token_required?: boolean
  can_start?: boolean
  strategy_ready_if_complete: boolean
  bank_refresh?: { refresh_financial: boolean; financial_age_days: number | null; reason: string } | null
}

export interface DataMaintenance {
  checked_at: string
  weekly_schedule: string
  next_weekly_at: string
  interval_days: number
  long_unused_days: number
  official_reports_status: string
  update_prompt: string
  update_prompt_scope?: 'bank_reports'
  ledger: Array<{ id: string; name: string; source_id: string; coverage_end: string | null;
    last_success_at: string | null; days_since_success: number | null;
    state: 'missing' | 'long_unused' | 'due' | 'current'; next_check_at: string | null }>
}

export interface DataHistory {
  items: Array<{ job_id: string; source_id: string; groups: string[]; target_end: string; status: string;
    updated_at: string | null; error?: string; completed_groups: number; total_groups: number }>
  page: number
  page_size: number
  total_items: number
  total_pages: number
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
  started_at?: string
  updated_at?: string
  retry_attempt?: number
  detail?: string
  stage_id?: string
  stage_index?: number
  stage_count?: number
  stage_completed?: number
  stage_total?: number | null
  stage_unit?: string
  stage_progress?: number | null
  stages?: Array<{ id: string; name: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAIL'; completed?: number; total?: number | null; unit?: string; reused?: boolean }>
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${DATA_API_ROOT}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (reason) {
    if (reason instanceof TypeError) throw new Error('数据服务暂时无法连接，请稍后点击“刷新覆盖状态”重试。')
    throw reason
  }
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(value.detail || value.error || `请求失败 (${response.status})`)
  return value as T
}

export const dataApi = {
  history: (page = 1) => call<DataHistory>(`/data/history?page=${page}&page_size=10`),
  inventory: () => call<DataInventory>('/data/inventory'),
  plan: (request: DataUpdateRequest) => call<DataPlan>('/data/plan', request),
  start: (request: DataUpdateRequest) => call<DataJob>('/data/jobs', request),
  latest: () => call<{ job: DataJob | null }>('/data/jobs/latest'),
  status: (jobId: string) => call<DataJob>(`/data/jobs/${jobId}`),
}
