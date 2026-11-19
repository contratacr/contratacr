'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useLocale} from 'next-intl';
import {Camera,Plus} from 'lucide-react';
import {useAuth} from '@/hooks/use-auth';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {LISTING_TTL_DAYS,PROPERTY_AMENITIES,PROPERTY_TYPES,canTransition,listingMutationSchema,type ListingStatus,type ListingVertical} from '@/lib/directory/listing-schemas';
import {AMENITY_LABELS,CR_PROVINCES,DRIVETRAIN_LABELS,FUEL_LABELS,PROPERTY_TYPE_LABELS,TRANSMISSION_LABELS,formatDate,formatMoney,listingPath} from '@/lib/directory/listing-public';
import {MIN_PHOTOS_TO_PUBLISH,inventoryErrorText,inventoryPageSchema,listingAssignAgentSchema,listingMutationResultSchema,type InventoryItem,type InventoryPage} from '@/lib/directory/listing-inventory';
import {idiomaDe} from '@/lib/prefijo-de-idioma';

/**
 * LOCAL PRO ONLY (multivertical V2 Pro Autos / R2 Pro Bienes raíces): generic inventory of vehicle or property
 * listings — list, editor, draft/publish/reserve/sold|rented/archive/renew, photo placeholder (min 4 to publish),
 * friendly limits (54000) and conflicts (40001), agent assignment for properties. Not mounted anywhere yet; talks
 * to the route /api/pro/dir-listings.
 */
const api='/api/pro/dir-listings';
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const field=`mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 py-2 text-base font-normal text-[#162543] ${ring}`;
const btn=`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${ring}`;
const primary=`${btn} bg-[#162543] text-white`,secondary=`${btn} border border-[#d7e1ea] bg-white text-[#162543]`;

type Tri=''|'yes'|'no';
type Draft={title:string;description:string;price:string;currency:'CRC'|'USD';adminArea1:string;adminArea2:string;adminArea3:string;locality:string;placeId:string;agentId:string;
 makeId:string;modelId:string;version:string;year:string;condition:'new'|'used';mileageKm:string;transmission:string;fuel:string;drivetrain:string;engineCc:string;doors:string;seats:string;color:string;
 acceptsTradeIn:boolean;sellerFinancing:boolean;marchamo:Tri;rtv:Tri;taxes:Tri;plate:string;vin:string;
 operation:'sale'|'rent';propertyType:string;bedrooms:string;bathrooms:string;parking:string;builtM2:string;lotM2:string;floors:string;yearBuilt:string;
 furnished:Tri;pets:Tri;condo:Tri;hoaFee:string;minLease:string;amenities:string[];cadastral:string;folio:string};
const blank=():Draft=>({title:'',description:'',price:'',currency:'CRC',adminArea1:'',adminArea2:'',adminArea3:'',locality:'',placeId:'',agentId:'',
 makeId:'',modelId:'',version:'',year:'',condition:'used',mileageKm:'',transmission:'',fuel:'',drivetrain:'',engineCc:'',doors:'',seats:'',color:'',
 acceptsTradeIn:false,sellerFinancing:false,marchamo:'',rtv:'',taxes:'',plate:'',vin:'',
 operation:'sale',propertyType:'house',bedrooms:'',bathrooms:'',parking:'',builtM2:'',lotM2:'',floors:'',yearBuilt:'',furnished:'',pets:'',condo:'',hoaFee:'',minLease:'',amenities:[],cadastral:'',folio:''});
const str=(v:unknown)=>v==null?'':String(v);
const tri=(v:boolean|null|undefined):Tri=>v==null?'':v?'yes':'no';
const minorToMajor=(m:number|null|undefined)=>m==null?'':String(m/100);
function fromItem(i:InventoryItem):Draft{
 const v=i.vehicle,p=i.property,d=blank();
 return {...d,title:i.title,description:str(i.description),price:minorToMajor(i.priceMinor),currency:i.currency,adminArea1:str(i.adminArea1),adminArea2:str(i.adminArea2),adminArea3:str(i.adminArea3),
  locality:str(i.locality),placeId:str(i.placeId),agentId:str(i.agentId),
  ...v?{makeId:str(v.makeId),modelId:str(v.modelId),version:str(v.version),year:str(v.year),condition:v.condition,mileageKm:str(v.mileageKm),transmission:str(v.transmission),fuel:str(v.fuel),
   drivetrain:str(v.drivetrain),engineCc:str(v.engineCc),doors:str(v.doors),seats:str(v.seats),color:str(v.color),acceptsTradeIn:!!v.acceptsTradeIn,sellerFinancing:!!v.sellerFinancing,
   marchamo:tri(v.marchamoCurrentDeclared),rtv:tri(v.rtvCurrentDeclared),taxes:tri(v.taxesPaidDeclared),plate:str(v.platePrivate),vin:str(v.vinPrivate)}:{},
  ...p?{operation:p.operation,propertyType:p.propertyType,bedrooms:str(p.bedrooms),bathrooms:str(p.bathrooms),parking:str(p.parkingSpaces),builtM2:str(p.builtM2),lotM2:str(p.lotM2),
   floors:str(p.floors),yearBuilt:str(p.yearBuilt),furnished:tri(p.furnished),pets:tri(p.petsAllowed),condo:tri(p.inCondominium),hoaFee:minorToMajor(p.hoaFeeMinor),
   minLease:str(p.minLeaseMonths),amenities:p.amenities??[],cadastral:str(p.cadastralPlanPrivate),folio:str(p.folioRealPrivate)}:{}};
}
/** «12 500 000», «12500000.50», «12.500.000» → minor units; null when empty/invalid. */
export function parseMajorToMinor(raw:string):number|null{
 let s=raw.replace(/[\s  ₡$]|US/g,'');if(!s)return null;
 const dots=(s.match(/\./g)??[]).length,commas=(s.match(/,/g)??[]).length;
 if(dots>1||commas>1||(dots&&commas))s=s.replace(/[.,](?=\d{3}(?:\D|$))/g,'');
 s=s.replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 return Math.round(Number(s)*100);
}
const num=(s:string)=>s.trim()===''?null:Number(s.replace(',','.'));
const triVal=(t:Tri)=>t===''?null:t==='yes';
const nn=(s:string)=>s.trim()===''?null:s.trim();

type Editor={mode:'create';id:string}|{mode:'edit';id:string;item:InventoryItem};
type Result={status:number;body:{reason?:string;error?:string}&Record<string,unknown>|null};

export function ListingInventory({vertical}:{vertical:ListingVertical}){const {user}=useAuth();return user?<InventorySession key={user.id+vertical} actor={user.id} vertical={vertical}/>:null;}

function InventorySession({actor,vertical}:{actor:string;vertical:ListingVertical}){
 const locale=useLocale(),en=locale==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const vehicles=vertical==='vehiculos';
 const [page,setPage]=useState<InventoryPage|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[actionError,setActionError]=useState('');
 const [filter,setFilter]=useState<'active'|'closed'>('active'),[editor,setEditor]=useState<Editor|null>(null),[draft,setDraft]=useState<Draft>(blank),[baseline,setBaseline]=useState('');
 const [formError,setFormError]=useState(''),[saving,setSaving]=useState(false),[busy,setBusy]=useState<string|null>(null),[loadedAt,setLoadedAt]=useState(0);
 const sequence=useRef(0),pending=useRef<{signature:string;body:unknown}|null>(null),statusIds=useRef(new Map<string,string>());
 const headers={'X-Pro-Expected-Actor':actor};
 const dirty=!!editor&&JSON.stringify(draft)!==baseline;

 const load=useCallback(async()=>{
  const n=++sequence.current;setLoading(true);setLoadError('');
  try{
   const response=await fetch(api+'?'+new URLSearchParams({vertical}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
   const body=await response.json().catch(()=>null);
   if(!response.ok){if(n===sequence.current)setLoadError(inventoryErrorText(body?.reason,locale));return;}
   const parsed=inventoryPageSchema.parse(body);if(n===sequence.current){setPage(parsed);setLoadedAt(Date.now());}
  }catch{if(n===sequence.current)setLoadError(t('No se pudo cargar el inventario. Intente de nuevo.','The inventory could not be loaded. Please try again.'));}
  finally{if(n===sequence.current)setLoading(false);}
 },[vertical,actor,locale,t]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);

 async function post(body:unknown):Promise<Result>{
  try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
   return {status:response.status,body:await response.json().catch(()=>null)};}
  catch{return {status:0,body:null};}
 }
 const reasonOf=(r:Result)=>r.body?.reason??(r.status===409?'conflict':r.status===404?'not_found':r.status===400?'invalid':undefined);

 function open(next:Editor){
  const d=next.mode==='edit'?fromItem(next.item):{...blank(),placeId:page?.places.length===1?page.places[0].id:''};
  setEditor(next);setDraft(d);setBaseline(JSON.stringify(d));setFormError('');setNotice('');pending.current=null;
 }
 async function close(){
  if(saving)return;
  if(dirty&&!(await confirm({title:t('¿Descartar cambios?','Discard changes?'),description:t('Los datos del anuncio que no guardó se perderán.','Listing details you have not saved will be lost.'),confirmLabel:t('Descartar cambios','Discard changes')})).confirmed)return;
  setEditor(null);pending.current=null;
 }
 const set=<K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(d=>({...d,[key]:value}));

 function buildInput(e:Editor,d:Draft){
  const priceMinor=parseMajorToMinor(d.price)??0;
  const listing={title:d.title.trim(),description:nn(d.description),priceMinor,currency:d.currency,adminArea1:nn(d.adminArea1),adminArea2:nn(d.adminArea2),adminArea3:nn(d.adminArea3),locality:nn(d.locality),
   ...page?.sellerKind==='business'?{placeId:d.placeId||null}:{}};
  const vehicle=vehicles?{makeId:Number(d.makeId),modelId:Number(d.modelId),version:nn(d.version),year:Number(d.year),condition:d.condition,mileageKm:num(d.mileageKm),
   transmission:d.transmission||null,fuel:d.fuel||null,drivetrain:d.drivetrain||null,engineCc:num(d.engineCc),doors:num(d.doors),seats:num(d.seats),color:nn(d.color),
   acceptsTradeIn:d.acceptsTradeIn,sellerFinancing:d.sellerFinancing,marchamoCurrentDeclared:triVal(d.marchamo),rtvCurrentDeclared:triVal(d.rtv),taxesPaidDeclared:triVal(d.taxes),
   platePrivate:nn(d.plate),vinPrivate:nn(d.vin)}:undefined;
  const rent=d.operation==='rent';
  const property=!vehicles?{propertyType:d.propertyType,bedrooms:num(d.bedrooms),bathrooms:num(d.bathrooms),parkingSpaces:num(d.parking),builtM2:num(d.builtM2),lotM2:num(d.lotM2),
   floors:num(d.floors),yearBuilt:num(d.yearBuilt),furnished:triVal(d.furnished),petsAllowed:triVal(d.pets),inCondominium:triVal(d.condo),hoaFeeMinor:parseMajorToMinor(d.hoaFee),
   minLeaseMonths:rent?num(d.minLease):null,amenities:d.amenities,cadastralPlanPrivate:nn(d.cadastral),folioRealPrivate:nn(d.folio)}:undefined;
  if(e.mode==='create')return {action:'create',actionId:crypto.randomUUID(),listingId:e.id,revision:0,
   listing:{...listing,vertical,sellerKind:page?.sellerKind??'private',countryCode:'CR'},vehicle,property:property&&{...property,operation:d.operation}};
  return {action:'update',actionId:crypto.randomUUID(),listingId:e.id,revision:e.item.revision,listing,vehicle,property};
 }
 function issueText(path:string){
  if(path.includes('title'))return t('Escriba un título de 5 a 120 caracteres.','Enter a title of 5 to 120 characters.');
  if(path.includes('priceMinor'))return t('Indique un precio válido (por ejemplo 12 500 000).','Enter a valid price (for example 12,500,000).');
  if(path.includes('makeId')||path.includes('modelId'))return t('Elija la marca y el modelo.','Choose the make and model.');
  if(path.includes('year'))return t('Indique un año válido.','Enter a valid year.');
  if(path.includes('platePrivate'))return t('Revise la placa.','Check the plate number.');
  if(path.includes('vinPrivate'))return t('Revise el VIN (11 a 17 caracteres, sin I, O ni Q).','Check the VIN (11 to 17 characters, no I, O or Q).');
  if(path.includes('Private'))return t('Revise el número de plano o folio.','Check the survey plan or folio number.');
  if(path.includes('minLeaseMonths'))return t('El plazo mínimo solo aplica a alquileres (1 a 120 meses).','The minimum lease applies only to rentals (1 to 120 months).');
  return t('Revise los datos del anuncio.','Check the listing details.');
 }
 async function save(event:FormEvent){
  event.preventDefault();if(!editor||saving)return;setFormError('');
  if(editor.mode==='edit'&&!dirty){setFormError(t('No hay cambios que guardar.','There are no changes to save.'));return;}
  const signature=JSON.stringify({id:editor.id,draft,revision:editor.mode==='edit'?editor.item.revision:0});
  const raw=pending.current?.signature===signature?pending.current.body:buildInput(editor,draft);
  const parsed=listingMutationSchema.safeParse(raw);
  if(!parsed.success){setFormError(issueText(parsed.error.issues[0]?.path.join('.')??''));return;}
  pending.current={signature,body:parsed.data};setSaving(true);
  try{
   const r=await post(parsed.data);
   if(r.status<200||r.status>=300){setFormError(r.status===0?t('No se pudo confirmar el guardado. Pulse Guardar otra vez: no se duplicará.','Saving could not be confirmed. Press Save again: it will not be duplicated.'):inventoryErrorText(reasonOf(r),locale,page?.limits));if(r.status!==0)pending.current=null;return;}
   const result=listingMutationResultSchema.safeParse(r.body);
   const agentChanged=!vehicles&&draft.agentId!==(editor.mode==='edit'?str(editor.item.agentId):'');
   if(agentChanged&&result.success){
    const assign=listingAssignAgentSchema.parse({action:'assign_agent',actionId:crypto.randomUUID(),listingId:result.data.listingId,revision:result.data.revision,agentId:draft.agentId||null});
    const a=await post(assign);
    if(a.status<200||a.status>=300)setNotice(t('El anuncio se guardó, pero no se pudo asignar el agente. Intente de nuevo desde el editor.','The listing was saved, but the agent could not be assigned. Try again from the editor.'));
   }
   pending.current=null;setEditor(null);setNotice(old=>old||t('Anuncio guardado.','Listing saved.'));await load();
  }finally{setSaving(false);}
 }

 async function changeStatus(item:InventoryItem,to:ListingStatus|'renew'){
  setActionError('');setNotice('');
  if(to==='published'&&item.status==='draft'&&item.photoCount<MIN_PHOTOS_TO_PUBLISH){setActionError(inventoryErrorText('photos_missing',locale));return;}
  if((to==='sold'||to==='rented'||to==='archived')&&!(await confirm({title:to==='archived'?t('¿Archivar el anuncio?','Archive the listing?'):to==='sold'?t('¿Marcar como vendido?','Mark as sold?'):t('¿Marcar como alquilado?','Mark as rented?'),
   description:to==='archived'?t('Dejará de verse en público. Podrá recuperarlo como borrador.','It will no longer be public. You can restore it as a draft.'):t('Dejará de verse en público y ya no podrá editarse.','It will no longer be public and can no longer be edited.'),confirmLabel:t('Confirmar','Confirm')})).confirmed)return;
  const key=`${item.id}:${item.revision}:${to}`;let actionId=statusIds.current.get(key);if(!actionId){actionId=crypto.randomUUID();statusIds.current.set(key,actionId);}
  const body=to==='renew'?{action:'renew',actionId,listingId:item.id,revision:item.revision}:{action:'status',actionId,listingId:item.id,revision:item.revision,status:to};
  const parsed=listingMutationSchema.safeParse(body);if(!parsed.success){setActionError(inventoryErrorText('invalid',locale));return;}
  setBusy(item.id);
  try{
   const r=await post(parsed.data);
   if(r.status<200||r.status>=300){setActionError(r.status===0?t('No se pudo confirmar el cambio. Puede reintentar sin duplicarlo.','The change could not be confirmed. You can retry without duplicating it.'):inventoryErrorText(reasonOf(r),locale,page?.limits));if(r.status!==0)statusIds.current.delete(key);if(r.status===409)await load();return;}
   statusIds.current.delete(key);setNotice(to==='renew'?t(`Anuncio renovado por ${LISTING_TTL_DAYS} días.`,`Listing renewed for ${LISTING_TTL_DAYS} days.`):t('Estado actualizado.','Status updated.'));await load();
  }finally{setBusy(null);}
 }

 const statusLabel=(s:ListingStatus)=>({draft:t('Borrador','Draft'),published:t('Publicado','Published'),reserved:t('Reservado','Reserved'),sold:t('Vendido','Sold'),rented:t('Alquilado','Rented'),
  archived:t('Archivado','Archived'),suspended:t('Suspendido','Suspended'),expired:t('Vencido','Expired')})[s];
 const statusTone=(s:ListingStatus)=>s==='published'?'bg-emerald-50 text-emerald-900':s==='reserved'?'bg-amber-100 text-amber-900':s==='suspended'?'bg-red-50 text-red-800':s==='draft'?'bg-[#EBF5FB] text-[#162543]':'bg-slate-100 text-slate-800';
 function actionsFor(item:InventoryItem):{to:ListingStatus|'renew';label:string}[]{
  const op=item.property?.operation??null,can=(to:ListingStatus)=>canTransition(item.status,to,vertical,op,'owner');
  const list:{to:ListingStatus|'renew';label:string}[]=[];
  // The database renews published, reserved or expired listings (+60 days, published_at unchanged). Offer it when
  // expired or within the last 7 days, so it never works as a «bump».
  const soon=!!item.expiresAt&&Date.parse(item.expiresAt)-loadedAt<7*86_400_000;
  if(item.status==='expired'||((item.status==='published'||item.status==='reserved')&&soon))list.push({to:'renew',label:t('Renovar','Renew')});
  if(can('published'))list.push({to:'published',label:item.status==='reserved'?t('Quitar reserva','Remove reservation'):item.status==='rented'?t('Publicar de nuevo','Publish again'):t('Publicar','Publish')});
  if(can('reserved'))list.push({to:'reserved',label:t('Marcar reservado','Mark reserved')});
  if(can('sold'))list.push({to:'sold',label:t('Marcar vendido','Mark sold')});
  if(can('rented'))list.push({to:'rented',label:t('Marcar alquilado','Mark rented')});
  if(can('draft'))list.push({to:'draft',label:item.status==='archived'?t('Recuperar como borrador','Restore as draft'):t('Pasar a borrador','Back to draft')});
  if(can('archived'))list.push({to:'archived',label:t('Archivar','Archive')});
  return list;
 }

 const items=(page?.items??[]).filter(i=>filter==='active'?['draft','published','reserved','expired','suspended'].includes(i.status):['sold','rented','archived'].includes(i.status));
 const models=page?.catalog?.models.filter(m=>String(m.makeId)===draft.makeId)??[];
 const editable=editor?.mode!=='edit'||!['sold','rented','suspended'].includes(editor.item.status);
 const title=vehicles?t('Inventario de vehículos','Vehicle inventory'):t('Inventario de inmuebles','Property inventory');

 return <section aria-labelledby="inventory-title" data-listing-inventory={vertical} className="space-y-5 text-[#162543]">
  {dialogNode}
  <header className="flex flex-wrap items-center justify-between gap-3">
   <h2 id="inventory-title" className="text-xl font-extrabold">{title}</h2>
   <button type="button" className={primary} onClick={()=>open({mode:'create',id:crypto.randomUUID()})} disabled={!page||!!editor} data-inventory-new><Plus aria-hidden className="size-4"/>{vehicles?t('Nuevo vehículo','New vehicle'):t('Nuevo inmueble','New property')}</button>
  </header>
  {page&&<LimitBanner page={page} t={t}/>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}
  {actionError&&<p role="alert" data-inventory-error className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}

  {editor&&page&&<form onSubmit={save} noValidate aria-labelledby="inventory-editor-title" data-inventory-editor={editor.mode} className="space-y-5 rounded-2xl border border-[#d7e1ea] p-4 sm:p-6">
   <h3 id="inventory-editor-title" className="text-lg font-bold">{editor.mode==='create'?t('Nuevo anuncio','New listing'):t('Editar anuncio','Edit listing')}</h3>
   {!editable&&<p className="rounded-xl bg-slate-100 px-4 py-3 text-sm">{inventoryErrorText('listing_locked',locale)}</p>}
   <fieldset disabled={!editable||saving} className="space-y-5">
    <Group legend={t('Datos principales','Main details')}>
     <Field label={t('Título','Title')} wide><input className={field} value={draft.title} maxLength={120} onChange={e=>set('title',e.target.value)} required/></Field>
     <Field label={t('Precio','Price')}><input className={field} inputMode="decimal" value={draft.price} onChange={e=>set('price',e.target.value)} required placeholder="12 500 000"/></Field>
     <Field label={t('Moneda','Currency')}><select className={field} value={draft.currency} onChange={e=>set('currency',e.target.value as Draft['currency'])}><option value="CRC">{t('Colones (₡)','Colones (₡)')}</option><option value="USD">{t('Dólares (US$)','Dollars (US$)')}</option></select></Field>
     <Field label={t('Descripción (mínimo 20 caracteres para publicar)','Description (at least 20 characters to publish)')} wide><textarea className={field} rows={5} maxLength={5000} value={draft.description} onChange={e=>set('description',e.target.value)}/></Field>
    </Group>
    {vehicles?<Group legend={t('Vehículo','Vehicle')}>
     <Field label={t('Marca','Make')}><select className={field} value={draft.makeId} onChange={e=>setDraft(d=>({...d,makeId:e.target.value,modelId:''}))} required><option value="">{t('Elija…','Choose…')}</option>{page.catalog?.makes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
     <Field label={t('Modelo','Model')}><select className={field} value={draft.modelId} onChange={e=>set('modelId',e.target.value)} required disabled={!draft.makeId}><option value="">{t('Elija…','Choose…')}</option>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
     <Field label={t('Versión','Trim')}><input className={field} value={draft.version} maxLength={80} onChange={e=>set('version',e.target.value)}/></Field>
     <Field label={t('Año','Year')}><input className={field} inputMode="numeric" value={draft.year} onChange={e=>set('year',e.target.value)} required/></Field>
     <Field label={t('Condición','Condition')}><select className={field} value={draft.condition} onChange={e=>set('condition',e.target.value as Draft['condition'])}><option value="used">{t('Usado','Used')}</option><option value="new">{t('Nuevo','New')}</option></select></Field>
     <Field label={t('Kilometraje','Mileage (km)')}><input className={field} inputMode="numeric" value={draft.mileageKm} onChange={e=>set('mileageKm',e.target.value)}/></Field>
     <Field label={t('Transmisión','Transmission')}><Options value={draft.transmission} onChange={v=>set('transmission',v)} map={TRANSMISSION_LABELS} locale={locale} t={t}/></Field>
     <Field label={t('Combustible','Fuel')}><Options value={draft.fuel} onChange={v=>set('fuel',v)} map={FUEL_LABELS} locale={locale} t={t}/></Field>
     <Field label={t('Tracción','Drivetrain')}><Options value={draft.drivetrain} onChange={v=>set('drivetrain',v)} map={DRIVETRAIN_LABELS} locale={locale} t={t}/></Field>
     <Field label={t('Motor (cc)','Engine (cc)')}><input className={field} inputMode="numeric" value={draft.engineCc} onChange={e=>set('engineCc',e.target.value)}/></Field>
     <Field label={t('Puertas','Doors')}><input className={field} inputMode="numeric" value={draft.doors} onChange={e=>set('doors',e.target.value)}/></Field>
     <Field label={t('Asientos','Seats')}><input className={field} inputMode="numeric" value={draft.seats} onChange={e=>set('seats',e.target.value)}/></Field>
     <Field label={t('Color','Colour')}><input className={field} value={draft.color} maxLength={40} onChange={e=>set('color',e.target.value)}/></Field>
     <Field label={t('Marchamo al día (declarado)','Road tax paid (declared)')}><TriSelect value={draft.marchamo} onChange={v=>set('marchamo',v)} t={t}/></Field>
     <Field label={t('RTV al día (declarado)','Inspection current (declared)')}><TriSelect value={draft.rtv} onChange={v=>set('rtv',v)} t={t}/></Field>
     <Field label={t('Impuestos al día (declarado)','Taxes paid (declared)')}><TriSelect value={draft.taxes} onChange={v=>set('taxes',v)} t={t}/></Field>
     <Check label={t('Recibe vehículo como parte de pago','Accepts trade-in')} checked={draft.acceptsTradeIn} onChange={v=>set('acceptsTradeIn',v)}/>
     <Check label={t('Ofrece financiamiento propio','Offers own financing')} checked={draft.sellerFinancing} onChange={v=>set('sellerFinancing',v)}/>
     <Field label={t('Placa (privada, no se publica)','Plate (private, never shown)')}><input className={field} value={draft.plate} maxLength={12} autoComplete="off" onChange={e=>set('plate',e.target.value)}/></Field>
     <Field label={t('VIN (privado, no se publica)','VIN (private, never shown)')}><input className={field} value={draft.vin} maxLength={17} autoComplete="off" onChange={e=>set('vin',e.target.value)}/></Field>
    </Group>:<Group legend={t('Inmueble','Property')}>
     <Field label={t('Operación','Operation')}><select className={field} value={draft.operation} disabled={editor.mode==='edit'} onChange={e=>set('operation',e.target.value as Draft['operation'])}><option value="sale">{t('Venta','Sale')}</option><option value="rent">{t('Alquiler','Rent')}</option></select>
      {editor.mode==='edit'&&<span className="mt-1 block text-xs text-slate-600">{t('La operación no se puede cambiar.','The operation cannot be changed.')}</span>}</Field>
     <Field label={t('Tipo','Type')}><select className={field} value={draft.propertyType} onChange={e=>set('propertyType',e.target.value)}>{PROPERTY_TYPES.map(p=><option key={p} value={p}>{PROPERTY_TYPE_LABELS[p][en?'en':'es']}</option>)}</select></Field>
     <Field label={t('Habitaciones','Bedrooms')}><input className={field} inputMode="numeric" value={draft.bedrooms} onChange={e=>set('bedrooms',e.target.value)}/></Field>
     <Field label={t('Baños (use ,5 para medio)','Bathrooms (use .5 for half)')}><input className={field} inputMode="decimal" value={draft.bathrooms} onChange={e=>set('bathrooms',e.target.value)}/></Field>
     <Field label={t('Parqueos','Parking spaces')}><input className={field} inputMode="numeric" value={draft.parking} onChange={e=>set('parking',e.target.value)}/></Field>
     <Field label={t('Construcción (m²)','Built area (m²)')}><input className={field} inputMode="decimal" value={draft.builtM2} onChange={e=>set('builtM2',e.target.value)}/></Field>
     <Field label={t('Lote (m²)','Lot (m²)')}><input className={field} inputMode="decimal" value={draft.lotM2} onChange={e=>set('lotM2',e.target.value)}/></Field>
     <Field label={t('Pisos','Floors')}><input className={field} inputMode="numeric" value={draft.floors} onChange={e=>set('floors',e.target.value)}/></Field>
     <Field label={t('Año de construcción','Year built')}><input className={field} inputMode="numeric" value={draft.yearBuilt} onChange={e=>set('yearBuilt',e.target.value)}/></Field>
     <Field label={t('Amueblado','Furnished')}><TriSelect value={draft.furnished} onChange={v=>set('furnished',v)} t={t}/></Field>
     <Field label={t('Acepta mascotas','Pets allowed')}><TriSelect value={draft.pets} onChange={v=>set('pets',v)} t={t}/></Field>
     <Field label={t('En condominio','In a condominium')}><TriSelect value={draft.condo} onChange={v=>set('condo',v)} t={t}/></Field>
     <Field label={t('Cuota de mantenimiento mensual','Monthly maintenance fee')}><input className={field} inputMode="decimal" value={draft.hoaFee} onChange={e=>set('hoaFee',e.target.value)}/></Field>
     {draft.operation==='rent'&&<Field label={t('Plazo mínimo (meses)','Minimum lease (months)')}><input className={field} inputMode="numeric" value={draft.minLease} onChange={e=>set('minLease',e.target.value)}/></Field>}
     <fieldset className="sm:col-span-2"><legend className="text-sm font-medium">{t('Comodidades','Amenities')}</legend>
      <div className="mt-2 grid grid-cols-1 gap-1 min-[380px]:grid-cols-2 sm:grid-cols-3">{PROPERTY_AMENITIES.map(a=><Check key={a} label={AMENITY_LABELS[a][en?'en':'es']} checked={draft.amenities.includes(a)}
       onChange={v=>set('amenities',v?[...draft.amenities,a]:draft.amenities.filter(x=>x!==a))}/>)}</div></fieldset>
     <Field label={t('Plano catastrado (privado)','Survey plan no. (private)')}><input className={field} value={draft.cadastral} autoComplete="off" onChange={e=>set('cadastral',e.target.value)}/></Field>
     <Field label={t('Folio real (privado)','Property folio (private)')}><input className={field} value={draft.folio} autoComplete="off" onChange={e=>set('folio',e.target.value)}/></Field>
     {page.agents.length>0&&<Field label={t('Agente asignado','Assigned agent')}><select className={field} value={draft.agentId} onChange={e=>set('agentId',e.target.value)} data-inventory-agent>
      <option value="">{t('Sin asignar','Unassigned')}</option>{page.agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
    </Group>}
    <Group legend={t('Ubicación','Location')}>
     <Field label={t('Provincia','Province')}><select className={field} value={draft.adminArea1} onChange={e=>set('adminArea1',e.target.value)}><option value="">{t('Elija…','Choose…')}</option>{CR_PROVINCES.map(p=><option key={p}>{p}</option>)}</select></Field>
     <Field label={t('Cantón','Canton')}><input className={field} value={draft.adminArea2} maxLength={80} onChange={e=>set('adminArea2',e.target.value)}/></Field>
     <Field label={t('Distrito','District')}><input className={field} value={draft.adminArea3} maxLength={80} onChange={e=>set('adminArea3',e.target.value)}/></Field>
     <Field label={t('Barrio o localidad','Neighbourhood')}><input className={field} value={draft.locality} maxLength={80} onChange={e=>set('locality',e.target.value)}/></Field>
     {!vehicles&&<p className="text-xs text-slate-600 sm:col-span-2">{t('En público se muestra una zona aproximada (unos 500 m), nunca la dirección exacta.','The public page shows an approximate area (about 500 m), never the exact address.')}</p>}
     {page.sellerKind==='business'&&page.places.length>0&&<Field label={t('Ficha del negocio','Business page')}><select className={field} value={draft.placeId} onChange={e=>set('placeId',e.target.value)}>
      <option value="">{t('Sin vincular','Not linked')}</option>{page.places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    </Group>
    <Group legend={t('Fotos','Photos')}>
     <div className="flex items-start gap-3 rounded-xl border border-dashed border-[#9fb3c8] bg-[#f6f9fc] p-4 sm:col-span-2" data-inventory-photos={editor.mode==='edit'?editor.item.photoCount:0}>
      <Camera aria-hidden className="mt-0.5 size-5 shrink-0"/>
      <p className="text-sm">{t(`La carga de fotos llega pronto. Se necesitan al menos ${MIN_PHOTOS_TO_PUBLISH} para publicar; puede guardar el borrador mientras tanto.`,`Photo upload is coming soon. At least ${MIN_PHOTOS_TO_PUBLISH} are needed to publish; you can save the draft meanwhile.`)}
       {editor.mode==='edit'&&<> {t('Fotos actuales','Current photos')}: <strong>{editor.item.photoCount}</strong>.</>}</p>
     </div>
    </Group>
   </fieldset>
   {formError&&<p role="alert" data-inventory-form-error className="text-sm text-red-700">{formError}</p>}
   <div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:justify-end">
    <button type="button" className={secondary} onClick={()=>void close()} disabled={saving}>{t('Cancelar','Cancel')}</button>
    {editable&&<button type="submit" className={primary} disabled={saving} data-inventory-save>{saving?t('Guardando…','Saving…'):t('Guardar','Save')}</button>}
   </div>
  </form>}

  <div role="tablist" aria-label={t('Filtrar anuncios','Filter listings')} className="flex gap-2">
   {(['active','closed'] as const).map(f=><button key={f} type="button" role="tab" aria-selected={filter===f} onClick={()=>setFilter(f)}
    className={`${btn} ${filter===f?'bg-[#162543] text-white':'border border-[#d7e1ea] bg-white'}`}>{f==='active'?t('Activos','Active'):vehicles?t('Vendidos y archivados','Sold and archived'):t('Cerrados y archivados','Closed and archived')}</button>)}
  </div>
  {loading&&!page?<p role="status" className="text-sm">{t('Cargando…','Loading…')}</p>
   :loadError?<div role="alert" className="space-y-2 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{loadError}</p><button type="button" className={secondary} onClick={()=>void load()}>{t('Reintentar','Retry')}</button></div>
   :!items.length?<p className="rounded-2xl border border-dashed border-[#d7e1ea] p-6 text-center text-sm" data-inventory-empty>{filter==='active'?t('Aún no tiene anuncios activos.','You have no active listings yet.'):t('No hay anuncios cerrados.','No closed listings.')}</p>
   :<ul className="space-y-3" data-inventory-list>{items.map(item=><li key={item.id} data-inventory-item={item.code} data-status={item.status} className="space-y-3 rounded-2xl border border-[#d7e1ea] p-4">
    <div className="flex flex-col gap-1 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
     <div className="min-w-0"><p className="break-words font-bold">{item.title}</p>
      <p className="text-sm text-slate-700">{formatMoney(item.priceMinor,item.currency,locale)} · {t('Código','Code')} <span className="font-mono">{item.code.toUpperCase()}</span>
       {item.agentId&&page?.agents.find(a=>a.id===item.agentId)&&<> · {t('Agente','Agent')}: {page.agents.find(a=>a.id===item.agentId)?.name}</>}</p>
      {item.expiresAt&&(item.status==='published'||item.status==='reserved')&&<p className="text-xs text-slate-600">{t('Vence el','Expires on')} {formatDate(item.expiresAt,locale)}</p>}
      {item.moderationStatus==='review'&&<p className="text-xs text-amber-900">{t('En revisión por ContrataCR.','Under review by ContrataCR.')}</p>}
      {item.moderationStatus==='rejected'&&<p className="text-xs text-red-800">{t('Rechazado por moderación. Revise el contenido.','Rejected by moderation. Please review the content.')}</p>}
      {item.status==='draft'&&item.photoCount<MIN_PHOTOS_TO_PUBLISH&&<p className="text-xs text-slate-600">{t(`Fotos: ${item.photoCount} de ${MIN_PHOTOS_TO_PUBLISH} necesarias para publicar.`,`Photos: ${item.photoCount} of ${MIN_PHOTOS_TO_PUBLISH} needed to publish.`)}</p>}
     </div>
     <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
    </div>
    <div className="flex flex-wrap gap-2">
     <button type="button" className={secondary} disabled={!!editor||busy===item.id} onClick={()=>open({mode:'edit',id:item.id,item})}>{t('Editar','Edit')}<span className="sr-only">: {item.title}</span></button>
     {actionsFor(item).map(a=><button key={a.to} type="button" disabled={!!editor||busy===item.id||(a.to==='published'&&item.status==='draft'&&item.photoCount<MIN_PHOTOS_TO_PUBLISH)}
      className={a.to==='published'||a.to==='renew'?primary:secondary} onClick={()=>void changeStatus(item,a.to)} data-inventory-action={a.to}>{a.label}<span className="sr-only">: {item.title}</span></button>)}
     {(item.status==='published'||item.status==='reserved')&&<a className={secondary} href={listingPath({vertical,title:item.title,code:item.code},locale)} target="_blank" rel="noopener">{t('Ver en público','View public page')}</a>}
    </div>
   </li>)}</ul>}
 </section>;
}

function LimitBanner({page,t}:{page:InventoryPage;t:(es:string,en:string)=>string}){
 if(page.sellerKind==='business'&&page.businessVerified)return <p className="text-sm text-emerald-800" data-inventory-limit="none">{t('Negocio verificado: sin límite de anuncios publicados.','Verified business: no limit on published listings.')}</p>;
 const [used,max,text]=page.sellerKind==='private'
  ?[page.counts.active,page.limits.privateActivePerVertical,t('Anuncios activos (borradores incluidos)','Active listings (drafts included)')]
  :[page.counts.published,page.limits.businessUnverifiedPublished,t('Anuncios publicados mientras verificamos su negocio','Published listings while we verify your business')];
 return <div data-inventory-limit={`${used}/${max}`} className={`rounded-xl px-4 py-3 text-sm ${used>=max?'bg-amber-50 text-amber-950':'bg-[#f6f9fc]'}`}>
  <p>{text}: <strong>{used} {t('de','of')} {max}</strong></p>
  <meter className="mt-2 h-2 w-full" min={0} max={max} value={Math.min(used,max)} aria-label={text}/>
 </div>;
}
function Group({legend,children}:{legend:string;children:ReactNode}){
 return <fieldset className="space-y-3"><legend className="text-base font-bold">{legend}</legend><div className="grid gap-3 sm:grid-cols-2">{children}</div></fieldset>;
}
function Field({label,children,wide}:{label:string;children:ReactNode;wide?:boolean}){
 return <label className={`block min-w-0 text-sm font-medium ${wide?'sm:col-span-2':''}`}>{label}{children}</label>;
}
function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){
 return <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className={`size-5 ${ring}`} checked={checked} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
}
function TriSelect({value,onChange,t}:{value:Tri;onChange:(v:Tri)=>void;t:(es:string,en:string)=>string}){
 return <select className={field} value={value} onChange={e=>onChange(e.target.value as Tri)}><option value="">{t('No indicar','Not stated')}</option><option value="yes">{t('Sí','Yes')}</option><option value="no">{t('No','No')}</option></select>;
}
function Options({value,onChange,map,locale,t}:{value:string;onChange:(v:string)=>void;map:Record<string,{es:string;en:string}>;locale:string;t:(es:string,en:string)=>string}){
 return <select className={field} value={value} onChange={e=>onChange(e.target.value)}><option value="">{t('No indicar','Not stated')}</option>{Object.entries(map).map(([k,v])=><option key={k} value={k}>{v[idiomaDe(locale)]}</option>)}</select>;
}
