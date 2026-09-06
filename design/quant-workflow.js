/* Shared navigation and input/output contracts for the quant research lifecycle. */
(() => {
  const U=UI,E=escapeHTML;
  const modelRoute=()=>State.strategy.source!=='因子合成';
  const stages=[
    {id:'data',name:'数据准备',detail:'接入 · 校验 · 快照',pages:['data'],entry:()=> 'data'},
    {id:'factor',name:'因子研究',detail:'计算 · 评估 · 筛选',pages:['compute','factors','selection'],entry:()=> 'compute'},
    {id:'sample',name:'样本设计',detail:'股票池 · 标签 · 切分',pages:['dataset'],entry:()=> 'dataset'},
    {id:'signal',name:'信号与组合',detail:'模型 / 合成 · 组合规则',pages:['training','strategy'],entry:()=>modelRoute()?'training':'strategy'},
    {id:'backtest',name:'回测归因',detail:'撮合 · 成本 · 样本外审计',pages:['backtest'],entry:()=> 'backtest'},
    {id:'monitor',name:'模拟跟踪',detail:'冻结 · 观测 · 异常复核',pages:['monitor'],entry:()=> 'monitor'}
  ];
  const contracts={
    data:{input:'已有行情、证券主表、历史成分与因子分区',output:'有版本的数据快照与质量检查记录',gate:'校验主键、单位、覆盖范围与实际可知时间；可用分区先接入。',prev:'overview',next:()=> 'compute'},
    compute:{input:'数据快照、因子定义、依赖与预热区间',output:'带公式版本和缺失原因的因子分区',gate:'分区校验通过后登记资产；计算完成还需要检验研究有效性。',prev:'data',next:()=> 'factors'},
    factors:{input:'已登记的因子定义、计算版本与分区',output:'覆盖率、方向、IC 与稳定性等研究证据',gate:'在预设研究区间评估；可计算、覆盖高并不等于有效。',prev:'compute',next:()=> 'selection'},
    selection:{input:'因子画像、训练期证据与候选因子',output:'带版本、方向、用途的待验证特征集',gate:'保留筛选依据与尝试记录；最终测试期不参与筛选。',prev:'factors',next:()=> 'dataset'},
    dataset:{input:'特征集、历史股票池与固定数据快照',output:'标签、可知时点、训练 / 验证 / 测试切分',gate:'隔离时间、净化跨界标签，预处理只在训练区间拟合；因子合成也需要明确评价样本。',prev:'selection',next:()=>modelRoute()?'training':'strategy'},
    training:{input:'按时间切分的样本与冻结的预处理约定',output:'实验记录、验证证据、模型与预测分数',gate:'在训练和验证区间确定配置，登记模型与预处理器；保留最终测试期。',prev:'dataset',next:()=> 'strategy'},
    strategy:{input:()=>modelRoute()?'已注册模型、预处理器与预测分数':'特征集、锁定方向、标准化与合成权重',output:'信号来源、调仓规则、风险约束与目标组合',gate:'冻结信号和组合配置；因子合成权重仅在研究区间确定。',prev:()=>modelRoute()?'training':'dataset',next:()=> 'backtest'},
    backtest:{input:'冻结策略、历史行情、证券状态与交易规则',output:'费后表现、成交记录、风险归因与审计包',gate:'核验样本外表现、成本和成交约束；通过审计的候选版本才进入模拟运行。',prev:'strategy',next:()=> 'monitor'},
    monitor:{input:'通过研究审计的候选策略及锁定运行包',output:'模拟账本、信号覆盖、执行偏差与复核记录',gate:'数据或信号异常时定位原因；修改核心输入需新建研究版本并重新验证。',prev:'backtest'}
  };
  const pageName=p=>navItems.find(n=>n[0]===p)?.[2]||p;
  const link=(p,t,primary=false,tab='')=>`<button class="btn ${primary?'btn-primary':''}" data-page="${p}" ${tab?`data-tab="${tab}"`:''}>${E(t||pageName(p))}</button>`;
  const value=v=>typeof v==='function'?v():v;
  const routePicker=()=>`<div class="qf-route"><label for="qf-route">信号研究路径</label><select id="qf-route"><option value="模型打分" ${modelRoute()?'selected':''}>模型打分 · 样本 → 训练验证 → 组合</option><option value="因子合成" ${!modelRoute()?'selected':''}>因子合成 · 样本 → 合成规则与组合</option></select><span>切换后与策略页的信号类型同步。</span></div>`;
  function flow(active,overview=false){return `<nav class="qf-flow ${overview?'pipeline':''}" aria-label="量化研究流程">${stages.map((s,i)=>`<button class="${active===s.id?'current':''} ${overview?'pipe-node':''}" data-page="${s.entry()}" ${active===s.id?'aria-current="step"':''}><span class="qf-num">0${i+1}</span><strong>${s.name}</strong><small>${s.detail}</small></button>`).join('')}</nav>`}
  function substeps(stage){let pages=stage.pages;if(stage.id==='signal'&&!modelRoute()&&State.page!=='training')pages=['strategy'];if(pages.length<2)return '';
    return `<div class="qf-substeps" aria-label="当前阶段的研究步骤"><span>阶段内步骤</span>${pages.map((p,i)=>`${i?'<i aria-hidden="true">→</i>':''}<button class="${State.page===p?'active':''}" data-page="${p}" ${State.page===p?'aria-current="page"':''}>${pageName(p)}</button>`).join('')}${stage.id==='signal'?'<small>模型路径：先验证并注册，再引用模型构建组合。</small>':''}</div>`;
  }
  function header(page){const stage=stages.find(s=>s.pages.includes(page)),c=contracts[page];return `<section class="qf-guide" aria-label="当前研究环节"><div class="qf-caption"><span>QUANT RESEARCH / 量化研究链路</span><span>高亮表示当前位置 · 可自由查看各环节</span></div>${flow(stage.id)}${substeps(stage)}${['dataset','training','strategy'].includes(page)?routePicker():''}${page==='training'&&!modelRoute()?`<div class="qf-branch-note">当前选择因子合成路径，无需训练模型；此页可用来查看模型对照实验。${link('strategy','继续因子合成 →')}</div>`:''}<div class="qf-contract"><div><span>承接输入</span><p>${E(value(c.input))}</p></div><div><span>本步产物</span><p>${E(c.output)}</p></div><div><span>进入下步前</span><p>${E(c.gate)}</p></div></div></section>`}
  function footer(page){const c=contracts[page];if(page==='monitor')return U.card('从跟踪结果回到研究问题','按异常类型复核；修订后重新验证并冻结新候选版本',`<div class="qf-review-links"><div><strong>数据缺失 / 覆盖下降</strong><p>检查数据可用性与因子分区。</p>${link('data','回到数据质量','', 'quality')}${link('compute','检查因子计算')}</div><div><strong>信号漂移 / 效果衰减</strong><p>复核样本定义与信号研究证据。</p>${link('dataset','复核样本设计')}${link(modelRoute()?'training':'selection',modelRoute()?'复核模型实验':'复核因子筛选')}</div><div><strong>成交偏差 / 成本异常</strong><p>核对组合约束和撮合假设。</p>${link('strategy','复核组合规则')}${link('backtest','复核回测归因')}</div></div><div class="qf-end"><span>模拟阶段保持候选版本固定；复核不会自动替换运行配置。</span>${link('backtest','← 返回回测归因')}</div>`);
    const next=c.next();return `<section class="qf-handoff" aria-label="前后研究环节"><div><span>下一步 / ${E(pageName(next))}</span><p>${E(value(contracts[next].input))}</p><small>当前可继续评审流程；页面跳转不会执行计算或标记验证通过。</small></div><div class="toolbar">${link(value(c.prev),'← '+pageName(value(c.prev)))}${link(next,page==='backtest'?'查看模拟跟踪设计 →':'继续到'+pageName(next)+' →',true)}${page==='data'?link('factors','已有因子？查看资产库'):''}</div></section>`}
  function overviewCard(){return U.card('量化研究全链路','每一步承接上一环节的产物；已有因子可从资产库进入，任务中心支撑整条链路',`${flow('',true)}${routePicker()}<div class="qf-overview-note"><div><strong>两条信号路径，共用验证标准</strong><p>模型打分通过训练与注册产出信号；因子合成通过锁定方向与权重产出信号。两者都要经过组合约束、样本外回测与模拟跟踪。</p></div><div><strong>用跟踪发现新研究问题</strong><p>数据异常回到质量检查，信号漂移回到研究验证，执行偏差回到组合与撮合假设。修订后的候选版本重新接受检验。</p></div></div>`,U.badge('六阶段 · 两条信号路径','green'))}
  window.QuantFlow={stages,overviewCard};
  for(const page of Object.keys(contracts)){const original=Pages[page];Pages[page]=()=>header(page)+original()+footer(page)}
  const previousAction=window.handleExtraAction;
  window.handleExtraAction=(action,el)=>{
    if(action!=='qf-factor-route')return previousAction?.(action,el)||false;
    if(State.strategy.source!=='因子合成'){State.strategy.source='因子合成';invalidate('strategy')}
    navigate('dataset');toast('先明确样本与评价区间，再进入因子合成与组合构建');return true;
  };
  document.addEventListener('change',e=>{if(e.target.id!=='qf-route')return;const source=e.target.value;if(source===State.strategy.source)return;State.strategy.source=source;invalidate('strategy');render(true);toast(source==='因子合成'?'已选择因子合成路径；样本设计后可进入组合构建':'已选择模型打分路径；先验证并注册模型，再构建组合')});
})();
