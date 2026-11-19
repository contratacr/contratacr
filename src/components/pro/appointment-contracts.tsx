'use client';

import {crWallStamp} from '@/lib/pro/cr-stamp';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {CONTRACT_DECLINE_MAX,clientContractResultSchema,clientContractsSchema,contractMoney,contractPercent,shortHash,type ClientContract,type ContractClientMutation} from '@/lib/pro/contracts';
import {card,contractsApi,field,label,postContract} from './contract-clauses';

function copy(en:boolean){
 return en?{title:'Contracts',intro:'Read each contract your professional shared. You can accept it by typing your name or decline it with a reason.',
  legal:'Accepting here records that you, signed in to your account, agreed to this exact version, with your typed name and the date and time. It is not a certified digital signature and it is not legal advice; if you have doubts, consult a lawyer before accepting.',
  status:{shared:'Awaiting your answer',accepted:'Accepted',declined:'Declined',voided:'Voided by the professional'},version:(n:number)=>`Version ${n}`,fingerprint:'Fingerprint',
  company:'Company',project:'Project',estimate:'Quote',deposit:'Deposit',read:'I have read the whole contract.',typed:'Type your full name',accept:'Accept contract',accepting:'Saving…',decline:'Decline',declineReason:'Why are you declining it?',sendDecline:'Send decline',cancel:'Cancel',
  nameRequired:'Type your full name (at least 2 characters).',readRequired:'Confirm that you read the whole contract.',reasonRequired:'Write the reason.',
  accepted:(n:string,at:string)=>`You accepted it as ${n} on ${at} (Costa Rica time).`,declined:(at:string)=>`You declined it on ${at} (Costa Rica time).`,reason:'Reason',
  conflict:'The professional changed this contract. It was reloaded; please read it again.',uncertain:'We could not confirm your answer. Retry; it will not be recorded twice.',retry:'Retry',failed:'Could not save your answer.',
  print:'Print or PDF',loading:'Loading contracts…',loadError:'Could not load the contracts.',saved:'Your answer was saved.'}
 :{title:'Contratos',intro:'Lea cada contrato que su profesional compartió. Puede aceptarlo escribiendo su nombre o rechazarlo indicando el motivo.',
  legal:'Al aceptar aquí queda constancia de que usted, con la sesión iniciada en su cuenta, aceptó esta versión exacta, con su nombre escrito y la fecha y hora. No es una firma digital certificada ni asesoría legal; si tiene dudas, consulte a un abogado antes de aceptar.',
  status:{shared:'En espera de su respuesta',accepted:'Aceptado',declined:'Rechazado',voided:'Anulado por el profesional'},version:(n:number)=>`Versión ${n}`,fingerprint:'Huella',
  company:'Empresa',project:'Proyecto',estimate:'Cotización',deposit:'Anticipo',read:'Leí el contrato completo.',typed:'Escriba su nombre completo',accept:'Aceptar contrato',accepting:'Guardando…',decline:'Rechazar',declineReason:'¿Por qué lo rechaza?',sendDecline:'Enviar rechazo',cancel:'Cancelar',
  nameRequired:'Escriba su nombre completo (al menos 2 caracteres).',readRequired:'Confirme que leyó el contrato completo.',reasonRequired:'Escriba el motivo.',
  accepted:(n:string,at:string)=>`Usted lo aceptó como ${n} el ${at} (hora de Costa Rica).`,declined:(at:string)=>`Usted lo rechazó el ${at} (hora de Costa Rica).`,reason:'Motivo',
  conflict:'El profesional cambió este contrato. Se recargó; léalo de nuevo, por favor.',uncertain:'No pudimos confirmar su respuesta. Reintente; no se registrará dos veces.',retry:'Reintentar',failed:'No se pudo guardar su respuesta.',
  print:'Imprimir o PDF',loading:'Cargando contratos…',loadError:'No se pudieron cargar los contratos.',saved:'Su respuesta quedó guardada.'};
}

/** Customer side (My projects): shown only when the Contracts section is on and something was shared. */
export function AppointmentContracts({requestId}:{requestId:string}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <ClientSession key={user.id+':'+requestId} accountId={user.id} requestId={requestId}/>;
}

function ClientSession({accountId,requestId}:{accountId:string;requestId:string}){
 const en=useLocale()==='en',c=copy(en);
 const [items,setItems]=useState<ClientContract[]|null>(null),[failed,setFailed]=useState(false);const sequence=useRef(0);
 const load=useCallback(async()=>{
  const n=++sequence.current;setFailed(false);
  try{
   const response=await fetch(contractsApi+'?'+new URLSearchParams({requestId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});
   if(response.status===404){if(n===sequence.current)setItems([]);return;}if(!response.ok)throw Error();
   const body=clientContractsSchema.parse(await response.json());if(n===sequence.current)setItems(body.visible?body.contracts:[]);
  }catch{if(n===sequence.current)setFailed(true);}
 },[accountId,requestId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0),counter=sequence;return()=>{clearTimeout(timer);counter.current++;};},[load]);
 if(failed)return <section data-client-contracts-error className={card} role="alert"><p className="text-sm text-red-700">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></section>;
 if(items===null||!items.length)return null;
 return <section data-client-contracts aria-labelledby={'client-contracts-'+requestId} className={card}>
  <h3 id={'client-contracts-'+requestId} className="text-lg font-bold text-[#162543]">{c.title}</h3>
  <p className="text-sm text-[#52627a]">{c.intro}</p>
  <p data-client-contracts-legal className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{c.legal}</p>
  <ul className="space-y-4">{items.map(item=><ClientContractCard key={item.id+':'+item.version} accountId={accountId} requestId={requestId} item={item} onConflict={()=>void load()} onSaved={next=>setItems(list=>list?.map(x=>x.id===next.id?next:x)??null)}/>)}</ul>
 </section>;
}

function ClientContractCard({accountId,requestId,item,onConflict,onSaved}:{accountId:string;requestId:string;item:ClientContract;onConflict:()=>void;onSaved:(item:ClientContract)=>void}){
 const en=useLocale()==='en',c=copy(en),id=useId(),k=item.content;
 const [name,setName]=useState(''),[read,setRead]=useState(false),[declining,setDeclining]=useState(false),[reason,setReason]=useState('');
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<ContractClientMutation|null>(null),lock=useRef(false);
 async function run(input:ContractClientMutation){
  if(lock.current)return;lock.current=true;pending.current=input;setSaving(true);setError('');
  try{
   const outcome=await postContract(accountId,input);
   if(outcome.kind==='uncertain'){setUncertain(true);setError(c.uncertain);return;}
   pending.current=null;setUncertain(false);
   if(outcome.kind==='conflict'){setError(c.conflict);onConflict();return;}
   if(outcome.kind==='rejected'){setError(c.failed);return;}
   setNotice(c.saved);onSaved(clientContractResultSchema.parse(outcome.body).contract);
  }catch{setError(c.failed);}finally{lock.current=false;setSaving(false);}
 }
 const base=()=>({actionId:crypto.randomUUID(),requestId,contractId:item.id,version:item.version,contentHash:item.contentHash});
 function accept(){const typed=name.trim();if(typed.length<2){setError(c.nameRequired);return;}if(!read){setError(c.readRequired);return;}void run({...base(),action:'accept',typedName:typed});}
 function decline(){const text=reason.trim();if(!text){setError(c.reasonRequired);return;}void run({...base(),action:'decline',reason:text});}
 const locked=saving||uncertain,r=item.response;
 return <li data-client-contract={item.code} className="min-w-0 space-y-3 rounded-xl border border-[#d7e1ea] p-3">
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><span className="font-bold text-[#008bb5]">{item.code}</span><span data-client-contract-status={item.status} className="rounded-full bg-[#eef2f6] px-3 py-1 text-xs font-bold text-[#162543]">{c.status[item.status]}</span></div>
  <h4 className="break-words text-base font-bold text-[#162543]">{k.title}</h4>
  <dl className="grid min-w-0 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
   {k.company.name&&<div><dt className="text-xs font-semibold text-[#52627a]">{c.company}</dt><dd className="break-words">{k.company.name}</dd></div>}
   {k.project.name&&<div><dt className="text-xs font-semibold text-[#52627a]">{c.project}</dt><dd className="break-words">{k.project.name}{k.project.address?' · '+k.project.address:''}</dd></div>}
   {k.estimate&&<div><dt className="text-xs font-semibold text-[#52627a]">{c.estimate}</dt><dd className="break-words">{k.estimate.code} · {contractMoney(k.estimate.totalCents,k.estimate.currency,en)}</dd></div>}
   {k.depositPercent!==null&&<div><dt className="text-xs font-semibold text-[#52627a]">{c.deposit}</dt><dd>{contractPercent(k.depositPercent,en)}</dd></div>}
  </dl>
  <div data-client-contract-text className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-[#f7f9fc] p-3" tabIndex={0} aria-label={k.title}>
   {k.clauses.map(clause=><div key={clause.position}><p className="font-semibold text-[#162543]">{clause.position}. {clause.title}</p><p className="whitespace-pre-wrap break-words text-sm text-[#162543]">{clause.body}</p></div>)}
  </div>
  <p className="break-words text-xs text-[#52627a]">{c.version(item.version)} · {c.fingerprint} <code title={item.contentHash}>{shortHash(item.contentHash)}…</code> · <a className="font-semibold text-[#00698c] underline" target="_blank" rel="noopener" href={'/api/pro/contract-print?'+new URLSearchParams({requestId,id:item.id,lang:en?'en':'es'})}>{c.print}</a></p>
  {item.status==='voided'&&item.voidReason&&<p className="text-sm text-red-800">{c.reason}: {item.voidReason}</p>}
  {r&&<p data-client-contract-response className={'text-sm '+(r.action==='accept'?'text-emerald-800':'text-amber-900')}>{r.action==='accept'?c.accepted(r.typedName??'',crWallStamp(r.atCostaRica,en)):c.declined(crWallStamp(r.atCostaRica,en))}{r.reason&&<span className="block">{c.reason}: {r.reason}</span>}</p>}
  {item.canRespond&&(declining
   ?<div className="space-y-2"><label className={label} htmlFor={id+'-reason'}>{c.declineReason}</label><textarea id={id+'-reason'} data-client-contract-field="reason" rows={3} maxLength={CONTRACT_DECLINE_MAX} className={field+' !mt-0'} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)}/>
     <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" disabled={locked} onClick={decline}>{c.sendDecline}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={locked} onClick={()=>{setDeclining(false);setError('');}}>{c.cancel}</Button></div></div>
   :<div className="space-y-2">
     <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#162543]"><input type="checkbox" data-client-contract-field="read" className="h-5 w-5" checked={read} disabled={locked} onChange={event=>setRead(event.target.checked)}/>{c.read}</label>
     <label className={label}>{c.typed}<input data-client-contract-field="name" autoComplete="name" className={field} value={name} maxLength={160} disabled={locked} onChange={event=>setName(event.target.value)}/></label>
     <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={locked} onClick={accept}>{saving?c.accepting:c.accept}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={locked} onClick={()=>{setDeclining(true);setError('');}}>{c.decline}</Button></div>
    </div>)}
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{uncertain&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{if(pending.current)void run(pending.current);}}>{c.retry}</Button>}</div>}
 </li>;
}
