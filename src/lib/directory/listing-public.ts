import type {PROPERTY_AMENITIES,PROPERTY_TYPES,VEHICLE_TYPES} from './listing-schemas';
import {idiomaDe,prefijoDeIdioma} from '../prefijo-de-idioma';
import {proMoney} from '../pro/money';

// LOCAL PRO ONLY (multivertical V4/R1 UI). Public shapes of a listing (camelCase) built from the rows of
// public_vehicle_listings / public_property_listings / dir_listing_public(code), plus ES/EN labels and money
// formatting shared by the public pages and the Pro inventory. Never contains ids, seller ids, revision, exact
// coordinates or *_private fields (the SQL readers do not return them either).

export type VehicleType=(typeof VEHICLE_TYPES)[number];
export type PropertyType=(typeof PROPERTY_TYPES)[number];
export type PropertyAmenity=(typeof PROPERTY_AMENITIES)[number];
export type L10n={es:string;en:string};

export type PublicListingPhoto={url:string;altEs:string|null;altEn:string|null;
 /** Optional responsive data (dir_listing_public → photos[]): 800/320 variant URLs and the 1600 variant size. */
 url800?:string;url320?:string;width?:number;height?:number};
type PublicListingBase={
 code:string;title:string;description:string|null;
 /** The public readers return published and reserved listings; reserved → «Reservado» badge, CTAs off, noindex. */
 status:'published'|'reserved';
 sellerKind:'business'|'private';sellerBusinessVerified:boolean;placeSlug:string|null;placeName:string|null;
 priceMinor:number;currency:'CRC'|'USD';priceCrcNorm:number|null;fxRateDate:string|null;
 countryCode:string;adminArea1:string|null;adminArea2:string|null;adminArea3:string|null;locality:string|null;
 /** Always fuzzed 305–495 m by the database. */
 approxLat:number|null;approxLng:number|null;locationRadiusM:number|null;
 publishedAt:string|null;expiresAt:string|null;updatedAt:string;
 /** From dir_listing_public(code).photos via mapPublicPhotos (the list views only carry photo_count / cover paths). */
 photos:PublicListingPhoto[];
};
export type PublicVehicleListing=PublicListingBase&{vertical:'vehiculos';
 makeSlug:string;makeName:string;modelSlug:string;modelName:string;vehicleType:VehicleType;version:string|null;year:number;
 condition:'new'|'used';mileageKm:number|null;transmission:string|null;fuel:string|null;drivetrain:string|null;engineCc:number|null;
 doors:number|null;seats:number|null;color:string|null;acceptsTradeIn:boolean;sellerFinancing:boolean;
 marchamoCurrentDeclared:boolean|null;rtvCurrentDeclared:boolean|null;taxesPaidDeclared:boolean|null};
export type PublicPropertyListing=PublicListingBase&{vertical:'inmuebles';
 operation:'sale'|'rent';propertyType:PropertyType;bedrooms:number|null;bathrooms:number|null;parkingSpaces:number|null;
 builtM2:number|null;lotM2:number|null;floors:number|null;yearBuilt:number|null;furnished:boolean|null;petsAllowed:boolean|null;
 inCondominium:boolean|null;hoaFeeMinor:number|null;minLeaseMonths:number|null;amenities:PropertyAmenity[]};
export type PublicListing=PublicVehicleListing|PublicPropertyListing;

/**
 * Financing terms DECLARED by a dealer (dir_listing_financing, one program per dealer place). dir_listing_public
 * returns them only for vehicle listings that opted in (seller_financing), from a published dealer place and while
 * the declaration is recent; always with declaredBySeller=true («declarada por el vendedor»). The calculator only
 * renders when the page receives this object, and it always shows FINANCE_DISCLAIMER.
 */
export type DeclaredFinancing={annualRatePct:number;maxTermMonths:number;minDownPaymentPct:number;declaredAt:string;
 /** Always true: ContrataCR does not verify these terms; the page must say «declarada por el vendedor». */
 declaredBySeller:true};

const s=(v:unknown)=>typeof v==='string'&&v.length?v:null;
const n=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const b=(v:unknown)=>typeof v==='boolean'?v:null;

/** dir_listing_public(code).financing → DeclaredFinancing (null when absent or malformed). */
export function mapDeclaredFinancing(raw:unknown):DeclaredFinancing|null{
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>,rate=n(r.annualRatePct),term=n(r.maxTermMonths),down=n(r.minDownPaymentPct),at=s(r.declaredAt);
 if(rate==null||term==null||down==null||!at||r.declaredBySeller!==true)return null;
 return {annualRatePct:rate,maxTermMonths:term,minDownPaymentPct:down,declaredAt:at,declaredBySeller:true};
}

/**
 * dir_listing_public(code).photos → PublicListingPhoto[]. `toUrl` turns a storage path
 * (dir-listings/<media id>/<1600|800|320>.webp) into a public URL (CDN / signed URL); the route decides.
 */
export function mapPublicPhotos(raw:unknown,toUrl:(path:string)=>string):PublicListingPhoto[]{
 if(!Array.isArray(raw))return [];
 return raw.flatMap((p):PublicListingPhoto[]=>{
  if(!p||typeof p!=='object')return [];
  const r=p as Record<string,unknown>,big=s(r.path1600);if(!big)return [];
  const m800=s(r.path800),m320=s(r.path320);
  return [{url:toUrl(big),url800:m800?toUrl(m800):undefined,url320:m320?toUrl(m320):undefined,
   width:n(r.width)??undefined,height:n(r.height)??undefined,altEs:s(r.altEs),altEn:s(r.altEn)}];
 });
}

/** Maps one snake_case row of the public readers to the camelCase shape. Returns null for unknown verticals. */
export function mapPublicListing(row:Record<string,unknown>,photos:PublicListingPhoto[]=[]):PublicListing|null{
 const base:PublicListingBase={
  code:String(row.code),title:String(row.title),description:s(row.description),
  status:row.status==='reserved'?'reserved':'published',
  sellerKind:row.seller_kind==='business'?'business':'private',sellerBusinessVerified:row.seller_business_verified===true,
  placeSlug:s(row.place_slug),placeName:s(row.place_name),
  priceMinor:n(row.price_minor)??0,currency:row.currency==='USD'?'USD':'CRC',priceCrcNorm:n(row.price_crc_norm),fxRateDate:s(row.fx_rate_date),
  countryCode:s(row.country_code)??'CR',adminArea1:s(row.admin_area_1),adminArea2:s(row.admin_area_2),adminArea3:s(row.admin_area_3),locality:s(row.locality),
  approxLat:n(row.approx_lat),approxLng:n(row.approx_lng),locationRadiusM:n(row.location_radius_m),
  publishedAt:s(row.published_at),expiresAt:s(row.expires_at),updatedAt:String(row.updated_at??''),photos,
 };
 if(row.vertical==='vehiculos'||row.make_slug!==undefined)return {...base,vertical:'vehiculos',
  makeSlug:String(row.make_slug),makeName:String(row.make_name),modelSlug:String(row.model_slug),modelName:String(row.model_name),
  vehicleType:row.vehicle_type as VehicleType,version:s(row.version),year:n(row.year)??0,condition:row.condition==='new'?'new':'used',
  mileageKm:n(row.mileage_km),transmission:s(row.transmission),fuel:s(row.fuel),drivetrain:s(row.drivetrain),engineCc:n(row.engine_cc),
  doors:n(row.doors),seats:n(row.seats),color:s(row.color),acceptsTradeIn:row.accepts_trade_in===true,sellerFinancing:row.seller_financing===true,
  marchamoCurrentDeclared:b(row.marchamo_current_declared),rtvCurrentDeclared:b(row.rtv_current_declared),taxesPaidDeclared:b(row.taxes_paid_declared)};
 if(row.vertical==='inmuebles'||row.operation!==undefined)return {...base,vertical:'inmuebles',
  operation:row.operation==='rent'?'rent':'sale',propertyType:row.property_type as PropertyType,bedrooms:n(row.bedrooms),bathrooms:n(row.bathrooms),
  parkingSpaces:n(row.parking_spaces),builtM2:n(row.built_m2),lotM2:n(row.lot_m2),floors:n(row.floors),yearBuilt:n(row.year_built),
  furnished:b(row.furnished),petsAllowed:b(row.pets_allowed),inCondominium:b(row.in_condominium),hoaFeeMinor:n(row.hoa_fee_minor),
  minLeaseMonths:n(row.min_lease_months),amenities:Array.isArray(row.amenities)?row.amenities as PropertyAmenity[]:[]};
 return null;
}

/** Slug for the public URL: /vehiculos/v/<slug>-<code>, /inmuebles/i/<slug>-<code>. The code is authoritative. */
export function listingSlug(title:string){
 return title.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60).replace(/-+$/,'')||'anuncio';
}
export function listingPath(listing:{vertical:'vehiculos'|'inmuebles';title:string;code:string},locale:string){
 const prefix=prefijoDeIdioma(locale);
 return `${prefix}/${listing.vertical}/${listing.vertical==='vehiculos'?'v':'i'}/${listingSlug(listing.title)}-${listing.code}`;
}
/** Extracts the 6-char code from the last URL segment ("toyota-rav4-2019-ab3x9k" → "ab3x9k"). */
export function codeFromSegment(segment:string){const m=/(?:^|-)([2-9a-hjkmnp-z]{6})$/.exec(segment);return m?m[1]:null;}

const INTL_LOCALE={es:'es-CR',en:'en-US'} as const;
/** Money in minor units → «₡12 500 000» / «US$18 900». Whole amounts drop decimals. */
export function formatMoney(minor:number,currency:'CRC'|'USD',locale:string){
 const major=minor/100,whole=Number.isInteger(major);
 if(currency==='CRC')return proMoney(major,locale==='en');
 const num=new Intl.NumberFormat(INTL_LOCALE[idiomaDe(locale)],{minimumFractionDigits:whole?0:2,maximumFractionDigits:2}).format(major);
 return (currency==='USD'?'US$':'₡')+num;
}
export function formatDate(iso:string,locale:string){
 const d=new Date(iso.length===10?iso+'T12:00:00Z':iso);
 return Number.isNaN(d.getTime())?iso:new Intl.DateTimeFormat(INTL_LOCALE[idiomaDe(locale)],{day:'numeric',month:'long',year:'numeric',timeZone:'America/Costa_Rica'}).format(d);
}
export const formatNumber=(v:number,locale:string)=>new Intl.NumberFormat(INTL_LOCALE[idiomaDe(locale)],{maximumFractionDigits:1}).format(v);

/** Costa Rica provinces (admin_area_1). */
export const CR_PROVINCES=['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón'] as const;

export const VEHICLE_TYPE_LABELS:Record<VehicleType,L10n>={
 car:{es:'Automóviles',en:'Cars'},suv:{es:'SUV y todoterreno',en:'SUVs'},pickup:{es:'Pickups',en:'Pickups'},van:{es:'Microbuses y vans',en:'Vans'},
 truck:{es:'Camiones',en:'Trucks'},motorcycle:{es:'Motos',en:'Motorcycles'},atv:{es:'Cuadraciclos',en:'ATVs'},
};
export const PROPERTY_TYPE_LABELS:Record<PropertyType,L10n>={
 house:{es:'Casas',en:'Houses'},apartment:{es:'Apartamentos',en:'Apartments'},condo:{es:'Casas en condominio',en:'Condos'},lot:{es:'Lotes',en:'Lots'},
 office:{es:'Oficinas',en:'Offices'},commercial:{es:'Locales comerciales',en:'Retail spaces'},warehouse:{es:'Bodegas',en:'Warehouses'},
 farm:{es:'Fincas',en:'Farms'},room:{es:'Habitaciones',en:'Rooms'},
};
export const AMENITY_LABELS:Record<PropertyAmenity,L10n>={
 pool:{es:'Piscina',en:'Pool'},gym:{es:'Gimnasio',en:'Gym'},security:{es:'Seguridad',en:'Security'},elevator:{es:'Ascensor',en:'Elevator'},
 garden:{es:'Jardín',en:'Garden'},terrace:{es:'Terraza',en:'Terrace'},bbq:{es:'Rancho o BBQ',en:'BBQ area'},playground:{es:'Área de juegos',en:'Playground'},
 laundry:{es:'Cuarto de pilas',en:'Laundry'},storage:{es:'Bodega',en:'Storage'},air_conditioning:{es:'Aire acondicionado',en:'Air conditioning'},
 water_tank:{es:'Tanque de agua',en:'Water tank'},solar:{es:'Paneles solares',en:'Solar panels'},generator:{es:'Planta eléctrica',en:'Generator'},
 ocean_view:{es:'Vista al mar',en:'Ocean view'},mountain_view:{es:'Vista a la montaña',en:'Mountain view'},gated:{es:'Acceso controlado',en:'Gated'},
 accessible:{es:'Accesible',en:'Accessible'},
};
export const TRANSMISSION_LABELS:Record<string,L10n>={manual:{es:'Manual',en:'Manual'},automatic:{es:'Automática',en:'Automatic'},cvt:{es:'CVT',en:'CVT'},other:{es:'Otra',en:'Other'}};
export const FUEL_LABELS:Record<string,L10n>={gasoline:{es:'Gasolina',en:'Gasoline'},diesel:{es:'Diésel',en:'Diesel'},hybrid:{es:'Híbrido',en:'Hybrid'},
 plugin_hybrid:{es:'Híbrido enchufable',en:'Plug-in hybrid'},electric:{es:'Eléctrico',en:'Electric'},lpg:{es:'Gas LP',en:'LPG'},other:{es:'Otro',en:'Other'}};
export const DRIVETRAIN_LABELS:Record<string,L10n>={'4x2':{es:'4x2',en:'2WD'},'4x4':{es:'4x4',en:'4WD'},awd:{es:'Tracción integral (AWD)',en:'AWD'}};
export const label=(map:Record<string,L10n>,key:string|null|undefined,locale:string)=>key?(map[key]?.[idiomaDe(locale)]??key):null;
