import {z} from 'zod';
import {projectSchema,projectsPageSchema} from '@/lib/pro/projects';

/**
 * Detalles del proyecto. Mirrors docs/pro/sql/project-notes-details-local.sql.
 * Colours are a closed named palette (no free hex). Swatches meet 3:1 against white
 * (non-text contrast) and every swatch is always shown next to its name.
 */
export const projectColors=['blue','teal','green','olive','amber','orange','red','magenta','purple','gray'] as const;
export type ProjectColor=typeof projectColors[number];
export const projectColorHex:Record<ProjectColor,string>={blue:'#1f5fbf',teal:'#00798c',green:'#2e7d32',olive:'#66721c',amber:'#a86b00',orange:'#c2410c',red:'#b42318',magenta:'#a3227a',purple:'#6941c6',gray:'#5b6575'};
export const projectColorNames:Record<'es'|'en',Record<ProjectColor,string>>={
 es:{blue:'Azul',teal:'Turquesa',green:'Verde',olive:'Oliva',amber:'Ámbar',orange:'Naranja',red:'Rojo',magenta:'Magenta',purple:'Morado',gray:'Gris'},
 en:{blue:'Blue',teal:'Teal',green:'Green',olive:'Olive',amber:'Amber',orange:'Orange',red:'Red',magenta:'Magenta',purple:'Purple',gray:'Gray'},
};
export const projectTypeKeys=['remodel','new_construction','addition','maintenance','repair','design','commercial'] as const;
export type ProjectTypeKey=typeof projectTypeKeys[number];
export const projectTypeNames:Record<'es'|'en',Record<ProjectTypeKey,string>>={
 es:{remodel:'Remodelación',new_construction:'Construcción nueva',addition:'Ampliación',maintenance:'Mantenimiento',repair:'Reparación',design:'Diseño',commercial:'Obra comercial'},
 en:{remodel:'Remodel',new_construction:'New construction',addition:'Addition',maintenance:'Maintenance',repair:'Repair',design:'Design',commercial:'Commercial work'},
};
/** Same ordinary IVA codes as invoice-tax.ts (VAT_OPTIONS). */
export const projectVatCodes=['01','02','03','04','08','09','10','11'] as const;
export type ProjectVatCode=typeof projectVatCodes[number];
export const PROJECT_CODE=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$/;
export const PROJECT_TAG_LIMIT=10;
/** Same ceiling as zod (detailsSaveSchema) and SQL (budget_cents ≤ 10^13): ₡100 000 000 000. */
export const PROJECT_BUDGET_MAX_CENTS=10000000000000;
/** Planned budget typed by the user: the same grouping rules as colonesToCents (₡, spaces, «.» or «,»
 * thousands, up to two decimals) but WITHOUT its 8-digit limit, and with its own result when it is too large. */
export function projectBudgetToCents(value:string):{cents:number}|{error:'format'|'max'}{
 const clean=value.trim().replace(/[₡\s]/g,'');let normalized=clean;
 if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(clean))normalized=clean.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(clean))normalized=clean.replace(/,/g,'');
 else normalized=clean.replace(',','.');
 const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);if(!match)return{error:'format'};
 const whole=match[1].replace(/^0+(?=\d)/,'');if(whole.length>12)return{error:'max'};
 const cents=Number(whole)*100+Number((match[2]??'').padEnd(2,'0'));
 return cents<=PROJECT_BUDGET_MAX_CENTS?{cents}:{error:'max'};
}

const id=z.string().uuid();
const workId=z.string().trim().min(1).max(160);
const optional=(max:number)=>z.string().trim().max(max).nullable().transform(value=>value?value:null);
const tagName=z.string().trim().min(1).max(40).refine(value=>!/[\r\n\t]/.test(value));
const catalogRevision=z.number().int().min(0).max(2147483646);
export const detailsSaveSchema=z.object({
 action:z.literal('save'),actionId:id,workId,revision:z.number().int().min(0).max(2147483646),
 color:z.enum(projectColors).nullable(),typeId:id.nullable(),
 code:z.string().trim().max(24).nullable().transform(value=>value?value:null).refine(value=>value===null||PROJECT_CODE.test(value)),
 budgetCents:z.number().int().min(0).max(10000000000000).nullable(),
 address:optional(300),billingAddress:optional(300),shippingAddress:optional(300),
 defaultVatCode:z.enum(projectVatCodes).nullable(),
 tags:z.array(tagName).max(PROJECT_TAG_LIMIT).refine(list=>new Set(list.map(tag=>tag.toLocaleLowerCase('es'))).size===list.length,'duplicated'),
}).strict();
export const detailsMutationSchema=z.discriminatedUnion('action',[
 detailsSaveSchema,
 z.object({action:z.literal('type_create'),actionId:id,catalogRevision,id,name:z.string().trim().min(1).max(60)}).strict(),
 z.object({action:z.literal('type_rename'),actionId:id,catalogRevision,typeId:id,name:z.string().trim().min(1).max(60)}).strict(),
 z.object({action:z.literal('type_archive'),actionId:id,catalogRevision,typeId:id}).strict(),
 z.object({action:z.literal('type_restore'),actionId:id,catalogRevision,typeId:id}).strict(),
 z.object({action:z.literal('tag_rename'),actionId:id,catalogRevision,tagId:id,name:tagName}).strict(),
 z.object({action:z.literal('tag_delete'),actionId:id,catalogRevision,tagId:id}).strict(),
]);
export type DetailsMutation=z.infer<typeof detailsMutationSchema>;
export const detailsQuerySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('detail'),workId}).strict(),
 z.object({view:z.literal('catalog')}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
const stamp=z.string().min(1);
const tagRef=z.object({id,name:z.string()}).strict();
export const projectTypeSchema=z.object({id,systemKey:z.enum(projectTypeKeys).nullable(),name:z.string().nullable(),archived:z.boolean(),projectCount:z.number().int().nonnegative()}).strict();
export type ProjectType=z.infer<typeof projectTypeSchema>;
export const projectTagSchema=z.object({id,name:z.string(),projectCount:z.number().int().nonnegative()}).strict();
export const projectCatalogSchema=z.object({revision:z.number().int().nonnegative(),types:z.array(projectTypeSchema).max(50),tags:z.array(projectTagSchema).max(200)}).strict();
export type ProjectCatalog=z.infer<typeof projectCatalogSchema>;
export const projectDetailsSchema=z.object({
 workId:z.string(),color:z.enum(projectColors).nullable(),typeId:id.nullable(),code:z.string().nullable(),budgetCents:z.number().int().nullable(),
 address:z.string().nullable(),billingAddress:z.string().nullable(),shippingAddress:z.string().nullable(),
 billingSameAsAddress:z.boolean(),shippingSameAsAddress:z.boolean(),effectiveBillingAddress:z.string().nullable(),effectiveShippingAddress:z.string().nullable(),
 defaultVatCode:z.enum(projectVatCodes).nullable(),tags:z.array(tagRef).max(PROJECT_TAG_LIMIT),revision:z.number().int().nonnegative(),updatedAt:stamp.nullable(),
}).strict();
export type ProjectDetails=z.infer<typeof projectDetailsSchema>;
export const detailsReadSchema=z.object({
 details:projectDetailsSchema,
 history:z.array(z.object({actionId:id,action:z.enum(['save','tag_removed']),at:stamp,before:projectDetailsSchema.nullable(),after:projectDetailsSchema}).strict()).max(20),
 catalog:projectCatalogSchema,
 project:z.object({workId:z.string(),name:z.string(),client:z.string(),status:z.enum(['open','in_progress','completed','cancelled']),suggestedAddress:z.string().nullable()}).strict(),
}).strict();
export type DetailsRead=z.infer<typeof detailsReadSchema>;
export const detailsResultSchema=z.union([z.object({details:projectDetailsSchema,catalog:projectCatalogSchema}).strict(),z.object({catalog:projectCatalogSchema}).strict()]);

/** Projects hub v2 (pro_projects_page_v2): v1 rows plus colour, code, type and tags. */
export const projectHubRowSchema=projectSchema.extend({
 color:z.enum(projectColors).nullable(),code:z.string().nullable(),
 type:z.object({id,systemKey:z.enum(projectTypeKeys).nullable(),name:z.string().nullable()}).strict().nullable(),
 tags:z.array(tagRef).max(PROJECT_TAG_LIMIT),
}).strict();
export type ProjectHubRow=z.infer<typeof projectHubRowSchema>;
export const projectHubPageSchema=projectsPageSchema.extend({
 items:z.array(projectHubRowSchema).max(20),
 filters:z.object({types:z.array(projectTypeSchema).max(50),tags:z.array(projectTagSchema).max(200)}).strict(),
}).strict();
export type ProjectHubPage=z.infer<typeof projectHubPageSchema>;
export const projectHubQuerySchema=z.object({
 v:z.literal('2'),status:z.enum(['active','open','in_progress','completed','cancelled','all']).default('active'),q:z.string().max(160).default(''),
 after:z.coerce.number().int().positive().optional(),type:id.optional(),tag:id.optional(),
}).strict();

export function projectTypeLabel(type:{systemKey:ProjectTypeKey|null;name:string|null}|null,en:boolean){
 if(!type)return null;return type.name??(type.systemKey?projectTypeNames[en?'en':'es'][type.systemKey]:null);
}
