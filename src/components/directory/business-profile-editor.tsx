'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';

/**
 * Launch without Pro (2026-11-18): «Mi negocio › Contacto y horario». Owner/managers of a claimed place edit the
 * public phone, website, e-mail, address line and opening hours. Talks to /api/negocio/perfil (SQL
 * dir_owner_place_update: CAS by revision, idempotent actionId kept while the same change is retried).
 */
type Hours={weekday:number;opens:string;closes:string};
type Profile={placeId:string;slug:string;name:string;revision:number;phone:string|null;website:string|null;email:string|null;addressLine:string|null;hours:Hours[]};
type Day={closed:boolean;ranges:{opens:string;closes:string}[]};
const ORDER=[1,2,3,4,5,6,0];
const DAY_ES=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],DAY_EN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const field=`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543] ${ring}`;
const timeField=`min-h-11 w-[8.5rem] rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543] ${ring}`;
const primary=`inline-flex min-h-11 items-center rounded-full bg-[#162543] px-5 text-sm font-semibold text-white hover:bg-[#22355c] disabled:opacity-60 ${ring}`;
const secondary=`inline-flex min-h-11 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#162543] hover:border-[#009FD9] disabled:opacity-60 ${ring}`;
const toDays=(h:Hours[]):Record<number,Day>=>Object.fromEntries([0,1,2,3,4,5,6].map(d=>{const r=h.filter(x=>x.weekday===d).map(x=>({opens:x.opens,closes:x.closes}));return [d,{closed:r.length===0,ranges:r.length?r:[{opens:'08:00',closes:'17:00'}]}];}));

export function BusinessProfileEditor({locale,expectedActor,places,placeId}:{locale:string;expectedActor:string;places:{id:string;slug:string;name:string}[];placeId:string}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'';
 const [data,setData]=useState<Profile|null>(null),[contact,setContact]=useState({phone:'',website:'',email:'',addressLine:''}),[days,setDays]=useState<Record<number,Day>>(toDays([]));
 const [msg,setMsg]=useState<{ok:boolean;text:string;where:'contact'|'hours'|'load'}|null>(null),[busy,setBusy]=useState(false),[nonce,setNonce]=useState(0);
 const actions=useRef(new Map<string,{id:string;body:string}>());
 const headers=useCallback((json=false)=>({...(json?{'content-type':'application/json'}:{}),'x-pro-expected-actor':expectedActor}),[expectedActor]);
 useEffect(()=>{let alive=true;
  fetch(`/api/negocio/perfil?placeId=${placeId}`,{cache:'no-store',headers:headers()}).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{if(!alive)return;
   if(!ok){setMsg({ok:false,where:'load',text:t('No se pudo cargar su ficha. Recargue la página.','Could not load your page. Please reload.')});return;}
   const p=j as Profile;setData(p);setContact({phone:p.phone??'',website:p.website??'',email:p.email??'',addressLine:p.addressLine??''});setDays(toDays(p.hours));})
   .catch(()=>{if(alive)setMsg({ok:false,where:'load',text:t('No se pudo cargar su ficha. Recargue la página.','Could not load your page. Please reload.')});});
  return ()=>{alive=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[placeId,nonce,headers]);
 const save=async(where:'contact'|'hours',body:Record<string,unknown>)=>{
  if(!data)return;const k=JSON.stringify(body);let a=actions.current.get(where);if(!a||a.body!==k){a={id:crypto.randomUUID(),body:k};actions.current.set(where,a);}
  setBusy(true);setMsg(null);
  try{
   const r=await fetch('/api/negocio/perfil',{method:'POST',headers:headers(true),body:JSON.stringify({...body,actionId:a.id,placeId:data.placeId,revision:data.revision})});
   if(r.ok){const j=await r.json().catch(()=>null) as {revision?:number}|null;if(typeof j?.revision==='number')setData(d=>d?{...d,revision:j.revision!}:d);actions.current.delete(where);setMsg({ok:true,where,text:t('Guardado. Ya se ve en su ficha pública.','Saved. It already shows on your public page.')});return;}
   if(r.status===409){actions.current.delete(where);setNonce(n=>n+1);setMsg({ok:false,where,text:t('La ficha cambió mientras editaba. Cargamos la versión actual: revise y guarde de nuevo.','The page changed while you were editing. We loaded the current version: check it and save again.')});return;}
   setMsg({ok:false,where,text:r.status===400?(where==='hours'?t('Revise el horario: cada franja necesita apertura y cierre (HH:MM).','Check the hours: each range needs an opening and closing time (HH:MM).')
     :t('Revise los datos: teléfono de 8 dígitos, sitio web que empiece con https:// y un correo válido.','Check the details: an 8-digit phone, a website starting with https:// and a valid e-mail.'))
    :r.status===403?t('Solo el dueño o los administradores de este negocio pueden editarlo.','Only the owner or managers of this business can edit it.'):t('No se pudo guardar. Reintente.','Could not save. Please retry.')});
  }catch{setMsg({ok:false,where,text:t('No se pudo comprobar el guardado. Reintente: no se duplicará.','Could not confirm the save. Retry: it will not be duplicated.')});}finally{setBusy(false);}
 };
 const onContact=(e:FormEvent)=>{e.preventDefault();void save('contact',{action:'contact',place:{phone:contact.phone,website:contact.website,email:contact.email,addressLine:contact.addressLine}});};
 const onHours=(e:FormEvent)=>{e.preventDefault();
  const hours=ORDER.flatMap(d=>days[d]!.closed?[]:days[d]!.ranges.filter(r=>r.opens&&r.closes).map(r=>({weekday:d,opens:r.opens,closes:r.closes})));
  void save('hours',{action:'hours',hours});};
 const setDay=(d:number,next:Day)=>setDays(s=>({...s,[d]:next}));
 const note=(where:'contact'|'hours'|'load')=>msg&&msg.where===where?<p role={msg.ok?'status':'alert'} data-business-profile-msg={msg.ok?'ok':'error'} className={`text-sm font-semibold ${msg.ok?'text-emerald-800':'text-red-800'}`}>{msg.text}</p>:null;
 return <div className="space-y-6" data-business-profile={placeId}>
  {places.length>1&&<nav aria-label={t('Empresas','Companies')}><ul className="flex flex-wrap gap-2">{places.map(p=><li key={p.id}><a aria-current={p.id===placeId?'page':undefined} className={p.id===placeId?primary:secondary} href={`${prefix}/dashboard/negocio/perfil?lugar=${p.slug}`}>{p.name}</a></li>)}</ul></nav>}
  {note('load')}
  {!data?<p role="status">{t('Cargando…','Loading…')}</p>:<>
   <p className="text-sm text-[#52627a]"><a className="font-semibold text-[#162543] underline" href={`${prefix}/negocios/${data.slug}`}>{t('Ver ficha pública de ','Open the public page of ')}{data.name}</a></p>
   <section aria-labelledby="bp-contact" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="bp-contact" className="text-lg font-bold">{t('Contacto','Contact')}</h2>
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={onContact} data-business-contact-form>
     <label className="space-y-1 text-sm font-semibold">{t('Teléfono','Phone')}<input className={field} name="phone" inputMode="tel" autoComplete="tel" maxLength={30} value={contact.phone} onChange={e=>setContact(c=>({...c,phone:e.target.value}))} placeholder="2222 3333"/></label>
     <label className="space-y-1 text-sm font-semibold">{t('Correo del negocio','Business e-mail')}<input className={field} name="email" type="email" autoComplete="email" maxLength={254} value={contact.email} onChange={e=>setContact(c=>({...c,email:e.target.value}))}/></label>
     <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Sitio web','Website')}<input className={field} name="website" type="url" inputMode="url" maxLength={500} value={contact.website} onChange={e=>setContact(c=>({...c,website:e.target.value}))} placeholder="https://"/></label>
     <label className="space-y-1 text-sm font-semibold sm:col-span-2">{t('Dirección (señas)','Address (directions)')}<input className={field} name="addressLine" maxLength={300} value={contact.addressLine} onChange={e=>setContact(c=>({...c,addressLine:e.target.value}))}/></label>
     <p className="text-sm text-[#52627a] sm:col-span-2">{t('Deje un campo vacío para quitarlo de la ficha. El correo no se muestra en público: se usa para avisos y para confirmar reclamos.','Leave a field empty to remove it from the page. The e-mail is not shown publicly: it is used for notices and to confirm claims.')}</p>
     <div className="space-y-2 sm:col-span-2"><button className={primary} disabled={busy}>{t('Guardar contacto','Save contact')}</button>{note('contact')}</div>
    </form>
   </section>
   <section aria-labelledby="bp-hours" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 id="bp-hours" className="text-lg font-bold">{t('Horario','Opening hours')}</h2>
    <form className="space-y-3" onSubmit={onHours} data-business-hours-form>
     <ul className="divide-y divide-slate-100">{ORDER.map(d=>{const day=days[d]!,name=(en?DAY_EN:DAY_ES)[d]!;
      return <li key={d} data-business-day={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
       <div className="flex min-w-40 items-center justify-between gap-3 sm:block">
        <span className="font-semibold">{name}</span>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm sm:mt-1"><input type="checkbox" className="h-5 w-5" checked={day.closed} onChange={e=>setDay(d,{...day,closed:e.target.checked})}/>{t('Cerrado','Closed')}</label>
       </div>
       {!day.closed&&<div className="flex flex-1 flex-col gap-2">{day.ranges.map((r,i)=><div key={i} className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`o-${d}-${i}`}>{name} {t('abre','opens')}</label>
        <input id={`o-${d}-${i}`} type="time" className={timeField} value={r.opens} onChange={e=>setDay(d,{...day,ranges:day.ranges.map((x,j)=>j===i?{...x,opens:e.target.value}:x)})}/>
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`c-${d}-${i}`}>{name} {t('cierra','closes')}</label>
        <input id={`c-${d}-${i}`} type="time" className={timeField} value={r.closes} onChange={e=>setDay(d,{...day,ranges:day.ranges.map((x,j)=>j===i?{...x,closes:e.target.value}:x)})}/>
        </span>{day.ranges.length>1&&<button type="button" className={secondary} onClick={()=>setDay(d,{...day,ranges:day.ranges.filter((_,j)=>j!==i)})}>{t('Quitar','Remove')}</button>}
       </div>)}
        {day.ranges.length<4&&<button type="button" className={`${secondary} self-start`} onClick={()=>setDay(d,{...day,ranges:[...day.ranges,{opens:'13:00',closes:'17:00'}]})}>{t('Agregar franja','Add range')}</button>}
       </div>}
      </li>;})}</ul>
     <p className="text-sm text-[#52627a]">{t('Si cierra después de medianoche, ponga la hora de cierre tal cual (por ejemplo 18:00 – 02:00).','If you close after midnight, enter the closing time as is (for example 18:00 – 02:00).')}</p>
     <div className="space-y-2"><button className={primary} disabled={busy}>{t('Guardar horario','Save hours')}</button>{note('hours')}</div>
    </form>
   </section>
  </>}
 </div>;
}
