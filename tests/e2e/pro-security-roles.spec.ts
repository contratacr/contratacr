import {test,expect,type BrowserContext,type APIResponse} from 'playwright/test';
import {request as httpRequest} from 'node:http';
import {ownerFixture,local,origin,login,type Owner} from './pro-round2-fixture';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {newCompanyInviteCode} from '../../src/lib/pro/team-roles';

// Final verification 2026-11-14: security regression of the Round 7C company-roles authorization model.
// Owner of `/api/pro/team-roles` (scripts/ci/verify-app-surface-ownership.mjs). Attacks: forged internal
// workspace headers (on /api/pro and on non-/api/pro routes that share the Pro access helper, plus the
// Next internal `x-middleware-request-*` form), path tricks around the middleware gate, Read-only writes,
// role spoofing, entering a company the account does not belong to, removed members keeping access, and
// the member identity in the activity log (also for team management by an Administrator member).
// Disposable accounts, loopback only; nothing is sent, charged or issued.
const json={Origin:origin,'Content-Type':'application/json'};
const uuid=()=>crypto.randomUUID();
async function cookieHeader(context:BrowserContext){return(await context.cookies(origin)).map(c=>`${c.name}=${c.value}`).join('; ');}
/** Raw request that keeps the path exactly as written (no URL normalization by the client). */
function raw(context:BrowserContext,method:string,path:string,body?:unknown){
 return cookieHeader(context).then(cookie=>new Promise<{status:number;body:string}>((resolve,reject)=>{
  const data=body===undefined?undefined:Buffer.from(JSON.stringify(body));
  const req=httpRequest({host:'127.0.0.1',port:3185,method,path,headers:{cookie,Origin:origin,...(data?{'Content-Type':'application/json','Content-Length':String(data.length)}:{})},timeout:120000},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>{text+=c;});res.on('end',()=>resolve({status:res.statusCode??0,body:text}));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('timeout')));if(data)req.write(data);req.end();
 }));
}
const text=async(r:APIResponse)=>r.status()+' '+(await r.text()).slice(0,300);
async function team(context:BrowserContext,data:Record<string,unknown>){return context.request.post(origin+'/api/pro/team-roles',{headers:{Origin:origin},data,timeout:120000});}

test('Security: company roles gate, forged workspace headers and member lifecycle',async({page,browser},info)=>{
 test.setTimeout(900000);local(info.project.use.baseURL);const id='sec'+uuid().slice(0,6);
 const f=await ownerFixture(page.context(),id);let other:Owner|null=null;const contexts:BrowserContext[]=[];
 let member:DisposableAccount|null=null,outsider:DisposableAccount|null=null,third:DisposableAccount|null=null;
 try{
  const otherContext=await browser.newContext({baseURL:origin});contexts.push(otherContext);other=await ownerFixture(otherContext,id+'b');
  const memberContext=await browser.newContext({baseURL:origin});contexts.push(memberContext);
  member=await createDisposableAccount({prefix:'sec-member'});await login(memberContext,member);
  // (1) The owner invites a Read-only member; the member accepts and enters the company.
  const code=newCompanyInviteCode();
  const invited=await team(page.context(),{action:'invite',actionId:uuid(),email:member.email,role:'read_only',code,locale:'es'});expect(invited.status(),await text(invited)).toBe(200);
  const accepted=await team(memberContext,{action:'accept',actionId:uuid(),code});expect(accepted.status(),await text(accepted)).toBe(200);
  const entered=await team(memberContext,{action:'enter',ownerId:f.owner.id});expect(entered.status(),await text(entered)).toBe(200);
  const tasksUrl=origin+'/api/pro/work-tasks?workId='+encodeURIComponent(f.workId);
  const readOwn=await memberContext.request.get(tasksUrl,{timeout:120000});expect(readOwn.status(),await text(readOwn)).toBe(200);
  const head=await memberContext.request.head(tasksUrl,{timeout:120000});expect(head.status()).toBe(200);
  // (2) Read-only cannot write, whatever the path spelling or a forged role header.
  const taskBody=()=>({action:'create',actionId:uuid(),workId:f.workId,taskId:uuid(),revision:0,title:'Intento '+id,details:'',dueDate:null,assignee:''});
  const denied=await memberContext.request.post(origin+'/api/pro/work-tasks',{headers:json,data:taskBody(),timeout:120000});expect(denied.status(),await text(denied)).toBe(403);expect((await denied.json()).code).toBe('pro_role');
  const spoofRole=await memberContext.request.post(origin+'/api/pro/work-tasks',{headers:{...json,'x-pro-workspace-role':'admin','x-pro-workspace-owner':f.owner.id,'x-pro-workspace-member':member.id},data:taskBody(),timeout:120000});
  expect(spoofRole.status(),await text(spoofRole)).toBe(403);
  for(const path of ['/api/pro/x/../work-tasks','/api/pro/./work-tasks','/api/pro/%2e/work-tasks']){
   const r=await raw(memberContext,'POST',path,taskBody());expect([403,404],path+' → '+r.status+' '+r.body.slice(0,200)).toContain(r.status);
  }
  for(const path of ['/api/pro//work-tasks','/api/pro/work-tasks/','/api//pro/work-tasks','/es/api/pro/work-tasks']){
   const r=await raw(memberContext,'POST',path,taskBody());expect([308,403,404],path+' → '+r.status+' '+r.body.slice(0,200)).toContain(r.status);
  }
  for(const path of ['/api/%70ro/work-tasks','/api/pro/%77ork-tasks','/api/pro%2Fwork-tasks','/API/pro/work-tasks']){
   const r=await raw(memberContext,'POST',path,taskBody());expect([403,404],path+' → '+r.status+' '+r.body.slice(0,200)).toContain(r.status);// never reaches a route
  }
  const finance=await memberContext.request.post(origin+'/api/pro/expenses',{headers:json,data:{},timeout:120000});expect(finance.status()).toBe(403);
  const manage=await team(memberContext,{action:'invite',actionId:uuid(),email:'nadie.'+id+'@example.test',role:'admin',code:newCompanyInviteCode(),locale:'es'});expect(manage.status(),await text(manage)).toBe(403);
  expect((await f.db.from('pro_work_tasks').select('id').eq('owner_id',f.owner.id).ilike('title','Intento %').throwOnError()).data).toHaveLength(0);
  // (3) A company the account does not belong to: refused to enter; a hand-written cookie is ignored.
  const foreign=await team(memberContext,{action:'enter',ownerId:other.owner.id});expect(foreign.status()).toBe(403);
  const forgedJar=await browser.newContext({baseURL:origin});contexts.push(forgedJar);await login(forgedJar,member);
  await forgedJar.addCookies([{name:'ccr_pro_ws',value:other.owner.id,url:origin,httpOnly:true,sameSite:'Lax'}]);
  const foreignRead=await forgedJar.request.get(origin+'/api/pro/work-tasks?workId='+encodeURIComponent(other.workId),{timeout:120000});expect(foreignRead.status(),await text(foreignRead)).not.toBe(200);
  // (4) Forged internal headers from an unrelated professional account: on /api/pro, on /api/quotes
  // (shares the Pro access helper) and in Next's internal x-middleware-request-* form.
  outsider=await createDisposableAccount({prefix:'sec-outsider',professional:true});const outsiderContext=await browser.newContext({baseURL:origin});contexts.push(outsiderContext);await login(outsiderContext,outsider);
  const forged={'x-pro-workspace-owner':f.owner.id,'x-pro-workspace-member':outsider.id,'x-pro-workspace-role':'admin'};
  const internal={'x-middleware-override-headers':'x-pro-workspace-owner,x-pro-workspace-member,x-pro-workspace-role,cookie','x-middleware-request-x-pro-workspace-owner':f.owner.id,'x-middleware-request-x-pro-workspace-member':outsider.id,'x-middleware-request-x-pro-workspace-role':'admin'};
  for(const extra of [forged,internal]){
   const r=await outsiderContext.request.get(tasksUrl,{headers:extra,timeout:120000});expect(r.status(),await text(r)).not.toBe(200);
  }
  const quote={sourceRequestId:uuid(),clientActionId:uuid(),clientName:'Cliente '+id,title:'Prueba',items:[{description:'Línea',quantity:1,unit_price:1000}],taxMode:'incluido',validDays:15};
  const baseline=await outsiderContext.request.post(origin+'/api/quotes',{headers:json,data:quote,timeout:120000});const baselineText=await text(baseline);
  expect(baseline.status(),baselineText).toBe(403);
  for(const extra of [forged,internal]){
   const r=await outsiderContext.request.post(origin+'/api/quotes',{headers:{...json,...extra},data:{...quote,clientActionId:uuid()},timeout:120000});
   expect(await text(r),'forged identity on /api/quotes').toBe(baselineText);
  }
  // (5) Member role writes are recorded with the member identity; an Administrator member's team
  // management is recorded too; once removed, the stale cookie gives no access.
  const roster=async()=>{const r=await page.context().request.get(origin+'/api/pro/team-roles?view=me',{timeout:120000});expect(r.status()).toBe(200);return (await r.json()).members.find((m:{userId:string})=>m.userId===member!.id) as {id:string;revision:number};};
  let row=await roster();
  expect((await team(page.context(),{action:'set_role',actionId:uuid(),memberId:row.id,revision:row.revision,role:'member'})).status()).toBe(200);
  const body=taskBody();const created=await memberContext.request.post(origin+'/api/pro/work-tasks',{headers:json,data:body,timeout:120000});expect(created.status(),await text(created)).toBe(200);
  const activity=async(capability:string)=>(await f.db.from('pro_company_team_activity').select('member_user_id,capability,method,path').eq('owner_id',f.owner.id).eq('capability',capability).throwOnError()).data!;
  expect((await activity('work.write')).some(a=>a.member_user_id===member!.id&&a.method==='POST'&&a.path==='/api/pro/work-tasks')).toBe(true);
  row=await roster();expect((await team(page.context(),{action:'set_role',actionId:uuid(),memberId:row.id,revision:row.revision,role:'admin'})).status()).toBe(200);
  third=await createDisposableAccount({prefix:'sec-third'});
  const adminInvite=await team(memberContext,{action:'invite',actionId:uuid(),email:third.email,role:'member',code:newCompanyInviteCode(),locale:'es'});expect(adminInvite.status(),await text(adminInvite)).toBe(200);
  expect((await activity('team.manage')).some(a=>a.member_user_id===member!.id&&a.method==='POST'&&a.path==='/api/pro/team-roles')).toBe(true);
  row=await roster();expect((await team(page.context(),{action:'remove',actionId:uuid(),memberId:row.id,revision:row.revision})).status()).toBe(200);
  const before=(await activity('work.write')).length;
  const afterRemoval=await memberContext.request.post(origin+'/api/pro/work-tasks',{headers:json,data:taskBody(),timeout:120000});expect(afterRemoval.status(),await text(afterRemoval)).not.toBe(200);
  const readAfter=await memberContext.request.get(tasksUrl,{timeout:120000});expect(readAfter.status(),await text(readAfter)).not.toBe(200);
  const manageAfter=await team(memberContext,{action:'invite',actionId:uuid(),email:'otra.'+id+'@example.test',role:'member',code:newCompanyInviteCode(),locale:'es'});
  expect(manageAfter.status(),await text(manageAfter)).not.toBe(503);// its own account now (its own team, or refused), never the company
  expect((await f.db.from('pro_company_invites').select('id').eq('owner_id',f.owner.id).eq('email','otra.'+id+'@example.test').throwOnError()).data).toHaveLength(0);
  expect((await activity('work.write')).length).toBe(before);
 }finally{
  for(const c of contexts)await c.close().catch(()=>{});
  await cleanupDisposableAccount(member??undefined);await cleanupDisposableAccount(outsider??undefined);await cleanupDisposableAccount(third??undefined);
  await other?.cleanup();await f.cleanup();
 }
});
