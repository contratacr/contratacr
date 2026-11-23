import {test,expect} from 'playwright/test';
import {randomBytes,randomUUID as uuid} from 'node:crypto';
import {ownerFixture,local,origin,headersFor} from './pro-round2-fixture';

// Row 05 (2026-11-22): merging customers moves jobs, draft quotes, custom values and additional channels to the kept
// customer; a customer with account movements refuses the merge and the answer lists what blocked it; an additional
// channel can become the main one. API level (the screens are covered in pro-round10-features and
// pro-sales-contact-fields). Disposable accounts, loopback only; nothing is sent.
const contacts='/api/pro/client-contacts';
test('Merging customers transfers records, extras, and refuses account movements',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const id=randomBytes(3).toString('hex');const f=await ownerFixture(page.context(),id);
 try{
  const owner=f.owner.id,revision=async()=>(await f.db.from('pro_workspace_core').select('revision').eq('user_id',owner).single()).data!.revision as number;
  const keep=f.clientId,dup='mt-dup-'+id;
  expect((await f.db.rpc('pro_mutate_catalog',{p_user:owner,p_kind:'clients',p_rows:[{id:dup,name:'Duplicado '+id,email:'dup.'+id+'@example.test',phone:'7111-2222',notes:'',archived:false}],p_revision:await revision(),p_movements:[],p_importing:true})).error).toBeNull();
  const jobId=uuid();
  await f.db.from('pro_work').insert({user_id:owner,id:jobId,client:'Duplicado '+id,service:'Pintura '+id,stage:'new',start:'',end:'',clientId:dup,cancelled:false}).throwOnError();
  await f.db.from('pro_contact_channels').insert({owner_id:owner,client_id:dup,id:uuid(),kind:'phone',value:'7222-3333',value_key:'72223333',label:'Oficina',position:0}).throwOnError();
  const merged=await page.request.post(contacts,{headers:headersFor(f.owner),data:{action:'merge',actionId:uuid(),revision:await revision(),keepId:keep,mergeId:dup}});
  expect(merged.status()).toBe(200);
  expect((await f.db.from('pro_work').select('clientId').eq('user_id',owner).eq('id',jobId).single()).data!.clientId).toBe(keep);
  expect((await f.db.from('pro_clients').select('archived').eq('user_id',owner).eq('id',dup).single()).data!.archived).toBe(true);
  const channels=(await f.db.from('pro_contact_channels').select('kind,value').eq('owner_id',owner).eq('client_id',keep)).data!;
  expect(channels.map(c=>c.value).sort()).toEqual(expect.arrayContaining(['7222-3333']));
  // An additional channel becomes the main phone; the old main one stays as an additional channel.
  const extra=(await f.db.from('pro_contact_channels').select('id,value').eq('owner_id',owner).eq('client_id',keep).eq('value','7222-3333').single()).data!;
  const before=(await f.db.from('pro_clients').select('phone').eq('user_id',owner).eq('id',keep).single()).data!.phone as string;
  const promoteInput={action:'channel_promote',actionId:uuid(),clientId:keep,channelId:extra.id};
  const promoted=await page.request.post(contacts+'/promote-channel',{headers:headersFor(f.owner),data:promoteInput});expect(promoted.status()).toBe(200);
  expect((await f.db.from('pro_clients').select('phone').eq('user_id',owner).eq('id',keep).single()).data!.phone).toBe('7222-3333');
  if(before.trim())expect((await f.db.from('pro_contact_channels').select('value').eq('owner_id',owner).eq('client_id',keep).eq('kind','phone')).data!.map(c=>c.value)).toContain(before.trim());
  expect((await page.request.post(contacts+'/promote-channel',{headers:headersFor(f.owner),data:promoteInput})).status()).toBe(200);
  // A customer whose job has account movements cannot be merged: 400, the blockers are listed, nothing moves.
  const dup2='mt-dup2-'+id,job2=uuid();
  expect((await f.db.rpc('pro_mutate_catalog',{p_user:owner,p_kind:'clients',p_rows:[{id:dup2,name:'Con cuenta '+id,email:'',phone:'',notes:'',archived:false}],p_revision:await revision(),p_movements:[],p_importing:true})).error).toBeNull();
  await f.db.from('pro_work').insert({user_id:owner,id:job2,client:'Con cuenta '+id,service:'Techo '+id,stage:'new',start:'',end:'',clientId:dup2,cancelled:false}).throwOnError();
  await f.db.from('pro_client_entries').insert({user_id:owner,id:uuid(),client_id:dup2,work_id:job2,kind:'agreement',amount_cents:100000,label:'Acuerdo',request_hash:'mt-'+id}).throwOnError();
  const refused=await page.request.post(contacts,{headers:headersFor(f.owner),data:{action:'merge',actionId:uuid(),revision:await revision(),keepId:keep,mergeId:dup2}});
  expect(refused.status()).toBe(400);const body=await refused.json();expect(body.reason).toBe('merge_records');
  expect(body.blockers.some((b:{kind:string;table?:string;reason?:string})=>b.kind==='work'&&b.reason==='entries'||b.kind==='table'&&b.table==='pro_client_entries')).toBe(true);
  expect((await f.db.from('pro_work').select('clientId').eq('user_id',owner).eq('id',job2).single()).data!.clientId).toBe(dup2);
  expect((await f.db.from('pro_clients').select('archived').eq('user_id',owner).eq('id',dup2).single()).data!.archived).toBe(false);
  void origin;
 }finally{await f.cleanup();}
});
