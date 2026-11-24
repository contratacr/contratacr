'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {meetingLocationKinds,meetingTypesSchema,meetingVideoApps,type MeetingType} from '@/lib/pro/meeting-types';

/** Area E (calendar): meeting types (name, length, where it happens, video app, description) the owner reuses when scheduling. */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
type Draft={id:string;revision:number;name:string;minutes:string;locationKind:MeetingType['locationKind'];videoApp:MeetingType['videoApp'];description:string};
export function MeetingTypes(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,[types,setTypes]=useState<MeetingType[]|null>(null),[failed,setFailed]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const kinds:Record<string,string>={phone:t('Llamada telefónica','Phone call'),project_address:t('En la dirección del proyecto','At the project address'),video:t('Videollamada','Video call')};
 const apps:Record<string,string>={meet:'Google Meet',teams:'Microsoft Teams',zoom:'Zoom',other:t('Otra aplicación','Other app')};
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch('/api/pro/meeting-types',{cache:'no-store'});if(!r.ok)throw Error();setTypes(meetingTypesSchema.parse(await r.json()).types);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(body:Record<string,unknown>){
  setBusy(true);setError('');
  try{const r=await fetch('/api/pro/meeting-types',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(r.status===409){setError(t('Ya existe un tipo con ese nombre, el tipo cambió o llegó al límite de 20.','A type with that name already exists, the type changed or you reached the limit of 20.'));await load();return false;}
   if(!r.ok){setError(t('No se pudo guardar. Revise los datos.','Could not save. Check the details.'));return false;}
   await load();return true;
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Retry.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudieron cargar los tipos de reunión.','Could not load the meeting types.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!types)return <p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const minutes=Number(draft?.minutes),valid=!!draft&&draft.name.trim().length>0&&Number.isInteger(minutes)&&minutes>=5&&minutes<=480;
 return <section data-meeting-types className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5" aria-labelledby="meeting-types-title">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="meeting-types-title" className="font-bold">{t('Tipos de reunión','Meeting types')}</h3>
   {!draft&&<Button type="button" variant="secondary" className="min-h-11" data-meeting-type-new disabled={types.length>=20} onClick={()=>{setError('');setDraft({id:crypto.randomUUID(),revision:0,name:'',minutes:'30',locationKind:'video',videoApp:'meet',description:''});}}>{t('Nuevo tipo','New type')}</Button>}</div>
  <p className="text-sm text-[#52627a]">{t('Defina reuniones frecuentes (por ejemplo, visita inicial o revisión de avance) con su duración y dónde se realizan.','Define frequent meetings (for example, first visit or progress review) with their length and where they take place.')}</p>
  {error&&<p role="alert" className="text-sm text-[#8a2a1b]">{error}</p>}
  {draft&&<div data-meeting-type-form className="space-y-2 rounded-xl bg-[#f7fafc] p-3">
   <label className="block text-sm font-medium">{t('Nombre de la reunión','Meeting name')}<input data-meeting-type-field="name" maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} className={field}/></label>
   <div className="grid gap-2 sm:grid-cols-3">
    <label className="block text-sm font-medium">{t('Duración (minutos)','Length (minutes)')}<input data-meeting-type-field="minutes" inputMode="numeric" value={draft.minutes} onChange={e=>setDraft({...draft,minutes:e.target.value.replace(/\D/g,'').slice(0,3)})} className={field}/></label>
    <label className="block text-sm font-medium">{t('Lugar','Where')}<select data-meeting-type-field="kind" value={draft.locationKind} onChange={e=>{const k=e.target.value as Draft['locationKind'];setDraft({...draft,locationKind:k,videoApp:k==='video'?(draft.videoApp??'meet'):null});}} className={field}>{meetingLocationKinds.map(k=><option key={k} value={k}>{kinds[k]}</option>)}</select></label>
    {draft.locationKind==='video'&&<label className="block text-sm font-medium">{t('Aplicación de video','Video app')}<select data-meeting-type-field="app" value={draft.videoApp??'meet'} onChange={e=>setDraft({...draft,videoApp:e.target.value as MeetingType['videoApp']})} className={field}>{meetingVideoApps.map(a=><option key={a} value={a}>{apps[a]}</option>)}</select></label>}</div>
   <label className="block text-sm font-medium">{t('Descripción (opcional)','Description (optional)')}<textarea data-meeting-type-field="description" rows={2} maxLength={300} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} className={field+' py-2'}/></label>
   <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" data-meeting-type-save disabled={busy||!valid} onClick={()=>void send({action:'save',id:draft.id,revision:draft.revision,name:draft.name,minutes:Number(draft.minutes),locationKind:draft.locationKind,videoApp:draft.locationKind==='video'?draft.videoApp:null,description:draft.description}).then(ok=>{if(ok)setDraft(null);})}>{t('Guardar','Save')}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={()=>setDraft(null)}>{t('Cancelar','Cancel')}</Button></div>
  </div>}
  {!types.length&&!draft?<p data-meeting-types-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{t('Todavía no tiene tipos de reunión.','You have no meeting types yet.')}</p>
  :<ul className="space-y-2">{types.map(x=><li key={x.id} data-meeting-type={x.id} className="min-w-0 space-y-1 rounded-xl border border-[#d7e1ea] p-3 text-sm">
   <p className="break-words font-semibold">{x.name} <span className="font-normal text-[#52627a]">· {x.minutes} min</span></p>
   <p className="text-[#52627a]">{kinds[x.locationKind]}{x.videoApp?' · '+apps[x.videoApp]:''}</p>{x.description&&<p className="break-words">{x.description}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" className="min-h-11" data-meeting-type-edit disabled={busy||!!draft} onClick={()=>{setError('');setDraft({id:x.id,revision:x.revision,name:x.name,minutes:String(x.minutes),locationKind:x.locationKind,videoApp:x.videoApp,description:x.description});}}>{t('Editar','Edit')}</Button><Button type="button" size="sm" variant="ghost" className="min-h-11" data-meeting-type-delete disabled={busy||!!draft} onClick={()=>void send({action:'delete',id:x.id})}>{t('Eliminar','Delete')}</Button></div></li>)}</ul>}
 </section>;
}
