'use client';

import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {centsToInput} from '@/lib/pro/allowances';
import {VAT_OPTIONS,vatOptionLabel} from '@/lib/pro/invoice-tax';
import {
 PROJECT_CODE,PROJECT_TAG_LIMIT,detailsMutationSchema,projectBudgetToCents,detailsReadSchema,detailsResultSchema,projectColorHex,projectColorNames,projectColors,projectTypeLabel,
 type DetailsMutation,type DetailsRead,type ProjectCatalog,type ProjectColor,type ProjectType,type ProjectVatCode,
} from '@/lib/pro/project-details';
import {useProChildGuard} from './use-pro-child-guard';
import {ProjectActivityRates} from './project-activity-rates';

/**
 * Detalles del proyecto: colour, type, code, planned budget, tags, addresses and the
 * project default IVA. Private to the professional; the customer does not see them.
 */
const api='/api/pro/project-details';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543]';
const label='block min-w-0 text-sm font-semibold text-[#162543]';
type StateCallback={onStateChange?:(state:{dirty:boolean;busy:boolean})=>void};
type Draft={color:ProjectColor|null;typeId:string;code:string;budget:string;tags:string[];address:string;billingSame:boolean;billing:string;shippingSame:boolean;shipping:string;vat:ProjectVatCode|''};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function toDraft(read:DetailsRead):Draft{
 const d=read.details;
 return{color:d.color,typeId:d.typeId??'',code:d.code??'',budget:d.budgetCents===null?'':centsToInput(d.budgetCents),tags:d.tags.map(tag=>tag.name),address:d.address??'',
  billingSame:d.billingSameAsAddress,billing:d.billingAddress??'',shippingSame:d.shippingSameAsAddress,shipping:d.shippingAddress??'',vat:d.defaultVatCode??''};
}

function copy(en:boolean){
 return en?{
  title:'Project details',intro:'Internal information to organise and find this project. The customer does not see it.',
  identity:'Project',color:'Colour',noColor:'No colour',type:'Project type',noType:'No type',code:'Project code (optional)',codeHelp:'Up to 24 letters, numbers, dots, hyphens or slashes. It cannot repeat in your account.',
  budget:'Planned budget (₡, optional)',budgetHelp:'Reference amount for the whole project.',tags:'Tags',tagsHelp:(n:number)=>`Up to ${PROJECT_TAG_LIMIT}. Type a tag and press Add; existing tags are suggested. ${n} used.`,
  addTag:'Add',removeTag:(name:string)=>`Remove tag ${name}`,newTag:'New tag',addresses:'Addresses',address:'Main address of the project',useSuggested:'Use the customer address',
  billing:'Default billing address',shipping:'Default shipping address',sameAsMain:'Same as the main address',
  settings:'Project settings',vat:'Default IVA',noVat:'No default',vatHelp:'New lines of this project’s private quotes, invoice details and purchase orders start with this IVA. IVA already entered on a line is never changed.',
  save:'Save details',saving:'Saving…',reset:'Discard changes',
  manageTypes:'Manage project types',manageTags:'Manage tags',addType:'Add type',typeName:'Type name',rename:'Rename',archive:'Archive',restore:'Restore',delete:'Delete',
  archived:'Archived',inUse:(n:number)=>n===0?'Not used':`${n} ${n===1?'project':'projects'}`,
  deleteTagTitle:'Delete this tag?',deleteTagText:'It is removed from every project that uses it.',renameTitle:'Rename',cancel:'Cancel',
  history:'Change history',historyEmpty:'No changes yet.',actions:{save:'Details saved',tag_removed:'Tag deleted from the catalogue'} as Record<string,string>,
  loading:'Loading details…',loadError:'Could not load the project details.',retry:'Retry',reload:'Reload',
  invalid:'Check the code, the budget (up to two decimals) and that each text fits.',budgetMax:'The planned budget can be up to ₡100,000,000,000.',tooManyTags:`You can use up to ${PROJECT_TAG_LIMIT} tags.`,duplicateTag:'That tag is already on the project.',
  codeTaken:'Another project already uses that code.',noChanges:'There are no changes to save.',
  conflict:'The details changed in another window. Reload before trying again.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry the same operation',
  failed:'Could not save. Check the data and try again.',leave:'Save or discard the project details before leaving.',saved:'Details saved.',catalogSaved:'Catalogue updated.',
 }:{
  title:'Detalles del proyecto',intro:'Información interna para organizar y encontrar este proyecto. El cliente no la ve.',
  identity:'Proyecto',color:'Color',noColor:'Sin color',type:'Tipo de proyecto',noType:'Sin tipo',code:'Código del proyecto (opcional)',codeHelp:'Hasta 24 letras, números, puntos, guiones o barras. No se puede repetir en su cuenta.',
  budget:'Presupuesto previsto (₡, opcional)',budgetHelp:'Monto de referencia para todo el proyecto.',tags:'Etiquetas',tagsHelp:(n:number)=>`Hasta ${PROJECT_TAG_LIMIT}. Escriba una etiqueta y pulse Agregar; se sugieren las que ya existen. Usadas: ${n}.`,
  addTag:'Agregar',removeTag:(name:string)=>`Quitar la etiqueta ${name}`,newTag:'Nueva etiqueta',addresses:'Direcciones',address:'Dirección principal del proyecto',useSuggested:'Usar la dirección del cliente',
  billing:'Dirección de facturación predeterminada',shipping:'Dirección de envío predeterminada',sameAsMain:'Igual que la dirección principal',
  settings:'Configuración del proyecto',vat:'IVA predeterminado',noVat:'Sin valor predeterminado',vatHelp:'Las líneas nuevas de cotizaciones privadas, detalles de factura y órdenes de compra de este proyecto empiezan con este IVA. Nunca cambia el IVA ya escrito en una línea.',
  save:'Guardar detalles',saving:'Guardando…',reset:'Descartar cambios',
  manageTypes:'Administrar tipos de proyecto',manageTags:'Administrar etiquetas',addType:'Agregar tipo',typeName:'Nombre del tipo',rename:'Cambiar nombre',archive:'Archivar',restore:'Restaurar',delete:'Eliminar',
  archived:'Archivado',inUse:(n:number)=>n===0?'Sin uso':`${n} ${n===1?'proyecto':'proyectos'}`,
  deleteTagTitle:'¿Eliminar esta etiqueta?',deleteTagText:'Se quita de todos los proyectos que la usan.',renameTitle:'Cambiar nombre',cancel:'Cancelar',
  history:'Historial de cambios',historyEmpty:'Todavía no hay cambios.',actions:{save:'Detalles guardados',tag_removed:'Etiqueta eliminada del catálogo'} as Record<string,string>,
  loading:'Cargando detalles…',loadError:'No se pudieron cargar los detalles del proyecto.',retry:'Reintentar',reload:'Recargar',
  invalid:'Revise el código, el presupuesto (hasta dos decimales) y que cada texto quepa.',budgetMax:'El presupuesto previsto puede ser de hasta ₡100.000.000.000.',tooManyTags:`Puede usar hasta ${PROJECT_TAG_LIMIT} etiquetas.`,duplicateTag:'Esa etiqueta ya está en el proyecto.',
  codeTaken:'Otro proyecto ya usa ese código.',noChanges:'No hay cambios por guardar.',
  conflict:'Los detalles cambiaron en otra ventana. Recargue antes de intentarlo de nuevo.',uncertain:'No se pudo confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar la misma operación',
  failed:'No se pudo guardar. Revise los datos e intente de nuevo.',leave:'Guarde o descarte los detalles del proyecto antes de salir.',saved:'Detalles guardados.',catalogSaved:'Catálogo actualizado.',
 };
}
type Copy=ReturnType<typeof copy>;
const stamp=(value:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));

export function ProjectDetails({workId,onStateChange}:{workId:string}&StateCallback){
 const {user,loading}=useAuth();if(loading||!user)return null;
 return <DetailsSession key={user.id+':'+workId} accountId={user.id} workId={workId} onStateChange={onStateChange}/>;
}

function DetailsSession({accountId,workId,onStateChange}:{accountId:string;workId:string}&StateCallback){
 const en=useLocale()==='en',c=copy(en),{confirm,dialogNode}=useAppDialog(),uid=useId();
 const [read,setRead]=useState<DetailsRead|null>(null),[loadError,setLoadError]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[tagInput,setTagInput]=useState('');
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false),[error,setError]=useState(''),[codeError,setCodeError]=useState(''),[notice,setNotice]=useState('');
 const active=useRef(true),sequence=useRef(0),lock=useRef(false),pending=useRef<{input:DetailsMutation;notice:string}|null>(null);
 const initial=read?toDraft(read):null,dirty=!!draft&&!!initial&&!same(draft,initial),busy=saving||uncertain;
 useProChildGuard(!onStateChange&&(dirty||busy),useCallback(()=>setError(c.leave),[c.leave]));
 useLayoutEffect(()=>{onStateChange?.({dirty,busy});return()=>onStateChange?.({dirty:false,busy:false});},[dirty,busy,onStateChange]);
 const load=useCallback(async()=>{
  const id=++sequence.current;setLoadError(false);
  try{
   const response=await fetch(api+'?'+new URLSearchParams({view:'detail',workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();
   const body=detailsReadSchema.parse(await response.json());if(body.details.workId!==workId)throw Error();
   if(active.current&&id===sequence.current){setRead(body);setDraft(toDraft(body));setConflict(false);}
  }catch{if(active.current&&id===sequence.current)setLoadError(true);}
 },[accountId,workId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{active.current=true;const timer=setTimeout(()=>void load(),0);return()=>{active.current=false;invalidate();clearTimeout(timer);};},[load,invalidate]);

 async function send(input:DetailsMutation,success:string){
  if(lock.current)return false;lock.current=true;pending.current={input,notice:success};setSaving(true);setError('');setCodeError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(response.status===409){const body=await response.json().catch(()=>({}));pending.current=null;setUncertain(false);if(body?.field==='code'){setCodeError(c.codeTaken);return false;}setConflict(true);setError(c.conflict);return false;}
   if(response.status>=500||response.status===429){setUncertain(true);setError(c.uncertain);return false;}
   if(!response.ok){pending.current=null;setUncertain(false);setError(input.action==='save'?c.invalid:c.failed);return false;}
   detailsResultSchema.parse(await response.json());
   pending.current=null;setUncertain(false);if(active.current)setNotice(success);
   lock.current=false;await load();return true;
  }catch{setUncertain(true);setError(c.uncertain);return false;}
  finally{lock.current=false;if(active.current)setSaving(false);}
 }
 function retrySame(){const last=pending.current;if(last)void send(last.input,last.notice);}
 const patch=(value:Partial<Draft>)=>setDraft(old=>old?{...old,...value}:old);
 function addTag(){
  if(!draft)return;const name=tagInput.trim().replace(/\s+/g,' ').slice(0,40);if(!name)return;
  if(draft.tags.some(tag=>tag.toLocaleLowerCase('es')===name.toLocaleLowerCase('es'))){setError(c.duplicateTag);return;}
  if(draft.tags.length>=PROJECT_TAG_LIMIT){setError(c.tooManyTags);return;}
  const known=read?.catalog.tags.find(tag=>tag.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es'));
  patch({tags:[...draft.tags,known?.name??name]});setTagInput('');setError('');
 }
 function submit(event:FormEvent){
  event.preventDefault();if(!draft||!read||busy||conflict)return;
  if(!dirty){setError(c.noChanges);return;}
  const typedBudget=draft.budget.trim()===''?null:projectBudgetToCents(draft.budget);
  if(typedBudget&&'error' in typedBudget){setError(typedBudget.error==='max'?c.budgetMax:c.invalid);return;}
  const budget=typedBudget?typedBudget.cents:null;
  if(draft.code.trim()&&!PROJECT_CODE.test(draft.code.trim())){setCodeError(c.codeHelp);return;}
  const parsed=detailsMutationSchema.safeParse({action:'save',actionId:crypto.randomUUID(),workId,revision:read.details.revision,color:draft.color,typeId:draft.typeId||null,code:draft.code.trim()||null,budgetCents:budget,
   address:draft.address.trim()||null,billingAddress:draft.billingSame?null:draft.billing.trim()||null,shippingAddress:draft.shippingSame?null:draft.shipping.trim()||null,defaultVatCode:draft.vat||null,tags:draft.tags});
  if(!parsed.success){setError(c.invalid);return;}
  void send(parsed.data,c.saved);
 }
 async function catalogAction(kind:'type_create'|'type_rename'|'tag_rename',target?:{id:string;name:string}){
  if(busy||!read||dirty)return;
  const answer=await confirm({title:kind==='type_create'?c.addType:c.renameTitle,confirmLabel:kind==='type_create'?c.addType:c.rename,cancelLabel:c.cancel,input:{label:kind==='tag_rename'?c.tags:c.typeName,defaultValue:target?.name??''}});
  const name=(answer.value??'').trim();if(!answer.confirmed||!name)return;
  const base={actionId:crypto.randomUUID(),catalogRevision:read.catalog.revision};
  const parsed=detailsMutationSchema.safeParse(kind==='type_create'?{action:kind,...base,id:crypto.randomUUID(),name}:kind==='type_rename'?{action:kind,...base,typeId:target!.id,name}:{action:kind,...base,tagId:target!.id,name});
  if(!parsed.success){setError(c.invalid);return;}void send(parsed.data,c.catalogSaved);
 }
 async function simpleCatalog(action:'type_archive'|'type_restore'|'tag_delete',targetId:string,name:string){
  if(busy||!read||dirty)return;
  if(action==='tag_delete'){const answer=await confirm({title:c.deleteTagTitle,description:name,detail:c.deleteTagText,confirmLabel:c.delete,cancelLabel:c.cancel,tone:'danger'});if(!answer.confirmed)return;}
  const base={actionId:crypto.randomUUID(),catalogRevision:read.catalog.revision};
  void send(action==='tag_delete'?{action,...base,tagId:targetId}:{action,...base,typeId:targetId},c.catalogSaved);
 }

 if(loadError&&!read)return <div role="alert" className="space-y-2"><p className="text-sm">{c.loadError}</p><Button className="min-h-11" type="button" variant="secondary" onClick={()=>void load()}>{c.retry}</Button></div>;
 if(!read||!draft)return <p role="status" className="text-sm text-[#52627a]">{c.loading}</p>;
 const catalog=read.catalog,types=catalog.types.filter(type=>!type.archived||type.id===read.details.typeId),suggested=read.project.suggestedAddress;
 const typeName=(type:ProjectType)=>projectTypeLabel(type,en)??'—';
 return <section data-project-details className="min-w-0 space-y-4">
  {dialogNode}
  <div><h3 className="text-lg font-semibold text-[#162543]">{c.title}</h3><p className="mt-1 text-sm text-[#52627a]">{c.intro}</p></div>
  {notice&&<p role="status" className="rounded-xl bg-[#eef8f4] px-3 py-2 text-sm text-[#18573a]">{notice}</p>}
  {error&&<div role="alert" className="space-y-2 rounded-xl bg-[#fdf0f0] px-3 py-2 text-sm text-[#9b2c2c]"><p>{error}</p>{uncertain&&<Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={retrySame}>{c.retrySame}</Button>}{conflict&&<Button className="min-h-11" type="button" variant="secondary" onClick={()=>{setError('');void load();}}>{c.reload}</Button>}</div>}
  <form onSubmit={submit} className="min-w-0 space-y-4" data-project-details-form>
   <fieldset className="min-w-0 space-y-4 rounded-2xl border border-[#d7e1ea] bg-white p-4"><legend className="px-1 text-base font-semibold text-[#162543]">{c.identity}</legend>
    <fieldset className="min-w-0"><legend className="text-sm font-semibold text-[#162543]">{c.color}</legend>
     <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {[null,...projectColors].map(color=><label key={color??'none'} className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${draft.color===color?'border-[#008bb5] bg-[#eaf7fb] font-semibold text-[#006f93]':'border-[#d7e1ea] text-[#162543]'}`}>
       <input type="radio" name={uid+'-color'} className="sr-only" checked={draft.color===color} onChange={()=>patch({color})}/>
       <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-[#d7e1ea]" style={color?{background:projectColorHex[color]}:{background:'repeating-linear-gradient(45deg,#fff,#fff 3px,#d7e1ea 3px,#d7e1ea 5px)'}}/>
       <span className="min-w-0 truncate">{color?projectColorNames[en?'en':'es'][color]:c.noColor}</span></label>)}
     </div>
    </fieldset>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
     <label className={label}>{c.type}<select value={draft.typeId} onChange={event=>patch({typeId:event.target.value})} className={field}><option value="">{c.noType}</option>{types.map(type=><option key={type.id} value={type.id}>{typeName(type)}{type.archived?` (${c.archived})`:''}</option>)}</select></label>
     <div className="min-w-0"><label className={label}>{c.code}<input value={draft.code} maxLength={24} autoCapitalize="characters" aria-invalid={!!codeError} aria-describedby={uid+'-code'} onChange={event=>{patch({code:event.target.value});setCodeError('');}} className={field}/></label>
      <p id={uid+'-code'} role={codeError?'alert':undefined} className={`mt-1 text-xs ${codeError?'text-[#9b2c2c]':'text-[#52627a]'}`}>{codeError||c.codeHelp}</p></div>
     <div className="min-w-0"><label className={label}>{c.budget}<input inputMode="decimal" aria-describedby={uid+'-budget'} value={draft.budget} onChange={event=>patch({budget:event.target.value})} className={field}/></label>
      <p id={uid+'-budget'} className="mt-1 text-xs text-[#52627a]">{read.details.budgetCents!==null?proMoney(read.details.budgetCents/100)+' · ':''}{c.budgetHelp}</p></div>
    </div>
    <div className="min-w-0"><label className={label} htmlFor={uid+'-tag'}>{c.tags}</label>
     {draft.tags.length>0&&<ul className="mt-2 flex flex-wrap gap-2" data-project-detail-tags>{draft.tags.map(tag=><li key={tag} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-[#d7e1ea] bg-[#f7f9fc] pl-3 text-sm text-[#162543]"><span className="min-w-0 truncate">{tag}</span><button type="button" aria-label={c.removeTag(tag)} onClick={()=>patch({tags:draft.tags.filter(item=>item!==tag)})} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#52627a] hover:bg-white">×</button></li>)}</ul>}
     <div className="mt-2 flex min-w-0 gap-2"><input id={uid+'-tag'} list={uid+'-tags'} value={tagInput} maxLength={40} placeholder={c.newTag} disabled={draft.tags.length>=PROJECT_TAG_LIMIT} onChange={event=>setTagInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addTag();}}} className={field+' mt-0'}/>
      <Button className="min-h-11" type="button" variant="secondary" disabled={!tagInput.trim()||draft.tags.length>=PROJECT_TAG_LIMIT} onClick={addTag}>{c.addTag}</Button></div>
     <datalist id={uid+'-tags'}>{catalog.tags.filter(tag=>!draft.tags.includes(tag.name)).map(tag=><option key={tag.id} value={tag.name}/>)}</datalist>
     <p className="mt-1 text-xs text-[#52627a]">{c.tagsHelp(draft.tags.length)}</p>
    </div>
   </fieldset>
   <fieldset className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><legend className="px-1 text-base font-semibold text-[#162543]">{c.addresses}</legend>
    <label className={label}>{c.address}<textarea rows={2} maxLength={300} value={draft.address} onChange={event=>patch({address:event.target.value})} className={field+' resize-y'}/></label>
    {suggested&&!draft.address.trim()&&<Button className="min-h-11" type="button" variant="secondary" onClick={()=>patch({address:suggested})}>{c.useSuggested}</Button>}
    {([['billing','billingSame',c.billing],['shipping','shippingSame',c.shipping]] as const).map(([key,flag,title])=><div key={key} className="min-w-0 space-y-1">
     <p className="text-sm font-semibold text-[#162543]">{title}</p>
     <label className="inline-flex min-h-11 items-center gap-2 text-sm text-[#162543]"><input type="checkbox" checked={draft[flag]} onChange={event=>patch({[flag]:event.target.checked} as Partial<Draft>)}/>{c.sameAsMain}</label>
     {draft[flag]?<p className="break-words text-sm text-[#52627a]">{draft.address.trim()||'—'}</p>:<textarea aria-label={title} rows={2} maxLength={300} value={draft[key]} onChange={event=>patch({[key]:event.target.value} as Partial<Draft>)} className={field+' resize-y'}/>}
    </div>)}
   </fieldset>
   <fieldset className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4"><legend className="px-1 text-base font-semibold text-[#162543]">{c.settings}</legend>
    <div className="min-w-0"><label className={label}>{c.vat}<select aria-describedby={uid+'-vat'} value={draft.vat} onChange={event=>patch({vat:event.target.value as ProjectVatCode|''})} className={field}><option value="">{c.noVat}</option>{VAT_OPTIONS.map(option=><option key={option.code} value={option.code}>{option.code} · {vatOptionLabel(option.code,en)}</option>)}</select></label>
     <p id={uid+'-vat'} className="mt-1 text-xs text-[#52627a]">{c.vatHelp}</p></div>
   </fieldset>
   <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy||conflict||!dirty}>{saving?c.saving:c.save}</Button>{dirty&&<Button className="min-h-11" type="button" variant="secondary" disabled={saving} onClick={()=>{setDraft(initial);setError('');setCodeError('');}}>{c.reset}</Button>}</div>
  </form>
  <ProjectActivityRates workId={workId} accountId={accountId}/>
  <CatalogManager catalog={catalog} c={c} en={en} disabled={busy||dirty} onType={catalogAction} onSimple={simpleCatalog}/>
  <details className="rounded-2xl border border-[#d7e1ea] bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#162543]">{c.history}</summary>
   {read.history.length===0?<p className="mt-2 text-sm text-[#52627a]">{c.historyEmpty}</p>:<ol className="mt-2 space-y-1">{read.history.map(item=><li key={item.actionId+item.at} className="text-sm text-[#52627a]"><span className="font-semibold text-[#162543]">{c.actions[item.action]}</span> · {stamp(item.at,en)}</li>)}</ol>}
  </details>
 </section>;
}

function CatalogManager({catalog,c,en,disabled,onType,onSimple}:{catalog:ProjectCatalog;c:Copy;en:boolean;disabled:boolean;onType:(kind:'type_create'|'type_rename'|'tag_rename',target?:{id:string;name:string})=>void;onSimple:(action:'type_archive'|'type_restore'|'tag_delete',id:string,name:string)=>void}){
 const row='flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] py-2 first:border-t-0';
 return <div className="grid min-w-0 gap-4 lg:grid-cols-2">
  <details className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4" data-project-types-manager><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#162543]">{c.manageTypes}</summary>
   <ul className="mt-2">{catalog.types.map(type=>{const name=projectTypeLabel(type,en)??'—';return <li key={type.id} className={row}><span className="min-w-0 break-words text-sm text-[#162543]">{name}<span className="block text-xs text-[#52627a]">{type.archived?c.archived+' · ':''}{c.inUse(type.projectCount)}</span></span>
    <span className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" variant="secondary" disabled={disabled} onClick={()=>onType('type_rename',{id:type.id,name})}>{c.rename}</Button><Button className="min-h-11" type="button" variant="secondary" disabled={disabled} onClick={()=>onSimple(type.archived?'type_restore':'type_archive',type.id,name)}>{type.archived?c.restore:c.archive}</Button></span></li>;})}</ul>
   <Button type="button" className="min-h-11 mt-2" disabled={disabled||catalog.types.length>=50} onClick={()=>onType('type_create')}>{c.addType}</Button>
  </details>
  <details className="min-w-0 rounded-2xl border border-[#d7e1ea] bg-white p-4" data-project-tags-manager><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#162543]">{c.manageTags}</summary>
   {catalog.tags.length===0?<p className="mt-2 text-sm text-[#52627a]">—</p>:<ul className="mt-2">{catalog.tags.map(tag=><li key={tag.id} className={row}><span className="min-w-0 break-words text-sm text-[#162543]">{tag.name}<span className="block text-xs text-[#52627a]">{c.inUse(tag.projectCount)}</span></span>
    <span className="flex flex-wrap gap-2"><Button className="min-h-11" type="button" variant="secondary" disabled={disabled} onClick={()=>onType('tag_rename',{id:tag.id,name:tag.name})}>{c.rename}</Button><Button className="min-h-11" type="button" variant="secondary" disabled={disabled} onClick={()=>onSimple('tag_delete',tag.id,tag.name)}>{c.delete}</Button></span></li>)}</ul>}
  </details>
 </div>;
}
