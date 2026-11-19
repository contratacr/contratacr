// Pure and VM-only: never initializes Wrangler, connects to a server or clears a cache.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {usesLocalProNodeCache} from '../../src/lib/cache/local-pro-runtime.ts';
const local='http://127.0.0.1:54321';
assert.equal(usesLocalProNodeCache('development',local),true);
for(const nodeEnv of ['production','test',undefined,'Development'])assert.equal(usesLocalProNodeCache(nodeEnv,local),false);
for(const url of [undefined,'','invalid','https://project.supabase.co','https://127.0.0.1:54321','http://localhost:54321','http://[::1]:54321','http://127.0.0.1:54322','http://127.0.0.1:54321/','http://127.0.0.1:54321/path','http://127.0.0.1:54321?x=1','http://127.0.0.1:54321#hash','http://user:password@127.0.0.1:54321','http://127.0.0.1.example:54321','http://127.0.0.1:54321@evil.example',' '+local])assert.equal(usesLocalProNodeCache('development',url),false,url);
function load(file,nodeEnv,supabaseUrl){
 const source=ts.transpileModule(readFileSync(new URL('../../src/lib/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let cloudflareImports=0,invalidations=0,builds=0,reads=0,writes=0;
 const exports={};vm.runInNewContext(source,{exports,URL,crypto,process:{env:{NODE_ENV:nodeEnv,NEXT_PUBLIC_SUPABASE_URL:supabaseUrl}},console,require(name){
  if(name==='@/lib/cache/local-pro-runtime')return {usesLocalProNodeCache};
  if(name==='server-only')return {};
  if(name==='react')return {cache:fn=>fn};
  if(name==='next/cache')return {unstable_cache:fn=>fn,revalidateTag:()=>{invalidations++;}};
  if(name==='./approved-catalog')return {buildApprovedCatalog:async()=>{builds++;return {categories:[],groups:[],categoryFlags:[]};}};
  if(name==='@/lib/promise-timeout')return {withPromiseTimeout:p=>p};
  if(name==='@opennextjs/cloudflare'){cloudflareImports++;return {getCloudflareContext:async()=>({env:{NEXT_INC_CACHE_R2_BUCKET:{get:async()=>{reads++;return null;},put:async()=>{writes++;return {};}}}})};}
  throw Error('Unexpected module '+name);
 }});
 return {api:exports,counts:()=>({cloudflareImports,invalidations,builds,reads,writes})};
}
const catalog=load('data/approved-catalog-cache.ts','development',local);await catalog.api.getApprovedCatalog();await catalog.api.refreshApprovedCatalog();assert.deepEqual(catalog.counts(),{cloudflareImports:0,invalidations:1,builds:2,reads:0,writes:0});
const revision=load('cache/professional-revision.ts','development',local);assert.equal(await revision.api.professionalRevision(),'node');await revision.api.invalidateProfessionalCache();assert.deepEqual(revision.counts(),{cloudflareImports:0,invalidations:1,builds:0,reads:0,writes:0});
for(const [environment,url] of [['production',local],['development','https://project.supabase.co'],['test',local]]){
 const remoteCatalog=load('data/approved-catalog-cache.ts',environment,url);await remoteCatalog.api.getApprovedCatalog();assert.equal(remoteCatalog.counts().cloudflareImports,1);assert.equal(remoteCatalog.counts().reads,1);assert.equal(remoteCatalog.counts().writes,1);
 const remoteRevision=load('cache/professional-revision.ts',environment,url);assert.equal(await remoteRevision.api.professionalRevision(),'initial');assert.equal(remoteRevision.counts().cloudflareImports,1);
}
console.log('PASS local Node cache: exact development loopback predicate, no Cloudflare imports for catalogue/revision reads or invalidation, existing Node fallback and nonlocal/production R2 path preserved.');
