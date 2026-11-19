/**
 * Round 7A (2026-11-13): ONE set of quote status names for the owner, everywhere a quote is listed
 * (Quotes, the job's Quotes, the customer record, the lead). Same words as the job's Quotes list.
 */
export type ProQuoteStatus='draft'|'sent'|'changes_requested'|'accepted'|'declined'|'withdrawn'|'archived';
const labels:Record<ProQuoteStatus,[string,string]>={draft:['Borrador','Draft'],sent:['Compartida','Shared'],changes_requested:['Cambios solicitados','Changes requested'],accepted:['Aceptada','Accepted'],declined:['Rechazada','Declined'],withdrawn:['Retirada','Withdrawn'],archived:['Archivada','Archived']};
export const proQuoteStatus=(status:ProQuoteStatus,en:boolean)=>labels[status][en?1:0];
export type ProPublicationStatus='awaiting_claim'|'shared'|'changes_requested'|'accepted'|'declined'|'withdrawn'|'superseded';
/** Commercial status of a private quote from its latest shared version (null = never shared). */
export function proQuoteStatusOf(publication:ProPublicationStatus|null|undefined,archived=false):ProQuoteStatus{
 if(archived)return 'archived';
 if(!publication)return 'draft';
 if(publication==='awaiting_claim'||publication==='shared')return 'sent';
 if(publication==='superseded')return 'withdrawn';
 return publication;
}
