import {z} from 'zod';

/**
 * Round 6D (row 70): tracking links with UTM parameters for the professional's own ads and posts. The link points
 * to the professional's website (/sitio/<slug>) or public profile; `cc` carries the campaign code that the request
 * form sends with the lead. Reports are built in SQL from real leads, jobs and the costs the owner entered.
 */
const id=z.string().uuid(),revision=z.number().int().min(0).max(2147483646);
const utmValue=z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{0,80}$/);
export const adChannels=['meta','google','instagram','tiktok','whatsapp','email','print','radio','other'] as const;
export type AdChannel=typeof adChannels[number];
export const adChannelLabels:Record<AdChannel,{es:string;en:string}>={meta:{es:'Facebook (Meta)',en:'Facebook (Meta)'},google:{es:'Google Ads',en:'Google Ads'},instagram:{es:'Instagram',en:'Instagram'},tiktok:{es:'TikTok',en:'TikTok'},whatsapp:{es:'WhatsApp',en:'WhatsApp'},email:{es:'Correo',en:'Email'},print:{es:'Impreso / volante',en:'Print / flyer'},radio:{es:'Radio',en:'Radio'},other:{es:'Otro',en:'Other'}};
export const adMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('campaign_save'),actionId:id,id,revision,name:z.string().trim().min(1).max(120),channel:z.enum(adChannels),landing:z.enum(['site','profile']),utmSource:utmValue,utmMedium:utmValue,utmCampaign:utmValue,utmContent:utmValue}).strict(),
 z.object({action:z.literal('campaign_archive'),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('cost_add'),actionId:id,id,campaignId:id,spentOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),amountCents:z.number().int().min(1).max(100000000000),note:z.string().trim().max(300)}).strict(),
 z.object({action:z.literal('cost_void'),actionId:id,id,costId:id,note:z.string().trim().max(300)}).strict(),
 z.object({action:z.literal('attribute'),actionId:id,id,leadId:id,campaignId:id}).strict(),
]);
export type AdCampaign={id:string;name:string;channel:AdChannel;landing:'site'|'profile';code:string;utm:{source:string;medium:string;campaign:string;content?:string};archived:boolean;revision:number;createdAt:string};
export type AdReportRow={campaignId:string|null;name:string|null;channel:AdChannel|null;archived:boolean;visits:number;leads:number;converted:number;agreedCents:number;paidCents:number;costCents:number;costPerLeadCents:number|null;roiBps:number|null};
export type AdOverview={campaigns:AdCampaign[];costs:{id:string;campaignId:string;kind:'cost'|'void';voidOf:string|null;spentOn:string;amountCents:number;note:string;createdAt:string;voided:boolean}[];unattributed:{leadId:string;title:string;createdAt:string}[];site:{slug:string;published:boolean}|null;profileSlug:string|null;report:{from:string;to:string;rows:AdReportRow[];totals:Omit<AdReportRow,'campaignId'|'name'|'channel'|'archived'>}};
/** The tracking URL for one campaign (UTM keys in the standard order + our campaign code). */
export function trackingUrl(origin:string,campaign:Pick<AdCampaign,'landing'|'code'|'utm'>,site:{slug:string}|null,profileSlug:string|null,en=false){
 const path=campaign.landing==='site'&&site?`${en?'/en':''}/sitio/${site.slug}`:profileSlug?`${en?'/en':''}/profesionales/${profileSlug}`:null;
 if(!path)return null;
 const params=new URLSearchParams({utm_source:campaign.utm.source,utm_medium:campaign.utm.medium,utm_campaign:campaign.utm.campaign});
 if(campaign.utm.content)params.set('utm_content',campaign.utm.content);params.set('cc',campaign.code);
 return origin.replace(/\/$/,'')+path+'?'+params.toString();
}
/** UTM values read from a landing URL (only the five standard keys, trimmed). */
export function readUtm(search:URLSearchParams){
 const out:Record<string,string>={};for(const key of ['source','medium','campaign','content','term']){const value=search.get('utm_'+key);if(value)out[key]=value.slice(0,80);}
 const code=search.get('cc');return {utm:out,code:code&&/^[a-z0-9]{6,16}$/.test(code)?code:null};
}
