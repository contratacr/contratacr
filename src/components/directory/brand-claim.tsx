'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {CLAIM_DOCUMENT_KINDS} from '@/lib/directory/claim-schemas';
import {CLAIM_DOCUMENT_LABELS} from '@/lib/directory/moderation-schemas';
import {featureReasonText} from '@/lib/directory/place-features';

/**
 * LOCAL PRO ONLY (place features round, 2026-11-17): «¿Representa a esta marca?» on /marca/<slug>. Claiming a brand is
 * always reviewed by the ContrataCR team with documents (photos lose their EXIF/GPS data on the server; private bucket,
 * only staff can open them). The claim id is created once and reused for every upload and retry. Free; never changes
 * the order of branches or results.
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold disabled:opacity-60 ${ring}`;
const noSubscribe=()=>()=>{};
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
export function BrandClaim({slug,locale,loginHref,pending}:{slug:string;locale:string;loginHref:string|null;pending:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 const ids=useRef({claim:'',action:''}),fileRef=useRef<HTMLInputElement>(null),kindRef=useRef<HTMLSelectElement>(null),noteRef=useRef<HTMLTextAreaElement>(null);
 const [docs,setDocs]=useState<{kind:string;path:string;name:string}[]>([]),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const claimId=()=>ids.current.claim||(ids.current.claim=crypto.randomUUID());
 if(pending||done)return <section data-brand-claim="pending" className="rounded-2xl border border-[#d7e1ea] bg-[#F7FAFC] p-5 text-[#162543]">
  <p role="status">{t('Hay una solicitud en revisión para esta marca. El equipo de ContrataCR la revisará con los documentos.','A request for this brand is under review. The ContrataCR team will review it with the documents.')}</p></section>;
 const upload=async()=>{
  const file=fileRef.current?.files?.[0];if(!file){setError(t('Elija un archivo.','Choose a file.'));return;}
  setBusy(true);setError(null);
  try{
   const fd=new FormData();fd.set('claimId',claimId());fd.set('kind',kindRef.current?.value??'legal_personhood');fd.set('file',file);
   const r=await fetch(`/api/marca/${encodeURIComponent(slug)}/reclamo/documentos`,{method:'POST',body:fd});
   const j=await r.json().catch(()=>({})) as {path?:string;kind?:string;name?:string;reason?:string};
   if(!r.ok){setError(j.reason==='file_too_large'?t('El archivo supera 4 MB.','The file is larger than 4 MB.'):j.reason==='file_format'?t('Use JPG, PNG, WebP o PDF.','Use JPG, PNG, WebP or PDF.'):featureReasonText(j.reason,en));return;}
   setDocs(d=>d.some(x=>x.path===j.path)?d:[...d,{kind:String(j.kind),path:String(j.path),name:String(j.name)}]);if(fileRef.current)fileRef.current.value='';
  }catch{setError(featureReasonText('unavailable',en));}finally{setBusy(false);}
 };
 const submit=async()=>{
  if(!docs.length){setError(featureReasonText('claim_evidence',en));return;}
  setBusy(true);setError(null);ids.current.action||=crypto.randomUUID();
  try{
   const note=noteRef.current?.value.trim();
   const r=await fetch(`/api/marca/${encodeURIComponent(slug)}/reclamo`,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({actionId:ids.current.action,claimId:claimId(),documents:docs.map(d=>({kind:d.kind,path:d.path})),...(note?{note}:{})})});
   const j=await r.json().catch(()=>({})) as {reason?:string};
   if(!r.ok){setError(featureReasonText(j.reason,en));return;}
   setDone(true);
  }catch{setError(featureReasonText('unavailable',en));}finally{setBusy(false);}
 };
 return <section aria-labelledby="brand-claim" data-brand-claim="idle" data-ready={ready||undefined} className="space-y-3 rounded-2xl border border-[#d7e1ea] bg-[#F7FAFC] p-5 text-[#162543]">
  <h2 id="brand-claim" className="text-lg font-bold">{t('¿Representa a esta marca? Reclámela gratis','Do you represent this brand? Claim it for free')}</h2>
  <p className="text-sm text-slate-700">{t('Con la marca aprobada podrá mantener la información común de todas sus sucursales (sitio web y descripción). Cada sucursal se sigue reclamando por separado.','Once approved you can keep the information shared by all branches up to date (website and description). Each branch is still claimed separately.')}</p>
  {!loginHref?<>
   <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <label className="space-y-1 text-sm font-semibold">{t('Documento','Document')}
     <select ref={kindRef} className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE} defaultValue="legal_personhood">{CLAIM_DOCUMENT_KINDS.map(k=><option key={k} value={k}>{CLAIM_DOCUMENT_LABELS[k][en?1:0]}</option>)}</select></label>
    <label className="space-y-1 text-sm font-semibold">{t('Archivo (JPG, PNG, WebP o PDF, hasta 4 MB)','File (JPG, PNG, WebP or PDF, up to 4 MB)')}
     <input ref={fileRef} type="file" data-brand-claim-file accept="image/jpeg,image/png,image/webp,application/pdf" className="block min-h-11 w-full text-sm"/></label>
    <button type="button" data-brand-claim-upload className={`${btn} border border-[#162543] bg-white`} disabled={busy} onClick={upload}>{t('Subir','Upload')}</button>
   </div>
   {docs.length>0&&<ul className="space-y-1 text-sm" data-brand-claim-docs={docs.length}>{docs.map(d=><li key={d.path}>✓ {CLAIM_DOCUMENT_LABELS[d.kind as keyof typeof CLAIM_DOCUMENT_LABELS]?.[en?1:0]} · {d.name}</li>)}</ul>}
   <label className="block space-y-1 text-sm font-semibold">{t('Nota para el equipo (opcional)','Note for the team (optional)')}<textarea ref={noteRef} rows={2} maxLength={1000} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-base"/></label>
   {error&&<p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
   <button type="button" data-brand-claim-submit className={`${btn} bg-[#162543] text-white`} disabled={busy} onClick={submit}>{t('Enviar a revisión','Send for review')}</button>
  </>:<p><a className={`${btn} bg-[#162543] text-white`} href={loginHref}>{t('Inicie sesión para reclamar la marca','Sign in to claim the brand')}</a></p>}
 </section>;
}
