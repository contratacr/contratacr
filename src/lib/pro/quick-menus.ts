/** Entries of the Pro header menus (Search, Help, Settings). Pure data so it is unit-testable. Every entry is an existing Pro section. */
export type QuickEntry={key:string;label:string;tab:string;extra?:Record<string,string>;hint?:string};
export type QuickGroup={key:string;label:string;items:QuickEntry[]};
export function proQuickGroups(en:boolean):QuickGroup[]{
 const l=(es:string,english:string)=>en?english:es,inProject=l('Se abre desde cada proyecto','Opens from each project');
 return [
  {key:'planning',label:l('Planificación','Planning'),items:[
   {key:'estimates',label:l('Todas las cotizaciones','All quotes'),tab:'quotes'},
   {key:'contracts',label:l('Contratos','Contracts'),tab:'pro_projects',hint:inProject},
   {key:'takeoffs',label:l('Mediciones','Takeoffs'),tab:'pro_projects',hint:inProject},
   {key:'floor_plans',label:l('Planos 3D','3D floor plans'),tab:'pro_projects',hint:inProject},
   {key:'mood_boards',label:l('Tableros de inspiración','Mood boards'),tab:'pro_projects',hint:inProject},
   {key:'selections',label:l('Selecciones','Selections'),tab:'pro_projects',hint:inProject},
  ]},
  {key:'management',label:l('Gestión','Management'),items:[
   {key:'task_center',label:l('Centro de tareas','Task center'),tab:'pro_tasks'},
   {key:'daily_logs',label:l('Resúmenes del día','Daily logs'),tab:'pro_projects',hint:inProject},
   {key:'time',label:l('Todas las horas','All time'),tab:'pro_hours'},
   {key:'expenses',label:l('Todos los gastos','All expenses'),tab:'pro_expenses'},
   {key:'leads',label:l('Solicitudes','Leads'),tab:'pro_leads'},
  ]},
  {key:'finance',label:l('Finanzas','Finance'),items:[
   {key:'invoices',label:l('Borradores de facturación','Invoice drafts'),tab:'pro_billing'},
   {key:'payments',label:l('Pagos','Payments'),tab:'pro_payments'},
   {key:'purchase_orders',label:l('Órdenes de compra','Purchase orders'),tab:'pro_projects',hint:inProject},
   {key:'change_orders',label:l('Órdenes de cambio','Change orders'),tab:'pro_projects',hint:inProject},
   {key:'credits',label:l('Créditos y anticipos','Credits and retainers'),tab:'pro_projects',hint:inProject},
  ]},
 ];
}
export function proHelpGroups(en:boolean):QuickGroup[]{
 const l=(es:string,english:string)=>en?english:es;
 return [
  {key:'knowledge',label:l('Centro de conocimiento','Knowledge center'),items:[
   {key:'help',label:l('Centro de ayuda','Help center'),tab:'pro_company',extra:{empresa:'ayuda'}},
   {key:'training',label:l('Formación','Training'),tab:'pro_company',extra:{empresa:'formacion'}},
  ]},
  {key:'connect',label:l('Contacto','Connect'),items:[
   {key:'support',label:l('Soporte Pro','Pro support'),tab:'pro_company',extra:{empresa:'soporte'}},
  ]},
 ];
}
export function proSettingsGroups(en:boolean):QuickGroup[]{
 const l=(es:string,english:string)=>en?english:es;
 return [
  {key:'company',label:l('Ajustes de la empresa','Company settings'),items:[
   {key:'workdays',label:l('Excepciones de jornada','Workday exceptions'),tab:'pro_projects',hint:l('Calendario laboral, desde cada proyecto','Work calendar, from each project')},
   {key:'time',label:l('Gestión del tiempo','Time management'),tab:'pro_hours'},
  ]},
  {key:'account',label:l('Ajustes de la cuenta','Account settings'),items:[
   {key:'notifications',label:l('Notificaciones','Notifications'),tab:'pro_notifications'},
  ]},
  {key:'integrations',label:l('Integraciones','Integrations'),items:[
   {key:'clipper',label:l('Capturador de productos','Product clipper'),tab:'pro_inventory'},
   {key:'drive',label:l('Google Drive','Google Drive'),tab:'pro_company',extra:{empresa:'conectores'}},
  ]},
 ];
}
