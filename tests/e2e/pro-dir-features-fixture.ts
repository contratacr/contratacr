import {type Page,type TestInfo} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

// Place features round (LOCAL Pro, 2026-11-17): helpers shared by the reservations, Q&A, lists, events and brands specs.
// Screenshots go to FEATURES_SHOTS_DIR (when set) at the owner-requested widths: 1440 (desktop) and 390 (phone).
export async function featureShots(page:Page,name:string,info:TestInfo,{fullPage=true}:{fullPage?:boolean}={}){
 const dir=process.env.FEATURES_SHOTS_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});
 const before=page.viewportSize();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width>800?900:844});
  await page.waitForTimeout(250);
  await page.screenshot({path:join(dir,`${name}-${width}-${info.project.name}.png`),fullPage});
 }
 if(before)await page.setViewportSize(before);
}
/** Costa Rica calendar day `n` days from today (YYYY-MM-DD). */
export function crDay(n=0){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
/** Own rate-limit bucket per context (the specs make several writes per minute). */
export const randomIp=()=>({'x-forwarded-for':`10.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`});
