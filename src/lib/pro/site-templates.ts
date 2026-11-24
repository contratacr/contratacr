import type {SiteContent,SiteSection,SiteTheme} from './site';

/**
 * Area E: website template gallery. A template is a starting arrangement of the sections the site already has (which are shown and in
 * what order) plus one of ContrataCR's own style presets. Applying one never touches the texts, photos or services the professional
 * already wrote; it only changes style, order and visibility. Pure and client-safe.
 */
export const siteTemplateFilters=['popular','portfolio','few_photos','few_content','premium','bold','minimal','many_services','classic','modern'] as const;
export type SiteTemplateFilter=typeof siteTemplateFilters[number];
export const siteTemplateFilterLabels:Record<SiteTemplateFilter,{es:string;en:string}>={
 popular:{es:'Más populares',en:'Most popular'},portfolio:{es:'Casos de éxito',en:'Success stories'},few_photos:{es:'Pocas fotos',en:'Few photos'},few_content:{es:'Poco contenido',en:'Little content'},
 premium:{es:'Alta gama',en:'High-end'},bold:{es:'Llamativo',en:'Bold'},minimal:{es:'Minimalista',en:'Minimalist'},many_services:{es:'Varios servicios',en:'Many services'},classic:{es:'Clásico',en:'Classic'},modern:{es:'Moderno',en:'Modern'},
};
export type SiteTemplate={id:string;name:{es:string;en:string};theme:SiteTheme;order:SiteSection['type'][];hidden:SiteSection['type'][];tags:SiteTemplateFilter[];suggested:boolean};
const all=['hero','services','portfolio','reviews','area','contact'] as const;
const make=(id:string,es:string,en:string,theme:SiteTheme,order:SiteSection['type'][],hidden:SiteSection['type'][],tags:SiteTemplateFilter[],suggested=false):SiteTemplate=>({id,name:{es,en},theme,order,hidden,tags,suggested});
export const siteTemplates:SiteTemplate[]=[
 make('cemento','Cemento','Concrete','contratacr',['hero','services','portfolio','reviews','area','contact'],[],['popular','classic','many_services'],true),
 make('vitrina','Vitrina','Showcase','contratacr',['hero','portfolio','reviews','services','contact','area'],[],['popular','portfolio','modern'],true),
 make('plano','Plano','Blueprint','cielo',['hero','services','area','contact','portfolio','reviews'],['portfolio'],['few_photos','minimal','modern'],true),
 make('esencial','Esencial','Essential','arena',['hero','services','contact','area','portfolio','reviews'],['portfolio','reviews'],['few_content','few_photos','minimal'],true),
 make('obra_negra','Obra negra','Raw build','noche',['hero','portfolio','services','reviews','contact','area'],[],['bold','portfolio','modern']),
 make('cantera','Cantera','Quarry','noche',['hero','portfolio','reviews','contact','services','area'],['area'],['premium','portfolio','bold']),
 make('terraza','Terraza','Terrace','arena',['hero','area','services','portfolio','reviews','contact'],[],['classic','many_services']),
 make('madera','Madera','Timber','arena',['hero','services','portfolio','reviews','contact','area'],[],['classic','popular']),
 make('cristal','Cristal','Glass','cielo',['hero','portfolio','services','reviews','contact','area'],['area'],['premium','minimal','modern']),
 make('ladrillo','Ladrillo','Brick','contratacr',['hero','services','reviews','portfolio','area','contact'],[],['many_services','classic']),
 make('azulejo','Azulejo','Tile','cielo',['hero','reviews','services','portfolio','contact','area'],[],['popular','few_photos']),
 make('hormigon','Hormigón','Poured concrete','noche',['hero','services','portfolio','contact','reviews','area'],[],['bold','many_services']),
 make('bambu','Bambú','Bamboo','arena',['hero','services','contact','reviews','area','portfolio'],['portfolio'],['few_photos','minimal','few_content']),
 make('marmol','Mármol','Marble','contratacr',['hero','portfolio','reviews','contact','services','area'],['area'],['premium','portfolio','classic']),
];
export function filterSiteTemplates(list:readonly SiteTemplate[],filters:readonly SiteTemplateFilter[]):SiteTemplate[]{
 return filters.length?list.filter(t=>filters.every(f=>t.tags.includes(f))):[...list];
}
/** Reorder and show/hide the sections of a site; every other field is kept exactly as written. */
export function applySiteTemplate(content:SiteContent,template:SiteTemplate):SiteContent{
 const rank=(type:SiteSection['type'])=>{const i=template.order.indexOf(type);return i<0?all.length:i;};
 const sections=[...content.sections].sort((a,b)=>rank(a.type)-rank(b.type)).map(s=>({...s,enabled:!template.hidden.includes(s.type)}) as SiteSection);
 return {...content,sections:sections.some(s=>s.enabled)?sections:content.sections};
}
