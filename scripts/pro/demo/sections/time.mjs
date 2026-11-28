// Time: activities with hourly rate/cost (POST /api/pro/time-tracking activity_save), billing defaults of an
// activity (time-activity-defaults) and manual owner entries for p1/p5 (pro_time_mutate_person, which also posts the
// job cost line). Timer, time clock and timesheets are skipped: they need running timers or team members.
import {must,uuid,tid,crDate,appModules} from '../lib.mjs';

const S='time';
const ACTIVITIES=[
 {key:'obra',name:'Mano de obra general (Ejemplo)',rate:6500,cost:4500,billable:true,defaults:{markupBps:1000,taxable:true}},
 {key:'supervision',name:'Supervisión de obra (Ejemplo)',rate:9500,cost:7000,billable:true,defaults:{markupBps:0,taxable:true}},
 {key:'visita',name:'Visita técnica (Ejemplo)',rate:0,cost:3500,billable:false},
];
// [key, project, activity, day offset from the anchor, minutes, billable, note]
const ENTRIES=[
 ['e1','p1','visita',-21,90,false,'Levantamiento de medidas de cocina y baño.'],
 ['e2','p1','obra',-18,480,true,'Demolición de enchape y retiro de escombros.'],
 ['e3','p1','obra',-15,450,true,'Instalación de tubería nueva en baño principal.'],
 ['e4','p1','supervision',-12,120,true,'Revisión de niveles antes del enchape.'],
 ['e5','p1','obra',-8,480,true,'Enchape de piso y paredes del baño.'],
 ['e6','p5','supervision',-30,180,true,'Revisión de armado de cimientos.'],
 ['e7','p5','obra',-26,480,true,'Colado de cimientos y vigas de fundación.'],
 ['e8','p5','obra',-19,480,true,'Levantado de paredes en block, eje A.'],
 ['e9','p5','supervision',-10,150,true,'Inspección de avance con el cliente.'],
 ['e10','p5','obra',-5,420,true,'Repellos de paredes exteriores.'],
];

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const app=appModules("export {timeMutationSchema} from './src/lib/pro/time-tracking';export {activityDefaultsSaveSchema} from './src/lib/pro/time-activity-defaults';");
 const today=new Date(Date.now()-6*3600000).toISOString().slice(0,10);// manual entries may not be in the future
 const one=(table,filters)=>{let q=db.from(table).select('*');for(const [k,v] of Object.entries(filters))q=q.eq(k,v);return must(table,q.maybeSingle());};
 const mutate=async input=>{const p_input=app.timeMutationSchema.parse(input);
  for(let attempt=0;;attempt++){const {data,error}=await db.rpc('pro_time_mutate_person',{p_actor:owner,p_input});
   if(!error)return data;if(error.code!=='40001'||attempt)throw new Error(`pro_time_mutate_person: ${error.message}`);}};// one retry: the job-cost revision can race other sections
 let writes=0;const activityId=k=>uuid(`${S}:activity:${k}`);
 for(const a of ACTIVITIES){
  const id=activityId(a.key);
  if(!await one('pro_time_activities',{owner_id:owner,id})){writes++;if(apply)await mutate({action:'activity_save',actionId:uuid(`${S}:activity:${a.key}:save`),activityId:id,revision:0,name:a.name,rateCents:a.rate*100,costCents:a.cost*100,billable:a.billable});}
  if(a.defaults&&!await one('pro_time_activity_defaults',{owner_id:owner,activity_id:id})){writes++;
   if(apply)await must('pro_time_activity_defaults_save',db.rpc('pro_time_activity_defaults_save',{p_actor:owner,p_input:app.activityDefaultsSaveSchema.parse({activityId:id,revision:0,...a.defaults})}));}
 }
 for(const [key,project,activity,day,minutes,billable,note] of ENTRIES){
  const entryId=uuid(`${S}:entry:${key}`);if(await one('pro_time_entries',{owner_id:owner,id:entryId}))continue;writes++;if(!apply)continue;
  const date=[crDate(anchor,day),today].sort()[0];
  await mutate({action:'manual',actionId:uuid(`${S}:entry:${key}:manual`),entryId,workId:tid(project),activityId:activityId(activity),billable,date,minutes,note:`${note} (Ejemplo)`,personGrantId:null});
 }
 const count=async(table,col,list,intended=list.length)=>{if(!apply)return intended;const {count:n,error}=await db.from(table).select('*',{count:'exact',head:true}).eq('owner_id',owner).in(col,list);if(error)throw new Error(error.message);return n;};
 ctx.counts.timeActivities=await count('pro_time_activities','id',ACTIVITIES.map(a=>activityId(a.key)));
 ctx.counts.timeActivityDefaults=await count('pro_time_activity_defaults','activity_id',ACTIVITIES.map(a=>activityId(a.key)),ACTIVITIES.filter(a=>a.defaults).length);
 ctx.counts.timeEntries=await count('pro_time_entries','id',ENTRIES.map(([k])=>uuid(`${S}:entry:${k}`)));
 log(S,apply?`${writes} writes`:`dry run: ${writes} writes pending`);
}
