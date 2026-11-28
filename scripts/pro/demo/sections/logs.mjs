// Logs: daily logs (Bitácora) with weather, crew summary and notes, and private progress entries (Avances), through
// the same RPCs and zod schemas as /api/pro/daily-logs, /api/pro/work-journal and /api/pro/work-updates.
// Nothing is published or shared: no "publish" action, clientVisible stays false.
// Skipped: work messages (/api/pro/work-messages posts into a customer request thread, which the demo projects do
// not have and which would reach a real customer) and per-person crew (/api/pro/daily-log-crew needs team people).
import {must,uuid,appModules} from '../lib.mjs';

// [project, key, days before today, title, summary, weather [condition, °C, note], crew count, crew hours]
const LOGS=[
 ['p1','d1',12,'Demolición de cocina','Se retiraron muebles, enchape y fregadero. Escombros enviados al contenedor; se protegió el piso del pasillo.',['clear',27,'Mañana soleada.'],4,32],
 ['p1','d2',9,'Fontanería nueva','Se instaló la tubería de agua fría y caliente de la cocina y el desagüe del baño. Prueba de presión sin fugas.',['cloudy',24,'Nublado, sin lluvia.'],2,16],
 ['p1','d3',5,'Enchape del baño','Avance del 60 % del enchape de paredes. Falta la franja decorativa que llega el lunes.',['rain',21,'Aguacero por la tarde; se trabajó solo en interiores.'],3,24],
 ['p5','d1',14,'Colado de placa corrida','Colado de 18 m³ de concreto de 210 kg/cm² con bomba. Se curará durante siete días.',['clear',29,'Soleado y seco, buen día para colar.'],7,56],
 ['p5','d2',8,'Paredes de block','Se levantaron las paredes del dormitorio principal y la sala hasta la altura de ventanas.',['cloudy',25,'Nublado parcial.'],6,48],
 ['p5','d3',3,'Inspección de vigas de amarre','El ingeniero responsable revisó el armado de las vigas y aprobó el colado para la próxima semana.',['rain',22,'Lluvia intermitente en Grecia; se cubrió el acero con plástico.'],5,30],
];
const UPDATES=[
 ['p1','u1','Avance de la semana','La demolición terminó y la fontanería nueva quedó probada. Esta semana se avanza con el enchape del baño.'],
 ['p2','u1','Permiso aprobado','La municipalidad aprobó el permiso de construcción. La estructura metálica se fabrica en taller.'],
 ['p5','u1','Obra gris en marcha','La placa corrida está colada y las paredes alcanzan la altura de ventanas en el área social.'],
 ['p5','u2','Próximos pasos','Colado de vigas de amarre después de la inspección; luego se inicia la estructura del techo.'],
];

export async function seed(ctx){
 const {db,apply,owner,anchor,log}=ctx,S='logs';
 const app=appModules("export {dailyLogMutationSchema} from './src/lib/pro/daily-logs';export {workJournalMutationSchema} from './src/lib/pro/work-journal';export {workUpdateMutationSchema} from './src/lib/pro/work-updates';");
 const today=new Date(Date.now()-6*3600000).toISOString().slice(0,10),base=anchor<today?anchor:today;
 const day=n=>new Date(new Date(`${base}T00:00:00Z`).getTime()-n*86400000).toISOString().slice(0,10);
 const rpc=(label,fn,args)=>must(label,db.rpc(fn,args));
 const works=new Set((await must('works',db.from('pro_work').select('id').eq('user_id',owner))).map(r=>r.id));
 const logs=LOGS.filter(([k])=>works.has(`ejemplo-${k}`)),updates=UPDATES.filter(([k])=>works.has(`ejemplo-${k}`));
 const done={logs:0,crew:0,updates:0};

 // Daily logs: capture an empty snapshot (weather section only) to get the fingerprint the writer checks.
 const ids=logs.map(([k,d])=>uuid(`logs:${k}:${d}`));
 const have=Object.fromEntries((await must('daily logs',db.from('pro_daily_logs').select('id,revision,crew_count,client_visible').eq('owner_id',owner).in('id',ids))).map(r=>[r.id,r]));
 for(const [k,d,ago,title,summary,[condition,temperatureC,note],crew,hours] of logs){
  const workId=`ejemplo-${k}`,logId=uuid(`logs:${k}:${d}`),date=day(ago);let row=have[logId];
  if(!row){done.logs++;if(!apply){done.crew++;continue;}
   const snapshot=await rpc('snapshot','pro_daily_log_snapshot',{p_actor:owner,p_work:workId,p_grant:null,p_date:date,p_tasks:[],p_plan:[],p_time:false});
   const r=await rpc('daily log '+k+d,'pro_daily_logs_mutate',{p_actor:owner,p_input:app.dailyLogMutationSchema.parse({action:'create',workId,grantId:null,actionId:uuid(`logs:${k}:${d}:create`),logId,revision:0,
    date,title:`${title} (Ejemplo)`,summary,sections:{weather:true,plan:false,tasks:false,time:false},weather:{condition,temperatureC,note},source:{mode:'capture',taskIds:[],planTaskIds:[],fingerprint:snapshot.fingerprint}})});
   row={revision:r.log.revision,crew_count:null};
  }
  if(row.crew_count===null){done.crew++;if(apply)await rpc('crew '+k+d,'pro_work_journal_mutate',{p_actor:owner,p_input:app.workJournalMutationSchema.parse({action:'journal_set',actionId:uuid(`logs:${k}:${d}:crew:r${row.revision}`),workId,logId,revision:row.revision,clientVisible:false,crewCount:crew,crewMinutes:hours*60})});}
 }

 // Avances: private entries (never published). The database mirrors each one into the Bitácora as a private entry.
 const uids=updates.map(([k,u])=>uuid(`logs:update:${k}:${u}`));
 const haveUpdates=new Set((await must('updates',db.from('pro_work_updates').select('id').eq('owner_id',owner).in('id',uids))).map(r=>r.id));
 for(const [k,u,title,text] of updates){
  const entryId=uuid(`logs:update:${k}:${u}`);if(haveUpdates.has(entryId))continue;done.updates++;
  if(apply)await rpc('update '+k+u,'pro_work_updates_mutate',{p_actor:owner,p_input:app.workUpdateMutationSchema.parse({action:'create',workId:`ejemplo-${k}`,entryId,actionId:uuid(`logs:update:${k}:${u}:create`),revision:0,title:`${title} (Ejemplo)`,text})});
 }
 Object.assign(ctx.counts,{daily_logs:logs.length,work_updates:updates.length});
 log(S,`${apply?'written':'would write'}: ${JSON.stringify(done)}; work messages skipped (customer thread only)`);
}
