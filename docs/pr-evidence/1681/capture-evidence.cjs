const fs=require('node:fs');
const {chromium}=require('/Users/danielkam/OpenBot-issue-1681/node_modules/playwright-core');
const stage=process.argv[2];
const out='/Users/danielkam/OpenBot-1681-review/evidence/';
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1100},colorScheme:'light',reducedMotion:'reduce'});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*.woff2',async route=>{
  const u=decodeURIComponent(new URL(route.request().url()).pathname);
  const p=u.startsWith('/@fs/')?u.slice(4):null;
  if(p?.startsWith('/Users/danielkam/deployments/company-agents/openbot-source/node_modules/')&&fs.existsSync(p))await route.fulfill({body:fs.readFileSync(p),contentType:'font/woff2'});
  else await route.continue();
 });
 await page.goto('http://localhost:13182/__evidence.html');
 await page.getByText('Content Writer',{exact:true}).waitFor();
 await page.waitForLoadState('networkidle');
 if(await page.getByText(/Couldn't load/).count())throw Error('Fixture has an unrelated load failure');
 if(stage==='tags'){
  await page.getByRole('button',{name:'Edit tags for Finance Analyst'}).click();
  await page.getByRole('dialog').waitFor({state:'visible'});
  await page.getByLabel('Tags, separated by commas').fill('Finance, Client work');
  await page.getByRole('button',{name:'Save tags'}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText('Finance',{exact:true}).waitFor();
 }
 await page.screenshot({path:out+stage+'-desktop.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
 await page.screenshot({path:out+stage+'-mobile.png',fullPage:true,animations:'disabled'});
 if(stage==='controls'){
  await page.setViewportSize({width:1280,height:1100});
  await page.getByRole('searchbox').fill('reports');
  await page.getByLabel('Sort Bots').selectOption('name-asc');
  if(await page.getByText('Sales Researcher',{exact:true}).count())throw Error('Search failed');
  await page.screenshot({path:out+'controls-search.png',fullPage:true,animations:'disabled'});
 }
 if(stage==='tags'){
  await page.getByRole('button',{name:'Edit tags for Finance Analyst'}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor({state:'visible'});
  await dialog.evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))});
  await page.screenshot({path:out+'tags-editor-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Cancel'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.setViewportSize({width:1280,height:1100});
  await page.getByLabel('Filter by tag').selectOption('tag:finance');
  if(await page.getByText('Content Writer',{exact:true}).count())throw Error('Tag filter failed');
  await page.screenshot({path:out+'tags-filter.png',fullPage:true,animations:'disabled'});
  await page.reload();await page.getByText('Finance',{exact:true}).waitFor();
 }
 if(errors.length)throw Error(errors.join('\n'));
 await browser.close();console.log('Captured and verified '+stage);
})().catch(e=>{console.error(e);process.exit(1)});
