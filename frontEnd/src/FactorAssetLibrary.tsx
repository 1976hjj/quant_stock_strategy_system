import { useEffect, useState } from 'react'
import { api, factorAssets } from './api'
import type { FactorAssetItem, FactorAssetResponse, FactorAssetRun, FactorAssetStatus } from './types'

const STAGES = ['m4_1', 'm4_2', 'm4_3', 'm4_4', 'm4_5', 'm4_6'] as const

function number(value: number | null, digits = 3) {
  return value === null || value === undefined ? '—' : value.toFixed(digits)
}

function percent(value: number | null) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

function compact(value: string | null) {
  if (!value) return '—'
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-7)}` : value
}

function runLabel(run: FactorAssetRun) {
  const scope = run.test_window
    ? `${run.test_window.start} → ${run.test_window.end} · 未来 ${run.holding_sessions} 日`
    : `${run.asset_window.start} → ${run.asset_window.end} · 尚未检验`
  const completed = run.completed_at ? new Date(run.completed_at).toLocaleString('zh-CN', { hour12: false }) : ''
  const parameters = run.test_window ? ` · ${run.quantile_count || '—'} 组 · 最少 ${run.minimum_pairs_per_session || '—'} 样本` : ''
  const state = run.status === 'PASS' ? '' : ` · ${run.status === 'RAW_ONLY' ? '仅因子值' : '未完成'}`
  return `${scope}${parameters}${completed ? ` · ${completed}` : ''}${state}`
}

function AssetCard({ asset, onDeleted }: { asset: FactorAssetItem; onDeleted: () => void }) {
  const [selectedRunId, setSelectedRunId] = useState(asset.runs[0]?.asset_id || '')
  const [deleting, setDeleting] = useState(false)
  const run = asset.runs.find((item) => item.asset_id === selectedRunId) || asset.runs[0]
  if (!run) return null

  const deleteRun = async () => {
    if (!run.job_id || deleting) return
    const accepted = window.confirm(
      `删除这次运行记录吗？\n\n${runLabel(run)}\n\n因子原始值和共享证据缓存不会删除，但这次结果将不再出现在资产库。`,
    )
    if (!accepted) return
    setDeleting(true)
    try {
      await api.deleteM4Run(run.job_id)
      onDeleted()
    } catch (reason) {
      window.alert(`删除失败：${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      setDeleting(false)
    }
  }

  return <article className="asset-card">
    <div className="asset-title-row">
      <div><div className="asset-tags"><span>{asset.source_collection === 'ALPHA158' ? 'ALPHA158' : '现有因子'}</span><span>{asset.category}</span></div><h2>{asset.chinese_name}</h2><code>{asset.external_name || asset.factor_id} · v{asset.factor_version}</code></div>
      <div className="asset-overall-status"><b className={asset.m4_completed ? 'complete' : asset.tested_run_count ? 'partial' : 'raw'}>{asset.status_label}</b><span>{asset.run_count} 次运行 · {asset.horizons.length ? `${asset.horizons.join(' / ')} 日口径` : '尚未检验'}</span></div>
    </div>

    {asset.run_count > 1 && <div className="run-switcher">
      <div><span>当前查看的检验记录</span><b>不同日期和参数分别保存，切换后查看对应结果</b></div>
      <select value={run.asset_id} onChange={(event) => setSelectedRunId(event.target.value)} aria-label="选择检验记录">
        {asset.runs.map((item, index) => <option value={item.asset_id} key={item.asset_id}>{index === 0 ? '最新 · ' : ''}{runLabel(item)}</option>)}
      </select>
    </div>}

    <div className="scope-strip">
      <div><span>因子值范围</span><b>{run.asset_window.start} → {run.asset_window.end}</b></div>
      <div><span>实际检验范围</span><b>{run.test_window ? `${run.test_window.start} → ${run.test_window.end}` : '尚未检验'}</b></div>
      <div><span>预测口径</span><b>{run.holding_sessions ? `未来 ${run.holding_sessions} 日收益` : '—'}</b></div>
      <div><span>分组 / 最少样本</span><b>{run.quantile_count || '—'} 组 / {run.minimum_pairs_per_session || '—'}</b></div>
      <div><span>处理版本</span><b>{run.variant_count} 个</b></div>
    </div>
    <p className="scope-note">{run.scope_note}</p>

    <div className="asset-stages">{STAGES.map((stage) => <span className={run.stage_status[stage] === 'COMPLETED' ? 'done' : ''} key={stage}>{stage.toUpperCase()} {run.stage_status[stage] === 'COMPLETED' ? '✓' : '未测'}</span>)}</div>

    {run.variants.length ? <div className="variant-results">{run.variants.map((variant) => <section key={variant.variant}>
      <div className="variant-head"><h3>{variant.variant_label}</h3><code>{variant.variant}</code></div>
      <div className="variant-metrics">
        <div><span>全区间 RankIC</span><b>{number(variant.mean_rank_ic)}</b></div>
        <div><span>滚动测试 RankIC</span><b>{number(variant.mean_test_rank_ic_directed)}</b></div>
        <div><span>支持折数</span><b>{variant.supported_folds}/{variant.fold_count}</b></div>
        <div><span>覆盖率</span><b>{percent(variant.coverage)}</b></div>
        <div><span>多空组收益差</span><b>{percent(variant.quantile_spread)}</b></div>
        <div><span>头部换手率</span><b>{percent(variant.top_turnover)}</b></div>
      </div>
      <div className="variant-foot"><span>{variant.deduplication === 'COLLAPSE_NEAR_DUPLICATE' ? '与其他版本近似，已合并看待' : variant.cluster_role === 'CLUSTER_MEMBER' ? '同类簇成员' : '保留为代表版本'}</span><code>{compact(variant.release_id)}</code></div>
    </section>)}</div> : <div className="raw-only-result"><b>目前只有 RAW 因子值</b><span>运行 M4.1 后才会出现收益关系；运行 M4.2 并选择处理版本后，才会出现三版本比较。</span></div>}

    <div className="asset-footer"><span>因子版本：{compact(run.factor_release_id)}</span><span>{run.completed_at ? new Date(run.completed_at).toLocaleString('zh-CN') : ''}</span><div>{run.job_id && <><a href={api.reportUrl(run.job_id)} target="_blank">运行报告 ↗</a>{run.stage_status.m4_7 === 'COMPLETED' && <a href={api.explorerUrl(run.job_id)} target="_blank">完整证据页 ↗</a>}<button className="delete-run" disabled={deleting} onClick={deleteRun}>{deleting ? '正在删除…' : '删除本次运行'}</button></>}</div></div>
  </article>
}

export default function FactorAssetLibrary() {
  const [data, setData] = useState<FactorAssetResponse | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [horizon, setHorizon] = useState<number | ''>('')
  const [status, setStatus] = useState<FactorAssetStatus>('ALL')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 220)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => setPage(1), [debounced, horizon, status])

  useEffect(() => {
    setLoading(true)
    setError('')
    factorAssets({ page, pageSize: 10, query: debounced, horizon, status })
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [page, debounced, horizon, status, refreshKey])

  return <section className="asset-library">
    <div className="asset-heading">
      <div><div className="eyebrow">FACTOR ASSET LIBRARY</div><h1>因子资产库</h1><p>这里保存已经生成的因子值和每一次实际检验口径。不同日期、持仓期和处理版本不会混成一个结论。</p></div>
      <div className="asset-stats">
        <div><strong>{data?.counts.total ?? '—'}</strong><span>因子资产</span></div>
        <div><strong>{data?.counts.tested ?? '—'}</strong><span>已有收益检验</span></div>
        <div><strong>{data?.counts.raw_only ?? '—'}</strong><span>仅有 RAW</span></div>
        <div><strong>{data?.counts.runs ?? '—'}</strong><span>累计运行记录</span></div>
      </div>
    </div>

    <div className="asset-filters">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索中文名、英文名或因子编号" />
      <select value={horizon} onChange={(event) => setHorizon(event.target.value ? Number(event.target.value) : '')}>
        <option value="">全部预测周期</option><option value="5">未来 5 日</option><option value="10">未来 10 日</option><option value="20">未来 20 日</option><option value="30">未来 30 日</option>
      </select>
      <select value={status} onChange={(event) => setStatus(event.target.value as FactorAssetStatus)}>
        <option value="ALL">全部状态</option><option value="TESTED">已有 M4 检验</option><option value="RAW_ONLY">仅有 RAW</option><option value="WITH_EXECUTION">已跑 M4.6</option>
      </select>
      <span>找到 {data?.totalItems ?? 0} 个因子</span>
    </div>

    {error && <div className="catalog-message error">资产库读取失败：{error}</div>}
    {loading && <div className="catalog-message">正在整理因子版本和历次检验结果…</div>}
    {!loading && !data?.items.length && <div className="catalog-message">当前筛选条件下没有资产。</div>}

    {!loading && <div className="asset-list">{data?.items.map((asset) => <AssetCard asset={asset} key={asset.factor_id} onDeleted={() => setRefreshKey((value) => value + 1)} />)}</div>}

    {data && data.totalPages > 1 && <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← 上一页</button><span>第 {page} / {data.totalPages} 页</span><button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页 →</button></div>}
  </section>
}
