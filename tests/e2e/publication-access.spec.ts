import {test,expect} from 'playwright/test';
import {apiJson,gotoOK,loginAs,waitForInteractivePage} from './helpers';
import {canRunSeededRegression,regressionAdminClient} from './seed';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';

test('a client can open project publishing but cannot publish jobs or offers without a professional profile',async({page})=>{
 test.skip(!canRunSeededRegression(),'Requires the isolated test client account');
 const account=await createDisposableAccount({prefix:'publication-access-client'});
 try {
 await loginAs(page,account.email,account.password);
 const admin=regressionAdminClient();
 const {data:profile}=await admin.from('profiles').select('id,role').eq('id',account.id).single();
 expect(profile?.role).toBe('client');
 const {data:professional}=await admin.from('professionals').select('id').eq('profile_id',profile!.id).maybeSingle();
 expect(professional).toBeNull();
 await gotoOK(page,'/publicar-proyecto');await waitForInteractivePage(page);
 await expect(page.locator('#publish-project-title')).toBeVisible();
 await expect(page.locator('#publish-project-title')).toHaveText('Cuéntenos sobre su proyecto');
 await expect(page.locator('textarea').first()).toBeVisible();
 await expect(page.getByRole('button',{name:/^Publicar proyecto$/}).last()).toBeVisible();
 expect(new URL(page.url()).pathname).toBe('/publicar-proyecto');
 const projects=await apiJson(page,'/api/projects?role=client');
 expect(projects.status).toBe(200);
 for(const [path,body]of [
  ['/api/jobs/posts',{employer_id:profile!.id}],
  ['/api/offers',{professional_id:profile!.id}],
 ] as const) {
  const result=await apiJson(page,path,{method:'POST',body});
  expect(result.status).toBe(403);
 }
 for(const path of ['/empleos/publicar','/promociones/publicar']) {
  await page.goto(path);
  await page.waitForURL(/\/registro\/profesional/);
  await expect(page.getByRole("heading",{name:/Ofrecer mis servicios|Create.*professional|Offer my services/i})).toBeVisible();
  await waitForInteractivePage(page);
 }
 // No project/form is submitted: this audit causes no contact notifications.
 } finally {await cleanupDisposableAccount(account);}
});
