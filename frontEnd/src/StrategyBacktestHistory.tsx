import { useCallback, useEffect, useRef, useState } from 'react'
import { strategyApi } from './strategyApi'
import ShadowTimeline from './ShadowTimeline'
import { EquityChart } from './StrategyBacktest'
import ChartTimeRange, { useChartTimeRange } from './ChartTimeRange'
import { Curve, TakeProfitResults } from './QualityStrategies'
import type { StrategyJob, StrategyJobHistory, StrategyTrade, UniverseSegment } from './strategyApi'

function percent(value: number | null | undefined) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}

function number(value: number | null | undefined, digits = 2) {
  return value == null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits })
}

function dateTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'
}

function runDay(value?: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value))
}

function cleanName(value: string) {
  return value.replace(/[?？]/g, '').trim() ? value : '未命名策略'
}

const UNIVERSE_SEGMENT_LABELS: Record<UniverseSegment, string> = {
  SH_MAIN: '沪市主板',
  SZ_MAIN: '深市主板',
  CHINEXT: '创业板',
  STAR: '科创板',
  BSE: '北交所',
}

function universeScope(request: StrategyJob['request']) {
  const segments = request && 'universe_segments' in request ? request.universe_segments : undefined
  if (segments?.length) return segments.map((segment) => UNIVERSE_SEGMENT_LABELS[segment]).join(' · ')
  return request?.universe_id === 'ALL-A-PIT' ? '全A股票池（历史记录）' : '未保存（旧记录）'
}

function universeScopeSummary(request: StrategyJob['request']) {
  const segments = request && 'universe_segments' in request ? request.universe_segments : undefined
  if (!segments?.length) return request?.universe_id === 'ALL-A-PIT' ? '全A股' : '未保存'
  if (segments.length === Object.keys(UNIVERSE_SEGMENT_LABELS).length) return '全A股'
  return segments.map((segment) => UNIVERSE_SEGMENT_LABELS[segment]).join(' · ')
}

function rebalanceIntervalSummary(request: StrategyJob['request']) {
  if (!request) return '—'
  if ('rebalance_sessions' in request) return `${request.rebalance_sessions}日`
  if (!('candidates' in request) || !Array.isArray(request.candidates)) return '—'
  const intervals = [...new Set(request.candidates.map((candidate) => candidate.rebalance_sessions))]
  return intervals.length === 1 ? `${intervals[0]}日` : `${intervals.join(' / ')}日`
}

function displayedCostPrice(trade: StrategyTrade) {
  if (trade.post_average_cost_price != null) {
    return { value: trade.post_average_cost_price, label: '成交后持仓均价' }
  }
  if (trade.side === 'SELL' && trade.cost_basis_cny != null && trade.quantity) {
    return { value: trade.cost_basis_cny / trade.quantity, label: '卖出对应成本' }
  }
  if (trade.side === 'BUY' && trade.quantity) {
    return { value: (trade.amount_cny + trade.total_cost_cny) / trade.quantity, label: '该笔买入成本' }
  }
  return { value: null, label: '成本数据未保存' }
}

const STATUS_LABEL: Record<StrategyJobHistory['status'], string> = {
  QUEUED: '等待队列中', RUNNING: '回测中', STOPPING: '正在停止并清理', PASS: '已完成', FAIL: '失败', STOPPED: '已停止',
}

function YearlyTransactions({ jobId, annual, available, source }: { jobId: string; annual: Array<{ year: number; return: number }>; available: boolean; source?: string }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, Awaited<ReturnType<typeof strategyApi.trades>>>>({})
  const [loading, setLoading] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async (year: number, offset = 0) => {
    setLoading(year)
    setError('')
    try {
      const loaded = await strategyApi.historyTrades(jobId, year, offset, source)
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
            <div className="history-trade-head"><span>日期 / 批次</span><span>股票</span><span>方向</span><span>成交股数</span><span>成交价</span><span>成本价</span><span>成交金额</span><span>费用明细</span><span>卖出已实现盈亏</span><span>成交后该股</span><span>成交后总仓位</span></div>
            {detail.trades.map((trade, index) => <div className="history-trade-row" key={`${trade.session}-${trade.rebalance_id}-${trade.ts_code}-${trade.side}-${index}`}>
              <span className="trade-date">{trade.session}<small>第 {trade.rebalance_id} 次调仓</small></span>
              <span><b>{trade.security_name}</b><small>{trade.ts_code}</small></span>
              <strong className={trade.side === 'BUY' ? 'buy' : 'sell'}>{trade.side === 'BUY' ? '买入' : '卖出'}</strong>
              <b>{number(trade.quantity, 0)} 股</b>
              <b>¥{number(trade.price, 2)}</b>
              <b className="trade-cost-basis" title={displayedCostPrice(trade).label}>¥{number(displayedCostPrice(trade).value, 4)}<small>{displayedCostPrice(trade).label}</small></b>
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

export function RotationComparison({ result }: { result: NonNullable<StrategyJob['result']> }) {
  const timeRange = useChartTimeRange(result.daily.map(d => d.session))
  if (!result.rotation || result.daily.length < 2) return null
  const series = [
    { id: 'joint', name: '轮动账户', values: result.daily.map((item) => item.nav / result.daily[0].nav - 1) },
    ...result.rotation.candidate_shadows.map((shadow) => {
      const bySession = new Map(shadow.daily.map(row => [row.session, row.nav / shadow.daily[0].nav - 1]))
      return { id: shadow.candidate_id, name: shadow.name, values: result.daily.map(row => bySession.get(row.session)) }
    }),
  ]
  const all = series.flatMap((item) => item.values.slice(timeRange.start, timeRange.end + 1)).filter((v): v is number => v != null)
  const low = Math.min(...all); const high = Math.max(...all)
  const x = (index: number) => 20 + (index - timeRange.start) / Math.max(1, timeRange.end - timeRange.start) * 960
  const y = (value: number) => 12 + (high - value) / (high - low || 1) * 176
  const colors = ['#176a48', '#72915f', '#c07743', '#5a76a5', '#8d5b91']
  return <section className="rotation-history-chart"><h3>轮动净值与候选影子净值</h3><div className="rotation-chart-legend">{series.map((item, index) => <span key={item.id}><i style={{ background: colors[index % colors.length] }} />{item.name} <b>{percent(item.values.at(-1))}</b></span>)}</div><svg viewBox="0 0 1000 205" preserveAspectRatio="none" role="img" aria-label="轮动账户与候选组合收益走势">{low <= 0 && high >= 0 && <line x1="20" x2="980" y1={y(0)} y2={y(0)} />}{series.map((item, seriesIndex) => <polyline key={item.id} style={{ stroke: colors[seriesIndex % colors.length] }} points={item.values.slice(timeRange.start, timeRange.end + 1).map((value, index) => value == null ? '' : `${x(index + timeRange.start)},${y(value)}`).filter(Boolean).join(' ')} />)}</svg><ChartTimeRange sessions={result.daily.map(d => d.session)} values={result.daily.map(d => d.nav)} start={timeRange.start} end={timeRange.end} onChange={timeRange.change} /><div className="rotation-switch-list">{result.rotation.decisions.filter((item) => item.switched).slice(-20).map((item) => <span key={item.signal_session}><b>{item.signal_session}</b> → {item.active_candidate_id}<small>次日 {item.execution_session} 执行 · 目标 {item.target_stock_count}只</small></span>)}</div></section>
}

function HistoryShadowTimeline({ result }: { result: NonNullable<StrategyJob['result']> }) {
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  return <ShadowTimeline result={result} hoverDate={hoverDate} onHoverDate={setHoverDate} />
}

function HistoryEquityChart({ result }: { result: NonNullable<StrategyJob['result']> }) {
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  if (result.daily.length < 2) return null
  return <section className="history-equity-chart">
    <h3>策略账户收益曲线</h3>
    <EquityChart
      daily={result.daily}
      benchmark={result.benchmark || undefined}
      drawdown={result.drawdown_period}
      hoverDate={hoverDate}
      onHoverDate={setHoverDate}
    />
  </section>
}

export function StrategyHistoryDetail({ job }: { job: StrategyJob }) {
  const request = job.request
  const rotationRequest = request && 'candidates' in request ? request : null
  const factorRequest = request && 'score_rules' in request ? request : null
  const result = job.result
  const quality = job.quality_strategy
  return <div className="history-detail">
    {job.status === 'PASS' && !job.execution_model_valid && <div className="history-invalid-result"><b>旧成交模型结果已失效</b><span>该结果未按整数股、最低佣金和历史税费规则计算，仅保留用于审计对照，请重新运行。</span></div>}
    <section><h3>策略配置</h3><dl>
      <div><dt>任务编号</dt><dd><code>{job.job_id}</code></dd></div>
      <div><dt>回测区间</dt><dd>{request?.start} → {request?.end}</dd></div>
      <div><dt>策略类型</dt><dd>{quality ? '优质策略' : rotationRequest ? '多组合轮动' : '因子选股'}</dd></div>
      {quality && <><div><dt>保存的策略版本</dt><dd>{quality.version ?? '未记录'}</dd></div><div><dt>入选评分</dt><dd>{factorRequest?.minimum_entry_score == null ? '不设门槛' : `≥${factorRequest.minimum_entry_score}分`}</dd></div><div><dt>权重训练期</dt><dd>{quality.weight_training ? `${quality.weight_training.start} → ${quality.weight_training.end}` : '未记录'}</dd></div><div><dt>配权方式</dt><dd>{quality.allocation === 'INVERSE_RESVOL' ? '风险倒数配权' : '等权'}</dd></div><div><dt>留仓调权</dt><dd>{quality.retained_rebalance_policy === 'BAND25' ? '偏离25%才调权' : '原规则'}</dd></div></>}
      <div className="history-universe"><dt>股票池范围</dt><dd title={universeScope(request)}>{universeScope(request)}</dd></div>
      {factorRequest && <div><dt>持股 / 保留排名</dt><dd>{factorRequest.target_count} / {factorRequest.retention_rank}</dd></div>}
      {factorRequest && <div><dt>调仓间隔</dt><dd>{quality?.schedule === 'QUARTER' ? '自然季度末' : quality?.schedule === 'HALF_YEAR' ? '自然半年末' : `${factorRequest.rebalance_sessions} 个交易日`}</dd></div>}
      {factorRequest && <div><dt>个股止盈</dt><dd>{factorRequest.take_profit_policy === 'GAIN_50_CLEAR' ? '盈利50%清仓' : '不加止盈'}</dd></div>}
      {factorRequest && <div><dt>最低上市天数</dt><dd>{factorRequest.minimum_listed_sessions} 个交易日</dd></div>}
      {factorRequest && <div><dt>排除 ST</dt><dd>{factorRequest.exclude_st ? '开启' : '关闭'}</dd></div>}
      {factorRequest && <div><dt>选股序列口径</dt><dd>{factorRequest.selection_sequence_mode === 'MODEL_TARGETS' ? '模型目标序列（实验共用）' : '实际持仓序列（原逻辑）'}</dd></div>}
      {factorRequest && <div><dt>PIT 异常状态退出</dt><dd>{factorRequest.exclude_abnormal_status === false ? '关闭' : '开启'}</dd></div>}
      {factorRequest && <div><dt>环境仓位方案</dt><dd>{factorRequest.shadow_health?.experiment_variant || 'S0'}</dd></div>}
      {rotationRequest && <div><dt>候选组合</dt><dd>{rotationRequest.candidates.length} 个</dd></div>}
      {rotationRequest && <div><dt>轮动规则</dt><dd>{rotationRequest.signal.lookback_sessions}日回看 · 阈值 {percent(rotationRequest.signal.switch_threshold)}</dd></div>}
      <div><dt>初始资金</dt><dd>¥{number(request?.initial_cash_cny, 0)}</dd></div>
      <div><dt>现金保留</dt><dd>{percent(rotationRequest?.allocation.minimum_cash_fraction ?? factorRequest?.minimum_cash_fraction)}</dd></div>
    </dl></section>
    {factorRequest && <section><h3>评分因子</h3><div className="detail-rules">{factorRequest.score_rules.map((rule) => <div key={rule.factor_id}><b>{rule.factor_id}</b><span>{rule.direction === 'HIGH' ? '高值优先' : '低值优先'} · 权重 {quality ? percent(rule.weight / factorRequest.score_rules.reduce((sum, r) => sum + r.weight, 0)) : `${number(rule.weight)}%`} · {rule.transform}</span><code title={rule.release_id}>{rule.release_id}</code></div>)}</div></section>}
    {factorRequest && <section><h3>过滤规则</h3><div className="detail-rules">{factorRequest.filter_rules?.length ? factorRequest.filter_rules.map((rule) => <div key={rule.factor_id}><b>{rule.factor_id}</b><span>{rule.mode === 'EXCLUDE_HIGH' ? '排除最高' : '排除最低'} {percent(rule.fraction)} · {rule.missing_policy === 'EXCLUDE' ? '缺失排除' : '缺失保留'}</span><code title={rule.release_id}>{rule.release_id}</code></div>) : <span className="detail-none">无过滤规则</span>}</div></section>}
    {factorRequest?.shadow_health?.experiment_variant === 'S4V3' && <section><h3>市场与影子策略环境仓位</h3><dl>
      <div><dt>环境仓位方案</dt><dd>{factorRequest.shadow_health.experiment_variant}</dd></div>
      <div><dt>全A趋势 / 上涨比例回看</dt><dd>MA{factorRequest.shadow_health.external_trend_sessions} / {factorRequest.shadow_health.external_breadth_return_sessions}日</dd></div>
      <div><dt>强 / 弱环境上涨比例</dt><dd>{percent(factorRequest.shadow_health.external_strong_breadth)} / {percent(factorRequest.shadow_health.external_weak_breadth)}</dd></div>
      <div><dt>普通 / 严重回撤</dt><dd>{percent(factorRequest.shadow_health.regime_ordinary_drawdown)} / {percent(factorRequest.shadow_health.regime_severe_drawdown)}</dd></div>
      <div><dt>强 / 基础 / 走弱仓位</dt><dd>{percent(factorRequest.shadow_health.regime_strong_exposure)} / {percent(factorRequest.shadow_health.regime_base_exposure)} / {percent(factorRequest.shadow_health.regime_weak_exposure)}</dd></div>
      <div><dt>执行时序</dt><dd>T 收盘 → T+1 开盘</dd></div>
      {result?.shadow_health && <><div><dt>平均影子目标仓位</dt><dd>{percent(result.shadow_health.average_target_exposure)}</dd></div><div><dt>平均实际股票仓</dt><dd>{percent(result.shadow_health.average_actual_stock_exposure)}</dd></div><div><dt>影子仓位变化</dt><dd>{result.shadow_health.exposure_change_count} 次</dd></div></>}
      {result?.shadow_health?.source && <><div><dt>影子信号来源</dt><dd>{result.shadow_health.source.experiment_variant}</dd></div><div><dt>来源选股序列指纹</dt><dd title={result.shadow_health.source.selection_fingerprint}><code>{result.shadow_health.source.selection_fingerprint.slice(7, 23)}</code></dd></div></>}
    </dl></section>}
    {result?.shadow_health?.experiment_variant === 'S4V3' && <HistoryShadowTimeline result={result} />}
    {job.error_message && <p role="alert" className="history-trade-error">{job.error_message}</p>}
    {quality && <p className="history-trade-note">以下为本次任务保存的独立账户；日期、评分门槛、曲线、持仓与成交均属于这次回测，不随当前优质策略参数变化。</p>}
    {result && (quality ? <Curve daily={result.daily} initialCash={result.initial_cash_cny} benchmark={result.comparison_benchmark} showLatestDetails /> : <HistoryEquityChart result={result} />)}
    {result && <TakeProfitResults result={result.take_profit} schedule="下次正常调仓" />}
    {factorRequest?.shadow_health && !['S0', 'S4V3'].includes(factorRequest.shadow_health.experiment_variant) && <section><h3>历史实验配置</h3><p>这是已归档的 {factorRequest.shadow_health.experiment_variant} 回测。完整旧参数保存在下方原始 JSON 报告中。</p></section>}
    {rotationRequest && <section><h3>候选组合与因子</h3><div className="detail-rules">{rotationRequest.candidates.map((candidate) => <div key={candidate.candidate_id}><b>{candidate.name}</b><span>{candidate.score_rules.map((rule) => `${rule.factor_id}（${rule.direction === 'HIGH' ? '高' : '低'}）`).join(' · ')} · 持股 {candidate.target_count}</span></div>)}</div></section>}
    {result?.rotation && <section><h3>轮动执行</h3><dl><div><dt>判断次数</dt><dd>{result.rotation.decision_count}</dd></div><div><dt>实际切换</dt><dd>{result.rotation.switch_count}</dd></div><div><dt>当前组合</dt><dd>{result.rotation.decisions.at(-1)?.active_candidate_id || '—'}</dd></div></dl></section>}
    {result?.rotation && <RotationComparison result={result} />}
    <section><h3>交易与结果</h3><dl>
      <div><dt>买 / 卖佣金</dt><dd>{number(request?.buy_commission_bps)} / {number(request?.sell_commission_bps)} bps</dd></div>
      <div><dt>最低佣金</dt><dd>¥{number(request?.minimum_commission_cny ?? 5, 2)} / 笔</dd></div>
      <div><dt>卖出印花税</dt><dd>2023-08-28 前 10 bps，之后 {number(request?.sell_stamp_duty_bps)} bps</dd></div>
      <div><dt>过户费</dt><dd>买卖双向 {number(request?.transfer_fee_bps ?? 0.1)} bps</dd></div>
      <div><dt>基础滑点</dt><dd>{number(request?.base_slippage_bps)} bps</dd></div>
      <div><dt>冲击成本系数</dt><dd>{number(request?.square_root_impact_bps)} bps</dd></div>
      <div><dt>最大滑点</dt><dd>{number(request?.maximum_slippage_bps)} bps</dd></div>
      <div><dt>最大成交参与率</dt><dd>{percent(request?.maximum_participation_rate)}</dd></div>
      <div><dt>期末净值</dt><dd>{number(result?.summary.ending_nav, 4)}</dd></div>
      <div><dt>总成本</dt><dd>¥{number(result?.summary.total_cost, 0)}</dd></div>
      <div><dt>卖出已实现盈亏（含分红）</dt><dd>¥{number(result?.summary.total_realized_pnl, 2)}</dd></div>
      <div><dt>调仓 / 成交</dt><dd>{number(result?.summary.rebalance_count, 0)} / {number(result?.summary.filled_trade_count, 0)}</dd></div>
      <div><dt>年化波动</dt><dd>{percent(result?.summary.annualized_volatility)}</dd></div>
    </dl></section>
    {result?.annual.length ? <section className="history-annual"><h3>逐年收益</h3><div>{result.annual.map((item) => <span key={item.year}><i>{item.year}</i><b>{percent(item.return)}</b></span>)}</div></section> : null}
    {result?.annual.length ? <YearlyTransactions jobId={job.job_id} source={job.history_source} annual={result.annual} available={Boolean(job.trade_detail_available)} /> : null}
  </div>
}

export default function StrategyBacktestHistory({ onOpenRunning }: { onOpenRunning: (strategyType?: string) => void }) {
  const [jobs, setJobs] = useState<StrategyJobHistory[]>([])
  const loadVersion = useRef(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, StrategyJob>>({})
  const [detailLoading, setDetailLoading] = useState('')
  const [deleting, setDeleting] = useState('')
  const [stopping, setStopping] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState(() => runDay(new Date().toISOString()))
  const [strategyType, setStrategyType] = useState('ALL')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const historyKey = (job: StrategyJobHistory) => `${job.history_source || 'STRATEGY'}:${job.job_id}`
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    const version = ++loadVersion.current
    try {
      const response = await strategyApi.history(selectedDay, strategyType, offset)
      if (version !== loadVersion.current) return
      setJobs(response.jobs); setTotal(response.total)
      if (offset > 0 && response.jobs.length === 0 && response.total > 0) setOffset(Math.floor((response.total - 1) / 50) * 50)
      setError('')
      if (showLoading) {
        setRefreshedAt(new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }))
      }
    } catch (reason) {
      if (version === loadVersion.current) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [selectedDay, strategyType, offset])

  const toggleDetail = async (job: StrategyJobHistory) => {
    const key = historyKey(job)
    if (expanded === key) { setExpanded(null); return }
    setExpanded(key)
    if (details[key] && !['QUEUED', 'RUNNING', 'STOPPING'].includes(details[key].status)) return
    setDetailLoading(key)
    try {
      const detail = await strategyApi.historyStatus(job.job_id, job.history_source)
      setDetails((current) => ({ ...current, [key]: detail }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDetailLoading('')
    }
  }

  const deleteJob = async (job: StrategyJobHistory) => {
    if (['QUEUED', 'RUNNING', 'STOPPING'].includes(job.status)) return
    const quality = job.history_source === 'QUALITY'
    if (!window.confirm(quality ? `从历史列表移除“${cleanName(job.name)}”吗？\n\n原账户、因子文件和优质策略页面的结果仍会保留。` : `确定删除“${cleanName(job.name)}”吗？\n\n任务 ${job.job_id} 的配置、日志和结果文件都会被永久删除。`)) return
    setDeleting(job.job_id)
    setError('')
    try {
      await strategyApi.historyDelete(job.job_id, job.history_source)
      setDetails((current) => { const next = { ...current }; delete next[historyKey(job)]; return next })
      if (expanded === historyKey(job)) setExpanded(null)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setDeleting('')
    }
  }

  const cancelJob = async (job: StrategyJobHistory) => {
    if (stopping) return
    setStopping(historyKey(job))
    setError('')
    try {
      await strategyApi.historyStop(job.job_id, job.history_source)
      setDetails(current => { const next = { ...current }; delete next[historyKey(job)]; return next })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setStopping('') }
  }

  useEffect(() => { void load(true) }, [load])
  useEffect(() => {
    if (!jobs.some((item) => ['QUEUED', 'RUNNING', 'STOPPING'].includes(item.status))) return
    const timer = window.setInterval(() => void load(), 1500)
    return () => window.clearInterval(timer)
  }, [jobs, load])

  const visibleJobs = loading ? [] : jobs

  return <div className="strategy-history-page">
    <div className="strategy-history-heading">
      <div><span>BACKTEST ARCHIVE</span><h1>历史回测结果</h1><p>一行查看核心结果；点击详情查看完整配置，也可以清理不需要的记录。</p></div>
      <div className="history-refresh"><button onClick={() => void load(true)} disabled={loading}>{loading ? '正在刷新…' : '刷新列表'}</button>{refreshedAt && <small>已刷新：{refreshedAt}</small>}</div>
    </div>
    <div className="history-date-filter">
      <label>运行日期<input type="date" aria-label="历史运行日期" value={selectedDay} onChange={(event) => { setLoading(true); setSelectedDay(event.target.value); setOffset(0); setExpanded(null) }} /></label>
      <label>策略来源<select aria-label="历史策略来源" value={strategyType} onChange={e => { setLoading(true); setStrategyType(e.target.value); setOffset(0); setExpanded(null) }}><option value="ALL">全部策略</option><option value="QUALITY">优质策略</option><option value="FACTOR">因子策略</option><option value="ROTATION">轮动回测</option></select></label>
      <span>{loading ? '正在读取…' : `共 ${total} 条`}</span>{selectedDay && <button onClick={() => { setLoading(true); setSelectedDay(''); setOffset(0); setExpanded(null) }}>查看全部日期</button>}
    </div>
    {error && <div className="strategy-error"><b>读取失败</b><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    {!loading && !error && visibleJobs.length === 0 && <div className="history-empty"><b>{selectedDay ? '该日期没有回测记录' : '还没有回测记录'}</b><span>{selectedDay ? '换一个日期，或查看全部记录。' : '启动回测后，任务会自动出现在这里。'}</span></div>}
    {visibleJobs.length > 0 && <div className="history-table">
      <div className="history-table-head"><span>策略 / 时间</span><span>回测区间</span><span>股票池范围</span><span>调仓间隔</span><span>累计收益</span><span>年化收益</span><span>最大回撤</span><span>夏普</span><span>状态</span><span /></div>
      {visibleJobs.map((job) => <div className={`history-table-item ${job.status.toLowerCase()}`} key={historyKey(job)}>
        <div className="history-main-row">
          <span className="history-name"><b>{cleanName(job.name)}</b><small>{job.strategy_type === 'QUALITY' ? '优质策略 · ' : job.strategy_type === 'ROTATION' ? '轮动回测 · ' : '因子策略 · '}{dateTime(job.created_at)}</small>{job.quality_strategy && <small>{job.request && 'target_count' in job.request ? `${job.request.target_count}股 · ` : ''}入选评分 {job.request && 'minimum_entry_score' in job.request && job.request.minimum_entry_score != null ? `≥${job.request.minimum_entry_score}分` : '不设门槛'}</small>}</span>
          <span>{job.request?.start || '—'}<small>至 {job.request?.end || '—'}</small></span>
          <span className="history-universe-summary" title={universeScope(job.request)}>{universeScopeSummary(job.request)}<small>股票池范围</small></span>
          <span className="history-rebalance-summary">{job.quality_strategy?.schedule === 'QUARTER' ? '季度换仓' : job.quality_strategy?.schedule === 'HALF_YEAR' ? '半年换仓' : rebalanceIntervalSummary(job.request)}<small>调仓间隔</small></span>
          <strong>{percent(job.result_summary?.total_return)}</strong>
          <strong>{percent(job.result_summary?.annualized_return)}</strong>
          <strong>{percent(job.result_summary?.maximum_drawdown)}</strong>
          <strong>{job.result_summary?.sharpe?.toFixed(2) ?? '—'}</strong>
          <span className={`history-status ${job.status === 'PASS' && !job.execution_model_valid ? 'invalid' : ''}`}><i />{job.status === 'RUNNING' ? `${job.phase} ${job.progress}%` : job.status === 'QUEUED' ? `等待中 · 第 ${job.queue_position ?? '—'} 位` : job.status === 'PASS' && !job.execution_model_valid ? '旧模型失效' : STATUS_LABEL[job.status]}</span>
          <span className="history-row-actions"><button className="history-detail-button" onClick={() => void toggleDetail(job)}>{expanded === historyKey(job) ? '收起' : '详情'}</button>{(job.status === 'QUEUED' || (job.history_source === 'QUALITY' && ['RUNNING', 'STOPPING'].includes(job.status))) ? <button className="history-delete-button" disabled={!!stopping} onClick={() => void cancelJob(job)}>{stopping === historyKey(job) ? '正在停止…' : job.status === 'QUEUED' ? '取消排队' : job.status === 'STOPPING' ? '重试停止' : '停止回测'}</button> : <button className="history-delete-button" disabled={job.status === 'RUNNING' || deleting === job.job_id} title={job.status === 'RUNNING' ? '运行中的任务不能删除' : job.history_source === 'QUALITY' ? '从历史列表移除，保留原始证据' : '删除这条回测记录'} onClick={() => void deleteJob(job)}>{deleting === job.job_id ? '…' : job.history_source === 'QUALITY' ? '移除' : '删除'}</button>}</span>
        </div>
        {job.status === 'RUNNING' && <div className="history-inline-progress"><i style={{ width: `${job.progress}%` }} /></div>}
        {expanded === historyKey(job) && <div className="history-detail-wrap">
          {detailLoading === historyKey(job) ? <div className="history-detail-loading">正在读取详细结果…</div> : details[historyKey(job)] && <StrategyHistoryDetail job={details[historyKey(job)]} />}
          <div className="history-detail-actions">{['QUEUED', 'RUNNING', 'STOPPING'].includes(job.status) ? <button onClick={() => onOpenRunning(job.strategy_type)}>返回运行控制台 →</button> : job.status === 'PASS' ? <a href={strategyApi.historyReportUrl(job.job_id, job.history_source)} target="_blank">打开原始 JSON 报告 →</a> : null}</div>
        </div>}
      </div>)}
    </div>}
    {!loading && total > 50 && <div className="history-trade-pagination" aria-label="历史记录分页"><span>第 {offset + 1}—{Math.min(offset + jobs.length, total)} 条，共 {total} 条</span><button disabled={offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - 50)); setExpanded(null) }}>上一页</button><button disabled={offset + jobs.length >= total} onClick={() => { setLoading(true); setOffset(offset + 50); setExpanded(null) }}>下一页</button></div>}
  </div>
}
