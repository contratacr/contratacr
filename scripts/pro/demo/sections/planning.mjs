// Planning: project details (colour, type, code, budget, addresses, tags), the type/tag/status catalogues, hub
// status and pin, and owner-private notes and calls. Same RPCs and zod schemas as /api/pro/project-details,
// /api/pro/projects-hub and /api/pro/project-notes. Nothing here is sent, dialled or shared.
import {must,uuid,appModules} from '../lib.mjs';
import {CLIENTS,PROJECTS} from './core.mjs';

const TYPE_CUSTOM={key:'acabados',name:'Acabados interiores (Ejemplo)'};
const STATUSES=[['ejecucion','En ejecución','green'],['materiales','Esperando materiales','amber'],['revision','Revisión con el cliente','purple'],['entregado','Entregado','gray']];
// [project, colour, type, code, budget ₡, tags, hub status, pinned]
const DETAILS=[
 ['p1','blue','remodel','EJ-2026-001',4600000,['Cocina','Baño','Escazú'],'ejecucion',true],
 ['p2','teal','addition','EJ-2026-002',2100000,['Terraza','Estructura metálica'],'materiales',false],
 ['p3','orange','commercial','EJ-2026-003',3400000,['Local comercial','Heredia'],'revision',false],
 ['p4','gray','maintenance','EJ-2026-004',1600000,['Condominio','Mantenimiento'],'entregado',false],
 ['p5','green','new_construction','EJ-2026-005',70000000,['Casa nueva','Llave en mano','Grecia'],'ejecucion',true],
 ['p6','amber',TYPE_CUSTOM.key,'EJ-2026-006',3300000,['Pisos','Pintura'],null,false],
 ['p7','purple','commercial','EJ-2026-007',5200000,['Consultorio','Moravia'],'revision',false],
];
// [project, key, kind, body, days before today, time, call {minutes, direction, contact}, pinned]
const NOTES=[
 ['p1','n1','note','La clienta confirmó el sobre de cuarzo blanco Calacatta. Se pidió al proveedor con entrega estimada en 10 días hábiles. (Ejemplo)',9,'09:15',null,true],
 ['p1','n2','call','Se coordinó con la Sra. Rojas el corte de agua para el jueves de 8:00 a 12:00 y el acceso por el portón lateral. (Ejemplo)',6,'14:30',{minutes:12,direction:'outbound',contact:'Familia Rojas Vargas (Ejemplo)'},false],
 ['p1','n3','note','Recordatorio interno: proteger el piso de madera del pasillo antes de sacar escombros. (Ejemplo)',4,'07:40',null,false],
 ['p2','n1','note','La municipalidad de Curridabat solicita el visado del CFIA antes de iniciar la estructura metálica. (Ejemplo)',5,'10:00',null,true],
 ['p2','n2','call','La clienta preguntó si la cubierta de policarbonato puede ser color bronce. Se le enviará la muestra en la próxima visita. (Ejemplo)',3,'16:10',{minutes:8,direction:'inbound',contact:'Mariana Solís Chaves (Ejemplo)'},false],
 ['p3','n1','note','El local solo permite trabajos de 6:00 p. m. a 6:00 a. m.; considerarlo en la cotización de mano de obra. (Ejemplo)',7,'11:20',null,false],
 ['p5','n1','note','Inspección del ingeniero responsable aprobada para el colado de vigas de amarre. (Ejemplo)',8,'15:45',null,true],
 ['p5','n2','call','Se revisó con el Sr. Mora el avance de obra gris y la fecha estimada para el techo. (Ejemplo)',2,'08:30',{minutes:20,direction:'outbound',contact:'Andrés Mora Jiménez (Ejemplo)'},false],
 ['p7','n1','call','La administradora de la clínica solicitó visita técnica para medir el consultorio. (Ejemplo)',1,'13:00',{minutes:6,direction:'inbound',contact:'Clínica Dental Sonrisa (Ejemplo)'},false],
];

export async function seed(ctx){
 const {db,apply,owner,log}=ctx,S='planning';
 const app=appModules("export {detailsMutationSchema} from './src/lib/pro/project-details';export {noteMutationSchema} from './src/lib/pro/project-notes';export {hubMutationSchema} from './src/lib/pro/projects-hub';");
 const today=new Date(Date.now()-6*3600000).toISOString().slice(0,10),base=ctx.anchor<today?ctx.anchor:today;
 const localMinute=(days,hhmm)=>`${new Date(new Date(`${base}T00:00:00Z`).getTime()-days*86400000).toISOString().slice(0,10)}T${hhmm}`;
 const rpc=(label,fn,args)=>must(label,db.rpc(fn,args));
 const wid=k=>`ejemplo-${k}`;
 const works=new Set((await must('works',db.from('pro_work').select('id').eq('user_id',owner))).map(r=>r.id));
 const projects=DETAILS.filter(([k])=>works.has(wid(k)));
 if(projects.length<DETAILS.length)log(S,`${DETAILS.length-projects.length} projects missing from pro_work (core not applied?)`);
 const done={statuses:0,types:0,details:0,hub:0,notes:0};

 // 1. Hub statuses (deterministic ids; status_create is "insert … on conflict do nothing").
 const statusIds=Object.fromEntries(STATUSES.map(([k])=>[k,uuid(`planning:status:${k}`)]));
 const haveStatuses=new Set((await must('statuses',db.from('pro_project_statuses').select('id').eq('owner_id',owner))).map(r=>r.id));
 for(const [k,name,color] of STATUSES)if(!haveStatuses.has(statusIds[k])){done.statuses++;if(apply)await rpc('status '+k,'pro_project_hub_mutate',{p_actor:owner,p_input:app.hubMutationSchema.parse({action:'status_create',id:statusIds[k],name,color})});}

 // 2. Types: system types come from the catalogue read; one custom type through type_create (catalogue CAS).
 let catalog=(await rpc('catalog','pro_project_details_read',{p_actor:owner,p_query:{view:'catalog'}})).catalog;
 const customId=uuid(`planning:type:${TYPE_CUSTOM.key}`);
 if(!catalog.types.some(t=>t.id===customId)){done.types++;
  if(apply)catalog=(await rpc('type','pro_project_details_mutate',{p_actor:owner,p_input:app.detailsMutationSchema.parse({action:'type_create',actionId:uuid(`planning:type-action:${TYPE_CUSTOM.key}`),catalogRevision:catalog.revision,id:customId,name:TYPE_CUSTOM.name})})).catalog;}
 const typeId=key=>key===TYPE_CUSTOM.key?customId:catalog.types.find(t=>t.systemKey===key)?.id??null;

 // 3. Details per project (created once; a project the user already edited is left alone).
 const haveDetails=new Set((await must('details',db.from('pro_project_details').select('work_id').eq('owner_id',owner))).map(r=>r.work_id));
 for(const [k,color,type,code,budget,tags] of projects){
  if(haveDetails.has(wid(k)))continue;done.details++;if(!apply)continue;
  const p=PROJECTS.find(x=>x.key===k),client=CLIENTS.find(c=>c.key===p.client);
  await rpc('details '+k,'pro_project_details_mutate',{p_actor:owner,p_input:app.detailsMutationSchema.parse({action:'save',actionId:uuid(`planning:details:${k}`),workId:wid(k),revision:0,
   color,typeId:typeId(type),code,budgetCents:budget*100,address:client.address,billingAddress:null,shippingAddress:null,defaultVatCode:'08',tags})});
 }

 // 4. Hub state: custom status and pin (upserts; only sent when different).
 const state=Object.fromEntries((await must('hub',db.from('pro_project_hub_state').select('work_id,status_id,pinned').eq('owner_id',owner))).map(r=>[r.work_id,r]));
 for(const [k,,,,,,status,pinned] of projects){
  const cur=state[wid(k)],want=status?statusIds[status]:null;
  if(want&&cur?.status_id!==want){done.hub++;if(apply)await rpc('status_set '+k,'pro_project_hub_mutate',{p_actor:owner,p_input:app.hubMutationSchema.parse({action:'status_set',workId:wid(k),statusId:want})});}
  if(pinned&&!cur?.pinned){done.hub++;if(apply)await rpc('pin '+k,'pro_project_hub_mutate',{p_actor:owner,p_input:app.hubMutationSchema.parse({action:'pin',workId:wid(k),pinned:true})});}
 }
 // Managers: the hub only accepts active team members (pro_team_grants); the owner is not one. Assigned only
 // when the team section already created a member; otherwise skipped.
 const grants=await must('grants',db.from('pro_team_grants').select('member_user_id').eq('owner_id',owner).eq('active',true).limit(1));
 if(grants.length){for(const k of ['p1','p5'])if(works.has(wid(k))){
  const has=await must('managers',db.from('pro_project_managers').select('work_id').eq('owner_id',owner).eq('work_id',wid(k)));
  if(!has.length&&apply)await rpc('managers '+k,'pro_project_hub_mutate',{p_actor:owner,p_input:app.hubMutationSchema.parse({action:'managers',workId:wid(k),memberIds:[grants[0].member_user_id]})});}}
 else log(S,'managers skipped: no active team member to assign');

 // 5. Notes and calls (past Costa Rica minutes; the server rejects future entries).
 const noteRows=NOTES.filter(([k])=>works.has(wid(k)));
 const haveNotes=Object.fromEntries((await must('notes',db.from('pro_project_notes').select('id,pinned,revision').eq('owner_id',owner).in('id',noteRows.map(([k,n])=>uuid(`planning:note:${k}:${n}`))))).map(r=>[r.id,r]));
 for(const [k,n,kind,body,days,hhmm,call,pin] of noteRows){
  const id=uuid(`planning:note:${k}:${n}`);let row=haveNotes[id];
  if(!row){done.notes++;if(!apply)continue;
   row=(await rpc('note '+k+n,'pro_project_notes_mutate',{p_actor:owner,p_input:app.noteMutationSchema.parse({action:'create',actionId:uuid(`planning:note-action:${k}:${n}`),workId:wid(k),id,kind,body,occurredAt:localMinute(days,hhmm),
    durationMinutes:call?.minutes??null,direction:call?.direction??null,contact:call?.contact??null})})).note;}
  if(pin&&!row.pinned&&apply)await rpc('pin note','pro_project_notes_mutate',{p_actor:owner,p_input:app.noteMutationSchema.parse({action:'pin',actionId:uuid(`planning:note-pin:${k}:${n}:${row.revision}`),workId:wid(k),id,revision:row.revision})});
 }

 Object.assign(ctx.counts,{project_statuses:STATUSES.length,project_types_custom:1,project_details:projects.length,project_notes:noteRows.length});
 log(S,`${apply?'written':'would write'}: ${JSON.stringify(done)}`);
}
