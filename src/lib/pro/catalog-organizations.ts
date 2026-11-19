import {z} from 'zod';
export const organizationKindSchema=z.enum(['client_group','product_category']);
export type OrganizationKind=z.infer<typeof organizationKindSchema>;
export const organizationNameSchema=z.string().trim().min(1,'Escriba un nombre.').max(80,'El nombre admite hasta 80 caracteres.');
export const organizationMutationSchema=z.object({kind:organizationKindSchema,action:z.enum(['create','rename','archive','restore']),id:z.uuid(),revision:z.number().int().nonnegative(),name:organizationNameSchema.optional()}).superRefine((v,c)=>{if((v.action==='create'||v.action==='rename')&&!v.name)c.addIssue({code:'custom',path:['name'],message:'Escriba un nombre.'});});
export type CatalogOrganization={id:string;name:string;archived:boolean;recordCount:number;aliasCount:number};
export type ExistingOrganization={name:string;recordCount:number};
export type OrganizationPage={items:CatalogOrganization[];nextCursor:string|null;revision:number};
