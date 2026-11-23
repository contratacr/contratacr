import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {brandInfoSchema} from '@/lib/directory/place-features';
import {proPlaceContext} from '@/lib/directory/pro-place-route';
import {dirDbError,dirFail,dirOk} from '@/lib/directory/public-route';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// LOCAL PRO ONLY (place features round, development only): common information of a brand whose claim staff approved,
// /api/pro/brand-info. Only the active brand owner (SQL); shown on the brand page and on every branch page.
//  GET  → {brands: dir_brand_manager_read}
//  POST brandInfoSchema → dir_brand_info_mutate (CAS revision → 409; idempotent actionId; immutable history).
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 const c=await proPlaceContext(req);if(c.error)return c.error;
 const r=await c.ctx.db.rpc('dir_brand_manager_read',{p_actor:c.ctx.actor});
 return r.error?dirDbError(r.error):dirOk({brands:r.data});
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404});
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await proPlaceContext(req);if(c.error)return c.error;
 if(c.ctx.member)return dirFail(403,'tool_role','Solo la persona dueña de la marca edita su información.');
 const limited=await enforceRateLimit(req,'dir-brand-info-'+c.ctx.actor,30,60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,4096);}catch{return dirFail(400,'invalid');}
 const body=brandInfoSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const r=await c.ctx.db.rpc('dir_brand_info_mutate',{p_actor:c.ctx.actor,p_input:body.data});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
