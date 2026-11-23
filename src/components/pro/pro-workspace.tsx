'use client';
import {CalendarAutoSyncTicker} from './company-connectors';
import { InvoiceWorkspace } from './invoice-workspace';
import {proPhone} from '@/lib/pro/phone';
import { proMoney } from '@/lib/pro/money';
import { ExpensesWorkspace } from './expenses-workspace';
import { CatalogSelect } from './catalog-select';
import { AgendaWorkspace } from './agenda-workspace';
import { CatalogWorkspace } from './catalog-workspace';
import { BusinessPanel } from './business-panel';
import { SocialPanel } from './social-panel';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { SectionHeadline } from '@/components/dashboard/section-headline';
import { businessSchema, emptyBusiness, saveClient, saveProduct, moveStock, saveQuote, saveAppointment, quoteTotal, costaRicaDate, type Business } from '@/lib/pro/business';
import { exportWork } from '@/lib/pro/workspace';
import {PRO_UI_ENABLED} from '@/lib/pro/enabled-client';
/** The local test view (/pro-preview) exists only in development builds and keeps its fictitious data in
 * memory: nothing is persisted in the browser, and production builds refuse to run without the server. */
const localPreviewAllowed=PRO_UI_ENABLED;
const localPreviewUnavailable='La vista local de pruebas solo existe en desarrollo.';
const tabs=['Agenda','Clientes','Cotizaciones','Inventario'] as const;
type Tab=typeof tabs[number]|'Redes'|'Facturación'|'Gastos';
const field='mt-1 block w-full rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-base';
const money=(n:number)=>proMoney(n,false);
const date=(value:string)=>value?new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Sin fecha';
function download(content:string,name:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ProWorkspace(props:Parameters<typeof Workspace>[0]){
 return <><CalendarAutoSyncTicker/><ProWorkspaceInner {...props}/></>;
}
/** Round 6C: the in-app calendar auto-sync scheduler runs alongside every Pro workspace (one per tab). */
function ProWorkspaceInner(props:Parameters<typeof Workspace>[0]){
 if(props.server&&props.embedded&&props.section==='Gastos')return <ExpensesWorkspace/>;
 if(props.server&&props.embedded&&props.section==='Facturación')return <InvoiceWorkspace/>;
 if(props.server&&props.embedded&&(!props.section||props.section==='Agenda'))return <AgendaWorkspace/>;
 if(props.server&&props.embedded&&(props.section==='Clientes'||props.section==='Inventario'))return <CatalogWorkspace key={props.section} kind={props.section==='Clientes'?'clients':'products'}/>;
 return <Workspace {...props}/>;
}
function Workspace({server=false,embedded=false,section,quoteListOnly=false,onlyQuoteId,english=false}:{english?:boolean;onlyQuoteId?:string;server?:boolean;embedded?:boolean;section?:Tab;quoteListOnly?:boolean}){
 const tr=(es:string,en:string)=>english?en:es;
 const Root=embedded?"div":"main";
 const [accountId,setAccountId]=useState('');
 const [legacyClientId,setLegacyClientId]=useState('');
 const revision=useRef(0);const mutation=useRef(false);const [saving,setSaving]=useState(false);
 const [data,setData]=useState<Business>(emptyBusiness);const [ready,setReady]=useState(false);const [tab,setTab]=useState<Tab>(section||'Agenda');const [editing,setEditing]=useState<string|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let alive=true;
 if(server){fetch(onlyQuoteId?'/api/pro/quotes?'+new URLSearchParams({id:onlyQuoteId,legacy:'1'}):'/api/pro/workspace',{cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error);if(alive){setAccountId(body.userId||'');setData(businessSchema.parse(body.document));revision.current=body.revision;setReady(true);}}).catch(e=>{if(alive)setError(e.message);});}
 else if(localPreviewAllowed)setReady(true);
 else setError(localPreviewUnavailable);
 return()=>{alive=false;};},[server,onlyQuoteId]);
 async function reload(){if(!server||mutation.current)return;try{const r=await fetch("/api/pro/workspace",{cache:"no-store"});const body=await r.json();if(!r.ok)throw Error(body.error);if(!mutation.current&&body.revision>=revision.current){setData(businessSchema.parse(body.document));revision.current=body.revision;setError("");}}catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar la agenda.");}}
 async function commit(next:Business){if(mutation.current||!ready)return false;mutation.current=true;setSaving(true);try{
 const valid=businessSchema.parse(next);
 if(server){const response=await fetch(onlyQuoteId?'/api/pro/quotes':'/api/pro/workspace',{method:onlyQuoteId?'PATCH':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(onlyQuoteId?{quote:valid.quotes.find(q=>q.id===onlyQuoteId),revision:revision.current}:{document:valid,revision:revision.current})});const result=await response.json();if(!response.ok)throw Error(result.error);revision.current=result.revision;}
 else if(!localPreviewAllowed)throw Error(localPreviewUnavailable);
 setData(valid);setError('');setEditing(null);return true;
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');return false;}finally{mutation.current=false;setSaving(false);}}
 function act(run:()=>Business){try{commit(run());}catch(e){setError(e instanceof Error?e.message:'Revise los datos.');}}
 function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const s=(k:string)=>String(f.get(k)||'');const n=(k:string)=>Number(f.get(k));const id=editing==='new'?crypto.randomUUID():editing!;
 act(()=>{
 if(tab==='Clientes')return saveClient(data,{...data.clients.find(c=>c.id===id),id,name:s('name'),email:s('email'),phone:s('phone'),notes:s('notes'),archived:false});
 if(tab==='Inventario')return saveProduct(data,{...data.products.find(p=>p.id===id),id,sku:s('sku'),name:s('name'),stock:editing==='new'?n('stock'):data.products.find(p=>p.id===id)!.stock,minimum:n('minimum'),cost:n('cost'),price:n('price'),archived:false});
 if(tab==='Cotizaciones'){const lines=JSON.parse(s('lines')) as Business['quotes'][number]['lines'];return saveQuote(data,{id,clientId:s('clientId'),title:s('title'),lines,status:'draft',validUntil:s('validUntil')});}
 return saveAppointment(data,{id,clientId:s('clientId'),client:s('clientId'),service:s('service'),stage:'scheduled',start:costaRicaDate(s('start')),end:costaRicaDate(s('end')),cancelled:false,quoteId:s('quoteId')||undefined});
 });}
 if(server&&embedded&&!quoteListOnly&&section&&section!=='Cotizaciones'&&section!=='Facturación'&&section!=='Gastos')return <div data-pro-workspace=""><BusinessPanel accountId={accountId} section={section} data={data} ready={ready} error={error} saving={saving} commit={commit} reload={()=>void reload()}/></div>;
 const row=editing&&editing!=='new'?(tab==='Clientes'?data.clients:tab==='Inventario'?data.products:tab==='Cotizaciones'?data.quotes:data.work).find(r=>r.id===editing):undefined;
 const values=(row||{}) as Record<string,unknown>;
 function input(name:string,label:string,type='text',required=true){let value=values[name]??'';if(type==='datetime-local'&&value)value=String(value).slice(0,16);return <label key={name} className="text-sm font-semibold">{label}<input name={name} type={type} required={required} min={type==='number'?0:undefined} step={type==='number'?'0.01':undefined} defaultValue={String(value)} className={field}/></label>;}
 const legacyClientSelect=server&&onlyQuoteId?<CatalogSelect kind="clients" label="Cliente" name="clientId" required value={legacyClientId||String(values.clientId||'')} selected={data.clients.find(c=>c.id===values.clientId)} onRows={rows=>setData(old=>({...old,clients:[...old.clients.filter(c=>!rows.some(r=>r.id===c.id)),...rows]}))} onChange={c=>setLegacyClientId(c?.id||'')}/>:null;
 const clientSelect=legacyClientSelect||<label className="text-sm font-semibold">Cliente<select aria-label="Cliente" name="clientId" required defaultValue={String(values.clientId||'')} className={field}><option value="">Seleccione un cliente</option>{data.clients.filter(c=>!c.archived).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>;
 return <Root data-pro-workspace="" className={quoteListOnly?"space-y-2":"mx-auto w-full min-w-0 max-w-6xl space-y-5 bg-[#f7f9fc] p-4 text-[#162543] sm:p-6"}>
 {!quoteListOnly&&<><header>{!embedded&&<h1 className="text-2xl font-bold">ContrataCR Pro</h1>}<p className="mt-1 text-sm text-[#68778d]">Su agenda, clientes y negocio en un solo lugar.</p></header>
 <p className="rounded-xl border border-[#d7e1ea] bg-white p-3 text-sm">{server?"Pro en desarrollo. Los registros se guardan en su cuenta de pruebas.":"Versión local de pruebas (solo desarrollo). Use datos ficticios: viven solo en esta pestaña y se pierden al recargar; descargue un respaldo si los necesita."} No emite facturas ni envía mensajes.</p></>}
 {!section&&<nav aria-label="Herramientas Pro" className="flex gap-2 overflow-x-auto">{tabs.map(t=><Button key={t} variant={tab===t?'default':'secondary'} aria-pressed={tab===t} onClick={()=>{setTab(t);setEditing(null);setError('');}}>{t}</Button>)}</nav>}
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error}</p>}
 {tab==='Redes'?<SocialPanel server={server}/>:<section className={quoteListOnly?"space-y-2":"space-y-5 rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-6"}>
 {!quoteListOnly&&<SectionHeadline subtitulo={tab==='Agenda'?'Citas en horario de Costa Rica.':`Administre sus ${tab.toLowerCase()}.`}><Button disabled={!ready||saving} size="crear" onClick={()=>setEditing('new')}>{tab==='Agenda'?'Nueva cita':tab==='Clientes'?'Nuevo cliente':tab==='Cotizaciones'?'Nueva cotización':'Nuevo producto'}</Button></SectionHeadline>}
 {editing&&<form key={tab+editing} onSubmit={submit} className="grid gap-4 rounded-2xl bg-[#f7f9fc] p-4 sm:grid-cols-2">
 {tab==='Clientes'&&<>{input('name','Nombre')}{input('email','Correo','email',false)}{input('phone','Teléfono','tel',false)}{input('notes','Notas','text',false)}</>}
 {tab==='Inventario'&&<>{input('sku','Código')}{input('name','Producto')}{editing==='new'&&input('stock','Existencias iniciales','number')}{input('minimum','Mínimo','number')}{input('cost','Costo unitario ₡','number')}{input('price','Precio unitario ₡','number')}</>}
 {tab==='Agenda'&&<>{clientSelect}{input('service','Trabajo')}{input('start','Inicio · Costa Rica','datetime-local')}{input('end','Final · Costa Rica','datetime-local')}<label>Cotización aceptada (opcional)<select name="quoteId" defaultValue={String(values.quoteId||'')} className={field}><option value="">Sin cotización</option>{data.quotes.filter(q=>q.status==='accepted').map(q=><option key={q.id} value={q.id}>{q.title}</option>)}</select></label></>}
 {tab==='Cotizaciones'&&<>{clientSelect}{input('title','Título')}{input('validUntil','Válida hasta','date')}<QuoteLines remote={server&&!!onlyQuoteId} initial={values.lines as Business['quotes'][number]['lines']|undefined} products={data.products}/></>}
 <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar"}</Button><Button type="button" variant="secondary" onClick={()=>{setLegacyClientId('');setEditing(null);}}>Cancelar</Button></div>
 </form>}
 {tab==='Clientes'&&data.clients.map(c=><Card key={c.id} title={c.name} detail={[c.email,proPhone(c.phone),c.archived?'Archivado':c.notes].filter(Boolean).join(' · ')}><Button variant="secondary" onClick={()=>setEditing(c.id)}>Editar</Button><Button variant="ghost" onClick={()=>act(()=>saveClient(data,{...c,archived:!c.archived}))}>{c.archived?'Restaurar':'Archivar'}</Button></Card>)}
 {tab==='Agenda'&&[...data.work].sort((a,b)=>a.start.localeCompare(b.start)).map(w=><Card key={w.id} title={`${w.client} · ${w.service}`} detail={`${date(w.start)} — ${date(w.end)} · ${w.cancelled?'Cancelada':w.stage==='completed'?'Finalizada':'Agendada'}`}><Button variant="secondary" onClick={()=>setEditing(w.id)}>Editar</Button>{!w.cancelled&&w.stage!=='completed'&&<><Button variant="ghost" onClick={()=>act(()=>saveAppointment(data,{...w,stage:'completed'}))}>Finalizar</Button><Button variant="ghost" onClick={()=>act(()=>saveAppointment(data,{...w,cancelled:true}))}>Cancelar cita</Button></>}</Card>)}
 {tab==='Cotizaciones'&&data.quotes.filter(q=>!onlyQuoteId||q.id===onlyQuoteId).map(q=><Card key={q.id} title={q.title} detail={`${data.clients.find(c=>c.id===q.clientId)?.name} · ${money(quoteTotal(q.lines))} · ${q.status==='draft'?tr('Borrador','Draft'):q.status==='accepted'?tr('Aceptada','Accepted'):tr('Rechazada','Declined')}`}>
 {quoteListOnly&&<div className="space-y-3 text-sm text-[#52627a]">{q.lines.map((line,index)=><div key={index} className="flex justify-between gap-4 border-b border-[#eef2f6] pb-3"><span className="min-w-0 break-words">{line.description}<span className="block text-xs">{line.quantity} × {money(line.price)} · IVA {line.tax} %</span></span><strong className="shrink-0">{money(quoteTotal([line]))}</strong></div>)}<p className="text-xs">{tr('Válida hasta','Valid until')}: {q.validUntil}</p></div>}
 {q.status==='draft'&&<><Button variant="secondary" onClick={()=>{setLegacyClientId('');setEditing(q.id);}}>Editar</Button><Button variant="secondary" onClick={()=>act(()=>saveQuote(data,{...q,status:'accepted'}))}>{tr('Registrar aceptación','Record acceptance')}</Button><Button variant="secondary" onClick={()=>act(()=>saveQuote(data,{...q,status:'declined'}))}>{tr('Registrar rechazo','Record rejection')}</Button></>}
 <Button variant="secondary" onClick={()=>download(`Cotización — no es factura electrónica\n${q.title}\n${q.lines.map(l=>`${l.description}: ${l.quantity} × ${money(l.price)} + ${l.tax} %`).join('\n')}\nTotal ${money(quoteTotal(q.lines))}`,'cotizacion.txt','text/plain;charset=utf-8')}>{tr('Descargar','Download')}</Button></Card>)}
 {tab==='Inventario'&&data.products.map(p=><Card key={p.id} title={`${p.name} · ${p.sku}`} detail={`${p.stock} ${p.stock===1?"unidad":"unidades"} · ${money(p.price)}${p.stock<=p.minimum?' · Existencias bajas':''}${p.archived?' · Archivado':''}`}><Button variant="secondary" onClick={()=>setEditing(p.id)}>Editar</Button><StockForm disabled={p.archived} save={(delta,reason)=>act(()=>moveStock(data,p.id,delta,reason,crypto.randomUUID(),new Date().toISOString()))}/></Card>)}
 {!quoteListOnly&&(tab==='Agenda'?data.work:tab==='Clientes'?data.clients:tab==='Cotizaciones'?data.quotes:data.products).length===0&&<p className="py-8 text-center text-[#68778d]">Todavía no hay registros. Agregue el primero para comenzar.</p>}
 {tab==='Inventario'&&data.movements.length>0&&<details><summary>Historial de movimientos</summary>{[...data.movements].reverse().map(m=><p key={m.id} className="border-b py-2 text-sm">{data.products.find(p=>p.id===m.productId)?.name} · {m.delta>0?'+':''}{m.delta} · {m.reason} · {date(m.at)}</p>)}</details>}
 </section>}
 {!quoteListOnly&&<><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!ready||saving} onClick={()=>download(JSON.stringify(data,null,2),'contratacr-pro-respaldo.json','application/json')}>{server?"Descargar respaldo":"Descargar respaldo local"}</Button><Button variant="secondary" onClick={()=>download(exportWork(data.work),'agenda.csv','text/csv;charset=utf-8')}>Agenda para Excel</Button></div>
 <p className="text-xs text-[#68778d]">Chat y contacto continúan gratis. Facturación electrónica, patrocinados y consultas de identificación aún no están habilitados.</p></>}
 </Root>;
}
function Card({title,detail,children}:{title:string;detail:string;children:React.ReactNode}){return <article className="space-y-3 rounded-2xl border border-[#e5e7eb] p-4"><h2 className="break-words font-bold">{title}</h2><p className="break-words text-sm text-[#68778d]">{detail}</p><div className="flex flex-wrap gap-2">{children}</div></article>;}
function StockForm({save,disabled}:{save:(delta:number,reason:string)=>void;disabled:boolean}){return <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);save(Number(f.get('delta')),String(f.get('reason')));}}><input aria-label="Cantidad del movimiento" name="delta" type="number" step="0.001" required placeholder="+ entrada / − salida" className="min-h-11 w-40 rounded-xl border border-[#d7e1ea] bg-white p-2"/><input aria-label="Motivo del movimiento" name="reason" required placeholder="Motivo" className="min-h-11 w-40 rounded-xl border border-[#d7e1ea] bg-white p-2"/><Button disabled={disabled} variant="secondary">Registrar movimiento</Button></form>;}
function QuoteLines({initial,products,remote=false}:{remote?:boolean;initial?:Business['quotes'][number]['lines'];products:Business['products']}){const [lines,setLines]=useState(initial||[{description:'',quantity:1,price:0,tax:13}]);return <div className="space-y-3 sm:col-span-2"><input type="hidden" name="lines" value={JSON.stringify(lines)}/>{lines.map((l,i)=><fieldset key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-4"><legend>Línea {i+1}</legend>{(['description','quantity','price','tax'] as const).map(k=><label key={k} className="text-sm">{{description:'Descripción',quantity:'Cantidad',price:'Precio ₡',tax:'IVA %'}[k]}<input required className={field} type={k==='description'?'text':'number'} min={k==='quantity'?0.001:0} max={k==='tax'?100:undefined} step="0.001" value={l[k]} onChange={e=>setLines(lines.map((row,j)=>j===i?{...row,[k]:k==='description'?e.target.value:Number(e.target.value)}:row))}/></label>)}<Button type="button" variant="ghost" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,j)=>i!==j))}>Quitar línea</Button></fieldset>)}<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={()=>setLines([...lines,{description:'',quantity:1,price:0,tax:13}])}>Añadir línea</Button>{remote?<CatalogSelect kind="products" label="Agregar producto a cotización" value="" onChange={p=>{if(p)setLines([...lines,{description:p.name,quantity:1,price:p.price,tax:13}]);}}/>:<select aria-label="Agregar producto a cotización" className="rounded-xl border p-2" value="" onChange={e=>{const p=products.find(p=>p.id===e.target.value);if(p)setLines([...lines,{description:p.name,quantity:1,price:p.price,tax:13}]);}}><option value="">Agregar desde inventario</option>{products.filter(p=>!p.archived).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div><p className="font-bold">Total: {money(quoteTotal(lines))}</p><p className="text-xs text-[#68778d]">Precios antes de IVA. Revise la tarifa de cada línea. Cotizar no descuenta inventario.</p></div>;}
