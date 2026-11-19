'use client';
import {readDirectQuoteWrite,saveDirectQuoteWrite,continueDirectQuoteWrite,clearDirectQuoteWrite,type DirectQuoteWrite} from '@/lib/pro/direct-quote-write-recovery';
import {recoverUnsentQuoteCollision} from '@/lib/pro/direct-quote-collision';
import {directProjectQuoteSchema,type DirectProjectQuoteInput} from '@/lib/pro/direct-project-quotes';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {manualLeadQuoteContextSchema} from '@/lib/pro/manual-lead-quotes';
import {emptyBusiness,businessSchema,type Business} from '@/lib/pro/business';
import {QuoteEditorModal,type BorradorDeCotizacion} from '@/components/quotes/quote-editor-modal';
import {proQuoteDraftKey,proQuoteDraftSchema,readProQuoteDraft,ProQuoteDraftRecoveryError,type ProQuoteDraft} from '@/lib/pro/quote-draft';
import type {Quote} from '@/lib/quotes';
import {Button} from '@/components/ui/button';
import {navigatePro} from '@/lib/pro/navigation';
import {ProModal as Modal} from '@/components/pro/modal';
type Props=Omit<Parameters<typeof QuoteEditorModal>[0],'proData'|'proRemote'|'restoredQuote'|'onProDraftChange'|'onProCreate'|'proCreationPending'>&{sourceRequestId?:string;sourceProjectId?:string;sourceManualLeadId?:string;sourceManualLeadRevision?:number};
type Ready={data:Business;draft:ProQuoteDraft|null;quote:Quote|null;seed:BorradorDeCotizacion|null};
export function QuoteEditorLoader(props:Props){
 const {user,loading}=useAuth(),t=useTranslations('ProEditorUX');
 if(loading||!user)return <Modal open onClose={props.onClose} title={t('title')} closeLabel={t('close')}><p role={loading?'status':'alert'}>{loading?t('loading'):t('sessionRequired')}</p></Modal>;
 return <QuoteEditorSession key={[user.id,props.sourceRequestId,props.sourceProjectId,props.sourceManualLeadId,props.sourceManualLeadRevision,props.initialProClientId].join(':')} {...props} accountId={user.id}/>;
}
function QuoteEditorSession({accountId,sourceRequestId,sourceProjectId,sourceManualLeadId,sourceManualLeadRevision,...props}:Props&{accountId:string}){
 const en=useLocale()==='en',t=useTranslations('ProEditorUX'),journey=useTranslations('ProJourney'),projectCopy=useTranslations('ProProjectJourney');
 const [ready,setReady]=useState<Ready|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[reset,setReset]=useState(0),[storageError,setStorageError]=useState(false);
 const attempt=useRef<DirectQuoteWrite|null>(null),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const ownedDraft=useRef<string|null>(null);
 const completed=useRef(false),key=proQuoteDraftKey(accountId);
 const [pendingCreate,setPendingCreate]=useState(false),[manualSourceHint,setManualSourceHint]=useState(!!sourceManualLeadId);
 useEffect(()=>{
  let alive=true;
  async function load(){
   setError(false);setReady(null);
   try{
    let durable:DirectQuoteWrite|null;
    try{durable=readDirectQuoteWrite(sessionStorage,accountId)??readDirectQuoteWrite(localStorage,accountId);}catch{if(attempt.current?.phase==='confirmed')durable=attempt.current;else{setPendingCreate(true);throw new ProQuoteDraftRecoveryError();}}
    if(attempt.current?.phase==='confirmed'&&(!durable||durable.body===attempt.current.body))durable=attempt.current;
    if(durable){
     attempt.current=durable;setPendingCreate(true);
     const input=directProjectQuoteSchema.parse(JSON.parse(durable.body));
     const ownership=sessionStorage.getItem(key+':direct-owner');
     if(ownership){const marker=JSON.parse(ownership);if(marker.body===durable.body&&marker.accountId===accountId&&typeof marker.rawDraft==='string')ownedDraft.current=marker.rawDraft;}
     const restored:ProQuoteDraft={version:1,savedAt:Date.now(),proClientId:input.proClientId??'',...(input.projectId?{sourceProjectId:input.projectId}:{}),...(input.sourceManualLeadId?{sourceManualLeadId:input.sourceManualLeadId,sourceManualLeadRevision:input.sourceManualLeadRevision}:{}),cedula:input.clientCedula??'',clientName:input.clientName??'',clientPhone:input.clientPhone??'',clientEmail:input.clientEmail??'',title:input.title??'',notes:input.notes??'',validDays:input.validDays,taxMode:input.taxMode,rows:input.items.map(row=>({description:row.description,quantity:String(row.quantity),unit_price:String(row.unit_price)}))};
     if(alive)setReady({data:emptyBusiness(),draft:restored,quote:null,seed:null});return;
    }
    const draft=readProQuoteDraft(accountId),clientId=draft?draft.proClientId:props.initialProClientId;
    setManualSourceHint(!!(sourceManualLeadId||draft?.sourceManualLeadId));setPendingCreate(!!draft?.requestPending&&!draft.createdQuoteId);
    if(sourceManualLeadId&&draft&&(draft.sourceManualLeadId!==sourceManualLeadId||draft.sourceManualLeadRevision!==sourceManualLeadRevision||draft.proClientId!==props.initialProClientId)){if(alive)setReady({data:emptyBusiness(),draft,quote:null,seed:null});return;}
    const requestSource=sourceRequestId??draft?.sourceRequestId,manualSource=sourceManualLeadId??draft?.sourceManualLeadId,manualRevision=sourceManualLeadRevision??draft?.sourceManualLeadRevision;
    let data=emptyBusiness(),quote:Quote|null=null,seed:BorradorDeCotizacion|null=null;
    let source:{clientId:string;service:string}|null=null;
    if(requestSource&&!draft?.requestPending&&!draft?.createdQuoteId){const response=await fetch('/api/pro/appointment-quote-context?'+new URLSearchParams({requestId:requestSource}),{cache:'no-store'}),body=await response.json();if(!response.ok||body.requestId!==requestSource||body.clientId!==(sourceRequestId?props.initialProClientId:clientId)||typeof body.service!=='string')throw Error();source=body;}
    if(sourceProjectId){const response=await fetch('/api/pro/project-quote-context?'+new URLSearchParams({projectId:sourceProjectId}),{cache:'no-store'}),body=await response.json();if(!response.ok||body.projectId!==sourceProjectId||body.clientId!==props.initialProClientId||typeof body.service!=='string')throw Error();source={clientId:body.clientId,service:body.service};}
    if(manualSource&&!draft?.createdQuoteId){const response=await fetch('/api/pro/manual-lead-quotes?'+new URLSearchParams({view:'context',leadId:manualSource}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=manualLeadQuoteContextSchema.parse(await response.json());if(body.source.leadId!==manualSource||body.source.clientId!==(sourceManualLeadId?props.initialProClientId:clientId)||manualRevision===undefined||!draft&&body.source.leadRevision!==manualRevision)throw Error();source={clientId:body.source.clientId,service:body.title};}
    if(clientId&&!draft?.requestPending&&!draft?.createdQuoteId){const response=await fetch('/api/pro/catalog?'+new URLSearchParams({kind:'clients',id:clientId,option:'1'}),{cache:'no-store'});const body=await response.json();if(!response.ok)throw Error();data=businessSchema.parse(body.document);}
    // Resolve the stored ID under current server authorization; never trust a stored quote object.
    if(draft?.createdQuoteId){const response=await fetch('/api/pro/quotes?'+new URLSearchParams({id:draft.createdQuoteId}),{cache:'no-store'});const body=await response.json();if(!response.ok||!body.quote)throw Error();quote=body.quote;}
    if(source&&!draft){const customer=data.clients.find(client=>client.id===source.clientId&&!client.archived);if(!customer)throw Error();seed={cedula:customer.identification??'',clientName:customer.name.slice(0,80),clientPhone:customer.phone,clientEmail:customer.email,title:source.service.slice(0,120),rows:[{description:source.service.slice(0,140),quantity:'1',unit_price:''}],taxMode:'incluido',notes:'',validDays:15};}
    if(alive){setPendingCreate(!!draft?.requestPending&&!quote);setReady({data,draft,quote,seed});}
   }catch(cause){if(alive){if(cause instanceof ProQuoteDraftRecoveryError)setPendingCreate(true);setError(true);}}
  }
  void load();return()=>{alive=false;};
 },[accountId,key,props.initialProClientId,sourceRequestId,sourceProjectId,sourceManualLeadId,sourceManualLeadRevision,retry,reset]);
 const restoredProjectId=ready?.draft?.sourceProjectId,restoredRequestId=ready?.draft?.sourceRequestId,restoredManualId=ready?.draft?.sourceManualLeadId,restoredManualRevision=ready?.draft?.sourceManualLeadRevision;
 const persist=useCallback((draft:BorradorDeCotizacion&{proClientId:string;createdQuoteId?:string;clientActionId?:string;requestPending?:boolean})=>{
  if(completed.current)return false;
  if(attempt.current)return true;
  try{
   const meaningful=!!(draft.proClientId||draft.createdQuoteId||draft.clientName||draft.clientPhone||draft.clientEmail||draft.cedula||draft.title||draft.notes||draft.rows.some(row=>row.description||row.unit_price));
   if(meaningful)sessionStorage.setItem(key,JSON.stringify(proQuoteDraftSchema.parse({...draft,...((sourceRequestId??restoredRequestId)?{sourceRequestId:sourceRequestId??restoredRequestId}:{}),...((sourceProjectId??restoredProjectId)?{sourceProjectId:sourceProjectId??restoredProjectId}:{}),...((sourceManualLeadId??restoredManualId)?{sourceManualLeadId:sourceManualLeadId??restoredManualId,sourceManualLeadRevision:sourceManualLeadRevision??restoredManualRevision}:{}),version:1,savedAt:Date.now()})));
   else sessionStorage.removeItem(key);
   setStorageError(false);setPendingCreate(!!draft.requestPending&&!draft.createdQuoteId);return true;
  }catch{setStorageError(true);return false;}
 },[key,sourceProjectId,restoredProjectId,sourceRequestId,restoredRequestId,sourceManualLeadId,sourceManualLeadRevision,restoredManualId,restoredManualRevision]);
 async function createDirect(input:DirectProjectQuoteInput){
  if(!live.current)throw Error('Account changed');
  const startedFresh=attempt.current===null;let requestStarted=false;
  let current=attempt.current;
  if(!current){const parsed=directProjectQuoteSchema.parse(input);current={version:1,accountId,body:JSON.stringify(parsed),phase:'ready',quoteId:null};ownedDraft.current=sessionStorage.getItem(key);const marker=JSON.stringify({accountId,body:current.body,rawDraft:ownedDraft.current});sessionStorage.setItem(key+':direct-owner',marker);if(sessionStorage.getItem(key+':direct-owner')!==marker)throw Error('Draft ownership was not retained');}
  let result;
  try{result=await continueDirectQuoteWrite({store:localStorage,attempt:current,request:(url,init)=>{if(init?.method==='POST')requestStarted=true;return fetch(url,init);},currentAccount:()=>live.current?accountId:undefined,onCheckpoint:value=>{attempt.current=value;if(live.current)setPendingCreate(true);saveDirectQuoteWrite(sessionStorage,value);}});}catch(error){
   const other=recoverUnsentQuoteCollision({error,startedFresh,requestStarted,globalStore:localStorage,tabStore:sessionStorage,accountId,ownerKey:key+':direct-owner'});
   if(other){ownedDraft.current=null;attempt.current=other;setPendingCreate(true);setRetry(value=>value+1);}
   throw error;
  }
  if(!live.current)throw Error('Account changed');
  if(result.status==='rejected'){clearDirectQuoteWrite(sessionStorage,result.attempt);sessionStorage.removeItem(key+':direct-owner');attempt.current=null;setPendingCreate(false);return null;}
  // Atomic creation has its own durable journal. Do not replace a separate
  // tab-local draft while recovering an attempt created in another tab.
  clearDirectQuoteWrite(localStorage,result.attempt);clearDirectQuoteWrite(sessionStorage,result.attempt);if(ownedDraft.current!==null&&sessionStorage.getItem(key)===ownedDraft.current)sessionStorage.removeItem(key);sessionStorage.removeItem(key+':direct-owner');attempt.current=null;completed.current=true;setPendingCreate(false);return result.quote;
 }
 function discard(){if(pendingCreate)return;try{sessionStorage.removeItem(key);}catch{setStorageError(true);return;}completed.current=false;setStorageError(false);setReady(null);setReset(value=>value+1);}
 if(!ready)return <Modal open onClose={props.onClose} title={t('title')} closeLabel={t('close')}><div className="space-y-3"><p role={error?'alert':'status'}>{error?t('loadError'):t('loading')}</p>{error&&<><Button onClick={()=>setRetry(value=>value+1)}>{t('retry')}</Button><Button variant="secondary" disabled={pendingCreate} onClick={discard}>{t('discard')}</Button><p className="text-xs text-[#68778d]">{t('discardNotice')}</p>{manualSourceHint&&<Button variant="secondary" disabled={pendingCreate} onClick={props.onClose}>{en?'Review lead':'Revisar solicitud'}</Button>}</>}</div></Modal>;
 if((sourceRequestId||sourceProjectId||sourceManualLeadId||props.initialProClientId)&&ready.draft&&(ready.draft.proClientId!==props.initialProClientId||ready.draft.sourceProjectId!==sourceProjectId||ready.draft.sourceRequestId!==sourceRequestId||ready.draft.sourceManualLeadId!==sourceManualLeadId||ready.draft.sourceManualLeadRevision!==sourceManualLeadRevision))return <Modal open onClose={props.onClose} title={t('title')} closeLabel={t('close')}><div className="space-y-3"><p className="font-semibold">{sourceManualLeadId||ready.draft.sourceManualLeadId?(en?'You have an unfinished quote to review.':'Tiene una cotización pendiente de revisar.'):sourceProjectId?projectCopy('draftConflict'):journey('draftConflict')}</p><p className="text-sm">{sourceManualLeadId||ready.draft.sourceManualLeadId?(en?'Your original form is preserved. Continue it or discard it; saved quotes stay unchanged.':'El formulario original se conserva. Puede continuarlo o descartarlo; las cotizaciones guardadas no cambian.'):journey('draftConflictHint')}</p><Button onClick={()=>navigatePro('quotes',{nueva:'1'})}>{journey('continueDraft')}</Button><Button variant="secondary" disabled={pendingCreate} onClick={discard}>{sourceProjectId?projectCopy('discardDraft'):journey('discardDraft')}</Button></div></Modal>;
 return <>
  <QuoteEditorModal key={reset} {...props} sourceRequestId={sourceRequestId??ready.draft?.sourceRequestId} sourceManualLeadId={sourceManualLeadId??ready.draft?.sourceManualLeadId} sourceManualLeadRevision={sourceManualLeadRevision??ready.draft?.sourceManualLeadRevision} initialClientActionId={ready.draft?.clientActionId} initialRequestPending={ready.draft?.requestPending} projectId={sourceProjectId??ready.draft?.sourceProjectId} clientName={(sourceProjectId||ready.draft?.sourceProjectId||sourceRequestId||ready.draft?.sourceRequestId||sourceManualLeadId||ready.draft?.sourceManualLeadId)?(ready.draft?.clientName??ready.seed?.clientName):props.clientName} proRemote proData={ready.data} initialProClientId={ready.draft?.proClientId??props.initialProClientId} inicial={ready.draft??ready.seed??props.inicial} restoredQuote={ready.quote} onProDraftChange={persist} onProCreate={!(sourceRequestId??ready.draft?.sourceRequestId)?createDirect:undefined} proCreationPending={!(sourceRequestId??ready.draft?.sourceRequestId)&&pendingCreate}
   proNotice={<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-[#eef8fc] px-3 py-1 text-xs text-[#162543]"><p className="min-w-0 flex-1" role={storageError?'alert':'status'}>{storageError?t('storageError'):ready.quote?t('linkPending'):ready.draft?t('restored'):t('savedLocally')}</p><button type="button" className="min-h-11 shrink-0 font-semibold text-[#0089bb] disabled:opacity-50" disabled={pendingCreate} onClick={discard}>{t('discard')}</button>{ready.quote&&<p className="w-full text-xs">{t('discardNotice')}</p>}{(sourceManualLeadId||ready.draft?.sourceManualLeadId)&&<Button type="button" variant="ghost" disabled={pendingCreate} onClick={props.onClose}>{en?'Review lead':'Revisar solicitud'}</Button>}</div>}
   onSent={quote=>{const atomicCompleted=completed.current;completed.current=true;try{if(!atomicCompleted)sessionStorage.removeItem(key);}catch{/* The completed form must not write again. */}props.onSent(quote);}}/>
 </>;
}
