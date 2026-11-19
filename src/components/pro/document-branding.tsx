'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {documentBrandingSchema,documentThemes,type DocumentBranding,type DocumentTheme} from '@/lib/pro/document-branding';

/**
 * Round 9: «Documentos con su marca». Theme (ContrataCR-style colours), company name and line for the
 * header, footer line and logo, applied to printed invoices, contracts, account statements, payment
 * plans, payment receipts and purchase orders (future prints only). Preview uses the same layout.
 */
type Draft={theme:DocumentTheme;displayName:string;tagline:string;footer:string;logo:'keep'|null|{base64:string;preview:string}};
export function DocumentBrandingSettings(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [saved,setSaved]=useState<DocumentBranding|null>(null),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[logoVersion,setLogoVersion]=useState(0),action=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/document-branding',{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);const b=documentBrandingSchema.parse(body);setSaved(b);setDraft({theme:b.theme,displayName:b.displayName,tagline:b.tagline,footer:b.footer,logo:'keep'});setError('');}catch{setError(t('No se pudo cargar la marca de sus documentos.','Your document branding could not be loaded.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function pick(file:File|undefined){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError(t('Use una imagen JPG, PNG o WebP de hasta 5 MB (se guarda como JPG de hasta 1 MB).','Use a JPG, PNG or WebP image up to 5 MB (stored as a JPG up to 1 MB).'));return;}
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
  setDraft(old=>old&&{...old,logo:{base64:data.replace(/^data:[^,]*,/,''),preview:data}});setError('');}
 async function save(){
  if(!draft||!saved)return;setBusy(true);setError('');setNotice('');
  const body={revision:saved.revision,theme:draft.theme,displayName:draft.displayName.trim(),tagline:draft.tagline.trim(),footer:draft.footer.trim(),logo:draft.logo&&typeof draft.logo==='object'?{base64:draft.logo.base64}:draft.logo};
  // Same content keeps the same action id: a retry after a lost answer never saves twice.
  const key=JSON.stringify(body);if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  try{const r=await fetch('/api/pro/document-branding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:action.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});action.current=null;const b=documentBrandingSchema.parse(data.branding);setSaved(b);setDraft({theme:b.theme,displayName:b.displayName,tagline:b.tagline,footer:b.footer,logo:'keep'});setLogoVersion(v=>v+1);setNotice(t('Marca guardada. Se usa en las próximas impresiones.','Branding saved. It is used in your next prints.'));}
  catch(e){setError((e as {status?:number}).status===409?t('La marca cambió en otra pestaña. Recargue antes de guardar.','The branding changed in another tab. Reload before saving.'):t('No se pudo guardar la marca. Intente de nuevo.','Could not save your branding. Try again.'));}
  finally{setBusy(false);}
 }
 if(!draft||!saved)return error?<p role="alert" className="text-sm text-red-700">{error} <Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>:<p role="status">{t('Cargando…','Loading…')}</p>;
 const theme=documentThemes[draft.theme],logoSrc=draft.logo&&typeof draft.logo==='object'?draft.logo.preview:draft.logo==='keep'&&saved.logo?'/api/pro/document-branding?logo=1&v='+logoVersion:null;
 const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
 const changed=JSON.stringify({...draft,logo:draft.logo==='keep'?'keep':draft.logo===null?null:'new'})!==JSON.stringify({theme:saved.theme,displayName:saved.displayName,tagline:saved.tagline,footer:saved.footer,logo:'keep'});
 return <section data-document-branding-settings className="min-w-0 space-y-5">
  <div className="grid min-w-0 gap-5 lg:grid-cols-2">
   <div className="min-w-0 space-y-4">
    <fieldset className="min-w-0"><legend className="text-sm font-semibold">{t('Color de sus documentos','Document color')}</legend><div className="mt-2 grid grid-cols-2 gap-2">{(Object.keys(documentThemes) as DocumentTheme[]).map(key=><label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${draft.theme===key?'border-[#162543] bg-white':'border-[#d7e1ea] bg-white'}`}><input type="radio" name="document-theme" value={key} checked={draft.theme===key} onChange={()=>setDraft({...draft,theme:key})} className="h-4 w-4"/><span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full" style={{background:documentThemes[key].accent}}/>{documentThemes[key][en?'en':'es']}</label>)}</div></fieldset>
    <label className="block text-sm font-semibold">{t('Nombre de la empresa en el encabezado','Company name in the header')}<input className={field} maxLength={120} value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label>
    <label className="block text-sm font-semibold">{t('Línea bajo el nombre (opcional)','Line under the name (optional)')}<input className={field} maxLength={160} value={draft.tagline} placeholder={t('Cédula jurídica, teléfono o lema','Company ID, phone or tagline')} onChange={e=>setDraft({...draft,tagline:e.target.value})}/></label>
    <label className="block text-sm font-semibold">{t('Pie de página (opcional)','Footer (optional)')}<textarea className={field+' min-h-20 py-2'} maxLength={300} value={draft.footer} onChange={e=>setDraft({...draft,footer:e.target.value})}/></label>
    <div className="flex flex-wrap items-center gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[#d7e1ea] bg-white px-4 text-sm font-semibold hover:bg-[#f3f8fb]">{t('Elegir logo','Choose logo')}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label={t('Elegir el logo de la empresa','Choose the company logo')} onChange={e=>{void pick(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>{logoSrc&&<Button type="button" variant="secondary" onClick={()=>setDraft({...draft,logo:null})}>{t('Quitar logo','Remove logo')}</Button>}</div>
   </div>
   <figure data-document-branding-preview className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm" aria-label={t('Vista previa','Preview')}>
    <figcaption className="mb-3 text-xs font-bold uppercase tracking-wide text-[#68778d]">{t('Vista previa del encabezado y el pie','Header and footer preview')}</figcaption>
    <div className="flex items-center justify-between gap-3 border-b-2 pb-2" style={{borderColor:theme.accent}}><span className="text-sm font-bold text-[#162543]">ContrataCR Pro</span><span className="text-xs font-semibold" style={{color:theme.accent}}>{t('Factura · Contrato · Estado de cuenta','Invoice · Contract · Statement')}</span></div>
    {(logoSrc||draft.displayName||draft.tagline)&&<div className="mt-3 flex items-center gap-3 rounded-xl p-3" style={{background:theme.soft,borderLeft:`4px solid ${theme.accent}`}}>{logoSrc&&(
     // eslint-disable-next-line @next/next/no-img-element -- private logo (API) or a local preview data URL
     <img src={logoSrc} alt={t('Logo de la empresa','Company logo')} className="max-h-14 max-w-[10rem] object-contain"/>)}<div className="min-w-0">{draft.displayName&&<strong className="block break-words text-[#162543]">{draft.displayName}</strong>}{draft.tagline&&<span className="block break-words text-sm text-[#52627a]">{draft.tagline}</span>}</div></div>}
    <div className="my-4 space-y-2" aria-hidden="true"><div className="h-2 w-3/4 rounded bg-[#eef2f6]"/><div className="h-2 w-1/2 rounded bg-[#eef2f6]"/><div className="h-2 w-2/3 rounded bg-[#eef2f6]"/></div>
    {draft.footer&&<p className="whitespace-pre-wrap break-words border-t-2 pt-2 text-xs text-[#52627a]" style={{borderColor:theme.accent}}>{draft.footer}</p>}
   </figure>
  </div>
  <p className="text-sm text-[#52627a]">{t('Se aplica a las próximas impresiones de facturas, contratos, estados de cuenta, planes de pagos, recibos y órdenes de compra, en español e inglés. Las copias ya impresas o compartidas no cambian.','Applies to your next prints of invoices, contracts, account statements, payment plans, receipts and purchase orders, in Spanish and English. Copies already printed or shared do not change.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#0f7a3d]">{notice}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy||!changed} onClick={()=>setDraft({theme:saved.theme,displayName:saved.displayName,tagline:saved.tagline,footer:saved.footer,logo:'keep'})}>{t('Descartar cambios','Discard changes')}</Button><Button type="button" data-pro-write="settings.write" disabled={busy||!changed} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar marca','Save branding')}</Button></div>
 </section>;
}
