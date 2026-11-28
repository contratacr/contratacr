import {z} from 'zod';
import type {DirectoryItem,DirectorySort} from './ranking';
import type {PublicPriceObservation} from './price-schemas';
import {matchVerticals,normalizeIntentText,type DirectoryVertical as IntentVertical} from './vertical-vocabulary';
import {DIRECTORY_VERTICALS} from './types';
import {NEW_PLACE_SECTIONS,PLACE_SECTIONS,placeSection} from './place-verticals';
import {EXTRA_FILTER_KEYS,sectionExtraFilters} from './section-filters';

// LOCAL PRO ONLY (multivertical F6). Query validation, cursor codec and result types for dir_search / dir_facets
// (docs/pro/sql/directory-search-local.sql). Not imported by any route yet: see the F6 wiring notes.
// Order never depends on payment: there is no commercial key anywhere in these schemas.

// 2026-11-17: + cafes, pulperias, ferreterias, hospedaje, salud, veterinarias, talleres, belleza, gimnasios, tours, bancos.
export const SEARCH_VERTICALS=['restaurantes','gasolineras','farmacias','supermercados','agencias','lugares','vehiculos','inmuebles',
 'cafes','pulperias','ferreterias','hospedaje','salud','veterinarias','talleres','belleza','gimnasios','tours','bancos','parqueos','lavacar',
 'atracciones','tiendas','centros-comerciales','mercados-y-carnicerias','tramites','educacion','transporte'] as const;
export type SearchVertical=typeof SEARCH_VERTICALS[number];
export const PLACE_SEARCH_VERTICALS=['restaurantes','gasolineras','farmacias','supermercados','agencias','lugares',
 'cafes','pulperias','ferreterias','hospedaje','salud','veterinarias','talleres','belleza','gimnasios','tours','bancos','parqueos','lavacar',
 'atracciones','tiendas','centros-comerciales','mercados-y-carnicerias','tramites','educacion','transporte'] as const;
export const SEARCH_SORTS=['relevance','best_rated','distance','price_asc','price_desc','newest'] as const;
export type SearchSort=typeof SEARCH_SORTS[number];
export const SEARCH_PAGE_SIZE=20;

/** SQL sort name → ranking.ts sort name (same keys and tie breaks). */
export const SORT_TO_RANKING:Record<SearchSort,DirectorySort>={relevance:'relevance',best_rated:'rating',distance:'distance',price_asc:'priceAsc',price_desc:'priceDesc',newest:'newest'};
export const isListingVertical=(v:SearchVertical)=>v==='vehiculos'||v==='inmuebles';
/**
 * Place price filters (owner decision 2026-11-17: «en todo donde aplique filtrar precios, solo gasolineras no»).
 * 'menu': restaurants, by the MEDIAN final price of the published menu (IVA + service included).
 * 'product': pharmacies and supermarkets, by the current price of ONE product typed in `product`; without it the
 * price range and price sorts are refused (a store has no single price). null: no place price (fuel stations: the
 * price is national and regulated by ARESEP; agencies; the generic «lugares»). Mirrors dir_search_price_mode (SQL).
 */
// 2026-11-17: cafes = menu (like restaurants); pulperias, ferreterias, veterinarias (pet-shop products) = product. No price
// at all for hospedaje, salud (no consultation prices), talleres, belleza, gimnasios, tours, bancos (map only).
export const PLACE_PRICE_MODE:Partial<Record<SearchVertical,'menu'|'product'>>=Object.fromEntries(
 PLACE_SECTIONS.flatMap(s=>s.priceMode?[[s.section,s.priceMode]]:[])) as Partial<Record<SearchVertical,'menu'|'product'>>;
export const placePriceMode=(v:SearchVertical)=>PLACE_PRICE_MODE[v]??null;

export const VEHICLE_TYPES=['car','suv','pickup','van','truck','motorcycle','atv'] as const;
export const VEHICLE_FUELS=['gasoline','diesel','hybrid','plugin_hybrid','electric','lpg','other'] as const;
export const VEHICLE_TRANSMISSIONS=['manual','automatic','cvt','other'] as const;
export const VEHICLE_CONDITIONS=['new','used'] as const;
export const PROPERTY_OPERATIONS=['sale','rent'] as const;
export const PROPERTY_TYPES=['house','apartment','condo','lot','office','commercial','warehouse','farm','room'] as const;
export const PLACE_VERTICAL_IDS=DIRECTORY_VERTICALS;

// URL values arrive as strings; lists are comma separated ("type=suv,pickup").
const area=z.string().trim().min(1).max(80);
const slug=z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const csv=<T extends z.ZodType<string,string>>(item:T)=>z.string().max(400).transform(s=>s.split(',').map(x=>x.trim()).filter(Boolean)).pipe(z.array(item).min(1).max(20));
const int=(min:number,max:number)=>z.coerce.number().int().min(min).max(max);
const flag=z.enum(['1','true','0','false']).transform(v=>v==='1'||v==='true');

const placeShape={vertical:csv(z.enum(PLACE_VERTICAL_IDS)).optional(),province:area.optional(),canton:area.optional(),district:area.optional(),
 openNow:flag.optional(),open24h:flag.optional(),
 // Subtype of a 2026-11-17 section (attributes.kind); checked against the section's kinds in parseSearchParams.
 kind:csv(z.string().regex(/^[a-z_]{2,30}$/)).optional(),
 // 2026-11-27 (migration 546): section filters with data; each section accepts only its own (SECTION_EXTRA_FILTERS).
 cuisine:csv(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40)).optional(),brand:csv(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40)).optional(),
 soda:flag.optional(),reservations:flag.optional(),atm:flag.optional(),public:flag.optional()};
const placeFilters=z.object(placeShape).strict();
// Whole colones (₡); the SQL compares céntimos (×100) and refuses the same ranges with 22023.
const placePrice={priceMin:int(0,1e9).optional(),priceMax:int(0,1e9).optional()};
const priceOrder=(f:{priceMin?:number;priceMax?:number})=>f.priceMin==null||f.priceMax==null||f.priceMin<=f.priceMax;
const menuPlaceFilters=z.object({...placeShape,...placePrice}).strict().refine(priceOrder,'priceMin>priceMax');
const productPlaceFilters=z.object({...placeShape,...placePrice,product:z.string().trim().min(2).max(80).optional()}).strict()
 .refine(priceOrder,'priceMin>priceMax');
const vehicleFilters=z.object({type:csv(z.enum(VEHICLE_TYPES)).optional(),make:csv(slug).optional(),model:csv(slug).optional(),
 yearMin:int(1950,2100).optional(),yearMax:int(1950,2100).optional(),priceMin:int(0,1e12).optional(),priceMax:int(0,1e12).optional(),
 kmMax:int(0,2_000_000).optional(),fuel:csv(z.enum(VEHICLE_FUELS)).optional(),transmission:csv(z.enum(VEHICLE_TRANSMISSIONS)).optional(),
 condition:csv(z.enum(VEHICLE_CONDITIONS)).optional(),province:area.optional(),canton:area.optional()}).strict()
 .refine(f=>f.yearMin==null||f.yearMax==null||f.yearMin<=f.yearMax,'yearMin>yearMax').refine(f=>f.priceMin==null||f.priceMax==null||f.priceMin<=f.priceMax,'priceMin>priceMax');
const propertyFilters=z.object({operation:csv(z.enum(PROPERTY_OPERATIONS)).optional(),type:csv(z.enum(PROPERTY_TYPES)).optional(),
 priceMin:int(0,1e12).optional(),priceMax:int(0,1e12).optional(),bedroomsMin:int(0,50).optional(),m2Min:int(0,1e9).optional(),m2Max:int(0,1e9).optional(),
 province:area.optional(),canton:area.optional(),district:area.optional()}).strict()
 .refine(f=>f.priceMin==null||f.priceMax==null||f.priceMin<=f.priceMax,'priceMin>priceMax').refine(f=>f.m2Min==null||f.m2Max==null||f.m2Min<=f.m2Max,'m2Min>m2Max');
export const FILTER_KEYS={
 places:['vertical','province','canton','district','openNow','open24h'],
 restaurantes:['vertical','province','canton','district','openNow','open24h','priceMin','priceMax','cuisine','soda','reservations'],
 farmacias:['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax'],
 supermercados:['vertical','province','canton','district','openNow','open24h','product','priceMin','priceMax','brand'],
 // 2026-11-27 (546): sections with their own extra filters (section-filters.ts).
 gasolineras:['vertical','province','canton','district','openNow','open24h','brand'],
 bancos:['vertical','province','canton','district','openNow','open24h','kind','brand','atm'],
 salud:['vertical','province','canton','district','openNow','open24h','kind','public'],
 educacion:['vertical','province','canton','district','openNow','open24h','kind','public'],
 // 2026-11-17 sections: + kind; menu sections + price range; product sections + product and price range.
 kindPlaces:['vertical','province','canton','district','openNow','open24h','kind'],
 cafes:['vertical','province','canton','district','openNow','open24h','kind','priceMin','priceMax'],
 productKindPlaces:['vertical','province','canton','district','openNow','open24h','kind','product','priceMin','priceMax'],
 vehiculos:['type','make','model','yearMin','yearMax','priceMin','priceMax','kmMax','fuel','transmission','condition','province','canton'],
 inmuebles:['operation','type','priceMin','priceMax','bedroomsMin','m2Min','m2Max','province','canton','district'],
} as const;

/** Opaque keyset cursor: base64url of {sort, s:number[], k:string}. Never contains internal ids. */
export type SearchCursor={sort:SearchSort;s:number[];k:string};
// btoa/atob (not Buffer) so the codec runs in Workers, Node and the browser alike. Content is ASCII only.
export function encodeCursor(c:SearchCursor):string{return btoa(JSON.stringify(c)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function decodeCursor(value:string):SearchCursor|null{
 if(!/^[A-Za-z0-9_-]{8,600}$/.test(value))return null;
 try{const parsed=cursorSchema.safeParse(JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/'))));return parsed.success?parsed.data:null;}catch{return null;}
}
const cursorSchema=z.object({sort:z.enum(SEARCH_SORTS),s:z.array(z.number().finite()).min(1).max(8),k:z.string().regex(/^(p:[a-z0-9-]{3,80}|l:[2-9a-hjkmnp-z]{6})$/)}).strict();

const common={
 vertical:z.enum(SEARCH_VERTICALS).optional(),
 q:z.string().trim().max(100).optional(),
 lat:z.coerce.number().min(-90).max(90).optional(),lng:z.coerce.number().min(-180).max(180).optional(),
 radiusKm:z.coerce.number().min(0.1).max(100).optional(),
 sort:z.enum(SEARCH_SORTS).optional(),
 cursor:z.string().max(600).optional(),
 limit:int(1,50).optional(),
 locale:z.enum(['es','en']).optional(),
};
const RESERVED=new Set(Object.keys(common));

export type SearchRequest={vertical:SearchVertical;q:string|null;filters:Record<string,unknown>;lat:number|null;lng:number|null;radiusKm:number|null;
 sort:SearchSort;cursor:SearchCursor|null;limit:number};
export type SearchParseError={ok:false;reason:'invalid'|'vertical'|'location'|'cursor'|'sort'|'product';field?:string};

/**
 * Parses URLSearchParams for /api/directorio/search and /facets. When no vertical is given it is detected from the
 * text with vertical-vocabulary.ts, and generic words of that vertical ("farmacia", "carros") are removed from it.
 */
export function parseSearchParams(params:URLSearchParams,{facets=false}:{facets?:boolean}={}):({ok:true}&SearchRequest)|SearchParseError{
 const raw:Record<string,string>={};const filterRaw:Record<string,string>={};
 for(const [k,v] of params){if(k in raw||k in filterRaw)return {ok:false,reason:'invalid',field:k};(RESERVED.has(k)?raw:filterRaw)[k]=v;}
 const base=z.object(common).strict().safeParse(raw);if(!base.success)return {ok:false,reason:'invalid',field:String(base.error.issues[0]?.path[0]??'')};
 const b=base.data;
 const prepared=prepareDirectoryText(b.q??'',b.vertical??null);
 const vertical=b.vertical??prepared.vertical;if(!vertical)return {ok:false,reason:'vertical'};
 if((b.lat==null)!==(b.lng==null)||(b.radiusKm!=null&&b.lat==null))return {ok:false,reason:'location'};
 const sort=b.sort??'relevance';
 if(sort==='distance'&&b.lat==null)return {ok:false,reason:'location'};
 const priceSort=sort==='price_asc'||sort==='price_desc',mode=placePriceMode(vertical);
 if(priceSort&&!isListingVertical(vertical)&&!mode)return {ok:false,reason:'sort'};
 const schema=vertical==='vehiculos'?vehicleFilters:vertical==='inmuebles'?propertyFilters:mode==='menu'?menuPlaceFilters:mode==='product'?productPlaceFilters:placeFilters;
 const filters=schema.safeParse(filterRaw);if(!filters.success)return {ok:false,reason:'invalid',field:String(filters.error.issues[0]?.path[0]??'')};
 if(mode==='product'){
  const f=filters.data as {product?:string;priceMin?:number;priceMax?:number};
  if(!f.product&&(priceSort||f.priceMin!=null||f.priceMax!=null))return {ok:false,reason:'product',field:'product'};
 }
 const kinds=(filters.data as {kind?:string[]}).kind;
 if(kinds){const allowed=placeSection(vertical)?.kinds.map(x=>x.value)??[];if(!kinds.every(x=>allowed.includes(x)))return {ok:false,reason:'invalid',field:'kind'};}
 const extra=sectionExtraFilters(vertical);
 const foreign=EXTRA_FILTER_KEYS.find(k=>k in (filters.data as object)&&!extra.includes(k));
 if(foreign)return {ok:false,reason:'invalid',field:foreign};
 let cursor:SearchCursor|null=null;
 if(!facets&&b.cursor){cursor=decodeCursor(b.cursor);if(!cursor||cursor.sort!==sort)return {ok:false,reason:'cursor'};}
 const clean=Object.fromEntries(Object.entries(filters.data).filter(([,v])=>v!==undefined));
 return {ok:true,vertical,q:prepared.text||null,filters:clean,lat:b.lat??null,lng:b.lng??null,radiusKm:b.radiusKm??null,sort,cursor,limit:b.limit??SEARCH_PAGE_SIZE};
}

// Generic words that only name the vertical (removed from the text once the vertical is known) and connectors.
const GENERIC_TERMS:Partial<Record<SearchVertical,string[]>>={
 restaurantes:['restaurante','restaurantes','restaurant','restaurants','comida','food'],
 gasolineras:['gasolinera','gasolineras','bomba','bombas','bomba de gasolina','estacion de servicio','gas station','gas stations','fuel'],
 farmacias:['farmacia','farmacias','botica','pharmacy','pharmacies','drugstore'],
 supermercados:['supermercado','supermercados','super','super mercado','supermarket','supermarkets','grocery'],
 vehiculos:['carro','carros','auto','autos','automovil','vehiculo','vehiculos','car','cars','vehicle','vehicles'],
 inmuebles:['propiedad','propiedades','bienes raices','real estate','inmueble','inmuebles'],
 cafes:['cafe','cafes','cafeteria','cafeterias','panaderia','panaderias','bar','bares','coffee shop','bakery','bakeries','bars'],
 pulperias:['pulperia','pulperias','minisuper','mini super','abastecedor','corner store','corner stores'],
 ferreterias:['ferreteria','ferreterias','hardware store','hardware stores','hardware'],
 hospedaje:['hospedaje','hotel','hoteles','hostal','hostales','cabinas','lodging','hotels','hostel','hostels','casa por dias','apartamento por dias','alquiler por dias','vacation rental','vacation rentals'],
 salud:['salud','clinica','clinicas','consultorio','consultorios','health','clinic','clinics'],
 veterinarias:['veterinaria','veterinarias','veterinario','vet','vets','veterinary','pet shop','tienda de mascotas'],
 talleres:['taller','talleres','taller mecanico','mecanico','car repair','garage','mechanic'],
 belleza:['belleza','salon de belleza','estetica','beauty','beauty salon'],
 gimnasios:['gimnasio','gimnasios','gym','gyms'],
 tours:['tour','tours','museo','museos','tours and museums','museum','museums'],
 atracciones:['atraccion','atracciones','attraction','attractions','que hacer','things to do'],
 tiendas:['tienda','tiendas','store','stores','shop','shops'],
 'centros-comerciales':['centro comercial','centros comerciales','mall','malls','plaza comercial','shopping center','shopping mall'],
 'mercados-y-carnicerias':['mercado','mercados','carniceria','carnicerias','market','markets','butcher','butchers'],
 tramites:['tramite','tramites','oficina publica','oficinas publicas','public office','public offices','government office'],
 educacion:['educacion','centro educativo','centros educativos','education','school','schools'],
 transporte:['transporte','transport','terminal','terminales'],
 bancos:['banco','bancos','cajero','cajeros','cajero automatico','bank','banks','atm','atms'],
 parqueos:['parqueo','parqueos','parqueadero','estacionamiento','parking','car park'],
 lavacar:['lavacar','lavacarros','lava car','autolavado','car wash','car washes'],
};
const CONNECTORS=['en','de','del','la','el','los','las','cerca','cerca de','near','in','the','y','and','a'];
const INTENT_TO_SEARCH:Partial<Record<IntentVertical,SearchVertical>>={restaurantes:'restaurantes',gasolineras:'gasolineras',farmacias:'farmacias',
 supermercados:'supermercados',vehiculos:'vehiculos',inmuebles:'inmuebles',
 ...Object.fromEntries(NEW_PLACE_SECTIONS.map(s=>[s,s]))};

export function prepareDirectoryText(text:string,vertical:SearchVertical|null):{vertical:SearchVertical|null;text:string}{
 const chosen=vertical??(()=>{const m=matchVerticals(text)[0];return m?INTENT_TO_SEARCH[m.vertical]??null:null;})();
 let padded=` ${normalizeIntentText(text)} `;
 const generic=(chosen?GENERIC_TERMS[chosen]??[]:[]).map(normalizeIntentText).sort((a,b)=>b.length-a.length);
 for(const term of generic)padded=padded.split(` ${term} `).join(' ');
 const words=padded.trim().split(/\s+/).filter(Boolean);
 // Connectors are only dropped when they are not the whole query.
 const kept=words.filter(w=>!CONNECTORS.includes(w));
 return {vertical:chosen,text:(kept.length?kept:words).join(' ').trim()};
}

// ---------------------------------------------------------------- result types (dir_search / dir_facets)
export type RankingReason='text_exact'|'text_prefix'|'text_word'|'text_partial'|'text_keyword'|'locality_district'|'locality_canton'|'locality_province'|
 'rating_credible'|'verified'|'profile_complete'|'fresh_listing'|'distance'|'price_asc'|'price_desc'|'price_missing'|'newest'|'sort_rating'|'id_tiebreak';
export type SearchSignals={textScore:number;localityRank:number;ratingAvg:number|null;reviewCount:number;verificationStatus:'verified'|null;
 completeness:number;freshness:number;createdAt:string|null;updatedAt:string|null;priceCrcNorm:number|null};
type Address={adminArea1:string|null;adminArea2:string|null;adminArea3:string|null;locality:string|null;line?:string|null};
/** Price shown on a place card (dir_search_place_prices): menu median or the searched product's current price. */
export type PlaceSearchPrice=
 |{kind:'menu';amount:number;currency:'CRC';dishes:number;updatedAt:string}
 |{kind:'product';item:{slug:string;name:string;presentation:string|null};observation:PublicPriceObservation};
export type PlaceSearchItem={kind:'place';key:string;slug:string;name:string;status:'published';price?:PlaceSearchPrice|null;phone?:string|null;
 vertical:{id:typeof PLACE_VERTICAL_IDS[number];nameEs:string;nameEn:string;pathEs:string;pathEn:string};address:Address;
 location:{lat:number;lng:number;precision:string}|null;rating:{average:number|null;count:number};verificationLevel:string;
 openNow:boolean|null;open24h:boolean;attributes:Record<string,unknown>;keywords:string[];distanceKm:number|null;signals:SearchSignals;ranking_reason:RankingReason[]};
export type ListingSearchItem={kind:'listing';key:string;code:string;vertical:'vehiculos'|'inmuebles';status:'published'|'reserved';title:string;
 sellerKind:'business'|'private';sellerBusinessVerified:boolean;placeSlug:string|null;placeName:string|null;
 price:{minor:number;currency:'CRC'|'USD';crcNorm:number|null;fxRateDate:string|null};address:Address;
 approxLocation:{lat:number;lng:number;radiusM:number}|null;publishedAt:string;keywords:string[];distanceKm:number|null;
 vehicle:{makeSlug:string;makeName:string;modelSlug:string;modelName:string;type:typeof VEHICLE_TYPES[number];version:string|null;year:number;
  condition:'new'|'used';mileageKm:number|null;transmission:string|null;fuel:string|null;drivetrain:string|null}|null;
 property:{operation:'sale'|'rent';type:typeof PROPERTY_TYPES[number];bedrooms:number|null;bathrooms:number|null;parkingSpaces:number|null;
  builtM2:number|null;lotM2:number|null;furnished:boolean|null;petsAllowed:boolean|null}|null;
 signals:SearchSignals;ranking_reason:RankingReason[]};
export type DirectorySearchItem=PlaceSearchItem|ListingSearchItem;
export type PriceProduct={slug:string;name:string;presentation:string|null;brand:string|null;unitBase:string;unitQty:number};
export type DirectorySearchResult={vertical:SearchVertical;sort:SearchSort;items:DirectorySearchItem[];nextCursor:SearchCursor|null;priceProduct?:PriceProduct|null};
export type FacetValue={value:string|number;count:number;label?:string};
export type DirectoryFacets={vertical:SearchVertical;total:number;facets:{province:FacetValue[];canton:FacetValue[];vertical?:FacetValue[];openNow?:number;open24h?:number;
 type?:FacetValue[];kind?:FacetValue[];make?:FacetValue[];fuel?:FacetValue[];transmission?:FacetValue[];condition?:FacetValue[];operation?:FacetValue[];bedrooms?:FacetValue[];
 year?:{min:number|null;max:number|null};price?:{min:number|null;max:number|null};withPrice?:number}};

/** Same item as ranking.ts sees it (parity tests and any in-memory re-rank use this; never adds other signals). */
export function toRankingItem(item:DirectorySearchItem):DirectoryItem{
 const s=item.signals;
 return {id:item.key,kind:item.kind,name:item.kind==='place'?item.name:item.title,keywords:item.keywords,
  adminArea1:item.address.adminArea1,adminArea2:item.address.adminArea2,adminArea3:item.address.adminArea3,
  ratingAvg:s.ratingAvg==null?null:Number(s.ratingAvg),reviewCount:s.reviewCount,verificationStatus:s.verificationStatus,completeness:Number(s.completeness),
  createdAt:s.createdAt,publishedAt:item.kind==='listing'?item.publishedAt:null,updatedAt:s.updatedAt,distanceKm:item.distanceKm==null?null:Number(item.distanceKm),priceCrcNorm:s.priceCrcNorm==null?null:Number(s.priceCrcNorm)};
}
