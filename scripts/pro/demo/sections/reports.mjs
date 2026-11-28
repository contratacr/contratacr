// Reports: saved report filters (POST /api/pro/saved-reports → pro_saved_reports_mutate, an upsert by id).
// A saved report stores only the report type and period. There is no leads report key, so the
// customer and jobs reports stand in for the commercial side.
import {must,uuid,crDate,appModules} from '../lib.mjs';

const S='reports';
const REPORTS=a=>[
 ['financiero','Resumen financiero del mes (Ejemplo)','financial','this_month'],
 ['ingresos','Estado de resultados del año (Ejemplo)','income','this_year'],
 ['flujo','Flujo de caja, últimos 90 días (Ejemplo)','cashflow','last_90'],
 ['cobros','Pagos recibidos el mes pasado (Ejemplo)','payments','last_month'],
 ['iva','IVA del trimestre (Ejemplo)','vat','fixed',crDate(a,-61),crDate(a,29)],
 ['cxp','Cuentas por pagar (Ejemplo)','payables','all'],
 ['clientes','Clientes con saldo (Ejemplo)','customers','all'],
 ['trabajos','Rentabilidad de proyectos (Ejemplo)','jobs','this_year'],
 ['horas','Horas por proyecto, últimos 30 días (Ejemplo)','timeProject','last_30'],
];

export async function seed(ctx){
 const {db,apply,anchor,owner,log}=ctx;
 const app=appModules("export {savedReportMutationSchema} from './src/lib/pro/saved-reports';");
 const ids=REPORTS(anchor).map(([k])=>uuid(`${S}:saved:${k}`));
 const existing=new Set((await must('saved reports',db.from('pro_saved_reports').select('id,name').eq('owner_id',owner))).flatMap(r=>[r.id,r.name]));
 let writes=0;
 for(const [k,name,report,range,from=null,to=null] of REPORTS(anchor)){
  const id=uuid(`${S}:saved:${k}`);if(existing.has(id)||existing.has(name))continue;writes++;if(!apply)continue;
  await must('pro_saved_reports_mutate',db.rpc('pro_saved_reports_mutate',{p_actor:owner,p_input:app.savedReportMutationSchema.parse({action:'save',id,name,report,range,from,to})}));
 }
 const {count,error}=await db.from('pro_saved_reports').select('*',{count:'exact',head:true}).eq('owner_id',owner).in('id',ids);if(error)throw new Error(error.message);
 ctx.counts.savedReports=apply?count:ids.length;
 log(S,apply?`${writes} writes`:`dry run: ${writes} writes pending`);
}
