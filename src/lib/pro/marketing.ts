import {z} from 'zod';

/**
 * Round 6D (row 71): email campaigns and automations of a professional to their OWN contacts. Only contacts with
 * explicit consent are an audience (enforced again in SQL); test sends go only to the owner; in mock mode every
 * message is «simulado» and the metrics below are SIMULATED (never real opens or clicks).
 */
const id=z.string().uuid(),revision=z.number().int().min(0).max(2147483646);
const body=z.string().trim().min(1).max(8000),subject=z.string().trim().min(1).max(160),name=z.string().trim().min(1).max(120);
export const marketingSegments=['all','clients','leads'] as const;
/** System segments plus a custom email list (area E): 'list:<uuid>'. */
export const marketingSegmentSchema=z.union([z.enum(marketingSegments),z.string().regex(/^list:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)]);
export const consentEvidence=['verbal','written','form','other'] as const;
export const automationKinds=['quote_followup','review_request'] as const;
export const marketingMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('contact_consent'),actionId:id,email:z.string().trim().toLowerCase().email().max(254),name:z.string().trim().max(160),clientId:z.string().min(1).max(160).nullable(),consentText:z.string().trim().min(20).max(1000),evidence:z.enum(consentEvidence),note:z.string().max(300)}).strict(),
 z.object({action:z.literal('contact_revoke'),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('template_save'),actionId:id,id,revision,name,subject,body}).strict(),
 z.object({action:z.literal('template_archive'),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('campaign_save'),actionId:id,id,revision,name,subject,body,segment:marketingSegmentSchema}).strict(),
 z.object({action:z.literal('campaign_schedule'),actionId:id,id,revision,scheduledAt:z.string().datetime({offset:true})}).strict(),
 z.object({action:z.enum(['campaign_unschedule','campaign_cancel','campaign_send_now']),actionId:id,id,revision}).strict(),
 z.object({action:z.literal('test_send'),actionId:id,id}).strict(),
 z.object({action:z.literal('automation_save'),actionId:id,kind:z.enum(automationKinds),revision,enabled:z.boolean(),delayDays:z.number().int().min(0).max(60),subject,body}).strict(),
 z.object({action:z.literal('draft_decide'),actionId:id,id,decision:z.enum(['approve','reject'])}).strict(),
 z.object({action:z.enum(['run_due','scan_automations'])}).strict(),
]);
export type MarketingMutation=z.infer<typeof marketingMutationSchema>;
export type MarketingContact={id:string;email:string;name:string;clientId:string|null;leadId:string|null;consent:'granted'|'pending'|'revoked'|'none';consentSource:string|null;consentText:string|null;consentAt:string|null;revokedAt:string|null;confirmationRequestedAt:string|null;confirmedAt:string|null;suppressed:boolean;revision:number;createdAt:string};
export type MarketingCampaign={id:string;name:string;subject:string;body:string;segment:typeof marketingSegments[number]|`list:${string}`;status:'draft'|'scheduled'|'sent'|'cancelled';scheduledAt:string|null;sentAt:string|null;recipients:number|null;mode:string|null;revision:number;audience:number};
export type MarketingAutomation={kind:typeof automationKinds[number];enabled:boolean;delayDays:number;subject:string;body:string;revision:number};
export type MarketingDraft={id:string;kind:typeof automationKinds[number];refKind:string;refId:string;refLabel:string;contactId:string;to:string;subject:string;body:string;status:'pending_approval'|'approved'|'rejected';createdAt:string;decidedAt:string|null};
export type MarketingMessage={id:string;kind:'test'|'campaign'|'automation';campaignId:string|null;draftId:string|null;to:string;subject:string;body:string;mode:string;delivery:string;createdAt:string};
export type MarketingTemplate={id:string;name:string;subject:string;body:string;archived:boolean;revision:number};
export type MarketingOverview={ownerEmail:string;business:string;contacts:MarketingContact[];counts:{granted:number;revoked:number;suppressed:number;withoutConsent:number};candidates:{clientId:string;name:string;email:string}[];templates:MarketingTemplate[];campaigns:MarketingCampaign[];automations:MarketingAutomation[];drafts:MarketingDraft[];outbox:MarketingMessage[];mode:string};
/**
 * SIMULATED engagement for a campaign sent in mock mode: fixed ratios applied to the real recipient count, only
 * so the screen can be designed and tested. Always shown with the «Simulado» label; never stored as a metric.
 */
export function simulatedMetrics(recipients:number){
 const delivered=recipients,opened=Math.round(recipients*0.42),clicked=Math.round(recipients*0.08);
 return {simulated:true as const,delivered,opened,clicked,unsubscribed:0};
}
/** Placeholders the owner may use in subject/body. */
export const marketingPlaceholders=['{{nombre}}','{{negocio}}','{{enlace}}'] as const;

export const marketingListsSchema=z.object({
 system:z.object({all:z.number().int(),clients:z.number().int(),leads:z.number().int()}),
 lists:z.array(z.object({id:z.string().uuid(),name:z.string(),contactIds:z.array(z.string().uuid()),audience:z.number().int()})),
 contacts:z.array(z.object({id:z.string().uuid(),name:z.string(),email:z.string()})),
});
export type MarketingLists=z.infer<typeof marketingListsSchema>;
export const marketingListMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:z.string().uuid(),name:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.literal('rename'),id:z.string().uuid(),name:z.string().trim().min(1).max(80)}).strict(),
 z.object({action:z.literal('delete'),id:z.string().uuid()}).strict(),
 z.object({action:z.literal('set_members'),id:z.string().uuid(),contactIds:z.array(z.string().uuid()).max(2000)}).strict(),
]);
