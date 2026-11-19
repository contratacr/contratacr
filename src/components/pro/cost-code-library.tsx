'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {ProModal as Modal} from './modal';
import {ProRoleCostNotice,useProInternalFinance} from './company-team';
import {
 budgetVatLabel,budgetVatOptions,costCodeLibrarySchema,costCodeResultSchema,costCodeStarterSchema,markupBpToInput,markupInputToBp,markupLabel,
 type BudgetVatCode,type CostCodeLibrary,type CostCodeMutation,type CostCodeRow,type CostCodeStarter,
} from '@/lib/pro/cost-codes';

/**
 * Row 54 (Ronda F1-B): the company cost-code library (Empresa › Categorías). Two levels (group → code) with
 * default unit, VAT tariff and markup. Codes are applied to a project from its Budget view; archived codes stay
 * linked to the projects that already use them.
 */
const api='/api/pro/cost-codes';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
type Editor={id:string;kind:'group'|'item';code:string;title:string;parentId:string;unit:string;vatCode:BudgetVatCode|'';markup:string;isNew:boolean};

function copy(en:boolean){return en?{
 cardTitle:'Cost codes',cardText:'Your company list of budget groups and codes, with default unit, VAT and markup. Apply them to any project budget.',
 manage:'Manage cost codes',title:'Cost code library',intro:'Codes you reuse in every project budget. Editing a code here never changes budgets that already use it.',
 active:'Active',archived:'Archived',search:'Search code or name',newGroup:'New group',newCode:'New code',starter:'Add starter list',
 empty:'Your library is empty. Add the starter list for construction and remodeling or create your own codes.',emptyArchived:'No archived codes.',noMatch:'No codes match this search.',
 count:(n:number)=>n===1?'1 active code':`${n} active codes`,of:(n:number)=>` of ${n}`,group:'Group',code:'Code',name:'Name',unit:'Default unit',vat:'Default VAT',markup:'Default markup (%)',
 noGroup:'No group',usage:(n:number)=>n===1?'Used in 1 project':`Used in ${n} projects`,edit:'Edit',archive:'Archive',restore:'Restore',save:'Save code',saveGroup:'Save group',cancel:'Cancel',
 editTitle:(kind:'group'|'item',isNew:boolean)=>isNew?(kind==='group'?'New group':'New cost code'):(kind==='group'?'Edit group':'Edit cost code'),
 codeHint:'Capital letters, numbers, dot, dash or underscore. For example 06.03.',markupHint:'Applied to the planned cost of the line. Empty means 0 %.',
 saved:'Cost code saved.',archivedNotice:'Code archived.',restoredNotice:'Code restored.',imported:(n:number,s:number)=>`${n===1?'1 code':n+' codes'} added${s?`, ${s} ${s===1?'was':'were'} already in the library`:''}.`,
 starterTitle:'Starter list for construction and remodeling',starterIntro:'An editable starting point for Costa Rican trades. Choose the codes you use; their groups are added automatically.',
 selectAll:'Select all',selectNone:'Clear',already:'Already in the library',addSelected:(n:number)=>n===1?'Add 1 code':`Add ${n} codes`,back:'Back to the library',
 conflict:'The library changed. It was refreshed: review it and try again.',duplicate:'That code already exists in the library.',invalid:'Check the code, name, unit and markup (up to two decimals, maximum 1000 %).',
 failed:'Could not confirm the change. Retry: the same request is sent again and is never applied twice.',retry:'Retry',loadError:'Could not load the library.',loading:'Loading…',
 archiveTitle:(code:string)=>`Archive "${code}"?`,archiveText:'It is hidden from new budgets. Projects that already use it keep it. Archive the codes of a group before the group.',
 restoreTitle:(code:string)=>`Restore "${code}"?`,limit:'The library reached 500 codes.',groupOnly:'Groups only have a code and a name.',capacity:'Capacity',
}:{
 cardTitle:'Códigos de costo',cardText:'La lista de grupos y códigos de presupuesto de su empresa, con unidad, IVA y markup predeterminados. Aplíquelos al presupuesto de cualquier proyecto.',
 manage:'Administrar códigos de costo',title:'Biblioteca de códigos de costo',intro:'Los códigos que reutiliza en el presupuesto de cada proyecto. Editar un código aquí nunca cambia los presupuestos que ya lo usan.',
 active:'Activos',archived:'Archivados',search:'Buscar código o nombre',newGroup:'Nuevo grupo',newCode:'Nuevo código',starter:'Agregar lista inicial',
 empty:'Su biblioteca está vacía. Agregue la lista inicial de construcción y remodelación o cree sus propios códigos.',emptyArchived:'No hay códigos archivados.',noMatch:'Ningún código coincide con esta búsqueda.',
 count:(n:number)=>n===1?'1 código activo':`${n} códigos activos`,of:(n:number)=>` de ${n}`,group:'Grupo',code:'Código',name:'Nombre',unit:'Unidad predeterminada',vat:'IVA predeterminado',markup:'Markup predeterminado (%)',
 noGroup:'Sin grupo',usage:(n:number)=>n===1?'Se usa en 1 proyecto':`Se usa en ${n} proyectos`,edit:'Editar',archive:'Archivar',restore:'Restaurar',save:'Guardar código',saveGroup:'Guardar grupo',cancel:'Cancelar',
 editTitle:(kind:'group'|'item',isNew:boolean)=>isNew?(kind==='group'?'Nuevo grupo':'Nuevo código de costo'):(kind==='group'?'Editar grupo':'Editar código de costo'),
 codeHint:'Mayúsculas, números, punto, guion o guion bajo. Por ejemplo 06.03.',markupHint:'Se aplica al costo previsto de la partida. Vacío equivale a 0 %.',
 saved:'Código guardado.',archivedNotice:'Código archivado.',restoredNotice:'Código restaurado.',imported:(n:number,s:number)=>`${n===1?'Se agregó 1 código':`Se agregaron ${n} códigos`}${s?`; ${s===1?'1 ya estaba':s+' ya estaban'} en la biblioteca`:''}.`,
 starterTitle:'Lista inicial de construcción y remodelación',starterIntro:'Un punto de partida editable para los oficios en Costa Rica. Elija los códigos que usa; sus grupos se agregan solos.',
 selectAll:'Elegir todos',selectNone:'Quitar selección',already:'Ya está en la biblioteca',addSelected:(n:number)=>n===1?'Agregar 1 código':`Agregar ${n} códigos`,back:'Volver a la biblioteca',
 conflict:'La biblioteca cambió. Se actualizó: revísela e intente de nuevo.',duplicate:'Ese código ya existe en la biblioteca.',invalid:'Revise el código, el nombre, la unidad y el markup (hasta dos decimales, máximo 1000 %).',
 failed:'No se pudo confirmar el cambio. Reintente: se envía la misma solicitud y nunca se aplica dos veces.',retry:'Reintentar',loadError:'No se pudo cargar la biblioteca.',loading:'Cargando…',
 archiveTitle:(code:string)=>`¿Archivar "${code}"?`,archiveText:'Deja de ofrecerse en presupuestos nuevos. Los proyectos que ya lo usan lo conservan. Archive los códigos de un grupo antes que el grupo.',
 restoreTitle:(code:string)=>`¿Restaurar "${code}"?`,limit:'La biblioteca llegó a 500 códigos.',groupOnly:'Los grupos solo tienen código y nombre.',capacity:'Capacidad',
};}

/** Company hub card: count preview plus the manager. */
export function CostCodeLibraryCard(){
 const en=useLocale()==='en',c=copy(en),{user}=useAuth(),finance=useProInternalFinance(),[open,setOpen]=useState(false),[count,setCount]=useState<number|null>(null);
 const refresh=useCallback(async()=>{if(!user)return;try{const r=await fetch(api+'?view=library&status=active',{cache:'no-store',headers:{'X-Pro-Expected-Actor':user.id}});if(!r.ok)throw Error();setCount(costCodeLibrarySchema.parse(await r.json()).activeCount);}catch{setCount(null);}},[user]);
 useEffect(()=>{if(!finance.ready||!finance.allowed)return;const timer=setTimeout(()=>void refresh(),0);return()=>clearTimeout(timer);},[refresh,finance.ready,finance.allowed]);
 return <section data-cost-code-card className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 lg:col-span-2" aria-labelledby="company-cost-codes">
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h3 id="company-cost-codes" className="font-bold">{c.cardTitle}</h3><p className="text-sm text-[#52627a]">{c.cardText}</p></div>
   {count!==null&&<span data-cost-code-count className="shrink-0 rounded-full bg-[#eaf5fb] px-3 py-1 text-xs font-semibold text-[#006e90]">{c.count(count)}</span>}</div>
  {finance.ready&&!finance.allowed?<ProRoleCostNotice/>:<Button type="button" variant="secondary" data-cost-code-open onClick={()=>setOpen(true)}>{c.manage}</Button>}
  {open&&user&&<CostCodeManager key={user.id} accountId={user.id} onClose={()=>{setOpen(false);void refresh();}}/>}
 </section>;
}

function CostCodeManager({accountId,onClose}:{accountId:string;onClose:()=>void}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog();
 const [status,setStatus]=useState<'active'|'archived'>('active'),[data,setData]=useState<CostCodeLibrary|null>(null),[loadError,setLoadError]=useState(false);
 const [q,setQ]=useState(''),[editor,setEditor]=useState<Editor|null>(null),[starter,setStarter]=useState<{data:CostCodeStarter;selected:Set<string>}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),pending=useRef<CostCodeMutation|null>(null),[uncertain,setUncertain]=useState(false),seq=useRef(0);
 const headers=useMemo(()=>({'X-Pro-Expected-Actor':accountId}),[accountId]);
 const load=useCallback(async(next=status)=>{const n=++seq.current;setLoadError(false);try{const r=await fetch(api+'?'+new URLSearchParams({view:'library',status:next}),{cache:'no-store',headers});if(!r.ok)throw Error();const body=costCodeLibrarySchema.parse(await r.json());if(n===seq.current)setData(body);return body;}catch{if(n===seq.current)setLoadError(true);return null;}},[headers,status]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const groups=useMemo(()=>(data?.items??[]).filter(row=>row.kind==='group'&&!row.archived),[data]);
 const shown=useMemo(()=>{const needle=q.trim().toLocaleLowerCase();const rows=data?.items??[];if(!needle)return rows;
  const hit=(row:CostCodeRow)=>(row.code+' '+row.title).toLocaleLowerCase().includes(needle);
  return rows.filter(row=>hit(row)||row.kind==='group'&&rows.some(child=>child.parentId===row.id&&hit(child)));},[data,q]);
 async function send(input:CostCodeMutation,success:(created:number,skipped:number)=>string){
  setBusy(true);setError('');setNotice('');pending.current=input;
  try{
   const r=await fetch(api,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(r.status===409){const body=await r.json().catch(()=>({}));pending.current=null;setUncertain(false);setError(body.code==='duplicate'?c.duplicate:c.conflict);await load();return false;}
   if(r.status===400){pending.current=null;setUncertain(false);setError(c.invalid);return false;}
   if(r.status===429){pending.current=null;setUncertain(false);setError(c.limit);return false;}
   if(!r.ok)throw Error();
   const result=costCodeResultSchema.parse(await r.json());pending.current=null;setUncertain(false);setNotice(success(result.created,result.skipped));await load();return true;
  }catch{setUncertain(true);setError(c.failed);return false;}finally{setBusy(false);}
 }
 async function retry(){const input=pending.current;if(input)await send(input,()=>c.saved);}
 function startEditor(kind:'group'|'item',row?:CostCodeRow){setNotice('');setError('');setStarter(null);
  setEditor(row?{id:row.id,kind:row.kind,code:row.code,title:row.title,parentId:row.parentId??'',unit:row.unit??'',vatCode:row.vatCode??'',markup:markupBpToInput(row.markupBp,en),isNew:false}
   :{id:crypto.randomUUID(),kind,code:'',title:'',parentId:kind==='item'?(groups[0]?.id??''):'',unit:'',vatCode:kind==='item'?'08':'',markup:'',isNew:true});}
 async function save(event:FormEvent){event.preventDefault();if(!editor||!data||busy)return;
  const markupBp=editor.kind==='item'?markupInputToBp(editor.markup):null;
  if(!editor.code.trim()||!editor.title.trim()||editor.kind==='item'&&markupBp===null){setError(c.invalid);return;}
  const input:CostCodeMutation={action:'save',actionId:crypto.randomUUID(),revision:data.revision,id:editor.id,kind:editor.kind,code:editor.code.trim().toUpperCase(),title:editor.title.trim(),
   parentId:editor.kind==='item'&&editor.parentId?editor.parentId:null,unit:editor.kind==='item'&&editor.unit.trim()?editor.unit.trim():null,
   vatCode:editor.kind==='item'&&editor.vatCode?editor.vatCode:null,markupBp:editor.kind==='item'?markupBp:null};
  if(await send(input,()=>c.saved))setEditor(null);}
 async function changeStatus(row:CostCodeRow){if(!data||busy)return;const archive=!row.archived;
  const answer=await confirm({title:archive?c.archiveTitle(row.code):c.restoreTitle(row.code),description:archive?c.archiveText:undefined,confirmLabel:archive?c.archive:c.restore,cancelLabel:c.cancel});
  if(!answer.confirmed)return;await send({action:archive?'archive':'restore',actionId:crypto.randomUUID(),revision:data.revision,id:row.id},()=>archive?c.archivedNotice:c.restoredNotice);}
 async function openStarter(){setEditor(null);setNotice('');setError('');setBusy(true);
  try{const r=await fetch(api+'?'+new URLSearchParams({view:'starter',lang:en?'en':'es'}),{cache:'no-store',headers});if(!r.ok)throw Error();const body=costCodeStarterSchema.parse(await r.json());
   setStarter({data:body,selected:new Set(body.items.filter(row=>row.kind==='item'&&!row.exists).map(row=>row.code))});}catch{setError(c.loadError);}finally{setBusy(false);}}
 async function importStarter(){if(!starter||!data||!starter.selected.size)return;
  const codes=[...starter.selected].slice(0,100);
  if(await send({action:'import_starter',actionId:crypto.randomUUID(),revision:data.revision,lang:en?'en':'es',codes},(created,skipped)=>c.imported(created,skipped)))setStarter(null);}
 const toggle=(code:string,on:boolean)=>setStarter(old=>{if(!old)return old;const next=new Set(old.selected);if(on)next.add(code);else next.delete(code);return {...old,selected:next};});
 const footer=editor?<div className="flex w-full flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setEditor(null);setError('');}}>{c.cancel}</Button><Button type="submit" form="cost-code-form" disabled={busy}>{editor.kind==='group'?c.saveGroup:c.save}</Button></div>
  :starter?<div className="flex w-full flex-wrap justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={()=>setStarter(null)}>{c.back}</Button><Button type="button" data-cost-code-starter-add disabled={busy||!starter.selected.size} onClick={()=>void importStarter()}>{c.addSelected(Math.min(starter.selected.size,100))}</Button></div>:undefined;
 return <>{dialogNode}<Modal open title={c.title} size="xl" mobilePresentation="fullscreen" onClose={()=>{if(!busy)onClose();}} footer={footer}>
  <div data-cost-code-library className="space-y-4">
   {!editor&&!starter&&<p className="text-sm text-[#52627a]">{c.intro}</p>}
   {notice&&<p role="status" data-cost-code-notice className="rounded-xl border border-[#b9e2cf] bg-[#eef8f4] p-3 text-sm font-semibold text-[#18573a]">{notice}</p>}
   {error&&<div role="alert" data-cost-code-error className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f1c7b8] bg-[#fdf3ef] p-3 text-sm text-[#a03c1f]"><span className="min-w-0 break-words">{error}</span>{uncertain&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void retry()}>{c.retry}</Button>}</div>}
   {editor?<form id="cost-code-form" data-cost-code-form={editor.isNew?'new':'edit'} onSubmit={save} className="space-y-4">
    <h3 className="font-semibold text-[#162543]">{c.editTitle(editor.kind,editor.isNew)}</h3>
    <fieldset disabled={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
     <label className="block text-sm font-semibold">{c.code}<input data-cost-code-field="code" required maxLength={30} autoCapitalize="characters" value={editor.code} onChange={e=>setEditor({...editor,code:e.target.value.toUpperCase()})} className={field+' font-mono tabular-nums'}/></label>
     <label className="block text-sm font-semibold">{c.name}<input data-cost-code-field="title" required maxLength={160} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})} className={field}/></label>
     <p className="text-xs text-[#52627a] sm:col-span-2">{editor.kind==='group'?c.groupOnly:c.codeHint}</p>
     {editor.kind==='item'&&<>
      <label className="block text-sm font-semibold sm:col-span-2">{c.group}<select data-cost-code-field="group" value={editor.parentId} onChange={e=>setEditor({...editor,parentId:e.target.value})} className={field}><option value="">{c.noGroup}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.code} · {g.title}</option>)}</select></label>
      <label className="block text-sm font-semibold">{c.unit}<input data-cost-code-field="unit" maxLength={20} value={editor.unit} onChange={e=>setEditor({...editor,unit:e.target.value})} className={field}/></label>
      <label className="block text-sm font-semibold">{c.vat}<select data-cost-code-field="vat" value={editor.vatCode} onChange={e=>setEditor({...editor,vatCode:e.target.value as BudgetVatCode|''})} className={field}><option value="">{budgetVatLabel(null,en)}</option>{budgetVatOptions.map(code=><option key={code} value={code}>{budgetVatLabel(code,en)}</option>)}</select></label>
      <label className="block text-sm font-semibold sm:col-span-2">{c.markup}<input data-cost-code-field="markup" inputMode="decimal" value={editor.markup} onChange={e=>setEditor({...editor,markup:e.target.value})} className={field+' sm:max-w-[12rem]'}/><span className="mt-1 block text-xs font-normal text-[#52627a]">{c.markupHint}</span></label>
     </>}
    </fieldset>
   </form>:starter?<StarterPicker starter={starter} c={c} onToggle={toggle} onAll={on=>setStarter(old=>old?{...old,selected:on?new Set(old.data.items.filter(r=>r.kind==='item'&&!r.exists).map(r=>r.code)):new Set()}:old)}/>:<>
    <div className="flex flex-wrap items-center gap-2">
     <div role="group" aria-label={c.title} className="inline-flex rounded-xl bg-[#e9eff5] p-1">{(['active','archived'] as const).map(value=><button key={value} type="button" data-cost-code-status={value} aria-pressed={status===value} onClick={()=>{setStatus(value);void load(value);}} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${status===value?'bg-white text-[#162543] shadow-sm':'text-[#52627a]'}`}>{value==='active'?c.active:c.archived}{data&&<span className="ml-1 tabular-nums text-xs text-[#52627a]">{value==='active'?data.activeCount:data.archivedCount}</span>}</button>)}</div>
     <label className="min-w-0 flex-1 basis-56"><span className="sr-only">{c.search}</span><input type="search" data-cost-code-search value={q} placeholder={c.search} onChange={e=>setQ(e.target.value)} className={field+' mt-0'}/></label>
    </div>
    {status==='active'&&<div className="flex flex-wrap gap-2"><Button type="button" data-cost-code-new="item" disabled={busy||!data} onClick={()=>startEditor('item')}>{c.newCode}</Button><Button type="button" variant="secondary" data-cost-code-new="group" disabled={busy||!data} onClick={()=>startEditor('group')}>{c.newGroup}</Button><Button type="button" variant="secondary" data-cost-code-starter disabled={busy||!data} onClick={()=>void openStarter()}>{c.starter}</Button></div>}
    {!data?(loadError?<div role="alert" className="space-y-2 text-sm"><p>{c.loadError}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>:<p role="status" className="text-sm text-[#52627a]">{c.loading}</p>)
     :!data.items.length?<p data-cost-code-empty className="rounded-xl border border-dashed border-[#c3cfdc] bg-[#f7f9fc] p-4 text-sm text-[#52627a]">{status==='active'?c.empty:c.emptyArchived}</p>
     :!shown.length?<p className="text-sm text-[#52627a]">{c.noMatch}</p>
     :<ul data-cost-code-list className="divide-y divide-[#e5ebf1] overflow-hidden rounded-2xl border border-[#d7e1ea]">{shown.map(row=><li key={row.id} data-cost-code-row={row.code} data-cost-code-kind={row.kind} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${row.kind==='group'?'bg-[#f7f9fc]':'bg-white'} ${row.kind==='item'&&row.parentId?'sm:pl-10':''}`}>
      <div className="min-w-0 flex-1 basis-60">
       <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm"><span className="font-mono text-xs font-semibold tabular-nums text-[#006e90]">{row.code}</span><span className={`min-w-0 break-words ${row.kind==='group'?'font-bold text-[#162543]':'font-semibold text-[#162543]'}`}>{row.title}</span>{row.kind==='group'&&<span className="text-xs font-semibold uppercase tracking-wide text-[#7a879a]">{c.group}</span>}</p>
       {row.kind==='item'&&<p className="mt-0.5 text-xs text-[#52627a]">{[row.unit,budgetVatLabel(row.vatCode,en),(en?'Markup ':'Markup ')+markupLabel(row.markupBp??0,en),row.usage?c.usage(row.usage):null,status==='archived'&&row.parentCode?row.parentCode+' · '+row.parentTitle:null].filter(Boolean).join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 gap-2">{!row.archived&&<Button type="button" size="sm" variant="secondary" disabled={busy} onClick={()=>startEditor(row.kind,row)}>{c.edit}</Button>}<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void changeStatus(row)}>{row.archived?c.restore:c.archive}</Button></div>
     </li>)}</ul>}
    {data&&<p className="text-xs text-[#7a879a]">{c.capacity}: {data.activeCount+data.archivedCount}{c.of(data.capacity)}</p>}
   </>}
  </div>
 </Modal></>;
}

function StarterPicker({starter,c,onToggle,onAll}:{starter:{data:CostCodeStarter;selected:Set<string>};c:ReturnType<typeof copy>;onToggle:(code:string,on:boolean)=>void;onAll:(on:boolean)=>void}){
 const groups=starter.data.items.filter(row=>row.kind==='group');
 return <div data-cost-code-starter-picker className="space-y-4">
  <div className="space-y-1"><h3 className="font-semibold text-[#162543]">{c.starterTitle}</h3><p className="text-sm text-[#52627a]">{c.starterIntro}</p></div>
  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={()=>onAll(true)}>{c.selectAll}</Button><Button type="button" size="sm" variant="ghost" onClick={()=>onAll(false)}>{c.selectNone}</Button></div>
  <div className="grid gap-3 md:grid-cols-2">{groups.map(group=><fieldset key={group.code} data-cost-code-starter-group={group.code} className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-3">
   <legend className="px-1 text-sm font-bold text-[#162543]"><span className="font-mono text-xs text-[#006e90]">{group.code}</span> {group.title}</legend>
   <ul className="space-y-1">{starter.data.items.filter(row=>row.parentCode===group.code).map(row=><li key={row.code}><label className={`flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm ${row.exists?'text-[#7a879a]':'cursor-pointer hover:bg-[#f6f9fb]'}`}>
    <input type="checkbox" data-cost-code-starter-item={row.code} className="h-5 w-5 shrink-0 accent-[#009FD9]" disabled={row.exists} checked={row.exists||starter.selected.has(row.code)} onChange={e=>onToggle(row.code,e.target.checked)}/>
    <span className="min-w-0 flex-1"><span className="font-mono text-xs tabular-nums text-[#52627a]">{row.code}</span> <span className="break-words">{row.title}</span>{row.exists&&<span className="block text-xs">{c.already}</span>}</span>
    {row.unit&&<span className="shrink-0 text-xs text-[#7a879a]">{row.unit}</span>}
   </label></li>)}</ul>
  </fieldset>)}</div>
 </div>;
}
