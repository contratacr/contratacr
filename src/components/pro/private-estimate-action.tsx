'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {privateEstimateContextSchema} from '@/lib/pro/private-estimates';
import {currentProPath,navigatePro} from '@/lib/pro/navigation';

/** Only the independent Pro space offers the new draft flow. */
export function PrivateEstimateAction({actor,clientId,workId,disabled=false,label}:{actor:string;clientId:string;workId?:string;disabled?:boolean;label?:string}){
 const en=useLocale()==='en',path=usePathname(),[busy,setBusy]=useState(false),[error,setError]=useState(false),current=useRef({actor,clientId,workId,active:true}),mutex=useRef(false);
 useEffect(()=>{current.current={actor,clientId,workId,active:true};return()=>{current.current.active=false;};},[actor,clientId,workId]);
 const valid=()=>current.current.active&&current.current.actor===actor&&current.current.clientId===clientId&&current.current.workId===workId;
 async function prepare(){
  if(disabled||mutex.current||!valid())return;
  mutex.current=true;setBusy(true);setError(false);const origin=currentProPath();
  try{
   const response=await fetch('/api/pro/private-estimates?'+new URLSearchParams({view:'context',clientId,...workId?{sourceKind:'work',sourceId:workId}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
   if(!response.ok)throw Error();const context=privateEstimateContextSchema.parse(await response.json());
   if(!valid())return;if(context.client.id!==clientId||workId&&(context.source?.kind!=='work'||context.source.id!==workId))throw Error();
   navigatePro('quotes',{nuevaEstimacion:crypto.randomUUID(),cotizacionCliente:clientId,volverEstimacion:origin,...context.source?.kind==='work'?{origenEstimacion:'work',idOrigenEstimacion:context.source.id,huellaOrigenEstimacion:context.source.fingerprint}:{}});
  }catch{if(valid())setError(true);}finally{mutex.current=false;if(valid())setBusy(false);}
 }
 if(!/\/dashboard\/pro(?:\/trabajo\/[^/]+(?:\/[a-z]+)?)?$/.test(path??''))return null;
 return <div className="space-y-2"><Button type="button" variant="secondary" disabled={disabled||busy} onClick={()=>void prepare()}>{busy?(en?'Preparing quote…':'Preparando cotización…'):label?label:workId?(en?'Prepare quote':'Preparar cotización'):(en?'New quote':'Nueva cotización')}</Button>{error&&<p role="alert" className="text-sm text-red-700">{en?'Could not prepare the quote. Refresh the customer or job and try again.':'No se pudo preparar la cotización. Actualice el cliente o trabajo y reintente.'}</p>}</div>;
}
