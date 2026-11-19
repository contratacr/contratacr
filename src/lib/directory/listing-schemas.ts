import {z} from 'zod';

// LOCAL PRO ONLY (multivertical V1 + R1 data). zod mirrors of the checks in directory-listings-local.sql; the
// database checks again. Messages in Spanish («usted»); the API answers with the stable error code/hint and the UI
// translates it. Private fields (plate, VIN, plano catastrado, folio real) are accepted here but never returned by
// the public readers (public_vehicle_listings / public_property_listings / dir_listing_public).

export const LISTING_VERTICALS=['vehiculos','inmuebles'] as const;
export const SELLER_KINDS=['business','private'] as const;
export const LISTING_STATUSES=['draft','published','reserved','sold','rented','archived','suspended','expired'] as const;
export const MODERATION_STATUSES=['clear','review','approved','rejected'] as const;
export const LISTING_CURRENCIES=['CRC','USD'] as const;
export const VEHICLE_TYPES=['car','suv','pickup','van','truck','motorcycle','atv'] as const;
export const PROPERTY_TYPES=['house','apartment','condo','lot','office','commercial','warehouse','farm','room'] as const;
export const PROPERTY_AMENITIES=['pool','gym','security','elevator','garden','terrace','bbq','playground','laundry','storage','air_conditioning','water_tank','solar','generator','ocean_view','mountain_view','gated','accessible'] as const;
export type ListingVertical=(typeof LISTING_VERTICALS)[number];
export type ListingStatus=(typeof LISTING_STATUSES)[number];
export type PropertyOperation='sale'|'rent';

/** Defaults of dir_listing_limits (the table is the source of truth; these are for UI copy only). */
export const DEFAULT_LISTING_LIMITS={privateActivePerVertical:2,businessUnverifiedPublished:5,minPhotosToPublish:4,maxPhotos:30,
 priceOutlierMinSamples:5,priceOutlierPct:50,financingMaxAgeDays:180,reportsToReview:3} as const;
export const LISTING_TTL_DAYS=60;
/** Statuses that count against the private-seller limit / the unverified-business limit. */
export const ACTIVE_STATUSES:readonly ListingStatus[]=['draft','published','reserved'];
export const PUBLISHED_STATUSES:readonly ListingStatus[]=['published','reserved'];

/** Mirror of dir_listing_transition_ok (renewal expired→published is the separate 'renew' action). */
export function canTransition(from:ListingStatus,to:ListingStatus,vertical:ListingVertical,operation:PropertyOperation|null,by:'owner'|'staff'|'system'):boolean{
 if(by==='staff')return (from!=='suspended'&&to==='suspended')||(from==='suspended'&&(to==='draft'||to==='archived'));
 if(by==='system')return (from==='published'||from==='reserved')&&to==='expired';
 const live=from==='published'||from==='reserved';
 return (from==='draft'&&(to==='published'||to==='archived'))
  ||(from==='published'&&(to==='reserved'||to==='draft'||to==='archived'))
  ||(from==='reserved'&&(to==='published'||to==='archived'))
  ||(live&&to==='sold'&&(vertical==='vehiculos'||operation==='sale'))
  ||(live&&to==='rented'&&vertical==='inmuebles'&&operation==='rent')
  ||((from==='expired'||from==='sold'||from==='rented'||from==='suspended')&&to==='archived')
  ||(from==='rented'&&to==='published'&&vertical==='inmuebles'&&operation==='rent')
  ||(from==='archived'&&to==='draft');
}

const CR_BOUNDS={minLat:5.0,maxLat:11.5,minLng:-87.5,maxLng:-82.5};
const text=(min:number,max:number)=>z.string().trim().min(min).max(max);
const nullable=<T extends z.ZodType>(s:T)=>z.union([s,z.null(),z.literal('').transform(()=>null)]).optional();
const int=(min:number,max:number)=>z.number().int().min(min).max(max);
const priceMinor=z.number().int().positive('Indique un precio mayor que cero.').max(100_000_000_000_000);

export const listingFieldsSchema=z.object({
 vertical:z.enum(LISTING_VERTICALS).optional(),sellerKind:z.enum(SELLER_KINDS).optional(),
 placeId:z.string().uuid().nullable().optional(),
 title:text(5,120).optional(),description:nullable(text(1,5000)),
 priceMinor:priceMinor.optional(),currency:z.enum(LISTING_CURRENCIES).optional(),
 countryCode:z.string().regex(/^[A-Z]{2}$/).optional(),
 adminArea1:nullable(text(1,80)),adminArea2:nullable(text(1,80)),adminArea3:nullable(text(1,80)),locality:nullable(text(1,80)),
 lat:z.number().min(-90).max(90).nullable().optional(),lng:z.number().min(-180).max(180).nullable().optional(),
}).strict();

const thisYear=()=>new Date().getFullYear();
export const vehicleFieldsSchema=z.object({
 makeId:z.number().int().positive(),modelId:z.number().int().positive(),
 version:nullable(text(1,80)),year:int(1950,2100).refine(y=>y<=thisYear()+1,'Año inválido.'),
 condition:z.enum(['new','used']),mileageKm:int(0,2_000_000).nullable().optional(),
 transmission:z.enum(['manual','automatic','cvt','other']).nullable().optional(),
 fuel:z.enum(['gasoline','diesel','hybrid','plugin_hybrid','electric','lpg','other']).nullable().optional(),
 drivetrain:z.enum(['4x2','4x4','awd']).nullable().optional(),engineCc:int(49,20000).nullable().optional(),
 doors:int(0,6).nullable().optional(),seats:int(1,60).nullable().optional(),color:nullable(text(1,40)),
 acceptsTradeIn:z.boolean().optional(),sellerFinancing:z.boolean().optional(),
 marchamoCurrentDeclared:z.boolean().nullable().optional(),rtvCurrentDeclared:z.boolean().nullable().optional(),taxesPaidDeclared:z.boolean().nullable().optional(),
 /** PRIVATE — never public. */
 platePrivate:nullable(z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$/,'Placa inválida.')),
 /** PRIVATE — never public. */
 vinPrivate:nullable(z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/,'VIN inválido.')),
}).strict();

const registry=z.string().trim().toUpperCase().regex(/^[0-9A-Z][0-9A-Z-]{4,23}[0-9A-Z]$/,'Número inválido.');
const propertyShape=z.object({
 operation:z.enum(['sale','rent']),propertyType:z.enum(PROPERTY_TYPES),
 bedrooms:int(0,50).nullable().optional(),bathrooms:z.number().min(0).max(50).multipleOf(0.5).nullable().optional(),
 parkingSpaces:int(0,50).nullable().optional(),builtM2:z.number().positive().max(1_000_000).nullable().optional(),
 lotM2:z.number().positive().max(100_000_000_000).nullable().optional(),floors:int(1,200).nullable().optional(),
 yearBuilt:int(1800,2100).nullable().optional(),furnished:z.boolean().nullable().optional(),petsAllowed:z.boolean().nullable().optional(),
 inCondominium:z.boolean().nullable().optional(),hoaFeeMinor:int(0,100_000_000_000).nullable().optional(),
 minLeaseMonths:int(1,120).nullable().optional(),
 amenities:z.array(z.enum(PROPERTY_AMENITIES)).max(20).refine(a=>new Set(a).size===a.length,'Hay valores repetidos.').optional(),
 /** PRIVATE — never public (plano catastrado). */
 cadastralPlanPrivate:nullable(registry),
 /** PRIVATE — never public (folio real / matrícula). */
 folioRealPrivate:nullable(registry),
}).strict();
export const propertyFieldsSchema=propertyShape.refine(p=>p.operation==='rent'||p.minLeaseMonths==null,{message:'El plazo mínimo solo aplica a alquileres.',path:['minLeaseMonths']});

const base={actionId:z.string().uuid(),listingId:z.string().uuid(),revision:z.number().int().nonnegative()};
const coords=(l:{lat?:number|null;lng?:number|null;countryCode?:string},ctx:z.RefinementCtx)=>{
 if(('lat' in l||'lng' in l)&&(l.lat==null)!==(l.lng==null))ctx.addIssue({code:'custom',path:['listing','lat'],message:'Indique latitud y longitud juntas.'});
 if(l.lat!=null&&l.lng!=null&&(l.countryCode??'CR')==='CR'&&(l.lat<CR_BOUNDS.minLat||l.lat>CR_BOUNDS.maxLat||l.lng<CR_BOUNDS.minLng||l.lng>CR_BOUNDS.maxLng))
  ctx.addIssue({code:'custom',path:['listing','lat'],message:'Las coordenadas están fuera de Costa Rica.'});
};
const vehiclePatch=vehicleFieldsSchema.partial();
const propertyPatch=propertyShape.partial();

export const listingMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('create'),revision:z.literal(0),
  listing:listingFieldsSchema.required({vertical:true,sellerKind:true,title:true,priceMinor:true,currency:true}),
  vehicle:vehicleFieldsSchema.optional(),property:propertyFieldsSchema.optional()}).strict(),
 z.object({...base,action:z.literal('update'),listing:listingFieldsSchema.omit({vertical:true,sellerKind:true,countryCode:true}).optional(),
  vehicle:vehiclePatch.optional(),property:propertyPatch.omit({operation:true}).optional()}).strict(),
 z.object({...base,action:z.literal('status'),status:z.enum(['draft','published','reserved','sold','rented','archived'])}).strict(),
 z.object({...base,action:z.literal('renew')}).strict(),
]).superRefine((input,ctx)=>{
 if(input.action==='create'){
  const l=input.listing;
  if(l.vertical==='vehiculos'&&(!input.vehicle||input.property))ctx.addIssue({code:'custom',path:['vehicle'],message:'Complete los datos del vehículo.'});
  if(l.vertical==='inmuebles'&&(!input.property||input.vehicle))ctx.addIssue({code:'custom',path:['property'],message:'Complete los datos del inmueble.'});
  if(l.sellerKind==='private'&&l.placeId)ctx.addIssue({code:'custom',path:['listing','placeId'],message:'Solo los negocios se vinculan a una ficha.'});
  coords(l,ctx);
 }else if(input.action==='update'){
  if(!input.listing&&!input.vehicle&&!input.property)ctx.addIssue({code:'custom',path:[],message:'No hay cambios.'});
  if(input.listing)coords(input.listing,ctx);
 }
});
export type ListingMutationInput=z.infer<typeof listingMutationSchema>;

export const listingModerationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('suspend'),actionId:z.string().uuid(),listingId:z.string().uuid(),revision:z.number().int().positive(),note:text(1,500).optional()}).strict(),
 z.object({action:z.literal('reinstate'),actionId:z.string().uuid(),listingId:z.string().uuid(),revision:z.number().int().positive(),status:z.enum(['draft','archived']).optional(),note:text(1,500).optional()}).strict(),
 z.object({action:z.literal('moderation'),actionId:z.string().uuid(),listingId:z.string().uuid(),revision:z.number().int().positive(),moderationStatus:z.enum(MODERATION_STATUSES),note:text(1,500).optional()}).strict(),
 z.object({action:z.literal('seller'),actionId:z.string().uuid(),profileId:z.string().uuid(),businessVerified:z.boolean(),note:text(1,500).optional()}).strict(),
]);
export type ListingModerationInput=z.infer<typeof listingModerationSchema>;

export const fxRateSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),usdCrc:z.number().positive().lt(100000),source:z.enum(['bccr','manual'])}).strict();

/** 6-char public code (no 0/1/i/l/o). URL shape: /vehiculos/v/<slug>-<code>. */
export const listingCodeSchema=z.string().regex(/^[2-9a-hjkmnp-z]{6}$/);

/**
 * Public report about a listing (reuses dir_reports through dir_listing_report_create). «abuse» covers suspected
 * scams; three distinct identified reporters move the listing to review. Place-only kinds (closed, removal_request)
 * are not accepted for listings.
 */
export const LISTING_REPORT_KINDS=['wrong_info','duplicate','abuse','other'] as const;
export const listingReportSchema=z.object({
 reportId:z.string().uuid(),kind:z.enum(LISTING_REPORT_KINDS),message:text(5,2000),
 email:z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/,'Correo inválido.').optional(),
}).strict();
export type ListingReportInput=z.infer<typeof listingReportSchema>;

/** Database error hints → stable API codes (HTTP status suggested). */
export const LISTING_ERROR_HINTS={
 dir_listing_limit_private:{code:'listing_limit_private',status:409},
 dir_listing_limit_business_unverified:{code:'listing_limit_business_unverified',status:409},
 dir_listing_transition:{code:'listing_invalid_transition',status:409},
 dir_listing_incomplete:{code:'listing_incomplete',status:422},
 dir_listing_moderation:{code:'listing_under_moderation',status:409},
 dir_listing_fx_missing:{code:'listing_fx_missing',status:503},
 dir_listing_locked:{code:'listing_locked',status:409},
 dir_listing_photos_missing:{code:'photos_missing',status:422},
 dir_listing_place_not_managed:{code:'listing_place_not_managed',status:403},
 dir_listing_agent_vertical:{code:'invalid',status:400},
 dir_listing_agent_not_member:{code:'listing_agent_not_member',status:422},
 dir_listing_team_unavailable:{code:'module_unavailable',status:503},
 dir_listing_media_cap:{code:'listing_media_cap',status:409},
 dir_listing_media_duplicate:{code:'listing_media_duplicate',status:409},
 dir_listing_media_exif:{code:'listing_media_exif',status:422},
 dir_listing_financing_range:{code:'listing_financing_range',status:422},
 dir_listing_report_cap:{code:'rate_limited',status:429},
 dir_listing_cursor:{code:'invalid',status:400},
} as const;
