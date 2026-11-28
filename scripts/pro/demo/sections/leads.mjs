// Leads (Houzz «Leads»): manual opportunities across the six built-in stages, one snoozed and one lost, with origin
// channel, assignee (the owner), expected close date, tags, follow-ups and private log notes. Every write goes through
// the same RPC the /api/pro lead routes call, with deterministic action ids: a rerun is skipped (receipt present).
// None of these writers enqueues notifications, reminders or e-mail (checked on the function bodies and triggers).
import {uuid,must,crDate} from '../lib.mjs';

const CHANNEL={id:uuid('leads:channel:feria'),name:'Feria de construcción (Ejemplo)'};
// [key,client,title,stage,channel,revenue CRC,type,close day,tags,notes,followup [day,note]|null,extra]
const LEADS=[
 ['l1','c6','Remodelación de baño secundario (Ejemplo)','new','website',1800000,'Baños',40,['Baños','Residencial'],['Solicitud recibida por el sitio web. Pidió visita un sábado.'],[2,'Llamar para coordinar la visita técnica.']],
 ['l2','c3','Cielo raso y pintura de bodega (Ejemplo)','new','advertising',2600000,'Comercial',55,['Comercial'],['Llegó por el anuncio en redes. Pendiente confirmar medidas.'],null],
 ['l3','c2','Pérgola de madera en jardín (Ejemplo)','followed_up','referral',2200000,'Exteriores',35,['Exteriores','Referido'],['Referida por la familia Rojas Vargas. Se le envió un mensaje de seguimiento.'],[4,'Confirmar si desea madera tratada o metal.']],
 ['l4','c7','Rampa de acceso y baño accesible (Ejemplo)','connected','direct',3400000,'Accesibilidad',30,['Comercial','Accesibilidad'],['Conversación inicial por teléfono: necesitan cumplir la Ley 7600.'],null],
 ['l5','c4','Impermeabilización de techos del condominio (Ejemplo)','meeting_scheduled','feria',7900000,'Techos',25,['Condominios','Prioridad alta'],['Reunión con la administración agendada para revisar filtraciones.'],[6,'Llevar muestras de membrana asfáltica a la reunión.']],
 ['l6','c1','Cocina exterior con parrilla (Ejemplo)','estimate_sent','referral',4100000,'Cocinas',20,['Residencial','Cliente recurrente'],['Se envió el estimado. El cliente compara dos opciones de sobre.'],null],
 ['l7','c5','Muro perimetral y portón eléctrico (Ejemplo)','estimate_sent','social',5600000,'Exteriores',15,['Residencial'],['Estimado enviado; pidió ajustar el tipo de portón.'],null],
 ['l8','c3','Mantenimiento preventivo del local (Ejemplo)','won','website',1500000,'Mantenimiento',-5,['Comercial','Contrato anual'],['Aceptó la propuesta de mantenimiento trimestral.'],null,{won:'relationship'}],
 ['l9','c6','Cambio de ventanería (Ejemplo)','connected','other',2900000,'Ventanas',70,['Residencial'],['El cliente pidió retomar el tema después de vacaciones.'],null,{snooze:[21,'Retomar en enero, cuando regrese de vacaciones.']}],
 ['l10','c2','Ampliación de cochera (Ejemplo)','estimate_sent','direct',3200000,'Ampliaciones',-10,['Residencial'],['El cliente decidió posponer la obra por presupuesto.'],null,{lost:['price','Eligió posponer la obra; quedó en volver a llamar el próximo año.']}],
];

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const rpc=(name,args)=>must(name,db.rpc(name,args));
 const has=async(table,aid)=>!!(await must(table,db.from(table).select('action_id').eq('owner_id',owner).eq('action_id',aid).limit(1))).length;
 let made=0,kept=0;
 // Runs a writer once: its deterministic action id is the idempotency key (the receipt table says it already ran).
 const once=async(table,aid,run)=>{if(await has(table,aid)){kept++;return false;}if(apply){await run();made++;}return true;};
 const counts={leads:0,leadOrigins:0,leadAssignees:0,leadCloseDates:0,leadNotes:0,leadTags:0,leadFollowups:0,leadSnoozed:0,leadOutcomes:0,leadChannels:0};
 const catalog=async()=>(await rpc('pro_lead_origin_stage_catalog',{p_actor:owner})).revision;

 // Custom origin channel (the rest are the built-in channels: direct, referral, website, social, advertising, other).
 await once('pro_lead_origin_actions',uuid('leads:channel:create'),()=>rpc('pro_lead_origin_mutate',{p_actor:owner,p_input:{action:'channel_create',actionId:uuid('leads:channel:create'),channelId:CHANNEL.id,revision:0,name:CHANNEL.name}}));
 counts.leadChannels++;
 const channels={};
 if(apply)for(const c of (await rpc('pro_lead_origin_channels_read',{p_actor:owner,p_status:'active',p_query:'',p_after:null,p_snapshot:null})).items)channels[c.id]=c.revision;

 for(const [key,client,title,stage,channel,revenue,type,closeDay,tags,notes,followup,extra={}] of LEADS){
  const id=uuid(`leads:${key}`),a=step=>uuid(`leads:${key}:${step}`);
  await once('pro_lead_center_actions',a('create'),async()=>rpc('pro_lead_center_mutate',{p_actor:owner,p_input:{action:'create',actionId:a('create'),kind:'manual',id,revision:0,catalogRevision:await catalog(),
   clientId:`ejemplo-${client}`,title,description:`${notes[0]} Datos ficticios de ejemplo.`,address:'',sourceLabel:'',
   forecast:{projectType:type,expectedStart:crDate(anchor,closeDay+15),currency:'CRC',revenueCents:revenue*100,budgetCents:Math.round(revenue*0.7)*100,profitCents:Math.round(revenue*0.3)*100},stageMode:'manual',stageId:stage}}));
  counts.leads++;
  const chId=channel==='feria'?CHANNEL.id:channel;
  await once('pro_lead_origin_actions',a('origin'),()=>rpc('pro_lead_origin_mutate',{p_actor:owner,p_input:{action:'assign',actionId:a('origin'),kind:'manual',id,revision:0,channelId:chId,channelRevision:channels[chId]??0}}));
  counts.leadOrigins++;
  await once('pro_lead_assignment_actions',a('assign'),()=>rpc('pro_lead_assign',{p_actor:owner,p_input:{actionId:a('assign'),kind:'manual',id,assigneeId:owner,revision:0}}));
  counts.leadAssignees++;
  await once('pro_lead_close_date_actions',a('close'),()=>rpc('pro_lead_close_date_mutate',{p_owner:owner,p_input:{actionId:a('close'),kind:'manual',id,revision:0,closeOn:crDate(anchor,closeDay)},p_member:null}));
  counts.leadCloseDates++;
  for(const [n,body] of notes.entries()){
   await once('pro_lead_log',a(`note${n}`),()=>rpc('pro_lead_log_mutate',{p_owner:owner,p_input:{action:'add',actionId:a(`note${n}`),id:a(`note${n}:entry`),kind:'manual',leadId:id,entry:'note',outcome:null,body}}));
   counts.leadNotes++;
  }
  if(key==='l4'){await once('pro_lead_log',a('call'),()=>rpc('pro_lead_log_mutate',{p_owner:owner,p_input:{action:'add',actionId:a('call'),id:a('call:entry'),kind:'manual',leadId:id,entry:'call',outcome:'good_discussion',body:'Llamada de 15 minutos: se acordó enviar opciones de rampa.'}}));counts.leadNotes++;}
  const existing=apply?new Set((await must('lead tags',db.from('pro_lead_tags').select('tag').eq('owner_id',owner).eq('lead_id',id))).map(t=>t.tag)):new Set();
  for(const tag of tags){if(!existing.has(tag)&&apply)await rpc('pro_lead_log_mutate',{p_owner:owner,p_input:{action:'tag_add',kind:'manual',leadId:id,tag}});counts.leadTags++;}
  if(followup){
   await once('pro_lead_followup_actions',a('followup'),()=>rpc('pro_lead_followup_mutate',{p_actor:owner,p_input:{action:'save',leadId:id,actionId:a('followup'),revision:0,dueDate:crDate(anchor,followup[0]),note:followup[1]}}));
   counts.leadFollowups++;
  }
  if(extra.snooze){
   await once('pro_lead_inbox_actions',a('snooze'),()=>rpc('pro_lead_inbox_mutate',{p_actor:owner,p_input:{action:'snooze',actionId:a('snooze'),kind:'manual',id,revision:0,until:crDate(anchor,extra.snooze[0]),note:extra.snooze[1]}}));
   counts.leadSnoozed++;
  }
  const outcome=extra.lost?['lost',...extra.lost]:extra.won?['won',extra.won,'Firmó el contrato de mantenimiento anual.']:null;
  if(outcome){
   await once('pro_lead_outcome_actions',a('outcome'),()=>rpc('pro_lead_board_mutate',{p_owner:owner,p_input:{action:'outcome',actionId:a('outcome'),kind:'manual',id,revision:0,outcome:outcome[0],reason:outcome[1],note:outcome[2]},p_member:null}));
   counts.leadOutcomes++;
  }
 }
 Object.assign(ctx.counts,counts);
 log('leads',apply?`${made} writes, ${kept} already present`:`dry run: ${kept} steps already present, the rest would be written`);
}
