// Templates and libraries: schedule templates (pro_schedule_templates_mutate_rules), task templates
// (pro_task_templates_mutate + pro_task_template_extend for tags), contract clause library and contract templates
// (pro_contracts_mutate), e-mail templates (pro_email_template_set: stored only, never sent) and service packages
// (pro_mutate_service_package, the quote line templates). Project contracts belong to finance.mjs.
// Skipped: estimate cost templates (no separate writer; service packages are the quote/estimate templates).
import {must,uuid,appModules} from '../lib.mjs';

const S='templates';
const ph=(t,k)=>uuid(`${S}:schedule:${t}:phase:${k}`),tk=(t,k)=>uuid(`${S}:schedule:${t}:task:${k}`),ms=(t,k)=>uuid(`${S}:schedule:${t}:milestone:${k}`);
const task=(t,k,title,phase,start,end,deps=[],details='')=>({id:tk(t,k),title,details,assignee:'',dueOffset:end,phaseId:ph(t,phase),startOffset:start,endOffset:end,dependsOn:deps.map(d=>tk(t,d))});
const SCHEDULES=[
 {key:'cocina',name:'Remodelación de cocina (Ejemplo)',notes:'Plan base de 30 días para cocinas de 10 a 15 m². Ajuste las fechas según el sitio.',
  phases:[['demolicion','Demolición',0],['instalaciones','Instalaciones',1],['acabados','Acabados',2]],
  tasks:t=>[task(t,'proteccion','Proteger áreas y retirar muebles','demolicion',0,0),task(t,'demoler','Demoler enchapes y sobres','demolicion',1,3,['proteccion']),
   task(t,'fontaneria','Cambiar tubería de agua y desagües','instalaciones',4,7,['demoler']),task(t,'electrica','Canalizar tomas y circuitos','instalaciones',4,8,['demoler']),
   task(t,'enchape','Enchapar piso y salpicadero','acabados',9,14,['fontaneria','electrica']),task(t,'muebles','Instalar muebles y sobre de cuarzo','acabados',15,22,['enchape']),
   task(t,'limpieza','Limpieza final y revisión con el cliente','acabados',27,29,['muebles'])],
  milestones:t=>[{id:ms(t,'inicio'),title:'Inicio de obra',offset:0,notes:''},{id:ms(t,'entrega'),title:'Entrega al cliente',offset:30,notes:'Firmar acta de entrega.'}]},
 {key:'casa',name:'Casa de una planta (Ejemplo)',notes:'Etapas generales de una vivienda de 100 a 150 m².',
  phases:[['obra-gris','Obra gris',0],['techos','Techos',1],['acabados','Acabados',2]],
  tasks:t=>[task(t,'trazo','Trazo y excavación','obra-gris',0,5),task(t,'cimientos','Cimientos y placa','obra-gris',6,20,['trazo']),task(t,'paredes','Paredes en block','obra-gris',21,50,['cimientos']),
   task(t,'estructura','Estructura de techo','techos',51,65,['paredes']),task(t,'cubierta','Cubierta y canoas','techos',66,75,['estructura']),
   task(t,'pisos','Pisos y enchapes','acabados',76,100,['cubierta']),task(t,'pintura','Pintura interior y exterior','acabados',101,120,['pisos'])],
  milestones:t=>[{id:ms(t,'permiso'),title:'Permiso de construcción aprobado',offset:-5,notes:''},{id:ms(t,'techo'),title:'Casa techada',offset:75,notes:''},{id:ms(t,'entrega'),title:'Entrega de llaves',offset:130,notes:''}]},
];
const TASKS=[
 {key:'entrega',name:'Lista de entrega de obra (Ejemplo)',notes:'Revisión final antes de entregar al cliente.',tags:['Entrega','Calidad'],
  rows:[['Revisar acabados y retocar pintura',-2],['Probar llaves, desagües y tomacorrientes',-2],['Limpieza final',-1],['Recorrido con el cliente y acta de entrega',0],['Entregar garantías y manuales',0]]},
 {key:'visita',name:'Primera visita al sitio (Ejemplo)',notes:'Pasos para la visita técnica inicial.',tags:['Ventas'],
  rows:[['Confirmar dirección y hora con el cliente',-1],['Tomar medidas y fotos del área',0],['Anotar necesidades y presupuesto aproximado',0],['Enviar cotización',2]]},
];
const CLAUSES=[
 ['objeto','Objeto del contrato','{{empresa.nombre}} se compromete a ejecutar para {{cliente.nombre}} los trabajos de "{{proyecto.nombre}}" en {{proyecto.direccion}}, según la cotización {{cotizacion.codigo}}.'],
 ['pago','Forma de pago','El monto total es {{cotizacion.total}}. Al firmar se paga un anticipo de {{anticipo.porcentaje}} ({{anticipo.monto}}); el saldo se paga contra avance de obra.'],
 ['plazo','Plazo de ejecución','Los trabajos inician en la fecha acordada por ambas partes. Atrasos por lluvia, cambios solicitados por el cliente o falta de materiales del cliente amplían el plazo.'],
 ['cambios','Cambios en la obra','Todo cambio se documenta por escrito con su costo y plazo antes de ejecutarse.'],
 ['garantia','Garantía','La empresa garantiza la mano de obra por doce meses desde la entrega. La garantía de materiales es la del fabricante.'],
];
const CONTRACT_TEMPLATES=[{key:'remodelacion',title:'Contrato de remodelación (Ejemplo)',description:'Plantilla para remodelaciones residenciales.',deposit:30,clauses:['objeto','pago','plazo','cambios','garantia']},
 {key:'mantenimiento',title:'Contrato de mantenimiento (Ejemplo)',description:'Plantilla para servicios de mantenimiento periódico.',deposit:null,clauses:['objeto','pago','garantia']}];
const EMAILS=[
 {key:'seguimiento',name:'Seguimiento de cotización (Ejemplo)',subject:'Seguimiento de su cotización',body:'Buenos días:\n\nLe escribimos para saber si tuvo oportunidad de revisar la cotización que le enviamos. Con gusto le aclaramos cualquier duda.\n\nSaludos cordiales,\nConstructora Ejemplo Valle Central'},
 {key:'visita',name:'Confirmación de visita (Ejemplo)',subject:'Confirmación de visita técnica',body:'Buenos días:\n\nLe confirmamos la visita técnica para revisar el sitio. Si necesita cambiar la hora, por favor responda este correo.\n\nSaludos cordiales,\nConstructora Ejemplo Valle Central'},
 {key:'avance',name:'Informe semanal de avance (Ejemplo)',subject:'Avance semanal de su proyecto',body:'Buenos días:\n\nLe compartimos el avance de esta semana y las tareas previstas para la próxima. Quedamos atentos a sus comentarios.\n\nSaludos cordiales,\nConstructora Ejemplo Valle Central'},
];
const PACKAGES=[
 {key:'bano',name:'Remodelación de baño estándar (Ejemplo)',notes:'Baño de hasta 6 m². Ajuste cantidades en la cotización.',
  lines:[['service','Demolición y retiro de escombros','1','180000','','servicio'],['product','Porcelanato 60×60 instalado','18','24500','POR-6060','m²'],['service','Mano de obra de fontanería','1','220000','','servicio'],['product','Juego de grifería y accesorios','1','145000','','juego']]},
 {key:'pintura',name:'Pintura interior por m² (Ejemplo)',notes:'Incluye una mano de sellador y dos de pintura.',
  lines:[['product','Pintura acrílica blanca, galón','6','15900','PIN-GAL','galón'],['service','Mano de obra de pintura','100','1800','','m²']]},
];

export async function seed(ctx){
 const {db,apply,owner,log}=ctx;
 const app=appModules(`export {scheduleTemplateMutationSchema} from './src/lib/pro/schedule-templates';export {taskTemplateMutationSchema} from './src/lib/pro/task-templates';
export {contractMutationSchema} from './src/lib/pro/contracts';export {emailToolsMutationSchema} from './src/lib/pro/email-tools';export {servicePackageMutationSchema} from './src/lib/pro/service-packages';`);
 const one=(table,filters)=>{let q=db.from(table).select('*');for(const [k,v] of Object.entries(filters))q=q.eq(k,v);return must(table,q.maybeSingle());};
 let writes=0;const rpc=(fn,args)=>must(fn,db.rpc(fn,args));
 const pending=async(table,filters)=>{if(await one(table,filters))return false;writes++;return apply;};
 // Schedule templates (Plantillas › Cronograma).
 for(const t of SCHEDULES){const templateId=uuid(`${S}:schedule:${t.key}`);if(!await pending('pro_schedule_templates',{owner_id:owner,id:templateId}))continue;
  await rpc('pro_schedule_templates_mutate_rules',{p_actor:owner,p_input:app.scheduleTemplateMutationSchema.parse({action:'save',actionId:uuid(`${S}:schedule:${t.key}:save`),templateId,revision:0,name:t.name,notes:t.notes,
   phases:t.phases.map(([k,title,position])=>({id:ph(t.key,k),title,position})),tasks:t.tasks(t.key),milestones:t.milestones(t.key)})});}
 // Task templates with tags.
 for(const t of TASKS){const templateId=uuid(`${S}:tasks:${t.key}`);
  if(await pending('pro_task_templates',{owner_id:owner,id:templateId}))
   await rpc('pro_task_templates_mutate',{p_actor:owner,p_input:app.taskTemplateMutationSchema.parse({action:'save',actionId:uuid(`${S}:tasks:${t.key}:save`),templateId,revision:0,name:t.name,notes:t.notes,
    rows:t.rows.map(([title,dueOffset],i)=>({id:uuid(`${S}:tasks:${t.key}:row:${i+1}`),title,details:'',assignee:'',dueOffset}))})});
  const tags=await must('tags',db.from('pro_task_template_tags').select('tag').eq('owner_id',owner).eq('template_id',templateId).limit(1));
  if(!tags.length&&(writes++,apply)){const cur=await one('pro_task_templates',{owner_id:owner,id:templateId});
   await rpc('pro_task_template_extend',{p_actor:owner,p_input:app.taskTemplateMutationSchema.parse({action:'tags',actionId:uuid(`${S}:tasks:${t.key}:tags`),templateId,revision:cur.revision,tags:t.tags})});}
 }
 // Contract clause library and contract templates (Plantillas › Contratos).
 const clauseId=k=>uuid(`${S}:clause:${k}`);
 for(const [k,title,body] of CLAUSES)if(await pending('pro_contract_library_clauses',{owner_id:owner,id:clauseId(k)}))
  await rpc('pro_contracts_mutate',{p_actor:owner,p_input:app.contractMutationSchema.parse({action:'library_clause_create',actionId:uuid(`${S}:clause:${k}:create`),id:clauseId(k),title,body})});
 for(const t of CONTRACT_TEMPLATES){const id=uuid(`${S}:contract-template:${t.key}`);if(!await pending('pro_contract_templates',{owner_id:owner,id}))continue;
  await rpc('pro_contracts_mutate',{p_actor:owner,p_input:app.contractMutationSchema.parse({action:'template_create',actionId:uuid(`${S}:contract-template:${t.key}:create`),id,title:t.title,description:t.description,depositPercent:t.deposit,libraryClauseIds:t.clauses.map(clauseId)})});}
 // E-mail templates: stored drafts only; nothing is sent.
 for(const e of EMAILS){const id=uuid(`${S}:email:${e.key}`);if(await one('pro_email_templates',{owner_id:owner,name:e.name})||!await pending('pro_email_templates',{owner_id:owner,id}))continue;
  const input=app.emailToolsMutationSchema.parse({action:'template_save',id,revision:0,name:e.name,subject:e.subject,body:e.body,locale:'es'});
  await rpc('pro_email_template_set',{p_actor:owner,p_input:{action:'save',id:input.id,revision:input.revision,name:input.name,subject:input.subject,body:input.body,locale:input.locale}});}
 // Service packages (quote line templates).
 for(const p of PACKAGES){const id=uuid(`${S}:package:${p.key}`);if(!await pending('pro_service_packages',{user_id:owner,id}))continue;
  const revision=(await one('pro_service_package_revisions',{user_id:owner}))?.revision??0;
  await rpc('pro_mutate_service_package',{p_user:owner,p_input:app.servicePackageMutationSchema.parse({action:'save',id,revision,requestId:uuid(`${S}:package:${p.key}:save:${revision}`),
   package:{name:p.name,notes:p.notes,lines:p.lines.map(([kind,description,quantity,unitPrice,sku,unit])=>({kind,description,quantity,unitPrice,sku,unit,cabys:''}))}})});}
 const count=async(table,col,list,ownerCol='owner_id')=>{if(!apply)return list.length;const {count:n,error}=await db.from(table).select('*',{count:'exact',head:true}).eq(ownerCol,owner).in(col,list);if(error)throw new Error(`${table}: ${error.message}`);return n;};
 const c=ctx.counts;
 c.scheduleTemplates=await count('pro_schedule_templates','id',SCHEDULES.map(t=>uuid(`${S}:schedule:${t.key}`)));
 c.taskTemplates=await count('pro_task_templates','id',TASKS.map(t=>uuid(`${S}:tasks:${t.key}`)));
 c.contractClauses=await count('pro_contract_library_clauses','id',CLAUSES.map(([k])=>clauseId(k)));
 c.contractTemplates=await count('pro_contract_templates','id',CONTRACT_TEMPLATES.map(t=>uuid(`${S}:contract-template:${t.key}`)));
 c.emailTemplates=await count('pro_email_templates','id',EMAILS.map(e=>uuid(`${S}:email:${e.key}`)));
 c.servicePackages=await count('pro_service_packages','id',PACKAGES.map(p=>uuid(`${S}:package:${p.key}`)),'user_id');
 log(S,apply?`${writes} writes`:`dry run: ${writes} writes pending`);
}
