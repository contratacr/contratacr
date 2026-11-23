import {z} from 'zod';
/** Round 7C: company team roles (see docs/pro/team-roles-local.md for the permission matrix). */
export const companyRoles=['admin','manager','member','read_only'] as const;
export type CompanyRole=typeof companyRoles[number];
export const capabilities=['read','work.write','lead.write','sales.write','finance.write','company.write','settings.write','team.manage','inventory.write','listing.publish','price.write','menu.write'] as const;
export type Capability=typeof capabilities[number];
export function roleLabel(role:string,en:boolean){return ({admin:en?'Administrator':'Administrador',manager:en?'Manager':'Gerente',member:en?'Member':'Miembro',read_only:en?'Read-only':'Solo lectura'} as Record<string,string>)[role]??role;}
export function capabilityLabel(cap:string,en:boolean){return ({read:en?'View everything':'Ver todo','work.write':en?'Jobs: tasks, schedule, daily log, time, files, boards':'Trabajos: tareas, cronograma, bitácora, tiempo, archivos, tableros','lead.write':en?'Leads and follow-ups':'Solicitudes y seguimiento','sales.write':en?'Clients, quotes, contracts, change orders':'Clientes, cotizaciones, contratos, extras','finance.write':en?'Invoices, payments, costs, purchase orders':'Facturas, pagos, costos, órdenes de compra','company.write':en?'Catalog, vendors, templates':'Catálogo, proveedores, plantillas','settings.write':en?'Website, marketing, integrations, invoicing settings':'Sitio, marketing, integraciones, ajustes de facturación','team.manage':en?'Manage the team and roles':'Administrar el equipo y los roles','inventory.write':en?'Inventory (vehicles, properties, products)':'Inventario (vehículos, propiedades, productos)','listing.publish':en?'Publish listings':'Publicar anuncios','price.write':en?'Price lists':'Listas de precios','menu.write':en?'Menu':'Menú'} as Record<string,string>)[cap]??cap;}
const iso=z.string().min(1);
export const companyMemberSchema=z.object({id:z.string().uuid(),userId:z.string().uuid(),name:z.string(),email:z.string(),role:z.enum(companyRoles),active:z.boolean(),revision:z.number().int().positive(),since:iso});
export const companyInviteSchema=z.object({id:z.string().uuid(),email:z.string(),role:z.enum(companyRoles),status:z.enum(['pending','accepted','cancelled','expired']),revision:z.number().int().positive(),expiresAt:iso,delivery:z.literal('draft_not_sent'),draft:z.object({subject:z.string(),body:z.string()}),createdAt:iso});
export const companyWorkspaceSchema=z.object({ownerId:z.string().uuid(),ownerName:z.string(),role:z.enum(companyRoles),capabilities:z.array(z.enum(capabilities)),denied:z.record(z.string(),z.array(z.string())).optional()});
export const companyTeamSchema=z.object({
 accountId:z.string().uuid(),workspace:companyWorkspaceSchema.nullable(),
 isOwner:z.boolean(),members:z.array(companyMemberSchema),invites:z.array(companyInviteSchema),
 events:z.array(z.object({id:z.string().uuid(),action:z.string(),actorName:z.string(),at:iso,after:z.unknown()})),
 activity:z.array(z.object({memberName:z.string(),role:z.string(),capability:z.string(),path:z.string(),at:iso})),
 memberships:z.array(z.object({ownerId:z.string().uuid(),memberId:z.string().uuid(),revision:z.number().int(),role:z.enum(companyRoles),ownerName:z.string()})),
 matrix:z.record(z.string(),z.array(z.enum(capabilities))),
});
export type CompanyTeam=z.infer<typeof companyTeamSchema>;
export const companyTeamMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('invite'),actionId:z.string().uuid(),email:z.string().trim().toLowerCase().email().max(254),role:z.enum(companyRoles),code:z.string().regex(/^[0-9A-HJKMNP-TV-Z]{16}$/),locale:z.enum(['es','en'])}).strict(),
 z.object({action:z.literal('cancel_invite'),actionId:z.string().uuid(),inviteId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('accept'),actionId:z.string().uuid(),code:z.string().trim().min(16).max(24)}).strict(),
 z.object({action:z.literal('set_role'),actionId:z.string().uuid(),memberId:z.string().uuid(),revision:z.number().int().positive(),role:z.enum(companyRoles)}).strict(),
 z.object({action:z.literal('remove'),actionId:z.string().uuid(),memberId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('leave'),actionId:z.string().uuid(),ownerId:z.string().uuid(),memberId:z.string().uuid(),revision:z.number().int().positive()}).strict(),
 z.object({action:z.literal('enter'),ownerId:z.string().uuid()}).strict(),
 z.object({action:z.literal('exit')}).strict(),
]);
export type CompanyTeamMutation=z.infer<typeof companyTeamMutationSchema>;
const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newCompanyInviteCode(){return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>CROCKFORD[n&31]).join('');}
export function normalizeCompanyInviteCode(value:string){return value.trim().toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');}
/** Lead assignment (Asignado a). */
export const leadAssigneeSchema=z.object({userId:z.string().uuid(),name:z.string(),role:z.enum(companyRoles)});
export const leadAssignmentSchema=z.object({assigneeId:z.string().uuid().nullable(),revision:z.number().int().nonnegative()});
export const leadAssignMutationSchema=z.object({action:z.literal('assign'),actionId:z.string().uuid(),kind:z.enum(['manual','request']),id:z.string().uuid(),assigneeId:z.string().uuid().nullable(),revision:z.number().int().nonnegative()}).strict();
