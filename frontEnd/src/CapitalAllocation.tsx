import { useEffect, useMemo, useRef, useState } from 'react'
import { readQuality } from './qualityPreload'
import { ALLOCATION_KEY, DEFAULT_FACTOR_ID, SLEEVE_NAMES, allocationScenario, calculateAllocation, defaultAllocation, restoreAllocation } from './allocationModel'
import type { AllocationInput, AllocationResult, SleeveId, SleeveInput, SleeveState } from './allocationModel'
import { allocationSignature, readAllocationSettings, saveAllocationSettings } from './allocationSettingsApi'
import type { SavedAllocation } from './allocationSettingsApi'
import DividendDrawdown from './DividendDrawdown'
import CycleEstimate from './AllocationCycleEstimate'
import './capital-allocation.css'

type Candidate = { strategy_id: string; name: string; category: string; schedule: string; target_count: number; latest_as_of?: string | null; calculation_policy?: string }
const codes: Record<SleeveId, string> = { dividend: '512890', factor: '季度 · 10股', growth: '159915' }
const colors: Record<SleeveId, string> = { dividend: '#217359', factor: '#7098b5', growth: '#cc9553' }
const currency = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
const wan = (n: number) => `${(n / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万`
const percent = (n: number) => `${n.toFixed(2)}%`
const stateNames: Record<SleeveState, string> = { WAITING: '等待信号', ACTIVE: '运行／准备入场', EXIT: '准备退出' }
const scenarios: Array<{ title: string; active: SleeveId[] }> = [
  { title: '季度10股因子', active: ['factor'] }, { title: '季度10股因子 ＋ 红利低波（512890）', active: ['factor', 'dividend'] },
  { title: '季度10股因子 ＋ 创业板（159915）', active: ['factor', 'growth'] }, { title: '季度10股因子 ＋ 红利低波（512890）＋ 创业板（159915）', active: ['dividend', 'factor', 'growth'] },
]

function Numeric({ label, value, onChange, unit, hint, min = '0', max, step = '0.1' }: { label: string; value: string; onChange: (value: string) => void; unit?: string; hint?: string; min?: string; max?: string; step?: string }) {
  return <label className="ca-field"><span>{label}</span><div className="ca-input"><input aria-label={label} type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={e => onChange(e.target.value)} />{unit && <b>{unit}</b>}</div>{hint && <small>{hint}</small>}</label>
}

export function AllocationSummary({ result }: { result: AllocationResult }) {
  return <div className="ca-metrics" aria-label="资金规划摘要">
    <div><span>当前股票市值 · 手填</span><strong>{wan(result.currentEquity)}</strong><small>占总资金 {percent(result.currentEquity / result.capital * 100)}</small></div>
    <div><span>本情景目标股票市值</span><strong>{wan(result.targetEquity)}</strong><small>占总资金 {percent(result.targetEquity / result.capital * 100)}</small></div>
    <div><span>本情景需赎回债基</span><strong>{wan(result.redeem)}</strong><small>已扣除可调配现金及计划卖出款</small></div>
    <div className={result.worstBudgetWithinLimit ? 'ca-metric-ok' : 'ca-metric-risk'}><span>三套同时持仓 · 压力损失</span><strong>{wan(result.allActiveStressLoss)}</strong><small>回撤预算 {wan(result.riskBudget)} · 不是损失上限</small></div>
  </div>
}

export default function CapitalAllocation() {
  const [restored] = useState(() => {
    try { return restoreAllocation(window.localStorage.getItem(ALLOCATION_KEY)) }
    catch { return { input: defaultAllocation(), message: '浏览器存储暂不可用；仍可计算，参数不会自动保存。' } }
  })
  const [input, setInput] = useState<AllocationInput>(restored.input)
  const [saveNote, setSaveNote] = useState(restored.message || '参数只保存在当前浏览器')
  const [saved, setSaved] = useState<SavedAllocation>({ config: null, revision: null, saved_at: null })
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const edited = useRef(false)
  const alive = useRef(true)
  const [catalog, setCatalog] = useState<Candidate[]>([])
  const [catalogNote, setCatalogNote] = useState('正在读取已有策略名称…')
  const computed = useMemo(() => calculateAllocation(input), [input])
  const result = computed.result
  const update = <K extends keyof AllocationInput>(key: K, value: AllocationInput[K]) => { edited.current = true; setInput(current => ({ ...current, [key]: value })) }
  const updateSleeve = (id: SleeveId, patch: Partial<SleeveInput>) => { edited.current = true; setInput(current => ({ ...current, sleeves: current.sleeves.map(s => s.id === id ? { ...s, ...patch } : s) })) }
  const chooseScenario = (active: SleeveId[]) => { edited.current = true; setInput(current => allocationScenario(current, active)) }
  const restoreSaved = async () => {
    setSettingsError(''); setSettingsReady(false)
    try {
      const record = await readAllocationSettings()
      if (!alive.current) return
      setSaved(record); setSavedSignature(record.config ? allocationSignature(record.config) : null)
      if (record.config) { setInput(record.config); edited.current = false }
      setSettingsReady(true)
    } catch (error) { if (alive.current) setSettingsError(error instanceof Error ? error.message : String(error)) }
  }
  const saveCurrent = async () => {
    if (!result || !settingsReady || saving) return
    const snapshot = JSON.parse(JSON.stringify(input)) as AllocationInput
    setSaving(true); setSettingsError('')
    try {
      const record = await saveAllocationSettings(snapshot, saved.revision)
      if (!alive.current) return
      setSaved(record); setSavedSignature(allocationSignature(snapshot))
    } catch (error) { if (alive.current) setSettingsError(error instanceof Error ? error.message : String(error)) }
    finally { if (alive.current) setSaving(false) }
  }
  useEffect(() => {
    alive.current = true
    let cancelled = false
    readAllocationSettings().then(record => {
      if (cancelled) return
      setSaved(record); setSavedSignature(record.config ? allocationSignature(record.config) : null)
      if (record.config && !edited.current) setInput(record.config)
      setSettingsReady(true)
    }).catch(error => { if (!cancelled) setSettingsError(error instanceof Error ? error.message : String(error)) })
    return () => { cancelled = true; alive.current = false }
  }, [])
  useEffect(() => {
    if (!result) return
    try { window.localStorage.setItem(ALLOCATION_KEY, JSON.stringify(input)); setSaveNote('浏览器草稿已自动备份') }
    catch { setSaveNote('本机存储不可用，请导出参数保存') }
  }, [input, result])
  useEffect(() => {
    let cancelled = false
    readQuality<{ items: Candidate[] }>('quality-strategies').then(data => {
      if (cancelled) return
      const items = data.items.filter(x => x.category === 'FACTOR_WEIGHTED' && x.target_count === 10 && x.schedule === 'QUARTER' && x.calculation_policy !== 'HISTORICAL_DIAGNOSTIC_ONLY')
      setCatalog(items); setCatalogNote('名称来自优质策略目录；持仓与信号仍以你的手填为准')
    }).catch(() => { if (!cancelled) setCatalogNote('策略目录暂不可用，保留已选策略标识；本地计算可继续') })
    return () => { cancelled = true }
  }, [])
  const selected = catalog.find(x => x.strategy_id === input.factorStrategyId)
  const dirty = savedSignature !== allocationSignature(input)
  const savedTime = saved.saved_at ? new Date(saved.saved_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : ''
  const persistenceLabel = saving ? '正在保存到本机后端…' : !settingsReady ? '后端配置未读取完成' : dirty ? '当前修改尚未保存到后端' : `已保存 · ${savedTime}`
  const factorName = selected?.name || (input.factorStrategyId === DEFAULT_FACTOR_ID ? '因子加权 · 季度10股 · 两项合用＋50%止盈 · 沪深主板＋创业板' : input.factorStrategyId)
  const exportPlan = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify({ kind: 'capital-allocation-planning-only', exported_at: new Date().toISOString(), input, selected_factor_name: factorName, result }, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = href; a.download = '资金分配规划.json'; a.click(); URL.revokeObjectURL(href)
  }
  const caseResults = scenarios.map(s => ({ ...s, result: calculateAllocation(allocationScenario(input, s.active)).result }))
  const visibleWarnings = result?.warningMessages.filter(message => !message.startsWith('现有可用现金不足')) || []
  const rowNames = (id: SleeveId) => id === 'factor' ? factorName : SLEEVE_NAMES[id]
  return <section className="ca-page">
    <header className="ca-heading"><div><div className="ca-eyebrow">CAPITAL ALLOCATION <span>资金规划 · 手动情景</span></div><h1>先分好预算，再等信号。</h1><p>看清现在持有多少、机会来时买哪套，以及钱从哪里来。</p></div>
      <div className="ca-heading-actions"><span><i />{persistenceLabel}<small>{saveNote}</small></span><button disabled={saving || (!settingsReady && !settingsError)} onClick={() => void restoreSaved()}>读取已保存配置</button><button onClick={() => { edited.current = true; setInput(defaultAllocation()) }}>恢复示例参数</button><button className="ca-primary" disabled={!result || !settingsReady || saving} onClick={() => void saveCurrent()}>{saving ? '正在保存…' : '保存配置'}</button><button disabled={!result} onClick={exportPlan}>导出资金计划 ↗</button></div></header>
    {settingsError && <div className="ca-errors" role="alert"><b>配置未保存或读取失败</b><p>{settingsError}</p><span>当前输入仍保留，可继续本地试算；连接恢复后点击“读取已保存配置”。</span></div>}
    <div className="ca-layout">
      <aside className="ca-settings">
        <div className="ca-section-heading"><span className="ca-step">01</span><div><h2>资金与风险偏好</h2><p>先定承受范围，再算策略预算</p></div></div>
        <Numeric label="现有总资金" value={input.capital} onChange={v => update('capital', v)} unit="元" min="1" step="10000" />
        <div className="ca-two-fields"><Numeric label="可接受回撤预算" value={input.maxDrawdownPct} onChange={v => update('maxDrawdownPct', v)} unit="%" min="0.1" max="99" /><Numeric label="风险缓冲" value={input.bufferPct} onChange={v => update('bufferPct', v)} unit="百分点" max="99" /></div>
        <Numeric label="永久稳定资金下限" value={input.minimumSafePct} onChange={v => update('minimumSafePct', v)} unit="%" max="100" hint="即使三套策略同时触发，也留在债基或现金里的比例。" />
        <div className="ca-two-fields"><Numeric label="目标可用现金" value={input.cashBufferPct} onChange={v => update('cashBufferPct', v)} unit="%" max="100" /><Numeric label="当前可用现金" value={input.currentCashPct} onChange={v => update('currentCashPct', v)} unit="%" max="100" /></div>
        <div className="ca-divider" /><h3>预算计算方式</h3><div className="ca-segment"><button aria-pressed={input.mode === 'AUTO'} onClick={() => update('mode', 'AUTO')}>按风险预算计算</button><button aria-pressed={input.mode === 'MANUAL'} onClick={() => update('mode', 'MANUAL')}>自己填写比例</button></div>
        <p className="ca-help">自动模式将风险资金按偏好分配，并在“三套同时持有”的压力假设下缩减预算；没有搜索历史最优比例。</p>
        <details className="ca-advanced"><summary>债基、到账与触发参数</summary>
          <div className="ca-two-fields"><Numeric label="债基假设年化" value={input.bondYieldPct} onChange={v => update('bondYieldPct', v)} unit="%" max="30" /><Numeric label="债基压力跌幅" value={input.bondStressPct} onChange={v => update('bondStressPct', v)} unit="%" max="100" /></div>
          <Numeric label="赎回到账工作日" value={input.redemptionDays} onChange={v => update('redemptionDays', v)} unit="日" step="1" max="30" hint="可填0；这是手填假设，资金未实际到账前不算可用。" />
          <Numeric label="红利入场回撤" value={input.dividendTriggerPct} onChange={v => update('dividendTriggerPct', v)} unit="%" min="0.1" max="99" />
          <div className="ca-two-fields"><Numeric label="创业板观察入场价" value={input.growthEntryPrice} onChange={v => update('growthEntryPrice', v)} unit="元" min="0.001" /><Numeric label="创业板目标倍数" value={input.growthExitMultiple} onChange={v => update('growthExitMultiple', v)} unit="倍" min="1" max="20" /></div>
          <p className="ca-help">观察价与目标价只记录你的计划，不证明低估、不承诺翻倍，也不自动发出买卖信号。</p>
        </details>
      </aside>
      <div className="ca-workspace">
        {computed.errors.length > 0 && <div className="ca-errors" role="alert"><b>先修正参数，计算结果已暂停</b>{computed.errors.map(e => <p key={e}>{e}</p>)}</div>}
        {result && <AllocationSummary result={result} />}
        <CycleEstimate input={input} plan={result} onChange={(key, value) => update(key, value)} />
        <section className="ca-panel"><div className="ca-panel-title"><div className="ca-section-heading"><span className="ca-step">02</span><div><h2>三套策略，各自有预算</h2><p>当前股票市值填总资产占比；偏好权重仅决定风险资金如何分，不是总仓位</p></div></div><span className="ca-chip">等待中的预算仍停放</span></div>
          <div className="ca-sleeves">{input.sleeves.map((s, index) => {
            const row = result?.rows.find(r => r.id === s.id)
            return <article className={`ca-sleeve ca-${s.id}`} key={s.id} style={{ '--sleeve-color': colors[s.id] } as React.CSSProperties}>
              <header><span className="ca-sleeve-no">0{index + 1}</span><div><h3>{SLEEVE_NAMES[s.id]}</h3><span className="ca-code">{codes[s.id]}</span></div><span className={`ca-state ${s.state.toLowerCase()}`}>{stateNames[s.state]}</span></header>
              {s.id === 'factor' ? <div className="ca-strategy-picker"><label><span>绑定的优质策略</span><select aria-label="绑定的季度10股策略" value={input.factorStrategyId} onChange={e => update('factorStrategyId', e.target.value)}>{!catalog.some(c => c.strategy_id === input.factorStrategyId) && <option value={input.factorStrategyId}>{factorName}</option>}{catalog.map(c => <option key={c.strategy_id} value={c.strategy_id}>{c.name}</option>)}</select></label><small>{catalogNote}</small>{selected?.latest_as_of && <small>目录已有研究结果截至 {selected.latest_as_of}，不代表实盘持仓。</small>}<code>{input.factorStrategyId}</code></div>
                : <p className="ca-rule">{s.id === 'dividend' ? `距历史收盘高点回撤达到－${input.dividendTriggerPct || '…'}%入场，修复至0%清仓；收盘确认后最早次日成交。` : `观察约${input.growthEntryPrice || '…'}元的超跌机会，计划目标${Number.isFinite(Number(input.growthEntryPrice) * Number(input.growthExitMultiple)) ? (Number(input.growthEntryPrice) * Number(input.growthExitMultiple)).toFixed(3) : '—'}元；可能长期达不到。`}</p>}
              {s.id === 'dividend' && <DividendDrawdown triggerPct={input.dividendTriggerPct} />}
              <div className="ca-budget"><span>这套策略的资金预算</span><strong>{row ? wan(row.budget) : '—'}<small>{row ? percent(row.budgetPct) : ''}</small></strong></div>
              <label className="ca-field"><span>本情景状态 · 手选</span><select aria-label={`${SLEEVE_NAMES[s.id]}状态`} value={s.state} onChange={e => updateSleeve(s.id, { state: e.target.value as SleeveState })}><option value="WAITING">等待信号，预算停放</option><option value="ACTIVE">运行／准备入场</option><option value="EXIT">准备退出，目标清零</option></select></label>
              <div className="ca-two-fields"><Numeric label={`${SLEEVE_NAMES[s.id]}当前市值占比`} value={s.currentPct} onChange={v => updateSleeve(s.id, { currentPct: v })} unit="%" max="100" /><Numeric label={input.mode === 'AUTO' ? `${SLEEVE_NAMES[s.id]}偏好权重` : `${SLEEVE_NAMES[s.id]}手动预算`} value={input.mode === 'AUTO' ? s.preference : s.manualPct} onChange={v => updateSleeve(s.id, input.mode === 'AUTO' ? { preference: v } : { manualPct: v })} unit={input.mode === 'AUTO' ? '份' : '%'} max="100" /></div>
              <details className="ca-row-advanced"><summary>压力假设与预算内仓位</summary><Numeric label={`${SLEEVE_NAMES[s.id]}压力跌幅`} value={s.stressPct} onChange={v => updateSleeve(s.id, { stressPct: v })} unit="%" min="0.1" max="100" /><Numeric label={`${SLEEVE_NAMES[s.id]}预算内股票仓位`} value={s.exposurePct} onChange={v => updateSleeve(s.id, { exposurePct: v })} unit="%" max="100" hint="因子默认88.2%为规划示例；不代表该策略最新实仓。" /></details>
              <dl className="ca-sleeve-ledger"><div><dt>当前股票市值</dt><dd>{row ? currency(row.currentEquity) : '—'}</dd></div><div><dt>本情景目标股票</dt><dd>{row ? currency(row.targetEquity) : '—'}</dd></div><div><dt>{s.state === 'ACTIVE' ? '策略内保留现金' : '暂存在债基／现金'}</dt><dd>{row ? currency(s.state === 'ACTIVE' ? row.internalCash : row.parkedBudget) : '—'}</dd></div></dl>
            </article>
          })}</div>
        </section>
        {result && <>
          <section className="ca-panel ca-distribution"><div><h2>这一情景，资金实际放在哪里</h2><p>等待预算已经包含在下方债基余额中，不重复计入总资产。</p></div><div className="ca-money-bar" aria-label="目标资产分布">{result.rows.filter(r => r.targetEquity > 0).map(r => <div key={r.id} style={{ width: `${r.targetEquity / result.capital * 100}%`, background: colors[r.id] }} title={`${rowNames(r.id)} ${currency(r.targetEquity)}`} />)}<div className="ca-bond-segment" style={{ width: `${result.targetBond / result.capital * 100}%` }} title={`债基 ${currency(result.targetBond)}`} /><div className="ca-cash-segment" style={{ width: `${result.targetCash / result.capital * 100}%` }} title={`现金 ${currency(result.targetCash)}`} /></div>
            <div className="ca-money-legend">{result.rows.map(r => <span key={r.id}><i style={{ background: colors[r.id] }} />{codes[r.id]}股票 <b>{wan(r.targetEquity)}</b></span>)}<span><i className="ca-bond-segment" />债基 <b>{wan(result.targetBond)}</b></span><span><i className="ca-cash-segment" />现金 <b>{wan(result.targetCash)}</b></span></div>
            <div className="ca-current-stable">当前手填余额：债基 <b>{currency(result.currentBond)}</b> · 可用现金 <b>{currency(result.currentCash)}</b><span>始终不动用的稳定预算 {currency(result.permanentReserve)}，其中包含目标可用现金。</span></div>
          </section>
          <div className="ca-bottom-grid">
            <section className="ca-panel ca-flow"><div className="ca-section-heading"><span className="ca-step">03</span><div><h2>机会来了，钱怎么过去</h2><p>下面是计划金额，不是已执行交易</p></div></div>
              <ol><li><span>1</span><div><b>{result.sells > 0 ? `计划减少股票 ${currency(result.sells)}` : '现有股票不需要卖出筹款'}</b><p>{result.rows.filter(r => r.delta < -.02).map(r => `${codes[r.id]}减少${currency(-r.delta)}`).join('；') || '每套策略使用自己的预算，不挪用另一套持仓。'}</p></div></li>
                <li><span>2</span><div><b>{result.redeem > 0 ? `需赎回债基 ${currency(result.redeem)}` : '本情景无需额外赎回债基'}</b><p>手填到账假设 {input.redemptionDays} 个工作日。计划卖出款、赎回款未实际可用前，不计入立即可买金额。</p></div></li>
                <li><span>3</span><div><b>{result.buys > 0 ? `资金可用后，计划买入 ${currency(result.buys)}` : '本情景无需增加股票'}</b><p>{result.rows.filter(r => r.delta > .02).map(r => `${codes[r.id]}增加${currency(r.delta)}`).join('；') || '继续等待；退出状态按目标清零测算。'}</p>{result.unfundedNow > .02 && <small className="ca-text-warn">按目标现金储备计，当前尚缺可用资金 {currency(result.unfundedNow)}。</small>}</div></li>
                <li><span>4</span><div><b>完成后：债基{wan(result.targetBond)}，现金{wan(result.targetCash)}</b><p>{result.subscribe > .02 ? `剩余资金可申购债基${currency(result.subscribe)}；` : ''}稳定资金不重复承诺给多套策略。买入整手、手续费和真实到账时间仍需执行前核对。</p></div></li></ol>
            </section>
            <section className="ca-panel ca-risk"><div className="ca-section-heading"><span className="ca-step">04</span><div><h2>把同时下跌也算进去</h2><p>直接叠加压力损失，不假设分散必然有效</p></div></div>
              <div className="ca-risk-value"><strong>{wan(result.allActiveStressLoss)}</strong><span>所有策略同时持仓的压力损失<br />占总资产 {percent(result.allActiveStressLoss / result.capital * 100)}</span></div>
              <div className="ca-risk-track"><div style={{ width: `${Math.min(100, result.allActiveStressLoss / result.riskBudget * 100)}%`, background: result.worstBudgetWithinLimit ? '#217359' : '#bf6046' }} /></div>
              <dl><div><dt>你的回撤预算</dt><dd>{currency(result.riskBudget)}</dd></div><div><dt>扣除风险缓冲后的额度</dt><dd>{currency(result.bufferedBudget)}</dd></div><div><dt>当前手填持仓压力损失</dt><dd>{currency(result.currentStressLoss)}</dd></div><div><dt>本情景目标持仓压力损失</dt><dd>{currency(result.activeStressLoss)}</dd></div><div><dt>同时持有时最高股票市值</dt><dd>{currency(result.allActiveEquity)}</dd></div></dl>
              <p className="ca-risk-disclaimer">“未超预算”只表示这些手填假设下的算术结果。历史回撤不是未来上限，实际亏损仍可能超过{input.maxDrawdownPct}%。</p>
            </section>
          </div>
          {visibleWarnings.length > 0 && <div className="ca-warnings" role="status">{visibleWarnings.map(m => <p key={m}>● {m}</p>)}</div>}
          <section className="ca-panel ca-cases"><div className="ca-panel-title"><div><h2>按持有组合查看分配</h2><p>剩余资金均停放债基或现金。选择组合后，上方资金清单同步重算，保留你填写的实际持仓。</p></div><span className="ca-chip">可反复试算</span></div>
            <div className="ca-table-scroll"><table><thead><tr><th>持有组合</th><th>目标股票市值</th><th>需赎回债基</th><th>组合压力损失</th><th /></tr></thead><tbody>{caseResults.map(c => <tr key={c.title}><td>{c.title}</td><td>{c.result ? currency(c.result.targetEquity) : '—'}</td><td>{c.result ? currency(c.result.redeem) : '—'}</td><td>{c.result ? currency(c.result.activeStressLoss) : '—'}</td><td><button onClick={() => chooseScenario(c.active)}>查看分配 →</button></td></tr>)}</tbody></table></div>
          </section>
          <section className="ca-method"><h3>复投与预算怎么配合</h3><p>总资金填入新的净资产后，预算会随之更新，相当于把盈利纳入新一轮规划。单套盈利不自动证明可以无限扩大仓位；在清仓或定期复核时重新检查组合风险。债基年化{input.bondYieldPct}%是你的规划假设，本页不把几套历史年化相加，也不预测组合年化。</p><details><summary>查看计算口径</summary><p>压力损失＝各套目标股票市值×其压力跌幅＋债基余额×债基压力跌幅。现金压力损失按0处理。自动模式先按偏好权重分配策略预算，再按全部策略同时持有的压力额度等比例缩减；永久稳定资金下限也参与约束。策略内未买股票的资金单列现金。当前债基余额＝总资金－当前手填股票市值－当前可用现金。赎回需求＝计划买入＋目标现金－当前现金－计划卖出款，最低为0；实际卖出与到账之前不会被当作已可用现金。</p><p>这是本地资金规划器，没有执行回测、重算因子、触发付费接口或下单。策略目录只提供名称和标识，所有信号状态与实际仓位须自行确认。</p></details></section>
        </>}
      </div>
    </div>
  </section>
}
