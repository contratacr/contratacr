'use client';

import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {
 CONTRACT_TITLE_MAX,contractLibrarySchema,contractTemplateDetailSchema,contractTemplateResultSchema,
 type ContractLibrary,type ContractMutation,type ContractTemplate,type LibraryClause,
} from '@/lib/pro/contracts';
import {useProChildGuard} from './use-pro-child-guard';
import {ClauseForm,ClauseListEditor,ContractText,card,contractsApi,field,label,postContract,type ContractState} from './contract-clauses';

export type ContractTemplatesState=ContractState;
function copy(en:boolean){
 return en?{title:'Contract templates',intro:'Reusable contracts with ordered clauses and merge fields such as {{cliente.nombre}} or {{cotizacion.total}}. You use them when you create a contract in a project.',
  disclaimer:'Sample wording is generic and is not legal advice. Have a lawyer review your templates.',templates:'Templates',library:'Clause library',archivedView:'Show archived',activeView:'Show active',
  newTemplate:'New template',newClause:'New clause',empty:'You have no contract templates yet.',libraryEmpty:'Your clause library is empty.',open:'Open',archive:'Archive',restore:'Restore',edit:'Edit',
  templateTitle:'Template title',description:'Description (optional)',deposit:'Default deposit (%)',startWith:'Start with these library clauses (optional)',create:'Create template',creating:'Creating…',cancel:'Cancel',
  save:'Save',saving:'Saving…',back:'All templates',clauses:(n:number)=>n===1?'1 clause':`${n} clauses`,samples:'Add sample clauses',samplesHelp:'Adds generic sample clauses to your library (Spanish and English). Edit them to fit your business.',
  samplesDone:'Sample clauses added to your library.',loading:'Loading…',loadError:'Could not load the templates.',retry:'Retry',conflict:'This changed in another window. It was reloaded.',uncertain:'We could not confirm the operation. Retry the same operation; it will not be applied twice.',retrySame:'Retry',failed:'Could not complete the operation.',
  titleRequired:'Write the title.',depositInvalid:'Use a percentage between 0.01 and 100 with up to two decimals.',removeClause:'Remove this clause from the template?',leave:'Save or discard the template changes before leaving.',remove:'Remove',archived:'Archived'}
 :{title:'Plantillas de contrato',intro:'Contratos reutilizables con cláusulas ordenadas y campos combinables como {{cliente.nombre}} o {{cotizacion.total}}. Se usan al crear un contrato en un proyecto.',
  disclaimer:'Los textos de ejemplo son genéricos y no constituyen asesoría legal. Haga revisar sus plantillas por un abogado.',templates:'Plantillas',library:'Biblioteca de cláusulas',archivedView:'Ver archivadas',activeView:'Ver activas',
  newTemplate:'Nueva plantilla',newClause:'Nueva cláusula',empty:'Todavía no tiene plantillas de contrato.',libraryEmpty:'Su biblioteca de cláusulas está vacía.',open:'Abrir',archive:'Archivar',restore:'Restaurar',edit:'Editar',
  templateTitle:'Título de la plantilla',description:'Descripción (opcional)',deposit:'Anticipo predeterminado (%)',startWith:'Comenzar con estas cláusulas de la biblioteca (opcional)',create:'Crear plantilla',creating:'Creando…',cancel:'Cancelar',
  save:'Guardar',saving:'Guardando…',back:'Todas las plantillas',clauses:(n:number)=>n===1?'1 cláusula':`${n} cláusulas`,samples:'Agregar cláusulas de ejemplo',samplesHelp:'Agrega a su biblioteca cláusulas de ejemplo genéricas (en español e inglés). Edítelas según su negocio.',
  samplesDone:'Se agregaron las cláusulas de ejemplo a su biblioteca.',loading:'Cargando…',loadError:'No se pudieron cargar las plantillas.',retry:'Reintentar',conflict:'Esto cambió en otra ventana. Se recargó.',uncertain:'No pudimos confirmar la operación. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar',failed:'No se pudo completar la operación.',
  titleRequired:'Escriba el título.',depositInvalid:'Use un porcentaje entre 0,01 y 100 con hasta dos decimales.',removeClause:'¿Quitar esta cláusula de la plantilla?',leave:'Guarde o descarte los cambios de la plantilla antes de salir.',remove:'Quitar',archived:'Archivada'};
}
/**
 * Sample clauses: the team's own generic wording, not taken from any other product.
 * They are not legal advice; the owner must adapt them.
 */
export const sampleContractClauses:Record<'es'|'en',Array<{title:string;body:string}>>={
 es:[
  {title:'Partes',body:'Este contrato se celebra entre {{empresa.nombre}}, identificación {{empresa.identificacion}} ("la empresa"), y {{cliente.nombre}}, identificación {{cliente.identificacion}} ("el cliente").'},
  {title:'Objeto',body:'La empresa realizará los trabajos del proyecto {{proyecto.nombre}}, ubicado en {{proyecto.direccion}}, según la cotización {{cotizacion.codigo}}, que forma parte de este contrato.'},
  {title:'Precio y anticipo',body:'El precio total es {{cotizacion.total}}. Al aceptar este contrato, el cliente pagará un anticipo de {{anticipo.porcentaje}}, equivalente a {{anticipo.monto}}. El saldo se pagará según los avances acordados por escrito.'},
  {title:'Cambios',body:'Cualquier cambio en el alcance, los materiales o el plazo se acordará por escrito antes de ejecutarse e indicará su efecto en el precio y en el plazo.'},
  {title:'Terminación',body:'Cualquiera de las partes puede terminar este contrato por incumplimiento grave de la otra, avisando por escrito y dando un plazo razonable para corregirlo. Los trabajos realizados hasta esa fecha se pagarán según lo ejecutado.'},
 ],
 en:[
  {title:'Parties',body:'This agreement is made between {{empresa.nombre}}, ID {{empresa.identificacion}} ("the company"), and {{cliente.nombre}}, ID {{cliente.identificacion}} ("the customer").'},
  {title:'Scope of work',body:'The company will carry out the work for the project {{proyecto.nombre}}, located at {{proyecto.direccion}}, as described in quote {{cotizacion.codigo}}, which is part of this agreement.'},
  {title:'Price and deposit',body:'The total price is {{cotizacion.total}}. When accepting this agreement, the customer will pay a deposit of {{anticipo.porcentaje}}, that is {{anticipo.monto}}. The balance will be paid according to the milestones agreed in writing.'},
  {title:'Changes',body:'Any change to the scope, materials or schedule will be agreed in writing before it is carried out and will state its effect on price and schedule.'},
  {title:'Termination',body:'Either party may end this agreement if the other seriously fails to meet its obligations, after written notice and a reasonable time to fix it. Work done up to that date will be paid for as completed.'},
 ],
};
function parsePercent(value:string):number|null|undefined{const text=value.trim().replace(',','.');if(!text)return null;if(!/^\d{1,3}(\.\d{1,2})?$/.test(text))return undefined;const n=Number(text);return n>0&&n<=100?n:undefined;}

/** Company › Templates: contract templates and the reusable clause library. */
export function ContractTemplates({onStateChange,onChanged}:{onStateChange?:(state:ContractTemplatesState)=>void;onChanged?:()=>void}){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <TemplatesSession key={user.id} accountId={user.id} onStateChange={onStateChange} onChanged={onChanged}/>;
}

function TemplatesSession({accountId,onStateChange,onChanged}:{accountId:string;onStateChange?:(state:ContractState)=>void;onChanged?:()=>void}){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog(),id=useId();
 const [tab,setTab]=useState<'templates'|'library'>('templates'),[archived,setArchived]=useState(false),[data,setData]=useState<ContractLibrary|null>(null),[loadError,setLoadError]=useState(false);
 const [openTemplate,setOpenTemplate]=useState<string|null>(null),[creating,setCreating]=useState<'template'|'clause'|null>(null),[editingClause,setEditingClause]=useState<string|null>(null);
 const [childState,setChildState]=useState<ContractState>({dirty:false,busy:false}),[formDirty,setFormDirty]=useState(false);
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<ContractMutation[]|null>(null),lock=useRef(false),sequence=useRef(0);
 const dirty=childState.dirty||formDirty,busy=childState.busy||saving||uncertain;
 // Inside Company › Templates there is no parent guard: this section protects its own unsaved work.
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});},[dirty,busy,onStateChange]);
 useEffect(()=>()=>onStateChange?.({dirty:false,busy:false}),[onStateChange]);
 const load=useCallback(async()=>{
  const n=++sequence.current;setLoadError(false);
  try{const r=await fetch(contractsApi+'?'+new URLSearchParams(archived?{view:'library',archived:'1'}:{view:'library'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=contractLibrarySchema.parse(await r.json());if(n===sequence.current)setData(body);}
  catch{if(n===sequence.current)setLoadError(true);}
 },[accountId,archived]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0),counter=sequence;return()=>{clearTimeout(timer);counter.current++;};},[load]);
 /** Runs one or more actions in order (samples); stops at the first failure. Each keeps its own actionId for retries. */
 async function run(inputs:ContractMutation[],done?:string){
  if(lock.current)return false;lock.current=true;pending.current=inputs;setSaving(true);setError('');setNotice('');
  try{
   for(let i=0;i<inputs.length;i++){
    const outcome=await postContract(accountId,inputs[i]);
    if(outcome.kind==='uncertain'){pending.current=inputs.slice(i);setUncertain(true);setError(c.uncertain);return false;}
    if(outcome.kind==='conflict'){pending.current=null;setUncertain(false);setError(c.conflict);void load();return false;}
    if(outcome.kind==='rejected'){pending.current=null;setUncertain(false);setError(c.failed);return false;}
   }
   pending.current=null;setUncertain(false);if(done)setNotice(done);void load();onChanged?.();return true;
  }finally{lock.current=false;setSaving(false);}
 }
 if(loadError&&!data)return <section className={card} role="alert" data-contract-templates-error><p className="text-sm text-red-700">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></section>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{c.loading}</p>;
 const locked=busy,blocked=dirty||busy;
 if(openTemplate)return <>{dialogNode}<TemplateEditor accountId={accountId} templateId={openTemplate} library={data.clauses} confirm={confirm} onBack={()=>{setOpenTemplate(null);void load();onChanged?.();}} onStateChange={setChildState}/></>;
 return <section data-contract-templates className={card+' lg:col-span-2'} aria-labelledby={id+'-title'}>
  {dialogNode}
  <h3 id={id+'-title'} className="font-bold">{c.title}</h3>
  <p className="text-sm text-[#52627a]">{c.intro}</p>
  <p className="text-xs text-[#52627a]">{c.disclaimer}</p>
  <div role="tablist" aria-label={c.title} className="flex flex-wrap gap-2">
   {(['templates','library'] as const).map(key=><button key={key} type="button" role="tab" aria-selected={tab===key} disabled={blocked} data-contract-templates-tab={key} onClick={()=>{setTab(key);setCreating(null);setEditingClause(null);}} className={'min-h-11 rounded-full border px-4 text-sm font-semibold '+(tab===key?'border-[#008bb5] bg-[#e6f6fb] text-[#00698c]':'border-[#d7e1ea] bg-white text-[#162543]')}>{key==='templates'?c.templates:c.library} ({key==='templates'?data.counts.templates:data.counts.clauses})</button>)}
   <Button type="button" variant="ghost" className="min-h-11" disabled={blocked} onClick={()=>{setArchived(value=>!value);setCreating(null);}}>{archived?c.activeView:c.archivedView}</Button>
  </div>
  {notice&&<p role="status" className="text-sm text-emerald-800">{notice}</p>}
  {error&&<div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{uncertain&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{if(pending.current)void run(pending.current);}}>{c.retrySame}</Button>}</div>}
  {tab==='templates'?<div role="tabpanel" className="space-y-3">
   {!archived&&creating!=='template'&&<Button type="button" className="min-h-11" disabled={blocked} onClick={()=>setCreating('template')}>{c.newTemplate}</Button>}
   {creating==='template'&&<TemplateCreateForm library={data.clauses} saving={saving} onDirty={setFormDirty} onCancel={()=>{setCreating(null);setFormDirty(false);}}
    onSubmit={async input=>{if(await run([input])){setCreating(null);setFormDirty(false);setOpenTemplate(input.id);}}}/>}
   {data.templates.length?<ul className="grid min-w-0 gap-2 md:grid-cols-2">{data.templates.map(t=><li key={t.id} data-contract-template-row={t.title} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
    <p className="break-words font-semibold">{t.title}</p><p className="text-sm text-[#52627a]">{c.clauses(t.clauseCount)}{t.depositPercent!==null?` · ${en?t.depositPercent+'%':String(t.depositPercent).replace('.',',')+' %'}`:''}</p>
    {t.description&&<p className="break-words text-sm text-[#52627a]">{t.description}</p>}
    <div className="flex flex-wrap gap-2">{!t.archived&&<Button type="button" variant="secondary" className="min-h-11" disabled={blocked} onClick={()=>setOpenTemplate(t.id)}>{c.open}</Button>}
     <Button type="button" variant="secondary" className="min-h-11" disabled={blocked} onClick={()=>void run([{action:t.archived?'template_restore':'template_archive',actionId:crypto.randomUUID(),id:t.id,revision:t.revision}])}>{t.archived?c.restore:c.archive}</Button></div>
   </li>)}</ul>:<p data-contract-templates-empty className="text-sm text-[#52627a]">{c.empty}</p>}
  </div>
  :<div role="tabpanel" className="space-y-3">
   {!archived&&creating!=='clause'&&<div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={blocked} onClick={()=>setCreating('clause')}>{c.newClause}</Button>
    <Button type="button" variant="secondary" className="min-h-11" disabled={blocked} title={c.samplesHelp} onClick={()=>void run(sampleContractClauses[en?'en':'es'].map(s=>({action:'library_clause_create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),title:s.title,body:s.body})),c.samplesDone)}>{c.samples}</Button></div>}
   {creating==='clause'&&<ClauseForm initial={{title:'',body:''}} saving={saving} onDirty={setFormDirty} onCancel={()=>{setCreating(null);setFormDirty(false);}}
    onSubmit={async value=>{if(await run([{action:'library_clause_create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),...value}])){setCreating(null);setFormDirty(false);}}}/>}
   {data.clauses.length?<ul className="space-y-2">{data.clauses.map(item=><LibraryRow key={item.id} item={item} editing={editingClause===item.id} locked={locked} blocked={blocked} c={c} onDirty={setFormDirty}
     onEdit={()=>setEditingClause(item.id)} onCancel={()=>{setEditingClause(null);setFormDirty(false);}}
     onSave={async value=>{if(await run([{action:'library_clause_update',actionId:crypto.randomUUID(),id:item.id,revision:item.revision,...value}])){setEditingClause(null);setFormDirty(false);}}}
     onToggle={()=>void run([{action:item.archived?'library_clause_restore':'library_clause_archive',actionId:crypto.randomUUID(),id:item.id,revision:item.revision}])}/>)}</ul>
    :<p data-contract-library-empty className="text-sm text-[#52627a]">{c.libraryEmpty}</p>}
  </div>}
 </section>;
}

function LibraryRow({item,editing,locked,blocked,c,onDirty,onEdit,onCancel,onSave,onToggle}:{item:LibraryClause;editing:boolean;locked:boolean;blocked:boolean;c:ReturnType<typeof copy>;onDirty:(d:boolean)=>void;onEdit:()=>void;onCancel:()=>void;onSave:(v:{title:string;body:string})=>void;onToggle:()=>void}){
 if(editing)return <li><ClauseForm initial={{title:item.title,body:item.body}} saving={locked} onDirty={onDirty} onCancel={onCancel} onSubmit={onSave}/></li>;
 return <li data-contract-library-row={item.title} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
  <p className="break-words font-semibold">{item.title}{item.archived&&<span className="ml-2 text-xs font-normal text-[#52627a]">({c.archived})</span>}</p>
  <ContractText text={item.body} className="text-sm text-[#162543]"/>
  <div className="flex flex-wrap gap-2">{!item.archived&&<Button type="button" variant="secondary" className="min-h-11" disabled={blocked} onClick={onEdit}>{c.edit}</Button>}<Button type="button" variant="secondary" className="min-h-11" disabled={blocked} onClick={onToggle}>{item.archived?c.restore:c.archive}</Button></div>
 </li>;
}

function TemplateCreateForm({library,saving,onDirty,onCancel,onSubmit}:{library:LibraryClause[];saving:boolean;onDirty:(d:boolean)=>void;onCancel:()=>void;onSubmit:(input:Extract<ContractMutation,{action:'template_create'}>)=>void}){
 const en=useLocale()==='en',c=copy(en);
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[deposit,setDeposit]=useState(''),[picked,setPicked]=useState<string[]>([]),[problem,setProblem]=useState('');
 const dirty=!!(title||description||deposit||picked.length);
 useLayoutEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 function submit(){const pct=parsePercent(deposit);if(!title.trim()){setProblem(c.titleRequired);return;}if(pct===undefined){setProblem(c.depositInvalid);return;}
  onSubmit({action:'template_create',actionId:crypto.randomUUID(),id:crypto.randomUUID(),title:title.trim(),description:description.trim()||null,depositPercent:pct,libraryClauseIds:picked});}
 const active=library.filter(item=>!item.archived);
 return <div data-contract-template-form className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
  <label className={label}>{c.templateTitle}<input data-contract-field="template-title" className={field} value={title} maxLength={CONTRACT_TITLE_MAX} disabled={saving} onChange={event=>setTitle(event.target.value)}/></label>
  <label className={label}>{c.description}<textarea className={field} rows={2} maxLength={500} value={description} disabled={saving} onChange={event=>setDescription(event.target.value)}/></label>
  <label className={label}>{c.deposit}<input data-contract-field="template-deposit" inputMode="decimal" className={field} value={deposit} disabled={saving} onChange={event=>setDeposit(event.target.value)}/></label>
  {active.length>0&&<fieldset className="min-w-0 space-y-1"><legend className="text-sm font-semibold">{c.startWith}</legend>{active.map(item=><label key={item.id} className="flex min-h-11 min-w-0 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" data-contract-template-pick={item.title} checked={picked.includes(item.id)} disabled={saving} onChange={event=>setPicked(list=>event.target.checked?[...list,item.id]:list.filter(x=>x!==item.id))}/><span className="min-w-0 break-words">{item.title}</span></label>)}</fieldset>}
  {problem&&<p role="alert" className="text-sm text-red-700">{problem}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={saving} onClick={submit}>{saving?c.creating:c.create}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div>
 </div>;
}

type Confirm=ReturnType<typeof useAppDialog>['confirm'];
function TemplateEditor({accountId,templateId,library,confirm,onBack,onStateChange}:{accountId:string;templateId:string;library:LibraryClause[];confirm:Confirm;onBack:()=>void;onStateChange:(s:ContractState)=>void}){
 const en=useLocale()==='en',c=copy(en);
 const [template,setTemplate]=useState<ContractTemplate|null>(null),[failed,setFailed]=useState(false),[clauseState,setClauseState]=useState<ContractState>({dirty:false,busy:false});
 const [form,setForm]=useState<{title:string;description:string;deposit:string}|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const toForm=(t:ContractTemplate)=>({title:t.title,description:t.description??'',deposit:t.depositPercent===null?'':en?String(t.depositPercent):String(t.depositPercent).replace('.',',')});
 const load=useCallback(async()=>{
  setFailed(false);
  try{const r=await fetch(contractsApi+'?'+new URLSearchParams({templateId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();const body=contractTemplateDetailSchema.parse(await r.json());setTemplate(body.template);setForm(toForm(body.template));}
  catch{setFailed(true);}
 // eslint-disable-next-line react-hooks/exhaustive-deps -- toForm only depends on the locale
 },[accountId,templateId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const formDirty=!!template&&!!form&&JSON.stringify(form)!==JSON.stringify(toForm(template));
 useLayoutEffect(()=>{onStateChange({dirty:formDirty||clauseState.dirty,busy:saving||clauseState.busy});},[formDirty,clauseState,saving,onStateChange]);
 useEffect(()=>()=>onStateChange({dirty:false,busy:false}),[onStateChange]);
 if(failed&&!template)return <div role="alert" className={card}><p className="text-sm text-red-700">{c.loadError}</p><Button type="button" variant="secondary" className="min-h-11" onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!template||!form)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{c.loading}</p>;
 async function saveDetails(){
  if(!template||!form)return;const pct=parsePercent(form.deposit);if(!form.title.trim()){setError(c.titleRequired);return;}if(pct===undefined){setError(c.depositInvalid);return;}
  setSaving(true);setError('');
  try{const outcome=await postContract(accountId,{action:'template_update',actionId:crypto.randomUUID(),id:template.id,revision:template.revision,title:form.title.trim(),description:form.description.trim()||null,depositPercent:pct});
   if(outcome.kind==='ok'){const t=contractTemplateResultSchema.parse(outcome.body).template;setTemplate(t);setForm(toForm(t));}else if(outcome.kind==='conflict'){setError(c.conflict);void load();}else setError(outcome.kind==='uncertain'?c.uncertain:c.failed);}
  finally{setSaving(false);}
 }
 return <section data-contract-template-editor={template.title} className={card+' lg:col-span-2'}>
  <Button type="button" variant="secondary" className="min-h-11" disabled={formDirty||clauseState.dirty||saving||clauseState.busy} onClick={onBack}>← {c.back}</Button>
  <div className="grid min-w-0 gap-3 md:grid-cols-2">
   <label className={label}>{c.templateTitle}<input data-contract-field="template-title" className={field} value={form.title} maxLength={CONTRACT_TITLE_MAX} disabled={saving} onChange={event=>setForm({...form,title:event.target.value})}/></label>
   <label className={label}>{c.deposit}<input data-contract-field="template-deposit" inputMode="decimal" className={field} value={form.deposit} disabled={saving} onChange={event=>setForm({...form,deposit:event.target.value})}/></label>
   <label className={label+' md:col-span-2'}>{c.description}<textarea className={field} rows={2} maxLength={500} value={form.description} disabled={saving} onChange={event=>setForm({...form,description:event.target.value})}/></label>
  </div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={saving||!formDirty} onClick={()=>void saveDetails()}>{saving?c.saving:c.save}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving||!formDirty} onClick={()=>setForm(toForm(template))}>{c.cancel}</Button></div>
  <ClauseListEditor accountId={accountId} scope="template" targetId={template.id} revision={template.revision} clauses={template.clauses} library={library} disabled={formDirty||saving}
   confirmRemove={async()=>(await confirm({title:c.removeClause,tone:'danger',confirmLabel:c.remove,cancelLabel:c.cancel})).confirmed}
   onSaved={body=>{const t=contractTemplateResultSchema.parse(body).template;setTemplate(t);setForm(toForm(t));}} onConflict={()=>void load()} onStateChange={setClauseState}/>
 </section>;
}
