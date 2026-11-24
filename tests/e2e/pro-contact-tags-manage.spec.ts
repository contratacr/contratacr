import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {gotoOK,expectNoHorizontalOverflow} from './helpers';
import {ownerFixture,local,origin} from './pro-round2-fixture';

// Area A (Contacts, tags manager): rename and delete a tag for every customer. Disposable accounts, loopback only.
for(const language of ['es','en'] as const)test(`Contact tag manager: rename, merge on rename, delete [${language}]`,async({page},info)=>{
 test.setTimeout(480000);local(info.project.use.baseURL);const en=language==='en',id=language+randomBytes(3).toString('hex'),tr=(es:string,english:string)=>en?english:es;
 const f=await ownerFixture(page.context(),id);
 try{
  const owner=f.owner.id,second='tag-b-'+id,rev=(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision as number;
  expect((await f.db.rpc('pro_mutate_catalog',{p_user:owner,p_kind:'clients',p_rows:[{id:second,name:'Segundo '+id,email:'segundo.'+id+'@example.test',phone:'',notes:'',archived:false}],p_revision:rev,p_movements:[],p_importing:true})).error).toBeNull();
  const post=(data:Record<string,unknown>)=>page.request.post(origin+'/api/pro/client-contacts',{headers:{Origin:origin},data});
  const tags=async(client:string)=>((await f.db.from('pro_contact_tags').select('tag').eq('owner_id',owner).eq('client_id',client)).data??[]).map(r=>r.tag).sort();
  expect((await post({action:'tags',actionId:crypto.randomUUID(),clientId:f.clientId,tags:['VIP','Cocina']})).status()).toBe(200);
  expect((await post({action:'tags',actionId:crypto.randomUUID(),clientId:second,tags:['vip']})).status()).toBe(200);
  // Validation.
  for(const bad of [{tag:'VIP',name:'a,b'},{tag:'VIP',name:'a;b'},{tag:'VIP',name:''},{tag:'',name:'x'},{tag:'VIP',name:'x'.repeat(41)},{tag:'VIP'}])expect((await post({action:'tag_rename',...bad})).status(),JSON.stringify(bad)).toBe(400);
  expect((await post({action:'tag_delete',tag:'x'.repeat(41)})).status()).toBe(400);
  // Rename applies to every customer, whatever the letter case of the old tag.
  const renamed=await post({action:'tag_rename',tag:'VIP',name:'Premium'});expect(renamed.status(),await renamed.text()).toBe(200);expect((await renamed.json()).affected).toBe(2);
  expect(await tags(f.clientId)).toEqual(['Cocina','Premium']);expect(await tags(second)).toEqual(['Premium']);
  // Renaming onto a tag the customer already has keeps one copy.
  const merged=await post({action:'tag_rename',tag:'Cocina',name:'premium'});expect(merged.status()).toBe(200);
  expect(await tags(f.clientId)).toEqual(['Premium']);
  // An unknown tag affects nothing.
  expect((await post({action:'tag_delete',tag:'no-existe'})).status()).toBe(200);expect((await (await post({action:'tag_delete',tag:'no-existe'})).json()).affected).toBe(0);
  // UI: the tags tab lists tags with counts; rename and delete from there.
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_clients&organizarClientes=1`);
  const organizer=page.locator('[data-contacts-organizer]');await expect(organizer).toBeVisible({timeout:90000});
  await organizer.getByRole('tab',{name:new RegExp(tr('Etiquetas','Tags'))}).click();
  const row=organizer.locator('[data-contacts-tag-row="Premium"]');await expect(row).toContainText('2');
  await row.locator('[data-contacts-tag-rename]').click();await row.locator('[data-contacts-tag-rename-input]').fill('Oro');await row.locator('[data-contacts-tag-rename-save]').click();
  await expect(organizer.locator('[data-contacts-tag-row="Oro"]')).toBeVisible({timeout:60000});await expect(organizer.locator('[data-contacts-notice]')).toContainText(tr('Etiqueta renombrada.','Tag renamed.'));
  await organizer.locator('[data-contacts-tag-row="Oro"] [data-contacts-tag-delete]').click();
  await page.getByRole('button',{name:tr('Eliminar etiqueta','Delete tag'),exact:true}).click();
  await expect(organizer.locator('[data-contacts-tag-row="Oro"]')).toHaveCount(0,{timeout:60000});
  expect(await tags(f.clientId)).toEqual([]);expect(await tags(second)).toEqual([]);
  await expectNoHorizontalOverflow(page);
 }finally{await f.cleanup();}
});
