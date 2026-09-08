import { useEffect, useState } from 'react'
import { api } from './api'
import type { FactorCatalogItem, FactorCatalogResponse, FactorCategory, FactorSource, FactorStatus } from './types'

const CATEGORIES: Array<'全部' | FactorCategory> = ['全部', '动量', '波动', '流动性', '质量', '估值', '风格', '量价', '形态']

function decimal(value: number | null, digits = 3) {
  return value === null ? '—' : value.toFixed(digits)
}

function percent(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

export default function FactorLibrary({ selected, onSelect, refreshKey = 0 }: {
  selected: FactorCatalogItem | null
  onSelect: (factor: FactorCatalogItem) => void
  refreshKey?: number
}) {
  const [data, setData] = useState<FactorCatalogResponse | null>(null)
  const [category, setCategory] = useState<'全部' | FactorCategory>('全部')
  const [source, setSource] = useState<FactorSource>('ALL')
  const [status, setStatus] = useState<FactorStatus>('ALL')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 220)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [category, source, status, debouncedSearch])

  useEffect(() => {
    setLoading(true)
    setError('')
    api.factorCatalog({ page, pageSize: 24, query: debouncedSearch, category, source, status })
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [category, source, status, debouncedSearch, page, refreshKey])

  const counts = data?.counts

  return (
    <section className="factor-library">
      <div className="library-heading">
        <div>
          <div className="eyebrow">FACTOR CATALOG · 逐个追踪</div>
          <h2>因子目录与计算状态</h2>
          <p>每个因子单独展示。接入目录不等于算过，算过也不等于通过 M4。</p>
        </div>
        <div className="library-stats">
          <div><strong>{counts?.total ?? '—'}</strong><span>目录总数</span></div>
          <div><strong>{counts?.calculated ?? '—'}</strong><span>已经算值</span></div>
          <div><strong>{counts?.m4_completed ?? '—'}</strong><span>完成 M4</span></div>
          <div><strong>{counts?.not_calculated ?? '—'}</strong><span>等待计算</span></div>
        </div>
      </div>

      <div className="source-tabs">
        <button className={source === 'ALL' ? 'active' : ''} onClick={() => setSource('ALL')}>全部 <span>{counts?.total ?? 0}</span></button>
        <button className={source === 'CURRENT' ? 'active' : ''} onClick={() => setSource('CURRENT')}>现有因子 <span>{counts?.current ?? 0}</span></button>
        <button className={source === 'ALPHA158' ? 'active' : ''} onClick={() => setSource('ALPHA158')}>Alpha158 <span>{counts?.alpha158 ?? 0}</span></button>
        <button className={source === 'JQDATA' ? 'active' : ''} onClick={() => setSource('JQDATA')}>JQDATA <span>{counts?.jqdata ?? 0}</span></button>
      </div>

      <div className="category-tabs">
        {CATEGORIES.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}<small>{data?.categories[name] ?? 0}</small></button>)}
      </div>

      <div className="catalog-tools">
        <div className="catalog-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索中文名、英文名或因子编号" /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value as FactorStatus)}>
          <option value="ALL">全部计算状态</option>
          <option value="M4_COMPLETE">M4 已完成</option>
          <option value="CALCULATED">已算值，未跑完 M4</option>
          <option value="NOT_CALCULATED">未计算</option>
        </select>
        <span className="filtered-count">当前显示 {data?.totalItems ?? 0} 个</span>
      </div>

      {error && <div className="catalog-message error">目录读取失败：{error}</div>}
      {loading && <div className="catalog-message">正在读取因子目录和已有证据…</div>}
      {!loading && data?.items.length === 0 && <div className="catalog-message">当前筛选条件下没有因子。</div>}

      {!loading && <div className="factor-card-grid">
        {data?.items.map((factor) => <article className={`factor-card status-${factor.status.toLowerCase()} ${selected?.factor_id === factor.factor_id ? 'selected-factor' : ''}`} key={`${factor.factor_id}-${factor.factor_version}`}>
          <div className="factor-card-head">
            <span className={`source-tag ${factor.source_collection.toLowerCase()}`}>{factor.source_collection === 'ALPHA158' ? 'ALPHA158' : factor.source_collection === 'JQDATA' ? 'JQDATA' : '现有'}</span>
            <span className="category-tag">{factor.category}</span>
            <span className="factor-status"><i />{factor.status_label}</span>
          </div>
          <h3>{factor.chinese_name}</h3>
          <code>{factor.external_name || factor.factor_id} · v{factor.factor_version}</code>
          <p>{factor.description}</p>

          <button className="factor-select" onClick={() => onSelect(factor)}>
            {selected?.factor_id === factor.factor_id ? '✓ 已选为本次运行对象' : factor.calculated ? '选择并复现这个因子' : '选择并计算这个因子'}
          </button>

          {factor.result ? <>
            <div className="factor-metrics">
              <div><span>平均测试 RankIC</span><strong>{decimal(factor.result.mean_test_rank_ic)}</strong></div>
              <div><span>支持方向</span><strong>{factor.result.supported_folds}/{factor.result.fold_count} 折</strong></div>
              <div><span>千万资金成交率</span><strong>{percent(factor.result.fill_rate_10m)}</strong></div>
            </div>
            <div className={`factor-conclusion ${factor.result.tone}`}>{factor.result.conclusion}</div>
          </> : <div className="not-computed"><span>尚无数值和收益检验结果</span><b>等待计算</b></div>}

          <details>
            <summary>查看定义与数据状态</summary>
            <dl>
              <div><dt>内部编号</dt><dd>{factor.factor_id}</dd></div>
              <div><dt>来源</dt><dd>{factor.source_label}</dd></div>
              <div><dt>公式</dt><dd><code>{factor.formula || '—'}</code></dd></div>
              <div><dt>所需字段</dt><dd>{factor.required_fields.join('、') || '—'}</dd></div>
              {factor.coverage && <div><dt>已算区间</dt><dd>{factor.coverage.start} 至 {factor.coverage.end}</dd></div>}
            </dl>
          </details>
        </article>)}
      </div>}

      {data && data.totalPages > 1 && <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← 上一页</button>
        <span>第 {page} / {data.totalPages} 页</span>
        <button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>下一页 →</button>
      </div>}
    </section>
  )
}
