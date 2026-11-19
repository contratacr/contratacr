'use client';

import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {
 CONTRACT_BODY_MAX,CONTRACT_CLAUSE_MAX,CONTRACT_CLAUSES_MAX,CONTRACT_FIELD_KEYS,CONTRACT_TITLE_MAX,contractBytes,contractFieldLabels,contractTextParts,unknownContractTokens,
 type ContractClause,type ContractMutation,type LibraryClause,
} from '@/lib/pro/contracts';
import {AiDraftAssist} from './ai-assistant';
import {openProSection} from '@/lib/pro/navigation';

export const contractsApi='/api/pro/contracts';
export type ContractState={dirty:boolean;busy:boolean};
export type PostOutcome={kind:'ok';body:unknown}|{kind:'conflict'}|{kind:'uncertain'}|{kind:'rejected';status:number;error:string};
/** POST one action. 409 → conflict; 5xx/429/network → uncertain (retry the SAME input: the receipt makes it idempotent). */
export async function postContract(accountId:string,input:unknown):Promise<PostOutcome>{
 if(contractBytes(input)>CONTRACT_BODY_MAX)return {kind:'rejected',status:413,error:''};
 try{
  const response=await fetch(contractsApi,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify(input)});
  if(response.status===409)return {kind:'conflict'};
  if(response.status>=500||response.status===429)return {kind:'uncertain'};
  if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:unknown};return {kind:'rejected',status:response.status,error:typeof body.error==='string'?body.error:''};}
  return {kind:'ok',body:await response.json()};
 }catch{return {kind:'uncertain'};}
}
export const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4';
export const field='mt-1 min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-sm text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#008bb5]';
export const label='block text-sm font-semibold text-[#162543]';

/** Text with unresolved {{fields}} highlighted (no HTML is ever injected). */
export function ContractText({text,className=''}:{text:string;className?:string}){
 const en=useLocale()==='en',labels=contractFieldLabels(en) as Record<string,string>;
 return <p className={'whitespace-pre-wrap break-words '+className}>{contractTextParts(text).map((part,index)=>part.field?<mark key={index} data-contract-missing-token={part.field} title={labels[part.field]??part.field} className="rounded bg-amber-100 px-1 text-amber-900">{part.text}</mark>:<span key={index}>{part.text}</span>)}</p>;
}

function copy(en:boolean){
 return en?{clauses:'Clauses',empty:'No clauses yet. Add a blank clause or one from your library.',add:'Add clause',fromLibrary:'Add from library',libraryPick:'Clause from your library',noLibrary:'Your clause library is empty. You can create clauses in Company › Templates.',
  insert:'Insert',clauseTitle:'Clause title',clauseBody:'Clause text',insertField:'Insert merge field',chooseField:'Choose a field…',chooseClause:'Choose a clause…',save:'Save clause',saving:'Saving…',cancel:'Cancel',edit:'Edit',remove:'Remove',up:'Move up',down:'Move down',
  removeConfirm:'Remove this clause?',titleRequired:'Write the clause title.',bodyRequired:'Write the clause text.',unknown:(keys:string)=>`These fields do not exist: ${keys}. Use the field list.`,tooLong:'The clause is too long to save in one step. Split it into two clauses.',
  max:`Up to ${CONTRACT_CLAUSES_MAX} clauses.`,conflict:'This changed in another window. Reload before continuing.',uncertain:'We could not confirm whether it was saved. Retry the same operation; it will not be applied twice.',retrySame:'Retry',failed:'Could not save the clause.',
  chars:(n:number)=>`${n}/${CONTRACT_CLAUSE_MAX}`,position:(n:number,total:number)=>`Clause ${n} of ${total}`}
 :{clauses:'Cláusulas',empty:'Todavía no hay cláusulas. Agregue una en blanco o una de su biblioteca.',add:'Agregar cláusula',fromLibrary:'Agregar desde la biblioteca',libraryPick:'Cláusula de su biblioteca',noLibrary:'Su biblioteca de cláusulas está vacía. Puede crear cláusulas en Empresa › Plantillas.',
  insert:'Insertar',clauseTitle:'Título de la cláusula',clauseBody:'Texto de la cláusula',insertField:'Insertar campo combinable',chooseField:'Elija un campo…',chooseClause:'Elija una cláusula…',save:'Guardar cláusula',saving:'Guardando…',cancel:'Cancelar',edit:'Editar',remove:'Quitar',up:'Subir',down:'Bajar',
  removeConfirm:'¿Quitar esta cláusula?',titleRequired:'Escriba el título de la cláusula.',bodyRequired:'Escriba el texto de la cláusula.',unknown:(keys:string)=>`Estos campos no existen: ${keys}. Use la lista de campos.`,tooLong:'La cláusula es demasiado larga para guardarla de una vez. Divídala en dos cláusulas.',
  max:`Hasta ${CONTRACT_CLAUSES_MAX} cláusulas.`,conflict:'Esto cambió en otra ventana. Recargue antes de continuar.',uncertain:'No pudimos confirmar si se guardó. Reintente la misma operación; no se aplicará dos veces.',retrySame:'Reintentar',failed:'No se pudo guardar la cláusula.',
  chars:(n:number)=>`${n}/${CONTRACT_CLAUSE_MAX}`,position:(n:number,total:number)=>`Cláusula ${n} de ${total}`};
}

/** Title + text editor with a merge-field picker that inserts {{field}} at the cursor. */
export function ClauseForm({initial,disabled,saving,submitLabel,onSubmit,onCancel,onDirty,error,aiWorkId=null}:{initial:{title:string;body:string};disabled?:boolean;saving:boolean;submitLabel?:string;onSubmit:(value:{title:string;body:string})=>void;onCancel:()=>void;onDirty?:(dirty:boolean)=>void;error?:string;aiWorkId?:string|null}){
 const en=useLocale()==='en',c=copy(en),labels=contractFieldLabels(en),id=useId(),bodyRef=useRef<HTMLTextAreaElement>(null),caret=useRef<{start:number;end:number}|null>(null);
 const [title,setTitle]=useState(initial.title),[body,setBody]=useState(initial.body),[problem,setProblem]=useState('');
 const dirty=title!==initial.title||body!==initial.body;
 useLayoutEffect(()=>{onDirty?.(dirty);},[dirty,onDirty]);
 useLayoutEffect(()=>()=>onDirty?.(false),[onDirty]);
 // Round 7B: WebKit does not always fire «select» for a collapsed caret moved by
 // keys or set programmatically; also remember it on key/mouse up and on blur
 // (at blur time the selection is still the one the user left).
 function remember(event:{currentTarget:HTMLTextAreaElement}){caret.current={start:event.currentTarget.selectionStart,end:event.currentTarget.selectionEnd};}
 function insertField(key:string){
  // Round 2: use the caret remembered while typing/clicking in the text; choosing from the select
  // moves focus away and some browsers (WebKit) report the end of the text after the blur.
  const node=bodyRef.current,token=`{{${key}}}`,saved=caret.current&&caret.current.start<=body.length?caret.current:null,start=saved?.start??node?.selectionStart??body.length,end=Math.min(saved?.end??node?.selectionEnd??body.length,body.length);
  caret.current={start:start+token.length,end:start+token.length};
  const next=(body.slice(0,start)+token+body.slice(end)).slice(0,CONTRACT_CLAUSE_MAX);setBody(next);
  requestAnimationFrame(()=>{if(!node)return;node.focus();node.setSelectionRange(start+token.length,start+token.length);});
 }
 function submit(){
  const t=title.trim(),b=body.trim();
  if(!t){setProblem(c.titleRequired);return;}if(!b){setProblem(c.bodyRequired);return;}
  const unknown=[...new Set([...unknownContractTokens(t),...unknownContractTokens(b)])];if(unknown.length){setProblem(c.unknown(unknown.join(', ')));return;}
  if(new TextEncoder().encode(t+b).length>CONTRACT_BODY_MAX-1200){setProblem(c.tooLong);return;}
  setProblem('');onSubmit({title:t,body:b});
 }
 const message=problem||error;
 return <div data-contract-clause-form className="space-y-3 rounded-xl border border-[#d7e1ea] bg-[#f7f9fc] p-3">
  <label className={label} htmlFor={id+'-title'}>{c.clauseTitle}</label>
  <input id={id+'-title'} data-contract-field="clause-title" className={field+' !mt-0'} value={title} maxLength={CONTRACT_TITLE_MAX} disabled={disabled||saving} onChange={event=>setTitle(event.target.value)}/>
  <div className="flex flex-wrap items-end justify-between gap-2"><label className={label} htmlFor={id+'-body'}>{c.clauseBody}</label><span className="text-xs text-[#52627a]" aria-live="polite">{c.chars(body.length)}</span></div>
  <textarea id={id+'-body'} ref={bodyRef} data-contract-field="clause-body" rows={6} className={field+' !mt-0 min-h-32'} value={body} maxLength={CONTRACT_CLAUSE_MAX} disabled={disabled||saving} onChange={event=>{setBody(event.target.value);caret.current={start:event.target.selectionStart,end:event.target.selectionEnd};}} onSelect={remember} onKeyUp={remember} onMouseUp={remember} onBlur={remember}/>
  <AiDraftAssist feature="contract_clause" workId={aiWorkId} disabled={disabled||saving} getInput={()=>({title,current:body})} onUse={text=>setBody(text.slice(0,CONTRACT_CLAUSE_MAX))}/>
  <label className={label}>{c.insertField}
   <select data-contract-field="insert-field" className={field} value="" disabled={disabled||saving} onChange={event=>{if(event.target.value)insertField(event.target.value);}}>
    <option value="">{c.chooseField}</option>{CONTRACT_FIELD_KEYS.map(key=><option key={key} value={key}>{labels[key]} — {`{{${key}}}`}</option>)}
   </select>
  </label>
  {message&&<p role="alert" data-contract-clause-error className="text-sm text-red-700">{message}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={disabled||saving} onClick={submit}>{saving?c.saving:submitLabel??c.save}</Button><Button type="button" variant="secondary" className="min-h-11" disabled={saving} onClick={onCancel}>{c.cancel}</Button></div>
 </div>;
}

type Editing={mode:'new';position:number}|{mode:'edit';clauseId:string}|null;
/**
 * Ordered clause list of a template or a draft contract. Each change is one action with the
 * object's revision (CAS), so long contracts never exceed the 16 KiB body limit.
 */
export function ClauseListEditor({accountId,scope,targetId,revision,clauses,library,disabled=false,confirmRemove,onSaved,onConflict,onStateChange,aiWorkId=null}:{
 aiWorkId?:string|null;accountId:string;scope:'template'|'contract';targetId:string;revision:number;clauses:ContractClause[];library:LibraryClause[];disabled?:boolean;
 confirmRemove:()=>Promise<boolean>;onSaved:(body:unknown)=>void;onConflict:()=>void;onStateChange:(state:ContractState)=>void;
}){
 const en=useLocale()==='en',c=copy(en),pickId=useId();
 const [editing,setEditing]=useState<Editing>(null),[formDirty,setFormDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[libraryPick,setLibraryPick]=useState('');
 const pending=useRef<ContractMutation|null>(null),lock=useRef(false);
 useLayoutEffect(()=>{onStateChange({dirty:formDirty&&editing!==null,busy:saving||uncertain});},[formDirty,editing,saving,uncertain,onStateChange]);
 useEffect(()=>()=>onStateChange({dirty:false,busy:false}),[onStateChange]);
 async function run(input:ContractMutation){
  if(lock.current)return;lock.current=true;pending.current=input;setSaving(true);setError('');
  try{
   const outcome=await postContract(accountId,input);
   if(outcome.kind==='uncertain'){setUncertain(true);setError(c.uncertain);return;}
   pending.current=null;setUncertain(false);
   if(outcome.kind==='conflict'){setError(c.conflict);onConflict();return;}
   if(outcome.kind==='rejected'){setError(outcome.status===413?c.tooLong:c.failed);return;}
   setEditing(null);setFormDirty(false);setLibraryPick('');onSaved(outcome.body);
  }finally{lock.current=false;setSaving(false);}
 }
 const base=(action:string)=>({action,actionId:crypto.randomUUID(),scope,id:targetId,revision});
 const full=clauses.length>=CONTRACT_CLAUSES_MAX,locked=disabled||saving||uncertain;
 const activeLibrary=library.filter(item=>!item.archived);
 return <section data-contract-clauses={scope} aria-label={c.clauses} className="min-w-0 space-y-3">
  <h3 className="font-bold text-[#162543]">{c.clauses} <span className="font-normal text-[#52627a]">({clauses.length})</span></h3>
  {!clauses.length&&editing?.mode!=='new'&&<p data-contract-clauses-empty className="rounded-xl border border-dashed border-[#d7e1ea] p-4 text-sm text-[#52627a]">{c.empty}</p>}
  <ol className="space-y-3">
   {clauses.map((clause,index)=><li key={clause.id} data-contract-clause={index+1} className="min-w-0 rounded-xl border border-[#d7e1ea] bg-white p-3">
    {editing?.mode==='edit'&&editing.clauseId===clause.id
     ?<ClauseForm aiWorkId={aiWorkId} initial={{title:clause.title,body:clause.body}} saving={saving} onDirty={setFormDirty} error={error} onCancel={()=>{setEditing(null);setError('');}}
       onSubmit={value=>void run({...base('clause_put'),clauseId:clause.id,position:index+1,...value} as ContractMutation)}/>
     :<>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#52627a]">{c.position(index+1,clauses.length)}</p>
      <h4 className="mt-1 break-words font-semibold text-[#162543]">{clause.title}</h4>
      <ContractText text={clause.body} className="mt-1 text-sm text-[#162543]"/>
      {!disabled&&<div className="mt-3 flex flex-wrap gap-2">
       <Button type="button" variant="secondary" className="min-h-11" disabled={locked||editing!==null} onClick={()=>{setError('');setEditing({mode:'edit',clauseId:clause.id});}}>{c.edit}</Button>
       <Button type="button" variant="secondary" className="min-h-11" aria-label={`${c.up}: ${clause.title}`} disabled={locked||editing!==null||index===0} onClick={()=>void run({...base('clause_move'),clauseId:clause.id,position:index} as ContractMutation)}>↑ {c.up}</Button>
       <Button type="button" variant="secondary" className="min-h-11" aria-label={`${c.down}: ${clause.title}`} disabled={locked||editing!==null||index===clauses.length-1} onClick={()=>void run({...base('clause_move'),clauseId:clause.id,position:index+2} as ContractMutation)}>↓ {c.down}</Button>
       <Button type="button" variant="secondary" className="min-h-11 text-red-700" disabled={locked||editing!==null} onClick={async()=>{if(await confirmRemove())void run({...base('clause_remove'),clauseId:clause.id} as ContractMutation);}}>{c.remove}</Button>
      </div>}
     </>}
   </li>)}
  </ol>
  {editing?.mode==='new'&&<ClauseForm aiWorkId={aiWorkId} initial={{title:'',body:''}} saving={saving} onDirty={setFormDirty} error={error} onCancel={()=>{setEditing(null);setError('');}}
   onSubmit={value=>void run({...base('clause_put'),clauseId:crypto.randomUUID(),position:editing.position,...value} as ContractMutation)}/>}
  {!disabled&&editing===null&&<div className="space-y-3">
   <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={locked||full} onClick={()=>{setError('');setEditing({mode:'new',position:clauses.length+1});}}>{c.add}</Button></div>
   {activeLibrary.length
    ?<div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
      <label className={label+' min-w-0 flex-1'} htmlFor={pickId}>{c.libraryPick}
       <select id={pickId} data-contract-field="library-pick" className={field} value={libraryPick} disabled={locked||full} onChange={event=>setLibraryPick(event.target.value)}>
        <option value="">{c.chooseClause}</option>{activeLibrary.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
       </select>
      </label>
      <Button type="button" variant="secondary" className="min-h-11" disabled={locked||full||!libraryPick} onClick={()=>void run({...base('clause_insert_library'),libraryClauseId:libraryPick,clauseId:crypto.randomUUID(),position:clauses.length+1} as ContractMutation)}>{c.fromLibrary}</Button>
     </div>
    :<p className="text-sm text-[#52627a]">{c.noLibrary} <a data-contract-templates-link className="font-semibold text-[#007aa0] underline" href={(en?'/en':'')+'/dashboard/pro?tab=pro_company&empresa=plantillas'} onClick={event=>{event.preventDefault();openProSection('pro_company',{empresa:'plantillas'},en);}}>{en?'Open Company › Templates':'Abrir Empresa › Plantillas'}</a></p>}
   {full&&<p className="text-sm text-[#52627a]">{c.max}</p>}
  </div>}
  {error&&editing===null&&<div role="alert" data-contract-clauses-error className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{error}</span>{uncertain&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>{const input=pending.current;if(input)void run(input);}}>{c.retrySame}</Button>}</div>}
 </section>;
}
