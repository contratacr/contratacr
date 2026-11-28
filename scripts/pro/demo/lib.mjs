// Pro demo seed (2026-11-28): shared guards and helpers. TEST or LOCAL LOOPBACK only, never production.
// The demo account is fictitious: demo-pro@contratacr.test, no phone, every contact uses example.com.
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

export const TEST_REF='oqheayqqprpciqdvdaqo';
export const PRODUCTION_REF='kskueodxaksxvjrysouw';
export const LOCAL_URL='http://127.0.0.1:54321';
export const DEMO_EMAIL='demo-pro@contratacr.test';
export const DEMO_NAME='Constructora Ejemplo Valle Central';
export const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const fail=message=>{console.error(`ABORTED: ${message}`);process.exit(2);};

/** Refuses anything but the test project (from the test branch in CI) or the local loopback stack (never in CI). */
export function guardedTarget(target){
 const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim(),key=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
 if(url.includes(PRODUCTION_REF)||key.includes(PRODUCTION_REF))fail('the target names the production project.');
 if(target==='test'){
  if(process.env.TARGET_ENV!=='test')fail('TARGET_ENV must be test.');
  if(process.env.GITHUB_ACTIONS&&process.env.GITHUB_REF!=='refs/heads/test')fail('run from the test branch.');
  let api;try{api=new URL(url);}catch{fail('invalid API URL.');}
  if(api.protocol!=='https:'||api.hostname.toLowerCase()!==`${TEST_REF}.supabase.co`||(api.pathname!=='/'&&api.pathname!==''))fail('the API URL is not the test project.');
  const parts=key.split('.');
  if(parts.length===3){let ref=null;try{ref=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).ref??null;}catch{/* opaque key */}
   if(ref&&ref!==TEST_REF)fail('the service key is not for the test project.');}
  return {target,url};
 }
 if(target==='local'){
  if(process.env.GITHUB_ACTIONS||process.env.CI)fail('local mode never runs in CI.');
  if(url!==LOCAL_URL)fail(`local mode only accepts ${LOCAL_URL}.`);
  return {target,url};
 }
 fail('target must be "test" or "local".');
}

export function adminClient(){
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),{auth:{autoRefreshToken:false,persistSession:false}});
}

/** Deterministic UUID for a demo key: reruns upsert the same rows. */
export function uuid(key){
 const h=crypto.createHash('sha256').update(`contratacr:pro-demo:v1:${key}`).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
/** Deterministic text id for workspace documents. */
export const tid=key=>`ejemplo-${key}`;

export async function must(label,promise){
 const {data,error}=await promise;
 if(error)throw new Error(`${label}: ${error.message}${error.details?` (${error.details})`:''}${error.hint?` [${error.hint}]`:''}`);
 return data;
}

/** Compiles TypeScript app modules (schemas and validators the API uses) in memory. */
export function appModules(source){
 const require=createRequire(import.meta.url);
 const {buildSync}=require('esbuild');
 const out=buildSync({stdin:{contents:source,resolveDir:ROOT,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',
  alias:{'server-only':`${ROOT}scripts/pro/demo/empty.cjs`},tsconfig:`${ROOT}tsconfig.json`,logLevel:'silent'});
 const mod={exports:{}};
 new Function('module','exports','require',out.outputFiles[0].text)(mod,mod.exports,require);
 return mod.exports;
}

/** Costa Rica wall time (UTC-6) for a date offset from the anchor day. */
export function crTime(anchor,dayOffset,hhmm){
 const base=new Date(`${anchor}T00:00:00-06:00`).getTime()+dayOffset*86400000;
 const day=new Date(base-6*3600000).toISOString().slice(0,10);
 return `${day}T${hhmm}:00-06:00`;
}
export function crDate(anchor,dayOffset){return crTime(anchor,dayOffset,'12:00').slice(0,10);}
