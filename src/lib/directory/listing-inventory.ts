import {z} from 'zod';
import {LISTING_CURRENCIES,LISTING_STATUSES,MODERATION_STATUSES,PROPERTY_AMENITIES,PROPERTY_TYPES} from './listing-schemas';

// LOCAL PRO ONLY (multivertical V2/R2). Contract between the Pro inventory UI (src/components/pro/listing-inventory.tsx)
// and the draft route /api/pro/dir-listings (scratchpad). SQL (directory-listings-local.sql): owner reader
// `dir_listing_owner_list(p_actor,p_vertical,p_filter,p_cursor,p_limit)`, `dir_listing_assign_agent`,
// `dir_listing_media_mutate` (V3 photos) and `dir_listing_financing_set` (declared financing per dealer place).
// Private fields (plate, VIN, plano, folio, exact coordinates) are returned only to the seller of each listing
// (never to co-managers of the place) and never by the public readers.

/** Mirrors dir_listing_limits.min_photos_publish (default; the page's limits.minPhotosToPublish is authoritative). */
export const MIN_PHOTOS_TO_PUBLISH=4;
/** Hard cap of active photos per listing (dir_listing_media_mutate). */
export const MAX_LISTING_PHOTOS=30;
/** Image variants the upload route must produce (longest side, px). */
export const LISTING_PHOTO_VARIANTS=[1600,800,320] as const;

const opt=<T extends z.ZodType>(s:T)=>s.nullable().optional();
export const inventoryVehicleSchema=z.object({
 makeId:z.number().int(),modelId:z.number().int(),version:opt(z.string()),year:z.number().int(),condition:z.enum(['new','used']),
 mileageKm:opt(z.number()),transmission:opt(z.string()),fuel:opt(z.string()),drivetrain:opt(z.string()),engineCc:opt(z.number()),
 doors:opt(z.number()),seats:opt(z.number()),color:opt(z.string()),acceptsTradeIn:opt(z.boolean()),sellerFinancing:opt(z.boolean()),
 marchamoCurrentDeclared:opt(z.boolean()),rtvCurrentDeclared:opt(z.boolean()),taxesPaidDeclared:opt(z.boolean()),
 platePrivate:opt(z.string()),vinPrivate:opt(z.string()),
});
export const inventoryPropertySchema=z.object({
 operation:z.enum(['sale','rent']),propertyType:z.enum(PROPERTY_TYPES),bedrooms:opt(z.number()),bathrooms:opt(z.number()),
 parkingSpaces:opt(z.number()),builtM2:opt(z.number()),lotM2:opt(z.number()),floors:opt(z.number()),yearBuilt:opt(z.number()),
 furnished:opt(z.boolean()),petsAllowed:opt(z.boolean()),inCondominium:opt(z.boolean()),hoaFeeMinor:opt(z.number()),
 minLeaseMonths:opt(z.number()),amenities:z.array(z.enum(PROPERTY_AMENITIES)).optional(),
 cadastralPlanPrivate:opt(z.string()),folioRealPrivate:opt(z.string()),
});
export const inventoryItemSchema=z.object({
 id:z.string().uuid(),code:z.string(),revision:z.number().int(),status:z.enum(LISTING_STATUSES),moderationStatus:z.enum(MODERATION_STATUSES),
 title:z.string(),description:opt(z.string()),priceMinor:z.number().int(),currency:z.enum(LISTING_CURRENCIES),
 adminArea1:opt(z.string()),adminArea2:opt(z.string()),adminArea3:opt(z.string()),locality:opt(z.string()),
 placeId:opt(z.string().uuid()),agentId:opt(z.string().uuid()),
 /** Active photos (dir_listing_media). Publishing needs limits.minPhotosToPublish. */
 photoCount:z.number().int().nonnegative(),
 photos:z.array(z.object({id:z.string().uuid(),sort:z.number().int(),path1600:z.string(),path800:z.string(),path320:z.string(),
  width:z.number().int(),height:z.number().int(),altEs:opt(z.string()),altEn:opt(z.string())})).optional(),
 /** true when the viewer is the seller (private fields present); co-managers of the place get false (read-only). */
 mine:z.boolean().optional(),canEdit:z.boolean().optional(),
 sellerKind:z.enum(['business','private']).optional(),priceCrcNorm:opt(z.number()),
 publishedAt:opt(z.string()),expiresAt:opt(z.string()),updatedAt:z.string(),
 vehicle:inventoryVehicleSchema.nullable().optional(),property:inventoryPropertySchema.nullable().optional(),
});
export type InventoryItem=z.infer<typeof inventoryItemSchema>;

export const inventoryPageSchema=z.object({
 vertical:z.enum(['vehiculos','inmuebles']),
 sellerKind:z.enum(['business','private']),businessVerified:z.boolean(),
 filter:z.enum(['active','closed']).optional(),
 limits:z.object({privateActivePerVertical:z.number().int(),businessUnverifiedPublished:z.number().int(),
  minPhotosToPublish:z.number().int().optional(),maxPhotos:z.number().int().optional()}),
 counts:z.object({active:z.number().int(),published:z.number().int()}),
 places:z.array(z.object({id:z.string().uuid(),name:z.string(),slug:z.string().optional(),role:z.enum(['owner','manager']).optional(),placeStatus:z.string().optional()})),
 /** Pro team members of the place owners that can be assigned to a property (R2). Empty for vehicles / solo accounts. */
 agents:z.array(z.object({id:z.string().uuid(),name:z.string(),placeIds:z.array(z.string().uuid()).optional()})),
 catalog:z.object({makes:z.array(z.object({id:z.number().int(),name:z.string()})),models:z.array(z.object({id:z.number().int(),makeId:z.number().int(),name:z.string()}))}).nullable(),
 /** Declared financing of the dealer places (vehicles only; null for properties). */
 financing:z.array(z.object({placeId:z.string().uuid(),revision:z.number().int(),status:z.enum(['active','withdrawn']),annualRatePct:z.number(),
  maxTermMonths:z.number().int(),minDownPaymentPct:z.number(),declaredAt:z.string(),stale:z.boolean()})).nullable().optional(),
 items:z.array(inventoryItemSchema),
 /** Keyset cursor for the next page (pass as ?cursor=); null on the last page. */
 nextCursor:z.string().nullable().optional(),
});
export type InventoryPage=z.infer<typeof inventoryPageSchema>;

/** R2: assign a team agent to a property listing (separate action: listingMutationSchema is strict). */
export const listingAssignAgentSchema=z.object({
 action:z.literal('assign_agent'),actionId:z.string().uuid(),listingId:z.string().uuid(),revision:z.number().int().positive(),
 agentId:z.string().uuid().nullable(),
}).strict();
export type ListingAssignAgentInput=z.infer<typeof listingAssignAgentSchema>;

/** Inventory query (route → dir_listing_owner_list). */
export const inventoryQuerySchema=z.object({
 vertical:z.enum(['vehiculos','inmuebles']),filter:z.enum(['active','closed']).default('active'),
 cursor:z.string().regex(/^[0-9]{1,20}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).optional(),
 limit:z.coerce.number().int().min(1).max(100).optional(),
}).strict();

/**
 * V3 photos (dir_listing_media_mutate). The upload route stores the three variants at
 * dir-listings/<media id>/<1600|800|320>.<webp|jpg|avif>, strips EXIF/GPS and hashes the decoded original (sha256).
 * Photos do not use the listing revision (parallel uploads); they are idempotent by actionId.
 */
const mediaPath=(variant:number)=>z.string().regex(new RegExp(`^dir-listings/[0-9a-f-]{36}/${variant}\\.(webp|jpg|avif)$`));
export const listingMediaSchema=z.object({
 id:z.string().uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/),
 width:z.number().int().min(200).max(1600),height:z.number().int().min(200).max(1600),
 path1600:mediaPath(1600),path800:mediaPath(800),path320:mediaPath(320),
 exifStripped:z.literal(true),altEs:z.string().trim().min(1).max(200).optional(),altEn:z.string().trim().min(1).max(200).optional(),
}).strict().refine(m=>Math.max(m.width,m.height)>=640,{message:'La foto es muy pequeña.',path:['width']})
 .refine(m=>[m.path1600,m.path800,m.path320].every(p=>p.startsWith(`dir-listings/${m.id}/`)),{message:'Ruta inválida.',path:['path1600']});
export const listingMediaMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('add'),actionId:z.string().uuid(),listingId:z.string().uuid(),media:listingMediaSchema}).strict(),
 z.object({action:z.literal('remove'),actionId:z.string().uuid(),listingId:z.string().uuid(),mediaId:z.string().uuid()}).strict(),
 z.object({action:z.literal('reorder'),actionId:z.string().uuid(),listingId:z.string().uuid(),
  order:z.array(z.string().uuid()).min(1).max(MAX_LISTING_PHOTOS).refine(a=>new Set(a).size===a.length,'Hay fotos repetidas.')}).strict(),
]);
export type ListingMediaMutationInput=z.infer<typeof listingMediaMutationSchema>;

/**
 * Declared financing of a dealer place (dir_listing_financing_set). financing:null withdraws it. Terms are the
 * dealer's declaration (not verified); the public page shows them only with the «declarada por el vendedor» flag.
 */
const twoDecimals=(v:number)=>Math.abs(Math.round(v*100)-v*100)<1e-9;
export const listingFinancingSchema=z.object({
 actionId:z.string().uuid(),placeId:z.string().uuid(),revision:z.number().int().nonnegative(),
 financing:z.object({
  annualRatePct:z.number().min(0).max(60).refine(twoDecimals,'Máximo dos decimales.'),
  maxTermMonths:z.number().int().min(1).max(120),
  minDownPaymentPct:z.number().min(0).max(90).refine(twoDecimals,'Máximo dos decimales.'),
 }).strict().nullable(),
}).strict();
export type ListingFinancingInput=z.infer<typeof listingFinancingSchema>;

export const listingMutationResultSchema=z.object({action:z.string(),listingId:z.string().uuid(),code:z.string(),revision:z.number().int(),status:z.enum(LISTING_STATUSES)}).passthrough();

/** Stable API reasons (route → UI). Values of LISTING_ERROR_HINTS codes plus generic ones. */
export type InventoryErrorReason='listing_limit_private'|'listing_limit_business_unverified'|'listing_invalid_transition'|'listing_incomplete'|
 'listing_under_moderation'|'listing_fx_missing'|'listing_locked'|'conflict'|'not_found'|'invalid'|'photos_missing'|'module_unavailable'|'unavailable'|
 'listing_place_not_managed'|'listing_agent_not_member'|'listing_media_cap'|'listing_media_duplicate'|'listing_media_exif'|'listing_financing_range'|'rate_limited';

export function inventoryErrorText(reason:string|undefined,locale:string,limits?:InventoryPage['limits']):string{
 const en=locale==='en',t=(es:string,english:string)=>en?english:es;
 switch(reason){
  case 'listing_limit_private':return t(`Como particular puede tener hasta ${limits?.privateActivePerVertical??2} anuncios activos en esta sección (borradores incluidos). Archive uno para continuar.`,`As a private seller you can have up to ${limits?.privateActivePerVertical??2} active listings in this section (drafts included). Archive one to continue.`);
  case 'listing_limit_business_unverified':return t(`Mientras verificamos su negocio puede tener hasta ${limits?.businessUnverifiedPublished??5} anuncios publicados. Verifique su negocio para quitar el límite.`,`Until your business is verified you can have up to ${limits?.businessUnverifiedPublished??5} published listings. Verify your business to remove the limit.`);
  case 'listing_invalid_transition':return t('Ese cambio de estado no está permitido para este anuncio.','That status change is not allowed for this listing.');
  case 'listing_incomplete':return t('Para publicar complete la descripción (mínimo 20 caracteres), la provincia, el cantón y los datos principales.','To publish, complete the description (at least 20 characters), province, canton and the main details.');
  case 'listing_under_moderation':return t('El anuncio está en revisión. Podrá publicarlo cuando termine.','The listing is under review. You can publish it once the review ends.');
  case 'listing_fx_missing':return t('Aún no hay tipo de cambio del día para precios en dólares. Intente más tarde o use colones.','There is no exchange rate for today yet for USD prices. Try later or use colones.');
  case 'listing_locked':return t('Los anuncios vendidos, alquilados o suspendidos no se pueden editar.','Sold, rented or suspended listings cannot be edited.');
  case 'conflict':return t('El anuncio cambió en otra pestaña o dispositivo. Recargue para ver la versión actual; sus cambios no se guardaron.','The listing changed in another tab or device. Reload to see the current version; your changes were not saved.');
  case 'not_found':return t('El anuncio ya no está disponible.','The listing is no longer available.');
  case 'photos_missing':return t(`Agregue al menos ${MIN_PHOTOS_TO_PUBLISH} fotos para publicar.`,`Add at least ${MIN_PHOTOS_TO_PUBLISH} photos to publish.`);
  case 'listing_place_not_managed':return t('Ese negocio no está vinculado a su cuenta. Solo puede publicar a nombre de fichas que administra.','That business is not linked to your account. You can only list under places you manage.');
  case 'listing_agent_not_member':return t('Esa persona no es miembro activo del equipo del negocio (los de «Solo lectura» no pueden ser agentes).','That person is not an active member of the business team (read-only members cannot be agents).');
  case 'listing_media_cap':return t(`Cada anuncio admite hasta ${MAX_LISTING_PHOTOS} fotos.`,`Each listing accepts up to ${MAX_LISTING_PHOTOS} photos.`);
  case 'listing_media_duplicate':return t('Esa foto ya está en este anuncio.','That photo is already in this listing.');
  case 'listing_media_exif':return t('No se pudo limpiar la información interna de la foto. Intente con otra imagen.','The photo metadata could not be removed. Try another image.');
  case 'listing_financing_range':return t('Revise las condiciones: tasa entre 0 % y 60 %, plazo de 1 a 120 meses y prima entre 0 % y 90 % (máximo dos decimales).','Check the terms: rate 0–60 %, term 1–120 months and down payment 0–90 % (two decimals at most).');
  case 'rate_limited':return t('Recibimos muchos reportes. Intente más tarde.','Too many reports. Please try later.');
  case 'module_unavailable':return t('Esta herramienta no está activa en su cuenta.','This tool is not enabled for your account.');
  case 'invalid':return t('Revise los datos del anuncio.','Check the listing details.');
  default:return t('No se pudo completar la operación. Sus datos se conservan; intente de nuevo.','The operation could not be completed. Your data is preserved; please try again.');
 }
}
