import {z} from 'zod';
import {enforceRateLimit} from '@/lib/rate-limit';
import {proBoundedJson,proSameOrigin} from '@/lib/pro/route-common';
import {businessContext,businessPlaces} from '@/lib/directory/business-access';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

// Launch without Pro (2026-11-18): public contact data and opening hours of a claimed place, edited by its owner or
// managers (acting as themselves). SQL: dir_owner_place_read / dir_owner_place_update (directory-owner-profile-local.sql:
// claimed place + active manager, strict keys, CAS by revision → 409, idempotent actionId, owner provenance).
//  GET (no placeId)        → {places}
//  GET ?placeId=<uuid>     → {placeId, slug, name, revision, phone, website, email, addressLine, hours}
//  POST {actionId, placeId, revision, action:'contact', place:{phone,website,email,addressLine}}
//  POST {actionId, placeId, revision, action:'hours', hours:[{weekday 0-6 (0 = domingo), opens HH:MM, closes HH:MM}]}
const uuid=z.string().uuid(),text=(max:number)=>z.string().trim().max(max).nullable();
const hhmm=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ownerPlaceSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('contact'),actionId:uuid,placeId:uuid,revision:z.number().int().min(1),
  place:z.object({phone:text(30).optional(),website:text(500).optional(),email:text(254).optional(),addressLine:text(300).optional()}).strict()}).strict(),
 z.object({action:z.literal('hours'),actionId:uuid,placeId:uuid,revision:z.number().int().min(1),
  hours:z.array(z.object({weekday:z.number().int().min(0).max(6),opens:hhmm,closes:hhmm}).strict()).max(28)}).strict(),
]);
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-business-profile-read',60,60_000);if(limited)return limited;
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const placeId=new URL(req.url).searchParams.get('placeId');
 if(!placeId)return dirOk({places:await businessPlaces(db,actor)});
 if(!uuid.safeParse(placeId).success)return dirFail(400,'invalid');
 const r=await db.rpc('dir_owner_place_read',{p_actor:actor,p_member:null,p_place:placeId});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
export async function POST(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const c=await businessContext(req);if(c.error)return c.error;const {db,actor}=c.ctx;
 const limited=await enforceRateLimit(req,'dir-business-profile-'+actor,30,60_000);if(limited)return limited;
 let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch{return dirFail(400,'invalid');}
 const body=ownerPlaceSchema.safeParse(raw);if(!body.success)return dirFail(400,'invalid');
 const r=await db.rpc('dir_owner_place_update',{p_actor:actor,p_member:null,p_input:JSON.parse(JSON.stringify(body.data))});
 return r.error?dirDbError(r.error):dirOk(r.data);
}
