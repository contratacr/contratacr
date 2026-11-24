'use client';
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {centsToInput,colonesToCents} from '@/lib/pro/allowances';
import {boardTemplatesSchema,budgetUse,roomMetaListSchema,roomMetaSchema,type RoomMeta} from '@/lib/pro/selection-boards';
import type {SelectionArea,SelectionItem} from '@/lib/pro/selections';

/**
 * Area E: budget bar and assignee per room, board templates (save a room as a template, create a room from one) and
 * the copy-link button. Budget and assignee live in a side table; templates only keep a name and the item names.
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const headers=(accountId:string)=>({'Content-Type':'application/json','X-Pro-Expected-Actor':accountId});

export function useRoomMeta(accountId:string,workId:string,version:unknown){
 const [meta,setMeta]=useState<Map<string,RoomMeta>>(new Map());
 const reload=useCallback(async()=>{try{const r=await fetch('/api/pro/selection-boards?'+new URLSearchParams({workId}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)return;const body=roomMetaListSchema.parse(await r.json());setMeta(new Map(body.areas.map(a=>[a.areaId,a])));}catch{/* the bar stays empty */}},[accountId,workId]);
 useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>clearTimeout(timer);},[reload,version]);
 return {meta,reload,set:(room:RoomMeta)=>setMeta(prev=>new Map(prev).set(room.areaId,room))};
}

export function RoomBudgetBar({accountId,areaId,en,room,onSaved,locked}:{accountId:string;areaId:string;en:boolean;room:RoomMeta|undefined;onSaved:(room:RoomMeta)=>void;locked?:boolean}){
 const t=(es:string,english:string)=>en?english:es,[editing,setEditing]=useState(false),[budget,setBudget]=useState(''),[assignee,setAssignee]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const approved=room?.approvedCents??0,use=budgetUse(room?.budgetCents??null,approved),money=(c:number)=>proMoney(c/100,en);
 async function save(){
  setError('');const trimmed=budget.trim();let cents:number|null=null;
  if(trimmed){const parsed=colonesToCents(trimmed);if(parsed===null||parsed===undefined||Number.isNaN(parsed)){setError(t('Escriba un monto válido.','Enter a valid amount.'));return;}cents=parsed as number;}
  setBusy(true);
  try{
   const r=await fetch('/api/pro/selection-boards',{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify({areaId,revision:room?.revision??0,budgetCents:cents,assignee:assignee.trim()||null})});
   if(r.status===409){setError(t('La habitación cambió. Actualice antes de guardar.','The room changed. Refresh before saving.'));return;}
   if(!r.ok){setError(t('No se pudo guardar. Revise los datos.','Could not save. Check the details.'));return;}
   onSaved(roomMetaSchema.parse((await r.json()).room));setEditing(false);
  }catch{setError(t('No se pudo guardar. Reintente.','Could not save. Retry.'));}finally{setBusy(false);}
 }
 return <div data-room-budget={areaId} className="min-w-0 space-y-2 rounded-xl bg-white p-3 text-sm">
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[#52627a]">{t('Presupuesto','Budget')}: <span data-room-budget-text className="font-semibold text-[#162543]">{room?.budgetCents?money(approved)+' / '+money(room.budgetCents):t('Sin definir','Not set')}</span></p>
   <span data-room-assignee className="text-[#52627a]">{t('Responsable','Assignee')}: <span className="font-semibold text-[#162543]">{room?.assignee||t('Sin asignar','Unassigned')}</span></span></div>
  {!!room?.budgetCents&&<div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={use.percent} aria-label={t('Presupuesto usado','Budget used')} className="h-2 w-full overflow-hidden rounded-full bg-[#e9eff5]"><div data-room-budget-bar style={{width:use.percent+'%'}} className={`h-full ${use.over?'bg-[#8a2a1b]':'bg-[#0089bb]'}`}/></div>}
  {use.over&&<p data-room-over className="text-xs font-semibold text-[#8a2a1b]">{t('Lo aprobado supera el presupuesto.','Approved items exceed the budget.')}</p>}
  {editing?<div className="space-y-2">
   <label className="block font-semibold">{t('Presupuesto de la habitación (₡)','Room budget (₡)')}<input data-room-budget-input inputMode="decimal" value={budget} onChange={e=>setBudget(e.target.value)} className={field}/></label>
   <label className="block font-semibold">{t('Responsable (opcional)','Assignee (optional)')}<input data-room-assignee-input maxLength={80} value={assignee} onChange={e=>setAssignee(e.target.value)} className={field}/></label>
   {error&&<p role="alert" className="text-xs font-semibold text-[#8a2a1b]">{error}</p>}
   <div className="flex flex-wrap gap-2"><Button type="button" size="sm" className="min-h-11" data-room-budget-save disabled={busy} onClick={()=>void save()}>{busy?t('Guardando…','Saving…'):t('Guardar','Save')}</Button><Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={()=>setEditing(false)}>{t('Cancelar','Cancel')}</Button></div>
  </div>:<Button type="button" size="sm" variant="secondary" className="min-h-11" data-room-budget-edit disabled={locked} onClick={()=>{setBudget(room?.budgetCents?centsToInput(room.budgetCents):'');setAssignee(room?.assignee??'');setError('');setEditing(true);}}>{t('Editar presupuesto y responsable','Edit budget and assignee')}</Button>}
 </div>;
}

export function BoardTemplatesPanel({accountId,workId,en,areas,items,onCreated,locked}:{accountId:string;workId:string;en:boolean;areas:SelectionArea[];items:SelectionItem[];onCreated:()=>void;locked?:boolean}){
 const t=(es:string,english:string)=>en?english:es,[open,setOpen]=useState(false),[templates,setTemplates]=useState<{id:string;name:string;items:string[]}[]>([]),[loaded,setLoaded]=useState(false);
 const [saveArea,setSaveArea]=useState(''),[saveName,setSaveName]=useState(''),[useId,setUseId]=useState(''),[roomName,setRoomName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/selection-board-templates',{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!r.ok)throw Error();setTemplates(boardTemplatesSchema.parse(await r.json()).templates);setLoaded(true);}catch{setError(t('No se pudieron cargar las plantillas.','Could not load the templates.'));}},[accountId]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!open||loaded)return;const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[open,loaded,load]);
 const post=(url:string,body:unknown)=>fetch(url,{method:'POST',cache:'no-store',headers:headers(accountId),body:JSON.stringify(body)});
 async function saveTemplate(){
  setError('');setNotice('');const area=areas.find(a=>a.id===saveArea),name=saveName.trim()||area?.name||'';
  if(!area||!name){setError(t('Elija una habitación y un nombre.','Choose a room and a name.'));return;}
  const names=items.filter(i=>i.areaId===area.id&&!i.archived).map(i=>i.name).slice(0,40);
  setBusy(true);try{const r=await post('/api/pro/selection-board-templates',{action:'save',name,items:names});if(r.status===409){setError(t('Llegó al límite de 30 plantillas.','You reached the limit of 30 templates.'));return;}if(!r.ok){setError(t('No se pudo guardar la plantilla.','Could not save the template.'));return;}setNotice(t('Plantilla guardada.','Template saved.'));setSaveName('');await load();}catch{setError(t('No se pudo guardar la plantilla.','Could not save the template.'));}finally{setBusy(false);}
 }
 async function removeTemplate(id:string){setBusy(true);setError('');try{const r=await post('/api/pro/selection-board-templates',{action:'delete',id});if(!r.ok){setError(t('No se pudo eliminar la plantilla.','Could not delete the template.'));return;}setNotice(t('Plantilla eliminada.','Template deleted.'));await load();}catch{setError(t('No se pudo eliminar la plantilla.','Could not delete the template.'));}finally{setBusy(false);}}
 async function createFrom(){
  setError('');setNotice('');const tpl=templates.find(x=>x.id===useId),name=roomName.trim()||tpl?.name||'';
  if(!tpl||!name){setError(t('Elija una plantilla y un nombre de habitación.','Choose a template and a room name.'));return;}
  setBusy(true);
  try{
   const areaId=crypto.randomUUID(),a=await post('/api/pro/selections',{action:'area_create',actionId:crypto.randomUUID(),workId,id:areaId,name:name.slice(0,80)});
   if(!a.ok){setError(t('No se pudo crear la habitación.','Could not create the room.'));return;}
   for(const itemName of tpl.items){const r=await post('/api/pro/selections',{action:'item_create',actionId:crypto.randomUUID(),workId,id:crypto.randomUUID(),areaId,name:itemName,dueDate:null,notes:null,allowanceId:null});if(!r.ok){setError(t('La habitación se creó pero no todos los ítems. Revise el tablero.','The room was created but not all items. Check the board.'));onCreated();return;}}
   setNotice(t('Habitación creada desde la plantilla.','Room created from the template.'));setRoomName('');onCreated();
  }catch{setError(t('No se pudo crear la habitación.','Could not create the room.'));}finally{setBusy(false);}
 }
 async function copyLink(){try{await navigator.clipboard.writeText(window.location.href);setNotice(t('Enlace copiado.','Link copied.'));}catch{setError(t('No se pudo copiar el enlace.','Could not copy the link.'));}}
 return <div data-board-templates className="space-y-2">
  <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-11" data-board-templates-toggle aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{t('Plantillas de tablero','Board templates')}</Button>
   <Button type="button" variant="outline" className="min-h-11" data-board-copy-link onClick={()=>void copyLink()}>{t('Copiar enlace del tablero','Copy board link')}</Button></div>
  {error&&<p role="alert" className="rounded-xl bg-[#fff4f2] p-3 text-sm text-[#8a2a1b]">{error}</p>}
  {notice&&<p role="status" data-board-template-notice className="rounded-xl bg-[#eef8f4] p-3 text-sm text-[#18573a]">{notice}</p>}
  {open&&<div className="grid gap-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 md:grid-cols-2">
   <div className="min-w-0 space-y-2"><p className="text-sm font-bold">{t('Guardar una habitación como plantilla','Save a room as a template')}</p>
    <label className="block text-sm font-semibold">{t('Habitación','Room')}<select data-template-area value={saveArea} onChange={e=>setSaveArea(e.target.value)} className={field}><option value="">{t('Elegir…','Choose…')}</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t('Nombre de la plantilla (opcional)','Template name (optional)')}<input data-template-name maxLength={80} value={saveName} onChange={e=>setSaveName(e.target.value)} className={field}/></label>
    <Button type="button" className="min-h-11" data-template-save disabled={busy||locked||!saveArea} onClick={()=>void saveTemplate()}>{t('Guardar plantilla','Save template')}</Button></div>
   <div className="min-w-0 space-y-2"><p className="text-sm font-bold">{t('Crear una habitación desde una plantilla','Create a room from a template')}</p>
    {loaded&&!templates.length?<p data-template-empty className="text-sm text-[#52627a]">{t('Todavía no hay plantillas.','There are no templates yet.')}</p>:<>
    <label className="block text-sm font-semibold">{t('Plantilla','Template')}<select data-template-use value={useId} onChange={e=>setUseId(e.target.value)} className={field}><option value="">{t('Elegir…','Choose…')}</option>{templates.map(x=><option key={x.id} value={x.id}>{x.name} ({x.items.length})</option>)}</select></label>
    <label className="block text-sm font-semibold">{t('Nombre de la habitación','Room name')}<input data-template-room-name maxLength={80} value={roomName} onChange={e=>setRoomName(e.target.value)} className={field}/></label>
    <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" data-template-create disabled={busy||locked||!useId} onClick={()=>void createFrom()}>{t('Crear habitación','Create room')}</Button>
     {useId&&<Button type="button" variant="ghost" className="min-h-11" data-template-delete disabled={busy} onClick={()=>{const id=useId;setUseId('');void removeTemplate(id);}}>{t('Eliminar plantilla','Delete template')}</Button>}</div></>}
   </div></div>}
 </div>;
}
