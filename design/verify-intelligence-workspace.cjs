const {chromium}=require('./.qa/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const action=a=>page.locator('[data-action="intel-'+a+'"]');
 const tab=value=>page.locator('#sidebar [data-action="intel-tab"][data-value="'+value+'"]').click();
 await page.goto('http://127.0.0.1:8765/intelligence.html');
 assert.equal(await page.locator('.intel-feeditem').count(),3);assert.match(await page.title(),/事件雷达/);
 assert.equal(await page.locator('#sidebar [data-page="factors"]').count(),0);
 await page.screenshot({path:path.join(__dirname,'.qa/intel-radar-v2.png'),fullPage:true});
 await page.locator('#intel-search').fill('不存在');assert.equal(await page.locator('.intel-feeditem').count(),0);await page.locator('#intel-search').fill('');
 await action('archive-event').click();assert.equal(await page.locator('.intel-feeditem').count(),2);
 await page.locator('[data-action="intel-filter"][data-value="archived"]').click();assert.equal(await page.locator('.intel-feeditem').count(),1);
 await action('restore-event').click();await page.locator('[data-action="intel-filter"][data-value="active"]').click();
 await action('begin').click();assert.match(await page.locator('h1').innerText(),/专题研判/);
 await page.locator('#intel-cutoff').selectOption('2026-09-04T09:12');assert.equal(await page.locator('.iw-evidence-list [data-id="P1"]').count(),0);
 await action('run').click();await page.locator('.intel-report').waitFor();assert.match(await page.locator('.intel-report').innerText(),/缺少原始资料/);
 await action('add-watch').click();assert.equal(await page.locator('#overlay').isVisible(),false);
 await tab('desk');await page.locator('#intel-cutoff').selectOption('2026-09-04T18:00');
 await page.locator('.iw-collaboration summary').click();await page.locator('[data-intel-agent="review"]').uncheck();
 await action('run').click();await page.locator('.intel-report').waitFor();assert.match(await page.locator('.intel-report').innerText(),/反证角色未启用/);
 await tab('desk');await page.locator('.iw-collaboration summary').click();await page.locator('[data-intel-agent="review"]').check();
 await action('run').click();await action('cancel').first().click();await tab('report');assert.match(await page.locator('.intel-report').innerText(),/反证角色未启用/);
 await tab('desk');await action('run').click();await page.locator('.intel-report').waitFor();assert.match(await page.locator('.intel-report').innerText(),/需求预期可能改善/);
 const frozen=await page.locator('.intel-report').innerText();
 await action('add-watch').click();await page.locator('#iw-watch-title').fill('设备订单兑现跟踪');await action('save-watch').click();
 assert.equal(await page.locator('.iw-watch').count(),1);assert.match(await page.locator('.iw-watch').innerText(),/设备订单兑现跟踪/);
 await action('review').click();await page.locator('#iw-review-result').selectOption('出现反证');await page.locator('#iw-review-note').fill('后续原文没有预算细则，维持条件性判断。');
 await action('save-review').click();assert.equal(await page.locator('#overlay').isVisible(),true);
 await page.locator('#iw-review-source').fill('P1 · 原始资料');await action('save-review').click();assert.match(await page.locator('.iw-watch').innerText(),/出现反证/);
 await page.screenshot({path:path.join(__dirname,'.qa/intel-watch-v2.png'),fullPage:true});
 await action('watch-report').click();assert.equal(await page.locator('#overlay .intel-report').innerText(),frozen);await page.locator('#overlay [data-action="close-modal"]').first().click();
 await action('archive-watch').click();assert.match(await page.locator('.iw-watch').innerText(),/已归档/);await action('restore-watch').click();assert.match(await page.locator('.iw-watch').innerText(),/出现反证/);
 await tab('report');await action('add-watch').click();assert.equal(await page.locator('.iw-watch').count(),1);
 await tab('report');await action('handoff').click();await action('save-handoff').click();assert.equal(await page.locator('.iw-handoff-row').count(),1);
 let [download]=await Promise.all([page.waitForEvent('download'),action('export-handoff').click()]);const handoffPath=path.join(__dirname,'.qa/handoff-test.json');await download.saveAs(handoffPath);assert.equal(JSON.parse(fs.readFileSync(handoffPath,'utf8')).event_id,'EV-DEMO-001');
 await tab('desk');await page.locator('#intel-cutoff').selectOption('2026-09-04T12:00');await tab('report');assert.match(await page.locator('.iw-view').innerText(),/配置已变更/);await action('handoff').click();assert.equal(await page.locator('#overlay').isVisible(),false);
 await tab('radar');await page.locator('[data-action="intel-event"][data-id="EV-DEMO-002"]').click();await action('begin').click();await action('run').click();await page.locator('.intel-report').waitFor();assert.match(await page.locator('.intel-report h2').innerText(),/产能暂时中断/);assert.equal(await page.locator('.intel-report [data-id="S3"]').count(),0);
 await tab('radar');await page.locator('[data-action="intel-event"][data-id="EV-DEMO-003"]').click();await action('begin').click();await page.locator('#intel-cutoff').selectOption('2026-09-04T18:00');await action('run').click();await page.locator('.intel-report').waitFor();assert.match(await page.locator('.intel-report').innerText(),/澄清/);
 [download]=await Promise.all([page.waitForEvent('download'),action('export-report').click()]);await download.saveAs(path.join(__dirname,'.qa/intelligence-report.md'));assert.match(fs.readFileSync(path.join(__dirname,'.qa/intelligence-report.md'),'utf8'),/C1/);
 [download]=await Promise.all([page.waitForEvent('download'),action('export-html').click()]);const htmlPath=path.join(__dirname,'.qa/intelligence-report.html');await download.saveAs(htmlPath);const reportPage=await browser.newPage();await reportPage.goto('file:///'+htmlPath.replaceAll('\\','/'));assert.match(await reportPage.locator('body').innerText(),/反证/);await reportPage.close();
 [download]=await Promise.all([page.waitForEvent('download'),action('export-workspace').click()]);const workspacePath=path.join(__dirname,'.qa/intel-workspace-test.json');await download.saveAs(workspacePath);const exported=JSON.parse(fs.readFileSync(workspacePath,'utf8'));assert.equal(exported.watches[0].logs[0].result,'出现反证');assert.equal(exported.handoffs.length,1);assert.ok(exported.runs.some(r=>r.status==='已停止'));
 console.log('PASS: research lifecycle, snapshots, evidence gating, follow-ups, handoff and exports');
 for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});
  for(const view of ['radar','desk','report','watch','library','design']){
   // Hash navigation preserves session reports and populated follow-up cards.
   await page.goto('http://127.0.0.1:8765/intelligence.html#intelligence/'+view);
   await page.locator('.iw-view').waitFor();
   const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(size.s<=size.w+2,'Overflow '+JSON.stringify({width,view,...size}));
   if(width===390&&view==='radar')await page.screenshot({path:path.join(__dirname,'.qa/intel-mobile-v2.png'),fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:8765/intelligence.html');await page.locator('.space-switch [data-page="overview"]').click();assert.equal(await page.locator('.pipeline .pipe-node').count(),6);assert.equal(await page.locator('#sidebar > [data-page="intelligence"]').count(),0);await page.locator('.space-switch [data-page="intelligence"]').click();assert.equal(await page.locator('.intel-feeditem').count(),3);
 for(const file of ['quant-system-design.html','intelligence-design.html']){await page.goto('file:///'+path.join(__dirname,file).replaceAll('\\','/')+'#intelligence/radar');assert.equal(await page.locator('.intel-feeditem').count(),3)}
 assert.deepEqual(errors,[]);console.log('PASS: independent entry & switching; 6 views × 4 viewports; two standalone files; zero page errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
