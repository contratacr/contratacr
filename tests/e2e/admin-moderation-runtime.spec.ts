import { test,expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
const nativeRequire=createRequire(`${process.cwd()}/tests/e2e/admin-moderation-runtime.spec.ts`);
type Handler=(r:Request)=>Promise<Response>;
function load(file:string,mocks:Record<string,unknown>,globals:Record<string,unknown>={}){
 const box={exports:{} as Record<string,Handler>};
 runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:box,exports:box.exports,require:(name:string)=>mocks[name]??(name==="@/lib/cache/professional-revision"?{invalidateProfessionalCache:async()=>{}}:nativeRequire(name)),Request,Response,URL,AbortSignal,Uint8Array,process:{env:{}},...globals});
 return box.exports;
}
const headers={"Cache-Control":"private, no-store"};
test('@contract every new administrative endpoint rejects a guest before accessing private data',async()=>{
 const blocked=()=>{throw Error('Private database must not be reached');};
 const mocks={"@/lib/auth/admin":{getApiAdmin:async()=>null},"@/lib/moderation/admin":{moderationAccess:async()=>null,privateHeaders:headers},"@/lib/supabase/server":{createClient:blocked},"@/lib/supabase/admin":{createAdminClient:blocked},"@/lib/rate-limit":{enforceRateLimit:()=>null},"next/cache":{revalidatePath:()=>{}}};
 for(const name of ['conversaciones','moderacion','moderacion/archivos','permisos','salud']){
  const route=load(`src/app/api/admin/${name}/route.ts`,mocks);
  for(const method of ['GET','POST'])if(route[method]){
   const response=await route[method](new Request(`https://example.test/api/admin/${name}`,{method}));
   expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toContain('no-store');
  }
 }
});

test('@contract moderation rejects cross-origin writes and never succeeds after an audit RPC failure',async()=>{
 let calls=0;
 const route=load('src/app/api/admin/moderacion/route.ts',{
  '@/lib/moderation/admin':{privateHeaders:headers,moderationAccess:async()=>({admin:{id:'qa'},db:{rpc:async()=>{calls++;return {data:null,error:{message:'audit failed'}};}}})},
  '@/lib/supabase/admin':{createAdminClient:()=>{throw Error('unused');}},'@/lib/rate-limit':{enforceRateLimit:()=>null},'next/cache':{revalidatePath:()=>{}}
 });
 const body={kind:'job',id:'00000000-0000-4000-8000-000000000030',action:'hide',reason:'Confirmed policy violation'};
 expect((await route.POST(new Request('https://example.test/api/admin/moderacion',{method:'POST',headers:{origin:'https://attacker.invalid'},body:JSON.stringify(body)}))).status).toBe(403);
 expect(calls).toBe(0);
 const r=await route.POST(new Request('https://example.test/api/admin/moderacion',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify(body)}));
 expect(r.status).toBe(409);expect(calls).toBe(1);expect(await r.json()).not.toHaveProperty('auditId');
});

test('@contract successful profile moderation invalidates public search only after the audited RPC',async()=>{
 const events:string[]=[];
 const route=load('src/app/api/admin/moderacion/route.ts',{
  '@/lib/moderation/admin':{privateHeaders:headers,moderationAccess:async()=>({db:{rpc:async()=>{events.push('audit');return {data:{ok:true},error:null};}}})},
  '@/lib/supabase/admin':{createAdminClient:()=>{throw Error('unused');}},'@/lib/rate-limit':{enforceRateLimit:()=>null},'next/cache':{revalidatePath:()=>{}},
  '@/lib/cache/professional-revision':{invalidateProfessionalCache:async()=>{events.push('invalidate');}}
 });
 const r=await route.POST(new Request('https://example.test/api/admin/moderacion',{method:'POST',headers:{origin:'https://example.test'},body:JSON.stringify({kind:'professional',id:'00000000-0000-4000-8000-000000000030',action:'restore',reason:'Reviewed and restored'})}));
 expect(r.status).toBe(200);expect(events).toEqual(['audit','invalidate']);
});

test('@contract moderation decisions and appeals require a signed-in account',async()=>{
 const route=load('src/app/api/moderation/decisions/route.ts',{'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})},rpc:()=>{throw Error('Must not retrieve decisions');}})}});
 for(const method of ['GET','POST'])expect((await route[method](new Request('https://example.test/api/moderation/decisions',{method}))).status).toBe(401);
});

test('@contract scanner rejects unclean responses, outages and insecure configuration without network leakage',async()=>{
 const source=ts.transpileModule(readFileSync('src/lib/moderation/files.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const box={exports:{} as {scanUpload:(b:Uint8Array)=>Promise<void>}};let requests=0;
 const env:Record<string,string>={FILE_SCAN_URL:'https://private-scanner.invalid/scan',FILE_SCAN_SECRET:'synthetic-test-secret'};
 let clean=false;
 runInNewContext(source,{exports:box.exports,module:box,URL,Uint8Array,AbortSignal,process:{env},fetch:async()=>{requests++;return Response.json({clean});}});
 await assert.rejects(box.exports.scanUpload(new Uint8Array([1])),/no superó/);
 clean=true;await box.exports.scanUpload(new Uint8Array([1]));expect(requests).toBe(2);
 env.FILE_SCAN_URL='http://insecure.invalid';await assert.rejects(box.exports.scanUpload(new Uint8Array([1])),/no disponible/);expect(requests).toBe(2);
});

test('@contract staff scopes fail closed on denied permissions and database errors',async()=>{
 const source=ts.transpileModule(readFileSync('src/lib/moderation/admin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let allowed=false,failed=false;
 const box={exports:{} as {getModerationAdmin:()=>Promise<unknown>;getIdentityAdmin:()=>Promise<unknown>;getSupportAdmin:()=>Promise<unknown>}};
 const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{moderation:allowed,support:allowed,identity_review:allowed},error:failed?new Error('unavailable'):null})})})})};
 runInNewContext(source,{module:box,exports:box.exports,require:(name:string)=>name==='@/lib/auth/admin'?{getApiAdmin:async()=>({id:'admin'})}:name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:{},console});
 for(const key of ['getModerationAdmin','getIdentityAdmin','getSupportAdmin'] as const)expect(await box.exports[key]()).toBeNull();
 allowed=true;expect(await box.exports.getModerationAdmin()).toEqual({id:'admin'});
 failed=true;expect(await box.exports.getModerationAdmin()).toBeNull();
});
test('@contract verification uploads never save a file or case after a scanner rejection',async()=>{
 let scans=0;
 const db={from:(table:string)=>{const q:Record<string,unknown>={};for(const method of ['select','eq','in','order','limit','gte'])q[method]=()=>q;
  q.maybeSingle=async()=>({data:table==='professionals'?{id:'qa',verification_status:'pending',is_verified:false,profiles:{cedula:'199999999',full_name:'Synthetic QA',email:'qa@example.test'}}:null,error:null});
  q.upsert=q.update=q.insert=()=>{throw Error('No case or record may be written before a clean scan');};return q;},storage:{from:()=>{throw Error('No file may be uploaded before a clean scan');}}};
 const route=load('src/app/api/verification/documents/route.ts',{
  '@/lib/verification/review-scope':{identityReviewBoundary:async()=>null},'@/lib/verification/review-eligibility':{canRequestIdentityReview:()=>true},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'qa',email:'qa@example.test'}}})}})},'@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/rate-limit':{enforceRateLimit:()=>null},'@/lib/cedula':{cleanId:(v:string)=>v,detectIdType:()=> 'fisica'},'@/lib/upload-validation':{DOC_KINDS:[],IMAGE_KINDS:['png'],MIME_FOR:{png:'image/png'},validateUpload:()=>({ok:true,kind:'png'})},
  '@/lib/support/adjuntos':{BUCKET_SOPORTE:'support-attachments'},'@/lib/verification/documents':{documentCaseId:()=> 'case'},'@/lib/moderation/files':{scanUpload:async()=>{scans++;throw Error('Scanner rejected file');}}
 },{File,Buffer});
 const form=new FormData();form.set('identity',new File([new Uint8Array([1,2,3])],'synthetic.png',{type:'image/png'}));
 const response=await route.POST(new Request('https://example.test/api/verification/documents',{method:'POST',body:form}));
 expect(response.status).toBe(503);expect(scans).toBe(1);expect(await response.json()).not.toHaveProperty('ticketId');
});
test('@contract operational health distinguishes an unavailable source from a verified zero without exposing records',async()=>{
 const queried:string[]=[];
 const db={from:(table:string)=>{queried.push(table);const q:Record<string,unknown>={};for(const method of ['select','eq','in','lt','gte','or'])q[method]=()=>q;
  q.then=(resolve:(v:unknown)=>void)=>Promise.resolve(table==='client_errors'?{count:null,error:{message:'Internal secret must not escape'}}:{count:0,error:null,data:[{private:'must not escape'}]}).then(resolve);return q;}};
 const route=load('src/app/api/admin/salud/route.ts',{'@/lib/auth/admin':{getApiAdmin:async()=>({id:'admin'})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/moderation/admin':{privateHeaders:headers}});
 const r=await route.GET(new Request('https://example.test/api/admin/salud'));const data=await r.json();
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');
 expect(data.rows.find((row:{key:string})=>row.key==='errors')).toMatchObject({count:null,error:true});
 expect(data.rows.find((row:{key:string})=>row.key==='push_failed')).toMatchObject({count:0,error:false});
 expect(data.scannerConfigured).toBe(false);expect(queried).toContain('moderation_retention_state');expect(JSON.stringify(data)).not.toMatch(/must not escape|Internal secret/);
});
