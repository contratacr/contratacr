import {test,expect} from 'playwright/test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const requireNode=createRequire(`${process.cwd()}/tests/e2e/pro-identity-security-runtime.spec.ts`);
type LookupResult={found:boolean;fullName?:string;idType?:string;unavailable?:boolean};
function route({saved=null,previous=null,accessStatus=0,quotaError=false,allowed=true,banned=false,result={found:true,fullName:'Nombre de prueba',idType:'cedula'}}:{saved?:Record<string,unknown>|null;previous?:Record<string,unknown>|null;accessStatus?:number;quotaError?:boolean;allowed?:boolean;banned?:boolean;result?:LookupResult}={}){
 const quotaCalls:unknown[][]=[],lookupCalls:unknown[][]=[],queries:unknown[][]=[];
 const source=ts.transpileModule(readFileSync('src/app/api/pro/identity-lookup/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const box={exports:{} as {POST:(req:Request)=>Promise<Response>;GET:()=>Promise<Response>}};
 const mocks:Record<string,unknown>={
  '@/lib/pro/api-access':{proApiAccess:async()=>accessStatus?{error:Response.json({error:'Denied'},{status:accessStatus})}:{user:{id:'owner-fixture'},db:{from:(table:string)=>{const query:Record<string,unknown>={};for(const method of ['select','eq','is','order','limit'])query[method]=(...args:unknown[])=>{queries.push([table,method,...args]);return query;};query.maybeSingle=async()=>({data:table==='professionals'?{id:'professional-fixture',is_banned:banned}:table==='pro_clients'?saved:previous,error:null});return query;},rpc:async(...args:unknown[])=>{quotaCalls.push(args);return {error:quotaError?{code:'unavailable'}:null,data:{allowed,retryAfter:37}};}}}},
  '@/lib/cedula':{isValidId:(id:string)=>/^[1-9]\d{8}$/.test(id)},
  '@/lib/verification/identity-verifier':{getIdentityVerifier:()=>({lookup:async(...args:unknown[])=>{lookupCalls.push(args);return result;}})},
  '@opennextjs/cloudflare':{getCloudflareContext:async()=>{throw Error('not on trusted ingress');}},
 };
 runInNewContext(source,{exports:box.exports,module:box,require:(name:string)=>mocks[name]??requireNode(name),Response,Request,Buffer,URL,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-secret-never-a-real-key-at-least-32-characters'}}});
 const post=(body:unknown={identification:'101230456',purpose:'client_billing'},suffix='',extra:HeadersInit={})=>box.exports.POST(new Request('http://localhost/api/pro/identity-lookup'+suffix,{method:'POST',headers:{'content-type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {post,get:box.exports.GET,quotaCalls,lookupCalls,queries};
}
test('private lookup rejects denied users, suspended profiles and GET without consulting provider',async()=>{
 for(const status of [401,403,404]){const r=route({accessStatus:status}),response=await r.post();expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('no-store');expect(r.quotaCalls).toHaveLength(0);expect(r.lookupCalls).toHaveLength(0);}
 const banned=route({banned:true});expect((await banned.post()).status).toBe(403);expect(banned.lookupCalls).toHaveLength(0);
 const r=route();expect((await r.get()).status).toBe(405);expect(r.quotaCalls).toHaveLength(0);
});
test('private lookup accepts only a small single identification body and explicit billing purpose',async()=>{
 const r=route();
 for(const body of [{identification:'101230456',purpose:'marketing'},{identification:'101230456',purpose:'client_billing',extra:true},{identification:['101230456'],purpose:'client_billing'},{identification:'bad',purpose:'client_billing'},'{}','x'.repeat(513)])expect((await r.post(body)).status).toBe(400);
 expect((await r.post(undefined,'?identification=101230456')).status).toBe(400);
 expect((await r.post(undefined,'',{'content-type':'text/plain'})).status).toBe(400);
 expect(r.quotaCalls).toHaveLength(0);expect(r.lookupCalls).toHaveLength(0);
});
test('shared limiter fails closed, returns retry-after and never sends raw account/IP/identification to quota storage',async()=>{
 const failed=route({quotaError:true});expect((await failed.post()).status).toBe(503);expect(failed.lookupCalls).toHaveLength(0);
 const denied=route({allowed:false}),response=await denied.post();expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('37');expect(denied.lookupCalls).toHaveLength(0);
 const args=denied.quotaCalls[0][1] as {p_account:string;p_ip:string};expect(args.p_account).toMatch(/^[a-f0-9]{64}$/);expect(args.p_ip).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(args)).not.toMatch(/owner-fixture|101230456/);
});
test('caller-supplied proxy headers cannot change the conservative local ingress bucket',async()=>{
 const r=route();await r.post(undefined,'',{'x-forwarded-for':'203.0.113.1','cf-connecting-ip':'203.0.113.1'});await r.post(undefined,'',{'x-forwarded-for':'203.0.113.2','cf-connecting-ip':'203.0.113.2'});
 expect(r.quotaCalls[0][1]).toEqual(r.quotaCalls[1][1]);
});
test('lookup returns only minimum fields, no-store and no registration cache; provider errors preserve user control',async()=>{
 const r=route({result:{found:true,fullName:'Nombre de prueba',idType:'cedula',unavailable:false}}),response=await r.post();
 expect(response.status).toBe(200);expect(await response.json()).toEqual({found:true,fullName:'Nombre de prueba',idType:'cedula'});expect(response.headers.get('cache-control')).toBe('no-store, private');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(r.lookupCalls).toEqual([['101230456',{cache:false}]]);
 for(const [result,status] of [[{found:false},404],[{found:false,unavailable:true},503]] as const){const r=route({result});expect((await r.post()).status).toBe(status);expect(r.quotaCalls).toHaveLength(1);}
});

test('customer completion reuses only owned records and previously shared quote contact details',async()=>{
 const input={identification:'101230456',purpose:'client_contact'};
 const saved=route({saved:{id:'saved-client'}}),existing=await saved.post(input);expect(await existing.json()).toEqual({found:true,existingClientId:'saved-client'});expect(saved.lookupCalls).toHaveLength(0);expect(saved.queries).toContainEqual(['pro_clients','eq','user_id','owner-fixture']);expect(saved.queries).toContainEqual(['pro_clients','eq','identification','101230456']);
 const previous=route({previous:{client_name:'Cliente compartido',client_email:'shared@contratacr.test',client_phone:'+50688888888'}}),response=await previous.post(input);expect(await response.json()).toEqual({found:true,source:'previous_quote',contact:{name:'Cliente compartido',email:'shared@contratacr.test',phone:'+50688888888'}});expect(previous.lookupCalls).toHaveLength(0);expect(previous.queries).toContainEqual(['quotes','eq','professional_id','professional-fixture']);expect(previous.queries).toContainEqual(['quotes','is','deleted_at',null]);expect(previous.queries.some(q=>q[0]==='profiles')).toBe(false);
 const fallback=route();expect(await (await fallback.post(input)).json()).toEqual({found:true,fullName:'Nombre de prueba',idType:'cedula'});expect(fallback.lookupCalls).toHaveLength(1);
 const limited=route({allowed:false,saved:{id:'saved-client'}});expect((await limited.post(input)).status).toBe(429);expect(limited.queries.some(q=>q[0]==='pro_clients')).toBe(false);
});
