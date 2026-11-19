import {expect,type BrowserContext,type Page,type TestInfo} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {totp} from './admin-mfa-helper';
import {login} from './pro-round2-fixture';
import {gotoOK,waitForInteractivePage} from './helpers';
import {uid,type Db} from './pro-dir-fixture';
import type {DisposableAccount} from './disposable-account';

// Multivertical M1 (LOCAL Pro): helpers of the staff queue / owner replies / price report specs. Everything these
// specs create is undone in their finally blocks: synthetic places are hidden by hideSeededPlaces(), user price
// reports are rejected (rows are append-only), synthetic catalogue items deactivated, claim documents removed from
// the private bucket and disposable accounts deleted.

/** Signs a disposable administrator in and completes the TOTP challenge (test-only authenticator). */
export async function adminSession(page:Page,context:BrowserContext,admin:DisposableAccount){
 await login(context,admin);
 // The shared MFA helper speaks Spanish: the gate is completed on /admin (ES) before any localized admin page.
 await gotoOK(page,'/admin');await waitForInteractivePage(page);
 const gate=page.locator('[data-admin-mfa]');await expect(gate).toBeVisible({timeout:30000});
 // Wait until the gate reacts (hydrated) before handing over to the helper, which clicks once.
 await expect(async()=>{
  if(!await gate.locator('[data-totp-secret]').count())await gate.getByRole('button',{name:'Configurar autenticador'}).click({timeout:5000});
  await expect(gate.locator('[data-totp-secret]')).toHaveCount(1,{timeout:5000});
 }).toPass({timeout:60000});
 // Same steps as admin-mfa-helper (fresh disposable admin: enrol, then one TOTP code from the test-only authenticator).
 const secret=(await gate.locator('[data-totp-secret]').textContent())!.trim();
 await gate.getByRole('textbox',{name:'Código de verificación'}).fill(totp(secret));
 await gate.getByRole('button',{name:'Continuar',exact:true}).click();
 await expect(gate).toHaveCount(0,{timeout:20000});
 // Let the admin home finish the refresh that follows the MFA step: navigating away mid-refresh makes WebKit report
 // the aborted RSC request («Load failed») as a page error.
 await expect(page.getByRole('heading',{name:'Resumen',exact:true})).toBeVisible({timeout:30000});await waitForInteractivePage(page);
 expect((await page.request.get('/api/admin/pending-counts')).status()).toBe(200);
}
/** Screenshot at the owner-requested widths (desktop 1440, phone 390) into DIR_OPS_SHOTS_DIR when set. */
export async function opsShot(page:Page,name:string,info:TestInfo,fullPage=true){
 const dir=process.env.DIR_OPS_SHOTS_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});
 const mobile=(page.viewportSize()?.width??1366)<640;
 if(!mobile){await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(300);}
 await page.screenshot({path:join(dir,`${name}-${mobile?'390':'1440'}.png`),fullPage});
}
/** Synthetic catalogue item for a spec (deactivated by retireItems). */
export async function seedItem(db:Db,staff:string,slug:string,name:string,kind:'grocery'|'medicine'|'generic',rx=false){
 const r=await db.rpc('price_item_upsert',{p_actor:staff,p_input:{actionId:uid(),slug,kind,name,presentation:kind==='medicine'?'10 tabletas':'1 kg',unitBase:kind==='medicine'?'unit':'kg',unitQty:1,...(kind==='medicine'?{rxRequired:rx}:{})}});
 expect(r.error,JSON.stringify(r.error)).toBeNull();
}
/** Rejects every still-visible user report of the given items (takedown) and deactivates the items. */
export async function retireItems(db:Db,staff:string,slugs:string[]){
 const failures:string[]=[];
 for(const slug of slugs){
  const item=await db.from('price_items').select('id').eq('slug',slug).maybeSingle();if(!item.data)continue;
  const obs=await db.from('price_observations').select('id').eq('item_id',item.data.id).in('moderation_status',['pending','published']);
  for(const o of obs.data??[]){const r=await db.rpc('price_observation_moderate',{p_actor:staff,p_input:{actionId:uid(),observationId:o.id,decision:'reject',note:'E2E cleanup'}});if(r.error&&r.error.code!=='40001')failures.push(`${o.id}: ${r.error.message}`);}
  const off=await db.rpc('price_item_upsert',{p_actor:staff,p_input:{actionId:uid(),slug,active:false}});if(off.error)failures.push(`${slug}: ${off.error.message}`);
 }
 if(failures.length)throw new Error('Could not retire E2E prices: '+failures.join(' | '));
}
/** Removes the private objects of the given claim ids (the upload registry rows are immutable by design). */
export async function removeClaimDocuments(db:Db,claimIds:string[]){
 for(const claimId of claimIds){
  const rows=await db.from('dir_claim_uploads').select('path').eq('claim_id',claimId);
  const paths=(rows.data??[]).map(r=>r.path as string);
  if(paths.length){const r=await db.storage.from('dir-claim-documents').remove(paths);if(r.error)throw new Error('Could not remove claim documents: '+r.error.message);}
 }
}
