import {z} from 'zod';
/**
 * Row 17 (2026-11-23): fine permissions by module and action. A second layer under the role capabilities:
 * the Administrator can only DENY an action (view, edit, delete, export) in a module for a role or custom role.
 * Mirrors SQL in supabase/migrations/404_pro_27_module_permissions.sql (the server decides; this only labels and hides).
 */
export const PERMISSION_MODULES=['work','lead','sales','finance','company','settings','inventory','listing','price','menu'] as const;
export const PERMISSION_ACTIONS=['view','edit','delete','export'] as const;
export type PermissionModule=typeof PERMISSION_MODULES[number];
export type PermissionAction=typeof PERMISSION_ACTIONS[number];
const id=z.string().uuid();
export const moduleDeniesSchema=z.record(z.string(),z.partialRecord(z.enum(PERMISSION_MODULES),z.array(z.enum(PERMISSION_ACTIONS)).max(4)));
export type ModuleDenies=z.infer<typeof moduleDeniesSchema>;
export const modulePermissionsSchema=z.object({revision:z.number().int().min(0),canManage:z.boolean(),modules:z.array(z.string()),actions:z.array(z.string()),
 subjects:z.array(z.object({key:z.string(),kind:z.enum(['role','custom']),name:z.string()}).strict()),denies:moduleDeniesSchema}).strict();
export type ModulePermissions=z.infer<typeof modulePermissionsSchema>;
export const modulePermissionsMutationSchema=z.object({action:z.literal('save'),actionId:id,revision:z.number().int().min(0).max(2147483646),denies:moduleDeniesSchema}).strict();
export const modulePermissionsResultSchema=z.object({revision:z.number().int().positive(),denies:moduleDeniesSchema,replayed:z.boolean().optional()}).strict();
export const moduleDeniedSchema=z.record(z.string(),z.array(z.string())).optional();
export function moduleLabel(m:string,en:boolean){return ({work:en?'Jobs':'Trabajos',lead:en?'Leads':'Solicitudes',sales:en?'Sales (clients, quotes, contracts)':'Ventas (clientes, cotizaciones, contratos)',finance:en?'Finance (invoices, payments, costs)':'Finanzas (facturas, pagos, costos)',company:en?'Catalog and templates':'Catálogo y plantillas',settings:en?'Settings and integrations':'Ajustes e integraciones',inventory:en?'Inventory':'Inventario',listing:en?'Listings':'Anuncios',price:en?'Price lists':'Listas de precios',menu:en?'Menu':'Menú'} as Record<string,string>)[m]??m;}
export function actionLabel(a:string,en:boolean){return ({view:en?'View':'Ver',edit:en?'Create and edit':'Crear y editar',delete:en?'Delete':'Borrar',export:en?'Export and print':'Exportar e imprimir'} as Record<string,string>)[a]??a;}
/** Same rule as SQL pro_route_action. */
export function routeAction(method:string,path:string):PermissionAction{const m=method.toUpperCase();if(m==='GET'||m==='HEAD'||m==='OPTIONS')return /(print|export|csv|pdf)/i.test(path)?'export':'view';return m==='DELETE'?'delete':'edit';}
/** Same rule as SQL pro_module_of_capability. */
export function moduleOfCapability(cap:string):PermissionModule|null{return ({'work.write':'work','lead.write':'lead','sales.write':'sales','finance.write':'finance','company.write':'company','settings.write':'settings','inventory.write':'inventory','listing.publish':'listing','price.write':'price','menu.write':'menu'} as Record<string,PermissionModule>)[cap]??null;}
/** Normalise like SQL: drop empty modules/roles, dedupe, jobs can never be hidden. */
export function normalizeDenies(d:ModuleDenies):ModuleDenies{const out:ModuleDenies={};for(const [s,mods] of Object.entries(d))for(const [m,acts] of Object.entries(mods)){const list=[...new Set(acts)].filter(a=>!(m==='work'&&a==='view'));if(list.length){out[s]??={};out[s][m as PermissionModule]=list as PermissionAction[];}}return out;}
export function isDenied(denied:Record<string,string[]>|undefined,module:string,action:string){return !!denied?.[module]?.includes(action);}
