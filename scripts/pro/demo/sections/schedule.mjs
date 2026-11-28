// Schedule: job tasks (Tareas), phases, planned periods with dependencies, milestones, a baseline (Cronograma) and
// punch-list items, through the same RPCs and zod schemas as /api/pro/work-tasks, work-schedule, project-schedule,
// work-punchlist and project-extras (task tags). Every write is "create if missing"; the schedule revision is read
// fresh from pro_work_schedule_heads and carried forward, so reruns write nothing.
import {must,uuid,appModules,crDate} from '../lib.mjs';
import {PROJECTS} from './core.mjs';

// Per project: phases [key,title]; tasks [key,phase,title,startOffset,endOffset,deps,status,assignee,tags,details];
// milestones [key,title,offset,notes]; punch [key,title,dueOffset,status,assignee]; baseline title; delay [task,days].
const PLANS={
 p1:{phases:[['f1','Demolición y preparación'],['f2','Instalaciones'],['f3','Acabados']],
  tasks:[
   ['t1','f1','Demolición de cocina y baño',0,3,[],'done','Cuadrilla de José','Demolición','Retirar muebles, enchapes y piezas sanitarias; escombros a contenedor.'],
   ['t2','f2','Fontanería nueva de cocina y baño',4,9,['t1'],'done','Fontanero Luis','Fontanería','Tubería PVC de 1/2" y desagües nuevos según plano.'],
   ['t3','f2','Revisión eléctrica y tomacorrientes',4,8,['t1'],'open','Electricista Mario','Electricidad','Circuito independiente para la cocina.'],
   ['t4','f3','Enchape de baño en porcelanato',10,16,['t2'],'open','Cuadrilla de José','Acabados',''],
   ['t5','f3','Instalación de muebles y sobre de cuarzo',17,24,['t3','t4'],'open','Taller de muebles','Acabados,Cocina','Verificar niveles antes de colocar el sobre.'],
   ['t6','f3','Limpieza final y entrega',25,27,['t5'],'open','','Entrega',''],
  ],
  milestones:[['m1','Fin de demolición',3,'Revisión con la clienta.'],['m2','Entrega de cocina y baño',27,'Firma de constancia de entrega.']],
  punch:[['k1','Sellar unión del lavatorio con silicón',26,'open','Fontanero Luis'],['k2','Ajustar bisagra del mueble aéreo',26,'done','Taller de muebles'],['k3','Retocar pintura junto al tomacorriente',27,'open','Cuadrilla de José']],
  baseline:'Línea base inicial (Ejemplo)',delay:['t4',2]},
 p2:{phases:[['f1','Permisos'],['f2','Estructura y cubierta']],
  tasks:[
   ['t1','f1','Visado del CFIA y permiso municipal',0,7,[],'done','Oficina','Permisos','Trámite ante la Municipalidad de Curridabat.'],
   ['t2','f2','Fundaciones y columnas metálicas',8,13,['t1'],'open','Cuadrilla de Pedro','Estructura',''],
   ['t3','f2','Cubierta de policarbonato',14,18,['t2'],'open','Cuadrilla de Pedro','Cubierta',''],
   ['t4','f2','Piso de concreto lujado e iluminación LED',19,24,['t3'],'open','Electricista Mario','Acabados,Electricidad',''],
  ],
  milestones:[['m1','Permiso aprobado',7,''],['m2','Terraza terminada',24,'Entrega a la clienta.']],punch:[],baseline:null,delay:null},
 p5:{phases:[['f1','Obra gris'],['f2','Techo'],['f3','Instalaciones'],['f4','Acabados']],
  tasks:[
   ['t1','f1','Fundaciones y placa corrida',0,15,[],'done','Maestro de obras Carlos','Obra gris','Concreto de 210 kg/cm².'],
   ['t2','f1','Paredes de block y vigas de amarre',16,45,['t1'],'open','Maestro de obras Carlos','Obra gris',''],
   ['t3','f2','Estructura de techo y cubierta',46,60,['t2'],'open','Cuadrilla de techos','Techo',''],
   ['t4','f3','Sistema eléctrico y fontanería',50,80,['t2'],'open','Electricista Mario','Electricidad,Fontanería',''],
   ['t5','f4','Repellos, enchapes y pintura',81,130,['t3','t4'],'open','Cuadrilla de acabados','Acabados',''],
   ['t6','f4','Limpieza y entrega de llaves',131,140,['t5'],'open','','Entrega',''],
  ],
  milestones:[['m1','Colado de vigas de amarre',45,'Requiere inspección del ingeniero.'],['m2','Casa techada',60,''],['m3','Entrega de llaves',140,'']],
  punch:[],baseline:'Línea base del contrato (Ejemplo)',delay:null},
};

export async function seed(ctx){
 const {db,apply,owner,anchor,log}=ctx,S='schedule';
 const app=appModules("export {workTaskMutationSchema} from './src/lib/pro/work-tasks';export {workScheduleMutationSchema} from './src/lib/pro/work-schedule';export {baselineMutationSchema} from './src/lib/pro/project-schedule';export {punchMutationSchema} from './src/lib/pro/work-punchlist';export {taskExtrasSchema} from './src/lib/pro/project-extras';");
 const rpc=(label,fn,args)=>must(label,db.rpc(fn,args));
 const works=new Set((await must('works',db.from('pro_work').select('id').eq('user_id',owner))).map(r=>r.id));
 const done={phases:0,tasks:0,completed:0,plans:0,tags:0,milestones:0,baselines:0,punch:0};
 const totals={schedule_phases:0,work_tasks:0,schedule_plans:0,schedule_dependencies:0,milestones:0,baselines:0,punch_items:0};
 for(const [k,plan] of Object.entries(PLANS)){
  const workId=`ejemplo-${k}`;if(!works.has(workId)){log(S,`${workId} missing (core not applied?)`);continue;}
  const start=PROJECTS.find(p=>p.key===k).day,day=o=>crDate(anchor,start+o);
  const id=(kind,key)=>uuid(`schedule:${k}:${kind}:${key}`);
  const q=(t,extra='')=>must(t,db.from(t).select(`id${extra}`).eq('owner_id',owner).eq('work_id',workId));
  let rev=(await must('head',db.from('pro_work_schedule_heads').select('revision').eq('owner_id',owner).eq('work_id',workId).maybeSingle()))?.revision??0;
  const schedule=async(label,input)=>{const r=await rpc(label,input.action.startsWith('milestone_')?'pro_work_milestones_mutate':'pro_work_schedule_mutate',{p_actor:owner,p_input:app.workScheduleMutationSchema.parse({...input,workId,revision:rev})});rev=r.revision;return r;};
  totals.schedule_phases+=plan.phases.length;totals.work_tasks+=plan.tasks.length+plan.punch.length;totals.schedule_plans+=plan.tasks.length;
  totals.schedule_dependencies+=plan.tasks.reduce((n,t)=>n+t[5].length,0);totals.milestones+=plan.milestones.length;totals.baselines+=plan.baseline?1:0;totals.punch_items+=plan.punch.length;

  // Phases.
  const phases=new Set((await q('pro_work_schedule_phases')).map(r=>r.id));
  for(const [pk,title] of plan.phases.map(([pk,t])=>[pk,`${t} (Ejemplo)`]))if(!phases.has(id('phase',pk))){done.phases++;
   if(apply)await schedule('phase '+pk,{action:'phase_save',actionId:id('phase-action',pk),phaseId:id('phase',pk),title,position:plan.phases.findIndex(p=>p[0]===pk)});}
  // Tasks (in dependency order), their plan, status and tags.
  const tasks=Object.fromEntries((await must('tasks',db.from('pro_work_tasks').select('id,status,revision,archived').eq('owner_id',owner).eq('work_id',workId))).map(r=>[r.id,r]));
  const plans=new Set((await must('plans',db.from('pro_work_schedule_plans').select('task_id').eq('owner_id',owner).eq('work_id',workId))).map(r=>r.task_id));
  const tagged=new Set((await must('extras',db.from('pro_work_extras').select('key').eq('owner_id',owner).eq('work_id',workId).eq('kind','task'))).map(r=>r.key));
  for(const [tk,pk,title,s,e,deps,status,assignee,tags,details] of plan.tasks){
   const taskId=id('task',tk);let task=tasks[taskId];
   if(!task){done.tasks++;if(apply)task=(await rpc('task '+tk,'pro_work_tasks_mutate',{p_actor:owner,p_input:app.workTaskMutationSchema.parse({action:'create',workId,taskId,actionId:id('task-action',tk),revision:0,title:`${title} (Ejemplo)`,details,dueDate:day(e),assignee})})).task;}
   if(!plans.has(taskId)){done.plans++;if(apply)await schedule('plan '+tk,{action:'task_plan',actionId:id('plan-action',tk),taskId,phaseId:id('phase',pk),plannedStart:day(s),plannedEnd:day(e),dependsOn:deps.map(d=>id('task',d))});}
   if(status==='done'&&task?.status==='open'&&!task.archived){done.completed++;if(apply)await rpc('complete '+tk,'pro_work_tasks_mutate',{p_actor:owner,p_input:app.workTaskMutationSchema.parse({action:'complete',workId,taskId,actionId:id(`complete-action-r${task.revision}`,tk),revision:task.revision})});}
   if(!task&&status==='done')done.completed++;
   if(tags&&!tagged.has(taskId)){done.tags++;if(apply)await rpc('tags '+tk,'pro_work_extras_set',{p_actor:owner,p_work:workId,p_kind:'task',p_key:taskId,p_revision:0,p_data:app.taskExtrasSchema.parse({tags:tags.split(',')})});}
  }
  // Milestones.
  const milestones=new Set((await q('pro_work_schedule_milestones')).map(r=>r.id));
  for(const [mk,title,o,notes] of plan.milestones)if(!milestones.has(id('milestone',mk))){done.milestones++;
   if(apply)await schedule('milestone '+mk,{action:'milestone_save',actionId:id('milestone-action',mk),milestoneId:id('milestone',mk),title:`${title} (Ejemplo)`,date:day(o),notes});}
  // Baseline (captures the plan as it is now); on its first creation one task is re-planned later to show a variance.
  if(plan.baseline){
   const have=await must('baselines',db.from('pro_work_schedule_baselines').select('id').eq('owner_id',owner).eq('work_id',workId).eq('title',plan.baseline));
   if(!have.length){done.baselines++;
    if(apply){await rpc('baseline '+k,'pro_work_schedule_baseline_mutate',{p_actor:owner,p_input:app.baselineMutationSchema.parse({action:'baseline_save',actionId:id('baseline-action','b1'),workId,revision:rev,title:plan.baseline})});
     if(plan.delay){const [tk,days]=plan.delay,t=plan.tasks.find(x=>x[0]===tk);
      await schedule('delay '+tk,{action:'task_plan',actionId:id('delay-action',tk),taskId:id('task',tk),phaseId:id('phase',t[1]),plannedStart:day(t[3]+days),plannedEnd:day(t[4]+days),dependsOn:t[5].map(d=>id('task',d))});}}}
  }
  // Punch list (closing items; no photo, nothing is shared with the client).
  const punch=new Set((await must('punch',db.from('pro_work_punch_items').select('task_id').eq('owner_id',owner).eq('work_id',workId))).map(r=>r.task_id));
  for(const [pk,title,o,status,assignee] of plan.punch){
   const taskId=id('punch',pk);
   if(!punch.has(taskId)){done.punch++;if(apply)await rpc('punch '+pk,'pro_work_punchlist_mutate',{p_actor:owner,p_input:app.punchMutationSchema.parse({action:'create',actionId:id('punch-action',pk),workId,taskId,title:`${title} (Ejemplo)`,details:'',dueDate:day(o),assignee,photoFileId:null,photoRequired:false})});}
   if(status!=='done')continue;
   const t=apply?await must('punch task',db.from('pro_work_tasks').select('status,revision').eq('owner_id',owner).eq('id',taskId).maybeSingle()):tasks[taskId];
   if(!t){done.completed++;continue;}
   if(t.status==='open'){done.completed++;if(apply)await rpc('punch done '+pk,'pro_work_punchlist_mutate',{p_actor:owner,p_input:app.punchMutationSchema.parse({action:'complete',actionId:id(`punch-done-r${t.revision}`,pk),workId,taskId,taskRevision:t.revision})});}
  }
 }
 Object.assign(ctx.counts,totals);
 log(S,`${apply?'written':'would write'}: ${JSON.stringify(done)}`);
}
