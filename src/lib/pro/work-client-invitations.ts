import {z} from 'zod';
import {prefijoDeIdioma} from "@/lib/prefijo-de-idioma";

/**
 * Round 1 (2026-11-12): invite a customer account to a job (Houzz-style "add a client").
 * The owner copies a one-time link or code; nothing is e-mailed. The token is 32 random bytes
 * (base64url, 43 chars), shown once; only a domain-prefixed SHA-256 reaches the database.
 */
export const WORK_INVITE_BODY_MAX=4096;
export const WORK_INVITE_DEFAULT_DAYS=7;
const workId=z.string().trim().min(1).max(160);
export const workInviteTokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const workInviteOwnerQuerySchema=z.object({workId}).strict();
export const workInviteOwnerMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:z.string().uuid(),workId,invitationId:z.string().uuid(),expiresInDays:z.number().int().min(1).max(30)}).strict(),
 z.object({action:z.literal('revoke'),actionId:z.string().uuid(),workId,invitationId:z.string().uuid()}).strict(),
 z.object({action:z.literal('unlink'),actionId:z.string().uuid(),workId,requestId:z.string().uuid()}).strict(),
]);
export type WorkInviteOwnerMutation=z.infer<typeof workInviteOwnerMutationSchema>;
export const workInviteClientMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),token:workInviteTokenSchema}).strict(),
 z.object({action:z.literal('accept'),actionId:z.string().uuid(),token:workInviteTokenSchema}).strict(),
 z.object({action:z.literal('consent'),actionId:z.string().uuid(),publicationId:z.string().uuid()}).strict(),
]);
export type WorkInviteClientMutation=z.infer<typeof workInviteClientMutationSchema>;
export type WorkInvitationState='active'|'accepted'|'revoked'|'expired';
export type WorkInvitation={id:string;state:WorkInvitationState;createdAt:string;expiresAt:string;revokedAt:string|null;acceptedAt:string|null};
export type WorkClientLink={requestId:string;name:string;origin:'booking'|'project_invite';linkedAt:string};
export type WorkInvitationsDetail={workId:string;service:string;client:string;cancelled:boolean;linked:WorkClientLink|null;invitations:WorkInvitation[];canInvite:boolean;profileMissing:boolean};
export type WorkInvitePreview={state:'valid'|'unknown'|'expired'|'revoked'|'used'|'own'|'unavailable'|'linked';professionalName?:string;service?:string;expiresAt?:string;requestId?:string|null};
export type ProjectLinkConsent={publicationId:string;eligible:boolean;consented:boolean;consentedAt:string|null;jobReady:boolean;requestId:string|null;professionalName:string};
export type ClientProjectLink={requestId:string;service:string;professionalName:string;origin:'booking'|'project_invite';linkedAt:string;stage:string;cancelled:boolean};
/** Customer link for one invitation. The token travels in the fragment: never sent to a server log. */
export const workInviteLink=(origin:string,locale:'es'|'en',token:string)=>`${origin}${prefijoDeIdioma(locale)}/dashboard/unirse-proyecto#codigo=${token}`;
/** Where a linked customer opens the job (the customer side of the request). */
export const clientProjectPath=(locale:'es'|'en',requestId:string)=>`${prefijoDeIdioma(locale)}/dashboard/profesional?tab=appointments&citaSolicitud=${requestId}`;
