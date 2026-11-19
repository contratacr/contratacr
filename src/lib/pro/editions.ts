/**
 * Multivertical F4 (LOCAL, 2026-11-16): Pro editions and modules. Browser-safe (no server imports).
 * Mirror of `pro_edition_default_modules` / `pro_has_module` in docs/pro/sql/pro-editions-local.sql;
 * `scripts/pro/verify-pro-editions-db.mjs` compares this table and `hasModule` with the SQL.
 * The server decision is always the SQL one (`pro_module_require`); this file only drives the UI
 * (which hub entries to show) and must never be used as the authorization check.
 * Editions never affect the public directory or its ordering.
 */
export const PRO_EDITIONS=['servicios','autos','restaurantes','bienes_raices','comercio'] as const;
export const PRO_TIERS=['basico','pro','plus'] as const;
export const PRO_EDITION_SOURCES=['launch_free','admin','billing'] as const;
export const PRO_MODULE_SOURCES=['owner','admin','billing'] as const;
export type ProEdition=typeof PRO_EDITIONS[number];
export type ProTier=typeof PRO_TIERS[number];
export type ProEditionSource=typeof PRO_EDITION_SOURCES[number];
export type ProModuleSource=typeof PRO_MODULE_SOURCES[number];

const COMMON=[
 ['clients','basico'],['leads','basico'],['quotes','basico'],['agenda','basico'],['payments','basico'],
 ['catalog','basico'],['site','basico'],['statistics','pro'],['expenses','pro'],['team','pro'],
 ['marketing','plus'],['ai_plus','plus'],
] as const;
const OWN={
 servicios:[['projects','basico'],['tasks','basico'],['timesheets','pro'],['visit_prep','pro'],['invoice_drafts','pro'],['bids','plus']],
 autos:[['auto_inventory','basico'],['listings','basico'],['test_drives','basico'],['auto_finance_calc','pro'],['listing_metrics','plus']],
 restaurantes:[['menu','basico'],['table_reservations','pro'],['menu_from_photo','plus']],
 bienes_raices:[['property_inventory','basico'],['listings','basico'],['property_visits','basico'],['listing_metrics','plus']],
 comercio:[['inventory','basico'],['price_list','basico'],['stock_alerts','pro']],
} as const;
export type ProModule=typeof COMMON[number][0]|typeof OWN[ProEdition][number][0];
export type ProEditionModule={module:ProModule;minTier:ProTier};

/** Modules of each edition with their minimum tier, in display order (immutable; same as SQL). */
export const PRO_EDITION_DEFAULT_MODULES:Readonly<Record<ProEdition,readonly ProEditionModule[]>>=Object.freeze(Object.fromEntries(
 PRO_EDITIONS.map(edition=>[edition,Object.freeze([...COMMON,...OWN[edition]].map(([module,minTier])=>Object.freeze({module,minTier}) as ProEditionModule))]),
) as Record<ProEdition,readonly ProEditionModule[]>);
export const PRO_MODULES:readonly ProModule[]=Object.freeze([...new Set(PRO_EDITIONS.flatMap(e=>PRO_EDITION_DEFAULT_MODULES[e].map(m=>m.module)))].sort());

/** Capability a member's role needs to WRITE in a vertical module (team-roles patch, dir-wiring-F4.md). */
export const PRO_MODULE_WRITE_CAPABILITY:Partial<Record<ProModule,'inventory.write'|'listing.publish'|'price.write'|'menu.write'>>={
 auto_inventory:'inventory.write',property_inventory:'inventory.write',inventory:'inventory.write',
 listings:'listing.publish',price_list:'price.write',menu:'menu.write',
};

export const isProEdition=(v:unknown):v is ProEdition=>typeof v==='string'&&(PRO_EDITIONS as readonly string[]).includes(v);
export const isProTier=(v:unknown):v is ProTier=>typeof v==='string'&&(PRO_TIERS as readonly string[]).includes(v);
export const isProModule=(v:unknown):v is ProModule=>typeof v==='string'&&(PRO_MODULES as readonly string[]).includes(v);
export const proTierRank=(t:ProTier)=>PRO_TIERS.indexOf(t)+1;

export type ProModuleOverride={enabled:boolean;source:ProModuleSource};
/** Workspace state as returned by `pro_workspace_edition_read` (no row = servicios/basico, active). */
export type ProEditionState={
 entitled:boolean;
 edition:ProEdition;tier:ProTier;active:boolean;
 paywallEnabled:boolean;
 overrides?:Partial<Record<string,ProModuleOverride>>;
};
export const PRO_IMPLICIT_EDITION:Pick<ProEditionState,'edition'|'tier'|'active'>={edition:'servicios',tier:'basico',active:true};

/** Same rules and order as SQL `pro_has_module`. */
export function hasModule(state:ProEditionState,module:string):boolean{
 if(!state.entitled||!state.active||!isProModule(module))return false;
 const ov=state.overrides?.[module];
 if(ov&&!ov.enabled)return false;
 const granted=!!ov&&ov.enabled&&(ov.source==='admin'||ov.source==='billing');
 const entry=PRO_EDITION_DEFAULT_MODULES[state.edition]?.find(m=>m.module===module);
 if(!entry)return granted;
 if(!state.paywallEnabled)return true;
 return proTierRank(state.tier)>=proTierRank(entry.minTier)||granted;
}
/** Active modules of the workspace, edition modules first (display order), then add-ons. */
export function activeModules(state:ProEditionState):ProModule[]{
 const own=PRO_EDITION_DEFAULT_MODULES[state.edition].map(m=>m.module);
 return [...own,...PRO_MODULES.filter(m=>!own.includes(m))].filter(m=>hasModule(state,m));
}
