import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount } from "./disposable-account";
import { loginAs } from "./helpers";
import { regressionAdminClient } from "./seed";
import { randomUUID } from "node:crypto";
test("activity API rejects guests and non-admins; MFA admin can inspect guest and account journeys",async({page,request})=>{
 test.setTimeout(150000);
 expect((await request.get('/api/admin/analytics/activity')).status()).toBe(403);
 const client=await createDisposableAccount({prefix:'journey-client'}), admin=await createDisposableAccount({prefix:'journey-admin',admin:true});
 const db=regressionAdminClient(),ids=[randomUUID(),randomUUID()];
 try {
  await loginAs(page,client.email,client.password);
  expect((await page.request.get('/api/admin/analytics/activity')).status()).toBe(403);
  await page.context().clearCookies();
  await loginAs(page,admin.email,admin.password);
  const seed=await db.from('app_journey_events').insert(ids.map((id,i)=>({event_id:id,action:'navigation',target:'proyectos',section:'home',viewer_user_id:i===0?client.id:null,visitor_hash:'a'.repeat(64),runtime:'android'})));
  expect(seed.error).toBeNull();
  const result=await page.request.get('/api/admin/analytics/activity?runtime=android&actor='+client.id);
  expect(result.status()).toBe(200);expect(result.headers()['cache-control']).toContain('no-store');
  expect((await result.json()).events.some((e:{key:string})=>e.key==='j:'+ids[0])).toBe(true);
  expect((await page.request.get('/api/admin/analytics/activity?actor=private@example.com')).status()).toBe(400);
  await page.goto('/admin/analitica');
  await expect(page.getByRole('heading',{name:'Recorridos y actividad'})).toBeVisible();
  await page.getByLabel('Plataforma de actividad').selectOption('android');
  await expect(page.getByText('Visitante aaaaaaaa',{exact:true}).first()).toBeVisible();
  const accountButton=page.getByRole('table').getByRole('button',{name:/Cuenta desechable/}).first();
  await accountButton.click();
  await expect(page.getByRole('button',{name:'Ver todos los visitantes'})).toBeVisible();
  await expect(accountButton).toBeVisible();
  await accountButton.click();
  await expect(accountButton).toBeVisible();
  await page.screenshot({path:'/tmp/contratacr-admin-journeys.png',fullPage:true});
 } finally {
  await db.from('app_journey_events').delete().in('event_id',ids);
  await cleanupDisposableAccount(client);await cleanupDisposableAccount(admin);
 }
});
