import {z} from 'zod';

/** Company › Vendors: directory over the existing Expenses suppliers (also used by purchase orders). */
const id=z.string().uuid();
const revision=z.number().int().min(0).max(999999999);
const optional=(max:number)=>z.string().trim().max(max).nullable().transform(value=>value?value:null);
export const vendorKindSchema=z.enum(['supplier','subcontractor']);
const fields={
 name:z.string().trim().min(1).max(160),
 kind:vendorKindSchema,
 trade:optional(80),
 contactName:optional(160),
 email:z.union([z.literal(''),z.string().trim().email().max(254)]),
 phone:z.string().trim().max(40),
 identification:z.string().trim().max(40),
 notes:optional(2000),
 /** Round 4B: optional address (directory only). Omitted by older clients: the saved one is kept. */
 address:optional(300).optional(),
};
export const companyVendorMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:id,id,...fields}).strict(),
 z.object({action:z.literal('update'),actionId:id,id,revision,...fields}).strict(),
 z.object({action:z.literal('archive'),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('restore'),actionId:id,id,revision}).strict(),
]);
export const companyVendorQuerySchema=z.discriminatedUnion('view',[
 z.object({view:z.literal('list'),status:z.enum(['active','archived']).default('active'),kind:z.enum(['all','supplier','subcontractor']).default('all'),q:z.string().trim().max(100).default(''),after:id.optional()}).strict(),
 z.object({view:z.literal('detail'),id}).strict(),
 z.object({view:z.literal('action'),actionId:id}).strict(),
]);
const cents=z.number().int();
export const companyVendorSchema=z.object({
 id,name:z.string(),kind:vendorKindSchema,trade:z.string().nullable(),contactName:z.string().nullable(),address:z.string().nullable(),email:z.string(),phone:z.string(),identification:z.string(),
 notes:z.string().nullable(),archived:z.boolean(),revision,updatedAt:z.string().nullable(),
 purchaseOrders:z.object({count:z.number().int().min(0),committedCents:cents,paidCents:cents}).strict(),
 expenses:z.object({count:z.number().int().min(0),amountCents:cents,paidCents:cents}).strict(),
}).strict();
export const companyVendorPageSchema=z.object({items:z.array(companyVendorSchema).max(20),nextCursor:id.nullable(),counts:z.object({active:z.number().int(),archived:z.number().int()}).strict()}).strict();
const snapshot=z.object({name:z.string(),kind:vendorKindSchema,trade:z.string().nullable(),contactName:z.string().nullable(),address:z.string().nullable().optional(),email:z.string(),phone:z.string(),identification:z.string(),notes:z.string().nullable(),archived:z.boolean(),revision}).strict();
export const companyVendorDetailSchema=z.object({vendor:companyVendorSchema,history:z.array(z.object({actionId:id,action:z.enum(['create','update','archive','restore']),at:z.string(),before:snapshot.nullable(),after:snapshot}).strict()).max(20)}).strict();
export const companyVendorResultSchema=z.object({vendor:companyVendorSchema}).strict();
export type CompanyVendor=z.infer<typeof companyVendorSchema>;
export type CompanyVendorPage=z.infer<typeof companyVendorPageSchema>;
export type CompanyVendorDetail=z.infer<typeof companyVendorDetailSchema>;
export type CompanyVendorMutation=z.infer<typeof companyVendorMutationSchema>;
export type CompanyVendorKind=z.infer<typeof vendorKindSchema>;
/** Suggestions only; the trade stays free text. */
export const vendorTradeSuggestions:Record<'es'|'en',string[]>={
 es:['Materiales de construcción','Ferretería','Electricidad','Fontanería','Pintura','Carpintería','Ebanistería','Soldadura','Vidrio y aluminio','Pisos y enchapes','Techos','Aire acondicionado','Jardinería','Limpieza','Alquiler de equipo','Transporte'],
 en:['Building materials','Hardware','Electrical','Plumbing','Painting','Carpentry','Cabinetry','Welding','Glass and aluminum','Flooring and tile','Roofing','Air conditioning','Landscaping','Cleaning','Equipment rental','Transport'],
};
