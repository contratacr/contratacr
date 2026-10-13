import { test, expect } from 'playwright/test';
import { lifecycleCandidate, type LifecycleAccount } from '../../src/lib/email/lifecycle-policy';
import { MOBILE_APP_CAMPAIGN } from '../../src/lib/email/mobile-app-campaign';
import { PROFILE_REMINDER } from '../../src/lib/email/profile-reminder';
import { REVIEW_CAMPAIGN, type CampaignHistory } from '../../src/lib/email/campaign-policy';
const now=Date.UTC(2026,9,12,15), date=(n:number)=>new Date(now-n*86400000).toISOString();
const account:LifecycleAccount={id:'person',email:'person@example.com',full_name:'Person',created_at:date(30),role:'client',is_provider:false,is_disabled:false,emailConfirmed:true,hasUsedMobileApp:false,avatar_url:'https://example.com/avatar.jpg'};
const sent=(key:string,days=15):CampaignHistory=>({profile_id:account.id,email:account.email!,campana:key,status:'sent',enviado_en:date(days)});
const pick=(a=account,h:CampaignHistory[]=[])=>lifecycleCandidate(a,undefined,h,[],true,now)?.key;
test('invitation requires verified no-use evidence, confirmed email and seven days',()=>{
 expect(pick()).toBe(MOBILE_APP_CAMPAIGN.key);
 for(const a of [{...account,hasUsedMobileApp:true},{...account,hasUsedMobileApp:undefined},{...account,emailConfirmed:false},{...account,created_at:date(6)}])expect(pick(a)).not.toBe(MOBILE_APP_CAMPAIGN.key);
 expect(pick({...account,created_at:date(7)})).toBe(MOBILE_APP_CAMPAIGN.key);
});
test('same announcement stays once across text and email changes and the fourteen-day gap is shared',()=>{
 expect(pick(account,[sent(MOBILE_APP_CAMPAIGN.key)])).not.toBe(MOBILE_APP_CAMPAIGN.key);
 expect(pick({...account,email:'new@example.com'},[sent(MOBILE_APP_CAMPAIGN.key)])).not.toBe(MOBILE_APP_CAMPAIGN.key);
 expect(pick(account,[sent('another',13)])).toBeUndefined();
 expect(pick(account,[sent('another',14)])).toBe(MOBILE_APP_CAMPAIGN.key);
 expect(pick(account,[{...sent('another',30),status:'uncertain'}])).toBeUndefined();
});
test('opt-out, disabled/admin accounts and a rejected delivery cannot be invited',()=>{
 expect(lifecycleCandidate(account,undefined,[],[account.email!],false,now)).toBeNull();
 expect(pick({...account,is_disabled:true})).toBeUndefined();
 expect(pick({...account,role:'admin'})).toBeUndefined();
 expect(pick(account,[{...sent('another',30),rebote_en:date(29)}])).toBeUndefined();
});
test('profile completion and reviews remain first, then app precedes missing price',()=>{
 const pending={...account,is_provider:true,professionalIntent:true};
 expect(pick(pending)).toBe(PROFILE_REMINDER.key);
 const pro={profile_id:account.id,created_at:date(30),review_count:0,services:[{active:true,description:'Servicio',priceType:'a_convenir'}],is_banned:false,oculto_del_buscador:false,slug:'pro',bio:'Trabajo',whatsapp:'+50670001234',coverage_country:true};
 expect(lifecycleCandidate(account,pro,[],[],false,now)?.key).toBe(REVIEW_CAMPAIGN.key);
 expect(lifecycleCandidate(account,pro,[sent(REVIEW_CAMPAIGN.key)],[],false,now)?.key).toBe(MOBILE_APP_CAMPAIGN.key);
 expect(lifecycleCandidate(account,pro,[sent(REVIEW_CAMPAIGN.key),sent(MOBILE_APP_CAMPAIGN.key,14)],[],false,now)?.key).toBe('precio-desde-profesionales-2026');
});
test('download button keeps the website download section after campaign attribution is appended',()=>{
 const href=new URL(MOBILE_APP_CAMPAIGN.ctaPath,'https://contratacr.com');
 href.searchParams.set('utm_campaign',MOBILE_APP_CAMPAIGN.key);
 expect(href.hash).toBe('#descargar-app');expect(href.origin).toBe('https://contratacr.com');
});

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from '../../src/lib/email/lifecycle-policy';
function workerHarness(usedBeforeSend: boolean, lookupFails=false) {
 let providerCalls=0;
 const profile={...account,id:'account',created_at:new Date(Date.now()-30*86400000).toISOString()};
 const source=ts.transpileModule(readFileSync('src/lib/email/lifecycle-worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const box={exports:{} as {runLifecycleEmails:(db:unknown,simulate:boolean)=>Promise<{sent:number;eligible:Record<string,number>;skipped:number;mobileUsageVerified?:boolean}>}};
 const result=(data:unknown,error:unknown=null)=>{
  const q:Record<string,unknown>={};
  for(const name of ['select','eq','neq','ilike','order','range','limit'])q[name]=()=>q;
  q.single=async()=>({data:Array.isArray(data)?data[0]:data,error});
  q.maybeSingle=async()=>({data:Array.isArray(data)?data[0]??null:data,error});
  q.then=(fn:(r:unknown)=>unknown)=>Promise.resolve({data,error}).then(fn);
  return q;
 };
 const db={
  from:(table:string)=>result(table==='profiles'?[profile]:[]),
  rpc:(name:string)=>name==='get_mobile_usage_accounts'?result([],lookupFails?new Error('unavailable'):null):result(usedBeforeSend),
  auth:{admin:{listUsers:async()=>({data:{users:[{id:profile.id,email_confirmed_at:'confirmed'}]},error:null}),getUserById:async()=>({data:{user:{email_confirmed_at:'confirmed'}},error:null})}},
 };
 const mocks:Record<string,unknown>={
  './mobile-app-campaign':{MOBILE_APP_CAMPAIGN},'./lifecycle-policy':policy,'./campaign-policy':{},
  './campaign-delivery':{deliverCampaignOnce:async(_db:unknown,_key:string,_email:string,send:()=>Promise<{ok:boolean}>)=>(await send()).ok?'sent':'skipped'},
  './send':{brandedEmailDocument:()=>'',sendBrevoEmail:async()=>{providerCalls++;return {ok:true,status:'sent'};}},
  './baja':{enlaceDeBaja:()=>''},'./escape':{escaparHtml:(value:unknown)=>String(value)},
  './cuota':{resumenDeCuota:async()=>({puedeEnviar:{masivo:true}})},
 };
 runInNewContext(source,{module:box,exports:box.exports,require:(name:string)=>mocks[name],URL,Date,Promise,process:{env:{NEXT_PUBLIC_APP_URL:'https://contratacr.com'}}});
 return {run:(simulate=false)=>box.exports.runLifecycleEmails(db,simulate),calls:()=>providerCalls};
}
test('recipient who begins using mobile while waiting is rechecked before calling Brevo',async()=>{
 const h=workerHarness(true),result=await h.run();
 expect(result.eligible[MOBILE_APP_CAMPAIGN.key]).toBe(1);expect(result.sent).toBe(0);expect(result.skipped).toBe(1);expect(h.calls()).toBe(0);
});
test('worker can send an eligible announcement and measurement failure blocks only the announcement',async()=>{
 const h=workerHarness(false),result=await h.run();expect(result.sent).toBe(1);expect(h.calls()).toBe(1);
 const broken=workerHarness(false,true),preview=await broken.run(true);
 expect(preview.mobileUsageVerified).toBe(false);expect(preview.eligible[MOBILE_APP_CAMPAIGN.key]).toBeUndefined();expect(broken.calls()).toBe(0);
});
