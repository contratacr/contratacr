import {z} from 'zod';
import type {ProEdition} from './editions';
import {prefijoDeIdioma} from "@/lib/prefijo-de-idioma";
// Same list as PRO_EDITIONS (editions.ts); kept import-free so the node unit test can load this module directly.
const PRO_EDITIONS=['servicios','autos','restaurantes','bienes_raices','comercio'] as const satisfies readonly ProEdition[];
const isProEdition=(v:unknown):v is ProEdition=>typeof v==='string'&&(PRO_EDITIONS as readonly string[]).includes(v);

/**
 * Gaps round (2026-11-17): self-service edition picker (Pro › Ediciones). Browser-safe.
 * The four editions offered at launch; `bienes_raices` exists in the SQL model but its property classifieds are flagged
 * off (verticals plan 2026-11-16), so it is only shown when the workspace already has it (set by an administrator).
 */
export const PRO_CHOOSABLE_EDITIONS=['servicios','autos','restaurantes','comercio'] as const satisfies readonly ProEdition[];
export type ProChoosableEdition=typeof PRO_CHOOSABLE_EDITIONS[number];
export const editionChoiceSchema=z.object({
 actionId:z.string().uuid(),
 edition:z.enum(PRO_CHOOSABLE_EDITIONS),
 revision:z.number().int().min(0).max(1_000_000),
}).strict();
export type EditionChoice=z.infer<typeof editionChoiceSchema>;

/** Roles that may choose (SQL: settings.write). The SQL decides; this only drives the UI. */
export const EDITION_CHOOSER_ROLES=['owner','admin'] as const;
export type EditionSettingsView={
 ownerId:string;edition:ProEdition;active:boolean;implicit:boolean;revision:number;paywallEnabled:boolean;entitled:boolean;
 role:string|null;canChoose:boolean;modules:{module:string;inEdition:boolean;active:boolean}[];
};
const readSchema=z.object({
 ownerId:z.string().uuid(),edition:z.string(),active:z.boolean(),implicit:z.boolean(),revision:z.number().int().min(0),
 paywallEnabled:z.boolean(),entitled:z.boolean(),
 modules:z.array(z.object({module:z.string(),inEdition:z.boolean(),active:z.boolean()}).passthrough()),
}).passthrough();
/** Server: shape of GET /api/pro/editions from pro_workspace_edition_read + the person's role. */
export function editionSettingsView(raw:unknown,role:string|null):EditionSettingsView{
 const r=readSchema.parse(raw);
 const edition=isProEdition(r.edition)?r.edition:'servicios';
 return {ownerId:r.ownerId,edition,active:r.active,implicit:r.implicit,revision:r.revision,paywallEnabled:r.paywallEnabled,entitled:r.entitled,
  role,canChoose:r.active&&r.entitled&&(role==='owner'||role==='admin'),
  modules:r.modules.map(m=>({module:m.module,inEdition:m.inEdition,active:m.active}))};
}
export const editionViewSchema=z.object({
 ownerId:z.string().uuid(),edition:z.enum(PRO_EDITIONS),active:z.boolean(),implicit:z.boolean(),revision:z.number().int().min(0),
 paywallEnabled:z.boolean(),entitled:z.boolean(),role:z.string().nullable(),canChoose:z.boolean(),
 modules:z.array(z.object({module:z.string(),inEdition:z.boolean(),active:z.boolean()})),
});

/** ES (usted) / EN copy of each edition. */
export const EDITION_COPY:Record<ProEdition,{es:{name:string;text:string};en:{name:string;text:string}}>={
 servicios:{es:{name:'Servicios',text:'Proyectos, tareas, cronograma, horas, cotizaciones y facturación para oficios y empresas de servicios.'},en:{name:'Services',text:'Projects, tasks, schedule, timesheets, quotes and invoicing for trades and service companies.'}},
 autos:{es:{name:'Autos',text:'Inventario de vehículos, anuncios, pruebas de manejo y calculadora de financiamiento.'},en:{name:'Cars',text:'Vehicle inventory, listings, test drives and a financing calculator.'}},
 restaurantes:{es:{name:'Restaurantes',text:'Menú con precios, reservas de mesa y menú desde una foto para su restaurante o café.'},en:{name:'Restaurants',text:'Menu with prices, table reservations and menu from a photo for your restaurant or café.'}},
 comercio:{es:{name:'Comercio',text:'Inventario, lista de precios y alertas de existencias para tiendas y comercios.'},en:{name:'Retail',text:'Inventory, price list and stock alerts for shops and retailers.'}},
 bienes_raices:{es:{name:'Bienes raíces',text:'Inventario de propiedades, anuncios y visitas.'},en:{name:'Real estate',text:'Property inventory, listings and visits.'}},
};
export const MODULE_COPY:Record<string,{es:string;en:string}>={
 clients:{es:'Clientes',en:'Customers'},leads:{es:'Solicitudes',en:'Leads'},quotes:{es:'Cotizaciones',en:'Quotes'},agenda:{es:'Citas',en:'Appointments'},
 payments:{es:'Pagos',en:'Payments'},catalog:{es:'Productos y servicios',en:'Products and services'},site:{es:'Sitio web',en:'Website'},
 statistics:{es:'Estadísticas',en:'Statistics'},expenses:{es:'Gastos',en:'Expenses'},team:{es:'Equipo',en:'Team'},marketing:{es:'Marketing',en:'Marketing'},
 ai_plus:{es:'IA avanzada',en:'Advanced AI'},projects:{es:'Proyectos',en:'Projects'},tasks:{es:'Tareas',en:'Tasks'},timesheets:{es:'Horas',en:'Timesheets'},
 visit_prep:{es:'Preparar visitas',en:'Visit preparation'},invoice_drafts:{es:'Borradores de facturación',en:'Invoice drafts'},bids:{es:'Licitaciones',en:'Bids'},
 auto_inventory:{es:'Inventario de vehículos',en:'Vehicle inventory'},listings:{es:'Anuncios',en:'Listings'},test_drives:{es:'Pruebas de manejo',en:'Test drives'},
 auto_finance_calc:{es:'Calculadora de financiamiento',en:'Financing calculator'},listing_metrics:{es:'Métricas de anuncios',en:'Listing metrics'},
 menu:{es:'Menú',en:'Menu'},table_reservations:{es:'Reservas de mesa',en:'Table reservations'},menu_from_photo:{es:'Menú desde una foto',en:'Menu from a photo'},
 property_inventory:{es:'Inventario de propiedades',en:'Property inventory'},property_visits:{es:'Visitas a propiedades',en:'Property visits'},
 inventory:{es:'Inventario',en:'Inventory'},price_list:{es:'Lista de precios',en:'Price list'},stock_alerts:{es:'Alertas de existencias',en:'Stock alerts'},
};
/** Pro space address of the edition picker, optionally preselecting an edition («Menú» → Restaurantes). */
export function editionSettingsPath(locale:string,suggest?:ProChoosableEdition){
 return prefijoDeIdioma(locale)+'/dashboard/pro?'+new URLSearchParams({tab:'pro_editions',...(suggest?{edicion:suggest}:{})});
}
