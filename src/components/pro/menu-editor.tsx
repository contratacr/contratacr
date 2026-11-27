'use client';
import {useState,type FormEvent,type ReactNode} from 'react';
import {formatMenuMoney,menuPriceBreakdown,menuServiceBps,parseMenuMoney} from '@/lib/directory/menu-price';
import {MENU_AVAILABILITY,MENU_AVAILABILITY_LABELS,MENU_DIETARY_LABELS,MENU_DIETARY_TAGS,menuErrorText,menuItemFieldsSchema,
 type EditorMenu,type EditorMenuItem,type EditorMenuSection,type MenuAvailability,type MenuDietaryTag,type MenuImportDraft,type MenuMutation} from '@/lib/directory/menu-schemas';
import {MENU_IMPORT_LABEL,MENU_IMPORT_MAX_BYTES,extractionToReview,menuImportImageTypes,reviewToApply,type MenuReviewSection} from '@/lib/directory/menu-import';
import {idiomaDe} from '@/lib/prefijo-de-idioma';

/**
 * LOCAL PRO ONLY (multivertical P2). Menu editor of a claimed restaurant (Pro «Menú» module). Not imported yet.
 * Talks to /api/pro/menu: GET ?placeId= → EditorMenu; POST JSON mutation/import review;
 * POST multipart (photo) → menu-from-photo draft (mock adapter). Every write carries a fresh actionId and the entity
 * revision; a 409 asks the person to reload. Imported dishes always arrive as DRAFTS: nothing is published until
 * the person presses «Publicar». ES/EN inline, «usted».
 */
type Lang='es'|'en';
type Fail={reason?:string;error?:string};
type MutationBody=MenuMutation extends infer M?M extends unknown?Omit<M,'actionId'|'placeId'>:never:never;
type ItemForm={id:string|null;sectionId:string;revision:number;nameEs:string;nameEn:string;descriptionEs:string;descriptionEn:string;price:string;
 dietary:MenuDietaryTag[];availability:MenuAvailability;availableFrom:string;availableUntil:string;photoUrl:string;photoAltEs:string;status:'draft'|'published'};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const btn=`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold ${ring} disabled:opacity-50`;
const primary=`${btn} bg-[#162543] text-white`,secondary=`${btn} border border-[#d7e1ea] bg-white text-[#162543]`;
const input=`min-h-11 w-full rounded-xl border border-[#c7d3df] bg-white px-3 text-base ${ring}`;
const newId=()=>crypto.randomUUID();
const majorText=(minor:number)=>minor%100===0?String(minor/100):(minor/100).toFixed(2);

// Gaps round (2026-11-17): canPublish=false for a company member whose role lacks price.write (role «member»): they edit
// the menu and save drafts; publishing dishes, the price of a published dish and the price settings stay with an
// administrator/manager (the SQL refuses them too: menu_price_role).
// photoImport=false (2026-11-18, «Mi negocio» without Pro): hides the menu-from-photo card (an assistant feature of Pro).
export function MenuEditor({initial,locale,endpoint='/api/pro/menu',expectedActor,canPublish=true,photoImport=true}:{initial:EditorMenu;locale:string;endpoint?:string;expectedActor?:string;canPublish?:boolean;photoImport?:boolean}){
 const lang:Lang=idiomaDe(locale),en=lang==='en',t=(es:string,english:string)=>en?english:es;
 const [menu,setMenu]=useState(initial);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<{kind:'error'|'ok';text:string}|null>(null);
 const [form,setForm]=useState<ItemForm|null>(null);
 const [review,setReview]=useState<{draft:MenuImportDraft;sections:MenuReviewSection[]}|null>(null);
 const money=(minor:number)=>formatMenuMoney(minor,menu.currency,lang);
 const s=menu.settings,svc=menuServiceBps(s);
 const final=(minor:number)=>menuPriceBreakdown(minor,{pricesIncludeIva:s.pricesIncludeIva,pricesIncludeService:s.pricesIncludeService,ivaRateBps:s.ivaRateBps,serviceRateBps:svc});
 const headers=(json:boolean):Record<string,string>=>({...(json?{'content-type':'application/json'}:{}),...(expectedActor?{'x-pro-expected-actor':expectedActor}:{})});

 async function reload(){
  const res=await fetch(`${endpoint}?placeId=${encodeURIComponent(menu.placeId)}`,{headers:headers(false),cache:'no-store'});
  if(res.ok)setMenu(await res.json() as EditorMenu);
 }
 async function send(body:unknown,okText:string):Promise<boolean>{
  setBusy(true);setMessage(null);
  try{
   const res=await fetch(endpoint,{method:'POST',headers:headers(true),body:JSON.stringify(body)});
   if(!res.ok){const f=await res.json().catch(()=>({})) as Fail;setMessage({kind:'error',text:menuErrorText(f.reason,lang)});if(res.status===409)await reload();return false;}
   await reload();setMessage({kind:'ok',text:okText});return true;
  }catch{setMessage({kind:'error',text:menuErrorText('unavailable',lang)});return false;}
  finally{setBusy(false);}
 }
 const mutate=(m:MutationBody,okText:string)=>send({...m,actionId:newId(),placeId:menu.placeId},okText);

 // ---------------------------------------------------------------- settings
 const [draftSettings,setDraftSettings]=useState({pricesIncludeIva:s.pricesIncludeIva,pricesIncludeService:s.pricesIncludeService,serviceCharge:s.serviceCharge});
 const example=menuPriceBreakdown(500000,{pricesIncludeIva:draftSettings.pricesIncludeIva,pricesIncludeService:draftSettings.serviceCharge&&draftSettings.pricesIncludeService,ivaRateBps:s.ivaRateBps,serviceRateBps:draftSettings.serviceCharge?1000:0});

 // ---------------------------------------------------------------- items
 const emptyForm=(sectionId:string):ItemForm=>({id:null,sectionId,revision:0,nameEs:'',nameEn:'',descriptionEs:'',descriptionEn:'',price:'',dietary:[],availability:'available',availableFrom:'',availableUntil:'',photoUrl:'',photoAltEs:'',status:'draft'});
 const editForm=(sectionId:string,i:EditorMenuItem):ItemForm=>({id:i.id,sectionId,revision:i.revision,nameEs:i.nameEs,nameEn:i.nameEn??'',descriptionEs:i.descriptionEs??'',descriptionEn:i.descriptionEn??'',
  price:majorText(i.priceMinor),dietary:i.dietary,availability:i.availability,availableFrom:i.availableFrom??'',availableUntil:i.availableUntil??'',photoUrl:i.photoUrl??'',photoAltEs:i.photoAltEs??'',status:i.status});
 const formPrice=form?parseMenuMoney(form.price):null,lockedPrice=!!form?.id&&form.status==='published';
 async function saveItem(e:FormEvent){
  e.preventDefault();if(!form)return;
  const priceMinor=parseMenuMoney(form.price);
  if(priceMinor==null){setMessage({kind:'error',text:t('Escriba un precio válido, por ejemplo 4500.','Enter a valid price, for example 4500.')});return;}
  const item={nameEs:form.nameEs,nameEn:form.nameEn||null,descriptionEs:form.descriptionEs||null,descriptionEn:form.descriptionEn||null,priceMinor,dietary:form.dietary,
   availability:form.availability,availableFrom:form.availableFrom||null,availableUntil:form.availableUntil||null,photoUrl:form.photoUrl||null,photoAltEs:form.photoUrl?form.photoAltEs||null:null,status:form.status};
  const parsed=menuItemFieldsSchema.safeParse(item);
  if(!parsed.success){setMessage({kind:'error',text:parsed.error.issues[0]?.message??menuErrorText('invalid',lang)});return;}
  const ok=form.id?await mutate({action:'item_update',itemId:form.id,revision:form.revision,sectionId:form.sectionId,item:parsed.data},t('Plato guardado.','Dish saved.'))
   :await mutate({action:'item_create',itemId:newId(),sectionId:form.sectionId,item:parsed.data},t('Plato agregado.','Dish added.'));
  if(ok)setForm(null);
 }
 const move=<T,>(list:T[],from:number,to:number)=>{const copy=[...list];const [x]=copy.splice(from,1);copy.splice(to,0,x!);return copy;};
 const drafts=menu.sections.flatMap(sec=>sec.items.filter(i=>i.status==='draft').map(i=>i.id));

 // ---------------------------------------------------------------- import from photo
 async function importPhoto(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const file=(e.currentTarget.elements.namedItem('photo') as HTMLInputElement|null)?.files?.[0];
  if(!file||!(menuImportImageTypes as readonly string[]).includes(file.type)||file.size>MENU_IMPORT_MAX_BYTES){setMessage({kind:'error',text:menuErrorText('unsupported_file',lang)});return;}
  const body=new FormData();body.set('placeId',menu.placeId);body.set('actionId',newId());body.set('language',lang);body.set('photo',file);
  setBusy(true);setMessage(null);
  try{
   const res=await fetch(endpoint,{method:'POST',headers:headers(false),body});
   if(!res.ok){const f=await res.json().catch(()=>({})) as Fail;setMessage({kind:'error',text:menuErrorText(f.reason,lang)});return;}
   const draft=await res.json() as MenuImportDraft;await reload();
   if(draft.status==='ready'&&draft.extraction)setReview({draft,sections:extractionToReview(draft.extraction,newId)});
   else setMessage({kind:'error',text:menuErrorText('import_failed',lang)});
  }catch{setMessage({kind:'error',text:menuErrorText('unavailable',lang)});}
  finally{setBusy(false);}
 }
 async function applyReview(){
  if(!review)return;
  const body=reviewToApply({actionId:newId(),placeId:menu.placeId,draftId:review.draft.id,sections:review.sections});
  if('error' in body){setMessage({kind:'error',text:body.error==='needs_price'?t('Indique el precio de los platos marcados o desmárquelos.','Enter the price of the flagged dishes or untick them.'):t('Seleccione al menos un plato.','Select at least one dish.')});return;}
  if(await send(body,t('Platos agregados como borrador. Revíselos y publíquelos cuando estén listos.','Dishes added as drafts. Review and publish them when ready.')))setReview(null);
 }
 const discard=async(draftId:string)=>{if(await send({actionId:newId(),placeId:menu.placeId,draftId,decision:'discard'},t('Importación descartada.','Import discarded.')))setReview(null);};
 const updateRow=(si:number,ri:number,patch:Partial<MenuReviewSection['rows'][number]>|((r:MenuReviewSection['rows'][number])=>MenuReviewSection['rows'][number]))=>setReview(r=>r&&{...r,
  sections:r.sections.map((sec,i)=>i!==si?sec:{...sec,rows:sec.rows.map((row,j)=>j!==ri?row:typeof patch==='function'?patch(row):{...row,...patch})})});

 const status=<p role="status" aria-live="polite" className={`min-h-6 text-sm ${message?.kind==='error'?'text-red-800':'text-emerald-800'}`}>{message?.text}</p>;

 if(review)return <section aria-labelledby="menu-review-title" data-menu-review className="mx-auto max-w-3xl space-y-4 px-4 py-6 text-[#162543]">
  <h1 id="menu-review-title" className="text-2xl font-extrabold">{t('Revisar menú leído de la foto','Review menu read from the photo')}</h1>
  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900" data-ai-label>{MENU_IMPORT_LABEL[lang]}</p>
  {review.draft.extraction?.warnings.map((w,i)=><p key={i} className="text-sm text-amber-900">⚠ {w}</p>)}
  {review.draft.extraction&&(review.draft.extraction.pricesIncludeIva!=null||review.draft.extraction.pricesIncludeService!=null)&&<p className="text-sm text-slate-700">
   {t('La foto sugiere que los precios','The photo suggests prices')} {review.draft.extraction.pricesIncludeIva?t('incluyen IVA','include IVA'):t('no indican IVA','do not state IVA')}. {t('Confirme la configuración de precios antes de publicar.','Confirm the price settings before publishing.')}</p>}
  {review.sections.map((sec,si)=><fieldset key={sec.key} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
   <legend className="px-1 font-bold">{t('Sección','Section')}</legend>
   <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={sec.include} className="size-5" onChange={e=>setReview(r=>r&&{...r,sections:r.sections.map((x,i)=>i===si?{...x,include:e.target.checked}:x)})}/>{t('Incluir sección','Include section')}</label>
   <input className={input} aria-label={t('Nombre de la sección','Section name')} value={sec.nameEs} maxLength={80} onChange={e=>setReview(r=>r&&{...r,sections:r.sections.map((x,i)=>i===si?{...x,nameEs:e.target.value}:x)})}/>
   <ul className="space-y-3">{sec.rows.map((row,ri)=><li key={row.key} data-menu-review-row className={`space-y-2 rounded-xl border p-3 ${row.needsPrice||row.confidence==='low'?'border-amber-400 bg-amber-50/50':'border-[#e6edf3]'}`}>
    <div className="flex items-center justify-between gap-2">
     <label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" className="size-5" checked={row.include} onChange={e=>updateRow(si,ri,{include:e.target.checked})}/>{t('Incluir','Include')}</label>
     <span className="text-xs">{t('Confianza','Confidence')}: {row.confidence==='high'?t('alta','high'):row.confidence==='medium'?t('media','medium'):t('baja','low')}</span>
    </div>
    <label className="block text-sm font-medium">{t('Nombre','Name')}<input className={input} value={row.item.nameEs} maxLength={120} onChange={e=>updateRow(si,ri,r=>({...r,item:{...r.item,nameEs:e.target.value}}))}/></label>
    <label className="block text-sm font-medium">{t('Precio (como aparece en la carta)','Price (as printed on the menu)')}
     <input className={input} inputMode="decimal" defaultValue={row.needsPrice?'':majorText(row.item.priceMinor)} aria-invalid={row.needsPrice||undefined}
      onChange={e=>{const v=parseMenuMoney(e.target.value);updateRow(si,ri,r=>({...r,needsPrice:v==null,item:{...r.item,priceMinor:v??0}}));}}/></label>
    {row.needsPrice&&<p className="text-sm font-semibold text-amber-900">{t('No se pudo leer el precio. Escríbalo.','The price could not be read. Please type it.')}</p>}
    <TagPicker lang={lang} value={(row.item.dietary??[]) as MenuDietaryTag[]} onChange={dietary=>updateRow(si,ri,r=>({...r,item:{...r.item,dietary}}))}/>
   </li>)}</ul>
  </fieldset>)}
  {status}
  <div className="flex flex-wrap gap-2">
   <button type="button" className={primary} disabled={busy} onClick={applyReview}>{t('Agregar como borradores','Add as drafts')}</button>
   <button type="button" className={secondary} disabled={busy} onClick={()=>discard(review.draft.id)}>{t('Descartar importación','Discard import')}</button>
   <button type="button" className={secondary} disabled={busy} onClick={()=>setReview(null)}>{t('Volver al menú','Back to menu')}</button>
  </div>
 </section>;

 return <section aria-labelledby="menu-editor-title" data-menu-editor={menu.placeId} className="mx-auto max-w-3xl space-y-6 px-4 py-6 text-[#162543]">
  <header className="space-y-1">
   <h1 id="menu-editor-title" className="text-2xl font-extrabold">{t('Menú','Menu')} · {menu.name}</h1>
   <p className="text-sm text-slate-700">{t('Los cambios publicados se ven en su ficha pública. Los borradores solo los ve usted.','Published changes appear on your public listing. Only you see drafts.')}
    {menu.placeStatus==='published'&&<> <a className={`underline underline-offset-2 ${ring}`} href={(en?'/en':'')+`/negocios/${menu.slug}/menu`} target="_blank" rel="noopener">{t('Ver menú público','View public menu')}</a></>}</p>
  </header>
  {status}
  {!canPublish&&<p data-menu-price-role role="note" className="rounded-xl bg-[#fff8eb] px-3 py-2 text-sm text-[#5c3b00]">{t('Puede editar el menú y guardar platos como borrador. Publicar platos y cambiar precios publicados lo hace un administrador o encargado de la empresa.','You can edit the menu and save dishes as drafts. Publishing dishes and changing published prices is done by a company administrator or manager.')}</p>}

  <Card title={t('Cómo se muestran los precios','How prices are shown')}>
   <form className="space-y-3" inert={!canPublish} aria-disabled={!canPublish||undefined} onSubmit={e=>{e.preventDefault();void mutate({action:'settings',revision:s.revision,...draftSettings,pricesIncludeService:draftSettings.serviceCharge&&draftSettings.pricesIncludeService},t('Configuración guardada.','Settings saved.'));}}>
    <Check checked={draftSettings.serviceCharge} onChange={v=>setDraftSettings(d=>({...d,serviceCharge:v}))}>{t('Cobro el 10 % de servicio (servicio a la mesa)','I charge the 10 % service (table service)')}</Check>
    <Check checked={draftSettings.pricesIncludeIva} onChange={v=>setDraftSettings(d=>({...d,pricesIncludeIva:v}))}>{t('Los precios que escribo ya incluyen el IVA (13 %)','The prices I type already include IVA (13 %)')}</Check>
    {draftSettings.serviceCharge&&<Check checked={draftSettings.pricesIncludeService} onChange={v=>setDraftSettings(d=>({...d,pricesIncludeService:v}))}>{t('Los precios que escribo ya incluyen el servicio','The prices I type already include service')}</Check>}
    <p className="rounded-xl bg-[#eef6fb] px-3 py-2 text-sm" data-menu-settings-example>{t('Ejemplo: si escribe','Example: if you type')} {money(500000)}, {t('el cliente verá','customers will see')} <strong>{money(example.total)}</strong> ({t('base','base')} {money(example.base)} · IVA {money(example.iva)}{draftSettings.serviceCharge?` · ${t('servicio','service')} ${money(example.service)}`:''}).</p>
    <button className={primary} disabled={busy}>{t('Guardar configuración','Save settings')}</button>
   </form>
  </Card>

  {photoImport&&<Card title={t('Importar desde una foto del menú','Import from a photo of the menu')}>
   <form className="space-y-3" onSubmit={importPhoto}>
    <p className="text-sm text-slate-700">{t('Leemos los platos y precios de la foto y usted los revisa antes de agregarlos. Nada se publica sin su confirmación.','We read dishes and prices from the photo and you review them before adding. Nothing is published without your confirmation.')}</p>
    <input name="photo" type="file" accept={menuImportImageTypes.join(',')} className={`block w-full text-sm ${ring}`} aria-label={t('Foto del menú (JPG, PNG o WebP, máx. 5 MB)','Menu photo (JPG, PNG or WebP, max 5 MB)')}/>
    <button className={secondary} disabled={busy}>{t('Leer menú de la foto','Read menu from photo')}</button>
   </form>
   {menu.imports.length>0&&<ul className="mt-3 space-y-2">{menu.imports.map(d=><li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e6edf3] px-3 py-2 text-sm">
    <span>{new Date(d.createdAt).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica'})} · {d.status==='ready'?t('Lista para revisar','Ready to review'):t('No se pudo leer','Could not be read')}</span>
    <span className="flex gap-2">{d.status==='ready'&&d.extraction&&<button type="button" className={secondary} disabled={busy} onClick={()=>setReview({draft:d,sections:extractionToReview(d.extraction!,newId)})}>{t('Revisar','Review')}</button>}
     <button type="button" className={secondary} disabled={busy} onClick={()=>discard(d.id)}>{t('Descartar','Discard')}</button></span>
   </li>)}</ul>}
  </Card>}

  <div className="flex flex-wrap gap-2">
   <button type="button" className={secondary} disabled={busy} onClick={()=>{const nameEs=window.prompt(t('Nombre de la nueva sección','New section name'))?.trim();if(nameEs)void mutate({action:'section_create',sectionId:newId(),section:{nameEs}},t('Sección agregada.','Section added.'));}}>{t('Agregar sección','Add section')}</button>
   {canPublish&&drafts.length>0&&<button type="button" className={primary} disabled={busy} data-menu-publish-drafts onClick={()=>void mutate({action:'items_publish',itemIds:drafts},t('Platos publicados.','Dishes published.'))}>
    {t(`Publicar ${drafts.length} ${drafts.length===1?'borrador':'borradores'}`,`Publish ${drafts.length} ${drafts.length===1?'draft':'drafts'}`)}</button>}
  </div>

  {menu.sections.length===0&&<p className="text-slate-700">{t('Agregue una sección (por ejemplo "Desayunos") o importe su menú desde una foto.','Add a section (for example "Breakfast") or import your menu from a photo.')}</p>}
  {menu.sections.map((sec,si)=><SectionCard key={sec.id} sec={sec} lang={lang} busy={busy} money={money} final={final}
   first={si===0} last={si===menu.sections.length-1}
   onMove={dir=>void mutate({action:'sections_reorder',sectionIds:move(menu.sections.map(x=>x.id),si,si+dir)},t('Orden guardado.','Order saved.'))}
   onRename={()=>{const nameEs=window.prompt(t('Nuevo nombre de la sección','New section name'),sec.nameEs)?.trim();if(nameEs)void mutate({action:'section_update',sectionId:sec.id,revision:sec.revision,section:{nameEs,nameEn:sec.nameEn,descriptionEs:sec.descriptionEs,descriptionEn:sec.descriptionEn}},t('Sección guardada.','Section saved.'));}}
   onArchive={()=>{if(window.confirm(t('¿Archivar esta sección? Debe estar vacía.','Archive this section? It must be empty.')))void mutate({action:'section_archive',sectionId:sec.id,revision:sec.revision},t('Sección archivada.','Section archived.'));}}
   onAdd={()=>setForm(emptyForm(sec.id))} onEdit={i=>setForm(editForm(sec.id,i))}
   onMoveItem={(ii,dir)=>void mutate({action:'items_reorder',sectionId:sec.id,itemIds:move(sec.items.map(x=>x.id),ii,ii+dir)},t('Orden guardado.','Order saved.'))}
   onArchiveItem={i=>{if(window.confirm(t('¿Quitar este plato del menú?','Remove this dish from the menu?')))void mutate({action:'item_archive',itemId:i.id,revision:i.revision},t('Plato quitado.','Dish removed.'));}}/>)}

  {form&&<form onSubmit={saveItem} aria-labelledby="menu-item-form-title" data-menu-item-form className="space-y-3 rounded-2xl border-2 border-[#162543] p-4">
   <h2 id="menu-item-form-title" className="text-lg font-bold">{form.id?t('Editar plato','Edit dish'):t('Nuevo plato','New dish')}</h2>
   <Field label={t('Nombre (español)','Name (Spanish)')}><input className={input} required maxLength={120} value={form.nameEs} onChange={e=>setForm({...form,nameEs:e.target.value})}/></Field>
   <Field label={t('Nombre (inglés, opcional)','Name (English, optional)')}><input className={input} maxLength={120} value={form.nameEn} onChange={e=>setForm({...form,nameEn:e.target.value})}/></Field>
   <Field label={t('Descripción (opcional)','Description (optional)')}><textarea className={`${input} min-h-20 py-2`} maxLength={500} value={form.descriptionEs} onChange={e=>setForm({...form,descriptionEs:e.target.value})}/></Field>
   <Field label={t('Descripción en inglés (opcional)','Description in English (optional)')}><textarea className={`${input} min-h-20 py-2`} maxLength={500} value={form.descriptionEn} onChange={e=>setForm({...form,descriptionEn:e.target.value})}/></Field>
   <Field label={`${t('Precio','Price')} (${menu.currency})`}><input className={input} inputMode="decimal" required readOnly={!canPublish&&lockedPrice} aria-describedby={!canPublish&&lockedPrice?'menu-price-locked':undefined} value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></Field>
   {formPrice!=null&&<p className="text-sm" data-menu-form-final>{t('Precio final para el cliente','Final price for customers')}: <strong>{money(final(formPrice).total)}</strong> ({t('base','base')} {money(final(formPrice).base)} · IVA {money(final(formPrice).iva)}{svc?` · ${t('servicio','service')} ${money(final(formPrice).service)}`:''})</p>}
   <TagPicker lang={lang} value={form.dietary} onChange={dietary=>setForm({...form,dietary})}/>
   <Field label={t('Disponibilidad','Availability')}><select className={input} value={form.availability} onChange={e=>setForm({...form,availability:e.target.value as MenuAvailability})}>
    {MENU_AVAILABILITY.map(a=><option key={a} value={a}>{MENU_AVAILABILITY_LABELS[a][lang]}</option>)}</select></Field>
   <div className="grid grid-cols-2 gap-3">
    <Field label={t('Disponible desde (opcional)','Available from (optional)')}><input type="time" className={input} value={form.availableFrom} onChange={e=>setForm({...form,availableFrom:e.target.value})}/></Field>
    <Field label={t('Hasta','Until')}><input type="time" className={input} value={form.availableUntil} onChange={e=>setForm({...form,availableUntil:e.target.value})}/></Field>
   </div>
   <Field label={t('Foto (dirección https, opcional)','Photo (https address, optional)')}><input type="url" className={input} maxLength={1000} value={form.photoUrl} onChange={e=>setForm({...form,photoUrl:e.target.value})}/></Field>
   {form.photoUrl&&<Field label={t('Descripción de la foto (para lectores de pantalla)','Photo description (for screen readers)')}><input className={input} maxLength={200} value={form.photoAltEs} onChange={e=>setForm({...form,photoAltEs:e.target.value})}/></Field>}
   {!canPublish&&lockedPrice&&<p id="menu-price-locked" className="text-sm text-[#5c3b00]">{t('Este plato está publicado: su precio lo cambia un administrador o encargado.','This dish is published: an administrator or manager changes its price.')}</p>}
   {canPublish?<Check checked={form.status==='published'} onChange={v=>setForm({...form,status:v?'published':'draft'})}>{t('Publicado (visible en la ficha)','Published (visible on the listing)')}</Check>
    :<p className="text-sm text-slate-700" data-menu-member-status>{form.status==='published'?t('Publicado (visible en la ficha).','Published (visible on the listing).'):t('Se guardará como borrador; un administrador o encargado lo publica.','It will be saved as a draft; an administrator or manager publishes it.')}</p>}
   <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy}>{t('Guardar plato','Save dish')}</button>
    <button type="button" className={secondary} onClick={()=>setForm(null)}>{t('Cancelar','Cancel')}</button></div>
  </form>}
 </section>;
}

function SectionCard({sec,lang,busy,money,final,first,last,onMove,onRename,onArchive,onAdd,onEdit,onMoveItem,onArchiveItem}:{sec:EditorMenuSection;lang:Lang;busy:boolean;
 money:(m:number)=>string;final:(m:number)=>{total:number};first:boolean;last:boolean;onMove:(dir:-1|1)=>void;onRename:()=>void;onArchive:()=>void;onAdd:()=>void;
 onEdit:(i:EditorMenuItem)=>void;onMoveItem:(index:number,dir:-1|1)=>void;onArchiveItem:(i:EditorMenuItem)=>void}){
 const t=(es:string,en:string)=>lang==='en'?en:es,small=`${secondary} min-w-11 px-3`;
 return <section aria-label={sec.nameEs} data-menu-section={sec.id} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="text-lg font-bold">{sec.nameEs}{sec.nameEn&&<span className="ml-2 text-sm font-normal text-slate-700">/ {sec.nameEn}</span>}</h2>
   <div className="flex flex-wrap gap-1">
    <button type="button" className={small} disabled={busy||first} onClick={()=>onMove(-1)} aria-label={t('Subir sección','Move section up')}>↑</button>
    <button type="button" className={small} disabled={busy||last} onClick={()=>onMove(1)} aria-label={t('Bajar sección','Move section down')}>↓</button>
    <button type="button" className={small} disabled={busy} onClick={onRename}>{t('Renombrar','Rename')}</button>
    <button type="button" className={small} disabled={busy} onClick={onArchive}>{t('Archivar','Archive')}</button>
   </div>
  </div>
  <ul className="divide-y divide-[#e6edf3]">{sec.items.map((i,ii)=><li key={i.id} data-menu-editor-item={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
   <div className="min-w-0">
    <p className="break-words font-semibold">{i.nameEs}</p>
    <p className="text-sm text-slate-700">{money(final(i.priceMinor).total)} {t('final','final')} · <span className={i.status==='draft'?'font-semibold text-amber-800':''}>{i.status==='draft'?t('Borrador','Draft'):t('Publicado','Published')}</span>
     {i.availability!=='available'&&<> · {MENU_AVAILABILITY_LABELS[i.availability][lang]}</>}{i.origin==='photo_import'&&<> · {t('desde foto','from photo')}</>}</p>
   </div>
   <div className="flex flex-wrap gap-1">
    <button type="button" className={small} disabled={busy||ii===0} onClick={()=>onMoveItem(ii,-1)} aria-label={t(`Subir ${i.nameEs}`,`Move ${i.nameEs} up`)}>↑</button>
    <button type="button" className={small} disabled={busy||ii===sec.items.length-1} onClick={()=>onMoveItem(ii,1)} aria-label={t(`Bajar ${i.nameEs}`,`Move ${i.nameEs} down`)}>↓</button>
    <button type="button" className={small} disabled={busy} onClick={()=>onEdit(i)}>{t('Editar','Edit')}</button>
    <button type="button" className={small} disabled={busy} onClick={()=>onArchiveItem(i)}>{t('Quitar','Remove')}</button>
   </div>
  </li>)}</ul>
  <button type="button" className={secondary} disabled={busy} onClick={onAdd}>{t('Agregar plato','Add dish')}</button>
 </section>;
}
function TagPicker({lang,value,onChange}:{lang:Lang;value:MenuDietaryTag[];onChange:(v:MenuDietaryTag[])=>void}){
 return <fieldset className="space-y-1"><legend className="text-sm font-medium">{lang==='en'?'Dietary tags':'Etiquetas'}</legend>
  <div className="flex flex-wrap gap-x-4">{MENU_DIETARY_TAGS.map(tag=><label key={tag} className="flex min-h-11 items-center gap-2 text-sm">
   <input type="checkbox" className="size-5" checked={value.includes(tag)} onChange={e=>{
    const next=new Set(value);if(e.target.checked){next.add(tag);if(tag==='vegano')next.add('vegetariano');}else{next.delete(tag);if(tag==='vegetariano')next.delete('vegano');}
    onChange(MENU_DIETARY_TAGS.filter(x=>next.has(x)));}}/>{MENU_DIETARY_LABELS[tag][lang]}</label>)}</div></fieldset>;
}
function Card({title,children}:{title:string;children:ReactNode}){
 return <section className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4"><h2 className="text-lg font-bold">{title}</h2>{children}</section>;
}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="block space-y-1 text-sm font-medium"><span>{label}</span>{children}</label>;}
function Check({checked,onChange,children}:{checked:boolean;onChange:(v:boolean)=>void;children:ReactNode}){
 return <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0" checked={checked} onChange={e=>onChange(e.target.checked)}/>{children}</label>;
}
