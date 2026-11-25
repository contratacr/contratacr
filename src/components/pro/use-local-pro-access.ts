'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {PRO_UI_ENABLED} from '@/lib/pro/enabled-client';
type Scope={userId:string|undefined;attempt:number};
type Result={scope:Scope;status:'checked';enabled:boolean}|{scope:Scope;status:'error'};
/** Development-only access probe. Network failure is not an authorization denial. */
export function useLocalProAccess(userId:string|undefined){
 const local=PRO_UI_ENABLED;
 const [attempt,setAttempt]=useState(0),[result,setResult]=useState<Result|null>(null);
 const scope=useMemo<Scope>(()=>({userId,attempt}),[userId,attempt]);
 const retry=useCallback(()=>setAttempt(value=>value+1),[]);
 useEffect(()=>{
  if(!local||!scope.userId)return;
  let active=true,settled=false,retried=false;const controller=new AbortController();
  const finish=(next:Result)=>{if(!active||settled)return;settled=true;clearTimeout(timer);setResult(next);};
  const timer=setTimeout(()=>{finish({scope,status:'error'});controller.abort();},8000);
  // A single 401 or failed probe under load (the server auth lookup times out) is not an authorization denial: try once more before deciding.
  const probe=():void=>{void Promise.resolve().then(()=>fetch('/api/pro/access',{cache:'no-store',signal:controller.signal})).then(async response=>{
   if(response.status===401&&!retried){retried=true;await new Promise(resolve=>setTimeout(resolve,800));if(active&&!settled)probe();return;}
   if([401,403,404].includes(response.status)){finish({scope,status:'checked',enabled:false});return;}
   if(!response.ok)throw Error('Access probe failed');
   const body:unknown=await response.json();
   if(!body||typeof body!=='object'||!('enabled'in body)||body.enabled!==true)throw Error('Invalid access response');
   finish({scope,status:'checked',enabled:true});
  }).catch(()=>finish({scope,status:'error'}));};
  probe();
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[local,scope]);
 const current=result?.scope===scope?result:null;
 return {ready:!local||current?.status==='checked',enabled:local&&current?.status==='checked'&&current.enabled,error:local&&current?.status==='error',retry};
}
