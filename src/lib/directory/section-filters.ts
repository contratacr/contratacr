// LOCAL PRO ONLY (2026-11-27, owner «aplica tus recomendaciones», research ~/dl/research/filtros-negocios.md): the extra
// filters of each place section (migration 546, dir_search_candidates) and the rules that decide which chips show.
// Only filters that have data: no express/domicilio, SINPE, terraza, parqueo, wifi, pet friendly, accesibilidad,
// hotel stars or fuel price (ARESEP regulates it). Values are written by scripts/directory/osm-filter-attributes.mjs.
export const EXTRA_FILTER_KEYS=['cuisine','soda','reservations','brand','atm','public'] as const;
export type ExtraFilterKey=typeof EXTRA_FILTER_KEYS[number];

/** Section → extra filter keys it accepts (same lists as the `allowed` arrays of dir_search_candidates, 546). */
export const SECTION_EXTRA_FILTERS:Partial<Record<string,readonly ExtraFilterKey[]>>={
 restaurantes:['cuisine','soda','reservations'],
 bancos:['brand','atm'],
 gasolineras:['brand'],
 supermercados:['brand'],
 salud:['public'],
 educacion:['public'],
};
export const sectionExtraFilters=(section:string):readonly ExtraFilterKey[]=>SECTION_EXTRA_FILTERS[section]??[];

/** Labels of the cuisine slugs stored in attributes.cuisines (CUISINE_MAP of the script). Unknown slugs are not offered. */
export const CUISINE_LABELS:Record<string,{es:string;en:string}>={
 pizza:{es:'Pizza',en:'Pizza'},pollo:{es:'Pollo',en:'Chicken'},'comida-tipica':{es:'Comida típica',en:'Costa Rican food'},
 hamburguesas:{es:'Hamburguesas',en:'Burgers'},mariscos:{es:'Mariscos',en:'Seafood'},mexicana:{es:'Mexicana',en:'Mexican'},
 china:{es:'China',en:'Chinese'},italiana:{es:'Italiana',en:'Italian'},sandwiches:{es:'Sándwiches',en:'Sandwiches'},
 japonesa:{es:'Japonesa y sushi',en:'Japanese and sushi'},carnes:{es:'Carnes y parrilla',en:'Steak and grill'},asiatica:{es:'Asiática',en:'Asian'},
 postres:{es:'Postres',en:'Desserts'},internacional:{es:'Internacional',en:'International'},americana:{es:'Americana',en:'American'},
 caribena:{es:'Caribeña',en:'Caribbean'},'comida-rapida':{es:'Comida rápida',en:'Fast food'},india:{es:'India',en:'Indian'},
 mediterranea:{es:'Mediterránea',en:'Mediterranean'},peruana:{es:'Peruana',en:'Peruvian'},desayunos:{es:'Desayunos',en:'Breakfast'},
 argentina:{es:'Argentina',en:'Argentinian'},francesa:{es:'Francesa',en:'French'},espanola:{es:'Española',en:'Spanish'},
 arabe:{es:'Árabe',en:'Middle Eastern'},colombiana:{es:'Colombiana',en:'Colombian'},venezolana:{es:'Venezolana',en:'Venezuelan'},
 vegetariana:{es:'Vegetariana',en:'Vegetarian'},
};

/** dir_section_filter_stats (546): places, places with hours and the value lists of one section. */
export type SectionFilterStats={total:number;withHours:number;cuisines:{value:string;count:number}[];
 brands:{value:string;label:string;count:number}[];soda:number;atm:number;public:number;reservations:number};

/** Values offered in a list need at least this many places (fewer would mostly lead to empty or one-result pages). */
export const MIN_VALUE_PLACES=5;
/** «Abierto ahora» only where hours are known for enough of the section: ≥ 30 % of its places and ≥ 20 places. */
export const OPEN_NOW_MIN_SHARE=0.3;
export const OPEN_NOW_MIN_PLACES=20;
export const openNowUseful=(s:SectionFilterStats|null)=>!!s&&s.total>0&&s.withHours>=OPEN_NOW_MIN_PLACES&&s.withHours/s.total>=OPEN_NOW_MIN_SHARE;
