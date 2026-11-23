'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {proMoney} from '@/lib/pro/money';
import {adBuildProvinces,type AdBuild,type AdBuildStatus,type AdBuilderOverview} from '@/lib/pro/ad-builder';

/**
 * Pro 29 (row 70): Company › Marketing › Ad builder. Plan an ad (segment, budget, dates, creative, tracking link),
 * send it to review and «publish» it in SANDBOX: nothing reaches Meta or Google and no money is spent. The metrics
 * shown are SIMULATED and labelled so; the real results stay in Marketing insights.
 */
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const crDay=(offset=0)=>new Date(Date.now()-6*3600000+offset*86400000).toISOString().slice(0,10);
const statusLabel:Record<AdBuildStatus,[string,string]>={draft:['Borrador','Draft'],review:['En revisión','In review'],sandbox_published:['Publicada en sandbox','Published in sandbox'],paused:['Pausada','Paused'],ended:['Finalizada','Ended']};
const blank={name:'',platform:'meta' as 'meta'|'google',objective:'leads' as 'leads'|'traffic'|'calls',province:'',canton:'',service:'',daily:'',total:'',startOn:crDay(1),endOn:crDay(30),headline:'',body:'',imageUrl:'',trackingCampaignId:''};
const toCents=(value:string)=>Math.round(Number(value.replace(/\s/g,'').replace(',','.'))*100);
export function CompanyAdBuilder(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<AdBuilderOverview|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [form,setForm]=useState(blank),[editing,setEditing]=useState<{id:string;revision:number}|null>(null),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const r=await fetch('/api/pro/company-ad-builder',{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as AdBuilderOverview;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(payload:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/company-ad-builder',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const body=await r.json().catch(()=>({})) as {reason?:string};setError(r.status===409?(body.reason==='not_active'?t('La publicación real de anuncios no está activa; solo existe el modo de prueba.','Real ad publishing is not active; only the test mode exists.'):t('La campaña cambió. Se recargó.','The campaign changed. It was reloaded.')):r.status===400?(body.reason==='no_days'?t('Todavía no hay días del plan que simular.','There are no plan days to simulate yet.'):t('Revise los campos: el creativo y el enlace de seguimiento son obligatorios para enviar a revisión.','Check the fields: the creative and the tracking link are required to submit for review.')):t('No se pudo completar. Reintente.','Could not complete it. Retry.'));await load();return false;}
   setNotice(done);await load();return true;
  }catch{setError(t('No se pudo completar. Reintente.','Could not complete it. Retry.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el constructor de campañas.','Could not load the campaign builder.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const money=(cents:number)=>proMoney(cents/100,en),daily=toCents(form.daily),total=toCents(form.total);
 const valid=form.name.trim().length>0&&daily>=100&&total>=daily&&form.endOn>=form.startOn;
 const act=(b:AdBuild,action:string,done:string)=>post({action,id:b.id,revision:b.revision},done);
 const save=()=>post({action:'save',id:editing?.id??crypto.randomUUID(),revision:editing?.revision??0,name:form.name,platform:form.platform,objective:form.objective,province:form.province,canton:form.canton,service:form.service,dailyBudgetCents:daily,totalBudgetCents:total,startOn:form.startOn,endOn:form.endOn,headline:form.headline,body:form.body,imageUrl:form.imageUrl,trackingCampaignId:form.trackingCampaignId},t('Borrador guardado.','Draft saved.')).then(ok=>{if(ok){setForm(blank);setEditing(null);}});
 const edit=(b:AdBuild)=>{setEditing({id:b.id,revision:b.revision});setForm({name:b.name,platform:b.platform,objective:b.objective,province:b.province,canton:b.canton,service:b.service,daily:String(b.dailyBudgetCents/100),total:String(b.totalBudgetCents/100),startOn:b.startOn,endOn:b.endOn,headline:b.headline,body:b.body,imageUrl:b.imageUrl??'',trackingCampaignId:b.trackingCampaignId??''});};
 return <div data-company-ad-builder className="min-w-0 space-y-4">{dialogNode}
  <p data-ad-builder-mode className="rounded-xl bg-[#fff6e5] p-3 text-sm text-[#8a5300]">{t('Modo de prueba: "publicar" solo registra la campaña en ContrataCR con una referencia ficticia. No se envía nada a Meta ni a Google y no se gasta dinero. Los resultados de abajo son simulados; los resultados reales están en Resultados de marketing.','Test mode: "publish" only records the campaign in ContrataCR with a fictitious reference. Nothing is sent to Meta or Google and no money is spent. The results below are simulated; the real results are in Marketing insights.')}</p>
  <section className={card} aria-labelledby="adb-form"><h3 id="adb-form" className="font-bold">{editing?t('Editar borrador','Edit draft'):t('Nueva campaña','New campaign')}</h3>
   <form data-ad-builder-form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();void save();}}>
    <label className="block text-sm font-medium sm:col-span-2">{t('Nombre','Name')}<input data-adb-field="name" required maxLength={120} className={field} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Plataforma','Platform')}<select data-adb-field="platform" className={field} value={form.platform} onChange={e=>setForm({...form,platform:e.target.value as 'meta'|'google'})}><option value="meta">Facebook / Instagram (Meta)</option><option value="google">Google Ads</option></select></label>
    <label className="block text-sm font-medium">{t('Objetivo','Objective')}<select data-adb-field="objective" className={field} value={form.objective} onChange={e=>setForm({...form,objective:e.target.value as 'leads'|'traffic'|'calls'})}><option value="leads">{t('Solicitudes','Requests')}</option><option value="traffic">{t('Visitas al sitio','Site visits')}</option><option value="calls">{t('Llamadas','Calls')}</option></select></label>
    <label className="block text-sm font-medium">{t('Provincia','Province')}<select data-adb-field="province" className={field} value={form.province} onChange={e=>setForm({...form,province:e.target.value})}><option value="">{t('Todo el país','Whole country')}</option>{adBuildProvinces.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
    <label className="block text-sm font-medium">{t('Cantón','Canton')}<input data-adb-field="canton" maxLength={60} className={field} value={form.canton} onChange={e=>setForm({...form,canton:e.target.value})}/></label>
    <label className="block text-sm font-medium sm:col-span-3">{t('Servicio que anuncia','Service advertised')}<input data-adb-field="service" maxLength={120} className={field} value={form.service} onChange={e=>setForm({...form,service:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Presupuesto diario ₡','Daily budget ₡')}<input data-adb-field="daily" inputMode="decimal" required className={field} value={form.daily} onChange={e=>setForm({...form,daily:e.target.value.slice(0,14)})}/></label>
    <label className="block text-sm font-medium">{t('Presupuesto total ₡','Total budget ₡')}<input data-adb-field="total" inputMode="decimal" required className={field} value={form.total} onChange={e=>setForm({...form,total:e.target.value.slice(0,14)})}/></label>
    <span className="hidden sm:block"/>
    <label className="block text-sm font-medium">{t('Inicio','Start')}<input type="date" data-adb-field="start" required className={field} value={form.startOn} onChange={e=>setForm({...form,startOn:e.target.value})}/></label>
    <label className="block text-sm font-medium">{t('Fin','End')}<input type="date" data-adb-field="end" required min={form.startOn} className={field} value={form.endOn} onChange={e=>setForm({...form,endOn:e.target.value})}/></label>
    <span className="hidden sm:block"/>
    <label className="block text-sm font-medium sm:col-span-3">{t('Titular (máx. 90)','Headline (max. 90)')}<input data-adb-field="headline" maxLength={90} className={field} value={form.headline} onChange={e=>setForm({...form,headline:e.target.value})}/></label>
    <label className="block text-sm font-medium sm:col-span-3">{t('Texto (máx. 500)','Text (max. 500)')}<textarea data-adb-field="body" maxLength={500} rows={3} className={field} value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></label>
    <label className="block text-sm font-medium sm:col-span-2">{t('Imagen (enlace https, opcional)','Image (https link, optional)')}<input data-adb-field="image" type="url" maxLength={500} className={field} value={form.imageUrl} onChange={e=>setForm({...form,imageUrl:e.target.value.trim()})}/></label>
    <label className="block text-sm font-medium">{t('Enlace de seguimiento','Tracking link')}<select data-adb-field="tracking" className={field} value={form.trackingCampaignId} onChange={e=>setForm({...form,trackingCampaignId:e.target.value})}><option value="">{t('Elija uno','Choose one')}</option>{data.campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {data.campaigns.length===0&&<p className="text-xs text-[#52627a] sm:col-span-3">{t('Cree un enlace de seguimiento en Resultados de marketing para medir esta campaña.','Create a tracking link in Marketing insights to measure this campaign.')}</p>}
    <div className="flex flex-wrap gap-2 sm:col-span-3"><Button type="submit" data-adb-save disabled={busy||!valid}>{editing?t('Guardar cambios','Save changes'):t('Guardar borrador','Save draft')}</Button>{editing&&<Button type="button" variant="ghost" onClick={()=>{setEditing(null);setForm(blank);}}>{t('Cancelar edición','Cancel editing')}</Button>}</div>
   </form>
   {notice&&<p role="status" data-adb-notice className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" data-adb-error className="text-sm text-red-700">{error}</p>}
  </section>
  <section className={card} aria-labelledby="adb-list"><h3 id="adb-list" className="font-bold">{t('Sus campañas','Your campaigns')}</h3>
   {data.builds.length?<ul className="space-y-3">{data.builds.map(b=>{const sim=b.simulated,live=['sandbox_published','paused','ended'].includes(b.status);return <li key={b.id} data-adb-build={b.name} data-adb-status={b.status} className="space-y-2 rounded-xl border border-[#e3eaf0] p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words"><strong>{b.name}</strong> · {b.platform==='meta'?'Meta':'Google Ads'} · <span data-adb-status-label>{en?statusLabel[b.status][1]:statusLabel[b.status][0]}</span></span>
     <span className="flex flex-wrap gap-2">
      {b.status==='draft'&&<><Button type="button" variant="secondary" disabled={busy} onClick={()=>edit(b)}>{t('Editar','Edit')}</Button><Button type="button" data-adb-submit disabled={busy} onClick={()=>void act(b,'submit',t('Enviada a revisión.','Submitted for review.'))}>{t('Enviar a revisión','Submit for review')}</Button></>}
      {b.status==='review'&&<><Button type="button" variant="secondary" disabled={busy} onClick={()=>void act(b,'back_to_draft',t('Vuelta a borrador.','Back to draft.'))}>{t('Volver a borrador','Back to draft')}</Button><Button type="button" data-adb-publish disabled={busy} onClick={()=>void (async()=>{if(await confirm({title:t('¿Publicar en sandbox?','Publish in sandbox?'),description:t('Solo se registra con una referencia ficticia. No se envía nada a ninguna plataforma ni se gasta dinero.','It is only recorded with a fictitious reference. Nothing is sent to any platform and no money is spent.'),confirmLabel:t('Publicar en sandbox','Publish in sandbox')}))await act(b,'publish_sandbox',t('Publicada en sandbox (referencia ficticia).','Published in sandbox (fictitious reference).'));})()}>{t('Publicar en sandbox','Publish in sandbox')}</Button></>}
      {b.status==='sandbox_published'&&<><Button type="button" variant="secondary" data-adb-simulate disabled={busy} onClick={()=>void act(b,'simulate',t('Métricas simuladas actualizadas.','Simulated metrics updated.'))}>{t('Simular resultados','Simulate results')}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>void act(b,'pause',t('Campaña pausada.','Campaign paused.'))}>{t('Pausar','Pause')}</Button></>}
      {b.status==='paused'&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void act(b,'resume',t('Campaña reanudada.','Campaign resumed.'))}>{t('Reanudar','Resume')}</Button>}
      {(b.status==='sandbox_published'||b.status==='paused')&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void (async()=>{if(await confirm({title:t('¿Finalizar la campaña?','End the campaign?'),description:t('No se puede reanudar después.','It cannot be resumed afterwards.'),confirmLabel:t('Finalizar','End')}))await act(b,'end',t('Campaña finalizada.','Campaign ended.'));})()}>{t('Finalizar','End')}</Button>}
     </span></div>
    <p className="text-xs text-[#52627a]">{b.startOn} – {b.endOn} · {t('diario','daily')} {money(b.dailyBudgetCents)} · {t('total','total')} {money(b.totalBudgetCents)}{b.province?` · ${b.province}${b.canton?', '+b.canton:''}`:''}{b.service?` · ${b.service}`:''}</p>
    {b.headline&&<p className="break-words"><strong>{b.headline}</strong> {b.body}</p>}
    {b.platformRef&&<p className="text-xs text-[#52627a]">{t('Referencia ficticia','Fictitious reference')}: <code data-adb-ref>{b.platformRef}</code></p>}
    {live&&<p data-adb-sim className="rounded-lg bg-[#f7fafc] p-2 text-xs text-[#52627a]"><span className="font-semibold text-[#8a5300]">{t('Simulado','Simulated')}</span> · {t('impresiones','impressions')} {sim?.impressions??0} · {t('clics','clicks')} {sim?.clicks??0} · {t('gasto','spend')} {money(sim?.spendCents??0)} · {t('Datos reales: vea Resultados de marketing.','Real data: see Marketing insights.')}</p>}
   </li>;})}</ul>:<p className="text-sm text-[#52627a]">{t('Todavía no tiene campañas.','You have no campaigns yet.')}</p>}
  </section>
 </div>;
}
