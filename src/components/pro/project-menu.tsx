'use client';
import {useCallback,useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {projectColors} from '@/lib/pro/project-details';
import {templatesExtrasSchema} from '@/lib/pro/project-extras';
import {ExtrasConflict,readExtras,saveExtras} from './use-project-extras';

/**
 * Area C (Houzz project menu): pin, custom status with "Manage status", save the open tasks as a project
 * template and apply a template to this project (creates its tasks). Pin and status are stored by the projects hub.
 */
const stateSchema=z.object({pinned:z.boolean(),statusId:z.string().uuid().nullable(),statuses:z.array(z.object({id:z.string().uuid(),name:z.string(),color:z.string()})).max(20)});
type State=z.infer<typeof stateSchema>;
type Template=z.infer<typeof templatesExtrasSchema>['items'][number];
const box='block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal';
const COLORS:Record<string,string>={blue:'#2f6fd0',teal:'#0e9aa7',green:'#1d8a52',olive:'#7a8a1d',amber:'#d49b00',orange:'#e0701a',red:'#b42318',magenta:'#b4287a',purple:'#6d3fc0',gray:'#68778d'};
const COLOR_ES:Record<string,string>={blue:'Azul',teal:'Turquesa',green:'Verde',olive:'Oliva',amber:'Ámbar',orange:'Naranja',red:'Rojo',magenta:'Magenta',purple:'Morado',gray:'Gris'};
async function hub(body:Record<string,unknown>){const r=await fetch('/api/pro/projects-hub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('hub');}
export function ProjectMenu({workId,disabled}:{workId:string;disabled?:boolean}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [state,setState]=useState<State|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [panel,setPanel]=useState<''|'status'|'template'|'apply'>(''),[statusName,setStatusName]=useState(''),[statusColor,setStatusColor]=useState('blue'),[templateName,setTemplateName]=useState('');
 const [templates,setTemplates]=useState<{revision:number;items:Template[]}|null>(null),[pick,setPick]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/pro/project-menu?'+new URLSearchParams({workId}),{cache:'no-store'});if(!r.ok)throw Error();setState(stateSchema.parse(await r.json()));setFailed(false);}catch{setFailed(true);}},[workId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const loadTemplates=useCallback(async()=>{try{const r=await readExtras({scope:'owner',kind:'templates'}),row=r.items[''],parsed=templatesExtrasSchema.safeParse(row?.data??{items:[]});setTemplates({revision:row?.revision??0,items:parsed.success?parsed.data.items:[]});}catch{setError(t('No se pudieron cargar las plantillas.','Could not load the templates.'));}},[]);// eslint-disable-line react-hooks/exhaustive-deps
 async function act(fn:()=>Promise<string|void>){setBusy(true);setError('');setNotice('');try{const message=await fn();if(message)setNotice(message);}catch(failure){setError(failure instanceof ExtrasConflict?t('Los datos cambiaron. Intente de nuevo.','The data changed. Try again.'):t('No se pudo guardar. Reintente.','Could not save. Try again.'));}finally{setBusy(false);}}
 const pin=()=>act(async()=>{if(!state)return;await hub({action:'pin',workId,pinned:!state.pinned});await load();return state.pinned?t('Proyecto desfijado.','Project unpinned.'):t('Proyecto fijado arriba de la lista.','Project pinned to the top of the list.');});
 const setStatus=(id:string)=>act(async()=>{await hub({action:'status_set',workId,statusId:id||null});await load();return t('Estado actualizado.','Status updated.');});
 const createStatus=()=>act(async()=>{const name=statusName.trim();if(!name){setError(t('Escriba el nombre del estado.','Enter the status name.'));return;}await hub({action:'status_create',id:crypto.randomUUID(),name,color:statusColor});setStatusName('');await load();return t('Estado creado.','Status created.');});
 const deleteStatus=(id:string)=>act(async()=>{await hub({action:'status_delete',id});await load();return t('Estado eliminado.','Status deleted.');});
 const saveTemplate=()=>act(async()=>{
  const name=templateName.trim();if(!name){setError(t('Escriba el nombre de la plantilla.','Enter the template name.'));return;}
  const r=await fetch('/api/pro/work-tasks?'+new URLSearchParams({workId,status:'open'}),{cache:'no-store'});if(!r.ok)throw Error();
  const tasks=z.object({items:z.array(z.object({title:z.string()})).max(20)}).parse(await r.json()).items.map(x=>x.title).slice(0,20);
  const base=templates??{revision:0,items:[]};if(base.items.length>=20){setError(t('Hay un máximo de 20 plantillas.','There is a maximum of 20 templates.'));return;}
  const item:Template={id:crypto.randomUUID(),name:name.slice(0,80),type:'',tags:[],tasks,savedAt:new Date().toISOString().slice(0,10)};
  const row=await saveExtras({scope:'owner',kind:'templates',key:'',revision:base.revision,data:{items:[...base.items,item]}});
  const parsed=templatesExtrasSchema.safeParse(row.data);setTemplates({revision:row.revision,items:parsed.success?parsed.data.items:[]});setTemplateName('');setPanel('');
  return t(`Plantilla guardada con ${tasks.length} tareas.`,`Template saved with ${tasks.length} tasks.`);
 });
 const applyTemplate=()=>act(async()=>{
  const tpl=templates?.items.find(x=>x.id===pick);if(!tpl)return;let created=0;
  for(const title of tpl.tasks){
   const r=await fetch('/api/pro/work-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',workId,taskId:crypto.randomUUID(),actionId:crypto.randomUUID(),revision:0,title,details:'',dueDate:null,assignee:''})});
   if(!r.ok)throw Error();created++;
  }
  setPanel('');window.dispatchEvent(new Event('focus'));return t(`Se crearon ${created} tareas desde la plantilla.`,`${created} tasks were created from the template.`);
 });
 const deleteTemplate=(id:string)=>act(async()=>{const base=templates;if(!base)return;const row=await saveExtras({scope:'owner',kind:'templates',key:'',revision:base.revision,data:{items:base.items.filter(x=>x.id!==id)}});const parsed=templatesExtrasSchema.safeParse(row.data);setTemplates({revision:row.revision,items:parsed.success?parsed.data.items:[]});setPick('');return t('Plantilla eliminada.','Template deleted.');});
 if(failed)return null;
 if(!state)return <p role="status" className="text-sm text-[#68778d]">{t('Cargando menú…','Loading menu…')}</p>;
 const open=(next:typeof panel)=>{setPanel(panel===next?'':next);setError('');setNotice('');if(next==='template'||next==='apply')void loadTemplates();};
 const off=disabled||busy;
 return <div data-project-menu className="space-y-2">
  <label className="block text-sm font-semibold">{t('Estado personalizado','Custom status')}
   <select data-project-status value={state.statusId??''} disabled={off} onChange={e=>void setStatus(e.target.value)} className={box+' mt-1'}><option value="">{t('Sin estado personalizado','No custom status')}</option>{state.statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  <div className="flex flex-wrap gap-2">
   <Button type="button" variant="outline" className="min-h-11" data-project-pin aria-pressed={state.pinned} disabled={off} onClick={()=>void pin()}>{state.pinned?t('Desfijar proyecto','Unpin project'):t('Fijar proyecto','Pin project')}</Button>
   <Button type="button" variant="outline" className="min-h-11" data-project-status-manage disabled={off} onClick={()=>open('status')}>{t('Administrar estados','Manage status')}</Button>
   <Button type="button" variant="outline" className="min-h-11" data-project-template-save disabled={off} onClick={()=>open('template')}>{t('Guardar como plantilla','Save as template')}</Button>
   <Button type="button" variant="outline" className="min-h-11" data-project-template-apply disabled={off} onClick={()=>open('apply')}>{t('Usar plantilla','Use template')}</Button>
  </div>
  {panel==='status'&&<div data-project-status-panel className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
   <ul className="space-y-1 text-sm">{state.statuses.map(s=><li key={s.id} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{background:COLORS[s.color]??'#68778d'}}/><span className="min-w-0 break-words">{s.name}</span></span><Button type="button" variant="ghost" className="min-h-11" disabled={off} onClick={()=>void deleteStatus(s.id)}>{t('Eliminar','Delete')}</Button></li>)}{!state.statuses.length&&<li className="text-[#68778d]">{t('Aún no hay estados personalizados.','No custom statuses yet.')}</li>}</ul>
   <label className="block text-sm font-semibold">{t('Nombre del estado','Status name')}<input data-project-status-name maxLength={40} value={statusName} onChange={e=>setStatusName(e.target.value)} className={box+' mt-1'}/></label>
   <label className="block text-sm font-semibold">{t('Color','Color')}<select value={statusColor} onChange={e=>setStatusColor(e.target.value)} className={box+' mt-1'}>{projectColors.map(c=><option key={c} value={c}>{en?c[0].toUpperCase()+c.slice(1):COLOR_ES[c]}</option>)}</select></label>
   <Button type="button" data-project-status-create disabled={off} onClick={()=>void createStatus()}>{t('Crear estado','Create status')}</Button></div>}
  {panel==='template'&&<div data-project-template-panel className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
   <p className="text-sm text-[#52627a]">{t('Se guardan los títulos de las tareas abiertas de este proyecto (hasta 20) para reutilizarlos.','The titles of this project\'s open tasks (up to 20) are saved for reuse.')}</p>
   <label className="block text-sm font-semibold">{t('Nombre de la plantilla','Template name')}<input data-project-template-name maxLength={80} value={templateName} onChange={e=>setTemplateName(e.target.value)} className={box+' mt-1'}/></label>
   <Button type="button" data-project-template-confirm disabled={off||!templates} onClick={()=>void saveTemplate()}>{t('Guardar plantilla','Save template')}</Button></div>}
  {panel==='apply'&&<div data-project-apply-panel className="space-y-2 rounded-xl border border-[#d7e1ea] p-3">
   {!templates?<p role="status" className="text-sm">{t('Cargando plantillas…','Loading templates…')}</p>:!templates.items.length?<p className="text-sm text-[#68778d]">{t('Aún no hay plantillas de proyecto.','No project templates yet.')}</p>:<>
    <label className="block text-sm font-semibold">{t('Plantilla','Template')}<select data-project-template-pick value={pick} onChange={e=>setPick(e.target.value)} className={box+' mt-1'}><option value="">{t('Elija una plantilla','Choose a template')}</option>{templates.items.map(x=><option key={x.id} value={x.id}>{x.name} ({x.tasks.length})</option>)}</select></label>
    <div className="flex flex-wrap gap-2"><Button type="button" data-project-template-use disabled={off||!pick} onClick={()=>void applyTemplate()}>{t('Crear tareas de la plantilla','Create template tasks')}</Button><Button type="button" variant="outline" disabled={off||!pick} onClick={()=>void deleteTemplate(pick)}>{t('Eliminar plantilla','Delete template')}</Button></div></>}</div>}
  {notice&&<p role="status" className="text-sm text-[#0b6b3a]">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </div>;
}
