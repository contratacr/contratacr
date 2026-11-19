import {z} from 'zod';
import type {PublicPriceObservation} from './price-schemas';
import {proMoney} from '../pro/money';

// LOCAL PRO ONLY (multivertical P3): query parsing, result types and display helpers of the price comparison
// (public_price_search / public_price_compare in docs/pro/sql/price-compare-local.sql). Pure module (no server-only):
// the /precios page, the assistant tools and the node tests share it. Order never depends on payment: the only sort
// keys are unit price, price and place name.

export const COMPARE_SORTS=['unit_price','price','place'] as const;
export type CompareSort=typeof COMPARE_SORTS[number];
/** URL value (Spanish, like the section paths) → vertical id. */
export const COMPARE_VERTICALS={supermercados:'grocery',farmacias:'pharmacy'} as const;
export type CompareVerticalParam=keyof typeof COMPARE_VERTICALS;
export type CompareVertical=typeof COMPARE_VERTICALS[CompareVerticalParam];

const slug=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/);
// Price range in colones (owner decision 2026-11-17): whole numbers, same bounds as the SQL (22023 otherwise).
const colones=z.coerce.number().int().min(0).max(99_999_999);
const querySchema=z.object({
 q:z.string().trim().max(100).optional(),
 precioMin:colones.optional(),
 precioMax:colones.optional(),
 producto:slug.optional(),
 categoria:z.string().regex(/^[a-z][a-z0-9_]{1,39}$/).optional(),
 provincia:z.string().trim().min(1).max(80).optional(),
 tipo:z.enum(['supermercados','farmacias']).optional(),
 orden:z.enum(COMPARE_SORTS).optional(),
});
export type PriceQuery={q:string|null;item:string|null;province:string|null;vertical:CompareVertical|null;verticalParam:CompareVerticalParam|null;sort:CompareSort;
 priceMin:number|null;priceMax:number|null;category:string|null};

/** Query string of /precios → validated query. Unknown keys are ignored; an invalid value gives {ok:false}. */
export function parsePriceQuery(sp:Record<string,string|string[]|undefined>):{ok:true;query:PriceQuery}|{ok:false;field:string}{
 const flat=Object.fromEntries(Object.entries(sp).flatMap(([k,v])=>typeof v==='string'&&v.trim()!==''&&k in querySchema.shape?[[k,v]]:[]));
 const parsed=querySchema.safeParse(flat);
 if(!parsed.success)return {ok:false,field:String(parsed.error.issues[0]?.path[0]??'q')};
 const v=parsed.data;
 if(v.precioMin!=null&&v.precioMax!=null&&v.precioMin>v.precioMax)return {ok:false,field:'precioMin'};
 return {ok:true,query:{q:v.q||null,item:v.producto??null,province:v.provincia??null,verticalParam:v.tipo??null,vertical:v.tipo?COMPARE_VERTICALS[v.tipo]:null,sort:v.orden??'unit_price',
  priceMin:v.precioMin??null,priceMax:v.precioMax??null,category:v.categoria??null}};
}

export type PriceSearchItem={slug:string;kind:'grocery'|'medicine'|'generic';name:string;presentation:string|null;brand:string|null;category:string;gtin:string|null;
 unitBase:string;unitQty:number;normalizedUnit:string;offers:number};
export type PriceSearchResult={q:string|null;vertical:CompareVertical|null;items:PriceSearchItem[]};
export type PriceOffer={place:{slug:string;name:string;vertical:string;province:string|null;canton:string|null;locality:string|null};unitPrice:number;
 observation:PublicPriceObservation;provenance:{sourceUrl:string;publicationDate:string;surveyRef:string;fileSha256:string}|null};
export type PriceRegion={province:string;offers:number;minUnitPrice:number;medianUnitPrice:number;maxUnitPrice:number};
export type PriceComparison={item:Omit<PriceSearchItem,'offers'>&{normalizedQty:number};asOf:string;province:string|null;vertical:CompareVertical|null;sort:CompareSort;
 priceMin?:number|null;priceMax?:number|null;
 total:number;offers:PriceOffer[];regions:PriceRegion[]};

// ---------------------------------------------------------------- display helpers (ES «usted» / EN)
// Colones use the app's single ₡ formatter (es «₡1.190», en «₡1,190»); never «CRC 1,190».
export const money=(n:number,currency:string,en:boolean)=>{const v=Number(n);if(currency==='CRC')return proMoney(v,en);return new Intl.NumberFormat(en?'en-US':'es-CR',{style:'currency',currency,minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2}).format(v);};
export const crDay=(iso:string,en:boolean)=>new Intl.DateTimeFormat(en?'en-US':'es-CR',{dateStyle:'medium',timeZone:'America/Costa_Rica'}).format(new Date(iso));
const UNIT_LABEL:Record<string,{es:string;en:string}>={kg:{es:'kg',en:'kg'},l:{es:'litro',en:'liter'},unit:{es:'unidad',en:'unit'},dose:{es:'dosis',en:'dose'}};
export const perUnitLabel=(unit:string,en:boolean)=>(en?'per ':'por ')+(UNIT_LABEL[unit]?.[en?'en':'es']??unit);
export const CONFIDENCE_LABEL:Record<PublicPriceObservation['confidence'],{es:string;en:string}>={
 official:{es:'Dato oficial',en:'Official data'},business:{es:'Informado por el negocio',en:'Reported by the business'},
 community_verified:{es:'Reportado por usuarios · confirmado por varias personas',en:'Reported by users · confirmed by several people'},
 community:{es:'Reportado por usuarios · sin confirmar',en:'Reported by users · unconfirmed'},
};
/** Stored source labels are bilingual («Español / English»): keep the page language. */
export const bilingual=(text:string,en:boolean)=>{const parts=text.split(' / ');return parts.length===2?parts[en?1:0]!.trim():text;};
/** One line with source + date (+ validity), as every shown price must carry. */
export function sourceLine(o:PublicPriceObservation,en:boolean):string{
 const t=(es:string,english:string)=>en?english:es;
 const src=o.sourceKind.startsWith('official')?bilingual(o.source.attribution,en):CONFIDENCE_LABEL[o.confidence][en?'en':'es'];
 return `${src}${o.sourceRef?` · ${o.sourceRef}`:''} · ${t('dato del ','as of ')}${crDay(o.observedAt,en)}`;
}
export function stalenessLine(o:PublicPriceObservation,en:boolean):string{
 const t=(es:string,english:string)=>en?english:es;
 if(o.stale)return o.staleReason==='expired'?t('Vencido: ya no está vigente','Expired: no longer valid'):t('Desactualizado: puede haber cambiado','Out of date: it may have changed');
 return `${t('Se considera vigente hasta el ','Considered current until ')}${crDay(o.validTo&&o.validTo<o.staleAfter?o.validTo:o.staleAfter,en)}`;
}

// ---------------------------------------------------------------- /precios landing and product history (2026-11-19)
// public_price_overview / public_price_history (supabase/migrations/290_price_overview.sql).
export type PriceOverviewItem=PriceSearchItem&{minPrice:number|null;minUnitPrice:number|null};
export type PriceCategory={category:string;vertical:'grocery'|'pharmacy'|'mixed';items:number;priced:number};
export type PriceOverview={asOf:string;vertical:CompareVertical|null;category:string|null;categories:PriceCategory[];items:PriceOverviewItem[];
 totals:{items:number;priced:number;offers:number}};
export type PricePoint={day:string;price:number;unitPrice:number};
export type PriceHistory={item:string;asOf:string;days:number;points:PricePoint[];low30:PricePoint|null};

/** Catalogue category slugs (price_catalog.category) → short labels; unknown slugs are humanized. */
const CATEGORY_LABEL:Record<string,[string,string]>={
 granos:['Granos','Grains and beans'],lacteos:['Lácteos','Dairy'],huevos:['Huevos','Eggs'],carnes:['Carnes','Meat'],pollo:['Pollo','Chicken'],
 pescados:['Pescados y mariscos','Fish and seafood'],frutas_verduras:['Frutas y verduras','Fruit and vegetables'],panaderia:['Panadería','Bakery'],
 abarrotes:['Abarrotes','Pantry'],aceites:['Aceites','Cooking oils'],cafe:['Café','Coffee'],bebidas:['Bebidas','Drinks'],snacks:['Snacks','Snacks'],
 limpieza:['Limpieza','Cleaning'],higiene:['Higiene personal','Personal care'],cuidado_personal:['Cuidado personal','Personal care'],
 bebes:['Bebés','Baby'],mascotas:['Mascotas','Pets'],congelados:['Congelados','Frozen'],enlatados:['Enlatados','Canned food'],
 otc_dolor:['Dolor y fiebre','Pain and fever'],otc_gripe:['Gripe y tos','Cold and cough'],otc_digestivo:['Digestivos','Digestive'],
 otc_alergia:['Alergias','Allergy'],vitaminas:['Vitaminas','Vitamins'],primeros_auxilios:['Primeros auxilios','First aid'],
};
export function categoryLabel(slug:string,en:boolean):string{
 const known=CATEGORY_LABEL[slug];if(known)return known[en?1:0];
 const words=slug.replace(/^otc_/,'').replace(/_/g,' ').trim();
 return words.charAt(0).toUpperCase()+words.slice(1);
}
