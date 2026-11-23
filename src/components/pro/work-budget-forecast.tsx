'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {navigatePro,pushProParams} from '@/lib/pro/navigation';
import {ProModal as Modal} from './modal';
import {WorkProfitability} from './work-profitability';
import {WorkBudgetSync} from './work-budget-sync';
import {ProRoleCostNotice,useProInternalFinance} from './company-team';
import {useProSearchParams} from './use-pro-search-params';
import {
 budgetExtrasResultSchema,budgetForecastSchema,budgetLineFigures,budgetVatLabel,budgetVatOptions,costCodeLibrarySchema,markupBpToInput,markupInputToBp,markupLabel,
 type BudgetExtrasMutation,type BudgetForecast,type BudgetForecastRow,type BudgetStatus,type BudgetVatCode,type CostCodeLibrary,
} from '@/lib/pro/cost-codes';

/**
 * Row 54 (Ronda F1-B): the project's budget view (Finanzas › Presupuesto). Sale side per line (cost, markup, VAT,
 * sale and total), forecast on cost (committed, actual, estimate at completion, variance, consumed, warnings),
 * library codes applied to the project and the explicit client summary share. Codes and planned amounts keep being
 * edited in the existing budget dialog (Costs & payments), whose API is unchanged.
 */
const api='/api/pro/work-budget-forecast';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
type Tab='sale'|'forecast';
type PriceEditor={codeId:string;markup:string;vatCode:BudgetVatCode|'';all:boolean};

function copy(en:boolean){return en?{
 colSale:'Sale (pre-VAT)',colTotal:'Total with VAT',
 title:'Budget and forecast',intro:'Planned cost per code, your sale price with markup and VAT, and the estimate at completion with what is already committed and spent.',
 apply:'Apply library codes',editCodes:'Edit codes and planned costs',refresh:'Refresh',
 cost:'Planned cost',sale:'Sale price (before VAT)',vat:'VAT',total:'Total for the customer',committed:'Committed',actual:'Actual',eac:'Estimate at completion',variance:'Planned − estimate',
 consumed:'Consumed',consumedOf:(p:string)=>`${p} of the planned cost already spent`,markup:'Markup',remaining:'Remaining',
 tabSale:'Sale price',tabForecast:'Forecast',code:'Code',noRows:'This budget has no codes yet. Apply codes from your library or create them in the budget dialog.',
 group:'Group',archived:'Archived',fromLibrary:'Library',editPrice:'Markup and VAT',savePrice:'Save markup and VAT',cancel:'Cancel',
 markupField:'Markup (%)',vatField:'VAT tariff',applyAll:'Apply to every active line of this budget',preview:'Preview',
 status:{ok:'On track',watch:'Near the limit',over:'Over budget',incomplete:'Time without cost',idle:'No activity'} as Record<BudgetStatus,string>,
 overBanner:(n:number)=>n===1?'1 line is expected to exceed its planned cost.':`${n} lines are expected to exceed their planned cost.`,
 watchBanner:(n:number)=>n===1?'1 line has used 90 % or more of its planned cost.':`${n} lines have used 90 % or more of their planned cost.`,
 incompleteBanner:'Some recorded time has no hourly cost, so the variance is incomplete. Add the cost in Costs & payments.',
 uncoded:'Without code',uncodedText:'Purchase orders and costs that are not assigned to a code. They are included in the estimate at completion.',
 shareTitle:'Summary for the customer',shareIntro:'The customer sees the groups and the sale totals (subtotal, VAT and total) in their project. Never costs, markup, commitments or actual spending.',
 shareNow:'Share with the customer',shareAgain:'Update what the customer sees',revoke:'Stop sharing',sharedOn:(d:string)=>`Shared on ${d}`,notShared:'Not shared with the customer.',
 stale:'The budget changed since you shared it. The customer still sees the previous version.',noCustomer:'This project has no customer with a linked account yet. They will see the summary once they join the project.',
 forCustomer:(name:string)=>`Visible to "${name}".`,other:'Other work',subtotal:'Subtotal',nothing:'Add active lines with a planned cost to share a summary.',
 shareConfirm:'Share the summary with the customer?',shareText:'They will see the groups and the sale totals shown here. ContrataCR does not send anything: the summary appears in the customer\'s project.',
 revokeConfirm:'Stop sharing the summary?',revokeText:'The customer stops seeing it. You can share it again at any time.',
 shared:'Summary shared with the customer.',revoked:'The customer no longer sees the summary.',priced:'Markup and VAT saved.',
 appliedNotice:(c:number,l:number,s:number)=>`${c===1?'1 code':c+' codes'} added to the budget${l?`, ${l} linked to ${l===1?'an existing code':'existing codes'}`:''}${s?`, ${s} skipped (same code with another type or archived)`:''}.`,
 history:'Sharing history',revokedReason:{revoked:'Stopped',replaced:'Replaced by a newer version'} as Record<string,string>,activeShare:'Visible now',
 pickTitle:'Apply library codes',pickIntro:'The chosen codes are added to this budget with a planned cost of ₡0 and their default unit, VAT and markup. A code that already exists here is linked and never changed.',
 inBudget:'Already linked to this budget',willLink:'A code with this number exists here: it will be linked without changes',pickNone:'Your library has no active codes yet.',openLibrary:'Open the library',
 pickApply:(n:number)=>n===1?'Apply 1 code':`Apply ${n} codes`,selectAll:'Select all',selectNone:'Clear',
 conflict:'The budget changed. It was refreshed: review it and try again.',failed:'Could not confirm the change. Retry: the same request is sent again and is never applied twice.',retry:'Retry',
 invalid:'Check the markup (up to two decimals, maximum 1000 %).',loadError:'Could not load the budget.',loading:'Loading…',readOnly:'The project or its customer is archived or cancelled: the budget is read only.',
 limit:'The budget reached 500 codes.',
}:{
 colSale:'Venta sin IVA',colTotal:'Total con IVA',
 title:'Presupuesto y previsión',intro:'El costo previsto por código, su precio de venta con markup e IVA, y el estimado al terminar con lo ya comprometido y gastado.',
 apply:'Aplicar códigos de la biblioteca',editCodes:'Editar códigos y costos previstos',refresh:'Actualizar',
 cost:'Costo previsto',sale:'Precio de venta (sin IVA)',vat:'IVA',total:'Total para el cliente',committed:'Comprometido',actual:'Real',eac:'Estimado al terminar',variance:'Previsto − estimado',
 consumed:'Consumido',consumedOf:(p:string)=>`${p} del costo previsto ya gastado`,markup:'Markup',remaining:'Por gastar',
 tabSale:'Precio de venta',tabForecast:'Previsión',code:'Código',noRows:'Este presupuesto todavía no tiene códigos. Aplique códigos de su biblioteca o créelos en el diálogo de presupuesto.',
 group:'Grupo',archived:'Archivado',fromLibrary:'Biblioteca',editPrice:'Markup e IVA',savePrice:'Guardar markup e IVA',cancel:'Cancelar',
 markupField:'Markup (%)',vatField:'Tarifa de IVA',applyAll:'Aplicar a todas las partidas activas de este presupuesto',preview:'Vista previa',
 status:{ok:'En rango',watch:'Cerca del límite',over:'Sobre lo previsto',incomplete:'Tiempo sin valorar',idle:'Sin movimiento'} as Record<BudgetStatus,string>,
 overBanner:(n:number)=>n===1?'1 partida va a superar su costo previsto.':`${n} partidas van a superar su costo previsto.`,
 watchBanner:(n:number)=>n===1?'1 partida ya usó el 90 % o más de su costo previsto.':`${n} partidas ya usaron el 90 % o más de su costo previsto.`,
 incompleteBanner:'Hay tiempo registrado sin costo por hora, así que la desviación queda incompleta. Agregue el costo en Costos y pagos.',
 uncoded:'Sin código',uncodedText:'Órdenes de compra y costos que no están asignados a un código. Se suman al estimado al terminar.',
 shareTitle:'Resumen para el cliente',shareIntro:'El cliente ve en su proyecto los grupos y los totales de venta (subtotal, IVA y total). Nunca costos, markup, compromisos ni gastos reales.',
 shareNow:'Compartir con el cliente',shareAgain:'Actualizar lo que ve el cliente',revoke:'Dejar de compartir',sharedOn:(d:string)=>`Compartido el ${d}`,notShared:'No se ha compartido con el cliente.',
 stale:'El presupuesto cambió desde que lo compartió. El cliente sigue viendo la versión anterior.',noCustomer:'Este proyecto todavía no tiene un cliente con cuenta vinculada. Verá el resumen cuando se una al proyecto.',
 forCustomer:(name:string)=>`Lo verá "${name}".`,other:'Otros trabajos',subtotal:'Subtotal',nothing:'Agregue partidas activas con costo previsto para compartir un resumen.',
 shareConfirm:'¿Compartir el resumen con el cliente?',shareText:'Verá los grupos y los totales de venta que se muestran aquí. ContrataCR no envía nada: el resumen aparece en el proyecto del cliente.',
 revokeConfirm:'¿Dejar de compartir el resumen?',revokeText:'El cliente deja de verlo. Puede volver a compartirlo cuando quiera.',
 shared:'Resumen compartido con el cliente.',revoked:'El cliente ya no ve el resumen.',priced:'Markup e IVA guardados.',
 appliedNotice:(c:number,l:number,s:number)=>`${c===1?'Se agregó 1 código':`Se agregaron ${c} códigos`} al presupuesto${l?(l===1?'; 1 se vinculó a un código existente':`; ${l} se vincularon a códigos existentes`):''}${s?`; ${s} se omitieron (mismo código con otro tipo o archivado)`:''}.`,
 history:'Historial de lo compartido',revokedReason:{revoked:'Se dejó de compartir',replaced:'Reemplazado por una versión nueva'} as Record<string,string>,activeShare:'Visible ahora',
 pickTitle:'Aplicar códigos de la biblioteca',pickIntro:'Los códigos elegidos se agregan a este presupuesto con costo previsto de ₡0 y su unidad, IVA y markup predeterminados. Un código que ya existe aquí se vincula y nunca se cambia.',
 inBudget:'Ya está vinculado a este presupuesto',willLink:'Aquí existe un código con este número: se vinculará sin cambios',pickNone:'Su biblioteca todavía no tiene códigos activos.',openLibrary:'Abrir la biblioteca',
 pickApply:(n:number)=>n===1?'Aplicar 1 código':`Aplicar ${n} códigos`,selectAll:'Elegir todos',selectNone:'Quitar selección',
 conflict:'El presupuesto cambió. Se actualizó: revíselo e intente de nuevo.',failed:'No se pudo confirmar el cambio. Reintente: se envía la misma solicitud y nunca se aplica dos veces.',retry:'Reintentar',
 invalid:'Revise el markup (hasta dos decimales, máximo 1000 %).',loadError:'No se pudo cargar el presupuesto.',loading:'Cargando…',readOnly:'El proyecto o su cliente está archivado o cancelado: el presupuesto es de solo lectura.',
 limit:'El presupuesto llegó a 500 códigos.',
};}
type Copy=ReturnType<typeof copy>;

export function WorkBudgetForecast({workId,blocked=false}:{workId:string;blocked?:boolean}){
 const {user,loading}=useAuth(),finance=useProInternalFinance();if(loading||!user)return null;
 if(finance.ready&&!finance.allowed)return <ProRoleCostNotice/>;
 return <ForecastSession key={user.id+':'+workId} accountId={user.id} workId={workId} blocked={blocked}/>;
}

const tone:Record<BudgetStatus,{chip:string;bar:string}>={
 ok:{chip:'bg-[#eef8f4] text-[#18573a]',bar:'bg-[#2f9e6e]'},watch:{chip:'bg-[#fff4dc] text-[#7a4b00]',bar:'bg-[#e0a100]'},
 over:{chip:'bg-[#fdf0eb] text-[#a03c1f]',bar:'bg-[#d4532b]'},incomplete:{chip:'bg-[#eaf5fb] text-[#006e90]',bar:'bg-[#009FD9]'},idle:{chip:'bg-[#f1f4f8] text-[#52627a]',bar:'bg-[#c3cfdc]'},
};
function percent(bp:number|null,en:boolean){if(bp===null)return '—';const value=(bp/100).toFixed(bp%100===0?0:1);return en?value+'%':value.replace('.',',')+' %';}

function ForecastSession({accountId,workId,blocked}:{accountId:string;workId:string;blocked:boolean}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog(),params=useProSearchParams();
 const [data,setData]=useState<BudgetForecast|null>(null),[loadError,setLoadError]=useState(false),[tab,setTab]=useState<Tab>('sale');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const [price,setPrice]=useState<PriceEditor|null>(null),[picker,setPicker]=useState<{library:CostCodeLibrary|null;failed:boolean;selected:Set<string>}|null>(null);
 const pending=useRef<{input:BudgetExtrasMutation;done:(r:ReturnType<typeof budgetExtrasResultSchema.parse>)=>string}|null>(null),seq=useRef(0);
 const headers=useMemo(()=>({'X-Pro-Expected-Actor':accountId}),[accountId]);
 const money=useCallback((cents:number)=>proMoney(cents/100,en),[en]);
 const signed=(cents:number|null)=>cents===null?(en?'Incomplete':'Incompleto'):cents<0?'−'+money(-cents):money(cents);
 const load=useCallback(async()=>{const n=++seq.current;setLoadError(false);try{const r=await fetch(api+'?'+new URLSearchParams({workId}),{cache:'no-store',headers});if(!r.ok)throw Error();const body=budgetForecastSchema.parse(await r.json());if(body.work.id!==workId)throw Error();if(n===seq.current)setData(body);return body;}catch{if(n===seq.current)setLoadError(true);return null;}},[headers,workId]);
 const visible=params.get('vistaTrabajo')==='budget';
 useEffect(()=>{if(!visible)return;const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load,visible]);
 useEffect(()=>{const focus=()=>{if(visible&&!busy&&!price&&!picker&&document.visibilityState==='visible')void load();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[load,visible,busy,price,picker]);
 const writable=!!data?.canWrite&&!blocked;
 async function send(input:BudgetExtrasMutation,done:(r:ReturnType<typeof budgetExtrasResultSchema.parse>)=>string){
  setBusy(true);setError('');setNotice('');pending.current={input,done};
  try{
   const r=await fetch(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(r.status===409||r.status===400||r.status===429){pending.current=null;setUncertain(false);setError(r.status===409?c.conflict:r.status===429?c.limit:c.invalid);await load();return false;}
   if(!r.ok)throw Error();
   const result=budgetExtrasResultSchema.parse(await r.json());pending.current=null;setUncertain(false);setNotice(done(result));await load();return true;
  }catch{setUncertain(true);setError(c.failed);return false;}finally{setBusy(false);}
 }
 async function retry(){const p=pending.current;if(p)await send(p.input,p.done);}
 async function savePrice(){if(!data||!price)return;const markupBp=markupInputToBp(price.markup);if(markupBp===null){setError(c.invalid);return;}
  const ids=price.all?data.rows.filter(r=>r.kind==='item'&&!r.archived&&!isArchivedParent(data,r)).map(r=>r.codeId):[price.codeId];
  if(await send({action:'price',actionId:crypto.randomUUID(),workId,revision:data.revision,codeIds:ids,markupBp,vatCode:price.vatCode||null},()=>c.priced))setPrice(null);}
 async function share(){if(!data)return;const answer=await confirm({title:c.shareConfirm,description:c.shareText,confirmLabel:c.shareNow,cancelLabel:c.cancel});if(!answer.confirmed)return;
  await send({action:'share',actionId:crypto.randomUUID(),workId,revision:data.revision},()=>c.shared);}
 async function revoke(){if(!data?.share)return;const answer=await confirm({title:c.revokeConfirm,description:c.revokeText,confirmLabel:c.revoke,cancelLabel:c.cancel,tone:'danger'});if(!answer.confirmed)return;
  await send({action:'revoke',actionId:crypto.randomUUID(),workId,revision:data.revision,shareId:data.share.id},()=>c.revoked);}
 async function openPicker(){setPicker({library:null,failed:false,selected:new Set()});setError('');setNotice('');
  try{const r=await fetch('/api/pro/cost-codes?view=library&status=active',{cache:'no-store',headers});if(!r.ok)throw Error();const library=costCodeLibrarySchema.parse(await r.json());setPicker({library,failed:false,selected:new Set()});}
  catch{setPicker(old=>old?{...old,failed:true}:old);}}
 async function applyPicked(){if(!data||!picker?.selected.size)return;
  const ok=await send({action:'apply_library',actionId:crypto.randomUUID(),workId,revision:data.revision,budgetRevision:data.budgetRevision,libraryIds:[...picker.selected]},r=>c.appliedNotice(r.created,r.linked,r.skipped));
  if(ok)setPicker(null);}
 if(!data)return loadError?<div role="alert" data-budget-forecast-error className="space-y-2 rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>
  :<p role="status" aria-busy="true" className="rounded-2xl border border-[#d7e1ea] bg-white p-4 text-sm text-[#52627a]">{c.loading}</p>;
 const t=data.totals,items=data.rows.filter(r=>r.kind==='item'),incomplete=t.unknownCount>0;
 return <section data-budget-forecast className="min-w-0 space-y-4">
  {dialogNode}
  <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="min-w-0 flex-1 basis-72 space-y-1"><h3 className="text-lg font-bold text-[#162543]">{c.title}</h3><p className="text-sm text-[#52627a]">{c.intro}</p>{!data.canWrite&&<p role="status" className="text-sm font-semibold text-[#a03c1f]">{c.readOnly}</p>}</div>
   <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button type="button" data-budget-apply-library disabled={!writable||busy} className="w-full sm:w-auto" onClick={()=>void openPicker()}>{c.apply}</Button>
    <Button type="button" variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={()=>pushProParams({vistaTrabajo:'costs'})}>{c.editCodes}</Button></div>
  </header>
  <WorkBudgetSync workId={workId} accountId={accountId} writable={writable} refreshKey={data.budgetRevision} onApplied={message=>{if(message)setNotice(message);void load();}}/>
  {notice&&<p role="status" data-budget-notice className="rounded-xl border border-[#b9e2cf] bg-[#eef8f4] p-3 text-sm font-semibold text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" data-budget-error className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1c7b8] bg-[#fdf3ef] p-3 text-sm text-[#a03c1f]"><span className="min-w-0 break-words">{error}</span>{uncertain&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void retry()}>{c.retry}</Button>}</div>}
  <dl data-budget-kpis className="grid grid-cols-2 gap-2 lg:grid-cols-4">
   <Kpi id="cost" label={c.cost} value={money(t.costCents)}/><Kpi id="sale" label={c.sale} value={money(t.saleCents)} hint={c.markup+' '+money(t.markupCents)}/>
   <Kpi id="vat" label={c.vat} value={money(t.taxCents)}/><Kpi id="total" label={c.total} value={money(t.totalCents)} strong/>
   <Kpi id="committed" label={c.committed} value={money(t.committedCents)}/><Kpi id="actual" label={c.actual} value={money(t.actualCents)}/>
   <Kpi id="eac" label={c.eac} value={money(t.eacCents)} tone={t.status==='over'?'over':undefined}/><Kpi id="variance" label={c.variance} value={signed(t.varianceCents)} tone={t.varianceCents!==null&&t.varianceCents<0?'over':undefined}/>
  </dl>
  <div data-budget-consumed className="space-y-1.5 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-[#162543]">{c.consumed}</span><span className="text-[#52627a]">{c.consumedOf(percent(t.consumedBp,en))}</span></div>
   <Bar bp={t.consumedBp} status={t.status}/>
  </div>
  {(t.overCount>0||t.watchCount>0||incomplete)&&<ul data-budget-warnings className="space-y-2">
   {t.overCount>0&&<li data-budget-warning="over" className="rounded-xl border border-[#f1c7b8] bg-[#fdf3ef] p-3 text-sm font-semibold text-[#a03c1f]">{c.overBanner(t.overCount)}</li>}
   {t.watchCount>0&&<li data-budget-warning="watch" className="rounded-xl border border-[#f2d9a0] bg-[#fff8e8] p-3 text-sm font-semibold text-[#7a4b00]">{c.watchBanner(t.watchCount)}</li>}
   {incomplete&&<li data-budget-warning="incomplete" className="rounded-xl border border-[#bfe3f2] bg-[#eef8fc] p-3 text-sm text-[#0b3a53]">{c.incompleteBanner}</li>}
  </ul>}
  <WorkProfitability key={workId+':'+data.revision+':'+data.budgetRevision+':'+t.actualCents+':'+t.committedCents} accountId={accountId} workId={workId}/>
  <section data-budget-lines className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div role="group" aria-label={c.title} className="inline-flex rounded-xl bg-[#e9eff5] p-1">{(['sale','forecast'] as Tab[]).map(value=><button key={value} type="button" data-budget-tab={value} aria-pressed={tab===value} onClick={()=>setTab(value)} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${tab===value?'bg-white text-[#162543] shadow-sm':'text-[#52627a]'}`}>{value==='sale'?c.tabSale:c.tabForecast}</button>)}</div>
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void load()}>{c.refresh}</Button>
   </div>
   {!data.rows.length?<p data-budget-empty className="rounded-xl border border-dashed border-[#c3cfdc] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{c.noRows}</p>:<div role="table" aria-label={tab==='sale'?c.tabSale:c.tabForecast} className="min-w-0">
    <div role="row" className="hidden gap-3 border-b border-[#e5ebf1] px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-[#68778d] md:grid md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))]">
     <span role="columnheader">{c.code}</span>{(tab==='sale'?[c.cost,c.markup,c.vat,c.colSale,c.colTotal]:[c.committed,c.actual,c.eac,c.variance,c.consumed]).map(h=><span key={h} role="columnheader" className="text-right">{h}</span>)}
    </div>
    <div role="rowgroup" className="divide-y divide-[#eef2f6]">
     {data.rows.map(row=><LineRow key={row.codeId} row={row} tab={tab} c={c} en={en} money={money} signed={signed} writable={writable&&!busy} onPrice={()=>{setNotice('');setError('');setPrice({codeId:row.codeId,markup:markupBpToInput(row.markupBp??0,en),vatCode:row.vatCode??'',all:false});}}>
      {price?.codeId===row.codeId&&<PriceForm row={row} price={price} c={c} en={en} money={money} busy={busy} onChange={setPrice} onCancel={()=>setPrice(null)} onSave={()=>void savePrice()}/>}
     </LineRow>)}
     {tab==='forecast'&&(t.uncoded.committedCents>0||t.uncoded.actualCents>0)&&<div role="row" data-budget-uncoded className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))]">
      <div role="cell" className="col-span-2 md:col-span-1"><p className="font-semibold text-[#162543]">{c.uncoded}</p><p className="text-xs text-[#52627a]">{c.uncodedText}</p></div>
      <Cell label={c.committed} value={money(t.uncoded.committedCents)}/><Cell label={c.actual} value={money(t.uncoded.actualCents)}/><Cell label={c.eac} value={money(t.uncoded.projectedCents)}/><Cell label={c.variance} value="—"/><Cell label={c.consumed} value="—"/>
     </div>}
     <div role="row" data-budget-total-row className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-[#f2f6fa] px-3 py-3 text-sm font-bold md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))]">
      <div role="cell" className="col-span-2 text-[#162543] md:col-span-1">{en?'Total':'Total'} <span className="font-normal text-[#52627a]">· {items.length} {en?(items.length===1?'line':'lines'):(items.length===1?'partida':'partidas')}</span></div>
      {tab==='sale'?<><Cell label={c.cost} value={money(t.costCents)}/><Cell label={c.markup} value={money(t.markupCents)}/><Cell label={c.vat} value={money(t.taxCents)}/><Cell label={c.sale} value={money(t.saleCents)}/><Cell label={c.total} value={money(t.totalCents)}/></>
       :<><Cell label={c.committed} value={money(t.committedCents)}/><Cell label={c.actual} value={money(t.actualCents)}/><Cell label={c.eac} value={money(t.eacCents)}/><Cell label={c.variance} value={signed(t.varianceCents)} danger={t.varianceCents!==null&&t.varianceCents<0}/><Cell label={c.consumed} value={percent(t.consumedBp,en)}/></>}
     </div>
    </div>
   </div>}
  </section>
  <ShareCard data={data} c={c} en={en} money={money} busy={busy} writable={writable} onShare={()=>void share()} onRevoke={()=>void revoke()}/>
  {picker&&<Modal open title={c.pickTitle} size="lg" mobilePresentation="fullscreen" onClose={()=>{if(!busy)setPicker(null);}} footer={<div className="flex w-full flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>setPicker(null)}>{c.cancel}</Button><Button type="button" data-budget-pick-apply disabled={busy||!picker.selected.size} onClick={()=>void applyPicked()}>{c.pickApply(picker.selected.size)}</Button></div>}>
   <LibraryPicker data={data} picker={picker} c={c} en={en} onChange={selected=>setPicker(old=>old?{...old,selected}:old)} onRetry={()=>void openPicker()}/>
  </Modal>}
 </section>;
}
function isArchivedParent(data:BudgetForecast,row:BudgetForecastRow){return !!row.parentId&&!!data.rows.find(r=>r.codeId===row.parentId)?.archived;}

function Kpi({id,label,value,hint,strong,tone:kind}:{id:string;label:string;value:string;hint?:string;strong?:boolean;tone?:'over'}){
 return <div data-budget-kpi={id} className={`min-w-0 rounded-2xl border p-3 ${strong?'border-[#9fd8ee] bg-[#eef8fc]':'border-[#d7e1ea] bg-white'}`}><dt className="text-xs font-semibold text-[#52627a]">{label}</dt>
  <dd className={`mt-1 break-words text-lg font-bold tabular-nums ${kind==='over'?'text-[#a03c1f]':'text-[#162543]'}`}>{value}</dd>{hint&&<dd className="text-xs text-[#52627a] tabular-nums">{hint}</dd>}</div>;
}
function Bar({bp,status}:{bp:number|null;status:BudgetStatus}){
 const width=bp===null?0:Math.min(100,bp/100);
 return <div className="h-2 w-full overflow-hidden rounded-full bg-[#e9eff5]" aria-hidden="true"><div className={`h-full rounded-full ${tone[status].bar}`} style={{width:width+'%'}}/></div>;
}
function Cell({label,value,sub,danger}:{label:string;value:ReactNode;sub?:ReactNode;danger?:boolean}){
 return <div role="cell" className="min-w-0 md:text-right"><span className="block text-xs font-normal text-[#68778d] md:sr-only">{label}</span><span className={`block break-words tabular-nums ${danger?'text-[#a03c1f]':''}`}>{value}</span>{sub&&<span className="block text-xs font-normal text-[#68778d]">{sub}</span>}</div>;
}
function LineRow({row,tab,c,en,money,signed,writable,onPrice,children}:{row:BudgetForecastRow;tab:Tab;c:Copy;en:boolean;money:(n:number)=>string;signed:(n:number|null)=>string;writable:boolean;onPrice:()=>void;children?:ReactNode}){
 const group=row.kind==='group';
 return <div data-budget-row={row.code} data-budget-kind={row.kind} data-budget-status={row.status} className={group?'bg-[#f7f9fc]':''}>
  <div role="row" className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] ${group?'font-semibold':''}`}>
   <div role="cell" className={`col-span-2 min-w-0 md:col-span-1 ${row.parentId?'md:pl-5':''}`}>
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2"><span className="font-mono text-xs font-semibold tabular-nums text-[#006e90]">{row.code}</span><span className={`min-w-0 break-words text-[#162543] ${group?'font-bold':'font-semibold'}`}>{row.title}</span></p>
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-normal">
     {group&&<span className="text-[#7a879a]">{c.group}</span>}
     {row.archived&&<span className="rounded-full bg-[#f1f4f8] px-2 py-0.5 text-[#52627a]">{c.archived}</span>}
     {row.libraryCode&&<span className="rounded-full bg-[#eaf5fb] px-2 py-0.5 text-[#006e90]">{c.fromLibrary}</span>}
     {tab==='forecast'&&<span data-budget-row-status className={`rounded-full px-2 py-0.5 font-semibold ${tone[row.status].chip}`}>{c.status[row.status]}</span>}
     {!group&&tab==='sale'&&writable&&!row.archived&&<button type="button" data-budget-price-edit onClick={onPrice} className="min-h-8 rounded-lg px-1.5 font-semibold text-[#006e90] underline-offset-2 hover:underline">{c.editPrice}</button>}
    </p>
   </div>
   {tab==='sale'?<>
    <Cell label={c.cost} value={money(row.costCents)}/>
    <Cell label={c.markup} value={money(row.markupCents)} sub={group?undefined:markupLabel(row.markupBp??0,en)}/>
    <Cell label={c.vat} value={money(row.taxCents)} sub={group?undefined:budgetVatLabel(row.vatCode,en)}/>
    <Cell label={c.sale} value={<span data-budget-sale>{money(row.saleCents)}</span>}/>
    <Cell label={c.total} value={<span data-budget-line-total className="font-semibold">{money(row.totalCents)}</span>}/>
   </>:<>
    <Cell label={c.committed} value={money(row.committedCents)}/>
    <Cell label={c.actual} value={money(row.actualCents)}/>
    <Cell label={c.eac} value={<span data-budget-eac>{money(row.eacCents)}</span>} sub={c.remaining+' '+money(row.remainingCents)}/>
    <Cell label={c.variance} value={<span data-budget-variance>{signed(row.varianceCents)}</span>} danger={row.varianceCents!==null&&row.varianceCents<0}/>
    <div role="cell" className="min-w-0 md:text-right"><span className="block text-xs font-normal text-[#68778d] md:sr-only">{c.consumed}</span><span data-budget-consumed-value className="block tabular-nums">{percent(row.consumedBp,en)}</span><div className="mt-1"><Bar bp={row.consumedBp} status={row.status}/></div></div>
   </>}
  </div>
  {children}
 </div>;
}
function PriceForm({row,price,c,en,money,busy,onChange,onCancel,onSave}:{row:BudgetForecastRow;price:PriceEditor;c:Copy;en:boolean;money:(n:number)=>string;busy:boolean;onChange:(p:PriceEditor)=>void;onCancel:()=>void;onSave:()=>void}){
 const bp=markupInputToBp(price.markup),preview=bp===null?null:budgetLineFigures(row.costCents,bp,price.vatCode||null);
 return <div data-budget-price-form className="mx-3 mb-3 space-y-3 rounded-2xl border border-[#0089bb] bg-[#f7fbfd] p-4">
  <fieldset disabled={busy} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   <label className="block text-sm font-semibold">{c.markupField}<input data-budget-price-field="markup" inputMode="decimal" value={price.markup} onChange={e=>onChange({...price,markup:e.target.value})} aria-invalid={bp===null} className={field}/></label>
   <label className="block text-sm font-semibold">{c.vatField}<select data-budget-price-field="vat" value={price.vatCode} onChange={e=>onChange({...price,vatCode:e.target.value as BudgetVatCode|''})} className={field}><option value="">{budgetVatLabel(null,en)}</option>{budgetVatOptions.map(code=><option key={code} value={code}>{budgetVatLabel(code,en)}</option>)}</select></label>
   <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" data-budget-price-field="all" className="h-5 w-5 accent-[#009FD9]" checked={price.all} onChange={e=>onChange({...price,all:e.target.checked})}/>{c.applyAll}</label>
  </fieldset>
  {preview&&<p data-budget-price-preview aria-live="polite" className="text-sm text-[#162543]"><span className="text-[#52627a]">{c.preview}: </span>{money(row.costCents)} + {money(preview.markupCents)} = <strong>{money(preview.saleCents)}</strong> · {c.vat} {money(preview.taxCents)} · {c.total} <strong>{money(preview.totalCents)}</strong></p>}
  <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{c.cancel}</Button><Button type="button" data-budget-price-save disabled={busy||bp===null} onClick={onSave}>{c.savePrice}</Button></div>
 </div>;
}
function SummaryList({snapshot,c,money}:{snapshot:BudgetForecast['clientPreview'];c:Copy;money:(n:number)=>string}){
 return <dl data-budget-client-preview className="divide-y divide-[#eef2f6] overflow-hidden rounded-xl border border-[#e5ebf1] text-sm">
  {snapshot.groups.map(g=><div key={g.code} className="flex items-baseline justify-between gap-3 px-3 py-2"><dt className="min-w-0 break-words text-[#162543]">{g.title}</dt><dd className="shrink-0 tabular-nums">{money(g.saleCents)}</dd></div>)}
  {snapshot.otherSaleCents!==null&&<div className="flex items-baseline justify-between gap-3 px-3 py-2"><dt className="text-[#162543]">{c.other}</dt><dd className="shrink-0 tabular-nums">{money(snapshot.otherSaleCents)}</dd></div>}
  <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-[#52627a]"><dt>{c.subtotal}</dt><dd className="shrink-0 tabular-nums">{money(snapshot.saleCents)}</dd></div>
  <div className="flex items-baseline justify-between gap-3 px-3 py-2 text-[#52627a]"><dt>{c.vat}</dt><dd className="shrink-0 tabular-nums">{money(snapshot.taxCents)}</dd></div>
  <div className="flex items-baseline justify-between gap-3 bg-[#f2f6fa] px-3 py-2.5 font-bold text-[#162543]"><dt>{c.total}</dt><dd className="shrink-0 tabular-nums">{money(snapshot.totalCents)}</dd></div>
 </dl>;
}
function ShareCard({data,c,en,money,busy,writable,onShare,onRevoke}:{data:BudgetForecast;c:Copy;en:boolean;money:(n:number)=>string;busy:boolean;writable:boolean;onShare:()=>void;onRevoke:()=>void}){
 const day=(iso:string)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(iso));
 const share=data.share,canShare=data.clientPreview.lineCount>0;
 return <section data-budget-share={share?(share.stale?'stale':'active'):'none'} className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 basis-64 space-y-1"><h4 className="font-bold text-[#162543]">{c.shareTitle}</h4><p className="text-sm text-[#52627a]">{c.shareIntro}</p></div>
   <span data-budget-share-state className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${share?(share.stale?'bg-[#fff4dc] text-[#7a4b00]':'bg-[#eef8f4] text-[#18573a]'):'bg-[#f1f4f8] text-[#52627a]'}`}>{share?c.activeShare:c.notShared}</span></div>
  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
   <div className="min-w-0 space-y-2"><SummaryList snapshot={share?share.snapshot:data.clientPreview} c={c} money={money}/></div>
   <div className="min-w-0 space-y-2 text-sm">
    {share&&<p className="text-[#162543]">{c.sharedOn(day(share.sharedAt))}</p>}
    {share?.stale&&<p data-budget-share-stale className="rounded-xl border border-[#f2d9a0] bg-[#fff8e8] p-3 text-[#7a4b00]">{c.stale}</p>}
    <p className="text-[#52627a]">{data.customerName?c.forCustomer(data.customerName):c.noCustomer}</p>
    {!canShare&&<p className="text-[#52627a]">{c.nothing}</p>}
    <div className="flex flex-wrap gap-2 pt-1">{(!share||share.stale)&&<Button type="button" data-budget-share-action disabled={!writable||busy||!canShare} onClick={onShare}>{share?c.shareAgain:c.shareNow}</Button>}
     {share&&<Button type="button" variant="secondary" data-budget-revoke disabled={!writable||busy} onClick={onRevoke}>{c.revoke}</Button>}</div>
    {data.shareHistory.length>0&&<details className="rounded-xl border border-[#e5ebf1] p-3"><summary className="cursor-pointer font-semibold text-[#162543]">{c.history}</summary>
     <ul data-budget-share-history className="mt-2 space-y-1 text-[#52627a]">{data.shareHistory.map(h=><li key={h.id} data-budget-share-entry={h.reason??'active'} className="flex flex-wrap justify-between gap-2"><span>{day(h.sharedAt)} · {money(h.totalCents)}</span><span>{h.reason?c.revokedReason[h.reason]:c.activeShare}</span></li>)}</ul></details>}
   </div>
  </div>
 </section>;
}
function LibraryPicker({data,picker,c,en,onChange,onRetry}:{data:BudgetForecast;picker:{library:CostCodeLibrary|null;failed:boolean;selected:Set<string>};c:Copy;en:boolean;onChange:(s:Set<string>)=>void;onRetry:()=>void}){
 if(!picker.library)return picker.failed?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={onRetry}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 const linked=new Set(data.rows.map(r=>r.libraryId).filter(Boolean)),codes=new Set(data.rows.map(r=>r.code));
 const rows=picker.library.items,choosable=rows.filter(r=>r.kind==='item'&&!linked.has(r.id));
 if(!rows.length)return <div className="space-y-3"><p className="text-sm text-[#52627a]">{c.pickNone}</p><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_company',{empresa:'categorias'})}>{c.openLibrary}</Button></div>;
 const toggle=(id:string,on:boolean)=>{const next=new Set(picker.selected);if(on)next.add(id);else next.delete(id);onChange(next);};
 const groups=rows.filter(r=>r.kind==='group'),loose=rows.filter(r=>r.kind==='item'&&!r.parentId);
 const item=(r:typeof rows[number])=>{const done=linked.has(r.id),link=!done&&codes.has(r.code);return <li key={r.id}><label className={`flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 text-sm ${done?'text-[#7a879a]':'cursor-pointer hover:bg-[#f6f9fb]'}`}>
  <input type="checkbox" data-budget-pick={r.code} className="mt-0.5 h-5 w-5 shrink-0 accent-[#009FD9]" disabled={done} checked={done||picker.selected.has(r.id)} onChange={e=>toggle(r.id,e.target.checked)}/>
  <span className="min-w-0 flex-1"><span className="font-mono text-xs tabular-nums text-[#52627a]">{r.code}</span> <span className="break-words text-[#162543]">{r.title}</span>
   <span className="block text-xs text-[#68778d]">{[r.unit,budgetVatLabel(r.vatCode,en),'Markup '+markupLabel(r.markupBp??0,en)].filter(Boolean).join(' · ')}</span>
   {done&&<span className="block text-xs">{c.inBudget}</span>}{link&&<span className="block text-xs text-[#006e90]">{c.willLink}</span>}</span></label></li>;};
 return <div data-budget-picker className="space-y-4">
  <p className="text-sm text-[#52627a]">{c.pickIntro}</p>
  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={()=>onChange(new Set(choosable.map(r=>r.id)))}>{c.selectAll}</Button><Button type="button" size="sm" variant="ghost" onClick={()=>onChange(new Set())}>{c.selectNone}</Button></div>
  {groups.map(g=>{const children=rows.filter(r=>r.parentId===g.id);if(!children.length)return null;return <fieldset key={g.id} data-budget-pick-group={g.code} className="min-w-0 rounded-2xl border border-[#d7e1ea] p-3"><legend className="px-1 text-sm font-bold text-[#162543]"><span className="font-mono text-xs text-[#006e90]">{g.code}</span> {g.title}</legend><ul className="space-y-0.5">{children.map(item)}</ul></fieldset>;})}
  {loose.length>0&&<ul className="space-y-0.5 rounded-2xl border border-[#d7e1ea] p-3">{loose.map(item)}</ul>}
 </div>;
}
