import {z} from 'zod';
import {DIRECTORY_VERTICALS,PLACE_STATUSES,REPORT_KINDS,VERIFICATION_LEVELS,type DirectoryVertical} from './types';
import {placeSectionById} from './place-verticals';

// LOCAL PRO ONLY (multivertical F1/F2). zod mirrors of the checks in directory-core-local.sql; the database checks
// again. Attribute keys per vertical must match dir_verticals.attribute_keys. Messages in Spanish («usted»); the
// API answers with the stable error code and the UI translates it.

const text=(max:number)=>z.string().trim().min(1).max(max);
const bool=z.boolean().optional();
const list=<T extends [string,...string[]]>(values:T,max:number)=>z.array(z.enum(values)).max(max).refine(a=>new Set(a).size===a.length,'Hay valores repetidos.').optional();
/** The `kind` subtype of a 2026-11-17 section: one of its PLACE_SECTIONS kinds. */
const kindOf=(id:string)=>{const values=placeSectionById(id)?.kinds.map(x=>x.value)??[];return z.string().refine(v=>values.includes(v),'Tipo inválido para esta sección.').optional();};

/** WhatsApp number recorded by the team or an import (2026-11-26); shown as the WhatsApp button until the owner sets a «Pedir» link. */
const contact={whatsapp:z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,22}$/,'WhatsApp inválido.').optional()};
/** Bounded, typed attributes per vertical. No price, sponsorship or ranking keys: order never depends on payment. */
export const verticalAttributeSchemas={
 restaurant:z.object({...contact,cuisines:z.array(text(40)).max(10).optional(),priceLevel:z.number().int().min(1).max(4).optional(),
  // Costa Rica: menus show prices with IVA; the 10 % service charge is disclosed separately.
  serviceCharge:bool,delivery:bool,takeaway:bool,reservations:bool,vegetarianOptions:bool}).strict(),
 fuel:z.object({...contact,brand:text(60).optional(),fuels:list(['regular','super','diesel','lpg','electric'],5),open24h:bool,
  services:list(['shop','air','car_wash','restroom','atm'],5)}).strict(),
 // Decreto 36868-S: no medicine prices or advertising here; only operational facts.
 pharmacy:z.object({...contact,licenseNumber:z.string().trim().regex(/^[A-Za-z0-9-]{3,30}$/,'Número de permiso inválido.').optional(),onDuty:bool,delivery:bool,acceptsPrescriptions:bool}).strict(),
 grocery:z.object({...contact,chain:text(60).optional(),format:z.enum(['supermarket','minimarket','wholesale','pulperia']).optional(),delivery:bool,
  paymentMethods:list(['cash','card','sinpe','transfer'],4)}).strict(),
 vehicle_dealer:z.object({...contact,brands:z.array(text(40)).max(30).optional(),newVehicles:bool,usedVehicles:bool,financing:bool,workshop:bool}).strict(),
 real_estate:z.object({...contact,operations:list(['sale','rent'],2),propertyTypes:list(['house','apartment','lot','office','commercial','farm'],6)}).strict(),
 // 2026-11-17 sections (place-verticals.ts). `kind` = the one subtype (from OSM tags at import). Small on purpose: no
 // prices of consultations/treatments, no official-status claims (ICT declaratoria, stars, SUGEF products).
 cafe_bar:z.object({...contact,kind:kindOf('cafe_bar'),cuisines:z.array(text(40)).max(10).optional(),priceLevel:z.number().int().min(1).max(4).optional(),
  serviceCharge:bool,delivery:bool,takeaway:bool,reservations:bool,vegetarianOptions:bool}).strict(),
 convenience:z.object({...contact,kind:kindOf('convenience'),delivery:bool,paymentMethods:list(['cash','card','sinpe','transfer'],4)}).strict(),
 hardware:z.object({...contact,kind:kindOf('hardware'),delivery:bool,paymentMethods:list(['cash','card','sinpe','transfer'],4)}).strict(),
 lodging:z.object({...contact,kind:kindOf('lodging'),pool:bool,wifi:bool,parking:bool,breakfast:bool,petFriendly:bool}).strict(),
 // Establishments only; publicService = EBAIS / CCSS / public hospital (operator:type=public in OSM).
 health:z.object({...contact,kind:kindOf('health'),publicService:bool,emergency:bool}).strict(),
 vet_pets:z.object({...contact,kind:kindOf('vet_pets'),emergency:bool,delivery:bool}).strict(),
 auto_services:z.object({...contact,kind:kindOf('auto_services'),services:list(['repair','motorcycle_repair','car_wash','tyres','inspection','parts'],6)}).strict(),
 beauty:z.object({...contact,kind:kindOf('beauty'),byAppointment:bool}).strict(),
 fitness:z.object({...contact,kind:kindOf('fitness')}).strict(),
 tours:z.object({...contact,kind:kindOf('tours')}).strict(),
 // Map points only: no rates, products or financial data. atm = the bank branch has an ATM.
 banking:z.object({...contact,kind:kindOf('banking'),atm:bool,operator:text(80).optional()}).strict(),
 // 2026-11-26: parking and car washes (added by the team).
 parking:z.object({...contact,kind:kindOf('parking')}).strict(),
 car_wash:z.object({...contact,kind:kindOf('car_wash')}).strict(),
} satisfies Record<DirectoryVertical,z.ZodType>;
export function placeAttributesSchema(vertical:DirectoryVertical){return verticalAttributeSchemas[vertical];}

export const placeSlugSchema=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/,'Use minúsculas, números y guiones (3 a 80).');
const phone=z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,22}$/,'Teléfono inválido.');
const website=z.string().trim().max(500).regex(/^https?:\/\/[^\s"<>]{3,}$/,'Use una dirección web que empiece con https://.');
/** Same shape as the dir_places.email check (lower-case; never shown in full on the public page). */
export const placeEmailSchema=z.string().trim().toLowerCase().max(254).regex(/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/,'Correo inválido.');
const nullable=<T extends z.ZodType>(s:T)=>z.union([s,z.null(),z.literal('').transform(()=>null)]).optional();
/** CR bounding box (includes Isla del Coco), same as the database check for country_code='CR'. */
export const CR_BOUNDS={minLat:5.0,maxLat:11.5,minLng:-87.5,maxLng:-82.5};

export const placeFieldsSchema=z.object({
 slug:placeSlugSchema.optional(),vertical:z.enum(DIRECTORY_VERTICALS).optional(),name:z.string().trim().min(2,'Escriba el nombre.').max(160).optional(),
 countryCode:z.string().regex(/^[A-Z]{2}$/).optional(),currency:z.string().regex(/^[A-Z]{3}$/).optional(),
 adminArea1:nullable(text(80)),adminArea2:nullable(text(80)),adminArea3:nullable(text(80)),locality:nullable(text(80)),addressLine:nullable(text(300)),
 lat:z.number().min(-90).max(90).nullable().optional(),lng:z.number().min(-180).max(180).nullable().optional(),
 locationPrecision:z.enum(['exact','street','locality','area','unknown']).optional(),
 phone:nullable(phone),website:nullable(website),email:nullable(placeEmailSchema),attributes:z.record(z.string(),z.unknown()).optional(),
}).strict();

const base={actionId:z.string().uuid(),placeId:z.string().uuid(),revision:z.number().int().nonnegative(),
 source:z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),ref:z.string().regex(/^[A-Za-z0-9:/._-]{1,120}$/).optional(),observedAt:z.string().datetime({offset:true}).optional()}).strict().optional()};
const hour=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/,'Use HH:MM.');
/** Closing time may also be 24:00 (midnight at the end of the day, as stored for OSM «24/7» / «18:00-24:00»). */
const closingHour=z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/,'Use HH:MM.');
export const placeMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('create'),revision:z.literal(0),verificationLevel:z.enum(['unverified','imported']).optional(),
  place:placeFieldsSchema.required({slug:true,vertical:true,name:true})}).strict(),
 z.object({...base,action:z.literal('update'),place:placeFieldsSchema.omit({vertical:true,countryCode:true,currency:true})}).strict(),
 z.object({...base,action:z.literal('status'),status:z.enum(PLACE_STATUSES)}).strict(),
 z.object({...base,action:z.literal('hours'),hours:z.array(z.object({weekday:z.number().int().min(0).max(6),opens:hour,closes:closingHour}).strict()
  .refine(h=>h.opens!==h.closes,'La hora de apertura y cierre no pueden ser iguales.')).max(28)}).strict(),
 z.object({...base,action:z.literal('verify'),verificationLevel:z.enum(VERIFICATION_LEVELS)}).strict(),
]).superRefine((input,ctx)=>{
 if(input.action!=='create'&&input.action!=='update')return;
 const p=input.place;
 if((p.lat==null)!==(p.lng==null)&&('lat' in p||'lng' in p))ctx.addIssue({code:'custom',path:['place','lat'],message:'Indique latitud y longitud juntas.'});
 if(input.action==='create'){
  const c=input.place,attrs=verticalAttributeSchemas[c.vertical].safeParse(c.attributes??{});
  if(!attrs.success)ctx.addIssue({code:'custom',path:['place','attributes'],message:'Atributos inválidos para esta sección.'});
  if(c.lat!=null&&c.lng!=null&&(c.countryCode??'CR')==='CR'&&(c.lat<CR_BOUNDS.minLat||c.lat>CR_BOUNDS.maxLat||c.lng<CR_BOUNDS.minLng||c.lng>CR_BOUNDS.maxLng))
   ctx.addIssue({code:'custom',path:['place','lat'],message:'Las coordenadas están fuera de Costa Rica.'});
 }
});
export type PlaceMutationInput=z.infer<typeof placeMutationSchema>;

/** Public report form (POST /api/lugar/[slug]/reporte once wired). */
export const placeReportSchema=z.object({reportId:z.string().uuid(),kind:z.enum(REPORT_KINDS),
 message:z.string().trim().min(5,'Describa el problema (mínimo 5 caracteres).').max(2000),
 email:z.union([z.string().trim().toLowerCase().email('Correo inválido.').max(254),z.literal('').transform(()=>undefined)]).optional()}).strict();
export type PlaceReportInput=z.infer<typeof placeReportSchema>;
export const reportResolveSchema=z.object({actionId:z.string().uuid(),reportId:z.string().uuid(),decision:z.enum(['accept','reject']),
 note:z.string().trim().max(1000).optional(),revision:z.number().int().positive().optional()}).strict();
