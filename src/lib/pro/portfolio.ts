import {z} from 'zod';

/** Row 68: wire contract of the portfolio publication (mirrors pro_portfolio_mutate). */
const id=z.string().uuid();
export const portfolioMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('publish'),id,workId:z.string().min(1).max(160),profession:z.string().trim().min(1).max(80),title:z.string().trim().min(1).max(120),
  description:z.string().max(600),recipient:z.string().max(120),photos:z.array(z.string().regex(/^https:\/\/\S{1,500}$/)).min(1).max(5),
  consentKind:z.enum(['client_written','client_verbal','no_identifiable']),consentNote:z.string().max(300),consentOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict(),
 z.object({action:z.literal('withdraw'),id}).strict(),
]);
export type PortfolioMutation=z.infer<typeof portfolioMutationSchema>;
export type PortfolioRead={professions:string[];hasProfile:boolean;
 works:{id:string;client:string;service:string;end:string;publicationId:string|null}[];
 publications:{id:string;workId:string;caseId:string;profession:string;title:string;consentKind:string;consentNote:string;consentOn:string;photoCount:number;status:'published'|'withdrawn';publishedAt:string;withdrawnAt:string|null}[]};
export type ProfileMetrics={hasProfile:boolean;from?:string;to?:string;
 profile?:{views:number;visitors:number;whatsapp:number;phone:number;email:number;favorites:number;shares:number};
 leads?:{requests:number;won:number;agreedCents:number};series?:{day:string;views:number;requests:number}[]};
/** Conversion rate in basis points of `part` over `whole`; null when there is nothing to divide. */
export const rateBps=(part:number,whole:number)=>whole>0?Math.round(part*10000/whole):null;
