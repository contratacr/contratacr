'use client';
import {useEffect,useState} from 'react';
import {fetchProjectDefaultVat,type ProjectDefaultVat} from '@/lib/pro/project-default-vat';

/** Project default VAT for new draft lines of one job; null while loading, without details or on error. */
export function useProjectDefaultVat(workId:string|null,accountId?:string){
 const [state,setState]=useState<{workId:string;vat:ProjectDefaultVat|null}|null>(null);
 useEffect(()=>{
  if(!workId)return;const controller=new AbortController();
  void fetchProjectDefaultVat(workId,{accountId,signal:controller.signal}).then(vat=>{if(!controller.signal.aborted)setState({workId,vat});});
  return()=>controller.abort();
 },[workId,accountId]);
 return state&&state.workId===workId?state.vat:null;
}
