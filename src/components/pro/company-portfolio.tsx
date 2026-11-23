'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {rateBps,type PortfolioRead,type ProfileMetrics} from '@/lib/pro/portfolio';
import {PUBLIC_IMAGE_OPTIONS,prepareImageForUpload,uploadPhotoFormDataWithRetry} from '@/lib/client-image-upload';
import {getCategoryLabel} from '@/lib/data/categories';

/**
 * Row 68: (1) publish a finished job as a project of the public profile with photos picked from the job's own files and
 * the customer's consent recorded; (2) commercial metrics of the profile (views -> contacts -> requests -> won jobs).
 * Private photos go through the authorized reader and then the SAME public upload pipeline the gallery uses
 * (metadata stripping, scan, ownership); nothing private is ever exposed by URL.
 */
type JobFile={id:string;name:string;mimeType:string;ready?:boolean};
const api='/api/pro/company-portfolio',card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const crDay=(offset=0)=>{const d=new Date(Date.now()+offset*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
export function CompanyPortfolio(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,alive=useRef(true);
 const [data,setData]=useState<PortfolioRead|null>(null),[failed,setFailed]=useState(false),[metrics,setMetrics]=useState<ProfileMetrics|null>(null),[metricsFailed,setMetricsFailed]=useState(false),[days,setDays]=useState(30);
 const [workId,setWorkId]=useState<string|null>(null),[files,setFiles]=useState<JobFile[]|null>(null),[picked,setPicked]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState({profession:'',title:'',description:'',recipient:'',consentKind:'client_written',consentNote:'',consentOn:crDay()});
 const load=useCallback(async()=>{setFailed(false);try{const r=await fetch(api,{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as PortfolioRead;if(alive.current)setData(body);}catch{if(alive.current)setFailed(true);}},[]);
 const loadMetrics=useCallback(async(period:number)=>{setMetricsFailed(false);try{const r=await fetch(`${api}?view=metrics&from=${crDay(-(period-1))}&to=${crDay()}`,{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as ProfileMetrics;if(alive.current)setMetrics(body);}catch{if(alive.current)setMetricsFailed(true);}},[]);
 useEffect(()=>{alive.current=true;const timer=setTimeout(()=>{void load();void loadMetrics(30);},0);return()=>{alive.current=false;clearTimeout(timer);};},[load,loadMetrics]);
 async function open(id:string){
  setWorkId(id);setFiles(null);setPicked([]);setError('');setNotice('');
  const work=data?.works.find(w=>w.id===id);setForm(f=>({...f,profession:data?.professions[0]??'',title:work?.service??'',recipient:''}));
  try{const r=await fetch('/api/pro/work-files?workId='+encodeURIComponent(id),{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as {items:JobFile[]};setFiles(body.items.filter(f=>f.mimeType.startsWith('image/')&&f.ready!==false));}catch{setFiles([]);setError(t('No se pudieron cargar las fotos del trabajo.','Could not load the job photos.'));}
 }
 async function publish(){
  if(!workId||busy)return;setBusy(true);setError('');setNotice('');
  try{
   const urls:string[]=[];
   for(const fileId of picked){
    const download=await fetch('/api/pro/work-files?fileId='+encodeURIComponent(fileId),{cache:'no-store'});if(!download.ok)throw Error('download');
    const blob=await download.blob(),file=new File([blob],'foto.'+(blob.type==='image/png'?'png':'jpg'),{type:blob.type});
    const prepared=await prepareImageForUpload(file,PUBLIC_IMAGE_OPTIONS),fd=new FormData();fd.append('file',prepared);fd.append('type','portfolio');
    const up=await uploadPhotoFormDataWithRetry(fd);if(!up.ok||!up.data.url)throw Error('upload');urls.push(up.data.url);
   }
   const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','Origin':location.origin},body:JSON.stringify({action:'publish',id:crypto.randomUUID(),workId,profession:form.profession,title:form.title,description:form.description,recipient:form.recipient,photos:urls,consentKind:form.consentKind,consentNote:form.consentNote,consentOn:form.consentOn})});
   if(!r.ok){const body=await r.json().catch(()=>({})) as {error?:string};throw Error(body.error||'save');}
   setNotice(t('Proyecto publicado en su perfil.','Project published on your profile.'));setWorkId(null);await load();
  }catch(e){setError(e instanceof Error&&!['download','upload','save'].includes(e.message)?e.message:t('No se pudo publicar. Revise las fotos y reintente.','Could not publish. Check the photos and retry.'));}
  finally{setBusy(false);}
 }
 async function withdraw(id:string){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json',Origin:location.origin},body:JSON.stringify({action:'withdraw',id})});if(!r.ok)throw Error();setNotice(t('Proyecto retirado de su perfil.','Project removed from your profile.'));await load();}
  catch{setError(t('No se pudo retirar el proyecto.','Could not remove the project.'));}finally{setBusy(false);}
 }
 const consentLabel=(k:string)=>k==='client_written'?t('Autorización escrita del cliente','Written customer approval'):k==='client_verbal'?t('Autorización verbal del cliente','Verbal customer approval'):t('Sin datos identificables del cliente','No identifiable customer data');
 const p=metrics?.profile,l=metrics?.leads,maxViews=Math.max(1,...(metrics?.series??[]).map(s=>s.views));
 const pct=(v:number|null)=>v===null?'-':(v/100).toLocaleString(en?'en-US':'es-CR',{maximumFractionDigits:1})+' %';
 return <div data-company-portfolio className="min-w-0 space-y-4">
  <section data-profile-metrics aria-labelledby="pm-title" className={card}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="pm-title" className="font-bold">{t('Del perfil a los trabajos','From profile to jobs')}</h3>
    <label className="text-sm font-semibold">{t('Período','Period')}<select value={days} onChange={e=>{const n=Number(e.target.value);setDays(n);void loadMetrics(n);}} className="ml-2 min-h-11 rounded-xl border border-[#d7e1ea] bg-white px-2 text-sm font-normal"><option value={7}>{t('7 días','7 days')}</option><option value={30}>{t('30 días','30 days')}</option><option value={90}>{t('90 días','90 days')}</option></select></label></div>
   {metricsFailed?<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudieron cargar las métricas.','Could not load the metrics.')}</span><Button type="button" variant="secondary" onClick={()=>void loadMetrics(days)}>{t('Reintentar','Retry')}</Button></div>
   :!metrics?<p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>
   :!metrics.hasProfile?<p className="text-sm text-[#52627a]">{t('Todavía no tiene un perfil público, así que no hay visitas que medir.','You do not have a public profile yet, so there are no visits to measure.')}</p>
   :<>
    <ol data-metrics-funnel className="grid gap-2 sm:grid-cols-4">
     {[{k:'views',label:t('Visitas al perfil','Profile views'),v:p?.views??0,note:t(`${p?.visitors??0} visitantes distintos`,`${p?.visitors??0} distinct visitors`)},
       {k:'contacts',label:t('Contactos directos','Direct contacts'),v:(p?.whatsapp??0)+(p?.phone??0)+(p?.email??0),note:t(`WhatsApp ${p?.whatsapp??0}, llamadas ${p?.phone??0}, correo ${p?.email??0}`,`WhatsApp ${p?.whatsapp??0}, calls ${p?.phone??0}, email ${p?.email??0}`)},
       {k:'requests',label:t('Solicitudes','Requests'),v:l?.requests??0,note:t(`${pct(rateBps(l?.requests??0,p?.views??0))} de las visitas`,`${pct(rateBps(l?.requests??0,p?.views??0))} of views`)},
       {k:'won',label:t('Trabajos creados','Jobs created'),v:l?.won??0,note:t(`${pct(rateBps(l?.won??0,l?.requests??0))} de las solicitudes`,`${pct(rateBps(l?.won??0,l?.requests??0))} of requests`)}].map(c=><li key={c.k} data-metric={c.k} className="min-w-0 rounded-xl border border-[#d7e1ea] p-3"><div className="text-2xl font-bold text-[#162543]">{c.v}</div><div className="text-sm font-semibold">{c.label}</div><div className="break-words text-xs text-[#52627a]">{c.note}</div></li>)}
    </ol>
    <p data-metric-agreed className="text-sm text-[#52627a]">{t('Monto acordado en esos trabajos: ','Agreed amount in those jobs: ')}<strong>{proMoney((l?.agreedCents??0)/100,en)}</strong>. {t('Favoritos: ','Favorites: ')}{p?.favorites??0}. {t('Veces compartido: ','Times shared: ')}{p?.shares??0}.</p>
    <div role="img" aria-label={t('Visitas por día','Views per day')} className="flex h-16 items-end gap-px">{(metrics.series??[]).map(s=><div key={s.day} title={`${s.day}: ${s.views}`} className="min-w-px flex-1 bg-[#008bb5]" style={{height:Math.max(2,Math.round(s.views/maxViews*100))+'%'}}/>)}</div>
    <p className="text-xs text-[#52627a]">{t('Las visitas propias no se cuentan. Las solicitudes y los trabajos salen de su centro de solicitudes y de sus proyectos.','Your own visits are not counted. Requests and jobs come from your lead center and your projects.')}</p></>}
  </section>
  <section data-portfolio-publish aria-labelledby="pp-title" className={card}>
   <h3 id="pp-title" className="font-bold">{t('Publicar un trabajo terminado en su perfil','Publish a finished job on your profile')}</h3>
   <p className="text-sm text-[#52627a]">{t('Elija fotos de los archivos del trabajo. Se publican con los metadatos eliminados y solo con el consentimiento de su cliente, que queda registrado.','Pick photos from the job files. They are published with metadata removed and only with your customer\'s consent, which is kept on record.')}</p>
   {failed&&<div role="alert" data-portfolio-error className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el portafolio.','Could not load the portfolio.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
   {error&&<p role="alert" data-portfolio-feedback className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-portfolio-notice className="text-sm text-[#18794e]">{notice}</p>}
   {!data&&!failed&&<p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>}
   {data&&!data.hasProfile&&<p className="text-sm text-[#52627a]">{t('Cree primero su perfil público para poder publicar proyectos.','Create your public profile first to publish projects.')}</p>}
   {data&&data.hasProfile&&!data.works.length&&<p className="text-sm text-[#52627a]">{t('Cuando un proyecto quede en etapa Terminado, podrá publicarlo aquí.','When a project reaches the Completed stage, you can publish it here.')}</p>}
   {data&&data.hasProfile&&<ul className="divide-y divide-[#e6edf3]">{data.works.map(w=><li key={w.id} data-portfolio-work={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0"><div className="break-words text-sm font-semibold">{w.service}</div><div className="text-xs text-[#52627a]">{w.client}</div></div>
    {w.publicationId?<span className="rounded-lg bg-[#e8f6ee] px-2 py-0.5 text-xs font-semibold text-[#18794e]">{t('Publicado','Published')}</span>:<Button type="button" variant="secondary" disabled={busy} onClick={()=>void open(w.id)}>{t('Publicar en mi perfil','Publish on my profile')}</Button>}</li>)}</ul>}
   {workId&&data&&<form data-portfolio-form className="space-y-3 rounded-xl border border-[#d7e1ea] p-3" onSubmit={e=>{e.preventDefault();void publish();}}>
    <label className="block text-sm font-bold">{t('Profesión','Profession')}<select required value={form.profession} onChange={e=>setForm({...form,profession:e.target.value})} className={field}>{data.professions.map(id=><option key={id} value={id}>{getCategoryLabel(id,en?'en':'es')}</option>)}</select></label>
    <label className="block text-sm font-bold">{t('Título del proyecto','Project title')}<input required maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className={field}/></label>
    <label className="block text-sm font-bold">{t('Descripción breve (opcional)','Short description (optional)')}<textarea maxLength={600} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className={field+' min-h-24 py-2'}/></label>
    <label className="block text-sm font-bold">{t('Para quién (opcional, no use datos privados)','For whom (optional, no private data)')}<input maxLength={120} value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})} className={field}/></label>
    <fieldset className="min-w-0"><legend className="text-sm font-bold">{t('Fotos (hasta 5)','Photos (up to 5)')}</legend>
     {files===null?<p role="status" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>:!files.length?<p className="text-sm text-[#52627a]">{t('Este trabajo no tiene fotos en sus archivos. Súbalas primero en la pestaña Archivos del proyecto.','This job has no photos in its files. Upload them first in the project Files tab.')}</p>
     :<ul className="grid gap-1 sm:grid-cols-2">{files.map(f=><li key={f.id}><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(f.id)} disabled={!picked.includes(f.id)&&picked.length>=5} onChange={e=>setPicked(e.target.checked?[...picked,f.id]:picked.filter(x=>x!==f.id))}/><span className="min-w-0 break-words">{f.name}</span></label></li>)}</ul>}</fieldset>
    <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-bold">{t('Consentimiento del cliente','Customer consent')}</legend>
     <label className="block text-sm">{t('Tipo','Type')}<select value={form.consentKind} onChange={e=>setForm({...form,consentKind:e.target.value})} className={field}><option value="client_written">{consentLabel('client_written')}</option><option value="client_verbal">{consentLabel('client_verbal')}</option><option value="no_identifiable">{consentLabel('no_identifiable')}</option></select></label>
     {form.consentKind!=='no_identifiable'&&<label className="block text-sm">{t('Cómo y quién lo dio (por ejemplo, "WhatsApp del 12/11, Ana Mora")','How and who gave it (for example, "WhatsApp of 12/11, Ana Mora")')}<input required minLength={3} maxLength={300} value={form.consentNote} onChange={e=>setForm({...form,consentNote:e.target.value})} className={field}/></label>}
     <label className="block text-sm">{t('Fecha del consentimiento','Consent date')}<input type="date" required value={form.consentOn} max={crDay(1)} onChange={e=>setForm({...form,consentOn:e.target.value})} className={field}/></label></fieldset>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||!picked.length||!form.profession}>{busy?t('Publicando…','Publishing…'):t('Publicar','Publish')}</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setWorkId(null)}>{t('Cancelar','Cancel')}</Button></div></form>}
  </section>
  {data&&data.publications.length>0&&<section data-portfolio-history aria-labelledby="ph-title" className={card}><h3 id="ph-title" className="font-bold">{t('Proyectos publicados y consentimientos','Published projects and consents')}</h3>
   <ul className="divide-y divide-[#e6edf3]">{data.publications.map(x=><li key={x.id} data-portfolio-publication={x.id} data-status={x.status} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0 text-sm"><div className="break-words font-semibold">{x.title}</div><div className="break-words text-xs text-[#52627a]">{consentLabel(x.consentKind)}{x.consentNote?': '+x.consentNote:''} ({x.consentOn}) · {t(`${x.photoCount} fotos`,`${x.photoCount} photos`)}</div></div>
    {x.status==='published'?<Button type="button" variant="secondary" disabled={busy} onClick={()=>void withdraw(x.id)}>{t('Retirar del perfil','Remove from profile')}</Button>:<span className="text-xs text-[#52627a]">{t('Retirado','Removed')}</span>}</li>)}</ul></section>}
 </div>;
}
