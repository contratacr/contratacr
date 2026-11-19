'use client';
import {StatusFilterTabs} from '@/components/dashboard/status-filter-tabs';
import {ProRecordCard} from './record-card';
import {ProSectionActions} from './section-actions';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {ReceiptText} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {CardActionsMenu} from '@/components/dashboard/card-actions-menu';
import {Modal} from '@/components/ui/modal';
import {useAppDialog} from '@/hooks/use-app-dialog';
import type {InvoiceManagement} from '@/lib/pro/invoice-management';
import {PaymentOverview} from './payment-overview';
import {PaymentReceiptsWorkspace} from './payment-receipts';
import {InvoiceDocumentSettings} from './invoice-document-settings';
import {InvoiceRecurrenceWorkspace} from './invoice-recurrence-workspace';
import type {InvoiceDraft} from '@/lib/pro/invoice-drafts';
import {proMoney} from '@/lib/pro/money';
import {pushProParams,replaceProParams,navigatePro,closeProStep} from '@/lib/pro/navigation';
import {InvoiceIssuerSettings} from './invoice-issuer-settings';
import {InvoiceDetailEditor} from './invoice-detail-editor';
import {ServicePackageManager} from './service-packages';
import {InvoiceDraftEditor} from './invoice-draft';
import {ProSearchField} from './search-field';
import {useProSearchParams} from './use-pro-search-params';

type DraftRow=InvoiceManagement&{id:string;title:string;receiver:string;client:string;clientId:string;work:string|null;quote:string|null;totalCents:number;createdAt:string;updatedAt:string};
export function InvoiceWorkspace(){
 const en=useLocale()==='en',params=useProSearchParams(),search=params.get('buscarFactura')??'',query=search.trim(),draftId=params.get('factura'),archived=params.get('archivadas')==='1';
 const t=useCallback((es:string,eng:string)=>en?eng:es,[en]);
 const [refresh,setRefresh]=useState(0),[actionBusy,setActionBusy]=useState(''),[notice,setNotice]=useState('');
 const {confirm,dialogNode}=useAppDialog(),actionLock=useRef(false),copies=useRef(new Map<string,{action:'duplicate';id:string;revision:number;managementRevision:number;requestId:string}>());
 const [selected,setSelected]=useState<InvoiceManagement|null>(null),[selectionLoading,setSelectionLoading]=useState(false),[selectionError,setSelectionError]=useState('');
 useEffect(()=>{let alive=true;const timer=setTimeout(()=>{setSelected(null);setSelectionError('');if(!draftId||draftId==='nueva'){setSelectionLoading(false);return;}setSelectionLoading(true);void fetch('/api/pro/invoice-management?'+new URLSearchParams({id:draftId}),{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error(t('No se pudo comprobar el borrador.','Could not check the draft.'));const body=await response.json();if(alive)setSelected(body);}).catch(e=>{if(alive)setSelectionError((e as Error).message);}).finally(()=>{if(alive)setSelectionLoading(false);});},0);return()=>{alive=false;clearTimeout(timer);};},[draftId,refresh,t]);
 const listKey=(archived?'1':'0')+'|'+query;
 const [rows,setRows]=useState<DraftRow[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[dataQuery,setDataQuery]=useState(listKey),[retryAfter,setRetryAfter]=useState('');
 const pending=dataQuery!==listKey;
 const sequence=useRef(0),busy=useRef(false);
 const setSearch=(value:string)=>replaceProParams({buscarFactura:value||null});
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async(after='')=>{
  const token=++sequence.current;busy.current=true;setDataQuery(listKey);setLoading(true);setError('');setRetryAfter(after);
  try{
   const response=await fetch('/api/pro/invoice-management?'+new URLSearchParams({q:query,after,archived:archived?'1':'0'}),{cache:'no-store'}),body=await response.json();
   if(!response.ok)throw Error(t('No se pudieron cargar los borradores. Intente nuevamente.','Could not load drafts. Please try again.'));
   if(token!==sequence.current)return;
   setRows(old=>after?[...old,...(body.rows as DraftRow[]).filter(row=>!old.some(item=>item.id===row.id))]:body.rows);setCursor(body.nextCursor);
  }catch(e){if(token===sequence.current)setError(e instanceof TypeError?t('Revise su conexión e intente nuevamente.','Check your connection and try again.'):(e as Error).message);}
  finally{if(token===sequence.current){busy.current=false;setLoading(false);}}
 },[query,t,archived,listKey]);
 useEffect(()=>{const timer=setTimeout(()=>{setRows([]);setCursor(null);void load();},300);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate,refresh]);
 function saved(draft:InvoiceDraft){
  setSelected(old=>old?.id===draft.id?{...old,revision:draft.revision}:old);
  const fold=(value:string)=>value.toLowerCase().replace(/[áéíóúüñ]/g,letter=>({'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n'})[letter]!);
  setRows(old=>old.map(row=>row.id===draft.id?{...row,title:draft.title,receiver:draft.receiver.name,totalCents:draft.totalCents,updatedAt:draft.updatedAt,revision:draft.revision}:row).filter(row=>fold([row.title,row.receiver,row.client,row.work,row.quote].filter(Boolean).join(' ')).includes(fold(query.trim()))));
 }
 async function manage(row:InvoiceManagement,action:'archive'|'restore'|'duplicate'){
  if(actionLock.current)return;
  if(action==='archive'&&!(await confirm({title:t('¿Archivar este borrador?','Archive this draft?'),description:t('Se conservarán sus datos y podrá restaurarlo. No se elimina ni se emite ninguna factura.','Its data is retained and you can restore it. No invoice is deleted or issued.'),confirmLabel:t('Archivar borrador','Archive draft')})).confirmed)return;
  actionLock.current=true;setActionBusy(row.id);setError('');setNotice('');setRetryAfter('');
  const base={id:row.id,revision:row.revision,managementRevision:row.managementRevision};
  const payload=action==='duplicate'?(copies.current.get(row.id)??{...base,action,requestId:crypto.randomUUID()}):{...base,action};
  if(payload.action==='duplicate')copies.current.set(row.id,payload);
  try{const response=await fetch('/api/pro/invoice-management',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok){if(response.status===409&&action==='duplicate')copies.current.delete(row.id);throw Error(response.status===409?t('El borrador cambió. Actualice la lista antes de repetir.','The draft changed. Refresh the list before retrying.'):t('No se pudo completar la acción.','Could not complete the action.'));}
   if(action==='duplicate'){copies.current.delete(row.id);pushProParams({factura:body.id,detalleFactura:null});setNotice(t('Copia independiente creada. No registra deuda ni mueve inventario.','Independent copy created. It does not create debt or move stock.'));}
   else setNotice(action==='archive'?t('Borrador archivado. Sus datos se conservan.','Draft archived. Its data is retained.'):t('Borrador restaurado.','Draft restored.'));
   setRefresh(value=>value+1);
  }catch(e){setError(e instanceof TypeError?t('No se pudo confirmar la acción. Si duplicó, reintente el mismo botón para recuperar la copia sin duplicarla.','Could not confirm the action. If copying, retry the same button to recover the copy without duplicating it.'):(e as Error).message);}finally{actionLock.current=false;setActionBusy('');}
 }
 function actions(row:InvoiceManagement){return <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!!actionBusy} onClick={()=>void manage(row,row.archived?'restore':'archive')}>{row.archived?t('Restaurar','Restore'):t('Archivar','Archive')}</Button><Button type="button" variant="secondary" disabled={!!actionBusy} onClick={()=>void manage(row,'duplicate')}>{t('Duplicar borrador','Duplicate draft')}</Button><a href={'/api/pro/invoice-print?'+new URLSearchParams({id:row.id})} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[#e5e7eb] px-4 text-sm font-semibold">{t('Imprimir provisional','Print provisional copy')}</a></div>;}
 if(params.get('recurrencias')==='1')return <div className="space-y-4"><Button type="button" variant="secondary" onClick={()=>closeProStep('recurrencias','recurrentesQ','recurrente')}>{t('Volver a Facturación','Back to billing')}</Button><InvoiceRecurrenceWorkspace/></div>;
 return <section className="space-y-4" aria-label={t('Borradores de facturación','Billing drafts')}>
  <div><h2 className="text-lg font-bold text-[#162543]">{t('Borradores de factura','Invoice drafts')}</h2><p className="mt-1 text-sm text-[#52627a]">{t('Prepare una factura directa o revise los borradores de sus cotizaciones y trabajos.','Prepare a direct invoice or review drafts from your quotes and jobs.')}</p></div>
  <p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Solo borradores. No tienen validez fiscal ni realizan cobros.','Drafts only. They have no fiscal validity and do not charge payments.')}</p>
  <div className="flex items-center gap-2"><Button data-pro-write="finance.write" type="button" size="crear" className="w-full" onClick={()=>pushProParams({factura:'nueva',detalleFactura:'1'})}>{t('Nuevo borrador','New draft')}</Button><ProSectionActions><CardActionsMenu label={t('Opciones de facturación','Billing options')} placement="down" triggerClassName="h-11 w-11 border-0 hover:border-transparent" actions={[{label:t('Configurar emisor','Issuer settings'),onClick:()=>pushProParams({emisor:'1'})},{label:t('Configurar documentos','Document settings'),onClick:()=>pushProParams({configDocumento:'1'})},{label:t('Borradores recurrentes','Recurring drafts'),onClick:()=>pushProParams({recurrencias:'1'})},{label:t('Pagos recibidos','Received payments'),onClick:()=>pushProParams({pagos:'1'})},{label:t('Recibos de pagos','Payment receipts'),onClick:()=>pushProParams({recibos:'1'})}]}/></ProSectionActions></div>
  {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}
  <div role="group" aria-label={t('Mostrar borradores','Show drafts')}><StatusFilterTabs tabs={[{id:'active'},{id:'archived'}]} value={archived?'archived':'active'} onChange={value=>replaceProParams({archivadas:value==='archived'?'1':null})} labelFor={value=>value==='archived'?t('Archivados','Archived'):t('Activos','Active')} variant="pills" limpiable={false}/></div>
  <ProSearchField label={t('Buscar borradores','Search drafts')} placeholder={t('Cliente, cotización o trabajo','Customer, quote or job')} value={search} onChange={setSearch}/>
  <p className="text-xs text-[#68778d]">{t('Más recientes primero. También puede preparar un borrador desde una cotización o trabajo.','Newest first. You can also prepare a draft from a quote or job.')}</p>
  {error&&!pending&&<div role="alert" className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><p>{error}</p><Button variant="secondary" disabled={loading} onClick={()=>void load(retryAfter)}>{t('Reintentar','Retry')}</Button></div>}
  {pending||loading&&!rows.length?<p role="status" className="py-8 text-center text-sm">{t('Cargando borradores…','Loading drafts…')}</p>:!error&&!rows.length&&!cursor?<div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 text-center">
   <ReceiptText aria-hidden className="mx-auto mb-3 h-8 w-8 text-[#009FD9]"/><p className="font-semibold">{query?t('No hay borradores para esta búsqueda.','No drafts match this search.'):archived?t('No hay borradores archivados.','There are no archived drafts.'):t('Todavía no tiene borradores de factura.','You do not have invoice drafts yet.')}</p>
   {query?<Button variant="secondary" className="mt-4" onClick={()=>{setSearch('');replaceProParams({buscarFactura:null});}}>{t('Ver todos los borradores','View all drafts')}</Button>:archived?<Button variant="secondary" className="mt-4" onClick={()=>replaceProParams({archivadas:null})}>{t('Ver borradores activos','View active drafts')}</Button>:<div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={()=>navigatePro('quotes')}>{t('Ver cotizaciones','View quotes')}</Button><Button variant="secondary" onClick={()=>navigatePro('pro_clients')}>{t('Ver clientes y trabajos','View customers and jobs')}</Button></div>}
  </div>:null}
  <div className="space-y-3">{(!pending?rows:[]).map(row=><ProRecordCard key={row.id} icon={ReceiptText} title={row.title} subtitle={row.client}
   amount={proMoney(row.totalCents/100)} meta={<>{row.receiver!==row.client&&<span className="block">{t('Receptor: ','Recipient: ')}{row.receiver}</span>}{row.work&&<span className="block">{t('Trabajo: ','Job: ')}{row.work}</span>}{row.quote&&<span className="block">{t('Cotización: ','Quote: ')}{row.quote}</span>}<span className="block">{t('Borrador · Actualizado ','Draft · Updated ')}{new Intl.DateTimeFormat(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium'}).format(new Date(row.updatedAt))}</span></>}
   onOpen={()=>pushProParams({factura:row.id})} openLabel={t('Editar borrador','Edit draft')} openAriaLabel={t('Editar borrador: ','Edit draft: ')+row.title}
   actionsLabel={t('Opciones del borrador: ','Draft options: ')+row.title} actions={actionBusy?[]:[
    {label:row.archived?t('Restaurar','Restore'):t('Archivar','Archive'),onClick:()=>void manage(row,row.archived?'restore':'archive')},
    {label:t('Duplicar borrador','Duplicate draft'),onClick:()=>void manage(row,'duplicate')},
    {label:t('Imprimir provisional','Print provisional copy'),onClick:()=>{window.open('/api/pro/invoice-print?'+new URLSearchParams({id:row.id}),'_blank','noopener,noreferrer');}}
   ]}/>)}</div>
  {cursor&&!pending&&<Button variant="secondary" disabled={loading||!!error||search.trim()!==query} onClick={()=>{if(!busy.current)void load(cursor);}}>{loading?t('Cargando…','Loading…'):t('Ver más borradores','Show more drafts')}</Button>}
  {params.get('configDocumento')==='1'&&<InvoiceDocumentSettings/>}
  {params.get('configDocumento')!=='1'&&params.get('emisor')==='1'&&<InvoiceIssuerSettings/>}
  {params.get('configDocumento')!=='1'&&params.get('emisor')!=='1'&&draftId==='nueva'&&<InvoiceDetailEditor key="direct-new" onCreated={()=>setRefresh(value=>value+1)}/>}
  {params.get('configDocumento')!=='1'&&params.get('emisor')!=='1'&&draftId&&draftId!=='nueva'&&(selectionLoading||selectionError||!selected||selected.id!==draftId?<Modal closeLabel={t('Cerrar diálogo','Close dialog')} title={t('Borrador de factura','Invoice draft')} ariaLabel={t('Borrador de factura','Invoice draft')} onClose={()=>closeProStep('factura','detalleFactura')} mobilePresentation="fullscreen"><p role={selectionError?'alert':'status'}>{selectionError||t('Comprobando borrador…','Checking draft…')}</p>{selectionError&&<Button type="button" onClick={()=>setRefresh(value=>value+1)}>{t('Reintentar','Retry')}</Button>}</Modal>:selected.archived&&params.get('pagosFactura')!==draftId?<Modal closeLabel={t('Cerrar diálogo','Close dialog')} title={t('Borrador archivado','Archived draft')} ariaLabel={t('Borrador archivado','Archived draft')} onClose={()=>closeProStep('factura','detalleFactura')} mobilePresentation="fullscreen"><p className="mb-4 text-sm">{t('Sus datos se conservan. Restaure el borrador para editarlo.','Its data is retained. Restore the draft to edit it.')}</p>{actions(selected)}<Button type="button" variant="secondary" onClick={()=>pushProParams({pagosFactura:selected.id})}>{t('Pagos del borrador','Draft payments')}</Button></Modal>:<InvoiceDraftEditor key={draftId} onSaved={saved}/>)}
  <PaymentReceiptsWorkspace/>
  <PaymentOverview/>
  <ServicePackageManager/>
  {dialogNode}
 </section>;
}
