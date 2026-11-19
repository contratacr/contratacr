'use client';
import {DocumentBrandingSettings} from './document-branding';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import dynamic from 'next/dynamic';
import {useLocale} from 'next-intl';
import {useAuth} from '@/hooks/use-auth';
import {Button} from '@/components/ui/button';
import {navigatePro,pushProParams,pushProPath} from '@/lib/pro/navigation';
import {useProSearchParams} from './use-pro-search-params';
import {CatalogOrganizations} from './catalog-organizations';
import {ServicePackageManager} from './service-packages';
import {DiscountPresetManager} from './discount-presets';
import {TaskTemplates,type TaskTemplatesState} from './task-templates';
import {ContractTemplates} from './contract-templates';
import {CostCodeLibraryCard} from './cost-code-library';

/**
 * Company hub: collaborators, library and marketing in one place. Each view reuses the
 * existing module (catalog, company files, templates, categories); only the vendor
 * directory is new. Round 6D: website, email campaigns and tracking replace the former «not available» states.
 */
function ViewLoading(){const en=useLocale()==='en';return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{en?'Loading…':'Cargando…'}</p>;}
const CatalogWorkspace=dynamic(()=>import('./catalog-workspace').then(m=>m.CatalogWorkspace),{loading:ViewLoading});
const CompanyFiles=dynamic(()=>import('./company-files').then(m=>m.CompanyFiles),{loading:ViewLoading});
const CompanyVendors=dynamic(()=>import('./company-vendors').then(m=>m.CompanyVendors),{loading:ViewLoading});
const CompanyIntegrations=dynamic(()=>import('./company-integrations').then(m=>m.CompanyIntegrations),{loading:ViewLoading});
const CompanyEinvoice=dynamic(()=>import('./company-einvoice').then(m=>m.CompanyEinvoice),{loading:ViewLoading});
const CompanyConnectors=dynamic(()=>import('./company-connectors').then(m=>m.CompanyConnectors),{loading:ViewLoading});
const CompanyAccounting=dynamic(()=>import('./company-accounting').then(m=>m.CompanyAccounting),{loading:ViewLoading});
const CompanySite=dynamic(()=>import('./company-site').then(m=>m.CompanySite),{loading:ViewLoading});
const CompanyMarketing=dynamic(()=>import('./company-marketing').then(m=>m.CompanyMarketing),{loading:ViewLoading});
const CompanyAdsTracking=dynamic(()=>import('./company-ads-tracking').then(m=>m.CompanyAdsTracking),{loading:ViewLoading});
const PaymentReconciliation=dynamic(()=>import('./payment-reconciliation').then(m=>m.PaymentReconciliation),{loading:ViewLoading});

export const companyViews=['contactos','proveedores','archivos','plantillas','categorias','articulos','catalogos','perfil','formulario','sitio','correo','insights','integraciones','conectores','contabilidad','cobros','documentos','facturacion'] as const;
export type CompanyView=typeof companyViews[number];
type Copy={es:string;en:string};
const views:Record<CompanyView,{label:Copy;title:Copy;description:Copy}>={
 contactos:{label:{es:'Clientes',en:'Customers'},title:{es:'Clientes',en:'Customers'},description:{es:'Sus clientes y cuentas: nombre, nombre comercial, correo, teléfono y grupo. Se reutilizan al cotizar y facturar.',en:'Your customers and accounts: name, trade name, email, phone and group. They are reused in quotes and invoices.'}},
 proveedores:{label:{es:'Proveedores',en:'Suppliers'},title:{es:'Proveedores y subcontratistas',en:'Suppliers and subcontractors'},description:{es:'Un solo directorio para Gastos y Órdenes de compra. Los totales salen de los documentos que ya registró.',en:'One directory for Expenses and Purchase orders. Totals come from the documents you have already recorded.'}},
 archivos:{label:{es:'Archivos de la empresa',en:'Company files'},title:{es:'Archivos de la empresa',en:'Company files'},description:{es:'Documentos y fotos privados que puede copiar a cualquier proyecto.',en:'Private documents and photos you can copy into any project.'}},
 plantillas:{label:{es:'Plantillas',en:'Templates'},title:{es:'Plantillas',en:'Templates'},description:{es:'Lo que repite en cada proyecto: tareas, planes de trabajo, servicios frecuentes y descuentos.',en:'What you repeat in every project: tasks, work plans, frequent services and discounts.'}},
 categorias:{label:{es:'Categorías',en:'Categories'},title:{es:'Categorías',en:'Categories'},description:{es:'Nombres guardados para ordenar productos, servicios y clientes. Se eligen al crear cada registro.',en:'Saved names to organize products, services and customers. You choose them when creating each record.'}},
 articulos:{label:{es:'Mis artículos',en:'My items'},title:{es:'Mis artículos',en:'My items'},description:{es:'Productos y servicios que usa con frecuencia, con precio, costo, unidad y existencias.',en:'Products and services you use often, with price, cost, unit and stock.'}},
 catalogos:{label:{es:'Catálogos',en:'Catalogs'},title:{es:'Catálogos',en:'Catalogs'},description:{es:'Cargue listas de productos o clientes desde una hoja de cálculo.',en:'Load product or customer lists from a spreadsheet.'}},
 perfil:{label:{es:'Perfil público',en:'Public profile'},title:{es:'Perfil público',en:'Public profile'},description:{es:'La página donde los clientes lo encuentran en ContrataCR.',en:'The page where customers find you on ContrataCR.'}},
 formulario:{label:{es:'Formulario de contacto',en:'Contact form'},title:{es:'Formulario de contacto',en:'Contact form'},description:{es:'Cómo le llegan las solicitudes de clientes nuevos.',en:'How requests from new customers reach you.'}},
 sitio:{label:{es:'Sitio web',en:'Website'},title:{es:'Sitio web',en:'Website'},description:{es:'Su sitio web con sus servicios, fotos, reseñas y un formulario que crea solicitudes. Se publica por versiones.',en:'Your website with your services, photos, reviews and a form that creates leads. Published in versions.'}},
 correo:{label:{es:'Correo masivo',en:'Email campaigns'},title:{es:'Correo masivo',en:'Email campaigns'},description:{es:'Campañas y automatizaciones por correo, solo a contactos con consentimiento y con enlace de baja.',en:'Email campaigns and automations, only to contacts with consent and with an unsubscribe link.'}},
 insights:{label:{es:'Resultados de marketing',en:'Marketing insights'},title:{es:'Resultados de marketing',en:'Marketing insights'},description:{es:'Enlaces de seguimiento (UTM), costos de sus campañas y costo por solicitud con datos reales.',en:'Tracking links (UTM), campaign costs and cost per lead from real data.'}},
 integraciones:{label:{es:'Integraciones',en:'Integrations'},title:{es:'Integraciones',en:'Integrations'},description:{es:'Hacienda, cobros en línea, firma electrónica, Google, Microsoft, QuickBooks, IA, transcripción, correo de campañas, anuncios, lector de enlaces y dominio: modo, estado y prueba de conexión.',en:'Hacienda, online payments, e-signature, Google, Microsoft, QuickBooks, AI, transcription, campaign email, ads, link reader and domain: mode, status and connection test.'}},
 conectores:{label:{es:'Correo y calendario',en:'Email and calendar'},title:{es:'Correo, calendario y archivos',en:'Email, calendar and files'},description:{es:'Conecte Google o Microsoft para enviar correos de proyecto desde su buzón, sincronizar la agenda y adjuntar archivos de Drive u OneDrive.',en:'Connect Google or Microsoft to send project emails from your mailbox, sync your agenda and attach Drive or OneDrive files.'}},
 contabilidad:{label:{es:'Contabilidad',en:'Accounting'},title:{es:'Contabilidad',en:'Accounting'},description:{es:'Sincronice clientes, facturas y pagos con QuickBooks o exporte un CSV para cualquier sistema contable.',en:'Sync customers, invoices and payments with QuickBooks or export a CSV for any accounting system.'}},
 documentos:{label:{es:'Documentos con su marca',en:'Branded documents'},title:{es:'Documentos con su marca',en:'Branded documents'},description:{es:'El color, el logo y los datos de su empresa en las facturas, contratos, estados de cuenta, planes de pagos, recibos y órdenes de compra que imprime.',en:'Your colour, logo and company details on the invoices, contracts, statements, payment plans, receipts and purchase orders you print.'}},
 // Ronda F2-A: electronic invoicing (provider, mode, emisor, branch/terminal, received documents).
 facturacion:{label:{es:'Facturación electrónica',en:'Electronic invoicing'},title:{es:'Facturación electrónica',en:'Electronic invoicing'},description:{es:'Proveedor y modo de la factura electrónica, datos del emisor, sucursal, terminal y actividad, y respuestas a los comprobantes que le envían sus proveedores.',en:'Electronic invoice provider and mode, issuer details, branch, terminal and activity, and answers to the documents your suppliers send you.'}},
 cobros:{label:{es:'Cobros en línea',en:'Online payments'},title:{es:'Cobros en línea',en:'Online payments'},description:{es:'Conciliación de los pagos recibidos por enlace con los estados de cuenta.',en:'Reconciliation of payments received by link against the customer ledgers.'}},
};
const groups:{label:Copy;items:CompanyView[]}[]=[
 {label:{es:'Colaboradores',en:'Collaborators'},items:['contactos','proveedores']},
 // Round 7B: «Company files» has one entry, in the Pro side menu (tab pro_files); the
 // company-hub address ?empresa=archivos keeps working for old links.
 {label:{es:'Biblioteca',en:'Library'},items:['plantillas','categorias','articulos','catalogos']},
 {label:{es:'Marketing',en:'Marketing'},items:['perfil','formulario','sitio','correo','insights']},
 {label:{es:'Configuración',en:'Settings'},items:['facturacion','integraciones','conectores','contabilidad','cobros','documentos']},
];
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5';
const linkButton='inline-flex min-h-11 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-5 text-sm font-semibold text-[#007aa0] hover:bg-[#f3f8fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bb5]';

// The importer opens on top of the list it fills, so closing it returns to that list.
let pendingImport:CompanyView|null=null;
function openImport(view:CompanyView){pendingImport=view;navigatePro('pro_company',{empresa:view});}
export function CompanyHub({profileSlug,disabled=false}:{profileSlug:string|null;disabled?:boolean}){
 const en=useLocale()==='en',params=useProSearchParams(),{user}=useAuth();
 const requested=params.get('empresa')||'contactos',view:CompanyView=(companyViews as readonly string[]).includes(requested)?requested as CompanyView:'contactos';
 const l=(copy:Copy)=>en?copy.en:copy.es;
 const go=(next:CompanyView)=>{if(next!==view)navigatePro('pro_company',{empresa:next});};
 const meta=views[view];
 useEffect(()=>{if(pendingImport!==view)return;pendingImport=null;pushProParams({importar:'1'});},[view]);
 return <div data-company-hub={view} className="min-w-0 space-y-5">
  <nav aria-label={en?'Company sections':'Secciones de Empresa'} className="hidden min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-3 sm:block">
   {groups.map(group=><div key={group.label.es} role="group" aria-label={l(group.label)} className="flex min-w-0 flex-wrap items-center gap-2">
    <span className="w-28 shrink-0 text-xs font-bold uppercase tracking-wide text-[#52627a]">{l(group.label)}</span>
    {group.items.map(item=><button key={item} type="button" disabled={disabled} aria-current={item===view?'page':undefined} onClick={()=>go(item)} className={`min-h-11 rounded-xl px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bb5] ${item===view?'bg-[#eaf7fb] font-bold text-[#007aa0]':'font-semibold text-[#52627a] hover:bg-[#f3f8fb]'}`}>{l(views[item].label)}</button>)}
   </div>)}
  </nav>
  <label className="block text-sm font-semibold sm:hidden">{en?'Company section':'Sección de Empresa'}<select disabled={disabled} aria-label={en?'Company section':'Sección de Empresa'} value={view} onChange={event=>go(event.target.value as CompanyView)} className="mt-1 min-h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-base">{groups.map(group=><optgroup key={group.label.es} label={l(group.label)}>{group.items.map(item=><option key={item} value={item}>{l(views[item].label)}</option>)}</optgroup>)}</select></label>
  <section aria-labelledby="company-view-title" className="min-w-0 space-y-4">
   <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 id="company-view-title" className="text-xl font-bold text-[#162543]">{l(meta.title)}</h2>{view!=='contactos'&&view!=='articulos'&&<p className="text-sm text-[#52627a]">{l(meta.description)}</p>}</div>{view==='archivos'&&<div id="pro-company-hub-file-actions" className="h-11 w-11 shrink-0"/>}</div>
   {view==='contactos'&&user&&<CatalogWorkspace key={user.id+':clients'} kind="clients"/>}
   {view==='articulos'&&user&&<CatalogWorkspace key={user.id+':products'} kind="products"/>}
   {view==='proveedores'&&<CompanyVendors/>}
   {view==='archivos'&&user&&<CompanyFiles key={user.id} headerActionsId="pro-company-hub-file-actions" disabled={disabled}/>}
   {view==='plantillas'&&<CompanyTemplates/>}
   {view==='categorias'&&<CompanyCategories/>}
   {view==='catalogos'&&<CompanyCatalogs/>}
   {view==='perfil'&&<CompanyProfile slug={profileSlug}/>}
   {view==='formulario'&&<CompanyContactForm slug={profileSlug}/>}
   {view==='sitio'&&user&&<CompanySite key={user.id}/>}
   {view==='correo'&&user&&<CompanyMarketing key={user.id}/>}
   {view==='insights'&&user&&<CompanyAdsTracking key={user.id}/>}
   {view==='integraciones'&&user&&<CompanyIntegrations key={user.id}/>}
   {view==='conectores'&&user&&<CompanyConnectors key={user.id}/>}
   {view==='contabilidad'&&user&&<CompanyAccounting key={user.id}/>}
   {view==='cobros'&&user&&<PaymentReconciliation key={user.id}/>}
   {view==='documentos'&&user&&<DocumentBrandingSettings key={user.id}/>}
   {view==='facturacion'&&user&&<CompanyEinvoice key={user.id}/>}
  </section>
 </div>;
}

type PreviewItem={name:string;count?:number};
type PreviewState={items:PreviewItem[];more:boolean}|'error'|null;
function usePreview(url:string,parse:(body:unknown)=>{items:PreviewItem[];more:boolean},refreshEvent?:string){
 const {user}=useAuth(),[state,setState]=useState<PreviewState>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(!refreshEvent)return;const refresh=()=>setAttempt(value=>value+1);window.addEventListener(refreshEvent,refresh);return()=>window.removeEventListener(refreshEvent,refresh);},[refreshEvent]);
 useEffect(()=>{if(!user)return;let alive=true;const controller=new AbortController();
  fetch(url,{cache:'no-store',signal:controller.signal,headers:{'X-Pro-Expected-Actor':user.id}}).then(async response=>{if(!response.ok)throw Error();const value=parse(await response.json());if(alive)setState(value);}).catch(()=>{if(alive&&!controller.signal.aborted)setState('error');});
  return()=>{alive=false;controller.abort();};
 // eslint-disable-next-line react-hooks/exhaustive-deps -- parse is a stable module-level mapper per call site
 },[url,user,attempt]);
 return {state,retry:useCallback(()=>{setState(null);setAttempt(value=>value+1);},[])};
}
const named=(body:unknown)=>{const page=body as {items?:{name?:unknown;recordCount?:unknown}[];nextCursor?:unknown};if(!Array.isArray(page.items))throw Error();return {items:page.items.map(row=>({name:String(row.name??''),count:typeof row.recordCount==='number'?row.recordCount:undefined})).filter(row=>row.name),more:!!page.nextCursor};};

function PreviewList({state,retry,empty,unit}:{state:PreviewState;retry:()=>void;empty:string;unit?:(n:number)=>string}){
 const en=useLocale()==='en';
 if(state===null)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{en?'Loading…':'Cargando…'}</p>;
 if(state==='error')return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{en?'Could not load this list.':'No se pudo cargar esta lista.'}</span><Button type="button" variant="secondary" onClick={retry}>{en?'Retry':'Reintentar'}</Button></div>;
 if(!state.items.length)return <p className="text-sm text-[#52627a]">{empty}</p>;
 return <div className="space-y-1"><ul className="space-y-1 text-sm">{state.items.slice(0,5).map((item,index)=><li key={item.name+index} className="flex min-w-0 justify-between gap-3"><span className="min-w-0 break-words">{item.name}</span>{unit&&item.count!==undefined&&<span className="shrink-0 text-[#52627a]">{unit(item.count)}</span>}</li>)}</ul>{(state.items.length>5||state.more)&&<p className="text-xs text-[#52627a]">{en?'Showing the first 5.':'Se muestran los primeros 5.'}</p>}</div>;
}

function CompanyTemplates(){
 const en=useLocale()==='en';
 const tasks=usePreview('/api/pro/task-templates?view=list&status=active&q=',named,'ccr:pro-company-templates-changed');
 const plans=usePreview('/api/pro/schedule-templates?view=list&status=active',named);
 const services=usePreview('/api/pro/service-packages?filter=active',named,'ccr:pro-company-templates-changed');
 const discounts=usePreview('/api/pro/discount-presets?filter=active',named,'ccr:pro-company-templates-changed');
 const [taskState,setTaskState]=useState<TaskTemplatesState>({dirty:false,busy:false});
 const onTaskState=useCallback((state:TaskTemplatesState)=>setTaskState(old=>old.dirty===state.dirty&&old.busy===state.busy?old:state),[]);
 const params=useProSearchParams(),servicesOpen=params.get('plantillaServicios')==='1',discountsOpen=params.get('descuentoCatalogo')==='1';
 const wasOpen=useRef(false);
 // Refresh the previews after a manager closes or a template write finishes.
 useEffect(()=>{if(servicesOpen||discountsOpen||taskState.busy){wasOpen.current=true;return;}if(wasOpen.current){wasOpen.current=false;window.dispatchEvent(new Event('ccr:pro-company-templates-changed'));}},[servicesOpen,discountsOpen,taskState.busy]);
 return <div data-company-templates className="grid min-w-0 gap-4 lg:grid-cols-2">
  <section className={card} aria-labelledby="company-task-templates"><h3 id="company-task-templates" className="font-bold">{en?'Task templates':'Plantillas de tareas'}</h3><p className="text-sm text-[#52627a]">{en?'Task lists with relative due dates that you add to a project in one step.':'Listas de tareas con fechas relativas que agrega a un proyecto en un solo paso.'}</p>
   <PreviewList {...tasks} empty={en?'You have no task templates yet.':'Todavía no tiene plantillas de tareas.'}/>
   <TaskTemplates selected={[]} onStateChange={onTaskState} onApplied={()=>window.dispatchEvent(new Event('ccr:pro-company-templates-changed'))}/>
  </section>
  <section className={card} aria-labelledby="company-plan-templates"><h3 id="company-plan-templates" className="font-bold">{en?'Work plan templates':'Plantillas de plan de trabajo'}</h3><p className="text-sm text-[#52627a]">{en?'Phases, tasks, dependencies and milestones. You create, edit and apply them from a project’s plan, because they use that project’s dates.':'Fases, tareas, dependencias y fechas clave. Se crean, editan y aplican desde el plan de un proyecto, porque usan sus fechas.'}</p>
   <PreviewList {...plans} empty={en?'You have no work plan templates yet.':'Todavía no tiene plantillas de plan de trabajo.'}/>
   <Button type="button" variant="secondary" onClick={()=>navigatePro('pro_projects')}>{en?'Open projects':'Abrir proyectos'}</Button>
  </section>
  <section className={card} aria-labelledby="company-service-templates"><h3 id="company-service-templates" className="font-bold">{en?'Frequent services':'Servicios frecuentes'}</h3><p className="text-sm text-[#52627a]">{en?'One service or a set of lines that you add to quotes and invoice drafts.':'Un servicio o un conjunto de líneas que agrega a cotizaciones y borradores de facturación.'}</p>
   <PreviewList {...services} empty={en?'You have no frequent services yet.':'Todavía no tiene servicios frecuentes.'}/>
   <Button type="button" variant="secondary" onClick={()=>pushProParams({plantillaServicios:'1'})}>{en?'Manage frequent services':'Administrar servicios frecuentes'}</Button>
  </section>
  <section className={card} aria-labelledby="company-discount-templates"><h3 id="company-discount-templates" className="font-bold">{en?'Saved discounts':'Descuentos guardados'}</h3><p className="text-sm text-[#52627a]">{en?'Discounts with a reason that you apply to invoice draft lines.':'Descuentos con motivo que aplica a las líneas de los borradores de facturación.'}</p>
   <PreviewList {...discounts} empty={en?'You have no saved discounts yet.':'Todavía no tiene descuentos guardados.'}/>
   <Button type="button" variant="secondary" onClick={()=>pushProParams({descuentoCatalogo:'1'})}>{en?'Manage discounts':'Administrar descuentos'}</Button>
  </section>
  <ContractTemplates/>
  <ServicePackageManager/><DiscountPresetManager/>
 </div>;
}

function CompanyCategories(){
 const en=useLocale()==='en',event='ccr:pro-catalog-organizations-changed';
 const products=usePreview('/api/pro/catalog-organizations?kind=product_category&q=&after=&filter=active',named,event);
 const groups=usePreview('/api/pro/catalog-organizations?kind=client_group&q=&after=&filter=active',named,event);
 const uses=(n:number)=>en?(n===1?'1 record':`${n} records`):(n===1?'1 registro':`${n} registros`);
 return <div data-company-categories className="grid min-w-0 gap-4 lg:grid-cols-2">
  <section className={card} aria-labelledby="company-product-categories"><h3 id="company-product-categories" className="font-bold">{en?'Product and service categories':'Categorías de productos y servicios'}</h3><p className="text-sm text-[#52627a]">{en?'They group the items you add to quotes and invoice drafts. Renaming keeps the name used in earlier records.':'Agrupan los artículos que agrega a cotizaciones y borradores de facturación. Al renombrar se conserva el nombre de los registros anteriores.'}</p>
   <PreviewList {...products} unit={uses} empty={en?'You have no categories yet.':'Todavía no tiene categorías.'}/>
   <CatalogOrganizations kind="product_category" renderTrigger={open=><Button type="button" variant="secondary" onClick={open}>{en?'Manage categories':'Administrar categorías'}</Button>}/>
  </section>
  <section className={card} aria-labelledby="company-client-groups"><h3 id="company-client-groups" className="font-bold">{en?'Customer groups':'Grupos de clientes'}</h3><p className="text-sm text-[#52627a]">{en?'For example, homes, companies or condominiums. They help you filter and export contacts.':'Por ejemplo, residencias, empresas o condominios. Le ayudan a filtrar y exportar contactos.'}</p>
   <PreviewList {...groups} unit={uses} empty={en?'You have no customer groups yet.':'Todavía no tiene grupos de clientes.'}/>
   <CatalogOrganizations kind="client_group" renderTrigger={open=><Button type="button" variant="secondary" onClick={open}>{en?'Manage groups':'Administrar grupos'}</Button>}/>
  </section>
  {/* Row 54 (Ronda F1-B): company cost-code library, applied to each project from Finance › Budget. */}
  <CostCodeLibraryCard/>
 </div>;
}

function CompanyCatalogs(){
 const en=useLocale()==='en';
 return <div data-company-catalogs className="grid min-w-0 gap-4 lg:grid-cols-2">
  <section className={card} aria-labelledby="company-catalog-products"><h3 id="company-catalog-products" className="font-bold">{en?'Product and service list':'Lista de productos y servicios'}</h3><p className="text-sm text-[#52627a]">{en?'Import a CSV file with up to 500 rows. Columns can be separated by commas or semicolons, so a file saved from Excel in Spanish works as is. You can review every row before saving.':'Importe un archivo CSV de hasta 500 filas. Las columnas pueden ir separadas por coma o por punto y coma, así que un archivo guardado desde Excel en español funciona tal cual. Antes de guardar puede revisar cada fila.'}</p>
   <Button type="button" variant="secondary" onClick={()=>openImport('articulos')}>{en?'Import products and services':'Importar productos y servicios'}</Button>
  </section>
  <section className={card} aria-labelledby="company-catalog-clients"><h3 id="company-catalog-clients" className="font-bold">{en?'Customer list':'Lista de clientes'}</h3><p className="text-sm text-[#52627a]">{en?'Bring your existing customers from a CSV file. Duplicate ID numbers are reported before anything is saved.':'Traiga sus clientes actuales desde un archivo CSV. Las identificaciones repetidas se señalan antes de guardar.'}</p>
   <Button type="button" variant="secondary" onClick={()=>openImport('contactos')}>{en?'Import customers':'Importar clientes'}</Button>
  </section>
  <BlockedCard title={en?'Brand and manufacturer catalogs':'Catálogos de marcas y fabricantes'} text={en?'Browsing supplier catalogs with live prices needs agreements and a data connection with each brand. It is not available yet.':'Consultar catálogos de proveedores con precios al día requiere acuerdos y una conexión de datos con cada marca. Todavía no está disponible.'}/>
 </div>;
}

function publicPath(en:boolean,slug:string){return (en?'/en':'')+'/profesionales/'+encodeURIComponent(slug);}
function CompanyProfile({slug}:{slug:string|null}){
 const en=useLocale()==='en';
 return <div data-company-profile className="grid min-w-0 gap-4 lg:grid-cols-2">
  <section className={card} aria-labelledby="company-public-profile"><h3 id="company-public-profile" className="font-bold">{en?'Your profile on ContrataCR':'Su perfil en ContrataCR'}</h3>
   {slug?<p className="text-sm text-[#52627a]">{en?'Customers see your services, photos, reviews and contact options there.':'Ahí los clientes ven sus servicios, fotos, reseñas y formas de contacto.'}</p>:<p className="text-sm text-[#52627a]">{en?'You do not have a public profile yet. Pro tools work the same without one.':'Todavía no tiene perfil público. Las herramientas de Pro funcionan igual sin él.'}</p>}
   <div className="flex flex-wrap gap-2">{slug&&<a href={publicPath(en,slug)} target="_blank" rel="noopener" className={linkButton}>{en?'Open my public profile':'Abrir mi perfil público'}<span className="sr-only">{en?' (opens in a new tab)':' (se abre en otra pestaña)'}</span></a>}<button type="button" className={linkButton} onClick={()=>pushProPath((en?'/en':'')+'/dashboard/profesional?tab=profile')}>{en?'Edit profile':'Editar perfil'}</button></div>
  </section>
  <section className={card} aria-labelledby="company-profile-metrics"><h3 id="company-profile-metrics" className="font-bold">{en?'Visits and contacts':'Visitas y contactos'}</h3><p className="text-sm text-[#52627a]">{en?'Profile views, clicks and the origin of your leads are in Metrics.':'Las visitas al perfil, los clics y el origen de sus solicitudes están en Métricas.'}</p><Button type="button" variant="secondary" onClick={()=>navigatePro('statistics')}>{en?'Open metrics':'Abrir métricas'}</Button></section>
 </div>;
}
function CompanyContactForm({slug}:{slug:string|null}){
 const en=useLocale()==='en';
 return <section data-company-contact-form className={card} aria-labelledby="company-contact-form"><h3 id="company-contact-form" className="font-bold">{en?'Request form on your profile':'Formulario de solicitud en su perfil'}</h3>
  <p className="text-sm text-[#52627a]">{en?'Your public profile already includes a request form. Each request arrives in Leads, in the New stage, with its own history. Customers sign in with a free account to send it.':'Su perfil público ya incluye un formulario de solicitud. Cada solicitud llega a Solicitudes, en la etapa Nueva y con su propio historial. El cliente inicia sesión con una cuenta gratuita para enviarla.'}</p>
  <p className="text-sm text-[#52627a]">{en?'To receive appointment requests, turn on "Receive appointment requests" in Appointments.':'Para recibir solicitudes de citas, active "Recibir solicitudes de citas" en Citas.'}</p>
  <div className="flex flex-wrap gap-2">{slug&&<a href={publicPath(en,slug)} target="_blank" rel="noopener" className={linkButton}>{en?'See the form on my profile':'Ver el formulario en mi perfil'}<span className="sr-only">{en?' (opens in a new tab)':' (se abre en otra pestaña)'}</span></a>}<Button type="button" variant="secondary" onClick={()=>navigatePro('pro_leads')}>{en?'Open leads':'Abrir solicitudes'}</Button><Button type="button" variant="secondary" onClick={()=>navigatePro('pro_agenda')}>{en?'Open Appointments':'Abrir Citas'}</Button></div>
 </section>;
}
function BlockedCard({title,text,children}:{title:string;text:string;children?:ReactNode}){
 const en=useLocale()==='en';
 return <section data-company-blocked className={card} aria-label={title}><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{title}</h3><span className="rounded-lg bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#8a5300]">{en?'Not available yet':'Aún no disponible'}</span></div><p className="text-sm text-[#52627a]">{text}</p>{children}</section>;
}
