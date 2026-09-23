export type UiStageId = 'm4_1' | 'm4_2' | 'm4_3' | 'm4_4' | 'm4_5' | 'm4_6'

export interface FactorRelease {
  release_id: string
  factor_count: number
  instrument_count: number
  session_count: number
  start: string
  end: string
  variant: string
  factors: Array<{
    factor_id: string
    factor_version: string
    chinese_name: string
    english_name: string
  }>
}

export interface M4Options {
  factor_releases: FactorRelease[]
  stages: Array<{ id: UiStageId; label: string; optional: boolean }>
  holding_sessions: number[]
  processed_variants: string[]
}

export interface RunPayload {
  factor_release_id: string
  stages: UiStageId[]
  window_start: string
  window_end: string
  holding_sessions: number
  quantile_count: number
  minimum_pairs_per_session: number
  processed_variants: string[]
  selection_quantile: number
  capital_scenarios_cny: number[]
  buy_commission_bps: number
  sell_commission_bps: number
  sell_stamp_duty_bps: number
  base_slippage_bps: number
  square_root_impact_bps: number
  maximum_slippage_bps: number
  maximum_participation_rate: number
}

export interface PreflightResult {
  status: 'READY'
  requested_stages: UiStageId[]
  resolved_stages: string[]
  config_id: string
  factor_release_id: string
  holding_sessions: number
  factor_count: number
  warnings: string[]
}

export interface JobStatus {
  job_id: string
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'STOPPED'
  configured_stages: string[]
  completed_stages: string[]
  current_stage: string | null
  report_available: boolean
  explorer_available: boolean
  error: { type: string; message: string; traceback?: string } | null
  log_tail: string
}

export type FactorCategory = '动量' | '波动' | '流动性' | '质量' | '估值' | '风格' | '量价' | '形态'
export type FactorSource = 'ALL' | 'CURRENT' | 'ALPHA158' | 'JQDATA'
export type FactorStatus = 'ALL' | 'M4_COMPLETE' | 'CALCULATED' | 'CALCULATED_VERIFYING' | 'ACCURACY_FAILED' | 'NOT_CALCULATED'

export interface FactorResultSummary {
  mean_test_rank_ic: number | null
  supported_folds: number
  contradicted_folds: number
  fold_count: number
  fill_rate_10m: number | null
  net_return_10m: number | null
  conclusion: string
  tone: 'positive' | 'warning' | 'neutral'
  routes: string[]
}

export interface FactorCatalogItem {
  factor_id: string
  external_name: string | null
  factor_version: string
  chinese_name: string
  english_name: string
  category: FactorCategory
  family: string
  description: string
  formula: string | null
  required_fields: string[]
  window_sessions?: number | null
  source_collection: 'CURRENT' | 'ALPHA158' | 'JQDATA'
  source_label: string
  status: Exclude<FactorStatus, 'ALL'>
  status_label: string
  calculated: boolean
  m4_completed: boolean
  latest_release_id: string | null
  release_count: number
  coverage: { start: string; end: string; coverage?: number | null } | null
  result: FactorResultSummary | null
  accuracy_status: 'PENDING' | 'PASS' | 'FAIL' | 'NOT_REQUIRED' | null
  accuracy_error: string | null
}

export interface FactorCatalogResponse {
  items: FactorCatalogItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  counts: {
    total: number
    calculated: number
    m4_completed: number
    not_calculated: number
    current: number
    alpha158: number
    jqdata: number
  }
  categories: Record<'全部' | FactorCategory, number>
}

export interface FactorComputePayload {
  factor_id: string
  factor_version: string
  start: string
  end: string
}

export interface FactorJobStatus {
  job_id: string
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'STOPPED'
  factor_id: string
  factor_version: string
  start: string
  end: string
  release_id: string | null
  result: {
    cache_hit: boolean
    release_id: string
    factor_id?: string
    row_count?: number
    session_count?: number
    instrument_count?: number
    calculation?: {
      mode: 'FULL' | 'INCREMENTAL' | 'FULL_AFTER_MISMATCH'
      message: string
      parent_release_id?: string
      overlap?: {
        start: string
        end: string
        old_rows: number
        new_rows: number
        different_rows: number
        matched: boolean
      }
    } | null
  } | null
  log_tail: string
  phase: string
  progress: number
  message: string
  elapsed_seconds: number
  accuracy_status: 'PENDING' | 'PASS' | 'FAIL' | 'NOT_REQUIRED' | null
}

export interface FactorBatchPayload {
  factors: Array<{ factor_id: string; factor_version: string }>
  start: string
  end: string
  stages: UiStageId[]
  holding_sessions: number
  quantile_count: number
  minimum_pairs_per_session: number
  processed_variants: string[]
  selection_quantile: number
  capital_scenarios_cny: number[]
  buy_commission_bps: number
  sell_commission_bps: number
  sell_stamp_duty_bps: number
  base_slippage_bps: number
  square_root_impact_bps: number
  maximum_slippage_bps: number
  maximum_participation_rate: number
}

export interface FactorBatchPlan {
  status: 'READY'
  start: string
  end: string
  count: number
  items: Array<{ factor_id: string; name: string; coverage: { start: string; end: string } | null; action: string }>
  requested_stages: UiStageId[]
  resolved_stages: UiStageId[]
  added_stages: UiStageId[]
  estimated_pair_correlations: number
  warnings: string[]
}

export interface FactorBatchStageProgress {
  completed: number
  total: number
  current: string | null
  current_label: string | null
  detail: string | null
  elapsed_seconds: number | null
  steps: Array<{ id: string; label: string; status: 'PASS' | 'RUNNING' | 'WAITING' }>
}

export interface FactorBatchStatus {
  batch_id: string
  status: 'RUNNING' | 'PASS' | 'PARTIAL' | 'FAIL' | 'STOPPED'
  phase: string
  progress: number
  completed: number
  total: number
  completed_steps?: number
  total_steps?: number
  elapsed_seconds?: number
  activity?: { title: string; stage: string | null; detail: string | null; stage_progress: FactorBatchStageProgress | null } | null
  request: FactorBatchPayload
  items: Array<{
    factor_id: string
    name: string
    status: 'WAITING' | 'RUNNING' | 'PASS' | 'FAIL'
    phase: string
    release_id: string | null
    m4_job_id: string | null
    error: string | null
    progress?: number
    factor_years?: { completed: number; total: number }
    stage_progress?: FactorBatchStageProgress | null
  }>
  cohort_job_id: string | null
  cohort_status: 'NOT_RUN' | 'RUNNING' | 'PASS' | 'FAIL' | 'SKIPPED'
  cohort_stage_progress?: FactorBatchStageProgress | null
  error: string | null
  stop_requested: boolean
}

export type FactorAssetStatus = 'ALL' | 'TESTED' | 'RAW_ONLY' | 'WITH_EXECUTION'

export interface FactorAssetVariant {
  variant: 'RAW' | 'WINSORIZED_ZSCORE' | 'SIZE_NEUTRALIZED' | string
  variant_label: string
  release_id: string | null
  coverage: number | null
  mean_rank_ic: number | null
  mean_test_rank_ic_directed: number | null
  quantile_spread: number | null
  top_turnover: number | null
  hac_q_value: number | null
  bootstrap_q_value: number | null
  supported_folds: number
  contradicted_folds: number
  fold_count: number
  deduplication: string | null
  cluster_role: string | null
  execution_status: string
  routes: string[]
}

export interface FactorAssetRun {
  asset_id: string
  job_id: string | null
  report_id: string | null
  factor_release_id: string
  factor_id: string
  factor_version: string
  chinese_name: string
  external_name: string | null
  category: string
  source_collection: 'CURRENT' | 'ALPHA158' | 'JQDATA'
  description: string
  asset_window: { start: string; end: string }
  test_window: { start: string; end: string } | null
  holding_sessions: number | null
  quantile_count: number | null
  minimum_pairs_per_session: number | null
  stage_status: Record<UiStageId | 'm4_7', 'COMPLETED' | 'NOT_RUN'>
  status: string
  status_label: string
  m4_completed: boolean
  variants: FactorAssetVariant[]
  variant_count: number
  has_execution: boolean
  completed_at: string | null
  scope_note: string
}

export interface FactorAssetItem {
  factor_id: string
  factor_version: string
  chinese_name: string
  external_name: string | null
  category: string
  source_collection: 'CURRENT' | 'ALPHA158' | 'JQDATA'
  description: string
  status_label: string
  m4_completed: boolean
  has_execution: boolean
  run_count: number
  tested_run_count: number
  horizons: number[]
  latest_completed_at: string | null
  runs: FactorAssetRun[]
}

export interface FactorAssetResponse {
  items: FactorAssetItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  counts: { total: number; tested: number; raw_only: number; with_execution: number; runs: number; current: number; alpha158: number; jqdata: number }
}
