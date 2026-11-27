import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,login,origin,ownerFixture,proOff} from './pro-round2-fixture';
// PRO_ENABLED off: replies go through «Mi negocio» (/api/negocio/respuestas, same schema and SQL).
const REPLIES=proOff?'/api/negocio/respuestas':'/api/pro/review-replies';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {openPlaceTab, claimByEmail,dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {opsShot} from './pro-dir-ops-fixture';

// Multivertical M1 (LOCAL Pro): the business answers a review of its claimed place once and may edit the reply (CAS by
// reply revision, every version kept in an immutable history, «editada» on the public page); a member of the owner's
// Pro team may reply only with a role that allows public publishing (admin/manager); anyone can report a review to the
// moderators. Owner of /api/pro/review-replies and /api/lugar/[slug]/resenas/reporte.
test.afterEach(()=>hideSeededPlaces());

for(const language of ['es','en'] as const)test(`M1: owner reply with edit history, team role gate and review report [${language}]`,async({page,context,browser},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),slug=`soda-respuesta-${tag}`;
 await seedPlace(db,{slug,vertical:'restaurant',name:`Soda Respuesta ${tag}`,phone:'+506 2244 0011'});
 const errors=collectPageErrors(page);
 const f=await ownerFixture(context,tag);
 let other:DisposableAccount|undefined,member:DisposableAccount|undefined,reviewId='';
 try{
  await claimByEmail(context,slug);
  const rv=await db.rpc('dir_review_submit',{p_actor:uid(),p_input:{actionId:uid(),reviewId:uid(),slug,revision:0,rating:3.5,comment:t('Buena comida, pero la espera fue larga.','Good food, but the wait was long.'),authorName:'Mariana Solís'}});
  expect(rv.error).toBeNull();reviewId=(rv.data as {reviewId:string}).reviewId;
  await gotoOK(page,`${prefix}/lugar/${slug}`);await openPlaceTab(page,'reviews');
  const editor=page.locator(`[data-owner-reply-editor="${reviewId}"]`);await expect(page.locator(`[data-owner-reply-editor="${reviewId}"][data-ready]`)).toBeVisible({timeout:45000});
  await expect(page.locator('[data-place-review-manager]')).toBeVisible();await expect(page.locator('[data-place-review-form]')).toHaveCount(0);
  await editor.getByRole('button',{name:t('Responder como la empresa','Reply as the business')}).click();
  const box=editor.getByLabel(t('Respuesta pública de la empresa (máximo 1000 caracteres, sin enlaces)','Public reply from the business (up to 1000 characters, no links)'));
  await box.fill(t('Gracias por su visita. Ya reforzamos el equipo de cocina.','Thank you for visiting. We have added staff in the kitchen.'));
  await editor.getByRole('button',{name:t('Publicar respuesta','Post reply')}).click();
  await expect(editor.locator('[data-owner-reply-saved]')).toBeVisible();
  await page.reload();await openPlaceTab(page,'reviews');await expect(page.locator(`[data-owner-reply-editor="${reviewId}"][data-ready]`)).toBeVisible({timeout:45000});
  const shown=page.locator(`[data-place-review="${reviewId}"] [data-owner-reply]`);
  await expect(shown).toContainText(t('Ya reforzamos el equipo de cocina','We have added staff in the kitchen'));
  await expect(shown).not.toContainText(t('editada','edited'));
  await editor.getByRole('button',{name:t('Editar respuesta','Edit reply')}).click();
  await box.fill(t('Gracias por su visita. Ya reforzamos el equipo de cocina y la espera bajó.','Thank you for visiting. We added kitchen staff and the wait is shorter now.'));
  await editor.getByRole('button',{name:t('Guardar cambios','Save changes')}).click();
  await expect(editor.locator('[data-owner-reply-saved]')).toBeVisible();
  await page.reload();await openPlaceTab(page,'reviews');await expect(page.locator(`[data-owner-reply-editor="${reviewId}"][data-ready]`)).toBeVisible({timeout:45000});
  await expect(shown).toContainText(t('la espera bajó','the wait is shorter now'));await expect(shown).toContainText(t('editada','edited'));
  await expectNoHorizontalOverflow(page);
  await page.locator(`[data-place-review="${reviewId}"]`).scrollIntoViewIfNeeded();
  await opsShot(page,`review-owner-reply-${language}`,info,false);
  // A stale edit (revision 1 while 2 is current) and links are refused; the history keeps both versions.
  const stale=await postJson(context,REPLIES,{actionId:uid(),reviewId,reply:'Versión vieja',replyRevision:1});
  expect([stale.status,stale.body?.reason]).toEqual([409,'reload']);
  expect((await postJson(context,REPLIES,{actionId:uid(),reviewId,reply:'Visite www.ejemplo.com',replyRevision:2})).status).toBe(400);
  const hist=(await db.from('dir_review_reply_history').select('revision,edited_by').eq('review_id',reviewId).order('revision')).data!;
  expect(hist.map(h=>h.revision)).toEqual([1,2]);expect(hist.every(h=>h.edited_by===f.owner.id)).toBe(true);
  // Someone who does not manage the place cannot reply.
  other=await createDisposableAccount({prefix:'dir-reply-other'});const oc=await browser.newContext({baseURL:origin});await login(oc,other);
  const foreign=await postJson(oc,REPLIES,{actionId:uid(),reviewId,reply:'No soy el dueño',replyRevision:2});
  expect([foreign.status,foreign.body?.reason]).toEqual([403,'reply_not_manager']);await oc.close();
  if(!proOff){
  // Team member of the owner's Pro company: «member» cannot publish replies, «manager» can.
  member=await createDisposableAccount({prefix:'dir-reply-member'});
  await db.from('pro_company_members').insert({owner_id:f.owner.id,member_user_id:member.id,member_name:'Miembro '+tag,member_email:member.email,role:'member'}).throwOnError();
  const mc=await browser.newContext({baseURL:origin});await login(mc,member);
  await mc.addCookies([{name:'ccr_pro_ws',value:f.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const asMember=await postJson(mc,'/api/pro/review-replies',{actionId:uid(),reviewId,reply:'Respuesta del equipo',replyRevision:2});
  expect([asMember.status,asMember.body?.reason]).toEqual([403,'reply_role']);
  await db.from('pro_company_members').update({role:'manager',revision:2}).eq('owner_id',f.owner.id).eq('member_user_id',member.id).throwOnError();
  const asManager=await postJson(mc,'/api/pro/review-replies',{actionId:uid(),reviewId,reply:t('Gracias. Le esperamos de nuevo.','Thank you. We hope to see you again.'),replyRevision:2});
  expect(asManager.status,JSON.stringify(asManager.body)).toBe(200);expect(asManager.body?.replyRevision).toBe(3);
  expect((await db.from('dir_review_reply_history').select('edited_by,member_id').eq('review_id',reviewId).eq('revision',3).single()).data).toEqual({edited_by:member.id,member_id:member.id});
  await mc.close();
  }
  // A visitor without an account reports the review to the moderators.
  const guest=await browser.newContext({baseURL:origin});const g=await guest.newPage();
  try{
   await gotoOK(g,`${prefix}/lugar/${slug}`);await openPlaceTab(g,'reviews');
   /* Hydrated (the professional profile's write card). */await expect(g.locator('[data-place-review-form][data-ready]')).toBeVisible({timeout:45000});
   const flag=g.locator(`[data-review-flag="${reviewId}"]`);
   await flag.getByText(t('Reportar reseña','Report review')).click();
   await flag.getByLabel(t('Motivo','Reason'),{exact:true}).selectOption('fake');
   await flag.getByRole('button',{name:t('Enviar reporte','Send report')}).click();
   await expect(g.locator('[data-review-flag-sent]')).toBeVisible();
  }finally{await guest.close();}
  expect((await db.from('dir_review_flags').select('reason,status,reporter_id').eq('review_id',reviewId)).data).toEqual([{reason:'fake',status:'open',reporter_id:null}]);
  // The business does not see «report» on its own place; the public page never shows manager ids.
  await gotoOK(page,`${prefix}/lugar/${slug}`);await openPlaceTab(page,'reviews');
  await expect(page.locator('[data-review-flag]')).toHaveCount(0);
  const html=await page.locator('[data-place-reviews]').innerHTML();for(const id of [f.owner.id,...(member?[member.id]:[])])expect(html).not.toContain(id);
  expect(errors()).toEqual([]);
 }finally{
  // The synthetic report must not stay in the staff queue: close it (audited, like any staff decision).
  if(reviewId){const open=await db.from('dir_review_flags').select('id').eq('review_id',reviewId).eq('status','open');
   if(open.error)throw new Error('flag cleanup: '+open.error.message);
   if(open.data?.length){const r=await db.rpc('dir_admin_review_moderate',{p_actor:uid(),p_input:{actionId:uid(),reviewId,target:'review',decision:'dismiss',reason:'Limpieza E2E: reporte sintético',expectedStatus:'published'}});if(r.error)throw new Error('flag cleanup: '+r.error.message);}}
  if(member)await db.from('pro_company_members').update({active:false}).eq('owner_id',f.owner.id).eq('member_user_id',member.id);
  await cleanupDisposableAccount(member);await cleanupDisposableAccount(other);await f.cleanup();
 }
});
