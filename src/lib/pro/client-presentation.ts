import {z} from 'zod';

/**
 * Row 33: presentation of the customer view of a job. Cover (headline, subtitle, accent), a video link, a weather widget
 * (a Costa Rican province) and individually hidden documents. Hiding is presentation only: it never revokes access.
 * Strict contracts shared by the routes, the UI and the specs.
 */
export const presentationAccents=['cyan','navy','green','amber','rose','slate'] as const;
export type PresentationAccent=typeof presentationAccents[number];
export const accentTokens:Record<PresentationAccent,{bg:string;ink:string;soft:string}>={
 cyan:{bg:'#0e7490',ink:'#ffffff',soft:'#ecfbfe'},navy:{bg:'#162543',ink:'#ffffff',soft:'#eef2f9'},green:{bg:'#15803d',ink:'#ffffff',soft:'#effbf3'},
 amber:{bg:'#b45309',ink:'#ffffff',soft:'#fff8eb'},rose:{bg:'#be185d',ink:'#ffffff',soft:'#fdf0f6'},slate:{bg:'#334155',ink:'#ffffff',soft:'#f1f5f9'},
};
export const weatherCities={
 san_jose:{es:'San José',en:'San José',lat:9.93,lon:-84.08},alajuela:{es:'Alajuela',en:'Alajuela',lat:10.02,lon:-84.21},cartago:{es:'Cartago',en:'Cartago',lat:9.86,lon:-83.92},
 heredia:{es:'Heredia',en:'Heredia',lat:10.0,lon:-84.12},guanacaste:{es:'Guanacaste (Liberia)',en:'Guanacaste (Liberia)',lat:10.63,lon:-85.44},
 puntarenas:{es:'Puntarenas',en:'Puntarenas',lat:9.98,lon:-84.83},limon:{es:'Limón',en:'Limón',lat:9.99,lon:-83.03},
} as const;
export type WeatherCity=keyof typeof weatherCities;
export const weatherCityKeys=Object.keys(weatherCities) as WeatherCity[];
export const PRESENTATION_VIDEO_PATTERN=/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S{1,250}$/;

const uuid=z.string().uuid(),workId=z.string().trim().min(1).max(160),city=z.enum(weatherCityKeys as [WeatherCity,...WeatherCity[]]);
const settingsShape={workId,headline:z.string().min(1).max(120).nullable(),subtitle:z.string().min(1).max(240).nullable(),accent:z.enum(presentationAccents),videoUrl:z.string().max(300).nullable(),
 showWeather:z.boolean(),weatherCity:city.nullable(),revision:z.number().int().nonnegative(),updatedAt:z.string().nullable()};
export const presentationSettingsSchema=z.object(settingsShape).strict();
const docKind=z.enum(['contract','quote','file']);
export const presentationOwnerSchema=z.object({...settingsShape,
 hidden:z.array(z.object({kind:docKind,itemId:z.string().min(1).max(80)}).strict()).max(500),
 documents:z.array(z.object({kind:docKind,id:z.string().min(1).max(80),title:z.string().max(300)}).strict()).max(1000),
 opens:z.object({count:z.number().int().nonnegative(),firstAt:z.string().nullable(),lastAt:z.string().nullable()}).strict(),linked:z.boolean()}).strict();
export const presentationClientSchema=z.union([z.object({visible:z.literal(false)}).strict(),z.object({visible:z.literal(true),headline:z.string().nullable(),subtitle:z.string().nullable(),accent:z.enum(presentationAccents),
 videoUrl:z.string().nullable(),showWeather:z.boolean(),weatherCity:city.nullable(),hidden:z.object({contract:z.array(z.string()),quote:z.array(z.string()),file:z.array(z.string())}).strict()}).strict()]);
export type PresentationClient=z.infer<typeof presentationClientSchema>;
export type PresentationOwner=z.infer<typeof presentationOwnerSchema>;
export const presentationInputSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),actionId:uuid,workId,revision:z.number().int().nonnegative().max(2147483646),headline:z.string().max(120).nullable(),subtitle:z.string().max(240).nullable(),
  accent:z.enum(presentationAccents),videoUrl:z.string().max(300).nullable(),showWeather:z.boolean(),weatherCity:city.nullable()}).strict(),
 z.object({action:z.literal('hide'),actionId:uuid,workId,kind:docKind,itemId:z.string().min(1).max(80),hidden:z.boolean()}).strict(),
]);
export const presentationResultSchema=z.union([z.object({action:z.literal('save'),settings:presentationSettingsSchema,replayed:z.boolean().optional()}).strict(),
 z.object({action:z.literal('hide'),kind:docKind,itemId:z.string(),hidden:z.boolean(),replayed:z.boolean().optional()}).strict()]);
export const weatherSchema=z.object({available:z.boolean(),city:city.optional(),tempC:z.number().nullable().optional(),code:z.number().int().nullable().optional(),
 days:z.array(z.object({date:z.string(),maxC:z.number().nullable(),minC:z.number().nullable(),rainPct:z.number().nullable()}).strict()).max(5).optional()}).strict();
export type Weather=z.infer<typeof weatherSchema>;
/** WMO weather code → short label (es/en). */
export function weatherLabel(code:number|null|undefined,en:boolean){
 if(code==null)return '';const c=code;
 if(c===0)return en?'Clear':'Despejado';if(c<=3)return en?'Partly cloudy':'Parcialmente nublado';if(c<=48)return en?'Fog':'Neblina';
 if(c<=57)return en?'Drizzle':'Llovizna';if(c<=67)return en?'Rain':'Lluvia';if(c<=77)return en?'Snow':'Nieve';if(c<=82)return en?'Showers':'Aguaceros';return en?'Thunderstorm':'Tormenta eléctrica';
}
