import {z} from 'zod';

/**
 * Round 6D (row 69): website builder for professionals. Pure data shared by the editor, the API (validation
 * before SQL) and the public page (/sitio/<slug>). Sections reuse what the professional already has on
 * ContrataCR (services, profile photos, published reviews, service area) plus a request form that creates a
 * lead in the lead center. Theme presets follow ContrataCR's own palette.
 */
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'control');
const enabled=z.boolean();
export const siteHeroSchema=z.object({type:z.literal('hero'),enabled,heading:text(1,80),subheading:text(0,200),cta:text(1,40)}).strict();
export const siteServicesSchema=z.object({type:z.literal('services'),enabled,heading:text(1,80),items:z.array(z.object({name:text(1,120),description:text(0,400)}).strict()).max(12)}).strict();
export const sitePortfolioSchema=z.object({type:z.literal('portfolio'),enabled,heading:text(1,80),photos:z.array(z.string().url().startsWith('https://').max(1000)).max(12)}).strict();
export const siteReviewsSchema=z.object({type:z.literal('reviews'),enabled,heading:text(1,80),max:z.number().int().min(1).max(12)}).strict();
export const siteAreaSchema=z.object({type:z.literal('area'),enabled,heading:text(1,80),text:text(0,400)}).strict();
export const siteContactSchema=z.object({type:z.literal('contact'),enabled,heading:text(1,80),text:text(0,300)}).strict();
export const siteSectionSchema=z.discriminatedUnion('type',[siteHeroSchema,siteServicesSchema,sitePortfolioSchema,siteReviewsSchema,siteAreaSchema,siteContactSchema]);
export type SiteSection=z.infer<typeof siteSectionSchema>;
export const siteSectionTypes=['hero','services','portfolio','reviews','area','contact'] as const;
export const siteContentSchema=z.object({
 title:text(1,70),description:text(1,170),language:z.enum(['es','en']),
 sections:z.array(siteSectionSchema).min(1).max(12).refine(list=>new Set(list.map(s=>s.type)).size===list.length,'duplicate section'),
}).strict();
export type SiteContent=z.infer<typeof siteContentSchema>;
export const siteThemes=['contratacr','cielo','noche','arena'] as const;
export type SiteTheme=typeof siteThemes[number];
export const siteSlugSchema=z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/).refine(slug=>!['baja','preview','admin','api','sitio'].includes(slug));
/** Theme presets in ContrataCR's palette (navy #162543, cyan #008bb5). */
export const siteThemeTokens:Record<SiteTheme,{label:{es:string;en:string};bg:string;surface:string;ink:string;muted:string;accent:string;accentInk:string;heroBg:string;heroInk:string;border:string}>={
 contratacr:{label:{es:'ContrataCR (azul y celeste)',en:'ContrataCR (navy and cyan)'},bg:'#ffffff',surface:'#f3f8fb',ink:'#162543',muted:'#52627a',accent:'#007aa0',accentInk:'#ffffff',heroBg:'#162543',heroInk:'#ffffff',border:'#d7e1ea'},
 cielo:{label:{es:'Cielo (claro)',en:'Sky (light)'},bg:'#f7fbfd',surface:'#ffffff',ink:'#162543',muted:'#4b5b72',accent:'#006f92',accentInk:'#ffffff',heroBg:'#eaf7fb',heroInk:'#162543',border:'#cfe3ee'},
 noche:{label:{es:'Noche (oscuro)',en:'Night (dark)'},bg:'#0f1a30',surface:'#162543',ink:'#f2f6fa',muted:'#b8c4d4',accent:'#5fd0f0',accentInk:'#0f1a30',heroBg:'#0b1426',heroInk:'#ffffff',border:'#2a3b5c'},
 arena:{label:{es:'Arena (cálido)',en:'Sand (warm)'},bg:'#fbf8f3',surface:'#ffffff',ink:'#2b2418',muted:'#6a5d48',accent:'#00708f',accentInk:'#ffffff',heroBg:'#f1e9dc',heroInk:'#2b2418',border:'#e6dccb'},
};
export type SiteProfile={businessName:string|null;profileSlug:string|null;bio:string;services:{name:string;description:string}[];photos:string[];area:{provincia:string|null;canton:string|null};rating:{average:number|null;count:number|null}};
export function slugify(value:string){return value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/,'')||'mi-empresa';}
/** First draft built only from the professional's own ContrataCR data. */
export function defaultSiteContent(profile:SiteProfile,en:boolean):SiteContent{
 const name=(profile.businessName||(en?'My company':'Mi empresa')).slice(0,60),zone=[profile.area.canton,profile.area.provincia].filter(Boolean).join(', ');
 return siteContentSchema.parse({
  title:name.slice(0,70),description:(profile.bio.trim()||(en?`${name}: quotes and projects${zone?' in '+zone:''}.`:`${name}: cotizaciones y proyectos${zone?' en '+zone:''}.`)).slice(0,170),language:en?'en':'es',
  sections:[
   {type:'hero',enabled:true,heading:name.slice(0,80),subheading:(profile.bio.trim()||(en?'Quality work with clear quotes.':'Trabajo de calidad con cotizaciones claras.')).slice(0,200),cta:en?'Request a quote':'Pedir cotización'},
   {type:'services',enabled:profile.services.length>0,heading:en?'Services':'Servicios',items:profile.services.slice(0,12).map(s=>({name:s.name.slice(0,120),description:s.description.slice(0,400)}))},
   {type:'portfolio',enabled:profile.photos.length>0,heading:en?'Recent work':'Trabajos realizados',photos:profile.photos.slice(0,12)},
   {type:'reviews',enabled:(profile.rating.count??0)>0,heading:en?'What customers say':'Lo que dicen los clientes',max:6},
   {type:'area',enabled:!!zone,heading:en?'Service area':'Zona de servicio',text:zone?(en?`We work in ${zone} and nearby areas.`:`Trabajamos en ${zone} y alrededores.`):''},
   {type:'contact',enabled:true,heading:en?'Tell us about your project':'Cuéntenos su proyecto',text:en?'We reply with a quote or a visit proposal.':'Le respondemos con una cotización o una propuesta de visita.'},
  ],
 });
}
/** Exact text shown next to the OPTIONAL marketing checkbox; it is stored with the consent (Ley 8968). */
export function siteConsentText(business:string,en:boolean){
 return en?`I agree to receive news and offers from ${business} by email. I can unsubscribe at any time with the link in each email.`.slice(0,1000)
  :`Acepto recibir novedades y ofertas de ${business} por correo. Puedo darme de baja cuando quiera con el enlace de cada correo.`.slice(0,1000);
}
export const siteSubmitSchema=z.object({
 submissionId:z.string().uuid(),name:text(2,120),email:z.string().trim().toLowerCase().email().max(254),phone:z.string().trim().max(30).regex(/^[0-9 +()-]*$/),
 message:text(5,2000),service:text(0,120),area:text(0,200),marketingConsent:z.boolean(),language:z.enum(['es','en']),
 code:z.string().regex(/^[a-z0-9]{6,16}$/).nullable(),utm:z.object({source:z.string().max(80).optional(),medium:z.string().max(80).optional(),campaign:z.string().max(80).optional(),content:z.string().max(80).optional(),term:z.string().max(80).optional()}).strict(),
 /** Honeypot: humans never fill it. */
 website:z.string().max(0),
}).strict();
export type PublicSite={slug:string;theme:SiteTheme;version:number|null;publishedAt:string|null;content:SiteContent;business:string|null;profileSlug:string|null;rating:{average:number|null;count:number|null};reviews:{rating:number;comment:string;name:string;date:string}[];campaigns:string[]};
