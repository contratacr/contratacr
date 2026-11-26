import {z} from 'zod';
import {placeMutationSchema,verticalAttributeSchemas} from './schemas';
import {PLACE_SECTIONS} from './place-verticals';
import type {DirectoryVertical} from './types';

// LOCAL PRO ONLY (owner 2026-11-26, «los agregamos nosotros»): a place created by hand by the ContrataCR team from
// /admin/directorio. POST /api/admin/directorio {kind:'place_create'} → dir_admin_place_create (migration 536): create +
// hours + published in one transaction, source `equipo`, one row in dir_moderation_log (kind 'place'). The same zod
// checks as every dir_place_mutate caller (placeMutationSchema) run here first; the database checks again.

const uuid=z.string().uuid();
const hour=z.object({weekday:z.number().int().min(0).max(6),opens:z.string(),closes:z.string()}).strict();
export const placeCreateRequestSchema=z.object({
 kind:z.literal('place_create'),actionId:uuid,
 place:z.object({
  vertical:z.enum(PLACE_SECTIONS.map(s=>s.id) as [string,...string[]]),
  name:z.string(),kind:z.string().regex(/^[a-z_]{2,30}$/).optional(),
  adminArea1:z.string().max(80).optional(),adminArea2:z.string().max(80).optional(),adminArea3:z.string().max(80).optional(),
  addressLine:z.string().max(300).optional(),lat:z.number().nullable().optional(),lng:z.number().nullable().optional(),
  phone:z.string().max(30).optional(),whatsapp:z.string().max(30).optional(),website:z.string().max(500).optional(),
 }).strict(),
 hours:z.array(hour).max(28),
}).strict();
export type PlaceCreateRequest=z.infer<typeof placeCreateRequestSchema>;

const blank=(v:string|undefined)=>{const x=(v??'').trim();return x?x:undefined;};

/**
 * Validates the admin form and returns the dir_admin_place_create input, or the field that failed. Reuses
 * placeMutationSchema (create and hours) so the rules are the same as every other place write.
 */
export function buildPlaceCreateInput(raw:unknown):{ok:true;input:{actionId:string;place:Record<string,unknown>;hours:{weekday:number;opens:string;closes:string}[]}}|{ok:false;field:string}{
 const req=placeCreateRequestSchema.safeParse(raw);
 if(!req.success)return {ok:false,field:String(req.error.issues[0]?.path.slice(-1)[0]??'invalid')};
 const {actionId,place:p,hours}=req.data;
 const vertical=p.vertical as DirectoryVertical;
 const section=PLACE_SECTIONS.find(s=>s.id===vertical)!;
 const kind=blank(p.kind);
 if(kind&&!(section.kinds as readonly {value:string}[]).some(k=>k.value===kind))return {ok:false,field:'kind'};
 const attributes:Record<string,unknown>={...(kind?{kind}:{}),...(blank(p.whatsapp)?{whatsapp:blank(p.whatsapp)}:{})};
 if(!verticalAttributeSchemas[vertical].safeParse(attributes).success)return {ok:false,field:blank(p.whatsapp)?'whatsapp':'kind'};
 const hasPin=p.lat!=null&&p.lng!=null;
 const place:Record<string,unknown>={vertical,name:p.name.trim(),attributes,
  ...(blank(p.adminArea1)?{adminArea1:blank(p.adminArea1)}:{}),...(blank(p.adminArea2)?{adminArea2:blank(p.adminArea2)}:{}),
  ...(blank(p.adminArea3)?{adminArea3:blank(p.adminArea3)}:{}),
  // The district (or canton) is also the locality shown on cards («Hotel en Santa Ana»).
  ...(blank(p.adminArea3)??blank(p.adminArea2)?{locality:blank(p.adminArea3)??blank(p.adminArea2)}:{}),
  ...(blank(p.addressLine)?{addressLine:blank(p.addressLine)}:{}),
  ...(hasPin?{lat:Math.round(p.lat!*1e6)/1e6,lng:Math.round(p.lng!*1e6)/1e6,locationPrecision:'exact'}:{}),
  ...(blank(p.phone)?{phone:blank(p.phone)}:{}),...(blank(p.website)?{website:blank(p.website)}:{})};
 // Same checks as dir_place_mutate callers (slug/placeId are placeholders: the database derives them from actionId).
 const create=placeMutationSchema.safeParse({action:'create',actionId,placeId:actionId,revision:0,place:{...place,slug:'lugar-nuevo'}});
 if(!create.success){const path=create.error.issues[0]?.path??[];return {ok:false,field:String(path[path.length-1]??'invalid')};}
 if(hours.length){
  const h=placeMutationSchema.safeParse({action:'hours',actionId,placeId:actionId,revision:1,hours});
  if(!h.success)return {ok:false,field:'hours'};
 }
 return {ok:true,input:{actionId,place,hours}};
}
