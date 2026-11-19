import {test,expect} from 'playwright/test';
import {collectPageErrors} from './helpers';
import {ownerFixture,local,shot} from './pro-round2-fixture';

// Gaps 2026-11-17 (walkthrough 3): a banned/suspended professional is sent from Pro to
// /dashboard/profesional?tab=home (requirePro). The notice explaining the suspension lived inside the
// home card that is `lg:hidden`, so on desktop the page showed nothing. It must be visible at every width,
// in Spanish («usted») and English. Loopback only; disposable account.
for(const language of ['es','en'] as const){
 test(`Suspended professional sees the suspension notice after the Pro redirect [${language}]`,async({page},info)=>{
  test.setTimeout(240000);local(info.project.use.baseURL);const en=language==='en';
  const f=await ownerFixture(page.context(),'susp'+language+crypto.randomUUID().slice(0,6));
  try{
   const errors=collectPageErrors(page);
   await f.db.from('professionals').update({is_banned:true,banned_reason:'Prueba local'}).eq('profile_id',f.owner.id).throwOnError();
   await page.goto(`/${language}/dashboard/pro`,{waitUntil:'domcontentloaded',timeout:120000});
   await expect(page).toHaveURL(/\/dashboard\/profesional\?tab=home/,{timeout:90000});
   const notice=page.locator('[data-pro-suspended-notice]');
   await expect(notice).toBeVisible({timeout:90000});
   await expect(notice).toContainText(en?'Your profile is suspended':'Su perfil está suspendido');
   await expect(notice).toContainText(en?'Reason: Prueba local':'Motivo: Prueba local');
   await expect(notice.getByRole('button',{name:en?'If you think this is a mistake, write to us':'Si cree que es un error, escríbanos'})).toBeVisible();
   const box=await notice.boundingBox();expect(box&&box.width>0&&box.height>0).toBeTruthy();
   await shot(page,'suspended-notice-'+language,info.project.name);
   expect(errors().filter(e=>!/professional load|PGRST/i.test(String(e)))).toEqual([]);
  }finally{await f.cleanup();}
 });
}
