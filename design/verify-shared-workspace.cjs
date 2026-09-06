const {chromium}=require('./.qa/node_modules/playwright');
const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/#overview');
 const sharedLink=()=>page.locator('#sidebar .shared-nav [data-page="workspace-design"]');
 assert.equal(await sharedLink().count(),1);
 await sharedLink().click();assert.ok(page.url().endsWith('#workspace-design'));
 assert.match(await page.locator('#topbar').innerText(),/公共工作区/);
 assert.match(await page.title(),/公共工作区/);
 assert.equal(await page.locator('.space-switch .selected').count(),0);
 assert.equal(await page.locator('.qf-guide,.iw-journey').count(),0);
 assert.equal(await page.locator('.shared-paths .card').count(),2);
 assert.match(await page.locator('.shared-view').innerText(),/信号与组合/);
 const fromQuant=await page.locator('.shared-view').innerText();
 await page.screenshot({path:path.join(__dirname,'.qa/shared-workspace-desktop.png'),fullPage:true});
 await page.locator('.space-switch [data-page="intelligence"]').click();
 assert.equal(await page.locator('.iw-side-note').count(),0);
 assert.equal(await page.locator('#sidebar [data-action="intel-tab"][data-value="design"]').count(),0);
 assert.equal(await sharedLink().count(),1);
 await page.locator('#sidebar [data-action="intel-tab"][data-value="desk"]').click();
 await page.locator('#intel-question').fill('公共入口往返保留研究问题');
 await sharedLink().click();assert.equal(await page.locator('.shared-view').innerText(),fromQuant);
 await page.locator('.space-switch [data-page="intelligence"]').click();assert.equal(await page.locator('#intel-question').inputValue(),'公共入口往返保留研究问题');
 await sharedLink().click();
 await page.locator('[data-action="shared-intel-details"]').click();assert.equal(await page.locator('#shared-intel-details').getAttribute('open'),'');assert.ok(page.url().endsWith('#workspace-design'));
 assert.match(await page.locator('#shared-intel-details').innerText(),/first_known_at/);
 await page.locator('#shared-intel-details summary').click();
 await page.locator('.shared-paths [data-page="intelligence/radar"]').click();assert.match(await page.locator('h1').innerText(),/事件雷达/);
 await page.goto('http://127.0.0.1:8765/intelligence.html#intelligence/design');
 assert.ok(page.url().endsWith('#workspace-design'));assert.equal(await page.locator('.shared-view').count(),1);
 for(const [width,height] of [[1280,720],[1440,900],[390,844]]){
  await page.setViewportSize({width,height});
  for(const route of ['workspace-design','intelligence/radar','overview']){
   await page.goto('http://127.0.0.1:8765/#'+route);
   await page.locator('#sidebar .shared-nav').waitFor({state:'attached'});
   const size=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(size.s<=size.w+2,'Overflow '+JSON.stringify({width,route,...size}));
   if(width===390&&route==='workspace-design')await page.screenshot({path:path.join(__dirname,'.qa/shared-workspace-mobile.png'),fullPage:true});
   if(width===390){await page.locator('[data-action="toggle-nav"]').click();await sharedLink().click();assert.ok(page.url().endsWith('#workspace-design'));}
  }
 }
 for(const file of ['quant-system-design.html','intelligence-design.html']){
  await page.goto('file:///'+path.join(__dirname,file).replaceAll('\\','/')+'#workspace-design');
  assert.equal(await page.locator('.shared-view').count(),1);assert.equal(await sharedLink().count(),1);
 }
 assert.deepEqual(errors,[]);console.log('PASS: identical public page from both paths; neutral shell; removed sidebar note; research state preserved; legacy route; detail expansion; mobile navigation; standalone builds; zero page errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
