'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {proPhone} from '@/lib/pro/phone';
import {useLocale} from 'next-intl';
import {Plus} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {ProModal} from './modal';
import {ProSearchField} from './search-field';
import {useProChildGuard} from './use-pro-child-guard';
import {proMoney} from '@/lib/pro/money';
import {companyVendorDetailSchema,companyVendorMutationSchema,companyVendorPageSchema,companyVendorResultSchema,vendorTradeSuggestions,type CompanyVendor,type CompanyVendorDetail,type CompanyVendorKind,type CompanyVendorMutation,type CompanyVendorPage} from '@/lib/pro/company-vendors';

const api='/api/pro/company-vendors';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
type Draft={name:string;kind:CompanyVendorKind;trade:string;contactName:string;email:string;phone:string;identification:string;notes:string;address:string};
const blank=():Draft=>({name:'',kind:'supplier',trade:'',contactName:'',email:'',phone:'',identification:'',notes:'',address:''});
const fromVendor=(v:CompanyVendor):Draft=>({name:v.name,kind:v.kind,trade:v.trade??'',contactName:v.contactName??'',email:v.email,phone:v.phone,identification:v.identification,notes:v.notes??'',address:v.address??''});
type Editor={mode:'create';id:string}|{mode:'edit';id:string;revision:number;detail:CompanyVendorDetail|null};
const money=(cents:number)=>proMoney(cents/100);
/** Tags live in the trade field as a comma separated list (up to 80 characters in all). */
const tagsOf=(trade:string|null)=>[...new Set((trade??'').split(',').map(x=>x.trim()).filter(Boolean))];
const tagChips=(trade:string|null)=>tagsOf(trade).length?<span data-vendor-tags className="mt-1 flex flex-wrap gap-1">{tagsOf(trade).map(tag=><span key={tag} data-vendor-tag={tag} className="inline-block break-all rounded-full bg-[#eaf7fb] px-2 py-0.5 text-[11px] font-semibold text-[#006f93]">{tag}</span>)}</span>:null;

export function CompanyVendors(){const {user}=useAuth();return user?<VendorSession key={user.id} actor={user.id}/>:null;}

function VendorSession({actor}:{actor:string}){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [status,setStatus]=useState<'active'|'archived'>('active'),[tag,setTag]=useState(''),[kind,setKind]=useState<'all'|CompanyVendorKind>('all'),[search,setSearch]=useState('');
 const [page,setPage]=useState<CompanyVendorPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [editor,setEditor]=useState<Editor|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState(''),[formError,setFormError]=useState(''),[conflict,setConflict]=useState(false),[uncertain,setUncertain]=useState(false),[saving,setSaving]=useState(false),[detailLoading,setDetailLoading]=useState(false);
 const sequence=useRef(0),lock=useRef(false),pending=useRef<{signature:string;body:CompanyVendorMutation}|null>(null);
 const kindLabel=(value:CompanyVendorKind)=>value==='subcontractor'?t('Subcontratista','Subcontractor'):t('Proveedor','Supplier');
 const dirty=!!editor&&JSON.stringify(draft)!==baseline;
 useProChildGuard(dirty||saving||uncertain,useCallback(()=>setFormError(t('Guarde o cancele los cambios del proveedor antes de salir.','Save or cancel the supplier changes before leaving.')),[t]));
 const headers={'X-Pro-Expected-Actor':actor};
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async(after?:string)=>{
  const n=++sequence.current;setLoading(true);setError('');
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'list',status,kind,q:search.trim(),...after?{after}:{}}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
   if(!response.ok)throw Error();const body=companyVendorPageSchema.parse(await response.json());
   if(n!==sequence.current)return;
   setPage(old=>after&&old?{...body,items:[...old.items,...body.items.filter(row=>!old.items.some(prior=>prior.id===row.id))]}:body);
  }catch{if(n===sequence.current)setError(t('No se pudieron cargar los proveedores. Sus datos se conservan.','Suppliers could not be loaded. Your data is preserved.'));}
  finally{if(n===sequence.current)setLoading(false);}
 },[status,kind,search,actor,t]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),search?250:0);return()=>{clearTimeout(timer);invalidate();};},[load,search,invalidate]);

 function openCreate(){setEditor({mode:'create',id:crypto.randomUUID()});const d=blank();setDraft(d);setBaseline(JSON.stringify(d));setFormError('');setConflict(false);setUncertain(false);pending.current=null;}
 async function openEdit(vendor:CompanyVendor){
  setEditor({mode:'edit',id:vendor.id,revision:vendor.revision,detail:null});const d=fromVendor(vendor);setDraft(d);setBaseline(JSON.stringify(d));setFormError('');setConflict(false);setUncertain(false);pending.current=null;
  await refreshDetail(vendor.id,true);
 }
 async function refreshDetail(id:string,replaceDraft:boolean){
  setDetailLoading(true);
  try{const response=await fetch(api+'?'+new URLSearchParams({view:'detail',id}),{cache:'no-store',headers});if(!response.ok)throw Error();const detail=companyVendorDetailSchema.parse(await response.json());
   setEditor(old=>old&&old.mode==='edit'&&old.id===id?{...old,revision:detail.vendor.revision,detail}:old);
   if(replaceDraft){const d=fromVendor(detail.vendor);setDraft(d);setBaseline(JSON.stringify(d));}
   return detail;
  }catch{setFormError(t('No se pudo cargar el historial del proveedor. Puede reintentar.','The supplier history could not be loaded. You can retry.'));return null;}
  finally{setDetailLoading(false);}
 }
 async function close(){
  if(saving)return;
  if((dirty||uncertain)&&!(await confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Los datos del proveedor que no guardó se perderán.','Supplier details you have not saved will be lost.'),confirmLabel:t('Descartar cambios','Discard changes')})).confirmed)return;
  setEditor(null);pending.current=null;
 }
 async function post(body:CompanyVendorMutation){
  const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json().catch(()=>null)};
 }
 async function save(event:FormEvent){
  event.preventDefault();if(!editor||lock.current)return;setFormError('');
  if(editor.mode==='edit'&&!uncertain&&JSON.stringify(draft)===baseline){setFormError(t('No hay cambios que guardar.','There are no changes to save.'));return;}
  const signature=JSON.stringify({editor:editor.id,draft,revision:editor.mode==='edit'?editor.revision:0});
  const reuse=pending.current?.signature===signature?pending.current.body:null;
  const raw=reuse??(editor.mode==='create'?{action:'create',actionId:crypto.randomUUID(),id:editor.id,...draft}:{action:'update',actionId:crypto.randomUUID(),id:editor.id,revision:editor.revision,...draft});
  const parsed=companyVendorMutationSchema.safeParse(raw);
  if(!parsed.success){const path=String(parsed.error.issues[0]?.path[0]??'');setFormError(path==='name'?t('Escriba el nombre del proveedor (hasta 160 caracteres).','Enter the supplier name (up to 160 characters).'):path==='email'?t('Revise el correo electrónico.','Check the email address.'):t('Revise los datos del proveedor.','Check the supplier details.'));return;}
  pending.current={signature,body:parsed.data};lock.current=true;setSaving(true);
  try{
   const result=await post(parsed.data);
   if(result.status===200){const saved=companyVendorResultSchema.parse(result.body).vendor;pending.current=null;setUncertain(false);setEditor(null);setNotice(editor.mode==='create'?t(`Se agregó "${saved.name}".`,`"${saved.name}" was added.`):t(`Se guardaron los cambios de "${saved.name}".`,`Changes to "${saved.name}" were saved.`));void load();return;}
   pending.current=null;setUncertain(false);
   if(result.status===409){setConflict(true);setFormError(t('Otra persona o pestaña cambió este proveedor. Recargue para ver la versión actual; sus cambios siguen en el formulario.','This supplier was changed elsewhere. Reload to see the current version; your changes are still in the form.'));}
   else setFormError(t('No se guardó. Revise los datos del proveedor.','Not saved. Check the supplier details.'));
  }catch{setUncertain(true);setFormError(t('No se pudo confirmar el guardado. Reintente sin cambiar los datos para no duplicar el proveedor.','The save could not be confirmed. Retry without changing the details so the supplier is not duplicated.'));}
  finally{lock.current=false;setSaving(false);}
 }
 async function reloadConflict(){if(!editor||editor.mode!=='edit')return;const detail=await refreshDetail(editor.id,false);if(detail){setConflict(false);setBaseline(JSON.stringify(fromVendor(detail.vendor)));setFormError(t('Se cargó la versión actual. Revise sus cambios y guarde de nuevo.','The current version was loaded. Review your changes and save again.'));}}
 async function toggleArchive(vendor:CompanyVendor){
  if(busy)return;
  if(!vendor.archived&&!(await confirm({title:t('¿Archivar proveedor?','Archive supplier?'),description:t('Dejará de aparecer al crear gastos y órdenes de compra. Su historial y los documentos existentes se conservan, y puede restaurarlo.','It will no longer be offered for new expenses and purchase orders. Its history and existing documents are kept, and you can restore it.'),confirmLabel:t('Archivar','Archive')})).confirmed)return;
  setBusy(true);setError('');setNotice('');
  try{const result=await post({action:vendor.archived?'restore':'archive',actionId:crypto.randomUUID(),id:vendor.id,revision:vendor.revision});
   if(result.status===200){setNotice(vendor.archived?t(`Se restauró "${vendor.name}".`,`"${vendor.name}" was restored.`):t(`Se archivó "${vendor.name}".`,`"${vendor.name}" was archived.`));}
   else setError(result.status===409?t('Este proveedor cambió. La lista se actualizó; intente de nuevo.','This supplier changed. The list was refreshed; try again.'):t('No se pudo cambiar el estado del proveedor.','The supplier status could not be changed.'));
  }catch{setError(t('No se pudo confirmar el cambio. Actualice la lista para comprobarlo.','The change could not be confirmed. Refresh the list to check it.'));}
  finally{setBusy(false);void load();}
 }
 const set=(patch:Partial<Draft>)=>{setDraft(old=>({...old,...patch}));if(!uncertain)setFormError('');};
 const counts=page?.counts,allItems=page?.items??[],tagOptions=[...new Set(allItems.flatMap(v=>tagsOf(v.trade)))].sort((a,b)=>a.localeCompare(b,'es')),items=tag?allItems.filter(v=>tagsOf(v.trade).includes(tag)):allItems;
 const filtered=!!search.trim()||kind!=='all'||!!tag;
 const contact=(v:CompanyVendor)=>[v.contactName,v.email,proPhone(v.phone),v.address].filter(Boolean);
 const actions=(v:CompanyVendor,table=false)=><div className={table?'flex flex-nowrap justify-end gap-2':'flex flex-wrap gap-2'}><Button type="button" variant="secondary" disabled={busy} onClick={()=>void openEdit(v)} aria-label={t(`Editar ${v.name}`,`Edit ${v.name}`)}>{t('Editar','Edit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>void toggleArchive(v)} aria-label={v.archived?t(`Restaurar ${v.name}`,`Restore ${v.name}`):t(`Archivar ${v.name}`,`Archive ${v.name}`)}>{v.archived?t('Restaurar','Restore'):t('Archivar','Archive')}</Button></div>;
 // Desktop table: total and paid on their own unbroken lines, so a narrow column never splits «₡2.500 · pagado ₡1.000» at random.
 const figures=(count:number,total:number,paid:number,label:string,kind:'po'|'ex')=>count?<div data-company-vendor-figures={kind}><p className="whitespace-nowrap font-semibold tabular-nums">{money(total)}</p><p className="whitespace-nowrap text-xs tabular-nums text-[#52627a]">{t('Pagado','Paid')} {money(paid)}</p><p className="text-xs text-[#52627a]">{label}</p></div>:<p>—</p>;
 const totals=(v:CompanyVendor)=>({po:v.purchaseOrders.count?`${money(v.purchaseOrders.committedCents)} · ${t('pagado','paid')} ${money(v.purchaseOrders.paidCents)}`:'—',ex:v.expenses.count?`${money(v.expenses.amountCents)} · ${t('pagado','paid')} ${money(v.expenses.paidCents)}`:'—'});
 const ordersLabel=(n:number)=>en?(n===1?'1 order':`${n} orders`):(n===1?'1 orden':`${n} órdenes`),expensesLabel=(n:number)=>en?(n===1?'1 expense':`${n} expenses`):(n===1?'1 gasto':`${n} gastos`);
 const history=editor?.mode==='edit'?editor.detail?.history??[]:[];
 const actionLabel={create:t('Creado','Created'),update:t('Editado','Edited'),archive:t('Archivado','Archived'),restore:t('Restaurado','Restored')};
 return <section data-company-vendors className="min-w-0 space-y-4">{dialogNode}
  <div className="flex justify-end">
   <Button type="button" className="w-full sm:w-auto" onClick={openCreate}><Plus className="h-4 w-4" aria-hidden/>{t('Agregar proveedor','Add supplier')}</Button></div>
  <div className="grid min-w-0 gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
   <div role="group" aria-label={t('Estado','Status')} className="flex gap-2">{(['active','archived'] as const).map(value=><button key={value} type="button" aria-pressed={status===value} onClick={()=>{setStatus(value);setPage(null);}} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${status===value?'border-[#008bb5] bg-[#eaf7fb] text-[#007aa0]':'border-[#d7e1ea] bg-white text-[#52627a]'}`}>{value==='active'?t('Activos','Active'):t('Archivados','Archived')}{counts?` (${counts[value]})`:''}</button>)}</div>
   <ProSearchField label={t('Buscar proveedores','Search suppliers')} placeholder={t('Nombre, oficio, contacto o correo','Name, trade, contact or email')} value={search} onChange={value=>setSearch(value)}/>
   <label className="block text-sm font-semibold">{t('Tipo','Type')}<select className={field} aria-label={t('Tipo','Type')} value={kind} onChange={event=>{setKind(event.target.value as typeof kind);setPage(null);}}><option value="all">{t('Todos','All')}</option><option value="supplier">{t('Proveedores','Suppliers')}</option><option value="subcontractor">{t('Subcontratistas','Subcontractors')}</option></select></label>
  </div>
  {tagOptions.length>0&&<div data-vendor-tag-filter role="group" aria-label={t('Etiquetas','Tags')} className="flex flex-wrap gap-2"><button type="button" aria-pressed={!tag} onClick={()=>setTag('')} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${!tag?'border-[#008bb5] bg-[#eaf7fb] text-[#007aa0]':'border-[#d7e1ea] bg-white text-[#52627a]'}`}>{t('Todas','All')}</button>{tagOptions.map(option=><button key={option} type="button" aria-pressed={tag===option} onClick={()=>setTag(option)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${tag===option?'border-[#008bb5] bg-[#eaf7fb] text-[#007aa0]':'border-[#d7e1ea] bg-white text-[#52627a]'}`}>{option}</button>)}</div>}
  {notice&&<p role="status" className="rounded-xl bg-[#eef9f3] p-3 text-sm text-[#175b42]">{notice}</p>}
  {error&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"><span>{error}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>}
  {!page&&loading?<p role="status" aria-busy="true" className="rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{t('Cargando proveedores…','Loading suppliers…')}</p>
  :page&&!items.length?<div data-company-vendors-empty className="rounded-2xl border border-dashed border-[#d7e1ea] bg-white p-6 text-center"><p className="font-semibold">{filtered?t('Ningún proveedor coincide con la búsqueda.','No suppliers match your search.'):status==='archived'?t('No tiene proveedores archivados.','You have no archived suppliers.'):t('Todavía no tiene proveedores.','You have no suppliers yet.')}</p><p className="mt-1 text-sm text-[#52627a]">{filtered?t('Pruebe con otro nombre o tipo.','Try another name or type.'):status==='archived'?t('Los que archive aparecerán aquí.','Suppliers you archive will appear here.'):t('Agregue a quienes le venden materiales o trabajan como subcontratistas.','Add the people who sell you materials or work as subcontractors.')}</p></div>
  :page&&<>
   <div className="hidden overflow-hidden rounded-2xl border border-[#d7e1ea] bg-white xl:block"><table className="w-full table-fixed text-left text-sm"><caption className="sr-only">{t('Proveedores','Suppliers')}</caption><thead className="bg-[#f7f9fc] text-xs uppercase tracking-wide text-[#52627a]"><tr><th scope="col" className="w-[18%] px-4 py-3">{t('Nombre','Name')}</th><th scope="col" className="w-[9%] px-3 py-3">{t('Tipo','Type')}</th><th scope="col" className="w-[14%] px-3 py-3">{t('Etiquetas','Tags')}</th><th scope="col" className="w-[14%] px-3 py-3">{t('Contacto','Contact')}</th><th scope="col" className="w-[13%] px-3 py-3">{t('Órdenes de compra','Purchase orders')}</th><th scope="col" className="w-[12%] px-3 py-3">{t('Gastos','Expenses')}</th><th scope="col" className="w-[20%] px-3 py-3"><span className="sr-only">{t('Acciones','Actions')}</span></th></tr></thead>
    <tbody className="divide-y divide-[#eef2f6]">{items.map(v=>{return <tr key={v.id} data-company-vendor={v.id} className="align-top"><td className="px-4 py-3"><p className="break-words font-semibold">{v.name}</p></td><td className="px-3 py-3">{kindLabel(v.kind)}</td><td className="px-3 py-3">{tagChips(v.trade)??'—'}</td><td className="px-3 py-3 text-[#52627a]">{contact(v).length?contact(v).map(item=><p key={item} className="break-words">{item}</p>):'—'}</td><td className="px-3 py-3">{figures(v.purchaseOrders.count,v.purchaseOrders.committedCents,v.purchaseOrders.paidCents,ordersLabel(v.purchaseOrders.count),'po')}</td><td className="px-3 py-3">{figures(v.expenses.count,v.expenses.amountCents,v.expenses.paidCents,expensesLabel(v.expenses.count),'ex')}</td><td className="px-3 py-3">{actions(v,true)}</td></tr>;})}</tbody></table></div>
   <ul className="space-y-3 xl:hidden">{items.map(v=>{const total=totals(v);return <li key={v.id} data-company-vendor={v.id} className="min-w-0 space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="min-w-0 break-words font-semibold">{v.name}</p><span className="rounded-lg bg-[#f3f8fb] px-2 py-0.5 text-xs font-semibold text-[#52627a]">{kindLabel(v.kind)}</span></div>{tagChips(v.trade)}{!!contact(v).length&&<p className="break-words text-sm text-[#52627a]">{contact(v).join(' · ')}</p>}{v.purchaseOrders.count+v.expenses.count===0?<p className="text-sm text-[#52627a]">{t('Sin órdenes de compra ni gastos registrados.','No purchase orders or expenses recorded.')}</p>:<dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-[#52627a]">{t('Órdenes de compra','Purchase orders')}</dt><dd className="break-words">{total.po}</dd></div><div><dt className="text-xs font-semibold text-[#52627a]">{t('Gastos','Expenses')}</dt><dd className="break-words">{total.ex}</dd></div></dl>}{actions(v)}</li>;})}</ul>
   {page.nextCursor&&<Button type="button" variant="secondary" disabled={loading} onClick={()=>void load(page.nextCursor!)}>{loading?t('Cargando…','Loading…'):t('Ver más proveedores','Show more suppliers')}</Button>}
  </>}
  {editor&&<ProModal open onClose={()=>void close()} title={editor.mode==='create'?t('Agregar proveedor','Add supplier'):t('Editar proveedor','Edit supplier')} size="lg" mobilePresentation="fullscreen" footer={<><Button type="button" variant="secondary" disabled={saving} onClick={()=>void close()}>{t('Cancelar','Cancel')}</Button><Button type="submit" form="company-vendor-form" disabled={saving||detailLoading||conflict}>{saving?t('Guardando…','Saving…'):uncertain?t('Reintentar guardado','Retry save'):t('Guardar proveedor','Save supplier')}</Button></>}>
   <form id="company-vendor-form" data-company-vendor-form noValidate onSubmit={event=>void save(event)} className="min-w-0 space-y-4">
    {formError&&<div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{formError}</p>{conflict&&<Button type="button" variant="secondary" onClick={()=>void reloadConflict()}>{t('Recargar proveedor','Reload supplier')}</Button>}</div>}
    {detailLoading&&<p role="status" className="text-sm text-[#52627a]">{t('Cargando datos actuales…','Loading current details…')}</p>}
    <fieldset disabled={saving||uncertain||detailLoading} aria-busy={detailLoading} className="grid min-w-0 gap-4 sm:grid-cols-2">
     <label className="block text-sm font-semibold sm:col-span-2">{t('Nombre o razón social','Name or company name')}<input className={field} value={draft.name} maxLength={160} required autoComplete="organization" onChange={e=>set({name:e.target.value})}/></label>
     <label className="block text-sm font-semibold">{t('Tipo','Type')}<select className={field} aria-label={t('Tipo','Type')} value={draft.kind} onChange={e=>set({kind:e.target.value as CompanyVendorKind})}><option value="supplier">{t('Proveedor','Supplier')}</option><option value="subcontractor">{t('Subcontratista','Subcontractor')}</option></select></label>
     <label className="block text-sm font-semibold">{t('Etiquetas u oficio (opcional, separe con comas)','Tags or trade (optional, separate with commas)')}<input className={field} value={draft.trade} maxLength={80} list="company-vendor-trades" onChange={e=>set({trade:e.target.value})}/><datalist id="company-vendor-trades">{vendorTradeSuggestions[en?'en':'es'].map(item=><option key={item} value={item}/>)}</datalist></label>
     <label className="block text-sm font-semibold">{t('Persona de contacto (opcional)','Contact person (optional)')}<input className={field} value={draft.contactName} maxLength={160} autoComplete="off" onChange={e=>set({contactName:e.target.value})}/></label>
     <label className="block text-sm font-semibold">{t('Identificación (opcional)','ID number (optional)')}<input className={field} value={draft.identification} maxLength={40} autoComplete="off" onChange={e=>set({identification:e.target.value})}/></label>
     <label className="block text-sm font-semibold">{t('Correo (opcional)','Email (optional)')}<input className={field} type="email" inputMode="email" value={draft.email} maxLength={254} autoComplete="off" onChange={e=>set({email:e.target.value})}/></label>
     <label className="block text-sm font-semibold">{t('Teléfono (opcional)','Phone (optional)')}<input className={field} type="tel" inputMode="tel" value={draft.phone} maxLength={40} autoComplete="off" onChange={e=>set({phone:e.target.value})}/></label>
     <label className="block text-sm font-semibold sm:col-span-2">{t('Dirección (opcional)','Address (optional)')}<textarea data-company-vendor-address className={field+' min-h-20'} value={draft.address} maxLength={300} autoComplete="street-address" onChange={e=>set({address:e.target.value})}/></label>
     <label className="block text-sm font-semibold sm:col-span-2">{t('Notas internas (opcional)','Internal notes (optional)')}<textarea className={field+' min-h-24'} value={draft.notes} maxLength={2000} onChange={e=>set({notes:e.target.value})}/></label>
    </fieldset>
    <p className="text-xs text-[#52627a]">{t('Solo para su control interno: ContrataCR no le envía nada al proveedor.','For your internal records only: ContrataCR does not send anything to the supplier.')}</p>
    {editor.mode==='edit'&&<details className="rounded-xl border border-[#d7e1ea] p-3"><summary className="cursor-pointer text-sm font-semibold">{t('Historial de cambios','Change history')}</summary>{detailLoading?<p role="status" className="mt-2 text-sm text-[#52627a]">{t('Cargando historial…','Loading history…')}</p>:history.length?<ul className="mt-2 space-y-1 text-sm">{history.map(item=><li key={item.actionId} className="break-words text-[#52627a]"><span className="font-semibold text-[#162543]">{actionLabel[item.action]}</span> · {new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(item.at))}</li>)}</ul>:<p className="mt-2 text-sm text-[#52627a]">{t('Sin cambios registrados desde el directorio.','No changes recorded from the directory yet.')}</p>}</details>}
   </form>
  </ProModal>}
 </section>;
}
