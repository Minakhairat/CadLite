import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});p.on('pageerror',e=>console.log('ERR',e.message.slice(0,200)));
const w=(t=1500)=>new Promise(r=>setTimeout(r,t));let bad=0;const ok=(n,c)=>{console.log(c?'ASSERT OK':'ASSERT FAIL',n);if(!c)bad=1;};
await p.goto(process.argv[2],{waitUntil:'networkidle0'});await w();
// real UI: rectangle, a point, finish, extrude
await p.evaluate(()=>window.__cad.load(JSON.stringify({version:1,features:[{kind:'extrude',depth:15,sketch:[{t:'rect',a:{x:0,y:0},b:{x:40,y:30}},{t:'point',p:{x:12,y:8}}]}]})));await w(6000);
await p.evaluate(()=>{[...document.querySelectorAll('button,.rb,div')].find(e=>e.textContent.trim()==='Hole'&&e.offsetParent)?.click()});await w(600);
const opts=await p.$$eval('#hpt option',o=>o.map(x=>x.textContent));console.log(opts);
ok('dialog lists the sketch point',opts.some(t=>t.includes('(12, 8)')));
ok('select is visible',await p.$eval('#hpt',e=>!!e.offsetParent));
await p.select('#hpt','0');await w(200);
ok('X/Y filled from point',(await p.$eval('#hx',e=>e.value))==='12'&&(await p.$eval('#hy',e=>e.value))==='8');
ok('copy warning shown',(await p.$eval('#mdlgmsg',e=>e.textContent)).includes('COPY'));
await p.screenshot({path:'/tmp/hole-pt.png'});
await p.click('#mok');await w(5000);
const f=await p.evaluate(()=>JSON.parse(window.__cad.serialize()).features.at(-1));
ok('hole centre is 12,8',f.kind==='hole'&&f.sketch[0].c.x===12&&f.sketch[0].c.y===8);
await b.close();process.exit(bad);
