import { useEffect, useRef, useState } from 'react'
import StockIdentity from './StockIdentity'
import type { StockIdentityValue } from './StockIdentity'
import './quality-trade-plan.css'

type Action = StockIdentityValue & { id: string; side: string; action: string; quantity?: number | null;
  before_quantity?: number | null; after_quantity?: number | null; price?: number | null;
  amount_cny?: number | null; cost_cny?: number | null; reason: string; status: string }
type Unchanged = StockIdentityValue & { quantity: number; target_quantity?: number; reason: string }
export type LatestRebalance = { kind: string; as_of: string; signal_session?: string | null;
  execution_session: string; before_session?: string | null; before_nav?: number | null;
  after_nav?: number | null; after_cash?: number | null; initial_cash_cny?: number | null;
  sell_count: number; buy_count: number; sell_amount_cny: number | null; buy_amount_cny: number | null;
  total_cost_cny: number | null; actions: Action[]; unchanged: Unchanged[]; unresolved: Unchanged[] }
const number = (v?: number | null, digits = 2) => v == null ? '未记录' : v.toLocaleString('zh-CN', { maximumFractionDigits: digits })
const money = (v?: number | null) => v == null ? '未记录' : `${number(v)} 元`

export default function QualityTradePlan({ strategyId, name, plan, stale = false }: {
  strategyId: string; name: string; plan?: LatestRebalance | null; stale?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [copied, setCopied] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const open = hovered || pinned
  const panelId = `quality-trade-plan-${strategyId}`
  const close = () => { setPinned(false); setHovered(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])
  useEffect(() => { setCopied(false) }, [plan?.execution_session, strategyId])
  async function copyPlan() {
    if (!plan) return
    const lines = [name, `回测账户历史调仓｜信号 ${plan.signal_session || '未记录'}｜成交 ${plan.execution_session}`,
      `以下为模型历史成交，非当前待执行订单；回测初始资金 ${money(plan.initial_cash_cny)}。`]
    for (const side of ['SELL', 'BUY']) {
      lines.push(side === 'SELL' ? '先卖出：' : '后买入：')
      for (const a of plan.actions.filter(a => a.side === side)) lines.push(
        `${a.action} ${a.security_name || a.ts_code} ${a.ts_code}｜${number(a.quantity, 0)}股｜成交价${number(a.price, 4)}元｜金额${money(a.amount_cny)}｜${number(a.before_quantity, 0)}→${number(a.after_quantity, 0)}股｜${a.reason}`)
    }
    lines.push('保留不动：', ...plan.unchanged.map(p => `${p.security_name || p.ts_code} ${p.ts_code} ${number(p.quantity, 0)}股｜${p.reason}`))
    if (plan.unresolved.length) lines.push('当日需核对：', ...plan.unresolved.map(p => `${p.ts_code}｜${p.reason}`))
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true) }
    catch { setCopied(false) }
  }
  return <aside className={`qs-plan-shell${open ? ' open' : ''}`} aria-label="最近调仓侧栏"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <div className="qs-plan-hotzone" aria-hidden="true" />
    <button ref={trigger} className="qs-plan-handle" aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (pinned) close(); else setPinned(true) }}>
      <span aria-hidden="true">{open ? '›' : '‹'}</span><span>最近调仓</span>
    </button>
    <section id={panelId} className="qs-plan-panel" aria-label="上一次回测调仓明细" aria-hidden={!open} inert={!open || undefined}>
      <header className="qs-plan-header"><div><small>回测账户 · 历史成交</small><h2>上一次调仓</h2></div>
        <div><button onClick={() => setPinned(!pinned)} aria-pressed={pinned}>{pinned ? '取消固定' : '固定面板'}</button>
          <button onClick={close} aria-label="关闭调仓侧栏">×</button></div></header>
      <div className="qs-plan-body">
        <p className="qs-plan-strategy">{name}</p>
        {!plan ? <p className="qs-plan-empty">当前回测没有可核对的调仓成交记录。</p> : <>
          <div className="qs-plan-dates"><div><small>信号日</small><b>{plan.signal_session || '未记录'}</b></div>
            <div><small>实际成交日</small><b>{plan.execution_session}</b></div></div>
          <p className="qs-plan-context">这是所选回测账户上一次调仓的历史记录。股数和金额对应当时模型账户，供核对操作顺序；不是今天的待执行订单。</p>
          {stale && <p className="qs-plan-warning">来源或规则已有变化，此处保留该回测当时的实际记录。</p>}
          <div className="qs-plan-summary"><div><small>卖出</small><b>{plan.sell_count}笔</b><span>{money(plan.sell_amount_cny)}</span></div>
            <div><small>买入</small><b>{plan.buy_count}笔</b><span>{money(plan.buy_amount_cny)}</span></div>
            <div><small>保留不动</small><b>{plan.unchanged.length}只</b><span>股数未调整</span></div></div>
          {(['SELL', 'BUY'] as const).map((side, index) => {
            const actions = plan.actions.filter(a => a.side === side)
            return <section className={`qs-plan-group ${side.toLowerCase()}`} key={side} aria-label={side === 'SELL' ? '先卖出记录' : '后买入记录'}>
              <h3><span>{index + 1}</span>{side === 'SELL' ? '先卖出' : '后买入'}<small>{actions.length}笔</small></h3>
              {!actions.length && <p className="qs-plan-empty">本次没有{side === 'SELL' ? '卖出' : '买入'}成交。</p>}
              {actions.map(a => <article className="qs-plan-action" key={a.id}>
                <div className="qs-plan-action-heading"><div><StockIdentity position={a} /></div>
                  <span className="qs-plan-action-badge">{a.action} · {a.status === 'SETTLEMENT' ? '账面结算' : '已成交'}</span></div>
                <dl><div><dt>成交股数</dt><dd>{number(a.quantity, 0)} 股</dd></div>
                  <div><dt>成交价</dt><dd>{number(a.price, 4)} 元</dd></div>
                  <div><dt>成交金额</dt><dd>{money(a.amount_cny)}</dd></div></dl>
                <div className="qs-plan-quantity"><span>{number(a.before_quantity, 0)} 股</span><i>→</i><b>{number(a.after_quantity, 0)} 股</b><small>成交前 → 成交后</small></div>
                <footer><span>{a.reason}</span><small>费用 {money(a.cost_cny)}</small></footer>
              </article>)}
            </section>
          })}
          <section className="qs-plan-group keep" aria-label="保留不动记录"><h3><span>3</span>保留不动<small>{plan.unchanged.length}只</small></h3>
            {!plan.unchanged.length && <p className="qs-plan-empty">本次没有股数保持不变的持仓。</p>}
            {plan.unchanged.map(p => <div className="qs-plan-keep-row" key={p.ts_code}><div><StockIdentity position={p} /><small>{p.reason}</small></div><b>{number(p.quantity, 0)} 股</b></div>)}
          </section>
          {plan.unresolved.length > 0 && <section className="qs-plan-review" aria-label="当日需核对记录"><h3>当日需核对</h3>
            {plan.unresolved.map(p => <p key={p.ts_code}><b>{p.security_name || p.ts_code} · {p.ts_code}</b><span>{p.reason}；当日持有 {number(p.quantity, 0)} 股。</span></p>)}
          </section>}
          <dl className="qs-plan-account"><div><dt>回测初始资金</dt><dd>{money(plan.initial_cash_cny)}</dd></div>
            <div><dt>调仓前收盘权益{plan.before_session ? ` · ${plan.before_session}` : ''}</dt><dd>{money(plan.before_nav)}</dd></div>
            <div><dt>调仓日收盘权益</dt><dd>{money(plan.after_nav)}</dd></div><div><dt>调仓日收盘现金</dt><dd>{money(plan.after_cash)}</dd></div>
            <div><dt>当日交易费用合计</dt><dd>{money(plan.total_cost_cny)}</dd></div></dl>
          <p className="qs-plan-footnote">金额为历史实际成交额，费用单列；“保留不动”按该次调仓记录核对。未成交、未持有或资料缺失不会标成已成交。</p>
        </>}
      </div>
      <footer className="qs-plan-bottom"><span>{pinned ? '已固定 · 可滚动查看' : '移出侧栏自动收起'} · Esc关闭</span>
        <button disabled={!plan} onClick={() => void copyPlan()}>{copied ? '已复制历史清单' : '复制清单'}</button></footer>
    </section>
  </aside>
}
