import {test,expect} from 'playwright/test';
import {randomBytes} from 'node:crypto';
import {ownerFixture,local,origin,login,headersFor} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount} from './disposable-account';

// Row 16: comments with explicit mentions and links to EXISTING job files from the global task center.
// Append-only comments, mention validation (current team only), idempotent action ids, no file copy, isolation.
test('task center detail: comment, mention notice, link and unlink existing job file',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),member=await createDisposableAccount({prefix:'detail-member'}),rival=await createDisposableAccount({prefix:'detail-rival'});
 try{
  const db=f.db,owner=f.owner.id,headers=headersFor(f.owner),url='/api/pro/task-center-detail',taskId=crypto.randomUUID(),fileId=crypto.randomUUID(),pendingFile=crypto.randomUUID(),sha='a'.repeat(64);
  await db.from('pro_company_members').insert({owner_id:owner,member_user_id:member.id,member_name:'Ana Maestra '+tag,member_email:member.email,role:'member'}).throwOnError();
  await db.from('pro_work_tasks').insert({owner_id:owner,work_id:f.workId,id:taskId,title:'DETAIL '+tag,details:'',assignee:'',due_date:null,status:'open',archived:false,revision:1}).throwOnError();
  const file=(id:string,ready:boolean)=>({id,owner_id:owner,work_id:f.workId,source_name:'plano.pdf',name:'plano-'+id.slice(0,4)+'.pdf',mime_type:'application/pdf',raw_sha256:sha,sha256:sha,size_bytes:1234,object_path:owner+'/'+id+'.pdf',ready});
  await db.from('pro_work_files').insert([file(fileId,true),file(pendingFile,false)]).throwOnError();
  const q='?'+new URLSearchParams({workId:f.workId,taskId});
  const read=await (await page.request.get(url+q)).json();
  expect(read.comments).toEqual([]);expect(read.files).toEqual([]);expect(read.available.map((a:{fileId:string})=>a.fileId)).toEqual([fileId]);expect(read.people.length).toBe(2);
  const comment={kind:'comment',actionId:crypto.randomUUID(),workId:f.workId,taskId,text:'Revisar el plano antes del lunes',mentions:[member.id]};
  expect((await page.request.post(url,{headers:{'X-Pro-Expected-Actor':owner},data:comment})).status()).toBe(403);
  expect((await page.request.post(url,{headers,data:{...comment,actionId:crypto.randomUUID(),mentions:[rival.id]}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{...comment,actionId:crypto.randomUUID(),text:'   '}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:{...comment,actionId:crypto.randomUUID(),mentions:[member.id,member.id]}})).status()).toBe(400);
  const ok=await page.request.post(url,{headers,data:comment});expect(ok.status()).toBe(200);
  expect((await page.request.post(url,{headers,data:comment})).status()).toBe(200);
  const after=await (await page.request.get(url+q)).json();expect(after.comments.length).toBe(1);expect(after.comments[0].mentions[0].personId).toBe(member.id);
  expect((await db.from('pro_notifications').select('id').eq('owner_id',owner).eq('person_id',member.id).like('source_key','mention:%').throwOnError()).data!.length).toBe(1);
  expect((await db.from('pro_task_center_comments').update({body:'x'}).eq('owner_id',owner)).error).not.toBeNull();
  const link={kind:'file',action:'link',actionId:crypto.randomUUID(),workId:f.workId,taskId,fileId};
  expect((await page.request.post(url,{headers,data:{...link,actionId:crypto.randomUUID(),fileId:pendingFile}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:link})).status()).toBe(200);
  const linked=await (await page.request.get(url+q)).json();expect(linked.files.map((x:{fileId:string})=>x.fileId)).toEqual([fileId]);expect(linked.available).toEqual([]);
  expect((await db.from('pro_work_files').select('object_path').eq('id',fileId).single().throwOnError()).data!.object_path).toBe(owner+'/'+fileId+'.pdf');
  const unlink={...link,action:'unlink',actionId:crypto.randomUUID()};
  expect((await page.request.post(url,{headers,data:unlink})).status()).toBe(200);
  expect((await page.request.post(url,{headers,data:{...unlink,actionId:crypto.randomUUID()}})).status()).toBe(409);
  const relink=await page.request.post(url,{headers,data:{...link,actionId:crypto.randomUUID()}});expect(relink.status()).toBe(200);
  expect((await (await page.request.get(url+q)).json()).files.length).toBe(1);
  const other=await browser.newContext({baseURL:origin});await login(other,rival);expect((await other.request.get(origin+url+q)).status()).toBe(403);await other.close();
  const anonymous=await browser.newContext({baseURL:origin});expect((await anonymous.request.get(origin+url+q)).status()).toBe(401);await anonymous.close();
 }finally{await f.cleanup();await cleanupDisposableAccount(member);await cleanupDisposableAccount(rival);}
});

// Row 16 (migration 437): edit and delete a comment. History is kept, deleted text is hidden, others cannot change it.
test('task center detail: edit and delete a comment keeping the history',async({page,browser},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const tag=randomBytes(3).toString('hex'),f=await ownerFixture(page.context(),tag),rival=await createDisposableAccount({prefix:'detail-edit-rival'});
 try{
  const db=f.db,owner=f.owner.id,headers=headersFor(f.owner),url='/api/pro/task-center-detail',taskId=crypto.randomUUID();
  await db.from('pro_work_tasks').insert({owner_id:owner,work_id:f.workId,id:taskId,title:'EDIT '+tag,details:'',assignee:'',due_date:null,status:'open',archived:false,revision:1}).throwOnError();
  const q='?'+new URLSearchParams({workId:f.workId,taskId});
  await page.request.post(url,{headers,data:{kind:'comment',actionId:crypto.randomUUID(),workId:f.workId,taskId,text:'Texto original',mentions:[]}});
  const first=(await (await page.request.get(url+q)).json()).comments[0];expect(first.canManage).toBe(true);expect(first.edited).toBe(false);
  const edit={kind:'comment-change',action:'edit',actionId:crypto.randomUUID(),workId:f.workId,taskId,commentId:first.id,text:'Texto corregido'};
  expect((await page.request.post(url,{headers,data:{...edit,actionId:crypto.randomUUID(),text:'   '}})).status()).toBe(400);
  expect((await page.request.post(url,{headers,data:edit})).status()).toBe(200);
  expect((await page.request.post(url,{headers,data:edit})).status()).toBe(200);
  const edited=(await (await page.request.get(url+q)).json()).comments[0];expect(edited.body).toBe('Texto corregido');expect(edited.edited).toBe(true);
  const revisions=(await db.from('pro_task_center_comment_revisions').select('previous_body,kind').eq('owner_id',owner).eq('comment_id',first.id).throwOnError()).data!;
  expect(revisions).toEqual([{previous_body:'Texto original',kind:'edit'}]);
  const del={kind:'comment-change',action:'delete',actionId:crypto.randomUUID(),workId:f.workId,taskId,commentId:first.id};
  expect((await page.request.post(url,{headers,data:del})).status()).toBe(200);
  const gone=(await (await page.request.get(url+q)).json()).comments[0];expect(gone.deleted).toBe(true);expect(gone.body).toBe('');expect(gone.canManage).toBe(false);
  expect((await page.request.post(url,{headers,data:{...edit,actionId:crypto.randomUUID(),text:'Otra vez'}})).status()).toBe(409);
  expect((await db.from('pro_task_center_comments').delete().eq('owner_id',owner)).error).not.toBeNull();
  const other=await browser.newContext({baseURL:origin});await login(other,rival);expect((await other.request.post(origin+url,{headers:{'X-Pro-Expected-Actor':rival.id},data:del})).status()).toBeGreaterThanOrEqual(400);await other.close();
 }finally{await f.cleanup();await cleanupDisposableAccount(rival);}
});
