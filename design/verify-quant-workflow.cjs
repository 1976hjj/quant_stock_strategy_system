const {chromium}=require('./.qa/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/#overview');
 assert.equal(await page.locator('.qf-flow button').count(),6);
 assert.match(await page.locator('.qf-flow').innerText(),/模拟跟踪/);
 await page.locator('.qf-flow [data-page="data"]').click();
 const chain=['data','compute','factors','selection','dataset','training','strategy','backtest','monitor'];
 for(let i=0;i<chain.length;i++){
  assert.ok(page.url().endsWith('#'+chain[i]),'Wrong transition: '+page.url());
  assert.equal(await page.locator('.qf-guide').count(),1);
  assert.equal(await page.locator('.qf-flow [aria-current="step"]').count(),1);
  assert.match(await page.locator('.qf-contract').innerText(),/承接输入/);
  if(chain[i]==='selection')await page.screenshot({path:path.join(__dirname,'.qa/quant-chain-selection.png'),fullPage:true});
  if(i<chain.length-1)await page.locator('.qf-handoff .btn-primary').click();
 }
 assert.equal(await page.locator('.qf-review-links>div').count(),3);
 await page.locator('.qf-review-links [data-page="data"]').click();
 assert.equal(await page.locator('.tab.active').innerText(),'质量与覆盖');
 await page.goto('http://127.0.0.1:8765/#selection');
 await page.locator('[data-action="qf-factor-route"]').click();
  assert.ok(page.url().endsWith('#dataset'));assert.equal(await page.locator('#qf-route').inputValue(),'因子合成');
  assert.equal(await page.locator('.r-page-actions [data-page="training"]').count(),0);
  assert.equal(await page.locator('.r-page-actions [data-page="strategy"]').count(),1);
 await page.locator('.qf-handoff .btn-primary').click();
 assert.ok(page.url().endsWith('#strategy'));assert.equal(await page.locator('#strategy-source').inputValue(),'因子合成');
 assert.equal(await page.locator('.qf-flow [data-page="training"]').count(),0);
 await page.locator('.qf-handoff [data-page="dataset"]').click();assert.ok(page.url().endsWith('#dataset'));
 await page.locator('#qf-route').selectOption('模型打分');await page.locator('.qf-handoff .btn-primary').click();assert.ok(page.url().endsWith('#training'));
 await page.locator('.qf-handoff .btn-primary').click();assert.equal(await page.locator('#strategy-source').inputValue(),'模型打分');
 await page.locator('#strategy-source').selectOption('因子合成');assert.equal(await page.locator('#qf-route').inputValue(),'因子合成');
 assert.equal(await page.locator('.qf-handoff [data-page="dataset"]').count(),1);
 await page.goto('http://127.0.0.1:8765/#training');assert.match(await page.locator('.qf-branch-note').innerText(),/无需训练模型/);
 await page.goto('http://127.0.0.1:8765/#overview');await page.locator('#qf-route').selectOption('因子合成');
 assert.equal(await page.locator('.qf-flow [data-page="strategy"]').count(),1);
 const untouched=await page.evaluate(()=>({datasetSaved:!!State.datasetSaved,modelRegistered:!!State.modelRegistered,backtestCreated:!!State.backtestCreated}));
 assert.deepEqual(untouched,{datasetSaved:false,modelRegistered:false,backtestCreated:false});
 for(const [width,height]of [[1280,720],[1440,900],[390,844]]){
  await page.setViewportSize({width,height});
  for(const target of ['overview',...chain]){
   await page.goto('http://127.0.0.1:8765/#'+target);
   await page.locator('.qf-flow').waitFor();
   const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(size.s<=size.w+2,'Overflow '+JSON.stringify({width,target,...size}));
   if(width===390&&target==='dataset')await page.screenshot({path:path.join(__dirname,'.qa/quant-chain-mobile.png'),fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://127.0.0.1:8765/intelligence.html');assert.equal(await page.locator('.qf-guide').count(),0);
 await page.locator('.space-switch [data-page="overview"]').click();assert.equal(await page.locator('.qf-flow button').count(),6);
 for(const file of ['quant-system-design.html','intelligence-design.html']){
  await page.goto('file:///'+path.join(__dirname,file).replaceAll('\\','/')+'#dataset');
  assert.equal(await page.locator('.qf-flow button').count(),6);assert.equal(await page.locator('.qf-handoff .btn-primary').count(),1);
 }
 assert.deepEqual(errors,[]);console.log('PASS: complete model path; factor path & source synchronization; review loop; navigation does not publish results; 10 pages × 3 viewports; workspace isolation; both standalone builds; zero page errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
