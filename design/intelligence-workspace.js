/* Independent event-research workspace. All cases are offline fictional fixtures. */
(() => {
  const X=IntelEngine,I=State.intelligence,U=UI,E=escapeHTML;
  const views=[['radar','⌁','事件雷达','发现值得研究的变化，先判断信息增量。'],['desk','◎','专题研判','围绕一个问题，核验证据、比较解释、形成判断。'],['report','▧','研究备忘录','保留结论的依据、成立条件与失效边界。'],['watch','◉','持续跟踪','用后续证据检验判断，记录支持、反证与修订。'],['library','▤','研究档案','回看每次判断及其证据，把经验留作下一次研究的起点。']];
  I.tab='radar';I.dispositions={};I.watches=[];I.latest={};I.latest[I.eventId]=I.report;I.runLog=[];
  const b=(label,action,extra='',primary=false)=>U.button(label,'intel-'+action,primary?'primary':'default',extra);
  const go=(label,view,primary=false)=>b(label,'tab',`data-value="${view}"`,primary);
  const allReports=()=>[...new Map([...I.archives,...Object.values(I.latest)].filter(Boolean).map(r=>[r.id,r])).values()];
  const setView=view=>{if(view==='design'){navigate('workspace-design');return}I.tab=views.some(v=>v[0]===view)||view==='agents'?view:'radar';document.body.classList.remove('nav-open');render()};
  const status=ev=>I.dispositions[ev.id]==='archived'?'已归档':I.watches.some(w=>w.eventId===ev.id&&w.status!=='已归档')?'跟踪中':I.latest[ev.id]&&!I.latest[ev.id].preset?'已研判':I.dispositions[ev.id]==='research'?'研判中':'待筛选';
  const nextChecks=ev=>ev.paths.slice(0,2).map(p=>p[5]).join('；');

  window.renderWorkspaceShell=()=>{
    const intel=State.page==='intelligence';document.body.classList.toggle('intel-space',intel);
    const side=document.getElementById('sidebar');
    if(!intel){
      // Move the former chain item into a peer-workspace switch.
      side.querySelector('[data-page="intelligence"]')?.remove();
      side.querySelector('.brand').insertAdjacentHTML('afterend',`<div class="space-switch" aria-label="研究空间"><button class="selected" disabled aria-current="true">量化研究</button><button data-page="intelligence">情报研究 ↗</button></div>`);
      document.querySelector('footer').innerHTML='研序 QUANT · 量化研究原型 <span>全部行情、因子指标与收益均为演示数据</span>';
      return;
    }
    if(!views.some(v=>v[0]===I.tab)&&I.tab!=='agents')I.tab='radar';
    const tab=I.tab==='agents'?'desk':I.tab,v=views.find(v=>v[0]===tab);
    history.replaceState(null,'','#intelligence/'+I.tab);
    document.title=v[2]+' · 研序情报研究';
    side.innerHTML=`<div class="brand"><div class="brand-mark">⌁</div><div><div class="brand-name">研序 <small>INTEL</small></div><div class="brand-sub">INTELLIGENCE WORKSPACE</div></div></div><div class="space-switch" aria-label="研究空间"><button data-page="overview">量化研究 ↗</button><button class="selected" data-page="intelligence">情报研究</button></div><div class="nav-section">INTELLIGENCE / 情报研究</div>${views.slice(0,5).map((n,i)=>`<button class="nav-item ${tab===n[0]?'active':''}" data-action="intel-tab" data-value="${n[0]}"><span class="nav-icon">${n[1]}</span>${n[2]}<span class="nav-count">0${i+1}</span></button>`).join('')}`;
    document.getElementById('topbar').innerHTML=`<div class="toolbar"><button class="btn menu-toggle" data-action="toggle-nav" aria-label="展开菜单">☰</button><span class="crumb">情报研究空间 &nbsp; / &nbsp; <strong>${v[2]}</strong></span></div><div class="top-actions">${U.badge('虚构案例 · 离线演示','amber')}<span class="avatar">研</span></div>`;
    document.getElementById('page-heading').innerHTML=`<div><div class="page-meta">INTELLIGENCE / ${String(views.indexOf(v)+1).padStart(2,'0')}</div><h1>${v[2]}</h1><p>${v[3]}</p></div><div class="toolbar">${b('↓ 导出工作区','export-workspace')}${tab!=='radar'?go('发现事件 →','radar',true):go('继续当前研判 →','desk',true)}</div>`;
    document.querySelector('footer').innerHTML='研序 INTEL · 独立情报研究空间 <span>2026.09.04 演示快照 · 未接入新闻、模型或自动监控</span>';
  };

  function journey(active){return `<nav class="iw-journey" aria-label="情报研究流程">${views.slice(0,5).map((v,i)=>`<button class="${active===v[0]?'current':''}" data-action="intel-tab" data-value="${v[0]}"><span>0${i+1}</span><strong>${v[2]}</strong><small>${['筛掉噪声','回答问题','冻结判断','验证与修订','沉淀经验'][i]}</small></button>`).join('')}</nav>`}
  function radar(){
    const ev=X.selected(),src=X.visibleSources(ev,I.cutoff),primary=src.find(s=>s.kind==='原始资料');
    const list=X.events.filter(e=>(I.type==='全部'||e.type===I.type)&&(e.name+e.short+e.sector).includes(I.query)&&(I.radarFilter==='archived'?status(e)==='已归档':status(e)!=='已归档'));
    return `<div class="iw-intro"><div><span class="iw-eyebrow">SIGNAL BEFORE NOISE</span><h2>先发现变化，再决定是否值得深挖。</h2><p>以事件聚合信息，以问题组织研究，让判断随着新证据更新。</p></div><div class="iw-snapshot"><span>示例资料快照</span><strong>${I.cutoff.replace('T',' · ')}</strong><small>三个虚构案例，用于演示不同研究路径</small></div></div>${journey('radar')}<div class="iw-stats"><div><span>待筛选事件</span><strong>${X.events.filter(e=>status(e)==='待筛选').length.toString().padStart(2,'0')}</strong></div><div><span>研判中 / 已研判</span><strong>${X.events.filter(e=>['研判中','已研判'].includes(status(e))).length.toString().padStart(2,'0')}</strong></div><div><span>持续跟踪</span><strong>${I.watches.filter(w=>w.status!=='已归档').length.toString().padStart(2,'0')}</strong></div><div><span>新增资料</span><strong>—</strong><small>等待接入数据源</small></div></div><div class="iw-radar-layout"><section class="card iw-inbox"><div class="card-head"><div><h2>事件收件箱</h2><p>原文、转载与澄清归入同一事件</p></div>${U.badge(list.length+' 个事件')}</div><div class="card-body"><div class="iw-filters"><input id="intel-search" type="search" value="${E(I.query)}" placeholder="搜索事件 / 行业" aria-label="搜索事件">${U.select('intel-type',['全部','政策与产业','供需与成本','公司与舆论'],I.type)}</div><div class="chip-row" style="margin:15px 0">${b('待处理','filter',`data-value="active" aria-pressed="${I.radarFilter!=='archived'}"`)}${b('已归档','filter',`data-value="archived" aria-pressed="${I.radarFilter==='archived'}"`)}</div>${list.map((e,i)=>`<button class="intel-feeditem iw-event ${e.id===ev.id?'active':''}" data-action="intel-event" data-id="${e.id}"><div class="toolbar">${U.badge(e.type,'blue')}${U.badge(status(e),status(e)==='跟踪中'?'green':'neutral')}<span class="iw-event-index">${e.sources[0].known.slice(11)}</span></div><strong>${E(e.name)}</strong><p>${E(e.short)}</p><div class="iw-event-foot"><span>${E(e.sector)}</span><span>查看事件 ↗</span></div></button>`).join('')||'<div class="intel-empty">当前分类没有事件。可以切换分类或清空搜索。</div>'}</div></section><section class="card iw-triage"><div class="card-head"><div><span class="iw-eyebrow">EVENT BRIEF / 事件速览</span><h2>${E(ev.name)}</h2></div></div><div class="card-body"><div class="toolbar">${U.badge(ev.stage,'amber')}${U.badge(status(ev))}</div><div class="iw-brief-block"><span>01 / 发生了什么</span><p>${primary?E(primary.text):'当前截止时点尚无可用原始资料，先补充证据。'}</p>${primary?b('查看原文 '+primary.id,'source',`data-id="${primary.id}"`):''}</div><div class="iw-brief-block"><span>02 / 为什么值得研究</span><p>${E(ev.short)}</p><small>关注范围：${E(ev.sector)}</small></div><div class="iw-brief-block"><span>03 / 下一步需要知道什么</span><p>${E(nextChecks(ev))}</p></div><div class="iw-evidence-count"><strong>${src.filter(s=>s.kind==='原始资料').length}</strong> 份原始资料 <span>·</span> ${src.length} 份可用资料 <span>·</span> ${ev.sources.length-src.length} 份时点后资料排除</div><div class="toolbar">${b('进入专题研判 →','begin','',true)}${b(status(ev)==='已归档'?'恢复到收件箱':'暂不研究 · 归档',status(ev)==='已归档'?'restore-event':'archive-event')}</div></div></section></div>`;
  }

  function evidencePanel(){const ev=X.selected(),sources=X.visibleSources(ev,I.cutoff);return U.card('证据台','资料以实际可知时间过滤；原文、市场观察和公开观点分别呈现',`<div class="iw-evidence-list">${sources.map(s=>`<div><div class="toolbar">${U.badge(s.kind,s.kind==='原始资料'?'green':'neutral')}<span class="small muted">可知 ${s.known.replace('T',' ')}</span>${b('['+s.id+'] 查看来源','source',`data-id="${s.id}"`)}</div><h3>${E(s.title)}</h3><p>${E(s.text)}</p><small>${E(s.status)}</small></div>`).join('')||'<div class="intel-empty">这个时点没有可引用的资料，暂时无法开展完整研判。</div>'}</div>${sources.length<ev.sources.length?`<div class="notice notice-amber">${ev.sources.length-sources.length} 份后续资料已排除。调整截止时点后才能纳入研判。</div>`:''}`)}
  function desk(){const ev=X.selected(),sources=X.visibleSources(ev,I.cutoff);return `${journey('desk')}<div class="iw-context"><div>${U.badge(ev.type,'blue')}<h2>${E(ev.name)}</h2><p>${E(ev.short)}</p></div>${go('切换事件','radar')}</div><div class="iw-research-layout"><div class="stack">${U.card('这次研究要回答什么','锁定问题与信息边界，每次研判生成独立的报告快照',`<label class="field"><span>研究问题</span><textarea id="intel-question" class="intel-query" ${I.running?'disabled':''}>${E(I.question)}</textarea></label><div class="form-grid" style="margin-top:16px">${U.field('信息截止（Asia/Shanghai）',U.select('intel-cutoff',['2026-09-04T09:12','2026-09-04T12:00','2026-09-04T18:00'],I.cutoff))}${U.field('观察范围',U.select('intel-scope',['事件相关产业链','关注行业','自选池（待接入）'],I.scope))}</div><div class="iw-action-bar">${b(I.running?'正在整理研判…':'生成研判示例 →','run',I.running?'disabled':'',true)}${I.report?go('阅读已有备忘录','report'):''}<small>按所选案例回放预置内容；自定义问题只保存为研究配置。</small></div>`)}${evidencePanel()}<details class="card iw-collaboration" ${I.running||I.tab==='agents'?'open':''}><summary>协作核验与分歧 <span>六个角色，服务于同一个研究问题</span></summary><div class="card-body"><p class="small muted">查看观察摘要与角色配置。新闻核验、影响推演、反证审查是形成完整判断的必要角色。</p><div class="intel-step-grid">${X.agentDefs.map((d,i)=>X.agentCard(d,i,sources,ev)).join('')}</div><div class="divider"></div>${X.agentDefs.filter(d=>I.enabled.includes(d[0])).map(d=>`<div class="iw-agent-note"><strong>${d[1]}</strong><p>${sources.some(s=>s.role===d[0])||(sources.some(s=>s.kind==='原始资料')&&['impact','review'].includes(d[0]))?E(ev.agents[d[0]]):'当前时点输入不足，暂不展示观察结论。'}</p></div>`).join('')}<p class="small muted">以上是预置协作摘要，非实时模型运行。</p></div></details></div><aside class="stack iw-research-aside">${U.card('一份有用判断的四个部分','研究前先明确验收标准',`<ol class="iw-checklist"><li><strong>事实</strong><p>原文到底说了什么？哪些说法仍未证实？</p></li><li><strong>解释</strong><p>影响通过什么路径传导？还有哪些相反解释？</p></li><li><strong>条件</strong><p>什么证据出现时成立，什么变化会使判断失效？</p></li><li><strong>跟踪</strong><p>下一次查看什么、何时复核、怎样记录变化？</p></li></ol>`)}${U.card('下一站 / 研究备忘录','报告是一次判断的时间切片',`<p class="small muted">保存依据、条件和分歧，再把待验证的问题加入跟踪。已有报告不会随配置修改而被悄悄改写。</p>${go('打开研究备忘录 →','report')}`)}</aside></div>`}

  function report(){const r=I.report;return `${journey('report')}<div class="iw-context"><div><h2>${E(X.selected().name)}</h2><p>报告快照独立于当前配置，后续证据通过新版本修订。</p></div>${go('返回研判','desk')}</div>${r?`<div class="iw-action-bar">${b('加入持续跟踪','add-watch','',true)}${b('创建量化研究交接单','handoff')}${b('导出 Markdown','export-report')}${b('导出 HTML','export-html')}</div>${X.stale(r)?'<div class="notice notice-amber">研究配置已变更。下面保留原报告的时点和内容；请重新研判后再创建跟踪或交接单。</div>':''}${r.preset?'<div class="notice notice-blue">这是一份预置阅读样例。可以直接体验跟踪，也可以返回研判生成本次会话的报告。</div>':''}${X.reportHTML(r)}`:`<div class="card intel-empty"><h2>先回答问题，再留下判断。</h2><p>当前事件还没有备忘录，完成一次研判后会出现在这里。</p>${go('开始专题研判 →','desk',true)}</div>`}`}

  function watch(){return `${journey('watch')}<div class="iw-intro compact"><div><span class="iw-eyebrow">FOLLOW THE EVIDENCE</span><h2>持续追问：原来的判断，还成立吗？</h2><p>观察新事实、记录相反证据、修订判断。当前采用手动复核演示。</p></div>${go('从备忘录建立跟踪 →','report')}</div>${I.watches.length?I.watches.map(w=>`<section class="card iw-watch" data-watch-id="${w.id}"><div class="card-head"><div><div class="toolbar">${U.badge(w.status,w.status==='出现反证'?'red':w.status==='已归档'?'neutral':'blue')}<span class="small muted">来源 ${E(w.reportId)} · 截止 ${w.cutoff.replace('T',' ')}</span></div><h2>${E(w.title)}</h2></div>${b('查看判断快照','watch-report',`data-id="${w.id}"`)}</div><div class="card-body"><div class="grid-3 iw-watch-fields"><div><span>需要验证</span><p>${E(w.condition)}</p></div><div><span>失效 / 反证条件</span><p>${E(w.invalidation)}</p></div><div><span>下次复核</span><p>${E(w.reviewDate)}</p><small>手动复核 · 未设置自动提醒</small></div></div><div class="iw-watch-history">${w.logs.length?w.logs.map(l=>`<div><span>${E(new Date(l.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}))+'（上海时间）'} · ${E(l.result)}</span><p>${E(l.note)}</p>${l.source?`<small>证据引用：${E(l.source)}</small>`:''}</div>`).join(''):'<p>等待第一次复核：请记录实际观察，不以时间流逝代替验证。</p>'}</div><div class="toolbar">${w.status!=='已归档'?b('记录复核','review',`data-id="${w.id}"`,true)+b('返回事件修订判断','revise',`data-id="${w.id}"`)+b('归档跟踪','archive-watch',`data-id="${w.id}"`):b('恢复跟踪','restore-watch',`data-id="${w.id}"`)}</div></div></section>`).join(''):`<div class="card iw-empty"><span>◎</span><h2>把“再看看”变成一个可验证的问题。</h2><p>从一份备忘录建立跟踪，写清验证条件、反证条件和复核日期。</p>${go('选择研究备忘录 →','report',true)}</div>`}`}

  function library(){const reports=allReports();return `${journey('library')}<div class="grid-3">${U.metric('判断快照',reports.length,'包括明确标注的预置阅读样例')}${U.metric('跟踪记录',I.watches.reduce((s,w)=>s+w.logs.length,0),'支持、反证与待补证据均留档')}${U.metric('量化交接草稿',I.handoffs?.length||0,'可导出，在量化研究中验证')}</div>${U.card('研究备忘录档案','同一事件可以有多次判断；每份报告保留各自的信息时点',reports.length?`<div class="iw-archive-list">${reports.map(r=>`<div><div>${U.badge(r.preset?'预置样例':'会话报告',r.preset?'amber':'green')}<h3>${E(r.eventName)}</h3><p>${E(r.id)} · 信息截止 ${E(r.cutoff.replace('T',' '))} · ${r.sourceIds.length} 份资料</p></div>${b('阅读快照','open-report',`data-id="${r.id}"`)}</div>`).join('')}</div>`:'<div class="intel-empty">还没有报告。</div>')}${U.card('量化研究交接单','把文字判断转成可检验的问题，并保留原报告引用',I.handoffs?.length?I.handoffs.map(h=>`<div class="iw-handoff-row"><div><h3>${E(h.question)}</h3><p>${E(h.id)} · 来源 ${E(h.report_id)} · ${E(h.status)}</p></div>${b('导出交接单','export-handoff',`data-id="${h.id}"`)}</div>`).join(''):'<p class="small muted">研究备忘录中的“创建量化研究交接单”会保存待验证假设、事件时点、证据及窗口设计。</p>')}${U.card('保存与恢复边界','这版原型的数据保存在当前浏览器会话，刷新会重置',`<p class="small muted">导出工作区可留存报告、跟踪复核与交接单。生产版将使用独立的情报数据存储，并支持来源增量更新和报告版本恢复。</p>${b('导出完整工作区','export-workspace')}`)}`}


  Pages.intelligence=()=>X.styles+`<div class="intel-view iw-view stack">${I.running?`<div class="intel-runcard"><div class="toolbar"><strong>研判示例回放 · ${X.agentDefs[Math.min(I.step,5)][1]}</strong><span> ${I.step+1} / 6</span>${b('停止回放','cancel')}</div><div class="progress"><div class="progress-fill" style="width:${(I.step+1)/6*100}%"></div></div></div>`:''}${I.tab==='radar'?radar():I.tab==='desk'||I.tab==='agents'?desk():I.tab==='report'?report():I.tab==='watch'?watch():library()}</div>`;

  function selectEvent(id){const ev=X.events.find(e=>e.id===id);if(!ev)return;X.cancel();I.eventId=id;I.question=ev.question;I.report=I.latest[id]||null;}
  function usableReport(){if(!I.report){toast('请先生成或打开一份研究备忘录');return false}if(X.stale(I.report)){toast('配置已变更，请重新研判或从档案打开原快照');return false}if(!X.impactReady(I.report)){toast('当前报告只有证据缺口，请先补齐关键资料与核验角色');return false}return true}
  function openReport(r){selectEvent(r.eventId);I.report=r;I.cutoff=r.cutoff;I.scope=r.scope;I.question=r.question;I.enabled=[...r.agents];setView('report')}
  const original=window.handleExtraAction;
  window.handleExtraAction=(action,el)=>{
    if(!action?.startsWith('intel-'))return original?.(action,el)||false;
    const a=action.slice(6),id=el.dataset.id;
    if(a==='tab'){setView(el.dataset.value);return true}
    if(a==='filter'){I.radarFilter=el.dataset.value;render(true);return true}
    if(a==='event'){selectEvent(id);render(true);return true}
    if(a==='begin'){I.dispositions[I.eventId]='research';setView('desk');return true}
    if(a==='archive-event'||a==='restore-event'){I.dispositions[I.eventId]=a==='archive-event'?'archived':'active';render(true);toast(a==='archive-event'?'事件已归档，可在已归档中恢复':'事件已恢复');return true}
    if(a==='run'){
      if(I.running)return true;if(!I.question.trim()){toast('请填写研究问题');return true}
      I.pending=X.makeReport();I.pending.id='REPORT-LOCAL-'+String(I.runLog.length+1).padStart(3,'0');I.pending.version='v'+(I.archives.filter(r=>r.eventId===I.eventId).length+1);
      I.running=true;I.step=0;I.dispositions[I.eventId]='research';I.runLog.push({id:I.pending.id,eventId:I.eventId,status:'回放中'});I.tab='agents';render();
      I.timer=setInterval(()=>{I.step++;if(I.step>=6){const r=I.pending;X.cancel();I.report=r;I.latest[r.eventId]=r;I.archives.unshift(r);I.runLog.find(l=>l.id===r.id).status='已完成';I.tab='report';if(State.page==='intelligence')render();toast('研判示例已保存，接下来可建立跟踪计划');}else if(State.page==='intelligence')render(true)},420);return true;
    }
    if(a==='cancel'){if(I.running){I.runLog.find(l=>l.id===I.pending.id).status='已停止';X.cancel()}render(true);toast('回放已停止，原报告保持不变');return true}
    if(a==='open-report'){const r=allReports().find(r=>r.id===id);if(r)openReport(r);return true}
    if(a==='add-watch'){
      if(!usableReport())return true;
      if(I.watches.some(w=>w.reportId===I.report.id)){setView('watch');toast('该报告已有跟踪记录');return true}
      const ev=X.selected();modal('建立持续跟踪',`<p class="small muted">绑定报告 ${E(I.report.id)}，把判断拆成可验证的条件。</p><div class="stack" style="margin-top:16px">${U.field('跟踪名称',U.input('iw-watch-title',ev.short))}${U.field('需要验证的条件',`<textarea id="iw-watch-condition">${E(ev.scenarios[0][1]+'；观察 '+nextChecks(ev))}</textarea>`)}${U.field('失效 / 反证条件',`<textarea id="iw-watch-invalidation">${E(ev.contrary[0])}</textarea>`)}${U.field('下次复核日期',U.input('iw-watch-date',I.cutoff.slice(0,10),'date'),'日期基于演示快照，可自行调整；当前不会发送提醒')}</div>`,U.button('取消','close-modal')+b('保存跟踪计划','save-watch','',true));return true;
    }
    if(a==='save-watch'){
      const title=document.getElementById('iw-watch-title').value.trim(),condition=document.getElementById('iw-watch-condition').value.trim(),invalidation=document.getElementById('iw-watch-invalidation').value.trim(),reviewDate=document.getElementById('iw-watch-date').value;
      if(!title||!condition||!invalidation||!reviewDate){toast('请填写名称、验证条件、反证条件和复核日期');return true}
      if(!usableReport())return true;
      if(reviewDate<I.report.cutoff.slice(0,10)){toast('复核日期不能早于报告的信息截止日期');return true}
      I.watches.unshift({id:'WATCH-'+String(I.watches.length+1).padStart(3,'0'),eventId:I.eventId,reportId:I.report.id,report:JSON.parse(JSON.stringify(I.report)),cutoff:I.report.cutoff,title,condition,invalidation,reviewDate,status:'待验证',logs:[]});closeModal();setView('watch');toast('跟踪计划已保存到本次会话');return true;
    }
    if(a==='watch-report'){const w=I.watches.find(w=>w.id===id);if(w)modal('跟踪所依据的判断 · '+w.reportId,`<div class="intel-view">${X.reportHTML(w.report)}</div>`,U.button('关闭','close-modal'),true);return true}
    if(a==='review'){
      const w=I.watches.find(w=>w.id===id);if(!w)return true;
      modal('记录一次复核',`<h3>${E(w.title)}</h3><div class="stack" style="margin-top:16px">${U.field('当前观察',U.select('iw-review-result',['继续观察','证据支持','出现反证'],'继续观察'))}${U.field('新增事实与判断变化','<textarea id="iw-review-note" placeholder="发生了什么？它支持或削弱了哪一条判断？"></textarea>')}${U.field('证据引用',U.input('iw-review-source',''),'支持或反证必须填写来源编号、文件名称或原文链接；这里只记录引用，不自动抓取')}${U.field('下次复核日期',U.input('iw-review-date',w.reviewDate,'date'))}</div>`,U.button('取消','close-modal')+b('保存复核记录','save-review',`data-id="${id}"`,true));return true;
    }
    if(a==='save-review'){
      const w=I.watches.find(w=>w.id===id),result=document.getElementById('iw-review-result').value,note=document.getElementById('iw-review-note').value.trim(),source=document.getElementById('iw-review-source').value.trim(),date=document.getElementById('iw-review-date').value;
      if(!w)return true;if(!note||!date||(result!=='继续观察'&&!source)){toast('请填写复核内容、日期；支持或反证还需要证据引用');return true}
      if(date<w.cutoff.slice(0,10)){toast('复核日期不能早于原报告截止日期');return true}
      w.logs.unshift({at:new Date().toISOString(),result,note,source});w.status=result;w.reviewDate=date;closeModal();render(true);toast('复核已留档，原报告快照仍保留');return true;
    }
    if(a==='revise'){const w=I.watches.find(w=>w.id===id);if(w){selectEvent(w.eventId);I.question=w.report.question;I.cutoff=w.report.cutoff;I.scope=w.report.scope;I.enabled=[...w.report.agents];setView('desk')}return true}
    if(a==='archive-watch'||a==='restore-watch'){const w=I.watches.find(w=>w.id===id);if(w){w.status=a==='archive-watch'?'已归档':w.logs[0]?.result||'待验证';render(true)}return true}
    if(a==='handoff'){
      if(!usableReport())return true;
      modal('创建量化研究交接单',`<div class="notice notice-blue">将保存可导出的研究草稿，供量化侧设计历史事件样本与验证实验。</div><div class="stack" style="margin-top:16px">${U.field('可检验的假设',`<textarea id="iw-hypothesis">${E(X.selected().short)}</textarea>`)}${U.field('事件窗口（交易日）',U.select('iw-window',['[-5, +5]','[-10, +20]','[0, +60]'],'[-5, +5]'))}${U.field('对照基准',U.select('iw-benchmark',['行业与市场双基准','市场基准'],'行业与市场双基准'))}</div><p class="small muted" style="margin-top:14px">主体映射、历史股票池、重叠事件和样本外切分，需在量化验证前补齐。</p>`,U.button('取消','close-modal')+b('保存交接草稿','save-handoff','',true));return true;
    }
    if(a==='save-handoff'){
      const question=document.getElementById('iw-hypothesis').value.trim();if(!question){toast('请填写可检验的假设');return true}if(!usableReport())return true;
      I.handoffs??=[];const ev=X.selected(),r=I.report;
      I.handoffs.unshift({id:'HANDOFF-'+String(I.handoffs.length+1).padStart(3,'0'),prototype:true,status:'待设计量化验证',question,event_id:ev.id,report_id:r.id,report_snapshot:JSON.parse(JSON.stringify(r)),information_cutoff:r.cutoff,first_known_at:ev.sources[0].known,source_ids:[...r.sourceIds],event_window:document.getElementById('iw-window').value,benchmark:document.getElementById('iw-benchmark').value,invalidation:ev.contrary,required_before_execution:['核验实际可知时间','有出处的主体映射与历史股票池','重叠事件处理','预设样本外切分与评价指标']});closeModal();setView('library');toast('交接草稿已保存，可导出供量化验证使用');return true;
    }
    if(a==='export-handoff'){const h=I.handoffs?.find(h=>h.id===id);if(h)download(h.id+'.json',JSON.stringify(h,null,2));return true}
    if(a==='export-workspace'){download('intelligence-workspace.json',JSON.stringify({schema_version:1,prototype:true,saved_at:new Date().toISOString(),current:{event_id:I.eventId,cutoff:I.cutoff,question:I.question,scope:I.scope,enabled_agents:I.enabled},events:I.dispositions,reports:allReports(),watches:I.watches,handoffs:I.handoffs||[],runs:I.runLog},null,2));return true}
    return original(action,el);
  };
})();
