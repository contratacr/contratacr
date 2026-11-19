/**
 * Round 2: ONE list of Pro sections for the sidebar and the «Inicio» cards, so both always show
 * the same entries in the same order. `taskCenter` is the independent Pro space (company hub,
 * projects, team…); the embedded panel keeps its smaller set.
 */
export type ProHubItem={key:string;label:string;tab:string;extra?:Record<string,string>;team?:boolean;preparation?:boolean;href?:string};
export type ProHubGroup={key:'company'|'library'|'management'|'directory';label:string;items:ProHubItem[]};
/** Pending fixes round (2026-11-17): directory modules of a workspace that manages a claimed place (GET /api/pro/place-hub). */
export type ProPlaceHub={menu:boolean;reservations:boolean;place:boolean};
/** «Mi negocio en el directorio»: own routes outside the Pro space (href), only the entries the workspace has. */
export function proDirectoryItems(en:boolean,hub:ProPlaceHub|null|undefined):ProHubItem[]{
 if(!hub)return [];
 const l=(es:string,english:string)=>en?english:es,base=(en?'/en':'')+'/dashboard/pro';
 return [
  ...(hub.reservations?[{key:'table_reservations',label:l('Reservas de mesa','Table reservations'),tab:'',href:base+'/reservas-mesa'}]:[]),
  ...(hub.menu?[{key:'menu',label:l('Menú','Menu'),tab:'',href:base+'/menu'}]:[]),
  ...(hub.place?[{key:'place',label:l('Mi lugar: Pedir, eventos y marca','My place: Order, events and brand'),tab:'',href:base+'/lugar'}]:[]),
 ];
}
export function proHubGroups(en:boolean,taskCenter:boolean,placeHub?:ProPlaceHub|null):ProHubGroup[]{
 const l=(es:string,english:string)=>en?english:es;
 const directory=taskCenter?proDirectoryItems(en,placeHub):[];
 return [
  {key:'company',label:l('Empresa','Company'),items:[
   ...(taskCenter?[{key:'company',label:l('Centro de empresa','Company hub'),tab:'pro_company'}]:[]),
   {key:'customers',label:l('Clientes','Customers'),tab:'pro_clients'},
   // The company hub owns the supplier/subcontractor directory; the embedded panel keeps the
   // suppliers view of Expenses.
   taskCenter?{key:'suppliers',label:l('Proveedores','Suppliers'),tab:'pro_company',extra:{empresa:'proveedores'}}:{key:'suppliers',label:l('Proveedores','Suppliers'),tab:'pro_expenses',extra:{gastosVista:'suppliers'}},
   ...(taskCenter?[{key:'team',label:l('Equipo','Team'),tab:'pro_team'},
    // Gaps round (2026-11-17): the workspace edition (Servicios, Autos, Restaurantes, Comercio), free during the launch.
    {key:'editions',label:l('Edición de Pro','Pro edition'),tab:'pro_editions'}]:[]),
  ]},
  {key:'library',label:l('Biblioteca','Library'),items:[
   ...(taskCenter?[{key:'files',label:l('Archivos de la empresa','Company files'),tab:'pro_files'}]:[]),
   {key:'catalog',label:l('Productos y servicios','Products and services'),tab:'pro_inventory'},
   {key:'services',label:l('Servicios frecuentes','Frequent services'),tab:'quotes',extra:{plantillaServicios:'1'}},
  ]},
  {key:'management',label:l('Gestión','Management'),items:[
   ...(taskCenter?[{key:'projects',label:l('Proyectos','Projects'),tab:'pro_projects'},{key:'leads',label:l('Solicitudes','Leads'),tab:'pro_leads'}]:[]),
   {key:'agenda',label:l('Citas','Appointments'),tab:'pro_agenda'},
   // Round 9: «Horas» (hours of every job) next to Tasks in the independent Pro space.
   ...(taskCenter?[{key:'tasks',label:l('Tareas','Tasks'),tab:'pro_tasks'},{key:'hours',label:l('Horas','Timesheets'),tab:'pro_hours'}]:[]),
   {key:'quotes',label:l('Cotizaciones','Quotes'),tab:'quotes'},
   {key:'payments',label:l('Pagos','Payments'),tab:'pro_payments'},
   {key:'expenses',label:l('Gastos','Expenses'),tab:'pro_expenses'},
   {key:'statistics',label:l('Estadísticas','Statistics'),tab:'statistics'},
   {key:'preparation',label:l('Preparar visitas','Visit preparation'),tab:'pro_tools',extra:{prepararVisita:'1'},preparation:true},
   {key:'billing',label:l('Borradores de facturación','Invoice drafts'),tab:'pro_billing'},
  ]},
  ...(directory.length?[{key:'directory' as const,label:l('Mi negocio en el directorio','My business in the directory'),items:directory}]:[]),
 ];
}
/** An entry is current when its tab matches and, if it has parameters, they all match; an entry
 * without parameters is not current while a sibling with the same tab and matching parameters is. */
export function proHubItemActive(item:ProHubItem,siblings:ProHubItem[],tab:string,params:{get:(key:string)=>string|null}){
 if(item.href||item.tab!==tab)return false;
 const matches=(entry:ProHubItem)=>!!entry.extra&&Object.entries(entry.extra).every(([key,value])=>params.get(key)===value);
 if(item.extra)return matches(item);
 return !siblings.some(other=>other!==item&&other.tab===tab&&matches(other));
}
