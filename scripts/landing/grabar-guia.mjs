// Refresh the four public demos with real, current production screens.
// Read-only: no login, forms, messages, publishing, or database cleanup.
// node scripts/landing/grabar-guia.mjs https://contratacr.com /path/to/ffmpeg [scene]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base=(process.argv[2]||'https://contratacr.com').replace(/\/$/,'');
const ffmpeg=process.argv[3]||'ffmpeg';
const output=fileURLToPath(new URL('../../public/guia/',import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ccr-guide-'));
const fps=30;
const browser=await chromium.launch();
try {
 for(const [scene,label] of Object.entries({profesionales:'Buscar profesionales',proyectos:'Proyectos',empleos:'Empleos',promociones:'Promociones'})) {
  if(process.argv[4]&&process.argv[4]!==scene)continue;
  const ctx=await browser.newContext({viewport:{width:402,height:874},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'es-CR',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'});
  await ctx.addCookies([{name:'ccr_platform',value:'native',url:base},{name:'ccr_sin_analitica',value:'1',url:base}]);
  await ctx.addInitScript(()=>{localStorage.setItem('ccr:native-first-run-onboarding:v12','1');});
  const p=await ctx.newPage();
  const dir=path.join(temp,scene);fs.mkdirSync(dir);let frame=0;
  const shot=()=>p.screenshot({type:'jpeg',quality:92});
  const save=data=>fs.writeFileSync(path.join(dir,`${String(frame++).padStart(5,'0')}.jpg`),data);
  const hold=async(seconds=1)=>{const data=await shot();for(let i=0;i<seconds*fps;i++)save(data);};
  const settle=async()=>{await p.waitForTimeout(500);await p.evaluate(()=>document.fonts.ready);await p.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.bottom>0&&r.top<innerHeight}).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:15000});};
  const tap=async locator=>{await locator.scrollIntoViewIfNeeded();const r=await locator.boundingBox();if(!r)throw Error('Missing touch target');await p.evaluate(({x,y})=>{const d=document.createElement('span');d.id='ccr-recording-touch';d.style.cssText=`position:fixed;left:${x-18}px;top:${y-18}px;width:36px;height:36px;background:#52627a55;border:2px solid white;border-radius:50%;z-index:2147483647;pointer-events:none`;document.body.append(d);},{x:r.x+r.width/2,y:r.y+r.height/2});await hold(.3);await p.locator('#ccr-recording-touch').evaluate(e=>e.remove());await locator.tap();};
  const scroll=async(amount,seconds=1.5)=>{await p.evaluate(()=>{window.__guideScroll=[document.scrollingElement,...document.querySelectorAll('main, main *')].filter(e=>e&&e.scrollHeight-e.clientHeight>80&&getComputedStyle(e).overflowY!=='hidden').sort((a,b)=>b.clientHeight-a.clientHeight)[0];window.__guideStart=window.__guideScroll?.scrollTop||0;});for(let i=1;i<=seconds*fps;i++){await p.evaluate(async({i,n,amount})=>{if(window.__guideScroll)window.__guideScroll.scrollTop=window.__guideStart+amount*(1-Math.cos(Math.PI*i/n))/2;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));},{i,n:seconds*fps,amount});save(await shot());}};
  await p.goto(base+'/');await settle();await hold(1);
  await tap(p.getByRole('button',{name:'Abrir menú',exact:true}).first());await p.waitForTimeout(350);await hold(.8);
  const menu=p.locator('.ccr-menu-abierto');
  if(scene==='profesionales') {
   await tap(menu.getByRole('button',{name:label,exact:true}));await p.waitForTimeout(400);
   const input=p.locator('.ccr-native-search-panel input').first();await input.fill('Cámaras');await p.waitForTimeout(800);await hold(.8);
   const choice=p.locator('.ccr-native-search-panel button').filter({hasText:'Cámaras de seguridad'}).first();await tap(choice);await p.waitForTimeout(350);await hold(.8);await tap(p.locator('.ccr-native-search-panel button').filter({hasText:/^Alajuela$/}).first());await settle();
  }else {await tap(menu.getByRole('link',{name:label,exact:true}));await settle();}
  await p.locator('[data-verification-badge]').first().waitFor({state:'visible'});await hold(1.5);
  await scroll(160);await hold(.7);await scroll(-160,1);await hold(.5);
  await tap(p.locator('[data-verification-badge]').first());
  const dialog=p.getByRole('dialog').filter({hasText:'identidad'}).first();await dialog.waitFor({state:'visible'});await hold(3);
  await tap(dialog.getByRole('button',{name:'Entendido',exact:true}));await p.waitForTimeout(250);await hold(.7);
  const detail=p.locator(`main a[href^="/${scene}/"]`).filter({hasNotText:/Publicar/}).filter({visible:true}).first();
  if(await detail.count()){await tap(detail);await settle();await hold(2);await scroll(220);await hold(1.5);}
  execFileSync(ffmpeg,['-y','-framerate',String(fps),'-i',path.join(dir,'%05d.jpg'),'-an','-vf','scale=588:-2,setsar=1','-c:v','libx264','-preset','slow','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,`${scene}.mp4`)],{stdio:'ignore'});
  // Only replace published assets after a complete, successful scene.
  fs.copyFileSync(path.join(dir,`${scene}.mp4`),path.join(output,`${scene}.mp4`));
  execFileSync(ffmpeg,['-y','-i',path.join(output,`${scene}.mp4`),'-frames:v','1','-q:v','2',path.join(output,`${scene}.jpg`)],{stdio:'ignore'});
  console.log(`${scene}: ${frame} frames, ${(frame/fps).toFixed(1)}s; check and explanation recorded`);
  await ctx.close();
 }
}finally{await browser.close();}
fs.rmSync(temp,{recursive:true,force:true});
