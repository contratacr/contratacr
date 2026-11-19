import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {MENU_ERROR_HINTS,menuMutationSchema} from '@/lib/directory/menu-schemas';
import {businessContext} from '@/lib/directory/business-access';
import {dirEnabledOnly} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): menu editor of a claimed restaurant/café for its owner/managers (acting as
// themselves), free: no edition/module gate. Same SQL as /api/pro/menu (pro_menu_read / pro_menu_mutate — the menu
// tables keep their historical pro_menu_* names but depend only on the directory). Menu-from-photo (an assistant
// feature) is NOT offered here: multipart and import reviews answer 400.
//  GET ?placeId=<uuid> → EditorMenu · POST application/json menuMutationSchema → pro_menu_mutate (CAS → 409; idempotent)
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
const fail=(status:number,reason:string,error='No se pudo completar la operación.')=>Response.json({error,reason},{status,headers});
function dbError(error:{code?:string;hint?:string}){
 const h=error.hint as keyof typeof MENU_ERROR_HINTS|undefined;
 if(h&&h in MENU_ERROR_HINTS){const m=MENU_ERROR_HINTS[h];return fail(m.status,m.code);}
 switch(error.code){
  case '40001':return fail(409,'conflict','El menú cambió. Recargue antes de guardar.');
  case 'P0002':return fail(404,'not_found','Ese elemento no está disponible.');
  case '23505':return fail(409,'conflict');
  case '54000':return fail(409,'item_cap');
  case '42501':return fail(403,'not_manager','Sin acceso.');
  case '22023':case '23514':case '22P02':return fail(400,'invalid','Revise los datos del menú.');
  default:return fail(503,'unavailable');
 }
}
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-business-menu-read',120,60_000);if(limited)return limited;
 const c=await businessContext(req);if(c.error)return c.error;
 const q=new URL(req.url).searchParams;if([...q.keys()].length!==1)return fail(400,'invalid','Consulta inválida.');
 const placeId=z.string().uuid().safeParse(q.get('placeId'));if(!placeId.success)return fail(400,'invalid','Consulta inválida.');
 const r=await c.ctx.db.rpc('pro_menu_read',{p_actor:c.ctx.actor,p_member:null,p_place:placeId.data});
 return r.error?dbError(r.error):Response.json(r.data,{headers});
}
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return fail(403,'origin','Origen no autorizado.');
 const c=await businessContext(req);if(c.error)return c.error;
 const limited=await enforceRateLimit(req,'dir-menu-'+c.ctx.actor,120,60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,262144);}catch{return fail(400,'invalid','Revise los datos del menú.');}
 const parsed=menuMutationSchema.safeParse(raw);if(!parsed.success)return fail(400,'invalid','Revise los datos del menú.');
 const r=await c.ctx.db.rpc('pro_menu_mutate',{p_actor:c.ctx.actor,p_member:null,p_input:parsed.data});
 return r.error?dbError(r.error):Response.json(r.data,{headers});
}
