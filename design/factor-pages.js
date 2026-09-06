(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const records = [
    ['mom20','20日动量','动量',0.048,0.53,99.8,'已完成','v1.3','close / lag(close, 20) - 1','预测','正向','衡量过去20个交易日的价格趋势。'],
    ['vol20','20日波动率','波动',-0.041,-0.49,99.8,'已完成','v1.2','std(daily_return, 20)','预测','反向','低波动信号；负IC表示原始数值与未来收益反向相关。'],
    ['turn20','20日换手率','流动性',-0.032,-0.38,99.6,'已完成','v1.1','mean(turnover_rate, 20)','预测','反向','识别交易拥挤，方向需要在训练期确定。'],
    ['rev5','5日反转','动量',-0.052,-0.58,99.9,'已完成','v1.4','close / lag(close, 5) - 1','预测','反向','原始5日收益率；研究短期反转时采用反向排序。'],
    ['quality','盈利质量','质量',0.039,0.42,98.6,'已完成','v1.0','operating_cashflow_ttm / net_profit_ttm','排雷','正向','以当时已披露的财务数据衡量现金流与利润匹配。'],
    ['size','对数流通市值','风格',-0.018,-0.21,99.9,'已完成','v1.1','log(float_market_cap)','风险约束','不排序','用于暴露控制；不以预测IC作为准入标准。'],
    ['bp','账面市值比','估值',0.034,0.37,98.9,'已完成','v1.2','book_equity / total_market_cap','预测','正向','估值信号，净资产按历史披露时间对齐。'],
    ['amihud','20日非流动性','流动性',0.027,0.31,99.5,'已完成','v1.0','mean(abs(daily_return) / amount, 20)','风险约束','不排序','用于容量与流动性控制，避免无量交易样本。'],
    ['corr20','20日量价相关','量价',-0.029,-0.34,99.6,'已完成','v1.2','corr(close, volume, 20)','预测','反向','过去20日价格与成交量相关性。'],
    ['skew20','20日收益偏度','波动',-0.013,-0.17,99.7,'已完成','v1.0','skew(daily_return, 20)','预测','反向','收益分布的非对称程度，当前样例研究信号较弱。'],
    ['beta60','60日市场Beta','风格',0.012,0.14,99.3,'已完成','v1.1','cov(ret, benchmark_ret, 60) / var(benchmark_ret, 60)','风险约束','不排序','衡量相对基准的市场暴露。'],
    ['gap1','隔夜跳空','形态',-0.021,-0.25,99.8,'已完成','v1.0','open / lag(close, 1) - 1','预测','反向','开盘后才可用；不能用于同日开盘前的信号。'],
    ['alpha9','Alpha 009','量价',null,null,72.4,'计算中','v0.3','if(ts_min(delta(close, 1), 5) > 0, delta(close, 1), …)','待研究','待确定','复现公式中的趋势与反转切换。截图中的结论不视为本系统结论。'],
    ['resmom','残差动量','动量',null,null,48.2,'计算中','v0.2','rolling_sum(residual_return, 20)','待研究','待确定','先对行业与市场收益回归，再聚合残差收益。'],
    ['earnings','盈利预期变化','质量',null,null,0,'依赖缺失','v0.1','consensus_eps / lag(consensus_eps, 20) - 1','待研究','待确定','等待历史一致预期数据及其可得时间。'],
    ['range60','60日价格位置','形态',0.031,0.28,86.2,'低覆盖','v0.6','(close - ts_min(low, 60)) / (ts_max(high, 60) - ts_min(low, 60))','预测','正向','长窗口预热不足，尚未满足特征集覆盖门槛。']
  ];
  window.FACTORS = records.map(r => Object.fromEntries(['id','name','category','ic','ir','coverage','status','version','formula','role','direction','description'].map((k,i) => [k,r[i]])));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fixed = (v,n=3) => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(n);
  const ready = f => f.status === '已完成' && f.coverage >= 98;
  const state = () => { const s = window.State || (window.State = {}); s.selectedFactors = s.selectedFactors || new Set(['mom20','vol20','turn20','rev5']); return s; };
  const badgeType = s => ({'已完成':'green','计算中':'blue','依赖缺失':'red','低覆盖':'amber'}[s] || 'neutral');
  const action = (label,name,extra='',primary=false) => `<button class="btn ${primary?'btn-primary':''}" data-action="${name}" ${extra}>${label}</button>`;
  const styles = `<style>
    .factor-view .fv-topline{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.factor-view .fv-mini{font-size:11px;letter-spacing:.04em;color:#82908f}.factor-view .fv-link{border:0;background:none;padding:0;color:#13775f;font:inherit;text-align:left;cursor:pointer;font-weight:600}.factor-view .fv-name{display:flex;flex-direction:column;gap:3px;min-width:115px}.factor-view .fv-split{display:grid;grid-template-columns:1.15fr 1fr;gap:20px}.factor-view .fv-code{display:block;padding:16px;background:#f5f8f7;border:1px solid #e3eae6;border-radius:8px;font:12px/1.8 Consolas,monospace;color:#285b4c;white-space:pre-wrap;overflow-wrap:anywhere}.factor-view .fv-dag{display:flex;align-items:center;gap:8px;padding:19px 0;flex-wrap:wrap}.factor-view .fv-node{padding:11px 13px;border:1px solid #dce6e1;border-radius:7px;background:#f8faf9;font-size:12px}.factor-view .fv-node.final{background:#e9f5ef;border-color:#a9d4c0;color:#17634c}.factor-view .fv-arrow{color:#8faaa0}.factor-view .fv-heat{display:grid;grid-template-columns:80px repeat(12,minmax(18px,1fr));gap:5px;align-items:center;font-size:10px;color:#7b8984}.factor-view .fv-cell{height:23px;border-radius:3px;background:#d2e9de}.factor-view .fv-cell.done{background:#62ae91}.factor-view .fv-cell.running{background:#c5dfef}.factor-view .fv-cell.missing{background:#fae5de}.factor-view .fv-cell.wait{background:#edf0ef}.factor-view .fv-legend{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:14px;font-size:11px;color:#78857f}.factor-view .fv-dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}.factor-view .fv-steps{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.factor-view .fv-step{padding:15px 12px;border:1px solid #e1e8e4;border-radius:8px;background:#fff;position:relative}.factor-view .fv-step:not(:last-child):after{content:'›';position:absolute;right:-9px;top:35px;color:#8da99c;z-index:1;background:#f6f8f7}.factor-view .fv-step b{display:block;font-size:13px;margin:8px 0}.factor-view .fv-step p{font-size:11px;line-height:1.7;color:#7f8b84;margin:0}.factor-view .fv-stepnum{font:11px Consolas,monospace;color:#258263}.factor-view .fv-step:last-child{background:#edf7f1;border-color:#bcdccd}.factor-view .fv-fieldline{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #edf0ee;font-size:12px}.factor-view .fv-fieldline:last-child{border-bottom:0}.factor-view .fv-matrix{display:grid;grid-template-columns:67px repeat(5,1fr);gap:5px;align-items:center;font-size:10px;text-align:center}.factor-view .fv-matrixcell{padding:12px 2px;border-radius:4px;font:11px Consolas,monospace}.factor-view .fv-input{border:1px solid #dce5df;border-radius:6px;padding:9px 10px;background:white;font:12px inherit;color:#40544a;min-width:0}.factor-view .fv-factorchips{display:flex;flex-wrap:wrap;gap:8px}.factor-view .fv-chip{padding:7px 10px;border:1px solid #cce2d6;border-radius:5px;background:#f0f8f3;font-size:11px;color:#247559}.factor-view .fv-role{display:flex;gap:9px;align-items:center;font-size:12px}.factor-view .fv-empty{padding:40px 20px;text-align:center;color:#87948d}.factor-view .fv-note{font-size:11px;color:#7f8d85;line-height:1.8}.factor-view .fv-log{font:11px/2 Consolas,monospace;background:#f7f9f8;border:1px solid #e5ebe7;padding:12px;border-radius:7px;color:#658074}.factor-view .fv-selectionrow{display:grid;grid-template-columns:1fr 55px 65px;gap:8px;padding:10px 0;border-bottom:1px solid #eef1ef;font-size:12px}.factor-view .fv-small-progress{width:95px;height:5px;background:#ecf0ed;border-radius:4px;overflow:hidden;margin-top:7px}.factor-view .fv-small-progress i{display:block;height:100%;background:#398e70}.factor-view input[type=checkbox]{accent-color:#258463}.factor-view input[type=range]{width:100%;accent-color:#268261}.factor-view textarea.fv-code{width:100%;box-sizing:border-box;resize:vertical;min-height:87px}.factor-view .fv-count{font:600 27px Consolas,monospace;color:#1a3d2e}.factor-view .fv-mutedcell{color:#94a098}@media(max-width:1000px){.factor-view .fv-split{grid-template-columns:1fr}.factor-view .fv-steps{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.factor-view .fv-steps{grid-template-columns:repeat(2,1fr)}.factor-view .fv-heat{gap:3px;grid-template-columns:65px repeat(12,minmax(8px,1fr))}}
  </style>`;

  window.getSelectionCandidates = function () {
    const s = state(), threshold = Number(s.selectionThreshold == null ? .02 : s.selectionThreshold), role = s.selectionRole || '预测';
    const result = window.FACTORS.filter(f => s.selectedFactors.has(f.id) && ready(f) && f.role === role && (role !== '预测' || Math.abs(f.ic || 0) >= threshold));
    return result.sort((a,b) => Math.abs(b.ic || 0)-Math.abs(a.ic || 0));
  };

  window.Pages.factors = function () {
    const U = window.UI, s = state();
    const query = (s.factorQuery || '').toLowerCase(), category = s.factorCategory || '全部';
    let list = window.FACTORS.filter(f => (category === '全部' || f.category === category) && `${f.id} ${f.name} ${f.category} ${f.role}`.toLowerCase().includes(query));
    const sort = s.factorSort || 'ic';
    list.sort((a,b)=> sort === 'coverage' ? b.coverage-a.coverage : sort === 'name' ? a.name.localeCompare(b.name,'zh-CN') : Math.abs(b[sort] || 0)-Math.abs(a[sort] || 0));
    const categories = ['全部','动量','波动','流动性','质量','估值','风格','量价','形态'];
    const filters = `<div class="toolbar"><input class="fv-input" id="factor-search" type="search" value="${esc(s.factorQuery || '')}" placeholder="搜索名称、编号或用途" aria-label="搜索因子" style="flex:1;min-width:160px"><label class="small muted">排序 <select class="fv-input" id="factor-sort" aria-label="因子排序">${[['ic','绝对 Rank IC'],['ir','绝对 ICIR'],['coverage','覆盖率'],['name','因子名称']].map(([v,n])=>`<option value="${v}" ${sort===v?'selected':''}>${n}</option>`).join('')}</select></label>${U.badge(`${list.length} 个因子`,'neutral')}</div><div class="tabs" style="margin-top:15px">${categories.map(c=>`<button class="tab ${c===category?'active':''}" data-action="factor-category" data-value="${c}">${c}</button>`).join('')}</div>`;
    const rows = list.map(f=>[
      `<input type="checkbox" data-factor="${f.id}" aria-label="选择${f.name}" ${s.selectedFactors.has(f.id)?'checked':''} ${!ready(f)?'disabled title="计算完成且覆盖率达标后才可选择"':''}>`,
      `<button class="fv-link fv-name" data-action="factor-detail" data-id="${f.id}"><span>${f.name}</span><span class="mono fv-mini">${f.id.toUpperCase()} · ${f.category}</span></button>`,
      U.badge(f.role,f.role==='风险约束'?'blue':f.role==='排雷'?'amber':'neutral'),
      `<span class="mono">${fixed(f.ic)}</span>`, `<span class="mono">${fixed(f.ir,2)}</span>`,
      `<span class="mono ${f.coverage<98?'negative':''}">${f.coverage.toFixed(1)}%</span>`,
      `<span class="mono muted">${f.version}</span>`, U.badge(f.status,badgeType(f.status))
    ]);
    return styles+`<div class="factor-view stack">
      <div class="grid-4">${U.metric('注册因子','16','8 类研究信号')}${U.metric('可用因子','12','计算完成 · 覆盖率 ≥ 98%','positive')}${U.metric('待完成','4','计算中 2 · 缺失 1 · 低覆盖 1')}${U.metric('当前已选',String(s.selectedFactors.size),'可传递到特征集')}</div>
      <div class="notice"><b>先看可用性，再看有效性。</b> 计算完成只代表产物可读取；预测、排雷和风险约束采用不同的评价标准。下方统计来自演示样本。</div>
      ${U.card('因子资产目录','统一管理定义、版本、研究证据与可用状态',filters+(list.length?U.table(['选择','因子名称','用途','Rank IC','ICIR','覆盖率','版本','状态'],rows):'<div class="fv-empty">没有匹配因子，请调整关键词或分类。</div>'),action('去筛选因子 →','navigate','data-page="selection"',true))}
      <div class="fv-topline"><span class="small muted">已选择 ${s.selectedFactors.size} 个因子 · 未完成产物不可进入特征集</span><div class="toolbar">${action('查看计算任务','navigate','data-page="compute"')}${action('带入特征筛选 →','navigate','data-page="selection"',true)}</div></div>
      <div class="grid-3">${U.card('方向与强弱','负 IC 不自动等于差因子',`<p class="small muted">保留原始 IC 符号。反向排序是否成立，只在训练窗口内判断，并在后续窗口验证；不要用测试期收益回头修改方向。</p>`)}${U.card('统一统计口径','日截面 · 5日标签 · 未年化 ICIR',`<p class="small muted">Rank IC 为逐日截面秩相关的均值；ICIR = 日 IC 均值 / 日 IC 标准差，保留符号。覆盖率分母是当日研究股票池应有样本。</p>`)}${U.card('研究证据随版本保存','定义变更不会覆盖历史结果',`<p class="small muted">每份证据绑定因子代码、数据快照、股票池、标签和时间区间。修改公式后生成新版本，下游引用仍指向原版本。</p>` )}</div>
    </div>`;
  };

  window.Pages.compute = function () {
    const U = window.UI, s = state();
    const retry = !!s.computeRetried;
    const months = Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'));
    const partitions = ['2023','2024','2025','2026'].map((year,ri)=>`<span>${year}</span>${months.map((m,i)=>{const cl=ri<2?'done':ri===2?(i<9?'done':i===10&&!retry?'missing':'done'):(i<6?'done':i<8?'running':'wait');return `<div class="fv-cell ${cl}" title="${year}-${m}：${{done:'已发布',running:'计算中',missing:'失败待重试',wait:'未覆盖'}[cl]}"></div>`;}).join('')}`).join('');
    const rows = [
      ['CALC-0905-018','残差动量 v0.2','2023-01 → 2026-09',U.badge('计算中','blue'),'<span class="mono">48.2%</span><div class="fv-small-progress"><i style="width:48.2%"></i></div>','按月分区 · 8 workers',action('查看日志','compute-log','data-id="CALC-0905-018"')],
      ['CALC-0905-017','Alpha 009 v0.3','2023-01 → 2026-09',U.badge('计算中','blue'),'<span class="mono">72.4%</span><div class="fv-small-progress"><i style="width:72.4%"></i></div>','断点续算 · 43 / 59 分片',action('查看日志','compute-log','data-id="CALC-0905-017"')],
      ['CALC-0905-016','60日价格位置 v0.6','2025-11',U.badge(retry?'已排队':'分区失败',retry?'blue':'red'),'<span class="mono">86.2%</span>','预热窗口不足',action(retry?'查看任务':'重试失败分区',retry?'compute-log':'retry-compute','data-id="CALC-0905-016"')],
      ['CALC-0905-015','20日动量 v1.3','2026-09-04',U.badge('已发布','green'),'<span class="mono">100%</span>','日增量 · 快照 fv_0904',action('查看产物','factor-detail','data-id="mom20"')]
    ];
    return styles+`<div class="factor-view stack">
      <div class="grid-4">${U.metric('因子定义','16','12 个已产出可用版本')}${U.metric('当前运行','2','按时间与股票分片')}${U.metric('需处理分区',retry?'0':'1',retry?'重试任务已排队':'预热窗口不足','negative')}${U.metric('最新完整快照','09.04','演示批次 · fv_0904')}</div>
      <div class="fv-split">
        ${U.card('因子定义工作台','示例：20日动量 · mom20 · v1.3',`<div class="form-grid">${U.field('因子名称','<input class="fv-input" id="compute-factor-name" value="20日动量" aria-label="因子名称">')}${U.field('运行模式','<select class="fv-input" id="compute-mode"><option>日增量计算</option><option>历史回填</option><option>失败分区重算</option></select>')}</div><label class="field" style="display:block;margin-top:14px"><span class="small muted">表达式定义</span><textarea id="compute-formula" class="fv-code" spellcheck="false" aria-label="因子公式">close / lag(close, 20) - 1</textarea></label><div class="fv-fieldline"><span class="muted">数据依赖</span><span>日线收盘价 · 交易日历 · 复权事件</span></div><div class="fv-fieldline"><span class="muted">可得时点</span><span>T 日收盘后 → 最早 T+1 交易</span></div><div class="fv-fieldline"><span class="muted">变更策略</span><span>保存新版本 · 保留旧产物</span></div><div class="toolbar" style="margin-top:14px">${action('保存定义草稿','save-factor-definition')}${action('新建计算配置','new-compute','',true)}</div>`)}
        ${U.card('依赖与产物','每一步都能够定位到数据版本',`<div class="fv-dag"><div class="fv-node">行情快照<br><span class="fv-mini">market_0904</span></div><span class="fv-arrow">→</span><div class="fv-node">复权 / 对齐<br><span class="fv-mini">processor v1</span></div><span class="fv-arrow">→</span><div class="fv-node final">mom20 v1.3<br><span class="fv-mini">code hash 41a7</span></div></div><div class="fv-dag" style="padding-top:0"><div class="fv-node">交易日历</div><span class="fv-arrow">↗</span><div class="fv-node">股票池快照</div><span class="fv-arrow">→</span><div class="fv-node final">因子分区快照</div></div><div class="notice notice-amber small">依赖不完整时阻断发布。新增公式不直接覆盖历史因子值；下游特征集始终固定版本。</div><div class="fv-fieldline"><span class="muted">发布检查</span><span>主键唯一 · 日期齐全 · 数值有限</span></div><div class="fv-fieldline"><span class="muted">横截面处理</span><span>原值保留，标准化版本单独记录</span></div><div class="fv-fieldline"><span class="muted">产物键</span><span class="mono">date × instrument × factor_version</span></div>`)}
      </div>
      ${U.card('分区覆盖与历史补算','示例：60日价格位置 · 月度分区视图',`<div class="fv-heat"><span>月份 / 年</span>${months.map(m=>`<span style="text-align:center">${m}</span>`).join('')}${partitions}</div><div class="fv-legend"><span><i class="fv-dot" style="background:#62ae91"></i>已发布</span><span><i class="fv-dot" style="background:#c5dfef"></i>计算中</span><span><i class="fv-dot" style="background:#fae5de"></i>失败待重试</span><span><i class="fv-dot" style="background:#edf0ef"></i>未覆盖 / 未到日期</span><span style="margin-left:auto">产物与状态均为设计样例</span></div>`,action('配置历史回填','new-compute'))}
      ${U.card('计算批次','进度、分区、错误原因和发布状态放在同一张任务表',U.table(['任务编号','因子版本','计算区间','状态','进度','执行信息','操作'],rows),action('全部任务 →','navigate','data-page="tasks"'))}
      <div class="grid-3">${U.card('01 · 增量与回填','先加载预热，再写目标区间',`<p class="small muted">20日窗口至少准备此前20个有效交易日。停牌与缺失按定义处理；回填任务读取更长历史，只发布目标区间，避免窗口边界错误。</p>`)}${U.card('02 · 质量与隔离','异常记录有原因码',`<p class="small muted">检查重复主键、NaN / Inf、零方差、覆盖率与分布漂移。区分预热缺值、停牌缺值和源数据缺失；失败分区隔离，支持幂等重试。</p>`)}${U.card('03 · 原子发布','完整批次才可供下游读取',`<p class="small muted">临时区计算完成后校验并原子发布快照。记录代码、依赖快照、配置哈希及日志；数据订正后标记受影响产物，重算生成新版本。</p>`)}</div>
    </div>`;
  };

  window.Pages.selection = function () {
    const U = window.UI, s = state(), threshold = Number(s.selectionThreshold == null ? .02 : s.selectionThreshold), role = s.selectionRole || '预测';
    const candidates = window.getSelectionCandidates();
    const resultIds = Array.isArray(s.selectionIds) ? s.selectionIds : candidates.map(f=>f.id);
    const result = window.FACTORS.filter(f=>resultIds.includes(f.id) && ready(f));
    const steps = [
      ['01','候选因子','来自因子库的固定版本'],['02','覆盖检查','缺失、可得时点、覆盖率'],['03','训练窗口检验','IC方向、分期稳定性'],['04','相关性去重','训练期冗余与类别平衡'],['05','验证集比较','增量贡献、成本与复杂度'],['06','冻结特征集','测试集不参与选择']
    ];
    const matrixLabels = ['REV5','MOM20','VOL20','TURN20','BP'];
    const matrix = [[1,-.26,-.12,.33,-.06],[-.26,1,.19,-.18,.22],[-.12,.19,1,.41,-.08],[.33,-.18,.41,1,-.16],[-.06,.22,-.08,-.16,1]];
    const matrixHTML = `<div class="fv-matrix"><span></span>${matrixLabels.map(n=>`<span>${n}</span>`).join('')}${matrix.map((row,i)=>`<span style="text-align:left">${matrixLabels[i]}</span>${row.map((v,j)=>`<div class="fv-matrixcell" title="${matrixLabels[i]} × ${matrixLabels[j]}：${v.toFixed(2)}" style="background:${i===j?'#3d9476':v>=0?`rgba(58,148,116,${.07+Math.abs(v)*.55})`:`rgba(98,137,184,${.08+Math.abs(v)*.6})`};color:${i===j?'white':'#466156'}">${v>0?'+':''}${v.toFixed(2)}</div>`).join('')}`).join('')}</div>`;
    const selectionContent = s.selectionRan ? `<div class="fv-topline" style="margin-bottom:13px"><div><span class="fv-count">${result.length}</span> <span class="small muted">个候选已通过演示规则</span></div>${U.badge('等待验证集比较','amber')}</div><div class="fv-selectionrow muted"><span>因子 / 原始方向</span><span>IC</span><span>覆盖率</span></div>${result.map(f=>`<div class="fv-selectionrow"><span><button class="fv-link" data-action="factor-detail" data-id="${f.id}">${f.name}</button><small class="muted" style="display:block;margin-top:3px">${f.direction} · ${f.version}</small></span><span class="mono">${fixed(f.ic)}</span><span class="mono">${f.coverage.toFixed(1)}%</span></div>`).join('')}${result.length?'': '<div class="fv-empty">当前规则没有入选因子，可调整用途或阈值。</div>'}<p class="fv-note">这里仅对样例统计做本地过滤，不执行真实 IC 计算、去重或验证实验。保存得到待验证草稿，完整服务接入后再完成冻结。</p><div class="toolbar">${action('保存特征集草稿','save-feature-set','',true)}${action('查看数据集 →','navigate','data-page="dataset"')}</div>` : `<div class="fv-empty" style="padding:34px 12px"><div style="color:#439877;font-size:28px;margin-bottom:14px">⌁</div><b style="color:#3e5d4e">先定义规则，再比较候选</b><p style="font-size:12px;line-height:1.8">调整左侧配置，点击“运行筛选演示”。<br>结果保留原始 IC 方向与版本信息。</p></div><div class="notice small">演示阈值不是通用有效性标准。真实筛选须补充分期稳定性、冗余和验证集证据。</div>`;
    return styles+`<div class="factor-view stack">
      <div class="notice"><b>选择过程也需要样本外验证。</b> 训练集决定方向和候选，验证集比较方案，最终测试集只评价已经冻结的选择。排雷与风险因子另设准入规则。</div>
      <div class="fv-steps">${steps.map(([n,title,desc])=>`<div class="fv-step"><span class="fv-stepnum">STEP ${n}</span><b>${title}</b><p>${desc}</p></div>`).join('')}</div>
      <div class="fv-split">
        ${U.card('筛选实验配置',`来自因子库的 ${s.selectedFactors.size} 个已选因子 · 配置与版本一同保存`,`
          <div class="form-grid">${U.field('研究股票池','<select class="fv-input" id="selection-universe"><option>中证500 · 历史成分</option><option>全 A 股 · 历史可交易池</option></select>')}${U.field('评估标签','<select class="fv-input" id="selection-label"><option>T+1开盘 → T+6开盘收益</option><option>T+1开盘 → T+11开盘收益</option></select>')}</div>
          <div style="margin-top:18px"><label class="small muted" for="selection-role">特征用途</label><select class="fv-input" id="selection-role" style="width:100%;margin-top:7px">${['预测','排雷','风险约束'].map(r=>`<option ${r===role?'selected':''}>${r}</option>`).join('')}</select></div>
          <div style="margin-top:20px"><div class="fv-topline"><label class="small" for="selection-threshold">训练期 |Rank IC| 门槛</label><span class="mono" id="selection-threshold-value">${threshold.toFixed(2)}</span></div><input id="selection-threshold" type="range" min="0" max="0.08" step="0.01" value="${threshold}" ${role!=='预测'?'disabled':''}><div class="fv-topline fv-mini"><span>0.00</span><span>${role==='预测'?'用于预测候选初筛':'当前用途不使用 IC 硬阈值'}</span><span>0.08</span></div></div>
          <div class="fv-fieldline"><span class="muted">最低样本覆盖</span><span>98% · 已完成版本</span></div>
          <div class="fv-fieldline"><span class="muted">方向 / 稳定性</span><span>训练期确定 · 3 个滚动窗口</span></div>
          <div class="fv-fieldline"><span class="muted">冗余规则（设计）</span><span>|相关系数| &gt; 0.80 → 比较增量贡献</span></div>
          <div class="fv-fieldline"><span class="muted">信号生成时点</span><span>T 日收盘后，仅用此时已可得数据</span></div>
          <div class="fv-fieldline"><span class="muted">训练 / 验证 / 测试</span><span>2021–2023 / 2024 / 2025</span></div>
          <p class="fv-note">标签跨越切分边界的样本需剔除；设置与标签期限相匹配的 purge / embargo。所有预处理仅在各训练折拟合。</p>
          ${action('运行筛选演示','run-selection','',true)}
        `)}
        ${U.card('候选特征集',s.selectionRan?'本地演示结果 · 尚未完成真实验证':'输出将绑定股票池、标签和筛选窗口',selectionContent)}
      </div>
      <div class="grid-2">
        ${U.card('因子相关性矩阵','训练窗口 · 原始因子值的截面 Spearman 相关均值 · 样例',matrixHTML+`<div class="fv-legend"><span><i class="fv-dot" style="background:#69a28b"></i>正相关</span><span><i class="fv-dot" style="background:#9fb7d1"></i>负相关</span><span>对角线 +1.00</span></div><p class="fv-note">去重看绝对相关程度，负相关也可能表达重复信息。实际矩阵在统一样本交集内计算，并保留有效交易日数量；这里展示 5 个样例因子。</p>`)}
        ${U.card('筛选证据与排除原因','每个未入选因子都有可追溯原因',U.table(['因子','示例原因','下一步'],[
          ['Alpha 009',U.badge('尚未计算完成','blue'),'完成回填后再评估'],['60日价格位置',U.badge('覆盖率 86.2%','amber'),'补齐预热区间'],['20日收益偏度',U.badge('默认预测阈值未达标','amber'),'保存弱信号的研究记录'],['市场 Beta',U.badge('用于风险约束','neutral'),'进入组合暴露控制']
        ])+`<div class="notice small" style="margin-top:12px">不把“预测IC偏低”视作全部用途下的无效。排雷关注尾部损失改善，风险因子关注暴露解释和覆盖。</div>`)}
      </div>
      ${U.card('从特征集到可复现实验','一份锁定配置，连接数据集、模型和策略',`<div class="grid-3"><div><div class="fv-mini">FEATURE SET</div><h3 style="font-size:14px;margin:10px 0">保存研究上下文</h3><p class="small muted">因子 ID / 版本 / 方向 / 用途、股票池快照、数据可得时点、标签和预处理定义。</p></div><div><div class="fv-mini">VALIDATION EVIDENCE</div><h3 style="font-size:14px;margin:10px 0">保留方案比较</h3><p class="small muted">候选数、尝试次数、滚动窗口、增量 Rank IC、组合换手和样本外表现；不只保留最优结果。</p></div><div><div class="fv-mini">LOCKED SNAPSHOT</div><h3 style="font-size:14px;margin:10px 0">冻结后交给下一环</h3><p class="small muted">特征集版本 → 数据集快照 → 模型实验。测试集结果出现后修改方案，必须标记该测试集已被研究使用。</p></div></div><div class="divider"></div><div class="fv-topline"><span class="small muted">支持模型训练，也支持直接按因子加权构建策略。</span><div class="toolbar">${action('构建数据集 →','navigate','data-page="dataset"',true)}${action('因子合成路径 →','qf-factor-route')}</div></div>`)}
    </div>`;
  };
})();
