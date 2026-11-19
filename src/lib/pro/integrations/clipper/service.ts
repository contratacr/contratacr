import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound,providerSecrets,resolveMode,storedMode} from '../server';
import {MockClipper,RemoteClipper,type ClipResult} from './adapters';
import {clipperSafeFetch} from './safe-fetch';

/** Round 6D: reads one product link with the adapter the current mode allows, logs it (redacted) and stores the clip. */
type Db=ReturnType<typeof createAdminClient>;
export async function readProductLink(db:Db,owner:string,url:string):Promise<{mode:'mock'|'sandbox'|'production';result:ClipResult}>{
 const resolved=resolveMode('product_clipper',await storedMode(db,owner,'product_clipper'));
 if(resolved.status!=='ready')return {mode:resolved.mode,result:{ok:false,reason:'network'}};
 const started=Date.now();let result:ClipResult;
 if(resolved.mode==='mock')result=await new MockClipper().read(url);
 else{
  const secrets=providerSecrets('product_clipper',resolved.mode);
  result=secrets?.PRO_CLIPPER_ENABLE_FETCH==='1'?await new RemoteClipper((url,init)=>clipperSafeFetch(url,init),8000,secrets.PRO_CLIPPER_USER_AGENT).read(url):{ok:false,reason:'network'};
 }
 await logOutbound(db,owner,{provider:'product_clipper',mode:resolved.mode,operation:'leer_pagina',url,statusCode:result.ok?200:null,outcome:result.ok?'ok':result.reason==='robots'?'refused':'error',durationMs:Date.now()-started,summary:result.ok?{source:result.metadata.source,simulated:result.metadata.simulated}:{reason:result.reason}});
 return {mode:resolved.mode,result};
}
