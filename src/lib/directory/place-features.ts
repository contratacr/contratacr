import {z} from 'zod';
import {CLAIM_DOCUMENT_KINDS} from './claim-schemas';
import {REVIEW_FLAG_REASONS} from './moderation-schemas';

// LOCAL PRO ONLY (place features round, owner approval 2026-11-17): zod mirrors of the browser → route inputs of
// reservations/waitlist, questions & answers, saved lists, events, brands and the «Pedir» link. The SQL modules
// (docs/pro/sql/directory-{reservations,questions,saved-lists,events,brands,place-tools}-local.sql) check everything
// again; these only give early ES/EN errors. Nothing here is commercial: no payments, deposits or ranking inputs.

const uuid=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const noLinks=(v:string)=>!/(https?:\/\/|www\.)/i.test(v);
const noHandles=(v:string)=>!/(https?:\/\/|www\.|@[a-z0-9_.-]+)/i.test(v);
const name=z.string().trim().min(2).max(80);
const phone=z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,22}$/);
const email=z.string().trim().toLowerCase().max(254).regex(/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/);
const contact={name,phone:phone.optional(),email:email.optional()};
const needsContact=(v:{phone?:string;email?:string})=>!!(v.phone||v.email);

// ---------------------------------------------------------------- reservations
export const reservationRequestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('booking'),actionId:uuid,reservationId:uuid,day,time:z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/),partySize:z.number().int().min(1).max(30),
  ...contact,note:z.string().trim().max(300).refine(noLinks).optional()}).strict(),
 z.object({kind:z.literal('waitlist'),actionId:uuid,reservationId:uuid,partySize:z.number().int().min(1).max(30),...contact}).strict(),
]).refine(needsContact,{path:['phone'],message:'contact_required'});
export type ReservationRequest=z.infer<typeof reservationRequestSchema>;
export const reservationSlotSchema=z.object({weekday:z.number().int().min(0).max(6),time:z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/),capacity:z.number().int().min(1).max(500)}).strict();
export const reservationSettingsSchema=z.object({actionId:uuid,placeId:uuid,revision:z.number().int().min(0),enabled:z.boolean(),waitlistEnabled:z.boolean(),
 partyMax:z.number().int().min(1).max(30),horizonDays:z.number().int().min(1).max(90),minNoticeMinutes:z.number().int().min(0).max(2880),
 slots:z.array(reservationSlotSchema).max(336)}).strict();
export const RESERVATION_ACTIONS=['confirm','decline','cancel','seated','no_show','notify_ready','left'] as const;
export const reservationDecisionSchema=z.object({actionId:uuid,reservationId:uuid,revision:z.number().int().min(1),action:z.enum(RESERVATION_ACTIONS)}).strict();
export const proReservationPostSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('settings'),input:reservationSettingsSchema}).strict(),
 z.object({op:z.literal('decide'),input:reservationDecisionSchema}).strict(),
]);
// Customer self-service (pending fixes round, 2026-11-17): private link /reserva/<token> (43 base64url characters,
// derived by the server; only its SHA-256 is stored) and the cancel request.
export const RESERVATION_TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
export const reservationCancelSchema=z.object({actionId:uuid,revision:z.number().int().min(1)}).strict();
export type CustomerReservation={reference:string;kind:'booking'|'waitlist';status:'pending'|'confirmed'|'declined'|'cancelled'|'seated'|'no_show'|'waiting'|'notified'|'left';
 revision:number;day:string;time:string|null;partySize:number;name:string;placeName:string;placeSlug:string;position:number|null;canCancel:boolean;createdAt:string;
 timeline:{action:string;status:string;at:string}[]};
export type ReservationConfig={partyMax:number;horizonDays:number;minNoticeMinutes:number;today:string;lastDay:string;weekdays:number[];waitlistOpen:boolean};
export type ReservationSettings={enabled:boolean;waitlistEnabled:boolean;partyMax:number;horizonDays:number;minNoticeMinutes:number;slots:z.infer<typeof reservationSlotSchema>[];revision:number};
export type OwnerReservation={id:string;kind:'booking'|'waitlist';reference:string;day:string;time:string|null;partySize:number;name:string;phone:string|null;email:string|null;note:string|null;
 status:'pending'|'confirmed'|'declined'|'cancelled'|'seated'|'no_show'|'waiting'|'notified'|'left';revision:number;createdAt:string};
export type OwnerReservationDay={placeId:string;slug:string;name:string;allowed:boolean;day:string;today:string;settings:ReservationSettings;pendingUpcoming:number;items:OwnerReservation[]};
export const RESERVATION_STATUS_LABELS:Record<OwnerReservation['status'],[string,string]>={
 pending:['Por confirmar','Awaiting confirmation'],confirmed:['Confirmada','Confirmed'],declined:['Rechazada','Declined'],cancelled:['Cancelada','Canceled'],
 seated:['Atendida','Seated'],no_show:['No llegó','No-show'],waiting:['En espera','Waiting'],notified:['Avisado: mesa lista','Notified: table ready'],left:['Se retiró','Left'],
};

// ---------------------------------------------------------------- questions & answers
export const qaPostSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('question'),actionId:uuid,questionId:uuid,body:z.string().trim().min(5).max(300).refine(noHandles)}).strict(),
 z.object({type:z.literal('answer'),actionId:uuid,answerId:uuid,questionId:uuid,body:z.string().trim().min(1).max(500).refine(noHandles)}).strict(),
 z.object({type:z.literal('flag'),flagId:uuid,targetKind:z.enum(['question','answer']),targetId:uuid,reason:z.enum(REVIEW_FLAG_REASONS),message:z.string().trim().max(500).optional()}).strict()
  .refine(v=>v.reason!=='other'||(v.message?.length??0)>=5,{path:['message'],message:'message_required'}),
]);
export type PublicAnswer={id:string;name:string;body:string;isOwner:boolean;createdAt:string};
export type PublicQuestion={id:string;name:string;body:string;createdAt:string;answers:PublicAnswer[]};
export type PublicQuestions={total:number;items:PublicQuestion[]};

// ---------------------------------------------------------------- saved lists
export const savedListMutationSchema=z.object({actionId:uuid,action:z.enum(['create','rename','delete','share_on','share_off','add','remove']),listId:uuid,
 revision:z.number().int().min(0).optional(),name:z.string().trim().min(1).max(80).refine(noLinks).optional(),slug:z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/).optional()}).strict()
 .refine(v=>(v.action==='create')===(v.revision===undefined)&&(['create','rename'].includes(v.action))===(v.name!==undefined)&&(['add','remove'].includes(v.action))===(v.slug!==undefined),{message:'invalid'});
export type SavedListPlace={slug:string;name:string;vertical:string;area:string};
export type SavedList={listId:string;name:string;revision:number;shareToken:string|null;createdAt:string;count:number;hasPlace:boolean|null;places:SavedListPlace[]};
export const SHARE_TOKEN_RE=/^[a-f0-9]{32}$/;

// ---------------------------------------------------------------- events
const eventFields=z.object({title:z.string().trim().min(3).max(120).refine(noLinks),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}).optional(),
 priceText:z.string().trim().min(1).max(60).refine(noLinks).optional(),description:z.string().trim().min(1).max(1000).refine(noLinks).optional()}).strict();
export const eventMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),actionId:uuid,eventId:uuid,placeId:uuid,event:eventFields}).strict(),
 z.object({action:z.literal('update'),actionId:uuid,eventId:uuid,revision:z.number().int().min(1),event:eventFields}).strict(),
 z.object({action:z.literal('cancel'),actionId:uuid,eventId:uuid,revision:z.number().int().min(1)}).strict(),
]);
export type PlaceEvent={id:string;title:string;startsAt:string;endsAt:string|null;priceText:string|null;description:string|null};
export type OwnerEvent=PlaceEvent&{status:'published'|'cancelled';moderationStatus:'published'|'hidden';moderationReason:string|null;revision:number;updatedAt:string};
export type PublicEventsPage={from:string;total:number;provinces:string[];items:(PlaceEvent&{place:{slug:string;name:string;vertical:string;province:string|null;area:string}})[]};

// ---------------------------------------------------------------- «Pedir»
export const ORDER_SECTIONS=['restaurant','cafe_bar','grocery','convenience','pharmacy','hardware','vet_pets'] as const;
export const orderLinkSchema=z.object({actionId:uuid,placeId:uuid,revision:z.number().int().min(0),channel:z.enum(['whatsapp','web','phone']).nullable(),value:z.string().trim().max(500).nullable()}).strict()
 .refine(v=>(v.channel===null)===(v.value===null||v.value===''),{path:['value'],message:'value_required'});
export type OrderLink={channel:'whatsapp'|'web'|'phone';value:string};

// ---------------------------------------------------------------- brands
export type BrandBranch={slug:string;name:string;vertical:string;province:string|null;area:string;lat:number|null;lng:number|null;rating:number|null;ratingCount:number};
export type PublicBrand={slug:string;name:string;website:string|null;descriptionEs:string|null;descriptionEn:string|null;claimed:boolean;claimPending:boolean;branchCount:number;
 rating:{average:number|null;count:number};verticals:string[];provinces:string[];branches:BrandBranch[]};
export type PlaceBrand={slug:string;name:string;website:string|null;descriptionEs:string|null;descriptionEn:string|null;branches:number};
export const brandClaimSchema=z.object({actionId:uuid,claimId:uuid,documents:z.array(z.object({kind:z.enum(CLAIM_DOCUMENT_KINDS),path:z.string().max(160)}).strict()).min(1).max(5),
 note:z.string().trim().max(1000).optional()}).strict();
export const brandInfoSchema=z.object({actionId:uuid,brandId:uuid,revision:z.number().int().min(1),website:z.string().trim().regex(/^https:\/\/[^\s"<>]{3,}$/).max(500).nullable(),
 descriptionEs:z.string().trim().max(500).refine(noLinks).nullable(),descriptionEn:z.string().trim().max(500).refine(noLinks).nullable()}).strict();

// ---------------------------------------------------------------- staff decisions (admin queue)
const reason=z.string().trim().min(3).max(1000);
export const featureStaffDecisionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('qa'),actionId:uuid,targetKind:z.enum(['question','answer']),targetId:uuid,decision:z.enum(['hide','restore','dismiss']),reason,expectedStatus:z.enum(['published','hidden'])}).strict(),
 z.object({kind:z.literal('event'),actionId:uuid,eventId:uuid,decision:z.enum(['approve','hide','restore']),reason:z.string().trim().max(1000).optional(),expectedRevision:z.number().int().min(1)}).strict()
  .refine(v=>v.decision==='approve'||(v.reason?.length??0)>=3,{path:['reason'],message:'reason_required'}),
 z.object({kind:z.literal('brand_merge'),actionId:uuid,brandId:uuid,intoBrandId:uuid,reason,expectedRevision:z.number().int().min(1)}).strict(),
 z.object({kind:z.literal('brand_split'),actionId:uuid,brandId:uuid,newBrandId:uuid,name:z.string().trim().min(2).max(120),placeSlugs:z.array(z.string().max(80)).min(1).max(500),reason,expectedRevision:z.number().int().min(1)}).strict(),
 z.object({kind:z.literal('brand_hide'),actionId:uuid,brandId:uuid,reason,expectedRevision:z.number().int().min(1)}).strict(),
 z.object({kind:z.literal('brand_claim'),actionId:uuid,claimId:uuid,decision:z.enum(['approve','reject']),reason:z.string().trim().max(1000).optional()}).strict()
  .refine(v=>v.decision==='approve'||(v.reason?.length??0)>=3,{path:['reason'],message:'reason_required'}),
]);
export const FEATURE_STAFF_RPC={qa:'dir_admin_qa_moderate',event:'dir_admin_event_moderate',brand_merge:'dir_admin_brand_merge',brand_split:'dir_admin_brand_split',brand_hide:'dir_admin_brand_hide',brand_claim:'dir_admin_brand_claim_decide'} as const;
export const FEATURE_STAFF_QUEUES=['questions','events','brands','brand_claims'] as const;

/** ES/EN text of the stable reasons the feature routes answer with. */
export const FEATURE_REASON_TEXT:Record<string,[string,string]>={
 login:['Inicie sesión para continuar.','Please sign in to continue.'],
 invalid:['Revise los datos.','Please check the details.'],
 contact_required:['Indique un teléfono o un correo.','Please give a phone number or an e-mail.'],
 reservation_full:['Ese horario ya está lleno. Elija otro.','That time is full. Please choose another one.'],
 reservation_slot:['Ese horario no está disponible.','That time is not available.'],
 reservation_party:['El grupo supera el máximo que acepta el negocio.','The party is larger than the business accepts.'],
 reservation_cap:['Alcanzó el límite de reservas. Intente más tarde.','You reached the reservation limit. Please try later.'],
 reservations_off:['Este negocio no recibe reservas en línea en este momento.','This business is not taking online reservations right now.'],
 waitlist_off:['La lista de espera no está abierta.','The waitlist is not open.'],
 waitlist_exists:['Ya está en la lista de espera de hoy.','You are already on today’s waitlist.'],
 reservation_cancel_closed:['Esta reserva ya no se puede cancelar en línea. Llame al negocio.','This reservation can no longer be canceled online. Please call the business.'],
 qa_own_place:['Como responsable del negocio, usted responde las preguntas; no las hace.','As the business manager you answer questions; you do not ask them.'],
 qa_own_question:['No puede responder su propia pregunta.','You cannot answer your own question.'],
 qa_cap:['Alcanzó el límite de hoy. Intente mañana.','You reached today’s limit. Please try tomorrow.'],
 flag_own_review:['No puede reportar su propio texto.','You cannot report your own text.'],
 flag_cap:['Alcanzó el límite de reportes de hoy.','You reached today’s report limit.'],
 list_item_exists:['Ese lugar ya está en la lista.','That place is already in the list.'],
 list_cap:['Alcanzó el límite de listas o cambios. Intente más tarde.','You reached the limit of lists or changes. Please try later.'],
 reload:['Los datos cambiaron en otra pestaña. Recargue la página.','The data changed in another tab. Please reload the page.'],
 tool_not_manager:['Solo el responsable del negocio puede hacer esto.','Only the business manager can do this.'],
 tool_role:['Su rol en la empresa no permite este cambio.','Your role in the company does not allow this change.'],
 module_unavailable:['Este módulo no está activo en su edición de Pro.','This module is not active in your Pro edition.'],
 order_value:['Revise el enlace o el número del botón "Pedir".','Please check the link or number for the "Order" button.'],
 order_section_off:['Esta sección no tiene botón "Pedir".','This section has no "Order" button.'],
 event_fields:['Revise el título, las fechas y el texto (sin enlaces).','Please check the title, dates and text (no links).'],
 event_date:['La fecha debe estar entre hoy y dentro de un año.','The date must be between today and one year from now.'],
 event_cap:['Alcanzó el límite de eventos. Intente mañana.','You reached the event limit. Please try tomorrow.'],
 event_cancelled:['Un evento cancelado ya no se puede editar.','A canceled event cannot be edited.'],
 event_section_off:['Esta sección no publica eventos.','This section does not publish events.'],
 claim_evidence:['Suba al menos un documento.','Please upload at least one document.'],
 claim_pending:['Ya hay un reclamo en revisión para esta marca.','A claim for this brand is already under review.'],
 place_already_claimed:['Esta marca ya tiene responsable.','This brand already has a manager.'],
 claim_cap:['Alcanzó el límite de reclamos de hoy.','You reached today’s claim limit.'],
 not_found:['No está disponible.','Not available.'],
 limit:['Demasiados intentos. Espere un momento.','Too many attempts. Please wait a moment.'],
 unavailable:['No disponible en este momento. Intente de nuevo.','Not available right now. Please try again.'],
};
export const featureReasonText=(reason:unknown,en:boolean)=>(FEATURE_REASON_TEXT[String(reason)]??FEATURE_REASON_TEXT.unavailable)![en?1:0];
