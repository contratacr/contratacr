'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {applyDocumentBranding,defaultDocumentTemplate,documentBrandingSchema,documentTemplateTypes,documentThemes,type DocumentBranding,type DocumentTemplate,type DocumentTemplateField,type DocumentTemplateType,type DocumentTheme} from '@/lib/pro/document-branding';
import {sampleInvoicePrintHtml,sampleQuotePrintHtml} from '@/lib/pro/document-template-preview';

/**
 * Round 9: «Documentos con su marca». Theme (ContrataCR-style colours), company name and line for the
 * header, footer line and logo, applied to printed invoices, contracts, account statements, payment
 * plans, payment receipts and purchase orders (future prints only). Preview uses the same layout.
 * Round F1-C (row 45): template options (layout, logo position, accent, paper, shown fields, default
 * terms/notes per document type) for every branded print, with a live preview of the real print
 * templates (sample quote and invoice) before saving. The defaults keep the prints as they were.
 */
type Draft={theme:DocumentTheme;displayName:string;tagline:string;footer:string;logo:'keep'|null|{base64:string;preview:string};template:DocumentTemplate};
const draftOf=(b:DocumentBranding):Draft=>({theme:b.theme,displayName:b.displayName,tagline:b.tagline,footer:b.footer,logo:'keep',template:b.template});
const typeLabels:Record<DocumentTemplateType,[string,string]>={quote:['Cotizaciones','Quotes'],invoice:['Facturas','Invoices'],change_order:['Órdenes de cambio','Change orders'],purchase_order:['Órdenes de compra','Purchase orders'],contract:['Contratos','Contracts'],statement:['Estados de cuenta','Account statements'],payment_plan:['Planes de pagos','Payment plans'],receipt:['Recibos','Receipts'],selections:['Hojas de selecciones','Selection sheets']};
const fieldLabels:Record<DocumentTemplateField,[string,string]>={codes:['Códigos de línea y CABYS','Line codes and CABYS'],unitPrices:['Precios unitarios','Unit prices'],taxes:['Desglose de impuestos','Tax breakdown'],signature:['Espacio para la firma','Signature block'],terms:['Condiciones de pago','Payment terms'],notes:['Notas','Notes']};
export function DocumentBrandingSettings(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [saved,setSaved]=useState<DocumentBranding|null>(null),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[logoVersion,setLogoVersion]=useState(0),action=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/document-branding',{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);const b=documentBrandingSchema.parse(body);setSaved(b);setDraft(draftOf(b));setError('');}catch{setError(t('No se pudo cargar la marca de sus documentos.','Your document branding could not be loaded.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function pick(file:File|undefined){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError(t('Use una imagen JPG, PNG o WebP de hasta 5 MB (se guarda como JPG de hasta 1 MB).','Use a JPG, PNG or WebP image up to 5 MB (stored as a JPG up to 1 MB).'));return;}
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error());reader.readAsDataURL(file);});
  setDraft(old=>old&&{...old,logo:{base64:data.replace(/^data:[^,]*,/,''),preview:data}});setError('');}
 async function save(){
  if(!draft||!saved)return;setBusy(true);setError('');setNotice('');
  const body={revision:saved.revision,theme:draft.theme,displayName:draft.displayName.trim(),tagline:draft.tagline.trim(),footer:draft.footer.trim(),logo:draft.logo&&typeof draft.logo==='object'?{base64:draft.logo.base64}:draft.logo,template:draft.template};
  // Same content keeps the same action id: a retry after a lost answer never saves twice.
  const key=JSON.stringify(body);if(action.current?.key!==key)action.current={key,id:crypto.randomUUID()};
  try{const r=await fetch('/api/pro/document-branding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,actionId:action.current.id})});const data=await r.json().catch(()=>({}));
   if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});action.current=null;const b=documentBrandingSchema.parse(data.branding);setSaved(b);setDraft(draftOf(b));setLogoVersion(v=>v+1);setNotice(t('Marca guardada. Se usa en las próximas impresiones.','Branding saved. It is used in your next prints.'));}
  catch(e){setError((e as {status?:number}).status===409?t('La marca cambió en otra pestaña. Recargue antes de guardar.','The branding changed in another tab. Reload before saving.'):t('No se pudo guardar la marca. Intente de nuevo.','Could not save your branding. Try again.'));}
  finally{setBusy(false);}
 }
 if(!draft||!saved)return error?<p role="alert" className="text-sm text-red-700">{error} <Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></p>:<p role="status">{t('Cargando…','Loading…')}</p>;
 const logoSrc=draft.logo&&typeof draft.logo==='object'?draft.logo.preview:draft.logo==='keep'&&saved.logo?'/api/pro/document-branding?logo=1&v='+logoVersion:null;
 const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base';
 const changed=JSON.stringify({...draft,logo:draft.logo==='keep'?'keep':draft.logo===null?null:'new'})!==JSON.stringify({...draftOf(saved),logo:'keep'});
 const tpl=draft.template,setTemplate=(next:Partial<DocumentTemplate>)=>setDraft({...draft,template:{...tpl,...next}});
 const choice='flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold';
 const radios=<K extends 'layout'|'logoPosition'|'paper'>(key:K,legend:string,options:[DocumentTemplate[K],string,string][])=><fieldset className="min-w-0" data-document-template-option={key}><legend className="text-sm font-semibold">{legend}</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{options.map(([value,es,english])=><label key={value} className={`${choice} ${tpl[key]===value?'border-[#162543] bg-white':'border-[#d7e1ea] bg-white'}`}><input type="radio" name={'document-template-'+key} value={value} checked={tpl[key]===value} onChange={()=>setTemplate({[key]:value} as Partial<DocumentTemplate>)} className="h-4 w-4"/>{t(es,english)}</label>)}</div></fieldset>;
 return <section data-document-branding-settings className="min-w-0 space-y-5">
  <div className="grid min-w-0 gap-5 lg:grid-cols-2">
   <div className="min-w-0 space-y-4">
    <fieldset className="min-w-0"><legend className="text-sm font-semibold">{t('Color de sus documentos','Document color')}</legend><div className="mt-2 grid grid-cols-2 gap-2">{(Object.keys(documentThemes) as DocumentTheme[]).map(key=><label key={key} className={`${choice} ${draft.theme===key?'border-[#162543] bg-white':'border-[#d7e1ea] bg-white'}`}><input type="radio" name="document-theme" value={key} checked={draft.theme===key} onChange={()=>setDraft({...draft,theme:key})} className="h-4 w-4"/><span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full" style={{background:documentThemes[key].accent}}/>{documentThemes[key][en?'en':'es']}</label>)}</div></fieldset>
    <label className="block text-sm font-semibold">{t('Nombre de la empresa en el encabezado','Company name in the header')}<input className={field} maxLength={120} value={draft.displayName} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label>
    <label className="block text-sm font-semibold">{t('Línea bajo el nombre (opcional)','Line under the name (optional)')}<input className={field} maxLength={160} value={draft.tagline} placeholder={t('Cédula jurídica, teléfono o lema','Company ID, phone or tagline')} onChange={e=>setDraft({...draft,tagline:e.target.value})}/></label>
    <label className="block text-sm font-semibold">{t('Pie de página (opcional)','Footer (optional)')}<textarea className={field+' min-h-20 py-2'} maxLength={300} value={draft.footer} onChange={e=>setDraft({...draft,footer:e.target.value})}/></label>
    <div className="flex flex-wrap items-center gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[#d7e1ea] bg-white px-4 text-sm font-semibold hover:bg-[#f3f8fb]">{t('Elegir logo','Choose logo')}<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" aria-label={t('Elegir el logo de la empresa','Choose the company logo')} onChange={e=>{void pick(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/></label>{logoSrc&&<Button type="button" variant="secondary" onClick={()=>setDraft({...draft,logo:null})}>{t('Quitar logo','Remove logo')}</Button>}</div>
   </div>
   <div data-document-template-settings className="min-w-0 space-y-4 rounded-2xl border border-[#e5e7eb] bg-[#f7f9fc] p-4">
    <div><h3 className="font-bold text-[#162543]">{t('Plantilla de sus documentos','Your document template')}</h3><p className="text-sm text-[#52627a]">{t('Se aplica a todos los documentos con su marca. Lo predeterminado deja sus documentos como hasta ahora.','Applies to every branded document. The defaults keep your documents as they are today.')}</p></div>
    {radios('layout',t('Diseño','Layout'),[['classic','Clásica','Classic'],['modern','Moderna','Modern'],['compact','Compacta','Compact']])}
    {radios('logoPosition',t('Posición del logo','Logo position'),[['left','Izquierda','Left'],['center','Centro','Center'],['right','Derecha','Right']])}
    <label className="block text-sm font-semibold" data-document-template-option="accent">{t('Color de acento (títulos y líneas)','Accent color (headings and rules)')}<span className="mt-1 flex items-center gap-2"><span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full border border-[#d7e1ea]" style={{background:documentThemes[tpl.accent==='theme'?draft.theme:tpl.accent].accent}}/><select className={field+' mt-0'} value={tpl.accent} onChange={e=>setTemplate({accent:e.target.value as DocumentTemplate['accent']})}>{(['theme',...Object.keys(documentThemes)] as DocumentTemplate['accent'][]).map(key=><option key={key} value={key}>{key==='theme'?t('Igual al color de sus documentos','Same as the document color'):documentThemes[key][en?'en':'es']}</option>)}</select></span></label>
    {radios('paper',t('Tamaño del papel','Paper size'),[['auto','Según la impresora','Printer default'],['letter','Carta','Letter'],['a4','A4','A4']])}
    <fieldset className="min-w-0" data-document-template-option="show"><legend className="text-sm font-semibold">{t('Mostrar en los documentos','Show on documents')}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{(Object.keys(fieldLabels) as DocumentTemplateField[]).map(key=><label key={key} className={`${choice} border-[#d7e1ea] bg-white`}><input type="checkbox" data-document-template-show={key} checked={tpl.show[key]} onChange={e=>setTemplate({show:{...tpl.show,[key]:e.target.checked}})} className="h-4 w-4"/>{t(...fieldLabels[key])}</label>)}</div><p className="mt-1 text-xs text-[#52627a]">{t('Solo cambia lo impreso: los montos y totales no cambian.','Only changes what is printed: amounts and totals stay the same.')}</p></fieldset>
    <DocumentTextsEditor en={en} template={tpl} onChange={texts=>setTemplate({texts})}/>
    <Button type="button" variant="secondary" data-document-template-reset disabled={JSON.stringify(tpl)===JSON.stringify(defaultDocumentTemplate())} onClick={()=>setTemplate(defaultDocumentTemplate())}>{t('Volver a la plantilla predeterminada','Restore the default template')}</Button>
   </div>
  </div>
  <TemplatePreview en={en} draft={draft} logoSrc={logoSrc}/>
  <p className="text-sm text-[#52627a]">{t('Se aplica a las próximas impresiones de cotizaciones, órdenes de cambio, facturas, contratos, estados de cuenta, planes de pagos, recibos, órdenes de compra y hojas de selecciones, en español e inglés. Las copias ya impresas o compartidas no cambian. El costo interno y el margen nunca se imprimen.','Applies to your next prints of quotes, change orders, invoices, contracts, account statements, payment plans, receipts, purchase orders and selection sheets, in Spanish and English. Copies already printed or shared do not change. Internal cost and margin are never printed.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-[#0f7a3d]">{notice}</p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy||!changed} onClick={()=>setDraft(draftOf(saved))}>{t('Descartar cambios','Discard changes')}</Button><Button type="button" data-pro-write="settings.write" disabled={busy||!changed} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar marca','Save branding')}</Button></div>
 </section>;
}
/** Default terms and notes of one document type at a time (printed before the footer when shown). */
function DocumentTextsEditor({en,template,onChange}:{en:boolean;template:DocumentTemplate;onChange:(texts:DocumentTemplate['texts'])=>void}){
 const t=(es:string,english:string)=>en?english:es,[type,setType]=useState<DocumentTemplateType>('quote'),texts=template.texts[type];
 const field='mt-1 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
 return <fieldset className="min-w-0 space-y-2" data-document-template-texts><legend className="text-sm font-semibold">{t('Condiciones y notas predeterminadas','Default terms and notes')}</legend>
  <label className="block text-sm font-semibold">{t('Tipo de documento','Document type')}<select className={field+' min-h-11'} value={type} onChange={e=>setType(e.target.value as DocumentTemplateType)}>{documentTemplateTypes.map(key=><option key={key} value={key}>{t(...typeLabels[key])}{template.texts[key].terms||template.texts[key].notes?' •':''}</option>)}</select></label>
  <label className="block text-sm font-semibold">{t('Condiciones de pago','Payment terms')}<textarea data-document-template-terms className={field+' min-h-20'} maxLength={1000} value={texts.terms} placeholder={t('Ej.: 50 % de adelanto y 50 % al entregar.','E.g. 50% upfront and 50% on delivery.')} onChange={e=>onChange({...template.texts,[type]:{...texts,terms:e.target.value}})}/></label>
  <label className="block text-sm font-semibold">{t('Notas','Notes')}<textarea data-document-template-notes className={field+' min-h-20'} maxLength={1000} value={texts.notes} onChange={e=>onChange({...template.texts,[type]:{...texts,notes:e.target.value}})}/></label>
 </fieldset>;
}
/** Live preview: the real print templates with sample data, branded with the unsaved choices. */
function TemplatePreview({en,draft,logoSrc}:{en:boolean;draft:Draft;logoSrc:string|null}){
 const t=(es:string,english:string)=>en?english:es,[doc,setDoc]=useState<'quote'|'invoice'>('quote');
 const html=useMemo(()=>{try{return applyDocumentBranding(doc==='quote'?sampleQuotePrintHtml(en):sampleInvoicePrintHtml(),{theme:draft.theme,displayName:draft.displayName.trim(),tagline:draft.tagline.trim(),footer:draft.footer.trim(),logoDataUri:logoSrc,template:draft.template},doc);}catch{return '';}},[doc,en,draft,logoSrc]);
 return <figure data-document-branding-preview className="min-w-0 space-y-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm sm:p-4">
  <figcaption className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0"><span className="block text-xs font-bold uppercase tracking-wide text-[#68778d]">{t('Vista previa (sin guardar todavía)','Preview (not saved yet)')}</span>{draft.displayName.trim()&&<span data-document-preview-company className="block break-words text-sm font-semibold text-[#162543]">{draft.displayName.trim()}</span>}</span>
   <span className="flex gap-2" role="group" aria-label={t('Documento de ejemplo','Sample document')}>{(['quote','invoice'] as const).map(key=><Button key={key} type="button" size="sm" className="min-h-11" variant={doc===key?'default':'outline'} aria-pressed={doc===key} data-document-preview-doc={key} onClick={()=>setDoc(key)}>{key==='quote'?t('Cotización','Quote'):t('Factura','Invoice')}</Button>)}</span></figcaption>
  {/* Sandboxed: no scripts run; same-origin only so the saved private logo can load in the preview. */}
  <iframe data-document-preview-frame={doc} title={t('Vista previa del documento','Document preview')} sandbox="allow-same-origin" srcDoc={html} className="h-[34rem] w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white sm:h-[40rem]"/>
  <p className="text-xs text-[#52627a]">{t('Datos de ejemplo. La factura de ejemplo es un borrador sin validez fiscal, igual que las impresas.','Sample data. The sample invoice is a draft with no tax validity, like the printed ones.')}</p>
 </figure>;
}
