'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {moodElementInput,MOOD_NAME_MAX,type MoodDraftElement,type MoodPageFormat} from '@/lib/pro/mood-boards';
import {elementsFromTemplate,moodTemplateListSchema,moodTemplateResultSchema,templateFromPage,type SavedMoodTemplate} from '@/lib/pro/mood-board-templates';

/**
 * Row 61: the owner's own page templates. «Guardar página como plantilla» keeps the layout of the current page (colors, notes,
 * text, arrows, drawings; photos and items stay out because they belong to one job); «Aplicar» puts that layout on the page
 * being edited (undoable like any edit). Own templates are private to the owner (migration 423).
 */
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const api='/api/pro/mood-board-templates';
export function MoodTemplatesPanel({accountId,page,pageFormat,disabled,onApply,onClose}:{accountId:string;page:{background:string;elements:MoodDraftElement[]};pageFormat:MoodPageFormat;disabled:boolean;onApply:(background:string,elements:MoodDraftElement[])=>void;onClose:()=>void}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,{confirm,dialogNode}=useAppDialog();
 const [items,setItems]=useState<SavedMoodTemplate[]|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[name,setName]=useState(''),[renaming,setRenaming]=useState<{id:string;name:string}|null>(null);
 const alive=useRef(true),attempt=useRef<{key:string;actionId:string}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const load=useCallback(async()=>{
  setError('');
  try{const response=await fetch(api,{cache:'no-store',headers:{'X-Pro-Expected-Actor':accountId}});if(!response.ok)throw Error();const body=moodTemplateListSchema.parse(await response.json());if(alive.current)setItems(body.items);}
  catch{if(alive.current)setError(t('No se pudieron cargar sus plantillas.','Could not load your templates.'));}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[accountId,en]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 async function send(payload:Record<string,unknown>,done:string):Promise<boolean>{
  const key=JSON.stringify(payload);if(attempt.current?.key!==key)attempt.current={key,actionId:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Pro-Expected-Actor':accountId},body:JSON.stringify({...payload,actionId:attempt.current.actionId})});
   const json=await response.json().catch(()=>({}));
   if(!response.ok){if(alive.current)setError(response.status===409?t('Ya existe una plantilla con ese nombre o cambió en otra pestaña. Actualice la lista.','A template with that name already exists or it changed in another tab. Reload the list.'):response.status===429?t('Llegó al máximo de 50 plantillas. Archive alguna.','You reached the limit of 50 templates. Archive one.'):t('No se pudo guardar la plantilla. Revise el nombre e intente de nuevo.','Could not save the template. Check the name and try again.'));return false;}
   moodTemplateResultSchema.parse(json);attempt.current=null;if(alive.current){setNotice(done);await load();}return true;
  }catch{if(alive.current)setError(t('No se pudo guardar. Reintente: no se duplicará.','Could not save. Retry: it will not duplicate.'));return false;}
  finally{if(alive.current)setBusy(false);}
 }
 const kept=templateFromPage(page,moodElementInput);
 async function save(event:FormEvent){
  event.preventDefault();const value=name.trim();if(!value){setError(t('Escriba un nombre para la plantilla.','Enter a name for the template.'));return;}
  if(!kept.elements.length){setError(t('La página no tiene colores, notas, textos ni trazos que guardar.','The page has no colors, notes, text or strokes to save.'));return;}
  if(await send({action:'create',id:crypto.randomUUID(),name:value.slice(0,MOOD_NAME_MAX),pageFormat,background:kept.background,elements:kept.elements},kept.dropped?t(`Plantilla guardada. ${kept.dropped} foto(s) o artículo(s) no se incluyen: pertenecen a este trabajo.`,`Template saved. ${kept.dropped} photo(s) or item(s) are not included: they belong to this job.`):t('Plantilla guardada.','Template saved.')))setName('');
 }
 async function apply(template:SavedMoodTemplate){
  if(page.elements.length){const answer=await confirm({title:t('¿Aplicar la plantilla?','Apply the template?'),description:template.name,detail:t('Reemplaza el contenido de esta página. Puede deshacerlo antes de guardar.','It replaces the content of this page. You can undo it before saving.'),confirmLabel:t('Aplicar','Apply'),cancelLabel:t('Cancelar','Cancel')});if(!answer.confirmed)return;}
  onApply(template.background,elementsFromTemplate(template));onClose();
 }
 async function archive(template:SavedMoodTemplate){
  const answer=await confirm({title:t('¿Archivar la plantilla?','Archive the template?'),description:template.name,confirmLabel:t('Archivar','Archive'),cancelLabel:t('Cancelar','Cancel'),tone:'danger'});if(!answer.confirmed)return;
  await send({action:'archive',id:template.id,revision:template.revision},t('Plantilla archivada.','Template archived.'));
 }
 return <section data-mood-templates className="min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4">
  {dialogNode}
  <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{t('Mis plantillas de página','My page templates')}</h4><Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={onClose}>{t('Cerrar','Close')}</Button></div>
  <p className="text-xs text-[#52627a]">{t('Guarde la distribución de esta página (colores, notas, textos, flechas y trazos) para usarla en otros tableros. Las fotos y los artículos no se guardan porque son de este trabajo.','Save the layout of this page (colors, notes, text, arrows and strokes) to reuse it on other boards. Photos and items are not saved because they belong to this job.')}</p>
  <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={e=>void save(e)}>
   <label className="block min-w-0 flex-1 text-sm font-medium">{t('Nombre de la plantilla','Template name')}<input data-mood-template-name className={field} maxLength={MOOD_NAME_MAX} value={name} disabled={disabled||busy} onChange={e=>setName(e.target.value)}/></label>
   <Button type="submit" className="min-h-11" data-mood-template-save disabled={disabled||busy}>{t('Guardar esta página como plantilla','Save this page as a template')}</Button>
  </form>
  {error&&<p role="alert" data-mood-template-error className="text-sm text-[#8a2a1b]">{error} {items===null&&<button type="button" className="min-h-11 font-semibold underline" onClick={()=>void load()}>{t('Reintentar','Retry')}</button>}</p>}
  {notice&&<p role="status" data-mood-template-notice className="text-sm text-[#18573a]">{notice}</p>}
  {items&&!items.length&&<p className="text-sm text-[#52627a]">{t('Todavía no tiene plantillas propias.','You have no templates of your own yet.')}</p>}
  {items&&items.length>0&&<ul className="space-y-2">{items.map(template=><li key={template.id} data-mood-template={template.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[#e3eaf0] p-2">
   {renaming?.id===template.id?<form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();const draft=renaming,value=draft.name.trim();if(value)void send({action:'rename',id:template.id,revision:template.revision,name:value},t('Plantilla renombrada.','Template renamed.')).then(ok=>{if(ok)setRenaming(null);});}}>
     <input aria-label={t('Nuevo nombre','New name')} className={field} maxLength={MOOD_NAME_MAX} value={renaming.name} onChange={e=>setRenaming({id:template.id,name:e.target.value})}/>
     <Button type="submit" size="sm" className="min-h-11" disabled={busy}>{t('Guardar nombre','Save name')}</Button><Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={()=>setRenaming(null)}>{t('Cancelar','Cancel')}</Button></form>
    :<><span className="min-w-0 flex-1 break-words text-sm font-semibold">{template.name}<span className="ml-2 text-xs font-normal text-[#52627a]">{t(`${template.elements.length} elementos`,`${template.elements.length} elements`)}</span></span>
     <Button type="button" size="sm" className="min-h-11" data-mood-template-apply disabled={disabled||busy} onClick={()=>void apply(template)}>{t('Aplicar a esta página','Apply to this page')}</Button>
     <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={busy} onClick={()=>setRenaming({id:template.id,name:template.name})}>{t('Renombrar','Rename')}</Button>
     <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={()=>void archive(template)}>{t('Archivar','Archive')}</Button></>}
  </li>)}</ul>}
 </section>;
}
