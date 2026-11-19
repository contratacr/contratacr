'use client';
import {useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {CheckCircle2} from 'lucide-react';
import {CabeceraDeTramite} from '@/components/layout/focused-header';
import {Button} from '@/components/ui/button';
import {useAuth} from '@/hooks/use-auth';
import {workInviteTokenSchema,type WorkInvitePreview} from '@/lib/pro/work-client-invitations';
import {forgetProjectInviteJoined,readProjectInviteJoined,rememberProjectInviteJoined,takeProjectInviteCode} from '@/lib/pro/project-invite-handoff';
import {endSentence} from '@/lib/text/sentence';
import {clientProjectPagePath} from '@/lib/pro/client-project-route';

const api='/api/pro/project-invitation';
function copy(en:boolean){
 return en?{title:'Join a job',intro:'A professional invited you to follow a job from your account.',codeLabel:'Invitation code',codeHelp:'Paste the code or open the link you received.',check:'Check invitation',checking:'Checking…',
  valid:(pro:string,service:string)=>`${pro} invites you to the job "${service}".`,expires:(date:string)=>endSentence(`The invitation expires ${date}`),
  shares:'If you join, this account will see what the professional shares with you for this job: customer view, updates, contracts, files and idea boards. The professional will see your account name as the linked customer. You can ask them to unlink you at any time.',
  consent:'I want to join this job with this account',join:'Join the job',joining:'Joining…',
  joined:'Done. The job is now in your account.',open:'Open the job',projects:'Go to My projects',
  states:{unknown:'The code is not valid. Check that you copied it completely.',expired:'This invitation expired. Ask the professional for a new one.',revoked:'This invitation was cancelled. Ask the professional for a new one.',used:'This invitation was already used. Ask the professional for a new one.',own:'This invitation is for one of your own jobs; send it to your customer.',unavailable:'This job is no longer available to join.',linked:'You already joined this job.'} as Record<string,string>,
  invalid:'The code is not valid. Check that you copied it completely.',failed:'Could not check the invitation. Retry.',back:'Back'}
 :{title:'Unirse a un proyecto',intro:'Un profesional lo invitó a seguir un trabajo desde su cuenta.',codeLabel:'Código de invitación',codeHelp:'Pegue el código o abra el enlace que recibió.',check:'Revisar invitación',checking:'Revisando…',
  valid:(pro:string,service:string)=>`${pro} lo invita al trabajo "${service}".`,expires:(date:string)=>endSentence(`La invitación vence el ${date}`),
  shares:'Si se une, esta cuenta verá lo que el profesional le comparta de este trabajo: vista del cliente, avances, contratos, archivos y tableros. El profesional verá el nombre de su cuenta como cliente vinculado. Puede pedirle que lo desvincule cuando quiera.',
  consent:'Quiero unirme a este trabajo con esta cuenta',join:'Unirme al proyecto',joining:'Uniéndose…',
  joined:'Listo. El trabajo ya está en su cuenta.',open:'Abrir el trabajo',projects:'Ir a Mis proyectos',
  states:{unknown:'El código no es válido. Revise que lo copió completo.',expired:'Esta invitación venció. Pida una nueva al profesional.',revoked:'Esta invitación fue anulada. Pida una nueva al profesional.',used:'Esta invitación ya se usó. Pida una nueva al profesional.',own:'Esta invitación es de un trabajo suyo; envíesela a su cliente.',unavailable:'Este trabajo ya no está disponible para unirse.',linked:'Usted ya se unió a este trabajo.'} as Record<string,string>,
  invalid:'El código no es válido. Revise que lo copió completo.',failed:'No se pudo revisar la invitación. Reintente.',back:'Volver'};
}
export function ProjectInvitationAccept(){
 const en=useLocale()==='en',c=copy(en),{user}=useAuth();
 const [code,setCode]=useState(''),[preview,setPreview]=useState<WorkInvitePreview|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[joined,setJoined]=useState<string|null>(null);
 const action=useRef<string|null>(null),captured=useRef<string|null>(null);
 async function post(body:object){const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(user?{'X-Pro-Expected-Actor':user.id}:{})},body:JSON.stringify(body)});return {response,body:await response.json().catch(()=>null) as Record<string,unknown>|null};}
 async function check(value:string){
  const token=value.trim();setError('');setPreview(null);setConsent(false);
  if(!workInviteTokenSchema.safeParse(token).success){setError(c.invalid);return;}
  setBusy(true);try{const {response,body}=await post({action:'preview',token});if(!response.ok){setError(typeof body?.error==='string'?body.error:c.failed);return;}action.current=null;setPreview(body as WorkInvitePreview);}catch{setError(c.failed);}finally{setBusy(false);}
 }
 useEffect(()=>{const fromLink=new URLSearchParams(window.location.hash.slice(1)).get('codigo');
  // A job joined in this tab survives a reload (Back/refresh): show the confirmation again, unless a new link arrived.
  const done=fromLink?null:readProjectInviteJoined();if(fromLink)forgetProjectInviteJoined();
  if(done!==null&&!captured.current){const timer=setTimeout(()=>setJoined(done),0);return()=>clearTimeout(timer);}
  const hash=captured.current??fromLink??takeProjectInviteCode();if(!hash)return;captured.current=hash;
  // Drop the code from the address bar right away (history, screenshots, shared screens).
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  const timer=setTimeout(()=>{setCode(hash);void check(hash);},0);return()=>clearTimeout(timer);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function join(){
  if(!preview||preview.state!=='valid'||!consent||busy)return;action.current??=crypto.randomUUID();setBusy(true);setError('');
  try{const {response,body}=await post({action:'accept',actionId:action.current,token:code.trim()});
   if(response.status>=500||response.status===429){setError(c.failed);return;}
   if(!response.ok){action.current=null;setError(typeof body?.error==='string'?body.error:c.failed);setPreview(null);return;}
   const requestId=String(body?.requestId??'');rememberProjectInviteJoined(requestId);setJoined(requestId);
  }catch{setError(c.failed);}finally{setBusy(false);}
 }
 const home=(en?'/en':'')+'/dashboard/profesional?tab=sent_projects&mode=use';
 return <div className="min-h-screen bg-[#f7f9fc] text-[#162543]"><CabeceraDeTramite title={c.title} backLabel={c.back} onBack={()=>window.location.assign(home)}/>
  <main data-project-invitation className="mx-auto max-w-2xl space-y-5 px-4 py-6"><h1 className="hidden text-2xl font-bold lg:block">{c.title}</h1><p className="text-sm text-[#52627a]">{c.intro}</p>
  {joined!==null?<section data-project-invitation-joined className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p role="status" className="flex items-start gap-2 font-semibold text-emerald-900"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"/><span>{c.joined}</span></p><div className="flex flex-wrap gap-2">{joined&&<Button type="button" data-project-invitation-open onClick={()=>{forgetProjectInviteJoined();window.location.assign((en?'/en':'')+clientProjectPagePath(joined));}}>{c.open}</Button>}<Button type="button" variant="outline" onClick={()=>{forgetProjectInviteJoined();window.location.assign(home);}}>{c.projects}</Button></div></section>
  :<>
  <form className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4" onSubmit={event=>{event.preventDefault();void check(code);}}>
   <label className="block text-sm font-semibold">{c.codeLabel}<input data-project-invitation-code autoComplete="off" spellCheck={false} value={code} maxLength={200} onChange={event=>{setCode(event.target.value);setPreview(null);setError('');}} className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 font-mono text-sm font-normal"/></label>
   <p className="text-sm text-[#52627a]">{c.codeHelp}</p>
   <Button type="submit" variant="outline" disabled={busy||!code.trim()}>{busy&&!preview?c.checking:c.check}</Button>
  </form>
  {preview&&preview.state==='valid'&&<section data-project-invitation-preview className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <p className="font-semibold">{c.valid(preview.professionalName??'',preview.service??'')}</p>
   {preview.expiresAt&&<p className="text-sm text-[#52627a]">{c.expires(new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(preview.expiresAt)))}</p>}
   <p className="text-sm">{c.shares}</p>
   <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" data-project-invitation-consent className="h-5 w-5" checked={consent} onChange={event=>setConsent(event.target.checked)}/>{c.consent}</label>
   <Button type="button" data-project-invitation-join disabled={busy||!consent} onClick={()=>void join()}>{busy?c.joining:c.join}</Button>
  </section>}
  {preview&&preview.state==='linked'&&<section className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><p role="status">{c.states.linked}</p>{preview.requestId&&<Button type="button" onClick={()=>window.location.assign((en?'/en':'')+clientProjectPagePath(preview.requestId!))}>{c.open}</Button>}</section>}
  {preview&&!['valid','linked'].includes(preview.state)&&<p role="alert" data-project-invitation-state={preview.state} className="text-sm text-red-700">{c.states[preview.state]??c.invalid}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </>}
  </main></div>;
}
