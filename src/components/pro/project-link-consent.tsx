'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/use-auth';
import {clientProjectPath,type ClientProjectLink,type ProjectLinkConsent} from '@/lib/pro/work-client-invitations';

const api='/api/pro/project-invitation';
/**
 * Round 1: after accepting an estimate shared by code, the customer may join the job that the
 * professional prepares from it. Explicit opt-in (checkbox + button); never automatic.
 */
export function ProjectLinkConsentPanel({publicationId}:{publicationId:string}){
 const en=useLocale()==='en',locale=en?'en':'es',{user}=useAuth();
 const [state,setState]=useState<ProjectLinkConsent|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const action=useRef<string|null>(null);
 const load=useCallback(async()=>{if(!user)return;try{const response=await fetch(api+'?'+new URLSearchParams({publicationId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':user.id}});if(response.ok)setState(await response.json() as ProjectLinkConsent);}catch{/* optional panel */}},[publicationId,user]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 if(!user||!state||!state.eligible)return null;
 async function join(){if(!user||busy||!checked)return;action.current??=crypto.randomUUID();setBusy(true);setError('');
  try{const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':user.id},body:JSON.stringify({action:'consent',actionId:action.current,publicationId})});
   if(response.status>=500||response.status===429){setError(en?'Could not confirm. Retry.':'No se pudo confirmar. Reintente.');return;}
   action.current=null;if(!response.ok){setError(en?'Could not join the job.':'No se pudo unir al proyecto.');return;}await load();
  }catch{setError(en?'Could not confirm. Retry.':'No se pudo confirmar. Reintente.');}finally{setBusy(false);}}
 return <section data-project-link-consent className="space-y-2 rounded-xl bg-[#f3f8fb] p-3">
  <h4 className="font-semibold">{en?'Follow the job':'Seguir el proyecto'}</h4>
  {state.requestId?<><p role="status" className="text-sm">{en?'You joined this job. Open it from your account.':'Ya se unió a este trabajo. Ábralo desde su cuenta.'}</p><Button type="button" onClick={()=>window.location.assign(clientProjectPath(locale,state.requestId!))}>{en?'Open the job':'Abrir el trabajo'}</Button></>
  :state.consented?<p role="status" className="text-sm">{en?`You agreed to join. When ${state.professionalName} creates the job from this quote, it will appear in My projects.`:`Usted aceptó unirse. Cuando ${state.professionalName} cree el trabajo a partir de esta cotización, aparecerá en Mis proyectos.`}</p>
  :<><p className="text-sm text-[#52627a]">{en?`Join the job of this quote to see what ${state.professionalName} shares with you: updates, contracts, files and idea boards. ${state.professionalName} will see your account name.`:`Únase al trabajo de esta cotización para ver lo que ${state.professionalName} le comparta: avances, contratos, archivos y tableros. ${state.professionalName} verá el nombre de su cuenta.`}</p>
   <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" data-project-link-consent-check className="h-5 w-5" checked={checked} onChange={event=>setChecked(event.target.checked)}/>{en?'I want to join this job with this account':'Quiero unirme a este trabajo con esta cuenta'}</label>
   <Button type="button" data-project-link-consent-join disabled={busy||!checked} onClick={()=>void join()}>{en?'Join the job':'Unirme al proyecto'}</Button></>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
/** Customer panel ("Mis proyectos"): jobs this account follows with a professional. */
export function ClientProjectLinks({onCount}:{onCount?:(count:number)=>void}={}){
 const en=useLocale()==='en',locale=en?'en':'es',{user}=useAuth();const [items,setItems]=useState<ClientProjectLink[]|null>(null);
 useEffect(()=>{if(!user)return;let alive=true;fetch(api,{cache:'no-store',headers:{'X-Pro-Expected-Actor':user.id}}).then(r=>r.ok?r.json():null).then((body:{items?:ClientProjectLink[]}|null)=>{if(alive&&Array.isArray(body?.items)){setItems(body.items);onCount?.(body.items.length);}}).catch(()=>{});return()=>{alive=false;};},[user,onCount]);
 return <section data-client-project-links className="mb-4 space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-[15px] font-bold text-[#162543]">{en?'Jobs with professionals':'Proyectos con profesionales'}</h3><Button type="button" variant="outline" data-client-project-join onClick={()=>window.location.assign((en?'/en':'')+'/dashboard/unirse-proyecto')}>{en?'I have an invitation code':'Tengo un código de invitación'}</Button></div>
  {items&&items.length===0&&<p className="text-sm text-[#68778d]">{en?'When a professional invites you to a job, it will appear here.':'Cuando un profesional lo invite a un trabajo, aparecerá aquí.'}</p>}
  {items?.map(item=><button key={item.requestId} type="button" data-client-project-link={item.requestId} onClick={()=>window.location.assign(clientProjectPath(locale,item.requestId))} className="block min-h-11 w-full rounded-xl border border-[#e5e7eb] px-4 py-3 text-left"><span className="block font-semibold text-[#162543] [overflow-wrap:anywhere]">{item.service}</span><span className="block text-[13px] text-[#68778d]">{item.professionalName}{item.cancelled?(en?' · Cancelled':' · Cancelado'):item.stage==='completed'?(en?' · Completed':' · Finalizado'):''}</span></button>)}
 </section>;
}
