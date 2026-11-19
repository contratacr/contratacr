import {z} from 'zod';

// LOCAL PRO ONLY (multivertical P1). zod mirrors of the checks in price-observations-local.sql; the database checks
// again (and alone enforces the prescription rule, CAS-free append-only storage and staleness). Messages in Spanish
// («usted»); the API answers with the stable error code and the UI translates it.

export const PRICE_ITEM_KINDS=['fuel','lpg','medicine','grocery','generic'] as const;
export const PRICE_SOURCE_KINDS=['business','official_aresep','official_meic','user_report'] as const;
export const PRICE_MODERATION_STATUSES=['pending','published','rejected','superseded'] as const;
export const PRICE_CONFIDENCES=['official','business','community_verified','community'] as const;
export const PRICE_UNIT_BASES=['l','ml','kg','g','unit','dose'] as const;
export type PriceItemKind=(typeof PRICE_ITEM_KINDS)[number];
export type PriceSourceKind=(typeof PRICE_SOURCE_KINDS)[number];
export type PriceConfidence=(typeof PRICE_CONFIDENCES)[number];

/** GTIN-8/12/13/14 with a valid GS1 check digit (same rule as price_gtin_ok). */
export function gtinIsValid(value:string):boolean{
 if(!/^(\d{8}|\d{12,14})$/.test(value))return false;
 const d=value.padStart(14,'0');let sum=0;
 for(let i=0;i<13;i++)sum+=Number(d[i])*(i%2===0?3:1);
 return (10-sum%10)%10===Number(d[13]);
}

const slug=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/,'Use minúsculas, números y guiones (3 a 80).');
const uuid=z.uuid();
const iso=z.iso.datetime({offset:true});
const money=z.number().positive('El precio debe ser mayor que cero.').lt(100_000_000).refine(n=>Math.round(n*100)===n*100,'Use como máximo dos decimales.');
const currency=z.string().regex(/^[A-Z]{3}$/);

export const priceItemSchema=z.object({
 actionId:uuid,slug,kind:z.enum(PRICE_ITEM_KINDS).optional(),
 name:z.string().trim().min(2,'Escriba el nombre.').max(160).optional(),
 gtin:z.union([z.string().refine(gtinIsValid,'Código de barras (GTIN) inválido.'),z.literal('')]).optional(),
 officialCode:z.union([z.string().regex(/^[a-z0-9][a-z0-9:._-]{1,59}$/),z.literal('')]).optional(),
 presentation:z.string().trim().max(120).optional(),
 unitBase:z.enum(PRICE_UNIT_BASES).optional(),unitQty:z.number().positive().optional(),
 rxRequired:z.boolean().optional(),active:z.boolean().optional(),
}).strict().superRefine((v,ctx)=>{
 if(v.rxRequired&&v.kind&&v.kind!=='medicine')ctx.addIssue({code:'custom',path:['rxRequired'],message:'Solo los medicamentos pueden requerir receta.'});
 // Medicine without an explicit rxRequired is treated as prescription-only by the database (safe side).
});

const evidence=z.object({mediaId:uuid.optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/i)}).strict();
const base={
 actionId:uuid,observationId:uuid.optional(),itemSlug:slug,price:money,currency:currency.optional(),sourceId:z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/).optional(),
 sourceRef:z.string().trim().min(1).max(120).optional(),observedAt:iso,validFrom:iso.optional(),validTo:iso.optional(),evidence:evidence.optional(),
};
const place={placeId:uuid.optional(),placeSlug:slug.optional()};
export const priceObservationSchema=z.discriminatedUnion('sourceKind',[
 z.object({sourceKind:z.literal('official_aresep'),...base,sourceRef:z.string().trim().min(1).max(120)}).strict(),
 z.object({sourceKind:z.literal('official_meic'),...base,...place}).strict(),
 z.object({sourceKind:z.literal('business'),...base,...place}).strict(),
 z.object({sourceKind:z.literal('user_report'),...base,...place}).strict(),
]).superRefine((v,ctx)=>{
 if(v.sourceKind!=='official_aresep'&&!('placeId' in v&&v.placeId)&&!('placeSlug' in v&&v.placeSlug))ctx.addIssue({code:'custom',path:['placeSlug'],message:'Indique el comercio.'});
 if(v.validTo&&Date.parse(v.validTo)<=Date.parse(v.validFrom??v.observedAt))ctx.addIssue({code:'custom',path:['validTo'],message:'La vigencia debe terminar después de empezar.'});
 if(Date.parse(v.observedAt)>Date.now()+5*60_000)ctx.addIssue({code:'custom',path:['observedAt'],message:'La fecha no puede estar en el futuro.'});
});
export type PriceObservationInput=z.infer<typeof priceObservationSchema>;

export const officialPriceSetSchema=z.object({
 actionId:uuid,sourceKind:z.enum(['official_aresep','official_meic']),sourceId:z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/).optional(),
 sourceRef:z.string().trim().min(1).max(120),observedAt:iso,validFrom:iso,validTo:iso.optional(),placeId:uuid.optional(),
 prices:z.array(z.object({itemSlug:slug,price:money,currency:currency.optional()}).strict()).min(1).max(50)
  .refine(a=>new Set(a.map(p=>p.itemSlug)).size===a.length,'Hay productos repetidos.'),
}).strict().refine(v=>!v.validTo||Date.parse(v.validTo)>Date.parse(v.validFrom),{path:['validTo'],message:'La vigencia debe terminar después de empezar.'})
 .refine(v=>v.sourceKind!=='official_aresep'||!v.placeId,{path:['placeId'],message:'Los precios regulados son nacionales.'});

export const priceModerationSchema=z.object({actionId:uuid,observationId:uuid,decision:z.enum(['publish','reject']),note:z.string().trim().max(1000).optional()}).strict();

/** Local ARESEP fuel file read by scripts/directory/import-aresep-fuel.mjs (the script validates the same shape in JS). */
export const ARESEP_FUEL_PRODUCTS=['regular','super','diesel','lpg'] as const;
export const aresepFuelFileSchema=z.object({
 source:z.literal('aresep'),resolution:z.string().regex(/^RE-\d{1,5}-[A-Z]{1,4}-\d{4}$/,'Número de resolución inválido (RE-####-IE-AAAA).'),
 publishedAt:iso,validFrom:iso,validTo:iso.optional(),currency:z.literal('CRC').optional(),
 prices:z.array(z.object({product:z.enum(ARESEP_FUEL_PRODUCTS),pricePerLiter:money}).strict()).min(1).max(10)
  .refine(a=>new Set(a.map(p=>p.product)).size===a.length,'Hay productos repetidos.'),
}).strict();

/** Public reader shape (public_price_current). No internal ids, reporter ids or evidence ids. */
export type PublicPriceObservation={price:number;currency:string;unitPrice:number;unitBase:string;sourceKind:PriceSourceKind;confidence:PriceConfidence;
 regulated:boolean;source:{name:string;attribution:string;url:string|null};sourceRef:string|null;observedAt:string;validFrom:string;validTo:string|null;
 staleAfter:string;hasEvidence:boolean;stale:boolean;staleReason:'expired'|'stale'|null};
export type PublicPriceItem={item:{slug:string;kind:PriceItemKind;name:string;presentation:string|null;unitBase:string;unitQty:number;gtin:string|null;officialCode:string|null};
 current:PublicPriceObservation|null;lastKnown:PublicPriceObservation|null};
export type PublicPriceCurrent={placeSlug:string|null;national:boolean;asOf:string;items:PublicPriceItem[]};
