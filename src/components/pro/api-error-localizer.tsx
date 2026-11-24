'use client';
import {useEffect} from 'react';
import {loadProApiErrorsEn,proApiErrorEn} from '@/lib/pro/api-error-en';

/** English interface only: rewrites the Spanish `error` text of failed /api/pro/* responses before any screen shows it. */
export function ProApiErrorLocalizer({locale}:{locale:string}){
 useEffect(()=>{
  if(locale!=='en'||typeof window==='undefined')return;
  const w=window as typeof window&{__proErrEn?:boolean};
  if(w.__proErrEn)return;w.__proErrEn=true;
  const original=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
   const response=await original(input,init);
   try{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(response.ok||!/\/api\/pro\//.test(url)||!(response.headers.get('content-type')||'').includes('json'))return response;
    const body=await response.clone().json() as Record<string,unknown>;
    if(!body||typeof body.error!=='string')return response;
    await loadProApiErrorsEn();
    const headers=new Headers(response.headers);headers.delete('content-length');
    return new Response(JSON.stringify({...body,error:proApiErrorEn(body.error)}),{status:response.status,statusText:response.statusText,headers});
   }catch{return response;}
  };
 },[locale]);
 return null;
}
