import 'server-only';
import {randomUUID} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {PRODUCTION_FLAG,providerRegistry,type IntegrationMode,type IntegrationProvider,type ResolvedStatus} from './registry';
import {redact,redactTarget} from './redact';

/**
 * Round 6A: server side of the integration framework. Secrets come ONLY from process.env and are never
 * returned, logged or stored; the UI receives variable names and a present/absent flag.
 */
type Db=ReturnType<typeof createAdminClient>;
export const productionAllowed=()=>process.env[PRODUCTION_FLAG]==='1';
const present=(name:string)=>typeof process.env[name]==='string'&&process.env[name]!.trim().length>0;
export function envPresence(provider:IntegrationProvider){
 const env=providerRegistry[provider].env;
 return {sandbox:env.sandbox.map(name=>({name,present:present(name)})),production:env.production.map(name=>({name,present:present(name)})),optional:env.optional.map(name=>({name,present:present(name)})),productionFlag:productionAllowed()};
}
/** Secret values for a real (sandbox/production) adapter, or null when any required one is missing. */
export function providerSecrets(provider:IntegrationProvider,mode:Exclude<IntegrationMode,'mock'>):Record<string,string>|null{
 const names=providerRegistry[provider].env[mode];
 if(!names.every(present))return null;
 const out:Record<string,string>={};for(const name of [...names,...providerRegistry[provider].env.optional])if(present(name))out[name]=process.env[name]!.trim();
 return out;
}
/** Which adapter an operation may use right now. Production is never inferred: it must be stored AND allowed. */
export function resolveMode(provider:IntegrationProvider,stored:IntegrationMode|'disabled'):{mode:IntegrationMode;status:ResolvedStatus}{
 if(stored==='disabled')return {mode:'mock',status:'disabled'};
 if(stored==='production')return productionAllowed()&&providerSecrets(provider,'production')?{mode:'production',status:'ready'}:{mode:'production',status:productionAllowed()?'missing_keys':'production_refused'};
 if(stored==='sandbox')return providerSecrets(provider,'sandbox')?{mode:'sandbox',status:'ready'}:{mode:'sandbox',status:'missing_keys'};
 return {mode:'mock',status:'ready'};
}
export async function storedMode(db:Db,owner:string,provider:IntegrationProvider):Promise<IntegrationMode|'disabled'>{
 const result=await db.rpc('pro_integration_mode',{p_actor:owner,p_provider:provider});
 if(result.error)throw Error('integration mode');
 const value=String(result.data);return value==='sandbox'||value==='production'||value==='disabled'?value:'mock';
}
export type OutboundEntry={provider:IntegrationProvider;mode:IntegrationMode;operation:string;url:string;summary?:unknown;statusCode?:number|null;outcome:'ok'|'error'|'timeout'|'refused';durationMs:number;attempt?:number;correlation?:string};
/** Writes one redacted line of the outbound request log. Never throws (the log must not break the flow). */
export async function logOutbound(db:Db,owner:string,entry:OutboundEntry){
 try{await db.rpc('pro_integration_log',{p_actor:owner,p_entry:{provider:entry.provider,mode:entry.mode,operation:entry.operation.slice(0,60),target:redactTarget(entry.url),summary:redact(entry.summary??{}),statusCode:entry.statusCode??null,outcome:entry.outcome,durationMs:Math.max(0,Math.min(600000,Math.round(entry.durationMs))),attempt:entry.attempt??1,correlation:entry.correlation?.slice(0,80)??null}});}catch{/* best effort */}
}
/** fetch with a hard timeout; returns status 0 on network failure/timeout. Only real adapters call it. */
export async function timedFetch(url:string,init:RequestInit,timeoutMs=15000){
 const controller=new AbortController(),started=Date.now(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{const response=await fetch(url,{...init,signal:controller.signal,cache:'no-store',redirect:'error'});return {response,status:response.status,durationMs:Date.now()-started,timedOut:false};}
 catch{return {response:null,status:0,durationMs:Date.now()-started,timedOut:controller.signal.aborted};}
 finally{clearTimeout(timer);}
}
export const newActionId=()=>randomUUID();
