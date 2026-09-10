import { useCallback, useEffect, useState } from 'react'
import { strategyApi } from './strategyApi'
import type { StrategyJob, StrategyJobHistory } from './strategyApi'

function percent(value: number | null | undefined) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}

function number(value: number | null | undefined, digits = 2) {
  return value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

function dateTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}

function cleanName(value: string) {
  return value.replace(/[?？]/g, '').trim() ? value : '未命名策略'
}

const STATUS_LABEL: Record<StrategyJobHistory['status'], string> = {
  RUNNING: '回测中', PASS: '已完成', FAIL: '失败', STOPPED: '已停止',
}

function YearlyTransactions({ jobId, annual, available }: { jobId: string; annual: Array<{ year: number; return: number }>; available: boolean }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, Awaited<ReturnType<typeof strategyApi.trades>>>>({})
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async (year: number, offset = 0) => {
    setLoading(year)
    setError('')
    try {
      const loaded = await strategyApi.trades(jobId, year, offset)
      setDetails((current) => ({
        ...current,
        [year]: loaded,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(null)
    }
  }

  const select = (year: number) => {
    if (selectedYear === year) { setSelectedYear(null); return }
    setSelectedYear(year)
    if (!details[year]) void load(year)
  }

  const detail = selectedYear == null ? null : details[selectedYear]
  const pageOffset = detail?.offset || 0
  const pageLimit = detail?.limit || 100
  const pageStart = detail?.total ? pageOffset + 1 : 0
  const pageEnd = detail ? Math.min(pageOffset + detail.trades.length, detail.total) : 0
  return <section className="history-annual history-transactions">
    <h3>逐年收益与成交明细</h3>
    <div className="history-year-tabs">{annual.map((item) => <button key={item.year} className={selectedYear === item.year ? 'active' : ''} onClick={() => select(item.year)}><i>{item.year}</i><b>{percent(item.return)}</b><small>查看交易</small></button>)}</div>
    {!available && <p className="history-trade-note">该历史回测未保存逐笔成交；之后新完成的回测会自动提供此明细。</p>}
    {selectedYear != null && available && <div className="history-trade-detail">
      {loading === selectedYear && !detail ? <p className="history-trade-note">正在读取 {selectedYear} 年成交记录…</p> : error ? <p className="history-trade-error">读取失败：{error}</p> : detail && <>
        {!detail.available ? <p className="history-trade-note">该历史回测未保存逐笔成交。</p> : <>
          <div className="history-trade-summary">
            <span>成交 <b>{detail.total}</b> 笔</span>
            <span>调仓 <b>{detail.summary?.rebalance_count || 0}</b> 次</span>
            <span>买入 <b>¥{number(detail.summary?.buy_amount_cny, 0)}</b></span>
            <span>卖出 <b>¥{number(detail.summary?.sell_amount_cny, 0)}</b></span>
            <span>费用 <b>¥{number(detail.summary?.total_cost_cny, 2)}</b></span>
            {detail.performance?.profit_cny != null && detail.performance.return != null
              ? <span className={detail.performance.profit_cny >= 0 ? 'profit' : 'loss'}>
                  本年净值收益 <b>{detail.performance.profit_cny >= 0 ? '+' : ''}¥{number(detail.performance.profit_cny, 2)}（{percent(detail.performance.return)}）</b>
                </span>
              : <span className="history-summary-unavailable">本年净值收益 <b>数据不可用</b></span>}
            {detail.summary?.realized_pnl_cny != null
              ? <span className={detail.summary.realized_pnl_cny >= 0 ? 'profit' : 'loss'}>
                  卖出已实现盈亏 <b>{detail.summary.realized_pnl_cny >= 0 ? '+' : ''}¥{number(detail.summary.realized_pnl_cny, 2)}</b>
                </span>
              : <span className="history-summary-unavailable">卖出已实现盈亏 <b>暂无卖出</b></span>}
          </div>
          <p className="history-trade-explain">本年净值收益按年初、年末账户净值计算；卖出已实现盈亏按股票自买入以来的移动平均成本计算并包含对应现金分红。仓位比例均为成交完成后的即时值：该股占总资产＝该股市值÷账户总资产，总仓位＝全部持仓市值÷账户总资产。同一批调仓按实际执行顺序先卖后买，因此总仓位会先下降、再回升。</p>
          {detail.total === 0 ? <p className="history-trade-note">该年度没有实际成交。</p> : <div className="history-trade-table">
            <div className="history-trade-head"><span>日期 / 批次</span><span>股票</span><span>方向</span><span>成交股数</span><span>成交价</span><span>成交金额</span><span>费用明细</span><span>卖出已实现盈亏</span><span>成交后该股</span><span>成交后总仓位</span></div>
            {detail.trades.map((trade, index) => <div className="history-trade-row" key={`${trade.session}-${trade.rebalance_id}-${trade.ts_code}-${trade.side}-${index}`}>
              <span className="trade-date">{trade.session}<small>第 {trade.rebalance_id} 次调仓</small></span>
              <span><b>{trade.security_name}</b><small>{trade.ts_code}</small></span>
              <strong className={trade.side === 'BUY' ? 'buy' : 'sell'}>{trade.side === 'BUY' ? '买入' : '卖出'}</strong>
              <b>{number(trade.quantity, 0)} 股</b>
              <b>¥{number(trade.price, 2)}</b>
              <b>¥{number(trade.amount_cny, 2)}</b>
              <span className="trade-fees">¥{number(trade.total_cost_cny, 2)}<small>佣 {number(trade.commission_cny, 2)} · 税 {trade.side === 'SELL' ? number(trade.stamp_duty_cny, 2) : '—'} · 过 {number(trade.transfer_fee_cny, 2)}</small></span>
              {trade.side === 'SELL' && trade.realized_pnl_cny != null
                ? <b className={trade.realized_pnl_cny >= 0 ? 'trade-profit' : 'trade-loss'} title="成交收入减卖出费用和对应持仓成本，并计入持有期间已取得的现金分红">{trade.realized_pnl_cny >= 0 ? '+' : ''}¥{number(trade.realized_pnl_cny, 2)}<small>{percent(trade.realized_pnl_pct)}{(trade.allocated_dividend_cny || 0) > 0 ? ` · 含分红 ¥${number(trade.allocated_dividend_cny, 2)}` : ''}</small></b>
                : <span className="trade-na">—</span>}
              {trade.post_security_weight != null
                ? <b className="trade-position" title="该股市值 ÷ 成交后账户总资产">{number(trade.post_quantity, 0)} 股<small>市值 ¥{number(trade.post_security_value_cny, 2)} · 占总资产 {percent(trade.post_security_weight)}</small></b>
                : <span className="trade-na" title="旧回测没有保存逐笔仓位快照，请重新运行回测">需重跑</span>}
              {trade.post_total_position_weight != null
                ? <b className="trade-position trade-portfolio" title="全部持仓市值 ÷ 成交后账户总资产">总仓位 {percent(trade.post_total_position_weight)}<small>持仓 ¥{number(trade.post_invested_value_cny, 2)}</small></b>
                : <span className="trade-na" title="旧回测没有保存逐笔仓位快照，请重新运行回测">需重跑</span>}
            </div>)}
          </div>}
          {detail.total > pageLimit && <div className="history-trade-pagination">
            <span>当前显示第 {pageStart}–{pageEnd} 笔，共 {detail.total} 笔</span>
            <button disabled={loading === selectedYear || pageOffset === 0} onClick={() => void load(selectedYear, Math.max(0, pageOffset - pageLimit))}>上一页</button>
            <button disabled={loading === selectedYear || pageEnd >= detail.total} onClick={() => void load(selectedYear, pageOffset + pageLimit)}>{loading === selectedYear ? '正在加载…' : '下一页'}</button>
          </div>}
        </>}
      </>}
    </div>}
  </section>
}

function RotationComparison({ result }: { result: NonNullable<StrategyJob['result']> }) {
  if (!result.rotation || result.daily.length < 2) return null
  const series = [
    { id: 'joint', name: '轮动账户', values: result.daily.map((item) => item.nav / result.daily[0].nav - 1) },
    ...result.rotation.candidate_shadows.map((shadow) => ({ id: shadow.candidate_id, name: shadow.name, values: shadow.daily.map((item) => item.nav / shadow.daily[0].nav - 1) })),
  ]
  const all = series.flatMap((item) => item.values)
  const low = Math.min(0, ...all); const high = Math.max(0, ...all)
  const x = (index: number) => 20 + index / (result.daily.length - 1) * 960
  const y = (value: number) => 12 + (high - value) / (high - low || 1) * 176
  const colors = ['#176a48', '#72915f', '#c07743', '#5a76a5', '#8d5b91']
  return <section className="rotation-history-chart"><h3>轮动净值与候选影子净值</h3><div className="rotation-chart-legend">{series.map((item, index) => <span key={item.id}><i style={{ background: colors[index % colors.length] }} />{item.name} <b>{percent(item.values.at(-1))}</b></span>)}</div><svg viewBox="0 0 1000 205" preserveAspectRatio="none" role="img" aria-label="轮动账户与候选组合收益走势"><line x1="20" x2="980" y1={y(0)} y2={y(0)} />{series.map((item, seriesIndex) => <polyline key={item.id} style={{ stroke: colors[seriesIndex % colors.length] }} points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />)}</svg><div className="rotation-switch-list">{result.rotation.decisions.filter((item) => item.switched).slice(-20).map((item) => <span key={item.signal_session}><b>{item.signal_session}</b> → {item.active_candidate_id}<small>次日 {item.execution_session} 执行 · 目标 {item.target_stock_count}只</small></span>)}</div></section>
}

function Detail({ job }: { job: StrategyJob }) {
  const request = job.request
  const rotationRequest = request && 'candidates' in request ? request : null
  const factorRequest = request && 'score_rules' in request ? request : null
  const result = job.result
  return <div className="history-detail">
    {job.status === 'PASS' && !job.execution_model_valid && <div className="history-invalid-result"><b>旧成交模型结果已失效</b><span>该结果未按整数股、最低佣金和历史税费规则计算，仅保留用于审计对照，请重新运行。</span></div>}
    <section><h3>策略配置</h3><dl>
      <div><dt>任务编号</dt><dd><code>{job.job_id}</code></dd></div>
      <div><dt>回测区间</dt><dd>{request?.start} → {request?.end}</dd></div>
      <div><dt>策略类型</dt><dd>{rotationRequest ? '多组合轮动' : '因子选股'}</dd></div>
      {factorRequest && <div><dt>持股 / 保留排名</dt><dd>{factorRequest.target_count} / {factorRequest.retention_rank}</dd></div>}
      {factorRequest && <div><dt>调仓间隔</dt><dd>{factorRequest.rebalance_sessions} 个交易日</dd></div>}
      {rotationRequest && <div><dt>候选组合</dt><dd>{rotationRequest.candidates.length} 个</dd></div>}
      {rotationRequest && <div><dt>轮动规则</dt><dd>{rotationRequest.signal.lookback_sessions}日回看 · 阈值 {percent(rotationRequest.signal.switch_threshold)}</dd></div>}
      <div><dt>初始资金</dt><dd>¥{number(request?.initial_cash_cny, 0)}</dd></div>
      <div><dt>现金保留</dt><dd>{percent(rotationRequest?.allocation.minimum_cash_fraction ?? factorRequest?.minimum_cash_fraction)}</dd></div>
    </dl></section>
    {factorRequest && <section><h3>评分因子</h3><div className="detail-rules">{factorRequest.score_rules.map((rule) => <div key={rule.factor_id}><b>{rule.factor_id}</b><span>{rule.direction === 'HIGH' ? '高值优先' : '低值优先'} · 权重 {number(rule.weight)}%</span></div>)}</div></section>}
    {factorRequest && <section><h3>过滤规则</h3><div className="detail-rules">{factorRequest.filter_rules.length ? factorRequest.filter_rules.map((rule) => <div key={rule.factor_id}><b>{rule.factor_id}</b><span>{rule.mode === 'EXCLUDE_HIGH' ? '排除最高' : '排除最低'} {percent(rule.fraction)} · {rule.missing_policy === 'EXCLUDE' ? '缺失排除' : '缺失保留'}</span></div>) : <span className="detail-none">无过滤规则</span>}</div></section>}
    {rotationRequest && <section><h3>候选组合与因子</h3><div className="detail-rules">{rotationRequest.candidates.map((candidate) => <div key={candidate.candidate_id}><b>{candidate.name}</b><span>{candidate.score_rules.map((rule) => `${rule.factor_id}（${rule.direction === 'HIGH' ? '高' : '低'}）`).join(' · ')} · 持股 {candidate.target_count}</span></div>)}</div></section>}
    {result?.rotation && <section><h3>轮动执行</h3><dl><div><dt>判断次数</dt><dd>{result.rotation.decision_count}</dd></div><div><dt>实际切换</dt><dd>{result.rotation.switch_count}</dd></div><div><dt>当前组合</dt><dd>{result.rotation.decisions.at(-1)?.active_candidate_id || '—'}</dd></div></dl></section>}
    {result?.rotation && <RotationComparison result={result} />}
    <section><h3>交易与结果</h3><dl>
      <div><dt>买 / 卖佣金</dt><dd>{number(request?.buy_commission_bps)} / {number(request?.sell_commission_bps)} bps</dd></div>
      <div><dt>最低佣金</dt><dd>¥{number(request?.minimum_commission_cny ?? 5, 2)} / 笔</dd></div>
      <div><dt>卖出印花税</dt><dd>2023-08-28 前 10 bps，之后 {number(request?.sell_stamp_duty_bps)} bps</dd></div>
      <div><dt>过户费</dt><dd>买卖双向 {number(request?.transfer_fee_bps ?? 0.1)} bps</dd></div>
      <div><dt>基础滑点</dt><dd>{number(request?.base_slippage_bps)} bps</dd></div>
      <div><dt>期末净值</dt><dd>{number(result?.summary.ending_nav, 4)}</dd></div>
      <div><dt>总成本</dt><dd>¥{number(result?.summary.total_cost, 0)}</dd></div>
      <div><dt>卖出已实现盈亏（含分红）</dt><dd>¥{number(result?.summary.total_realized_pnl, 2)}</dd></div>
      <div><dt>调仓 / 成交</dt><dd>{number(result?.summary.rebalance_count, 0)} / {number(result?.summary.filled_trade_count, 0)}</dd></div>
      <div><dt>年化波动</dt><dd>{percent(result?.summary.annualized_volatility)}</dd></div>
    </dl></section>
    {result?.annual.length ? <section className="history-annual"><h3>逐年收益</h3><div>{result.annual.map((item) => <span key={item.year}><i>{item.year}</i><b>{percent(item.return)}</b></span>)}</div></section> : null}
    {result?.annual.length ? <YearlyTransactions jobId={job.job_id} annual={result.annual} available={Boolean(job.trade_detail_available)} /> : null}
  </div>
}

export default function StrategyBacktestHistory({ onOpenRunning }: { onOpenRunning: (strategyType?: string) => void }) {
  const [jobs, setJobs] = useState<StrategyJobHistory[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, StrategyJob>>({})
  const [detailLoading, setDetailLoading] = useState('')
  const [deleting, setDeleting] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await strategyApi.list()
      setJobs(response.jobs)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleDetail = async (jobId: string) => {
    if (expanded === jobId) { setExpanded(null); return }
    setExpanded(jobId)
    if (details[jobId]) return
    setDetailLoading(jobId)
    try {
      const detail = await strategyApi.status(jobId)
      setDetails((current) => ({ ...current, [jobId]: detail }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDetailLoading('')
    }
  }

  const deleteJob = async (job: StrategyJobHistory) => {
    if (job.status === 'RUNNING') return
    if (!window.confirm(`确定删除“${cleanName(job.name)}”吗？\n\n任务 ${job.job_id} 的配置、日志和结果文件都会被永久删除。`)) return
    setDeleting(job.job_id)
    setError('')
    try {
      await strategyApi.delete(job.job_id)
      setJobs((current) => current.filter((item) => item.job_id !== job.job_id))
      setDetails((current) => { const next = { ...current }; delete next[job.job_id]; return next })
      if (expanded === job.job_id) setExpanded(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDeleting('')
    }
  }

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!jobs.some((item) => item.status === 'RUNNING')) return
    const timer = window.setInterval(() => void load(), 1500)
    return () => window.clearInterval(timer)
  }, [jobs, load])

  return <div className="strategy-history-page">
    <div className="strategy-history-heading">
      <div><span>BACKTEST ARCHIVE</span><h1>历史回测结果</h1><p>一行查看核心结果；点击详情查看完整配置，也可以清理不需要的记录。</p></div>
      <button onClick={() => void load()} disabled={loading}>{loading ? '正在刷新…' : '刷新列表'}</button>
    </div>
    {error && <div className="strategy-error"><b>读取失败</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {!loading && !error && jobs.length === 0 && <div className="history-empty"><b>还没有回测记录</b><span>启动回测后，任务会自动出现在这里。</span></div>}
    {jobs.length > 0 && <div className="history-table">
      <div className="history-table-head"><span>策略 / 时间</span><span>回测区间</span><span>累计收益</span><span>年化收益</span><span>最大回撤</span><span>夏普</span><span>状态</span><span /></div>
      {jobs.map((job) => <div className={`history-table-item ${job.status.toLowerCase()}`} key={job.job_id}>
        <div className="history-main-row">
          <span className="history-name"><b>{cleanName(job.name)}</b><small>{job.strategy_type === 'ROTATION' ? '轮动回测 · ' : '因子策略 · '}{dateTime(job.created_at)}</small></span>
          <span>{job.request?.start || '—'}<small>至 {job.request?.end || '—'}</small></span>
          <strong>{percent(job.result_summary?.total_return)}</strong>
          <strong>{percent(job.result_summary?.annualized_return)}</strong>
          <strong>{percent(job.result_summary?.maximum_drawdown)}</strong>
          <strong>{job.result_summary?.sharpe?.toFixed(2) ?? '—'}</strong>
          <span className={`history-status ${job.status === 'PASS' && !job.execution_model_valid ? 'invalid' : ''}`}><i />{job.status === 'RUNNING' ? `${job.phase} ${job.progress}%` : job.status === 'PASS' && !job.execution_model_valid ? '旧模型失效' : STATUS_LABEL[job.status]}</span>
          <span className="history-row-actions"><button className="history-detail-button" onClick={() => void toggleDetail(job.job_id)}>{expanded === job.job_id ? '收起' : '详情'}</button><button className="history-delete-button" disabled={job.status === 'RUNNING' || deleting === job.job_id} title={job.status === 'RUNNING' ? '运行中的任务不能删除' : '删除这条回测记录'} onClick={() => void deleteJob(job)}>{deleting === job.job_id ? '…' : '删除'}</button></span>
        </div>
        {job.status === 'RUNNING' && <div className="history-inline-progress"><i style={{ width: `${job.progress}%` }} /></div>}
        {expanded === job.job_id && <div className="history-detail-wrap">
          {detailLoading === job.job_id ? <div className="history-detail-loading">正在读取详细结果…</div> : details[job.job_id] && <Detail job={details[job.job_id]} />}
          <div className="history-detail-actions">{job.status === 'RUNNING' ? <button onClick={() => onOpenRunning(job.strategy_type)}>返回运行控制台 →</button> : <a href={strategyApi.reportUrl(job.job_id)} target="_blank">打开原始 JSON 报告 →</a>}</div>
        </div>}
      </div>)}
    </div>}
  </div>
}
