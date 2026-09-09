import type { FactorAssetResponse, FactorAssetStatus, FactorCatalogResponse, FactorComputePayload, FactorJobStatus, FactorSource, FactorStatus, JobStatus, M4Options, PreflightResult, RunPayload } from './types'

export const API_ROOT = (import.meta.env.VITE_M4_API_URL || 'http://127.0.0.1:8771/api/v1').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
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

export function factorAssets(params: {
  page: number
  pageSize?: number
  query?: string
  horizon?: number | ''
  status?: FactorAssetStatus
}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  return request<FactorAssetResponse>(`/factor-assets?${query}`)
}

export const api = {
  health: () => request<{ status: string }>('/health'),
  options: () => request<M4Options>('/m4/options'),
  preflight: (payload: RunPayload) =>
    request<PreflightResult>('/m4/preflight', { method: 'POST', body: JSON.stringify(payload) }),
  start: (payload: RunPayload) =>
    request<JobStatus>('/m4/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  latest: () => request<{ job: JobStatus | null }>('/m4/jobs/latest'),
  status: (jobId: string) => request<JobStatus>(`/m4/jobs/${jobId}`),
  stop: (jobId: string) => request<JobStatus>(`/m4/jobs/${jobId}/stop`, { method: 'POST', body: '{}' }),
  deleteM4Run: (jobId: string) => request<{ job_id: string; deleted: boolean }>(`/m4/jobs/${jobId}`, { method: 'DELETE' }),
  reportUrl: (jobId: string) => `${API_ROOT}/m4/jobs/${jobId}/report`,
  explorerUrl: (jobId: string) => `${API_ROOT}/m4/jobs/${jobId}/explorer`,
  factorCatalog: (params: {
    page: number
    pageSize?: number
    query?: string
    category?: string
    source?: FactorSource
    status?: FactorStatus
  }) => {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') query.set(key, String(value))
    })
    return request<FactorCatalogResponse>(`/factors/catalog?${query}`)
  },
  startFactorCalculation: (payload: FactorComputePayload) =>
    request<FactorJobStatus>('/factors/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  latestFactorCalculation: () => request<{ job: FactorJobStatus | null }>('/factors/jobs/latest'),
  factorCalculationStatus: (jobId: string) => request<FactorJobStatus>(`/factors/jobs/${jobId}`),
  stopFactorCalculation: (jobId: string) =>
    request<FactorJobStatus>(`/factors/jobs/${jobId}/stop`, { method: 'POST', body: '{}' }),
  factorAssets,
}
