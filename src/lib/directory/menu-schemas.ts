import {z} from 'zod';
import type {MenuPriceBreakdown} from './menu-price';

// LOCAL PRO ONLY (multivertical P2). zod mirrors of pro-menu-local.sql (the database checks again) and the shapes of
// pro_menu_read / dir_place_menu_public. Messages in Spanish («usted»); the API answers a stable `reason` and the UI
// translates it with menuErrorText(). Dishes are per place: nothing here touches price_items/price_observations.

export const MENU_DIETARY_TAGS=['vegetariano','vegano','sin_gluten','picante'] as const;
export type MenuDietaryTag=typeof MENU_DIETARY_TAGS[number];
export const MENU_AVAILABILITY=['available','sold_out','unavailable'] as const;
export type MenuAvailability=typeof MENU_AVAILABILITY[number];
export const MENU_MAX_SECTIONS=40,MENU_MAX_ITEMS=300,MENU_MAX_PRICE_MINOR=1_000_000_000;

export const MENU_DIETARY_LABELS:Record<MenuDietaryTag,{es:string;en:string}>={
 vegetariano:{es:'Vegetariano',en:'Vegetarian'},vegano:{es:'Vegano',en:'Vegan'},
 sin_gluten:{es:'Sin gluten',en:'Gluten-free'},picante:{es:'Picante',en:'Spicy'},
};
export const MENU_AVAILABILITY_LABELS:Record<MenuAvailability,{es:string;en:string}>={
 available:{es:'Disponible',en:'Available'},sold_out:{es:'Agotado',en:'Sold out'},unavailable:{es:'No disponible (oculto)',en:'Unavailable (hidden)'},
};

const req=(max:number,msg:string)=>z.string().trim().min(1,msg).max(max);
const opt=(max:number)=>z.union([z.string().trim().min(1).max(max),z.null(),z.literal('').transform(()=>null)]).optional();
const hhmm=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/,'Use HH:MM.');
const uuid=z.string().uuid();

/** Tags: known, no repeats; «vegano» always carries «vegetariano» (added automatically). */
export const menuDietarySchema=z.array(z.enum(MENU_DIETARY_TAGS)).max(4).transform(tags=>{
 const set=new Set(tags);if(set.has('vegano'))set.add('vegetariano');return MENU_DIETARY_TAGS.filter(t=>set.has(t));
});

export const menuItemFieldsSchema=z.object({
 nameEs:req(120,'Escriba el nombre del plato.'),nameEn:opt(120),
 descriptionEs:opt(500),descriptionEn:opt(500),
 priceMinor:z.number().int('Precio inválido.').min(0,'Precio inválido.').max(MENU_MAX_PRICE_MINOR,'Precio demasiado alto.'),
 dietary:menuDietarySchema.default([]),
 availability:z.enum(MENU_AVAILABILITY).default('available'),
 availableFrom:z.union([hhmm,z.null()]).optional(),availableUntil:z.union([hhmm,z.null()]).optional(),
 photoUrl:z.union([z.string().trim().max(1000).regex(/^https:\/\/[^\s"<>]{8,}$/,'Use una dirección https://.'),z.null(),z.literal('').transform(()=>null)]).optional(),
 photoAltEs:opt(200),photoAltEn:opt(200),
 status:z.enum(['draft','published']).default('draft'),
}).strict().superRefine((v,ctx)=>{
 if((v.availableFrom==null)!==(v.availableUntil==null))ctx.addIssue({code:'custom',path:['availableFrom'],message:'Indique las dos horas o ninguna.'});
 if(v.availableFrom!=null&&v.availableFrom===v.availableUntil)ctx.addIssue({code:'custom',path:['availableUntil'],message:'Las horas no pueden ser iguales.'});
 if(!v.photoUrl&&(v.photoAltEs||v.photoAltEn))ctx.addIssue({code:'custom',path:['photoAltEs'],message:'El texto alternativo requiere una foto.'});
});
export type MenuItemFields=z.input<typeof menuItemFieldsSchema>;
export const menuSectionFieldsSchema=z.object({nameEs:req(80,'Escriba el nombre de la sección.'),nameEn:opt(80),descriptionEs:opt(300),descriptionEn:opt(300)}).strict();

const base={actionId:uuid,placeId:uuid};
const rev=z.number().int().nonnegative();
const idList=z.array(uuid).min(1).max(MENU_MAX_ITEMS).refine(a=>new Set(a).size===a.length,'Hay valores repetidos.');
export const menuMutationSchema=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('settings'),revision:rev,pricesIncludeIva:z.boolean(),pricesIncludeService:z.boolean(),serviceCharge:z.boolean()}).strict()
  .refine(v=>v.serviceCharge||!v.pricesIncludeService,{message:'Si no cobra servicio, el precio no puede incluirlo.',path:['pricesIncludeService']}),
 z.object({...base,action:z.literal('section_create'),sectionId:uuid,section:menuSectionFieldsSchema}).strict(),
 z.object({...base,action:z.literal('section_update'),sectionId:uuid,revision:rev,section:menuSectionFieldsSchema}).strict(),
 z.object({...base,action:z.literal('section_archive'),sectionId:uuid,revision:rev}).strict(),
 z.object({...base,action:z.literal('sections_reorder'),sectionIds:idList.refine(a=>a.length<=MENU_MAX_SECTIONS)}).strict(),
 z.object({...base,action:z.literal('item_create'),itemId:uuid,sectionId:uuid,item:menuItemFieldsSchema}).strict(),
 z.object({...base,action:z.literal('item_update'),itemId:uuid,revision:rev,sectionId:uuid,item:menuItemFieldsSchema}).strict(),
 z.object({...base,action:z.literal('item_archive'),itemId:uuid,revision:rev}).strict(),
 z.object({...base,action:z.literal('items_reorder'),sectionId:uuid,itemIds:idList}).strict(),
 z.object({...base,action:z.literal('items_publish'),itemIds:idList}).strict(),
]);
export type MenuMutation=z.infer<typeof menuMutationSchema>;

/** Owner review of a menu-from-photo draft. Imported items are ALWAYS created as drafts (status omitted/'draft'). */
const importItem=z.object({itemId:uuid,item:menuItemFieldsSchema.refine(i=>i.status!=='published',{message:'Los platos importados empiezan como borrador.',path:['status']})}).strict();
export const menuImportReviewSchema=z.discriminatedUnion('decision',[
 z.object({...base,draftId:uuid,decision:z.literal('discard')}).strict(),
 z.object({...base,draftId:uuid,decision:z.literal('apply'),sections:z.array(z.object({sectionId:uuid,section:menuSectionFieldsSchema.optional(),
  items:z.array(importItem).min(1).max(150)}).strict()).min(1).max(MENU_MAX_SECTIONS)
  .refine(s=>s.reduce((n,x)=>n+x.items.length,0)<=MENU_MAX_ITEMS,'Demasiados platos.')}).strict(),
]);
export type MenuImportReview=z.infer<typeof menuImportReviewSchema>;

// ---------------------------------------------------------------- readers
export type MenuSettings={pricesIncludeIva:boolean;pricesIncludeService:boolean;serviceCharge:boolean;ivaRateBps:number;serviceRateBps:number;revision:number;menuVersion:number};
type ItemBase={nameEs:string;nameEn:string|null;descriptionEs:string|null;descriptionEn:string|null;priceMinor:number;price:MenuPriceBreakdown;
 dietary:MenuDietaryTag[];availability:MenuAvailability;availableFrom:string|null;availableUntil:string|null;photoUrl:string|null;photoAltEs:string|null;photoAltEn:string|null};
export type PublicMenuItem=ItemBase;
/** dir_place_menu_public(slug): no ids, revisions, origins or actors. */
export type PublicMenu={slug:string;name:string;currency:string;
 pricing:{pricesIncludeIva:boolean;pricesIncludeService:boolean;serviceCharge:boolean;ivaRateBps:number;serviceRateBps:number};
 sections:{nameEs:string;nameEn:string|null;descriptionEs:string|null;descriptionEn:string|null;items:PublicMenuItem[]}[];updatedAt:string};
export type EditorMenuItem=ItemBase&{id:string;status:'draft'|'published';origin:'manual'|'photo_import';revision:number};
export type EditorMenuSection={id:string;nameEs:string;nameEn:string|null;descriptionEs:string|null;descriptionEn:string|null;revision:number;items:EditorMenuItem[]};
export type MenuImportDraft={id:string;mode:'mock'|'sandbox'|'production';model:string;status:'ready'|'failed';extraction:MenuExtractionShape|null;error:string|null;review:null|'applied'|'discarded';appliedItems:number|null;createdAt:string;replayed?:boolean};
/** pro_menu_read(actor, member, placeId). */
export type EditorMenu={placeId:string;slug:string;name:string;placeStatus:string;currency:string;settings:MenuSettings;sections:EditorMenuSection[];imports:MenuImportDraft[]};
export type MenuMutationResult={action:string;placeId:string;id:string|null;revision:number|null;menuVersion:number;settingsRevision:number;replayed?:boolean};

/** Normalised extraction stored by pro_menu_import_record (see menu-import.ts). */
export type MenuExtractionShape={language:'es'|'en';currency:'CRC'|'USD';pricesIncludeIva:boolean|null;pricesIncludeService:boolean|null;
 sections:{name:string;items:{name:string;description:string|null;priceMinor:number|null;dietary:MenuDietaryTag[];confidence:'low'|'medium'|'high'}[]}[];warnings:string[]};

// ---------------------------------------------------------------- errors
export const MENU_ERROR_HINTS={
 menu_not_manager:{status:403,code:'not_manager'},menu_place_unclaimed:{status:403,code:'place_unclaimed'},menu_role:{status:403,code:'role'},menu_price_role:{status:403,code:'price_role'},
 menu_vertical:{status:400,code:'vertical'},menu_section_not_empty:{status:409,code:'section_not_empty'},menu_order_stale:{status:409,code:'conflict'},
 menu_section_cap:{status:409,code:'section_cap'},menu_item_cap:{status:409,code:'item_cap'},menu_section_missing:{status:404,code:'not_found'},
 menu_item_missing:{status:404,code:'not_found'},menu_import_reviewed:{status:409,code:'import_reviewed'},menu_import_failed:{status:400,code:'import_failed'},
 menu_import_never_publishes:{status:400,code:'import_draft_only'},menu_action_reused:{status:400,code:'invalid'},
} as const satisfies Record<string,{status:number;code:string}>;
export const menuErrorCopy:Record<string,{es:string;en:string}>={
 not_manager:{es:'Su cuenta no administra este negocio.',en:'Your account does not manage this business.'},
 place_unclaimed:{es:'Primero reclame y verifique el negocio para editar el menú.',en:'Claim and verify the business first to edit the menu.'},
 role:{es:'Su rol en esta empresa no permite editar el menú.',en:'Your role in this company does not allow editing the menu.'},
 price_role:{es:'Su rol puede editar el menú y guardar borradores, pero solo un administrador o encargado publica platos y precios.',en:'Your role can edit the menu and save drafts, but only an administrator or manager publishes dishes and prices.'},
 module_unavailable:{es:'El módulo de menú no está activo en su edición Pro.',en:'The menu module is not active in your Pro edition.'},
 vertical:{es:'El menú solo está disponible para restaurantes.',en:'Menus are only available for restaurants.'},
 section_not_empty:{es:'Mueva o archive los platos antes de archivar la sección.',en:'Move or archive the dishes before archiving the section.'},
 conflict:{es:'El menú cambió en otra pantalla. Recargue y vuelva a intentarlo.',en:'The menu changed elsewhere. Reload and try again.'},
 section_cap:{es:'Alcanzó el máximo de 40 secciones.',en:'You reached the maximum of 40 sections.'},
 item_cap:{es:'Alcanzó el máximo de 300 platos.',en:'You reached the maximum of 300 dishes.'},
 not_found:{es:'Ese elemento ya no está disponible.',en:'That item is no longer available.'},
 import_reviewed:{es:'Esta importación ya se revisó.',en:'This import was already reviewed.'},
 import_failed:{es:'No se pudo leer el menú de la foto. Intente con otra foto más nítida.',en:'The menu could not be read from the photo. Try a sharper photo.'},
 import_draft_only:{es:'Los platos importados se agregan como borrador; publíquelos después de revisarlos.',en:'Imported dishes are added as drafts; publish them after reviewing.'},
 consent_required:{es:'Active primero la autorización de uso de IA en Empresa › Configuración › Integraciones.',en:'First turn on the AI data-processing authorization in Company › Settings › Integrations.'},
 unsupported_file:{es:'Use una foto JPG, PNG o WebP de hasta 5 MB.',en:'Use a JPG, PNG or WebP photo up to 5 MB.'},
 invalid:{es:'Revise los datos del menú.',en:'Please check the menu details.'},
 unavailable:{es:'No se pudo completar la operación. Reintente.',en:'The operation could not be completed. Please retry.'},
};
export const menuErrorText=(reason:string|undefined,locale:'es'|'en')=>(menuErrorCopy[reason??'']??menuErrorCopy.unavailable!)[locale];
