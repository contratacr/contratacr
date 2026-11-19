'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {proCount} from '@/lib/pro/plural';
import {vatCodes,vatLabel,type AccountingMapping} from '@/lib/pro/integrations/accounting/model';
import {useProSearchParams} from './use-pro-search-params';

/**
 * Round 6B: Company › Contabilidad. QuickBooks Online (OAuth connect/disconnect, mapping of accounts and IVA
 * codes, sync of customers / invoices / payments with conflict handling) and the CSV export usable by any
 * Costa Rica accounting system.
 */
type Option={id:string;name:string;type:string};
type Link={entity:'customer'|'invoice'|'payment';localId:string;remoteId:string|null;label:string;status:string;error?:string|null;conflict:{reason:string;local:Record<string,unknown>;remote:Record<string,unknown>|null}|null};
type Read={mode:string;modeStatus:string;connected:boolean;mapping:AccountingMapping;options:{accounts:Option[];taxCodes:Option[]}|null;links:Link[];gaps:string[];counts:{customers:number;invoices:number;emitted:number;payments:number}};
type Conn={provider:string;status:string;mode:string;revision:number;accountEmail:string|null;realmId:string|null};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
export function CompanyAccounting(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog(),params=useProSearchParams();
 const [data,setData]=useState<Read|null>(null),[conn,setConn]=useState<Conn|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const [a,c]=await Promise.all([fetch('/api/pro/accounting',{cache:'no-store'}),fetch('/api/pro/connectors',{cache:'no-store'})]);if(!a.ok||!c.ok)throw Error();const body=await a.json() as Read,connectors=await c.json() as {connections:Conn[]};
  if(n!==seq.current)return;setData(body);setConn(connectors.connections.find(row=>row.provider==='quickbooks'&&row.status==='connected')??null);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(url:string,payload:Record<string,unknown>){
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));
   if(!response.ok){setError(en?({missing_keys:'QuickBooks server keys are missing.',not_connected:'Connect QuickBooks first.',no_conflict:'That conflict was already resolved.',remote_deleted:'The record no longer exists in QuickBooks: keep the ContrataCR version.'} as Record<string,string>)[json.reason]??(response.status===409?'The data changed. It was reloaded.':'Could not complete it.'):json.error??'No se pudo completar.');return null;}
   return json as Record<string,unknown>;
  }catch{setError(t('No se pudo comprobar la operación. Reintente.','Could not confirm the operation. Retry.'));return null;}
  finally{setBusy(false);await load();}
 }
 async function connect(){const body=await post('/api/pro/connectors',{action:'connect',provider:'quickbooks',locale:en?'en':'es',view:'contabilidad'});if(body?.authorizeUrl)window.location.assign(String(body.authorizeUrl));}
 async function disconnect(){if(!conn)return;const answer=await confirm({cancelLabel:t('Cancelar','Cancel'),title:t('¿Desconectar QuickBooks?','Disconnect QuickBooks?'),description:t('Se revoca el acceso y se borran los tokens cifrados. Los vínculos ya sincronizados se conservan.','Access is revoked and the encrypted tokens are deleted. Synced links are kept.'),confirmLabel:t('Desconectar','Disconnect'),tone:'danger'});
  if(answer.confirmed)await post('/api/pro/connectors',{action:'disconnect',actionId:crypto.randomUUID(),provider:'quickbooks',revision:conn.revision});}
 async function sync(){const body=await post('/api/pro/accounting',{action:'sync',actionId:crypto.randomUUID()});if(!body)return;const n=(key:string)=>Number(body[key]??0);
  setNotice((body.gaps as string[]).length?t('Complete el mapeo antes de sincronizar.','Complete the mapping before syncing.'):(en?'Synced: ':'Sincronizado: ')+[proCount(n('created'),en,['creado','creados'],['created','created']),proCount(n('updated'),en,['actualizado','actualizados'],['updated','updated']),proCount(n('remoteKept'),en,['conservado de QuickBooks','conservados de QuickBooks'],['kept from QuickBooks','kept from QuickBooks']),proCount(n('conflicts'),en,['conflicto','conflictos'],['conflict','conflicts']),proCount(n('errors'),en,['con error','con error'],['with an error','with errors'])].join(', ')+'.');}
 if(failed&&!data)return <div role="alert" className="space-y-2 text-sm"><p>{t('No se pudo cargar la contabilidad.','Could not load accounting.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const oauth=params.get('oauth'),mock=data.mode==='mock';
 const gapText=(gap:string)=>gap==='income'?t('Falta el artículo/cuenta de ingresos.','The income item/account is missing.'):gap==='deposit'?t('Falta la cuenta de depósito para pagos.','The deposit account for payments is missing.'):t('Falta el código de impuesto para ','The tax code is missing for ')+vatLabel(gap.slice(4),en);
 const entityLabel=(e:string)=>e==='customer'?t('Cliente','Customer'):e==='invoice'?t('Factura','Invoice'):t('Pago','Payment');
 return <div data-company-accounting data-accounting-mode={data.mode} className="min-w-0 space-y-4">
  {oauth&&<p role="status" data-oauth-result={oauth} className={'text-sm '+(oauth==='connected'?'text-emerald-800':'text-amber-900')}>{oauth==='connected'?t('QuickBooks conectado.','QuickBooks connected.'):oauth==='denied'?t('Conexión cancelada.','Connection cancelled.'):t('No se pudo conectar QuickBooks.','Could not connect QuickBooks.')}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-accounting-notice className="text-sm text-emerald-800">{notice}</p>}
  <section className={card} data-quickbooks={data.connected?'connected':'disconnected'} aria-labelledby="qbo-title">
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><h3 id="qbo-title" className="font-bold">QuickBooks Online</h3><span className="rounded-lg bg-[#f3f8fb] px-2 py-0.5 text-xs font-bold">{mock?t('Simulación local','Local simulation'):data.mode==='sandbox'?t('Pruebas (sandbox de Intuit)','Test (Intuit sandbox)'):t('Producción','Production')}</span></div>
   <p data-qbo-counts className="text-sm text-[#52627a]">{t('Se sincronizan: ','Synced: ')}{proCount(data.counts.customers,en,['cliente','clientes'],['customer','customers'])} · {proCount(data.mapping.invoiceScope==='all'?data.counts.invoices:data.counts.emitted,en,['factura','facturas'],['invoice','invoices'])} · {proCount(data.counts.payments,en,['pago aplicado','pagos aplicados'],['applied payment','applied payments'])}</p>
   {data.connected&&conn?<><p className="text-sm">{t('Empresa QuickBooks: ','QuickBooks company: ')}<strong>{conn.realmId}</strong> · {conn.accountEmail}</p><div className="flex flex-wrap gap-2"><Button type="button" data-qbo-sync disabled={busy||data.gaps.length>0} onClick={()=>void sync()}>{t('Sincronizar ahora','Sync now')}</Button><Button type="button" variant="secondary" className="text-red-700" data-qbo-disconnect disabled={busy} onClick={()=>void disconnect()}>{t('Desconectar','Disconnect')}</Button></div></>
   :data.modeStatus==='ready'?<Button type="button" data-qbo-connect disabled={busy} onClick={()=>void connect()}>{t('Conectar QuickBooks','Connect QuickBooks')}</Button>
   :<p className="text-sm text-amber-900">{t('No disponible en este modo: faltan claves en el servidor o producción está bloqueada.','Unavailable in this mode: server keys missing or production blocked.')}</p>}
   {data.connected&&data.gaps.length>0&&<ul data-qbo-gaps className="list-disc pl-5 text-sm text-amber-900">{data.gaps.map(g=><li key={g}>{gapText(g)}</li>)}</ul>}
  </section>
  {data.connected&&data.options&&<MappingForm key={data.mapping.revision} mapping={data.mapping} options={data.options} busy={busy} onSave={value=>post('/api/pro/accounting',{action:'save_mapping',actionId:crypto.randomUUID(),...value}).then(r=>{if(r)setNotice(t('Mapeo guardado.','Mapping saved.'));})}/>}
  {data.links.length>0&&<section className={card} aria-labelledby="qbo-links" data-qbo-links><h3 id="qbo-links" className="font-bold">{t('Registros sincronizados','Synced records')}</h3>
   <ul className="space-y-2">{data.links.map(link=><li key={link.entity+link.localId} data-qbo-link={link.entity} data-qbo-link-status={link.status} className="min-w-0 space-y-2 rounded-xl border border-[#e5e7eb] p-3 text-sm">
    <div className="flex min-w-0 flex-wrap justify-between gap-2"><span className="min-w-0 break-words"><strong>{entityLabel(link.entity)}</strong> · {link.label}{link.remoteId?` · QuickBooks #${link.remoteId}`:''}</span><span className={'rounded-full px-2 py-0.5 text-xs font-bold '+(link.status==='synced'?'bg-emerald-50 text-emerald-800':link.status==='conflict'?'bg-amber-50 text-amber-900':'bg-red-50 text-red-800')}>{link.status==='synced'?t('Sincronizado','Synced'):link.status==='conflict'?t('Conflicto','Conflict'):t('Error','Error')}</span></div>
    {link.status==='error'&&link.error&&<p className="text-red-700">{link.error}</p>}
    {link.conflict&&<div data-qbo-conflict={link.conflict.reason} className="space-y-2 rounded-lg bg-amber-50 p-2"><p className="font-semibold">{link.conflict.reason==='remote_deleted'?t('Se borró en QuickBooks.','Deleted in QuickBooks.'):t('Cambió en ContrataCR y en QuickBooks desde la última sincronización. No se sobrescribió nada.','Changed in ContrataCR and in QuickBooks since the last sync. Nothing was overwritten.')}</p>
     {link.conflict.remote?.note!==undefined&&<p className="break-words text-xs">QuickBooks: {String(link.conflict.remote.note)}</p>}
     <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" data-qbo-keep="local" disabled={busy} onClick={()=>void post('/api/pro/accounting',{action:'resolve',actionId:crypto.randomUUID(),entity:link.entity,localId:link.localId,choice:'keep_local'})}>{t('Conservar ContrataCR','Keep ContrataCR')}</Button>
      {link.conflict.remote&&<Button type="button" variant="secondary" data-qbo-keep="remote" disabled={busy} onClick={()=>void post('/api/pro/accounting',{action:'resolve',actionId:crypto.randomUUID(),entity:link.entity,localId:link.localId,choice:'keep_remote'})}>{t('Conservar QuickBooks','Keep QuickBooks')}</Button>}</div></div>}
    {mock&&link.status==='synced'&&link.entity!=='payment'&&<Button type="button" variant="secondary" data-qbo-simulate-edit={link.localId} disabled={busy} onClick={()=>void post('/api/pro/accounting',{action:'simulate_remote_edit',actionId:crypto.randomUUID(),entity:link.entity,localId:link.localId})}>{t('Simular: editar en QuickBooks','Simulate: edit in QuickBooks')}</Button>}
   </li>)}</ul></section>}
  <CsvExport scope={data.mapping.invoiceScope}/>
  {dialogNode}
 </div>;
}
function MappingForm({mapping,options,busy,onSave}:{mapping:AccountingMapping;options:{accounts:Option[];taxCodes:Option[]};busy:boolean;onSave:(value:Omit<AccountingMapping,'updatedAt'>)=>Promise<void>}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [income,setIncome]=useState(mapping.incomeAccount),[deposit,setDeposit]=useState(mapping.depositAccount),[vat,setVat]=useState<Record<string,string>>(mapping.vatMap as Record<string,string>),[scope,setScope]=useState(mapping.invoiceScope);
 function submit(event:FormEvent){event.preventDefault();void onSave({revision:mapping.revision,incomeAccount:income,depositAccount:deposit,vatMap:Object.fromEntries(Object.entries(vat).filter(([,v])=>v)) as AccountingMapping['vatMap'],invoiceScope:scope});}
 return <section className={card} aria-labelledby="qbo-mapping" data-qbo-mapping><h3 id="qbo-mapping" className="font-bold">{t('Mapeo contable','Accounting mapping')}</h3>
  <form onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-bold">{t('Artículo/cuenta de ingresos','Income item/account')}<select data-qbo-field="income" className={field} value={income} onChange={e=>setIncome(e.target.value)}><option value="">{t('Elija…','Choose…')}</option>{options.accounts.filter(a=>a.type==='Income').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label className="block min-w-0 text-sm font-bold">{t('Cuenta de depósito de pagos','Payment deposit account')}<select data-qbo-field="deposit" className={field} value={deposit} onChange={e=>setDeposit(e.target.value)}><option value="">{t('Elija…','Choose…')}</option>{options.accounts.filter(a=>a.type!=='Income').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <fieldset className="min-w-0 space-y-2 sm:col-span-2"><legend className="text-sm font-bold">{t('Código de impuesto de QuickBooks para cada IVA de Costa Rica','QuickBooks tax code for each Costa Rica VAT')}</legend>
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">{vatCodes.map(([code])=><label key={code} className="block min-w-0 text-sm">{vatLabel(code,en)} <span className="text-xs text-[#52627a]">({code})</span><select data-qbo-vat={code} className={field} value={vat[code]??''} onChange={e=>setVat(old=>({...old,[code]:e.target.value}))}><option value="">{t('Sin mapear','Not mapped')}</option>{options.taxCodes.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}</div></fieldset>
   <fieldset className="min-w-0 space-y-1 sm:col-span-2"><legend className="text-sm font-bold">{t('Facturas a sincronizar','Invoices to sync')}</legend>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="qbo-scope" data-qbo-scope="emitted" checked={scope==='emitted'} onChange={()=>setScope('emitted')}/>{t('Solo emitidas y aceptadas por Hacienda','Only issued and accepted by Hacienda')}</label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="qbo-scope" data-qbo-scope="all" checked={scope==='all'} onChange={()=>setScope('all')}/>{t('También borradores internos','Also internal drafts')}</label></fieldset>
   <div className="sm:col-span-2"><Button type="submit" data-qbo-save-mapping disabled={busy}>{t('Guardar mapeo','Save mapping')}</Button></div>
  </form></section>;
}
function CsvExport({scope}:{scope:'emitted'|'all'}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [kind,setKind]=useState<'invoices'|'payments'|'customers'>('invoices'),[format,setFormat]=useState<'cr'|'standard'>('cr'),[which,setWhich]=useState(scope),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const href='/api/pro/accounting-export?'+new URLSearchParams({kind,format,...(kind==='customers'?{}:{scope:which}),...(from?{from}:{}),...(to?{to}:{}),lang:en?'en':'es'});
 return <section className={card} aria-labelledby="csv-title" data-accounting-csv><h3 id="csv-title" className="font-bold">{t('Exportar CSV (cualquier sistema contable)','Export CSV (any accounting system)')}</h3>
  <p className="text-sm text-[#52627a]">{t('Para su contador o sistemas como los que se usan en Costa Rica: una fila por factura con base e IVA por tarifa, número y clave de Hacienda.','For your accountant or systems used in Costa Rica: one row per invoice with base and VAT per rate, number and Hacienda key.')}</p>
  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-bold">{t('Qué exportar','What to export')}<select data-csv-field="kind" className={field} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="invoices">{t('Facturas','Invoices')}</option><option value="payments">{t('Pagos','Payments')}</option><option value="customers">{t('Clientes','Customers')}</option></select></label>
   <label className="block min-w-0 text-sm font-bold">{t('Formato','Format')}<select data-csv-field="format" className={field} value={format} onChange={e=>setFormat(e.target.value as typeof format)}><option value="cr">{t('Excel Costa Rica (; y coma decimal)','Excel Costa Rica (; and decimal comma)')}</option><option value="standard">{t('CSV estándar (, y punto decimal)','Standard CSV (, and decimal point)')}</option></select></label>
   {kind!=='customers'&&<label className="block min-w-0 text-sm font-bold">{t('Facturas','Invoices')}<select data-csv-field="scope" className={field} value={which} onChange={e=>setWhich(e.target.value as typeof which)}><option value="emitted">{t('Solo emitidas','Issued only')}</option><option value="all">{t('Incluir borradores','Include drafts')}</option></select></label>}
   {kind!=='customers'&&<div className="grid min-w-0 grid-cols-2 gap-2"><label className="block min-w-0 text-sm font-bold">{t('Desde','From')}<input type="date" data-csv-field="from" className={field} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="block min-w-0 text-sm font-bold">{t('Hasta','To')}<input type="date" data-csv-field="to" className={field} value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
  </div>
  <a data-csv-download href={href} className="inline-flex min-h-11 items-center rounded-full bg-[#008bb5] px-5 text-sm font-semibold text-white">{t('Descargar CSV','Download CSV')}</a>
 </section>;
}
