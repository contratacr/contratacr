'use client';
import {SELECT_CLASS,SELECT_STYLE} from './select-style';
import {useRef,useState} from 'react';
import {CLAIM_DOCUMENT_KINDS} from '@/lib/directory/claim-schemas';
import {CLAIM_DOCUMENT_LABELS} from '@/lib/directory/moderation-schemas';

/**
 * LOCAL PRO ONLY (multivertical M1): staff-reviewed ways to claim a place (inside «¿Es su negocio?»).
 * - Cédula jurídica: the server looks it up at Hacienda (mock adapter in this build) and checks that the legal name
 *   typed here matches the official one; the request then waits for the ContrataCR team.
 * - Documents: photos or PDF (up to 4 MB, at most 5). Photos lose their EXIF/GPS data on the server before being stored
 *   privately; only the ContrataCR team can open them. The request then waits for the team.
 * The claim id is created once in the browser and reused for every upload and retry of this request.
 */
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold disabled:opacity-60 ${ring}`;
const REASONS:Record<string,[string,string]>={
 cedula_invalid:['Escriba una cédula jurídica válida (10 dígitos, empieza con 3).','Enter a valid corporate ID (10 digits, starting with 3).'],
 hacienda_not_found:['Hacienda no tiene registrada esa cédula jurídica.','Hacienda has no record of that corporate ID.'],
 hacienda_mismatch:['El nombre legal no coincide con el registrado en Hacienda para esa cédula.','The legal name does not match the one registered at Hacienda for that ID.'],
 hacienda_not_juridica:['Esa identificación no es una cédula jurídica.','That ID is not a corporate ID.'],
 hacienda_unavailable:['Hacienda no responde en este momento. Intente más tarde o use documentos.','Hacienda is not responding right now. Try later or use documents.'],
 claim_pending:['Ya hay un reclamo en curso para este negocio.','A claim for this business is already in progress.'],
 place_already_claimed:['Este negocio ya tiene responsable.','This business already has a manager.'],
 claim_cap:['Alcanzó el máximo de reclamos por hoy. Intente mañana.','You reached the daily limit of claims. Please try tomorrow.'],
 file_format:['Use una foto JPG, PNG o WebP, o un PDF.','Use a JPG, PNG or WebP photo, or a PDF.'],
 file_too_large:['El archivo supera 4 MB.','The file is larger than 4 MB.'],
 file_metadata:['No pudimos limpiar los datos ocultos de la foto. Pruebe con otra foto o un PDF.','We could not clean the hidden data of the photo. Try another photo or a PDF.'],
 claim_upload_cap:['Alcanzó el máximo de documentos.','You reached the maximum number of documents.'],
 claim_evidence:['Adjunte al menos un documento válido.','Attach at least one valid document.'],
 unavailable:['No disponible en este momento. Intente de nuevo.','Not available right now. Please try again.'],
};
export function ClaimReviewed({slug,locale,afterCode=true}:{slug:string;locale:string;afterCode?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,msg=(r:unknown)=>(REASONS[String(r)]??REASONS.unavailable)![en?1:0];
 const ids=useRef({claim:'',action:''});
 const [done,setDone]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[docs,setDocs]=useState<{kind:string;path:string;name:string}[]>([]);
 const claimId=()=>{if(!ids.current.claim)ids.current.claim=crypto.randomUUID();return ids.current.claim;};
 const actionId=()=>{if(!ids.current.action)ids.current.action=crypto.randomUUID();return ids.current.action;};
 const open=async(body:Record<string,unknown>)=>{
  setBusy(true);setError(null);
  try{
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/reclamo`,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},body:JSON.stringify({actionId:actionId(),claimId:claimId(),...body})});
   const j=await r.json().catch(()=>({})) as {reason?:string;officialName?:string};
   if(r.ok){setDone(j.officialName??'');return;}
   if(r.status!==503)ids.current.action='';
   setError(msg(j.reason));
  }catch{setError(msg('unavailable'));}finally{setBusy(false);}
 };
 const upload=async(form:HTMLFormElement)=>{
  const f=new FormData(form),file=f.get('file');if(!(file instanceof File)||!file.size){setError(msg('claim_evidence'));return;}
  setBusy(true);setError(null);
  try{
   const body=new FormData();body.set('claimId',claimId());body.set('kind',String(f.get('kind')));body.set('file',file);
   const r=await fetch(`/api/lugar/${encodeURIComponent(slug)}/reclamo/documentos`,{method:'POST',body});
   const j=await r.json().catch(()=>({})) as {reason?:string;path?:string;kind?:string;name?:string};
   if(r.ok&&j.path){setDocs(d=>d.some(x=>x.path===j.path)?d:[...d,{kind:String(j.kind),path:j.path!,name:String(j.name)}]);form.reset();return;}
   setError(msg(j.reason));
  }catch{setError(msg('unavailable'));}finally{setBusy(false);}
 };
 if(done!==null)return <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900" data-claim-review-sent>
  {done?t(`Recibimos su solicitud. Hacienda registra la cédula a nombre de "${done}". El equipo de ContrataCR la revisará.`,`We received your request. Hacienda lists the ID under "${done}". The ContrataCR team will review it.`)
   :t('Recibimos su solicitud y sus documentos. El equipo de ContrataCR los revisará.','We received your request and documents. The ContrataCR team will review them.')}</p>;
 return <div className="space-y-2" data-claim-reviewed>
  <p className="text-sm font-semibold">{afterCode?t('¿No puede recibir el código? Otras formas de reclamar (las revisa nuestro equipo):','Cannot receive the code? Other ways to claim (reviewed by our team):')
   :t('Reclame con la cédula jurídica o con documentos (los revisa nuestro equipo):','Claim with the corporate ID or with documents (reviewed by our team):')}</p>
  <details className="rounded-xl border border-slate-200 bg-white p-3" data-claim-method="hacienda_juridica">
   <summary className={`cursor-pointer font-semibold ${ring}`}>{t('Con la cédula jurídica de la empresa','With the company corporate ID (cédula jurídica)')}</summary>
   <form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void open({method:'hacienda_juridica',cedula:String(f.get('cedula')??''),legalName:String(f.get('legalName')??'')});}} onChange={()=>{ids.current.action='';}}>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Cédula jurídica','Corporate ID')}<input name="cedula" required inputMode="numeric" autoComplete="off" placeholder="3-101-000000" maxLength={14} className={field}/></label>
    <label className="flex flex-col gap-1 text-sm font-medium">{t('Nombre legal, como aparece en Hacienda','Legal name, as registered at Hacienda')}<input name="legalName" required maxLength={300} autoComplete="organization" className={field}/></label>
    <button type="submit" disabled={busy} className={`${btn} bg-[#162543] text-white`}>{t('Consultar y enviar a revisión','Check and send for review')}</button>
   </form>
  </details>
  <details className="rounded-xl border border-slate-200 bg-white p-3" data-claim-method="document_review">
   <summary className={`cursor-pointer font-semibold ${ring}`}>{t('Con documentos (patente, permiso, recibo)','With documents (license, permit, bill)')}</summary>
   <div className="mt-3 space-y-3">
    <form className="space-y-3" onSubmit={e=>{e.preventDefault();void upload(e.currentTarget);}}>
     <label className="flex flex-col gap-1 text-sm font-medium">{t('Tipo de documento','Document type')}<select name="kind" aria-label={t('Tipo de documento','Document type')} className={`${field} ${SELECT_CLASS}`} style={SELECT_STYLE}>{CLAIM_DOCUMENT_KINDS.map(k=><option key={k} value={k}>{CLAIM_DOCUMENT_LABELS[k][en?1:0]}</option>)}</select></label>
     <label className="flex flex-col gap-1 text-sm font-medium">{t('Archivo (foto o PDF, máximo 4 MB)','File (photo or PDF, up to 4 MB)')}<input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="min-h-11 text-base"/></label>
     <button type="submit" disabled={busy||docs.length>=5} className={`${btn} border border-[#162543]`}>{t('Subir documento','Upload document')}</button>
    </form>
    {docs.length>0&&<ul className="space-y-1 text-sm" data-claim-docs={docs.length}>{docs.map(d=><li key={d.path}>✓ {CLAIM_DOCUMENT_LABELS[d.kind as keyof typeof CLAIM_DOCUMENT_LABELS]?.[en?1:0]} · {d.name}</li>)}</ul>}
    <p className="text-xs text-slate-600">{t('Las fotos se guardan sin datos de ubicación ni del teléfono. Solo el equipo de ContrataCR puede verlas.','Photos are stored without location or phone data. Only the ContrataCR team can see them.')}</p>
    <button type="button" disabled={busy||docs.length===0} onClick={()=>void open({method:'document_review',documents:docs.map(d=>({kind:d.kind,path:d.path}))})} className={`${btn} bg-[#162543] text-white`}>{t('Enviar documentos a revisión','Send documents for review')}</button>
   </div>
  </details>
  {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-claim-review-error>{error}</p>}
 </div>;
}
