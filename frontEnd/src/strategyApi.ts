export const STRATEGY_API_ROOT = (import.meta.env.VITE_STRATEGY_API_URL || 'http://127.0.0.1:8773/api/v1').replace(/\/$/, '')

export interface StrategyFactorOption {
  factor_id: string
  release_id: string
  chinese_name: string
  source_collection: string
  category: string
  expected_direction: 'HIGH' | 'LOW'
  start: string
  end: string
}

export interface ScoreRule {
  factor_id: string
  release_id: string
  direction: 'HIGH' | 'LOW'
  weight: number
  transform: 'PERCENTILE'
}

export interface FilterRule {
  factor_id: string
  release_id: string
  mode: 'EXCLUDE_HIGH' | 'EXCLUDE_LOW'
  fraction: number
  missing_policy: 'EXCLUDE' | 'KEEP'
}

export interface StrategyRequest {
  name: string
  start: string
  end: string
  universe_id: 'ALL-A-PIT'
  score_rules: ScoreRule[]
  filter_rules: FilterRule[]
  exclude_st: boolean
  minimum_listed_sessions: number
  target_count: number
  retention_rank: number
  rebalance_sessions: number
  initial_cash_cny: number
  minimum_cash_fraction: number
  buy_commission_bps: number
  sell_commission_bps: number
  sell_stamp_duty_bps: number
  historical_sell_stamp_duty_bps?: number
  minimum_commission_cny?: number
  transfer_fee_bps?: number
  historical_transfer_fee_bps?: number
  base_slippage_bps: number
  square_root_impact_bps: number
  maximum_slippage_bps: number
  maximum_participation_rate: number
}

export interface StrategyOptions {
  factors: StrategyFactorOption[]
  universes: Array<{ id: string; name: string }>
  defaults: Record<string, number>
}

export interface StrategyPreflight {
  status: 'READY'
  config_id: string
  common_range: { start: string; end: string }
  session_count: number
  factor_count: number
  estimated_rebalances: number
  warnings: string[]
}

export interface StrategyPreview {
  signal_date: string
  base_count: number
  after_filters: number
  score_ready: number
  missing_score_excluded: number
  filter_counts: Array<{ factor_id: string; excluded: number; remaining: number }>
  holdings: Array<{
    rank: number
    ts_code: string
    security_name: string
    score: number
    retained: boolean
    factor_values: Record<string, number>
  }>
}

export interface StrategyResult {
  run_id: string
  created_at: string
  summary: {
    total_return: number
    annualized_return: number
    maximum_drawdown: number
    annualized_volatility: number
    sharpe: number | null
    ending_nav: number
    total_cost: number
    total_commission?: number
    total_stamp_duty?: number
    total_transfer_fee?: number
    total_realized_pnl?: number
    total_dividend_cash?: number
    turnover: number
    rebalance_count: number
    trade_count: number
    filled_trade_count: number
    rejection_counts: Record<string, number>
  }
  annual: Array<{ year: number; return: number }>
  execution_model?: {
    version: string
    spec_hash: string
    price_basis: string
    position_basis: string
    cost_basis_method: string
  }
  daily: Array<{ session: string; nav: number; cash: number; positions: number; daily_return: number; turnover: number; cost: number }>
  benchmark?: {
    benchmark_id: string
    name: string
    symbol: string
    pricing: string
    daily: Array<{ session: string; close: number; return: number }>
    summary: { total_return: number }
  } | null
  drawdown_period?: {
    drawdown: number
    peak_session: string
    trough_session: string
    recovery_session: string | null
    peak_to_trough_sessions: number
    recovery_sessions: number | null
    peak_to_recovery_sessions: number | null
    peak_to_trough_calendar_days: number
    recovery_calendar_days: number | null
    peak_to_recovery_calendar_days: number | null
    recovered: boolean
  } | null
  latest_holdings: string[]
}

export interface StrategyTrade {
  session: string
  rebalance_id: number
  ts_code: string
  security_name: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  amount_cny: number
  commission_cny: number
  stamp_duty_cny: number
  transfer_fee_cny?: number
  total_cost_cny: number
  cost_basis_cny?: number | null
  allocated_dividend_cny?: number | null
  trading_realized_pnl_cny?: number | null
  realized_pnl_cny?: number | null
  realized_pnl_pct?: number | null
  post_quantity: number
  post_security_value_cny?: number | null
  post_invested_value_cny?: number | null
  post_account_value_cny?: number | null
  post_security_weight?: number | null
  post_total_position_weight?: number | null
}

export interface StrategyYearTrades {
  job_id: string
  year: number
  available: boolean
  total: number
  offset?: number
  limit?: number
  performance?: {
    start_nav_cny: number
    end_nav_cny: number
    profit_cny: number
    return: number | null
    dividend_cash_cny: number
  } | null
  summary?: {
    buy_amount_cny: number
    sell_amount_cny: number
    commission_cny?: number
    stamp_duty_cny?: number
    transfer_fee_cny?: number
    total_cost_cny: number
    realized_pnl_cny?: number | null
    rebalance_count: number
  }
  trades: StrategyTrade[]
}

export interface StrategyJob {
  job_id: string
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'STOPPED'
  phase: string
  progress: number
  name: string
  log_tail: string
  result: StrategyResult | null
  created_at?: string
  updated_at?: string
  request?: StrategyRequest
  process_alive?: boolean
  elapsed_seconds?: number
  heartbeat_at?: string | null
  processed_sessions?: number | null
  total_sessions?: number | null
  current_session?: string | null
  rebalance_count?: number | null
  position_count?: number | null
  query_progress?: number | null
  trade_detail_available?: boolean
  execution_model_valid?: boolean
}

export interface StrategyJobHistory extends Omit<StrategyJob, 'log_tail' | 'result'> {
  result_summary: StrategyResult['summary'] | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${STRATEGY_API_ROOT}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || body)
    throw new Error(detail || `请求失败（${response.status}）`)
  }
  return body as T
}

export const strategyApi = {
  health: () => request<{ status: string }>('/health'),
  options: () => request<StrategyOptions>('/strategy/options'),
  preflight: (payload: StrategyRequest) => request<StrategyPreflight>('/strategy/preflight', { method: 'POST', body: JSON.stringify(payload) }),
  preview: (payload: StrategyRequest, previewDate: string) => request<StrategyPreview>('/strategy/preview', { method: 'POST', body: JSON.stringify({ ...payload, preview_date: previewDate }) }),
  start: (payload: StrategyRequest) => request<StrategyJob>('/strategy/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  list: () => request<{ jobs: StrategyJobHistory[] }>('/strategy/jobs'),
  status: (jobId: string) => request<StrategyJob>(`/strategy/jobs/${jobId}`),
  stop: (jobId: string) => request<StrategyJob>(`/strategy/jobs/${jobId}/stop`, { method: 'POST', body: '{}' }),
  delete: (jobId: string) => request<{ job_id: string; deleted: boolean }>(`/strategy/jobs/${jobId}`, { method: 'DELETE' }),
  trades: (jobId: string, year: number, offset = 0) => request<StrategyYearTrades>(`/strategy/jobs/${jobId}/trades?year=${year}&offset=${offset}`),
  reportUrl: (jobId: string) => `${STRATEGY_API_ROOT}/strategy/jobs/${jobId}/report`,
}
