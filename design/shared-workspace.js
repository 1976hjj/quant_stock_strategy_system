/* Public workspace documentation, shared by both research paths. */
(() => {
  const U=UI,E=escapeHTML;
  const pageId='workspace-design';
  navItems.push([pageId,'◇','空间设计与接入','量化与情报两条研究路径、共享资源和接入约定']);
  const link=(page,label)=>`<button class="btn" data-page="${page}">${label}</button>`;
  const publicNav=()=>`<section class="shared-nav" aria-label="公共工作区"><div class="nav-section">WORKSPACE / 公共工作区</div><button class="nav-item ${State.page===pageId?'active':''}" data-page="${pageId}" ${State.page===pageId?'aria-current="page"':''}><span class="nav-icon">◇</span>空间设计与接入</button></section>`;
  const researchSwitch=()=>`<div class="space-switch" aria-label="研究空间"><button data-page="overview">量化研究 ↗</button><button data-page="intelligence">情报研究 ↗</button></div>`;
  const previousShell=window.renderWorkspaceShell;
  window.renderWorkspaceShell=()=>{
    const shared=State.page===pageId;
    document.body.classList.toggle('shared-space',shared);
    if(!shared){
      previousShell?.();
      document.getElementById('sidebar').insertAdjacentHTML('beforeend',publicNav());
      return;
    }
    document.body.classList.remove('intel-space');
    document.title='空间设计与接入 · 研序公共工作区';
    document.getElementById('sidebar').innerHTML=`<div class="brand"><div class="brand-mark">◇</div><div><div class="brand-name">研序</div><div class="brand-sub">SHARED WORKSPACE</div></div></div>${researchSwitch()}${publicNav()}`;
    document.getElementById('topbar').innerHTML=`<div class="toolbar"><button class="btn menu-toggle" data-action="toggle-nav" aria-label="展开菜单">☰</button><span class="crumb">公共工作区 &nbsp; / &nbsp; <strong>空间设计与接入</strong></span></div><div class="top-actions">${U.badge('量化与情报共同使用','blue')}<span class="avatar">研</span></div>`;
    document.getElementById('page-heading').innerHTML=`<div><div class="page-meta">SHARED WORKSPACE</div><h1>空间设计与接入</h1><p>两条研究路径的统一说明：研究职责、共享资源与成果交接。</p></div><div class="toolbar">${link('overview','进入量化研究 ↗')}${link('intelligence','进入情报研究 ↗')}</div>`;
    document.querySelector('footer').innerHTML='研序 · 公共工作区 <span>量化研究与情报研究共享的架构说明 · 当前为离线原型</span>';
  };
  Pages[pageId]=()=>`<div class="shared-view stack">
    <section class="shared-intro"><span>ONE PLATFORM / TWO RESEARCH PATHS</span><h2>两条研究路径，共用一套研究基础。</h2><p>量化研究检验规律能否复现，情报研究解释变化意味着什么。通过明确的成果交接，让两类研究相互补充。</p></section>
    <div class="grid-2 shared-paths">
      ${U.card('量化研究','从数据出发，验证信号与策略',`<div class="shared-flow">${QuantFlow.stages.map(s=>`<span>${E(s.name)}</span>`).join('')}</div><dl><dt>主要产物</dt><dd>数据快照、特征集、研究样本、模型 / 合成规则、策略与回测审计包。</dd><dt>验证重点</dt><dd>时间隔离、样本外稳定性、交易成本、组合约束和模拟执行偏差。</dd><dt>信号分支</dt><dd>模型路径经过训练与注册；因子合成路径在样本设计后进入组合构建。两者都需接受回测与跟踪。</dd></dl>${link('overview','打开量化研究工作台 →')}`)}
      ${U.card('情报研究','从事件出发，核验解释与判断',`<div class="shared-flow">${['事件雷达','专题研判','研究备忘录','持续跟踪','研究档案'].map(x=>`<span>${x}</span>`).join('')}</div><dl><dt>主要产物</dt><dd>事件证据、判断快照、成立与失效条件、复核记录和量化交接草稿。</dd><dt>验证重点</dt><dd>信息增量、原始出处、真实可知时点、相反解释与后续事实。</dd><dt>协作方式</dt><dd>研究角色围绕同一问题共享证据；跟踪记录检验原有判断，并保留每次修订的依据。</dd></dl>${link('intelligence/radar','打开情报事件雷达 →')}`)}
    </div>
    ${U.card('共用什么，各自维护什么','统一数据与追溯规则，两条路径保留自己的研究产物',`<div class="shared-table">${U.table(['范围','共用基础','各自维护'],[
      ['行情与证券信息','行情快照、证券主表、历史股票池、行业映射','量化用于样本与撮合；情报用于对象核验和市场观察'],
      ['时间与版本','实际可知时间、固定快照、版本标识与来源引用','量化保留实验 / 策略版本；情报保留证据 / 报告版本'],
      ['结果与证据','输入可追溯，修订产生新版本','统计验证与事实核验分别记录，不相互替代'],
      ['任务与存储','正式接入可共用执行和存储基础设施','作业类型、研究状态和产物目录按工作区区分']
    ])}</div>`)}
    ${U.card('如何连接 / 研究成果交接','由明确的研究问题连接两条路径',`<div class="shared-bridge"><div><strong>情报研究</strong><p>提出假设，保留事件、对象映射与证据快照。</p></div><span aria-hidden="true">→</span><div><strong>量化研究交接单</strong><p>约定可知时点、事件窗口、对照基准与反证条件。</p></div><span aria-hidden="true">→</span><div><strong>量化验证</strong><p>构建历史事件样本，完成样本外检验，再判断能否形成研究信号。</p></div></div><p class="shared-note">量化验证结果也可作为情报复核的补充证据。交接时保留原报告与原实验引用，避免后来信息覆盖当时判断。</p><div class="notice notice-blue">当前可在情报备忘录中创建并导出交接草稿；量化侧的事件研究执行器与自动结果回传待接入。</div>`)}
    ${U.card('接入顺序与当前范围','两条路径分别落地，共享层按统一契约接入',`<div class="shared-table">${U.table(['层级','当前原型可体验','正式接入工作'],[
      ['公共基础','工作区切换、统一路径说明与版本约定','数据目录、证券映射、快照存储和统一访问接口'],
      ['量化研究','六阶段导航、配置、样例报告与导出','接入现有行情和因子，执行样本、训练、回测与模拟任务'],
      ['情报研究','事件筛选、示例研判、报告、手动跟踪与档案','原始资料采集、去重归并、真实模型分析和增量提醒'],
      ['研究交接','创建并导出带证据的量化研究草稿','事件样本执行器、样本外验证与结果引用回传']
    ])}</div>`)}
    <div class="grid-2">${U.card('量化工程设计','数据接入、任务协议、血缘和实施路线',`<p class="shared-note">量化侧的具体实现约定保留在系统蓝图中。</p>${link('blueprint','查看量化系统蓝图 →')}`)}${U.card('情报工程设计','原始资料、事件、角色观察与报告契约',`<p class="shared-note">下方可展开情报侧的证据时间、数据契约与编排说明。</p><button class="btn" data-action="shared-intel-details">展开情报接入说明 ↓</button>`)}</div>
    <details id="shared-intel-details" class="card"><summary>情报接入详情 / 数据契约与执行边界</summary><div class="card-body">${IntelEngine.styles}<div class="intel-view stack">${IntelEngine.designView()}</div></div></details>
  </div>`;
  const previousAction=window.handleExtraAction;
  window.handleExtraAction=(action,el)=>{
    if(action!=='shared-intel-details')return previousAction?.(action,el)||false;
    const details=document.getElementById('shared-intel-details');details.open=true;details.scrollIntoView({block:'start',behavior:'smooth'});return true;
  };
})();
