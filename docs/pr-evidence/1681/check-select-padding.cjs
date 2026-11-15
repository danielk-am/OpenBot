const {chromium}=require('/Users/danielkam/OpenBot-issue-1681/node_modules/playwright-core');
const stage=process.argv[2];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:1100},colorScheme:'light',reducedMotion:'reduce'});
 await page.goto('http://localhost:13182/__evidence.html');
 await page.getByRole('combobox',{name:'Filter by tag'}).waitFor();
 await page.waitForLoadState('networkidle');
 const search=page.getByRole('search',{name:'Find Bots'});
 await search.screenshot({path:`/Users/danielkam/OpenBot-1681-review/padding-evidence/${stage}-desktop.png`,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await search.screenshot({path:`/Users/danielkam/OpenBot-1681-review/padding-evidence/${stage}-mobile.png`,animations:'disabled'});
 const measure=()=>page.locator('select').evaluateAll(nodes=>nodes.map(s=>{
  const icon=s.parentElement.querySelector('svg'); const box=s.getBoundingClientRect();const arrow=icon?.getBoundingClientRect();const css=getComputedStyle(s);
  return {name:s.name,appearance:css.appearance,inset:arrow?(css.direction==='rtl'?arrow.left-box.left:box.right-arrow.right):null,paddingEnd:parseFloat(css.paddingInlineEnd),arrowWidth:arrow?.width};
 }));
 const verify=async()=>{
  const rows=await measure();console.log(JSON.stringify(rows));
  if(rows.length!==3||rows.some(r=>r.appearance!=='none'||r.inset<9.5||r.inset>10.5||r.paddingEnd<36))throw Error('Caret inset or text clearance is not controlled');
 };
 await verify();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
 await page.getByLabel('Show Bots').focus();await page.keyboard.press('p');await page.keyboard.press('Enter');
 if(await page.getByLabel('Show Bots').inputValue()!=='pinned')throw Error('Native keyboard selection failed');
 await page.evaluate(()=>document.documentElement.dir='rtl');await verify();
 console.log('PASS: 10px caret inset, 36px text clearance, mobile fit, keyboard selection and RTL.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
