// Team: custom roles only (POST /api/pro/team-roles/custom → pro_custom_roles_mutate).
// Members (pro_company_members) and job grants (pro_team_grants) have NOT NULL foreign keys to profiles, so they
// need real auth accounts; invitations (pro_company_invites) carry a join code and expire in 72 h. The demo never
// creates auth users or invitations, so no member, grant, invitation or role assignment is seeded.
import {must,uuid,appModules} from '../lib.mjs';

const S='team';
const ROLES=[
 {key:'maestro',name:'Maestro de obras (Ejemplo)',baseRole:'member',capabilities:['read','work.write','inventory.write']},
 {key:'administrativa',name:'Asistente administrativa (Ejemplo)',baseRole:'manager',capabilities:['read','lead.write','sales.write','finance.write','price.write']},
 {key:'bodega',name:'Encargado de bodega (Ejemplo)',baseRole:'member',capabilities:['read','inventory.write']},
 {key:'consulta',name:'Consulta de obra (Ejemplo)',baseRole:'read_only',capabilities:['read']},
];

export async function seed(ctx){
 const {db,apply,owner,log}=ctx;
 const app=appModules("export {customRoleMutationSchema} from './src/lib/pro/operations';");
 let writes=0;
 for(const r of ROLES){
  const roleId=uuid(`${S}:role:${r.key}`);
  const row=await must('role',db.from('pro_company_custom_roles').select('id').eq('owner_id',owner).eq('id',roleId).maybeSingle());
  if(row)continue;writes++;if(!apply)continue;
  const input=app.customRoleMutationSchema.parse({action:'save',actionId:uuid(`${S}:role:${r.key}:save`),roleId,revision:0,name:r.name,baseRole:r.baseRole,capabilities:r.capabilities});
  await must('pro_custom_roles_mutate',db.rpc('pro_custom_roles_mutate',{p_actor:owner,p_owner:owner,p_input:input}));
 }
 const {count,error}=await db.from('pro_company_custom_roles').select('*',{count:'exact',head:true}).eq('owner_id',owner).in('id',ROLES.map(r=>uuid(`${S}:role:${r.key}`)));
 if(error)throw new Error(error.message);
 ctx.counts.customRoles=apply?count:ROLES.length;
 log(S,apply?`${writes} writes`:`dry run: ${writes} writes pending`);
}
